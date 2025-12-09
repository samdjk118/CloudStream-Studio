# Dockerfile

# ============================================================
# Stage 1: 建立前端
# ============================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# 複製前端 package files
COPY ./package*.json ./

# 安裝依賴
RUN npm ci

# 複製前端所有檔案
COPY ./ ./

# 建立生產版本
RUN npm run build

# ============================================================
# Stage 2: 建立最終映像
# ============================================================
FROM python:3.11-slim

# 設定環境變數
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    APP_HOME=/app \
    GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/application_default_credentials.json

WORKDIR $APP_HOME

# 安裝系統依賴（修正 gcloud CLI 安裝方式）
RUN apt-get update && apt-get install -y \
    ffmpeg \
    nginx \
    supervisor \
    curl \
    gnupg \
    lsb-release \
    apt-transport-https \
    ca-certificates \
    && mkdir -p /usr/share/keyrings \
    && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
       | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
       | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update \
    && apt-get install -y google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

# 複製並安裝 Python 依賴
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# 複製後端程式碼
COPY backend/ ./backend/

# 從前端建立階段複製建立好的檔案
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 複製設定檔
COPY nginx.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY startup.sh ./

# 建立必要目錄
RUN mkdir -p backend/credentials backend/tokens /var/log/supervisor && \
    chmod +x startup.sh

# 暴露 port
EXPOSE 80

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost/api/health || exit 1

# 啟動
CMD ["./startup.sh"]
