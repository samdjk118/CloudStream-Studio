# run.sh
#!/bin/bash

echo "=== CloudStream Studio Backend ==="
echo ""

# 檢查虛擬環境
if [ ! -d "venv" ]; then
    echo "建立虛擬環境..."
    python3 -m venv venv
fi

# 啟動虛擬環境
source venv/bin/activate

# 安裝依賴
echo "安裝依賴套件..."
pip install -r requirements.txt

echo "🔍 檢查認證..."
python3 check_auth.py

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 認證檢查失敗"
    echo "   請先運行: ./setup-local.sh"
    exit 1
fi

# 啟動服務
echo ""
echo "啟動 API 服務..."
# 使用 uvicorn 命令列啟動
uvicorn main:app \
    --host ${API_HOST:-0.0.0.0} \
    --port ${API_PORT:-8000} \
    --reload \
    --log-level info
