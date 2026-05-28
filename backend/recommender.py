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
from sklearn.preprocessing import StandardScaler

from schemas import MovieCard

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# MODULE-LEVEL STATE  (populated once at startup, read-only afterwards)
# ─────────────────────────────────────────────────────────────────────────────

_ort_session: ort.InferenceSession | None = None          # BERT4Rec
_ort_session_sasrec: ort.InferenceSession | None = None   # SASRec

# item_feature_matrix removed — item embeddings are baked into the ONNX model weights,
# NOT passed as a runtime input (confirmed: model has no item_features input)

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
    """
    Load item features, user features, and ONNX model(s) into memory.
    Called once at FastAPI startup.
    sasrec_model_path: if provided, loads a second ONNX session for SASRec A/B variant.
    """
    global _ort_session, _ort_session_sasrec, _item_id_to_idx, _idx_to_card, _title_to_item_id
    global _popularity_fallback_ids, _user_feature_matrix
    global _user_id_to_idx

    data_dir = Path(data_dir)

    # ── 1. Load item features ────────────────────────────────────────────────
    logger.info("Loading item features...")
    itf = pd.read_csv(data_dir / "item_features_final.csv")
    n_items = len(itf)
    logger.info(f"  {n_items} items loaded")

    # item_id ↔ item_idx maps
    _item_id_to_idx = dict(zip(itf["item_id"], itf["item_idx"]))

    # Canonical title map — for each title, pick the item_id with highest click_count
    # This handles the 466 titles that have multiple IDs (regional/re-upload duplicates)
    canonical = (
        itf.sort_values("click_count", ascending=False)
        .drop_duplicates(subset="title", keep="first")
        .set_index("title")["item_id"]
        .to_dict()
    )
    _title_to_item_id = {t.lower().strip(): iid for t, iid in canonical.items()}

    # idx → MovieCard for fast response building
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

    # Popularity fallback — sorted by log_popularity descending
    _popularity_fallback_ids = (
        itf.sort_values("log_popularity", ascending=False)["item_id"]
        .tolist()
    )

    # ── 2. Build user features ────────────────────────────────────────────────
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

def get_model_variant(session_id: str) -> str:
    """
    Deterministically assign a session to 'bert4rec' or 'sasrec'.
    Same session_id always gets the same model — required for valid A/B measurement.
    Uses MD5 hash of session_id, takes modulo 2.
    """
    return (
        "bert4rec"
        if int(hashlib.md5(session_id.encode()).hexdigest(), 16) % 2 == 0
        else "sasrec"
    )


# ─────────────────────────────────────────────────────────────────────────────
# SEQUENCE BUILDING
# ─────────────────────────────────────────────────────────────────────────────

def build_sequence(watch_history: list[str], model_variant: str = "bert4rec") -> list[int]:
    """
    Convert a list of movie title strings into a list of model tokens.

    Steps:
      1. Lowercase + strip each title
      2. Look up canonical item_id (highest-click-count version for duplicates)
      3. Convert item_id → item_idx → token using per-model offset:
            BERT4Rec: item_idx + 2  (PAD=0, MASK=1, items start at 2)
            SASRec:   item_idx + 1  (PAD=0,         items start at 1)
      4. Skip titles not found in our item catalogue
      5. Truncate to MAX_SEQ_LEN (keep the most recent MAX_SEQ_LEN items)

    Returns a list of integer tokens ready to be padded and fed to the model.
    Unknown titles are silently dropped — the user just has a shorter sequence.
    """
    token_offset = (
        TOKEN_OFFSET_SASREC if model_variant == "sasrec" else TOKEN_OFFSET_BERT4REC
    )
    tokens: list[int] = []
    unknown: list[str] = []

    for title in watch_history:
        key = title.lower().strip()
        item_id = _title_to_item_id.get(key)
        if item_id is None:
            unknown.append(title)
            continue
        item_idx = _item_id_to_idx.get(item_id)
        if item_idx is None:
            unknown.append(title)
            continue
        tokens.append(item_idx + token_offset)

    logger.info(f"  Matched {len(tokens)} / {len(watch_history)} titles. Unknown: {unknown[:10]}")

    # Keep the most recent MAX_SEQ_LEN items
    return tokens[-MAX_SEQ_LEN:]


# ─────────────────────────────────────────────────────────────────────────────
# INFERENCE
# ─────────────────────────────────────────────────────────────────────────────

def get_recommendations(
    session_id: str,
    watch_history: list[str],
    top_k: int = 10,
) -> tuple[list[MovieCard], str, bool]:
    """
    Main entry point called by the /recommend endpoint.

    Returns:
        (recommendations, model_variant, cold_start)
        recommendations: list of MovieCard, ranked highest first
        model_variant:   'bert4rec' or 'sasrec' (for A/B logging)
        cold_start:      True if sequence was too short → popularity fallback used
    """
    model_variant = get_model_variant(session_id)
    sequence = build_sequence(watch_history, model_variant)

    # Cold-start gate: fewer than MIN_SEQ_LEN known items → popularity fallback
    if len(sequence) < MIN_SEQ_LEN:
        logger.info(
            f"Cold start: sequence length {len(sequence)} < {MIN_SEQ_LEN}. "
            "Returning popularity fallback."
        )
        cards = _popularity_fallback(top_k)
        return cards, model_variant, True

    # Run ONNX inference
    cards = _run_inference(sequence, model_variant, top_k)
    return cards, model_variant, False


def _run_inference(
    sequence: list[int],
    model_variant: str,
    top_k: int,
) -> list[MovieCard]:
    """
    Pad the sequence, build the attention mask, get user features,
    run the correct ONNX model, decode top-K results.

    ONNX model inputs (same for both models):
      input_ids:  int64   [batch_size, 50]  — token sequence, left-padded with 0s
      pad_mask:   bool    [batch_size, 50]  — True where token is real, False where PAD
      user_feats: float32 [batch_size, 38]  — standardised user feature vector

    Token offsets:
      BERT4Rec: item_idx + 2  (PAD=0, MASK=1, items start at 2)
      SASRec:   item_idx + 1  (PAD=0,         items start at 1)
    """
    assert _ort_session is not None, "BERT4Rec model not loaded — call load_data() first"
    assert _user_feature_matrix is not None

    # Select correct session and token offset for this variant
    if model_variant == "sasrec" and _ort_session_sasrec is not None:
        session = _ort_session_sasrec
        token_offset = TOKEN_OFFSET_SASREC
    else:
        session = _ort_session
        token_offset = TOKEN_OFFSET_BERT4REC

    # ── 1. Left-pad sequence to MAX_SEQ_LEN ──────────────────────────────────
    padded = [PAD_TOKEN] * (MAX_SEQ_LEN - len(sequence)) + list(sequence)
    input_ids = np.array([padded], dtype=np.int64)          # shape: [1, 50]

    # ── 2. Build attention mask ───────────────────────────────────────────────
    pad_mask = (input_ids != PAD_TOKEN)                     # shape: [1, 50], dtype bool

    # ── 3. User feature vector ────────────────────────────────────────────────
    user_feats = np.zeros((1, _user_feature_matrix.shape[1]), dtype=np.float32)

    # ── 4. Run inference ──────────────────────────────────────────────────────
    feed = {
        "input_ids":  input_ids,
        "pad_mask":   pad_mask,
        "user_feats": user_feats,
    }
    outputs = session.run(None, feed)

    # Output shape: [1, 50, vocab_size] — take logits at last real position
    raw = outputs[0]
    if raw.ndim == 3:
        logits = raw[0, -1, :]        # last position in sequence
    elif raw.ndim == 2:
        logits = raw[0]
    else:
        logits = raw.squeeze()

    # ── 5. Suppress invalid tokens ───────────────────────────────────────────
    logits = logits.copy().astype(np.float32)
    logits[PAD_TOKEN] = -1e9          # never recommend PAD
    if model_variant != "sasrec":
        logits[MASK_TOKEN] = -1e9     # BERT4Rec has a MASK token; SASRec does not
    for token in sequence:            # never recommend something already watched
        if 0 <= token < len(logits):
            logits[token] = -1e9

    # ── 6. Decode top-K ──────────────────────────────────────────────────────
    top_tokens = np.argsort(logits)[::-1][:top_k * 3]

    cards: list[MovieCard] = []
    for token in top_tokens:
        item_idx = int(token) - token_offset   # undo per-model token offset
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
    """
    Return the top_k most popular items by log_popularity.
    Used when a user has fewer than MIN_SEQ_LEN known interactions.
    """
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

def make_cache_key(session_id: str, watch_history: list[str], top_k: int) -> str:
    """
    Build a Redis cache key from the session and request.
    Key is based on the sorted, lowercased watch history so that small
    ordering differences don't cause unnecessary cache misses.
    """
    canonical_history = sorted(t.lower().strip() for t in watch_history)
    payload = json.dumps({"h": canonical_history, "k": top_k}, sort_keys=True)
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"rec:{session_id}:{digest}"


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE MATRIX BUILDERS  (mirror the notebook's build_*_feature_matrix fns)
# ─────────────────────────────────────────────────────────────────────────────

def _build_user_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """
    Build the standardized user feature matrix.
    Row i corresponds to user_idx=i.
    Must exactly mirror the notebook's build_user_feature_matrix() function.
    """
    ignore = {
        "user_idx", "user_id", "first_seen", "last_seen",
        "user_engagement_tier", "user_preferred_hour_bucket",
    }
    num_cols = [
        c for c in df.columns
        if c not in ignore and pd.api.types.is_numeric_dtype(df[c])
    ]

    # Drop near-zero columns (>95% zeros) — same filter as notebook
    feature_df = df[num_cols].fillna(0)
    zero_frac = (feature_df == 0).mean()
    keep_cols = zero_frac[zero_frac < 0.95].index.tolist()
    feature_df = feature_df[keep_cols]

    # One-hot encode ordinal categoricals (same as notebook)
    tier_dummies = pd.get_dummies(
        df["user_engagement_tier"].astype(str), prefix="tier"
    )
    hour_dummies = pd.get_dummies(
        df["user_preferred_hour_bucket"].astype(str), prefix="hour"
    )
    full_df = pd.concat([feature_df, tier_dummies, hour_dummies], axis=1).fillna(0)

    scaler = StandardScaler()
    scaled = scaler.fit_transform(full_df.values.astype(np.float32))

    return scaled.astype(np.float32)  # shape: [n_users, n_user_features]