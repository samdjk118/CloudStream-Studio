import React, { useState, useEffect, useRef } from 'react';
import { Clip, VideoAsset } from '../types';
import { Trash2, Play, Film, Sparkles, GripHorizontal, Eye } from 'lucide-react';
import { mergeVideos, pollTaskStatus, TaskStatus } from '../services/api';

interface TimelineProps {
  clips: Clip[];
  assets: Record<string, VideoAsset>;
  onRemoveClip: (clipId: string) => void;
  onSynthesize: () => void;
  isSynthesizing: boolean;
  onSynthesizeComplete?: (outputPath: string) => void;
  onPreviewClip?: (clip: Clip) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  clips,
  assets,
  onRemoveClip,
  onSynthesize: _onSynthesize,
  isSynthesizing: _isSynthesizing,
  onSynthesizeComplete,
  onPreviewClip
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  // 合併任務狀態
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizeTaskStatus, setSynthesizeTaskStatus] = useState<TaskStatus | null>(null);

  // 處理拖曳調整高度
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = timelineHeight;
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = Math.max(150, Math.min(500, resizeStartHeight.current + deltaY));
      setTimelineHeight(newHeight);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing]);

  // 載入/儲存高度偏好
  useEffect(() => {
    const savedHeight = localStorage.getItem('timelineHeight');
    if (savedHeight) {
      setTimelineHeight(parseInt(savedHeight));
    }
  }, []);

  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem('timelineHeight', timelineHeight.toString());
    }
  }, [timelineHeight, isResizing]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const totalDuration = clips.reduce((sum, clip) => sum + (clip.endTime - clip.startTime), 0);

  // ✅ 合成視頻並調用後端 API
  const handleSynthesize = async () => {
    if (clips.length === 0) {
      alert('沒有片段可以合成');
      return;
    }

    setIsSynthesizing(true);
    setSynthesizeTaskStatus(null);

    try {
      const timestamp = Date.now();
      const outputName = `merged_${timestamp}.mp4`;

      const mergeRequest = {
        clips: clips.map(clip => {
          const asset = assets[clip.sourceVideoId];
          return {
            source_video: asset?.fullPath || asset?.name || '',
            start_time: clip.startTime,
            end_time: clip.endTime
          };
        }),
        output_name: outputName
      };

      console.log('🔗 開始合併:', mergeRequest);

      const response = await mergeVideos(mergeRequest);
      console.log('✅ 合併任務已創建:', response);

      const finalStatus = await pollTaskStatus(
        response.task_id,
        (status) => {
          console.log('📊 合併進度:', status);
          setSynthesizeTaskStatus(status);
        },
        2000,
        600000
      );

      if (finalStatus.status === 'completed') {
        console.log('✅ 合併完成:', finalStatus);

        const metadata = finalStatus.metadata;
        
        // ✅ 顯示成功訊息
        alert(`✅ 合併完成！\n\n` +
              `片段數: ${metadata?.total_clips}\n` +
              `總時長: ${metadata?.merged_duration?.toFixed(3)}s\n` +
              `誤差: ${metadata?.duration_error_ms}ms\n` +
              `精度: ${metadata?.precision_level}\n\n` +
              `正在載入合成影片...`);

        // ✅ 清空所有片段
        console.log('🗑️ 清空時間軸片段');
        clips.forEach(clip => onRemoveClip(clip.id));

        // ✅ 通知父組件選取新影片
        if (finalStatus.output_path && onSynthesizeComplete) {
          console.log('📹 選取合成影片:', finalStatus.output_path);
          onSynthesizeComplete(finalStatus.output_path);
        }

        // 可選：延遲打開結果
        if (finalStatus.output_url) {
          setTimeout(() => {
            window.open(finalStatus.output_url, '_blank');
          }, 1000);
        }

      } else {
        throw new Error(finalStatus.error || '合併失敗');
      }

    } catch (error) {
      console.error('❌ 合併失敗:', error);
      alert(`合併失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    } finally {
      setIsSynthesizing(false);
      setSynthesizeTaskStatus(null);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="bg-[#1a1a1a] border-t border-[#333] flex flex-col shrink-0"
      style={{ height: `${timelineHeight}px` }}
    >
      {/* Resize Handle */}
      <div
        className={`h-1 bg-[#333] hover:bg-blue-500 cursor-row-resize flex items-center justify-center group transition-colors relative ${
          isResizing ? 'bg-blue-500' : ''
        }`}
        onMouseDown={handleResizeStart}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <GripHorizontal className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transition-colors" />
        </div>
        <div className="absolute inset-x-0 -top-2 -bottom-2" />
      </div>

      {/* Header */}
      <div className="h-12 px-4 border-b border-[#333] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Timeline Sequence</h3>
          <div className="text-xs text-gray-500 bg-[#222] px-2 py-1 rounded">
            {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </div>
          {totalDuration > 0 && (
            <div className="text-xs text-gray-400 font-mono">
              Total: {formatTime(totalDuration)}
            </div>
          )}
          {isSynthesizing && synthesizeTaskStatus && (
            <div className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded border border-blue-500/30">
              {Math.round(synthesizeTaskStatus.progress * 100)}% - {synthesizeTaskStatus.message}
            </div>
          )}
        </div>
        
        <button
          onClick={handleSynthesize}
          disabled={clips.length === 0 || isSynthesizing}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed shadow-lg"
        >
          {isSynthesizing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              合成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Synthesize Video
            </>
          )}
        </button>
      </div>

      {/* Clips Container - 可滾動 */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
        {clips.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center mb-3">
              <Film className="w-8 h-8" />
            </div>
            <p className="text-sm">No clips added yet</p>
            <p className="text-xs text-gray-600 mt-1">Select a video and create clips to build your sequence</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clips.map((clip, index) => {
              const asset = assets[clip.sourceVideoId];
              const duration = clip.endTime - clip.startTime;
              
              return (
                <div
                  key={clip.id}
                  className="group relative bg-[#222] border border-[#333] rounded-lg p-3 hover:border-blue-500/50 transition-all"
                >
                  {/* Clip Number Badge */}
                  <div className="absolute -left-2 -top-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg">
                    {index + 1}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* ✅ 可點擊的縮圖 - 預覽片段 */}
                    <div 
                      className="w-24 h-14 bg-black rounded flex items-center justify-center text-gray-600 shrink-0 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition group/thumb"
                      onClick={() => onPreviewClip && onPreviewClip(clip)}
                      title="點擊預覽此片段"
                    >
                      <Play className="w-6 h-6 absolute opacity-50 group-hover/thumb:opacity-100 transition" />
                      <Eye className="w-4 h-4 absolute top-1 right-1 opacity-0 group-hover/thumb:opacity-100 transition text-blue-400" />
                      {asset && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-1">
                          <span className="text-[10px] text-white font-mono">
                            {formatTime(duration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Clip Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate" title={clip.name}>
                        {clip.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400 font-mono">
                          In: {formatTime(clip.startTime)}
                        </span>
                        <span className="text-xs text-gray-600">→</span>
                        <span className="text-xs text-gray-400 font-mono">
                          Out: {formatTime(clip.endTime)}
                        </span>
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-blue-400 font-mono">
                          {formatTime(duration)}
                        </span>
                      </div>
                      {asset && (
                        <p className="text-[10px] text-gray-600 mt-1 truncate" title={asset.name}>
                          Source: {asset.name}
                        </p>
                      )}
                    </div>

                    {/* ✅ Actions - 添加預覽按鈕 */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onPreviewClip && onPreviewClip(clip)}
                        className="p-2 hover:bg-blue-600/20 rounded text-gray-400 hover:text-blue-400 transition"
                        title="預覽片段"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRemoveClip(clip.id)}
                        className="p-2 hover:bg-red-600/20 rounded text-gray-400 hover:text-red-400 transition"
                        title="移除片段"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2 h-1 bg-[#333] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-600 to-purple-600"
                      style={{ width: `${(duration / (asset?.duration || duration)) * 100}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer - 高度指示器 */}
      <div className="h-8 px-4 border-t border-[#333] flex items-center justify-between text-[10px] text-gray-600 shrink-0">
        <span>Timeline Height: {timelineHeight}px</span>
        <span className="text-gray-700">Drag the line above to resize</span>
      </div>
    </div>
  );
};
