#!/bin/bash

echo "🧪 測試 CloudStream Studio API"
echo "================================"
echo ""

# 測試健康檢查
echo "1️⃣  測試健康檢查..."
curl -s http://localhost:8000/api/health | jq .
echo ""

# 測試文件列表
echo "2️⃣  測試文件列表..."
curl -s http://localhost:8000/api/files | jq .
echo ""

# 測試縮圖（如果有文件）
FILES=$(curl -s http://localhost:8000/api/files | jq -r '.files[0].name')
if [ ! -z "$FILES" ] && [ "$FILES" != "null" ]; then
    echo "3️⃣  測試縮圖..."
    echo "   文件: $FILES"
    curl -I "http://localhost:8000/api/thumbnails/video/$FILES?width=320&height=180"
fi

# 1. 獲取文件列表
echo "1️⃣  獲取文件列表..."
FILES=$(curl -s http://localhost:8000/api/files)
echo "$FILES" | jq -r '.files[] | "\(.name) (\(.size) bytes)"'
echo ""

# 2. 獲取第一個影片文件
VIDEO_FILE=$(echo "$FILES" | jq -r '.files[0].name')

if [ -z "$VIDEO_FILE" ] || [ "$VIDEO_FILE" = "null" ]; then
    echo "❌ 沒有影片文件"
    exit 1
fi

echo "2️⃣  測試影片文件: $VIDEO_FILE"
echo ""

# 3. 測試 HEAD 請求
echo "3️⃣  測試 HEAD 請求..."
curl -I "http://localhost:8000/api/stream/$VIDEO_FILE" 2>&1 | grep -E "(HTTP|Content-|Accept-)"
echo ""

# 4. 測試 Range 請求
echo "4️⃣  測試 Range 請求 (前 1KB)..."
curl -H "Range: bytes=0-1023" \
     "http://localhost:8000/api/stream/$VIDEO_FILE" \
     -o test_stream_chunk.bin \
     -w "HTTP Status: %{http_code}\nSize: %{size_download} bytes\n"
echo ""

if [ -f test_stream_chunk.bin ]; then
    SIZE=$(ls -lh test_stream_chunk.bin | awk '{print $5}')
    echo "✅ 下載成功: test_stream_chunk.bin ($SIZE)"
    rm test_stream_chunk.bin
fi

echo ""
echo "✅ 測試完成"
