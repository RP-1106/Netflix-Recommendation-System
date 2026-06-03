# NETFLX: AI-Powered Streaming Recommendation System

A full-stack Netflix-inspired recommendation platform built with transformer-based ML models, real-time features, and a production-ready deployment pipeline.

> **Demo Video:** [Watch on YouTube](https://your-youtube-link-here) 


## Overview
NETFLX is an end-to-end recommendation system that combines state-of-the-art sequential recommendation models with a polished streaming UI. Users get personalised movie and TV show recommendations that improve as they interact with the platform, with support for multi-profile accounts, real-time Watch Together sessions, and semantic search.

## Features

### 1. Recommendation Engine
- **BERT4Rec v3** and **SASRec v3** — transformer-based sequential recommendation models trained on Netflix UK data (9,387 items, 110,065 users), served via ONNX Runtime
- **Thompson Sampling A/B testing** — dynamically routes users between models based on real-time feedback signals
- **Semantic Search** — `all-MiniLM-L6-v2` sentence transformer encodes 9,387 items into a dense embedding space; supports mood-based and genre-based queries ("dark psychological thriller", "feel-good comedy")
- **Hard Negative Filtering** — thumbs down signals permanently suppress items from future recommendations
- **Redis caching** — sub-2ms recommendation latency after warm-up
- **Kafka feedback pipeline** — asynchronous feedback ingestion for online learning

### 2. User Experience
- Netflix-style UI with hero carousel, horizontal movie rows, hover previews
- **Multi-profile accounts** — up to 6 profiles per account, each with isolated watch history, Continue Watching, and Watch Again lists
- **Watch Together** — invite friends to a shared watch party with real-time WebSocket chat
- **Notification system** — bell icon with pending invite alerts
- **Semantic + TMDB hybrid search** — searches both the catalogue and TMDB simultaneously, ranked by title relevance
- TV Shows, Movies, New & Popular, and My List pages
- Profile management — create, rename, delete profiles with custom avatars

### 3. Technical
- All user data (accounts, profiles, watch history, Continue Watching, Watch Again) persisted to SQLite across server restarts
- Per-profile data isolation — switching profiles loads completely separate recommendation history
- Docker Compose deployment with 5 services (frontend, backend, Redis, Kafka, Zookeeper)
- Deployed to AWS EC2 (t3.medium, Ubuntu 24.04)

## Architecture

```
Browser (React + Vite)
        │
        ▼
  nginx (port 80)
        │
        ▼
FastAPI Backend (port 8000)
    ├── ONNX Runtime (BERT4Rec + SASRec)
    ├── Sentence Transformers (semantic search)
    ├── SQLite (users, profiles, history)
    ├── Redis (recommendation cache)
    └── Kafka (feedback pipeline)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router |
| Backend | FastAPI, Python 3.11, Uvicorn |
| ML Models | BERT4Rec v3, SASRec v3 (ONNX Runtime) |
| Semantic Search | sentence-transformers (all-MiniLM-L6-v2) |
| Database | SQLite (SQLAlchemy ORM) |
| Cache | Redis 7 |
| Message Queue | Apache Kafka (Confluent) |
| Real-time | WebSockets (FastAPI) |
| External APIs | TMDB API |
| Containerisation | Docker, Docker Compose |
| Deployment | AWS EC2 (t3.medium, Ubuntu 24.04) |

## Dataset

- **Netflix UK catalogue** — 9,387 items with genre, popularity, and release metadata
- **User interaction data** — 110,065 users with sequential watch histories
- **Item features** — genre embeddings, log-popularity scores, release year
- **User features** — 38-dimensional feature vectors for cold-start handling


## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- Redis (or Docker)

### Run Locally

**1. Clone the repository**
```bash
git clone https://github.com/RP-1106/Netflix-Recommendation-System
cd Netflix-Recommendation-System/rec_system
```

**2. Backend setup**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**3. Frontend setup** (new terminal)
```bash
cd frontend
npm install
npm run dev
```

**4. Open** `http://localhost:5173`

### Run with Docker

```bash
docker compose build
docker compose up
```

Open `http://localhost`

## Deployment (AWS EC2)

**1. Launch EC2 instance** — Ubuntu 24.04, t3.medium, 30GB storage, ports 22/80/8000 open

**2. Install Docker**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

**3. Create docker-compose.yml** using images `rp1106/netflx-backend:latest` and `rp1106/netflx-frontend:latest`

**4. Deploy**
```bash
docker compose pull
docker compose up -d
```

**5. Access** at `http://<EC2-PUBLIC-IP>`

> Note: The frontend image must be built with `VITE_API_BASE_URL=http://<EC2-PUBLIC-IP>:8000` for the backend connection to work.

---

## Contributors

| Contributor | GitHub | 
|---|---|
| Rhea Pandita | [@RP-1106](https://github.com/RP-1106) |
| Sanjay Balasubramaniam| [@Sanjay180803](https://github.com/Sanjay180803) |

---

## Docker Hub

- Backend: `rp1106/netflx-backend:latest`
- Frontend: `rp1106/netflx-frontend:latest`

