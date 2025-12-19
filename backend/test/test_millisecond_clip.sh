#!/bin/bash

API_BASE="http://localhost:8000"
VIDEO_PATH="0143ca2a-51ef-4d9f-83a9-b1187abcf29d/video.mp4/12787913976018436535/sample_0.mp4"  # 修改為你的影片路徑

echo "=========================================="
echo "⏱️  毫秒級精度剪輯測試"
echo "=========================================="

# 測試案例
declare -a TEST_CASES=(
    "1.234:2.567:test1"    # 1.234s - 2.567s (1.333秒)
    "0.500:1.500:test2"    # 0.5s - 1.5s (1秒)
    "2.100:2.850:test3"    # 2.1s - 2.85s (0.75秒)
    "0.001:0.501:test4"    # 1ms - 501ms (0.5秒)
    "5.123:7.789:test5"   # 5.123s - 7.789s (5.666秒)
)

for test_case in "${TEST_CASES[@]}"; do
    IFS=':' read -r start end name <<< "$test_case"
    
    duration=$(echo "$end - $start" | bc)
    duration_ms=$(echo "$duration * 1000" | bc | cut -d. -f1)
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📌 測試: $name"
    echo "   開始: ${start}s"
    echo "   結束: ${end}s"
    echo "   預期時長: ${duration}s (${duration_ms}ms)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 創建剪輯任務
    RESPONSE=$(curl -s -X POST "${API_BASE}/api/videos/clip" \
      -H "Content-Type: application/json" \
      -d "{
        \"source_video\": \"${VIDEO_PATH}\",
        \"start_time\": ${start},
        \"end_time\": ${end},
        \"output_name\": \"clip_ms_${name}_$(date +%s).mp4\"
      }")
    
    echo "$RESPONSE" | jq '.'
    
    TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
    
    if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
        echo ""
        echo "⏳ 等待任務完成..."
        
        # 監控任務
        for i in {1..30}; do
            sleep 2
            
            STATUS_RESPONSE=$(curl -s "${API_BASE}/api/tasks/${TASK_ID}")
            STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
            PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress')
            
            # 顯示進度
            PROGRESS_PERCENT=$(echo "$PROGRESS * 100" | bc | cut -d. -f1)
            echo -ne "\r   進度: ${PROGRESS_PERCENT}%                    "
            
            if [ "$STATUS" = "completed" ]; then
                echo ""
                echo ""
                echo "✅ 任務完成！"
                
                # 顯示結果
                CLIP_DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.clip_duration')
                EXPECTED_DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.expected_duration')
                
                echo "   實際時長: ${CLIP_DURATION}s"
                echo "   預期時長: ${EXPECTED_DURATION}s"
                
                # 計算誤差
                ERROR=$(echo "$CLIP_DURATION - $EXPECTED_DURATION" | bc)
                ERROR_ABS=$(echo "$ERROR" | awk '{print ($1 < 0) ? -$1 : $1}')
                ERROR_MS=$(echo "$ERROR_ABS * 1000" | bc | cut -d. -f1)
                
                echo "   誤差: ${ERROR_ABS}s (${ERROR_MS}ms)"
                
                if (( $(echo "$ERROR_ABS < 0.010" | bc -l) )); then
                    echo "   ✅ 精度：優秀 (< 10ms)"
                elif (( $(echo "$ERROR_ABS < 0.050" | bc -l) )); then
                    echo "   ✓ 精度：良好 (< 50ms)"
                elif (( $(echo "$ERROR_ABS < 0.100" | bc -l) )); then
                    echo "   ○ 精度：可接受 (< 100ms)"
                else
                    echo "   ⚠️  精度：一般 (> 100ms)"
                fi
                
                break
            elif [ "$STATUS" = "failed" ]; then
                echo ""
                echo ""
                echo "❌ 任務失敗"
                echo "$STATUS_RESPONSE" | jq '.error'
                break
            fi
        done
    fi
    
    echo ""
    read -p "按 Enter 繼續下一個測試..."
done

echo ""
echo "=========================================="
echo "✅ 所有測試完成"
echo "=========================================="

