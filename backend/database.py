from sqlalchemy import create_engine, Column, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATA_DIR     = os.getenv("DATA_DIR", "../data/output")
DB_PATH      = os.path.join(DATA_DIR, "streamora.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine       = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


class User(Base):
    __tablename__ = "users"
    email         = Column(String, primary_key=True, index=True)
    name          = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"
    id         = Column(String, primary_key=True)
    user_email = Column(String, nullable=False, index=True)
    name       = Column(String, nullable=False)
    color      = Column(String, default="#e50914")
    icon       = Column(String, default="🎬")
    created_at = Column(DateTime, default=datetime.utcnow)


class WatchHistory(Base):
    __tablename__ = "watch_history"
    id         = Column(String, primary_key=True)
    user_email = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False, index=True)
    history    = Column(Text, default="[]")
    updated_at = Column(DateTime, default=datetime.utcnow)


class ContinueWatching(Base):
    __tablename__ = "continue_watching"
    id         = Column(String, primary_key=True)
    user_email = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False, index=True)
    items      = Column(Text, default="[]")  # JSON array of {movie, progress}
    updated_at = Column(DateTime, default=datetime.utcnow)


class WatchAgain(Base):
    __tablename__ = "watch_again"
    id         = Column(String, primary_key=True)
    user_email = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False, index=True)
    items      = Column(Text, default="[]")  # JSON array of movies
    updated_at = Column(DateTime, default=datetime.utcnow)


class WatchInvite(Base):
    __tablename__ = "watch_invites"
    id          = Column(String, primary_key=True)
    from_email  = Column(String, nullable=False)
    from_name   = Column(String, nullable=False)
    to_email    = Column(String, nullable=False)
    movie_title = Column(String, nullable=False)
    movie_id    = Column(String, nullable=False)
    room_id     = Column(String, nullable=False)
    status      = Column(String, default="pending")
    created_at  = Column(DateTime, default=datetime.utcnow)


class WatchRoom(Base):
    __tablename__ = "watch_rooms"
    room_id     = Column(String, primary_key=True)
    movie_id    = Column(String, nullable=False)
    movie_title = Column(String, nullable=False)
    created_by  = Column(String, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()