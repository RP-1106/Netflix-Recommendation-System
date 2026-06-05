"""
main.py
FastAPI application entrypoint.
"""

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import redis as redis_lib
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from auth import router as auth_router

import recommender
from semantic_search import semantic_search
from schemas import (
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    MovieCard,
    RecommendRequest,
    RecommendResponse,
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR      = os.getenv("DATA_DIR", "../data/output")
MODEL_PATH    = os.getenv("MODEL_PATH", "../data/bert4rec_v3.onnx")
SASREC_PATH   = os.getenv("SASREC_MODEL_PATH", "../data/sasrec_v3.onnx")
REDIS_URL     = os.getenv("REDIS_URL", "redis://localhost:6379")
KAFKA_BOOT    = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
COLD_START_K  = int(os.getenv("COLD_START_K", "10"))
CACHE_TTL_SEC = 0  # 0 = no caching — fresh inference on every request

_redis: redis_lib.Redis | None = None

def get_redis() -> redis_lib.Redis | None:
    return _redis

_kafka_producer = None

def _init_kafka():
    global _kafka_producer
    try:
        from kafka import KafkaProducer
        _kafka_producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOT,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=3000,
            retries=3,
        )
        logger.info("Kafka producer connected ✓")
    except Exception as e:
        logger.warning(f"Kafka not available ({e}). Feedback will be logged only.")
        _kafka_producer = None

def _publish_feedback(event: dict):
    if _kafka_producer is not None:
        try:
            _kafka_producer.send("user_feedback", event)
        except Exception as e:
            logger.warning(f"Kafka publish failed: {e}")
    logger.info(f"FEEDBACK  {json.dumps(event)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _redis
    logger.info("=== Starting up ===")
    init_db()
    recommender.load_data(DATA_DIR, MODEL_PATH, SASREC_PATH)
    logger.info(f"Items in catalogue: {recommender.item_count()}")
    try:
        _redis = redis_lib.from_url(REDIS_URL, decode_responses=True)
        _redis.ping()
        logger.info("Redis connected ✓")
    except Exception as e:
        logger.warning(f"Redis not available ({e}). Caching disabled.")
        _redis = None
    _init_kafka()
    logger.info("=== Ready to serve requests ===")
    yield
    logger.info("Shutting down...")
    if _kafka_producer:
        _kafka_producer.flush()
        _kafka_producer.close()

app = FastAPI(
    title="Netflix Recommendation System",
    version="1.0.0",
    description="BERT4Rec / SASRec recommendation API with A/B testing",
    lifespan=lifespan,
)
app.include_router(auth_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
def health():
    redis_ok = False
    if _redis:
        try:
            _redis.ping()
            redis_ok = True
        except Exception:
            pass
    return HealthResponse(
        status="ok",
        model_loaded=recommender.is_loaded(),
        redis_connected=redis_ok,
        items_loaded=recommender.item_count(),
    )

@app.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    t_start = time.perf_counter()

    # Cache disabled (CACHE_TTL_SEC = 0) — always run fresh inference
    # This ensures recommendations update every time watch history changes

    try:
        cards, model_variant, cold_start = recommender.get_recommendations(
            session_id=req.session_id,
            watch_history=req.watch_history,
            top_k=req.top_k,
            redis_client=_redis,
        )
    except Exception as e:
        logger.error(f"Inference error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Inference failed. See server logs.")

    # Filter hard negatives
    if _redis and cards:
        try:
            never_key = f"never:{req.session_id}"
            never_set = _redis.smembers(never_key)
            if never_set:
                never_ids = {m.decode() if isinstance(m, bytes) else m for m in never_set}
                before = len(cards)
                cards = [c for c in cards if c.item_id not in never_ids]
                if len(cards) < before:
                    logger.info(f"  Hard negative filter: removed {before - len(cards)} disliked movies")
        except Exception as e:
            logger.warning(f"Hard negative filter error: {e}")

    latency_ms = 1000 * (time.perf_counter() - t_start)
    logger.info(
        f"Inference  variant={model_variant}  cold_start={cold_start}  "
        f"n_results={len(cards)}  latency={latency_ms:.1f}ms"
    )

    return RecommendResponse(
        recommendations=cards,
        model_variant=model_variant,
        cache_hit=False,
        cold_start=cold_start,
    )

@app.post("/feedback", response_model=FeedbackResponse)
def feedback(req: FeedbackRequest):
    event = {
        "session_id":    req.session_id,
        "movie_id":      req.movie_id,
        "signal":        req.signal,
        "model_variant": req.model_variant,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }
    _publish_feedback(event)
    return FeedbackResponse(status="ok")

@app.get("/genres", response_model=dict)
def genres():
    all_genres: set[str] = set()
    from recommender import _idx_to_card
    for card in _idx_to_card.values():
        all_genres.update(card.genres)
    return {"genres": sorted(all_genres)}

@app.get("/search")
async def search(q: str, top_k: int = 10):
    if not q or len(q.strip()) < 2:
        return {"results": [], "query": q}
    results = semantic_search(q.strip(), top_k=min(top_k, 20))
    cards = []
    for r in results:
        card = recommender._idx_to_card.get(r["item_idx"])
        if card:
            cards.append({
                "item_id":        card.item_id,
                "item_idx":       card.item_idx,
                "title":          card.title,
                "release_year":   card.release_year,
                "genres":         card.genres,
                "log_popularity": card.log_popularity,
                "similarity_score": round(r["score"], 3),
            })
    return {"results": cards, "query": q}