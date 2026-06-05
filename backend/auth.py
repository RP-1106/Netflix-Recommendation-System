from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
import uuid, json
from datetime import datetime
from database import get_db, User, Profile, WatchHistory, ContinueWatching, WatchAgain, WatchInvite, WatchRoom

router = APIRouter()
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# ── Default profiles for new users ───────────────────────────────────────────
DEFAULT_PROFILES = [
    {"name": "You",     "color": "#e50914", "icon": "🎬"},
    {"name": "Partner", "color": "#0080ff", "icon": "🎭"},
    {"name": "Kids",    "color": "#ffb800", "icon": "⭐"},
    {"name": "Guest",   "color": "#00b894", "icon": "🎪"},
]

# ── WebSocket room manager ────────────────────────────────────────────────────
class RoomManager:
    def __init__(self):
        self.rooms: dict[str, list[dict]] = {}

    async def connect(self, room_id: str, ws: WebSocket, name: str):
        await ws.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append({"ws": ws, "name": name})

    def disconnect(self, room_id: str, ws: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id] = [p for p in self.rooms[room_id] if p["ws"] != ws]
            if not self.rooms[room_id]:
                del self.rooms[room_id]

    async def broadcast_all(self, room_id: str, message: dict):
        if room_id in self.rooms:
            for participant in self.rooms[room_id]:
                try:
                    await participant["ws"].send_json(message)
                except Exception:
                    pass

    def room_size(self, room_id: str) -> int:
        return len(self.rooms.get(room_id, []))

manager = RoomManager()

# ── Schemas ───────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateProfileRequest(BaseModel):
    user_email: str
    name: str
    color: str = "#e50914"
    icon: str = "🎬"

class SaveHistoryRequest(BaseModel):
    user_email: str
    profile_id: str
    history: list

class InviteRequest(BaseModel):
    from_email: str
    from_name: str
    to_email: str
    movie_title: str
    movie_id: str

class InviteResponseRequest(BaseModel):
    invite_id: str
    action: str

# ── Auth endpoints ────────────────────────────────────────────────────────────
@router.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email.lower(),
        name=req.name,
        password_hash=pwd_context.hash(req.password),
    )
    db.add(user)

    db.commit()
    return {"status": "ok", "email": user.email, "name": user.name, "profiles": []}

@router.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    profiles = db.query(Profile).filter(Profile.user_email == req.email.lower()).all()
    return {
        "status": "ok",
        "email": user.email,
        "name": user.name,
        "profiles": [{"id": p.id, "name": p.name, "color": p.color, "icon": p.icon} for p in profiles],
    }

@router.get("/auth/check/{email}")
def check_user(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower()).first()
    return {"exists": user is not None, "name": user.name if user else None}

# ── Profile endpoints ─────────────────────────────────────────────────────────
@router.post("/profiles/create")
def create_profile(req: CreateProfileRequest, db: Session = Depends(get_db)):
    existing = db.query(Profile).filter(Profile.user_email == req.user_email.lower()).count()
    if existing >= 6:
        raise HTTPException(status_code=400, detail="Maximum 6 profiles allowed")
    profile = Profile(
        id=str(uuid.uuid4()),
        user_email=req.user_email.lower(),
        name=req.name,
        color=req.color,
        icon=req.icon,
    )
    db.add(profile)
    db.commit()
    return {"id": profile.id, "name": profile.name, "color": profile.color, "icon": profile.icon}

@router.get("/profiles/{email}")
def get_profiles(email: str, db: Session = Depends(get_db)):
    profiles = db.query(Profile).filter(Profile.user_email == email.lower()).all()
    return {"profiles": [{"id": p.id, "name": p.name, "color": p.color, "icon": p.icon} for p in profiles]}

# ── Watch history endpoints ───────────────────────────────────────────────────
@router.post("/history/save")
def save_history(req: SaveHistoryRequest, db: Session = Depends(get_db)):
    record = db.query(WatchHistory).filter(
        WatchHistory.user_email == req.user_email.lower(),
        WatchHistory.profile_id == req.profile_id,
    ).first()
    if record:
        record.history    = json.dumps(req.history)
        record.updated_at = datetime.utcnow()
    else:
        record = WatchHistory(
            id=str(uuid.uuid4()),
            user_email=req.user_email.lower(),
            profile_id=req.profile_id,
            history=json.dumps(req.history),
        )
        db.add(record)
    db.commit()
    return {"status": "ok"}

@router.get("/history/{email}/{profile_id}")
def get_history(email: str, profile_id: str, db: Session = Depends(get_db)):
    record = db.query(WatchHistory).filter(
        WatchHistory.user_email == email.lower(),
        WatchHistory.profile_id == profile_id,
    ).first()
    history = json.loads(record.history) if record else []
    return {"history": history}

# ── Invite endpoints ──────────────────────────────────────────────────────────
@router.post("/invite")
def send_invite(req: InviteRequest, db: Session = Depends(get_db)):
    recipient = db.query(User).filter(User.email == req.to_email.lower()).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="No account found with that email")
    existing = db.query(WatchInvite).filter(
        WatchInvite.from_email == req.from_email.lower(),
        WatchInvite.to_email   == req.to_email.lower(),
        WatchInvite.status     == "pending"
    ).first()
    if existing:
        return {"status": "ok", "invite_id": existing.id, "room_id": existing.room_id}
    room_id = str(uuid.uuid4())[:8]
    invite  = WatchInvite(
        id=str(uuid.uuid4()),
        from_email=req.from_email.lower(),
        from_name=req.from_name,
        to_email=req.to_email.lower(),
        movie_title=req.movie_title,
        movie_id=req.movie_id,
        room_id=room_id,
    )
    room = WatchRoom(
        room_id=room_id,
        movie_id=req.movie_id,
        movie_title=req.movie_title,
        created_by=req.from_email.lower(),
    )
    db.add(invite)
    db.add(room)
    db.commit()
    return {"status": "ok", "invite_id": invite.id, "room_id": room_id}

@router.get("/invite/pending/{email}")
def get_pending_invites(email: str, db: Session = Depends(get_db)):
    invites = db.query(WatchInvite).filter(
        WatchInvite.to_email == email.lower(),
        WatchInvite.status   == "pending"
    ).all()
    return {"invites": [{
        "id": i.id, "from_name": i.from_name, "from_email": i.from_email,
        "movie_title": i.movie_title, "movie_id": i.movie_id, "room_id": i.room_id,
    } for i in invites]}

@router.post("/invite/respond")
def respond_invite(req: InviteResponseRequest, db: Session = Depends(get_db)):
    invite = db.query(WatchInvite).filter(WatchInvite.id == req.invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.status = req.action
    db.commit()
    return {
        "status":      "ok",
        "room_id":     invite.room_id     if req.action == "accepted" else None,
        "movie_id":    invite.movie_id    if req.action == "accepted" else None,
        "movie_title": invite.movie_title if req.action == "accepted" else None,
    }

@router.get("/room/{room_id}")
def get_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(WatchRoom).filter(WatchRoom.room_id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "room_id": room.room_id, "movie_id": room.movie_id,
        "movie_title": room.movie_title, "created_by": room.created_by,
        "participants": manager.room_size(room_id),
    }


# ── Continue Watching & Watch Again endpoints ─────────────────────────────────
class SaveListRequest(BaseModel):
    user_email: str
    profile_id: str
    items: list

@router.post("/continue-watching/save")
def save_continue_watching(req: SaveListRequest, db: Session = Depends(get_db)):
    record = db.query(ContinueWatching).filter(
        ContinueWatching.user_email == req.user_email.lower(),
        ContinueWatching.profile_id == req.profile_id,
    ).first()
    if record:
        record.items      = json.dumps(req.items)
        record.updated_at = datetime.utcnow()
    else:
        record = ContinueWatching(
            id=str(uuid.uuid4()),
            user_email=req.user_email.lower(),
            profile_id=req.profile_id,
            items=json.dumps(req.items),
        )
        db.add(record)
    db.commit()
    return {"status": "ok"}

@router.get("/continue-watching/{email}/{profile_id}")
def get_continue_watching(email: str, profile_id: str, db: Session = Depends(get_db)):
    record = db.query(ContinueWatching).filter(
        ContinueWatching.user_email == email.lower(),
        ContinueWatching.profile_id == profile_id,
    ).first()
    return {"items": json.loads(record.items) if record else []}

@router.post("/watch-again/save")
def save_watch_again(req: SaveListRequest, db: Session = Depends(get_db)):
    record = db.query(WatchAgain).filter(
        WatchAgain.user_email == req.user_email.lower(),
        WatchAgain.profile_id == req.profile_id,
    ).first()
    if record:
        record.items      = json.dumps(req.items)
        record.updated_at = datetime.utcnow()
    else:
        record = WatchAgain(
            id=str(uuid.uuid4()),
            user_email=req.user_email.lower(),
            profile_id=req.profile_id,
            items=json.dumps(req.items),
        )
        db.add(record)
    db.commit()
    return {"status": "ok"}

@router.get("/watch-again/{email}/{profile_id}")
def get_watch_again(email: str, profile_id: str, db: Session = Depends(get_db)):
    record = db.query(WatchAgain).filter(
        WatchAgain.user_email == email.lower(),
        WatchAgain.profile_id == profile_id,
    ).first()
    return {"items": json.loads(record.items) if record else []}

@router.websocket("/ws/room/{room_id}")
async def websocket_room(room_id: str, ws: WebSocket, name: str = "Anonymous"):
    await manager.connect(room_id, ws, name)
    await manager.broadcast_all(room_id, {
        "type": "system", "text": f"{name} joined the room",
        "timestamp": datetime.utcnow().isoformat(),
    })
    try:
        while True:
            data = await ws.receive_text()
            msg  = json.loads(data)
            msg["sender"]    = name
            msg["timestamp"] = datetime.utcnow().isoformat()
            await manager.broadcast_all(room_id, msg)
    except WebSocketDisconnect:
        manager.disconnect(room_id, ws)
        await manager.broadcast_all(room_id, {
            "type": "system", "text": f"{name} left the room",
            "timestamp": datetime.utcnow().isoformat(),
        })

# ── Profile delete and rename ─────────────────────────────────────────────────
class DeleteProfileRequest(BaseModel):
    user_email: str
    profile_id: str

class RenameProfileRequest(BaseModel):
    user_email: str
    profile_id: str
    new_name: str

@router.post("/profiles/delete")
def delete_profile(req: DeleteProfileRequest, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(
        Profile.id == req.profile_id,
        Profile.user_email == req.user_email.lower()
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Delete associated watch history
    db.query(WatchHistory).filter(
        WatchHistory.profile_id == req.profile_id
    ).delete()
    db.delete(profile)
    db.commit()
    return {"status": "ok"}

@router.post("/profiles/rename")
def rename_profile(req: RenameProfileRequest, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(
        Profile.id == req.profile_id,
        Profile.user_email == req.user_email.lower()
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Check duplicate name
    existing = db.query(Profile).filter(
        Profile.user_email == req.user_email.lower(),
        Profile.name == req.new_name,
        Profile.id != req.profile_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A profile with this name already exists")
    profile.name = req.new_name
    db.commit()
    return {"status": "ok", "name": profile.name}