#!/bin/bash
# startup.sh

set -e

echo "============================================================"
echo "CloudStream Docker Container Starting"
echo "============================================================"

# 檢查必要的環境變數
if [ -z "$GCP_PROJECT_ID" ]; then
    echo "❌ Error: GCP_PROJECT_ID is not set"
    exit 1
fi

if [ -z "$GCS_BUCKET_NAME" ]; then
    echo "❌ Error: GCS_BUCKET_NAME is not set"
    exit 1
fi

# 檢查 credentials.json
if [ ! -f "/app/backend/credentials/credentials.json" ]; then
    echo "❌ Error: credentials.json not found"
    echo "Please mount credentials.json to /app/backend/credentials/"
    exit 1
fi

echo "✓ Environment variables configured"
echo "  - GCP_PROJECT_ID: $GCP_PROJECT_ID"
echo "  - GCS_BUCKET_NAME: $GCS_BUCKET_NAME"
echo "✓ Credentials found"

# 建立 .env 檔案
cat > /app/backend/.env << EOF
GCP_PROJECT_ID=$GCP_PROJECT_ID
GCS_BUCKET_NAME=$GCS_BUCKET_NAME
ALLOWED_ORIGINS=*
EOF

echo "✓ Backend .env created"

# 檢查 FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ Error: FFmpeg not installed"
    exit 1
fi

echo "✓ FFmpeg installed: $(ffmpeg -version | head -n1)"

# 檢查前端檔案
if [ ! -f "/app/frontend/dist/index.html" ]; then
    echo "❌ Error: Frontend build not found"
    exit 1
fi

echo "✓ Frontend build found"

# 測試 Nginx 設定
nginx -t

echo "✓ Nginx configuration valid"

# 啟動 Supervisor
echo ""
echo "============================================================"
echo "Starting Services..."
echo "============================================================"
echo "Frontend: http://localhost/"
echo "Backend API: http://localhost/api"
echo "API Docs: http://localhost/docs"
echo "Health Check: http://localhost/api/health"
echo "============================================================"
echo ""

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

