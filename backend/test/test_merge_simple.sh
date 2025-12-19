#!/bin/bash

API_BASE="http://localhost:8000"
VIDEO_PATH="0143ca2a-51ef-4d9f-83a9-b1187abcf29d/video.mp4/12787913976018436535/sample_0.mp4"

echo "=========================================="
echo "🔗 毫秒級精度合併測試"
echo "=========================================="

# 測試案例定義
# 格式: "測試名稱|片段1開始:片段1結束|片段2開始:片段2結束|..."
declare -a TEST_CASES=(
    "基本合併|0.500:1.000|2.000:3.000|4.000:5.000"
    "毫秒精度|1.234:2.567|5.123:5.789|7.001:7.999"
    "短片段|0.100:0.600|1.200:1.550|2.000:2.750"
    "連續片段|0.000:5.000|2.000:4.000|3.000:6.000"
)

for test_case in "${TEST_CASES[@]}"; do
    # 解析測試案例
    IFS='|' read -ra PARTS <<< "$test_case"
    TEST_NAME="${PARTS[0]}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📌 測試: ${TEST_NAME}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 構建片段 JSON 和計算預期時長
    CLIPS_JSON=""
    EXPECTED_TOTAL=0
    CLIP_COUNT=0
    
    for i in "${!PARTS[@]}"; do
        if [ $i -eq 0 ]; then
            continue  # 跳過測試名稱
        fi
        
        IFS=':' read -r start end <<< "${PARTS[$i]}"
        CLIP_COUNT=$((CLIP_COUNT + 1))
        
        # 計算片段時長
        duration=$(echo "$end - $start" | bc)
        duration_ms=$(echo "$duration * 1000" | bc | cut -d. -f1)
        EXPECTED_TOTAL=$(echo "$EXPECTED_TOTAL + $duration" | bc)
        
        echo "   片段 ${CLIP_COUNT}: ${start}s - ${end}s (${duration}s = ${duration_ms}ms)"
        
        # 構建 JSON
        if [ -n "$CLIPS_JSON" ]; then
            CLIPS_JSON+=","
        fi
        
        CLIPS_JSON+=$(cat <<EOF
{
  "source_video": "${VIDEO_PATH}",
  "start_time": ${start},
  "end_time": ${end}
}
EOF
)
    done
    
    expected_total_ms=$(echo "$EXPECTED_TOTAL * 1000" | bc | cut -d. -f1)
    echo ""
    echo "   預期總時長: ${EXPECTED_TOTAL}s (${expected_total_ms}ms)"
    echo ""
    
    # 創建合併任務
    OUTPUT_NAME="merged_${TEST_NAME// /_}_$(date +%s).mp4"
    
    RESPONSE=$(curl -s -X POST "${API_BASE}/api/videos/merge" \
      -H "Content-Type: application/json" \
      -d "{
        \"clips\": [${CLIPS_JSON}],
        \"output_name\": \"${OUTPUT_NAME}\"
      }")
    
    echo "📤 API 響應:"
    echo "$RESPONSE" | jq '.'
    
    TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
    
    if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
        echo ""
        echo "⏳ 等待合併完成..."
        
        # 監控任務（最多等待 60 次 = 2 分鐘）
        for i in {1..60}; do
            sleep 2
            
            STATUS_RESPONSE=$(curl -s "${API_BASE}/api/tasks/${TASK_ID}")
            STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
            PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress')
            MESSAGE=$(echo "$STATUS_RESPONSE" | jq -r '.message')
            
            # 顯示進度
            PROGRESS_PERCENT=$(echo "$PROGRESS * 100" | bc | cut -d. -f1)
            echo -ne "\r   進度: ${PROGRESS_PERCENT}% - ${MESSAGE}                    "
            
            if [ "$STATUS" = "completed" ]; then
                echo ""
                echo ""
                echo "✅ 合併完成！"
                echo ""
                
                # 提取結果數據
                MERGED_DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.merged_duration')
                EXPECTED_DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.expected_duration')
                ERROR_MS=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.duration_error_ms')
                ERROR_PERCENT=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.duration_error_percent')
                PRECISION=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.precision_level')
                OUTPUT_URL=$(echo "$STATUS_RESPONSE" | jq -r '.output_url')
                
                echo "📊 結果分析:"
                echo "   片段數量: ${CLIP_COUNT}"
                echo "   實際時長: ${MERGED_DURATION}s"
                echo "   預期時長: ${EXPECTED_DURATION}s"
                echo "   誤差: ${ERROR_MS}ms (${ERROR_PERCENT}%)"
                echo "   精度等級: ${PRECISION}"
                echo ""
                echo "   輸出 URL: ${OUTPUT_URL}"
                echo ""
                
                # 計算誤差（秒）
                ERROR=$(echo "$MERGED_DURATION - $EXPECTED_DURATION" | bc)
                ERROR_ABS=$(echo "$ERROR" | awk '{print ($1 < 0) ? -$1 : $1}')
                
                # 精度評估
                if (( $(echo "$ERROR_ABS < 0.050" | bc -l) )); then
                    echo "   ✅ 精度：優秀 (< 50ms)"
                elif (( $(echo "$ERROR_ABS < 0.100" | bc -l) )); then
                    echo "   ✓ 精度：良好 (< 100ms)"
                elif (( $(echo "$ERROR_ABS < 0.200" | bc -l) )); then
                    echo "   ○ 精度：可接受 (< 200ms)"
                else
                    echo "   ⚠️  精度：一般 (> 200ms)"
                fi
                
                # 顯示各片段實際時長
                CLIP_DURATIONS=$(echo "$STATUS_RESPONSE" | jq -r '.metadata.clip_durations[]')
                if [ -n "$CLIP_DURATIONS" ]; then
                    echo ""
                    echo "   各片段實際時長:"
                    clip_idx=1
                    while IFS= read -r clip_dur; do
                        echo "      片段 ${clip_idx}: ${clip_dur}s"
                        clip_idx=$((clip_idx + 1))
                    done <<< "$CLIP_DURATIONS"
                fi
                
                break
            elif [ "$STATUS" = "failed" ]; then
                echo ""
                echo ""
                echo "❌ 合併失敗"
                ERROR_MSG=$(echo "$STATUS_RESPONSE" | jq -r '.error')
                echo "   錯誤: ${ERROR_MSG}"
                break
            fi
            
            # 超時檢查
            if [ $i -eq 60 ]; then
                echo ""
                echo ""
                echo "⏰ 任務超時（2分鐘）"
            fi
        done
    else
        echo ""
        echo "❌ 創建任務失敗"
    fi
    
    echo ""
    read -p "按 Enter 繼續下一個測試..."
done

echo ""
echo "=========================================="
echo "✅ 所有測試完成"
echo "=========================================="

