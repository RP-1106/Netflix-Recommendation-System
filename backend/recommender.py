"""
recommender.py
All recommendation logic in one place:
  - Load and index item/user feature CSVs at startup
  - Build canonical title → item_id map (handles duplicate IDs)
  - Build item sequences from watch history titles
  - Run BERT4Rec ONNX inference
  - Cold-start popularity fallback
  - A/B model variant routing
"""

import os
import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import onnxruntime as ort
from semantic_search import load_search_index, semantic_search
from sklearn.preprocessing import StandardScaler

from schemas import MovieCard

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# MODULE-LEVEL STATE  (populated once at startup, read-only afterwards)
# ─────────────────────────────────────────────────────────────────────────────

_ort_session: ort.InferenceSession | None = None          # BERT4Rec
_ort_session_sasrec: ort.InferenceSession | None = None   # SASRec

# item_id (string hash) → item_idx (0-based integer the model uses)
_item_id_to_idx: dict[str, int] = {}

# item_idx → MovieCard  (pre-built for fast lookup at response time)
_idx_to_card: dict[int, MovieCard] = {}

# lowercase title → item_id  (canonical: highest click_count wins for dupes)
_title_to_item_id: dict[str, str] = {}

# ordered list of item_ids for popularity fallback (highest log_popularity first)
_popularity_fallback_ids: list[str] = []

# user feature matrix (shape: [n_users, 38])
_user_feature_matrix: np.ndarray | None = None

# user_id (string) → user_idx (integer row in _user_feature_matrix)
_user_id_to_idx: dict[str, int] = {}

# Genre index for fallback matching: genre_set → list of (item_idx, log_popularity)
_genre_index: dict[frozenset, list[tuple[int, float]]] = {}
# item_idx → frozenset of genres (for fast scoring)
_item_genres: dict[int, frozenset] = {}
# item_idx → release_year (for year proximity scoring)
_item_years: dict[int, int] = {}

MIN_SEQ_LEN: int = 5    # sequences shorter than this get cold-start fallback
MAX_SEQ_LEN: int = 50   # model's max_sentence_length — longer sequences are truncated
PAD_TOKEN:   int = 0
MASK_TOKEN:  int = 1

# Token offsets differ between models:
#   BERT4Rec: PAD=0, MASK=1, items start at token=2  → offset = 2
#   SASRec:   PAD=0,         items start at token=1  → offset = 1
TOKEN_OFFSET_BERT4REC: int = 2
TOKEN_OFFSET_SASREC:   int = 1


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP — call this once from main.py lifespan
# ─────────────────────────────────────────────────────────────────────────────

def load_data(data_dir: str, model_path: str, sasrec_model_path: str | None = None) -> None:
    global _ort_session, _ort_session_sasrec, _item_id_to_idx, _idx_to_card, _title_to_item_id
    global _popularity_fallback_ids, _user_feature_matrix
    global _user_id_to_idx, _genre_index, _item_genres, _item_years

    data_dir = Path(data_dir)

    # ── 1. Load item features ────────────────────────────────────────────────
    logger.info("Loading item features...")
    itf = pd.read_csv(data_dir / "item_features_final.csv")
    n_items = len(itf)
    logger.info(f"  {n_items} items loaded")

    _item_id_to_idx = dict(zip(itf["item_id"], itf["item_idx"]))

    canonical = (
        itf.sort_values("click_count", ascending=False)
        .drop_duplicates(subset="title", keep="first")
        .set_index("title")["item_id"]
        .to_dict()
    )
    _title_to_item_id = {t.lower().strip(): iid for t, iid in canonical.items()}

    genre_cols = [c for c in itf.columns if c.startswith("genre_")]
    for _, row in itf.iterrows():
        genres = [
            col.replace("genre_", "").replace("_", " ").title()
            for col in genre_cols
            if row[col] == 1
        ]
        release_year = int(row["release_year"]) if pd.notna(row["release_year"]) else None
        _idx_to_card[int(row["item_idx"])] = MovieCard(
            item_id=row["item_id"],
            item_idx=int(row["item_idx"]),
            title=row["title"],
            release_year=release_year,
            genres=genres,
            log_popularity=float(row["log_popularity"]),
        )

    _popularity_fallback_ids = (
        itf.sort_values("log_popularity", ascending=False)["item_id"]
        .tolist()
    )

    # ── Build genre index ────────────────────────────────────────────────────
    genre_cols = [c for c in itf.columns if c.startswith("genre_")]
    for _, row in itf.iterrows():
        idx = int(row["item_idx"])
        genres = frozenset(
            col.replace("genre_", "").replace("_", " ").lower()
            for col in genre_cols if row[col] == 1
        )
        _item_genres[idx] = genres
        _item_years[idx] = int(row["release_year"]) if pd.notna(row["release_year"]) else 2000
    logger.info(f"  Genre index built for {len(_item_genres)} items")

    # ── Build semantic search index ──────────────────────────────────────────
    try:
        load_search_index(itf)
    except Exception as e:
        logger.warning(f"Semantic search unavailable: {e}")

    # ── 2. Load user features ────────────────────────────────────────────────
    logger.info("Loading user features...")
    uf = pd.read_csv(data_dir / "user_features_final.csv")
    _user_id_to_idx = dict(zip(uf["user_id"], uf["user_idx"]))
    _user_feature_matrix = _build_user_feature_matrix(uf)
    logger.info(f"  User feature matrix shape: {_user_feature_matrix.shape}")

    # ── 3. Load ONNX model(s) ────────────────────────────────────────────────
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

    logger.info(f"Loading BERT4Rec ONNX model from {model_path}...")
    _ort_session = ort.InferenceSession(
        model_path,
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )
    logger.info("  BERT4Rec model loaded ✓")
    logger.info(f"  Input names: {[i.name for i in _ort_session.get_inputs()]}")

    if sasrec_model_path and Path(sasrec_model_path).exists():
        logger.info(f"Loading SASRec ONNX model from {sasrec_model_path}...")
        _ort_session_sasrec = ort.InferenceSession(
            sasrec_model_path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        logger.info("  SASRec model loaded ✓")
    else:
        logger.warning(
            "SASRec model not found — both A/B variants will use BERT4Rec until "
            "sasrec_v3.onnx is placed in the data directory."
        )


def is_loaded() -> bool:
    return _ort_session is not None and len(_idx_to_card) > 0


def item_count() -> int:
    return len(_idx_to_card)


# ─────────────────────────────────────────────────────────────────────────────
# A/B ROUTING
# ─────────────────────────────────────────────────────────────────────────────

def get_model_variant(session_id: str, redis_client=None) -> str:
    if redis_client:
        try:
            b4_wins   = int(redis_client.get("bandit:bert4rec:wins")   or 0)
            b4_losses = int(redis_client.get("bandit:bert4rec:losses") or 0)
            sr_wins   = int(redis_client.get("bandit:sasrec:wins")     or 0)
            sr_losses = int(redis_client.get("bandit:sasrec:losses")   or 0)

            total_feedback = b4_wins + b4_losses + sr_wins + sr_losses
            if total_feedback >= 10:
                b4_sample = float(np.random.beta(b4_wins + 1, b4_losses + 1))
                variant = "bert4rec" 
                return variant
        except Exception:
            pass

    digest = hashlib.md5(session_id.encode()).hexdigest()
    return "bert4rec"


def build_sequence(watch_history: list, model_variant: str = "bert4rec") -> list[int]:
    token_offset = (
        TOKEN_OFFSET_SASREC if model_variant == "sasrec" else TOKEN_OFFSET_BERT4REC
    )
    tokens: list[int] = []
    matched_exact = 0
    matched_genre = 0
    unknown = 0

    for item in watch_history:
        title = item.title if hasattr(item, 'title') else item
        genres = item.genres if hasattr(item, 'genres') else []
        release_year = item.release_year if hasattr(item, 'release_year') else None

        # ── 1. Exact title match ──────────────────────────────────────────────
        key = title.lower().strip()
        item_id = _title_to_item_id.get(key)
        if item_id is not None:
            item_idx = _item_id_to_idx.get(item_id)
            if item_idx is not None:
                tokens.append(item_idx + token_offset)
                matched_exact += 1
                continue

        # ── 2. Genre fallback ─────────────────────────────────────────────────
        if genres and _item_genres:
            query_genres = frozenset(g.lower().strip() for g in genres)
            best_idx = _find_best_genre_match(query_genres, release_year)
            if best_idx is not None:
                tokens.append(best_idx + token_offset)
                matched_genre += 1
                continue

        unknown += 1

    logger.info(
        f"  Sequence: {matched_exact} exact + {matched_genre} genre-matched + "
        f"{unknown} unknown = {len(tokens)} tokens"
    )
    return tokens[-MAX_SEQ_LEN:]


def _find_best_genre_match(
    query_genres: frozenset,
    release_year: int | None,
    top_n: int = 1,
) -> int | None:
    if not query_genres or not _item_genres:
        return None

    best_score = -1.0
    best_idx = None

    for idx, item_genre_set in _item_genres.items():
        if not item_genre_set:
            continue

        intersection = len(query_genres & item_genre_set)
        union = len(query_genres | item_genre_set)
        jaccard = intersection / union if union > 0 else 0.0

        if jaccard == 0:
            continue

        if release_year and idx in _item_years:
            year_diff = abs(release_year - _item_years[idx])
            year_score = max(0.0, 1.0 - year_diff / 20.0)
        else:
            year_score = 0.5

        score = 0.7 * jaccard + 0.3 * year_score

        if score > best_score:
            best_score = score
            best_idx = idx

    return best_idx


# ─────────────────────────────────────────────────────────────────────────────
# INFERENCE
# ─────────────────────────────────────────────────────────────────────────────

def get_recommendations(
    session_id: str,
    watch_history: list,
    top_k: int = 10,
    redis_client=None,
) -> tuple[list[MovieCard], str, bool]:
    model_variant = get_model_variant(session_id, redis_client=redis_client)
    sequence = build_sequence(watch_history, model_variant)

    if len(sequence) < MIN_SEQ_LEN:
        logger.info(
            f"Cold start: sequence length {len(sequence)} < {MIN_SEQ_LEN}. "
            "Returning popularity fallback."
        )
        cards = _popularity_fallback(top_k)
        return cards, model_variant, True

    cards = _run_inference(sequence, model_variant, top_k)
    return cards, model_variant, False


def _run_inference(
    sequence: list[int],
    model_variant: str,
    top_k: int,
) -> list[MovieCard]:
    assert _ort_session is not None, "BERT4Rec model not loaded — call load_data() first"
    assert _user_feature_matrix is not None

    # Select correct session and token offset
    if model_variant == "sasrec" and _ort_session_sasrec is not None:
        session = _ort_session_sasrec
        token_offset = TOKEN_OFFSET_SASREC
    else:
        session = _ort_session
        token_offset = TOKEN_OFFSET_BERT4REC

    # ── 1. Filter out-of-bounds tokens before passing to model ───────────────
    # Vocab size = number of items + token offset (PAD + optional MASK)
    MODEL_VOCAB_SIZE = 9387  # number of items the ONNX model was trained on
    max_valid_token = MODEL_VOCAB_SIZE + token_offset
    safe_sequence = [t for t in sequence if 0 < t < max_valid_token]

    if len(safe_sequence) < MIN_SEQ_LEN:
        logger.warning(
            f"After bounds filtering, sequence too short ({len(safe_sequence)}). "
            "Using popularity fallback."
        )
        return _popularity_fallback(top_k)

    # ── 2. Left-pad sequence to MAX_SEQ_LEN ──────────────────────────────────
    padded = [PAD_TOKEN] * (MAX_SEQ_LEN - len(safe_sequence)) + list(safe_sequence)
    input_ids = np.array([padded], dtype=np.int64)          # shape: [1, 50]

    # ── 3. Build attention mask ───────────────────────────────────────────────
    pad_mask = (input_ids != PAD_TOKEN)                     # shape: [1, 50], dtype bool

    # ── 4. User feature vector ────────────────────────────────────────────────
    user_feats = np.zeros((1, _user_feature_matrix.shape[1]), dtype=np.float32)

    # ── 5. Run inference ──────────────────────────────────────────────────────
    feed = {
        "input_ids":  input_ids,
        "pad_mask":   pad_mask,
        "user_feats": user_feats,
    }
    outputs = session.run(None, feed)

    # Output shape: [1, 50, vocab_size] — take logits at last real position
    raw = outputs[0]
    if raw.ndim == 3:
        logits = raw[0, -1, :]
    elif raw.ndim == 2:
        logits = raw[0]
    else:
        logits = raw.squeeze()

    # ── 6. Suppress invalid tokens ───────────────────────────────────────────
    logits = logits.copy().astype(np.float32)
    logits[PAD_TOKEN] = -1e9
    if model_variant != "sasrec":
        logits[MASK_TOKEN] = -1e9
    for token in safe_sequence:
        if 0 <= token < len(logits):
            logits[token] = -1e9

    # ── 7. Decode top-K ──────────────────────────────────────────────────────
    top_tokens = np.argsort(logits)[::-1][:top_k * 3]

    cards: list[MovieCard] = []
    for token in top_tokens:
        item_idx = int(token) - token_offset
        if item_idx < 0:
            continue
        card = _idx_to_card.get(item_idx)
        if card is None:
            continue
        cards.append(card)
        if len(cards) == top_k:
            break

    return cards


def _popularity_fallback(top_k: int) -> list[MovieCard]:
    cards: list[MovieCard] = []
    for item_id in _popularity_fallback_ids:
        item_idx = _item_id_to_idx.get(item_id)
        if item_idx is None:
            continue
        card = _idx_to_card.get(item_idx)
        if card is not None:
            cards.append(card)
        if len(cards) == top_k:
            break
    return cards


# ─────────────────────────────────────────────────────────────────────────────
# CACHE KEY
# ─────────────────────────────────────────────────────────────────────────────

def make_cache_key(session_id: str, watch_history: list, top_k: int) -> str:
    titles = sorted(
        (item.title if hasattr(item, 'title') else item).lower().strip()
        for item in watch_history
    )
    payload = json.dumps({"h": titles, "k": top_k, "n": len(titles)}, sort_keys=True)
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"rec:{session_id}:{digest}"


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE MATRIX BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _build_user_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    ignore = {
        "user_idx", "user_id", "first_seen", "last_seen",
        "user_engagement_tier", "user_preferred_hour_bucket",
    }
    num_cols = [
        c for c in df.columns
        if c not in ignore and pd.api.types.is_numeric_dtype(df[c])
    ]

    feature_df = df[num_cols].fillna(0)
    zero_frac = (feature_df == 0).mean()
    keep_cols = zero_frac[zero_frac < 0.95].index.tolist()
    feature_df = feature_df[keep_cols]

    tier_dummies = pd.get_dummies(
        df["user_engagement_tier"].astype(str), prefix="tier"
    )
    hour_dummies = pd.get_dummies(
        df["user_preferred_hour_bucket"].astype(str), prefix="hour"
    )
    full_df = pd.concat([feature_df, tier_dummies, hour_dummies], axis=1).fillna(0)

    scaler = StandardScaler()
    scaled = scaler.fit_transform(full_df.values.astype(np.float32))

    return scaled.astype(np.float32)