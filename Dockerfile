# Stage 1: Build the React frontend
FROM node:18-alpine AS builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Set up the Python FastAPI backend and serve frontend
FROM python:3.11-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app


ENV PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN chmod -R 777 /app

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
