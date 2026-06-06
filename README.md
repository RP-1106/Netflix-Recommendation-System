# Streamora
<p align="justify">
A full-stack AI-powered streaming recommendation platform built with transformer-based sequential models, multi-profile accounts, and real-time Watch Together sessions.
</p>

> **Demo Video:** [Watch on YouTube](https://your-youtube-link-here)

## Features
- **Recommendation Engine**
  - Streamora uses two transformer-based sequential recommendation models: **BERT4Rec** and **SASRec**, trained on Netflix UK interaction data and served via ONNX Runtime for fast inference. As you interact with the platform, recommendations update in real time to reflect your taste.
  - **Feedback Loop**: 👍 Thumbs up signals the recommender to fetch a fresh set of personalised recommendations. 👎 Thumbs down immediately removes that title from your feed and suppresses it from future recommendations.
  - **Semantic Search**: Powered by `all-MiniLM-L6-v2`, supports mood and genre queries like *"dark psychological thriller"* or *"feel-good 90s comedy"*, ranked by title relevance.
  - **Cold Start Handling**: New users without watch history are shown popularity-based recommendations using TMDB trending data and 38-dimensional user feature vectors. Once you interact with 6 or more titles, the system switches to personalised transformer-based recommendations.
- **Watch Together**: Invite a friend by email to a shared watch party. Once they accept, both users are connected via a real-time WebSocket room with a live chat sidebar, allowing them to watch and react together.
- **Profiles**: Up to 6 profiles per account, each with fully isolated watch history, Continue Watching lists, and personalised recommendations. Profiles can be created, renamed, and deleted, each with a custom avatar and colour.

## Tech Stack

### Frontend
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/) [![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/) [![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white)](https://reactrouter.com/)

### Backend
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/) [![Uvicorn](https://img.shields.io/badge/Uvicorn-499848?style=for-the-badge&logoColor=white)](https://www.uvicorn.org/)

### ML & Search
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-005CED?style=for-the-badge&logo=onnx&logoColor=white)](https://onnxruntime.ai/) [![HuggingFace](https://img.shields.io/badge/HuggingFace-FFD21F?style=for-the-badge&logo=huggingface&logoColor=black)](https://huggingface.co/) [![sentence-transformers](https://img.shields.io/badge/sentence--transformers-FFD21F?style=for-the-badge&logoColor=black)](https://www.sbert.net/) [![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)

### Database & Infrastructure
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/) [![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logoColor=white)](https://www.sqlalchemy.org/) [![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/) [![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-231F20?style=for-the-badge&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)

### Deployment
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/) [![AWS EC2](https://img.shields.io/badge/AWS_EC2-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/ec2/) [![nginx](https://img.shields.io/badge/nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)](https://nginx.org/)

### External APIs
[![TMDB](https://img.shields.io/badge/TMDB_API-01B4E4?style=for-the-badge&logo=themoviedatabase&logoColor=white)](https://www.themoviedb.org/)

## Model Evaluation

Models trained on Netflix UK data — 9,387 items, 110,065 users. Evaluated on a held-out test set using standard ranking metrics.

### BERT4Rec

| Metric | Validation | Test |
|--------|-----------|------|
| HR@5   | 0.1409    | 0.1074 |
| HR@10  | 0.1937    | 0.1549 |
| HR@20  | 0.2555    | 0.2153 |
| NDCG@5 | 0.0996    | 0.0734 |
| NDCG@10 | 0.1166   | 0.0888 |
| NDCG@20 | 0.1322   | 0.1040 |
| MRR    | 0.1025    | 0.0782 |

### SASRec

| Metric | Validation | Test |
|--------|-----------|------|
| HR@5   | 0.1951    | 0.1637 |
| HR@10  | 0.2565    | 0.2206 |
| HR@20  | 0.3285    | 0.2868 |
| NDCG@5 | 0.1424    | 0.1181 |
| NDCG@10 | 0.1622   | 0.1365 |
| NDCG@20 | 0.1803   | 0.1531 |
| MRR    | 0.1432    | 0.1201 |


## Installation

### Prerequisites
- Python 3.11+
- Node.js 20+

### Run Locally
1. Clone the repository
```bash
git clone https://github.com/RP-1106/Streamora-Recommendation-System
cd Streamora-Recommendation-System/rec_system
```

2. Backend setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -c "from database import init_db; init_db()"
uvicorn main:app --reload --port 8000
```

3. Frontend setup (new terminal)
```bash
cd frontend
npm install
npm run dev
```

4. Open `http://localhost:5173`

### Run with Docker

```bash
docker compose build
docker compose up
```

Open `http://localhost`

### Deploy to AWS EC2

1. Launch EC2 instance — Ubuntu 24.04, t3.medium, 30GB storage, open ports 22, 80, and 8000.

2. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

3. Pull and run
```bash
docker compose pull
docker compose up -d
```

4. Access at `http://<EC2-PUBLIC-IP>`

> **Note:** The frontend image must be built with `VITE_API_BASE_URL=http://<EC2-PUBLIC-IP>:8000` set so the frontend can reach the backend.
