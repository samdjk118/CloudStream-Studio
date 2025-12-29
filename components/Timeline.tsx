// src/components/Timeline.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const MIN_HEIGHT = 150;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 240;

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
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const lastSavedHeight = useRef(DEFAULT_HEIGHT);

  // 合併任務狀態
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizeTaskStatus, setSynthesizeTaskStatus] = useState<TaskStatus | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeOutputName, setMergeOutputName] = useState('');

  // ==================== 高度調整 ====================

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = timelineHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [timelineHeight]);

  useEffect(() => {
    if (!isResizing) return;

    const handleResizeMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartHeight.current + deltaY));
      setTimelineHeight(newHeight);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  // 載入高度偏好
  useEffect(() => {
    const savedHeight = localStorage.getItem('timelineHeight');
    if (savedHeight) {
      const height = parseInt(savedHeight);
      if (height >= MIN_HEIGHT && height <= MAX_HEIGHT) {
        setTimelineHeight(height);
        lastSavedHeight.current = height;
      }
    }
  }, []);

  // 儲存高度偏好
  useEffect(() => {
    if (!isResizing && Math.abs(timelineHeight - lastSavedHeight.current) > 1) {
      localStorage.setItem('timelineHeight', timelineHeight.toString());
      lastSavedHeight.current = timelineHeight;
    }
  }, [timelineHeight, isResizing]);

  // ==================== 工具函數 ====================

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }, []);

  const totalDuration = clips.reduce((sum, clip) => sum + (clip.endTime - clip.startTime), 0);

  // ==================== 合併處理 ====================

  const handleSynthesizeClick = useCallback(() => {
    if (clips.length === 0) {
      alert('請先添加至少一個片段');
      return;
    }

    setShowMergeDialog(true);
    setMergeOutputName(`合併影片_${Date.now()}`);
  }, [clips.length]);

  const handleConfirmMerge = useCallback(async () => {
    if (!mergeOutputName.trim()) {
      alert('請輸入輸出檔名');
      return;
    }

    setShowMergeDialog(false);
    setIsSynthesizing(true);
    setSynthesizeTaskStatus(null);

    try {
      const mergeRequest = {
        clips: clips.map(clip => {
          const asset = assets[clip.sourceVideoId];
          const gcsPath = (asset as any).fullPath || asset.name;
          
          return {
            source_video: gcsPath,
            start_time: parseFloat(clip.startTime.toFixed(3)),
            end_time: parseFloat(clip.endTime.toFixed(3)),
          };
        }),
        output_name: mergeOutputName.trim()
      };

      console.log('🔗 開始合併:', mergeRequest);

      const response = await mergeVideos(mergeRequest);
      console.log('✅ 合併任務已建立:', response.task_id);

      const finalStatus = await pollTaskStatus(
        response.task_id,
        (status) => {
          console.log(`📊 合併進度: ${(status.progress * 100).toFixed(1)}%`);
          setSynthesizeTaskStatus(status);
        }
      );

      if (finalStatus.status === 'completed') {
        console.log('✅ 合併完成:', finalStatus.output_path);
        
        const metadata = finalStatus.metadata;
        
        alert(`✅ 合併完成！\n\n` +
              `檔名: ${mergeOutputName}\n` +
              `片段數: ${metadata?.total_clips || clips.length}\n` +
              `總時長: ${metadata?.merged_duration?.toFixed(3) || totalDuration.toFixed(3)}s\n` +
              `誤差: ${metadata?.duration_error_ms || 0}ms\n` +
              `精度: ${metadata?.precision_level || 'good'}`);

        // 清空片段
        console.log('🗑️ 清空時間軸片段');
        const clipIds = clips.map(clip => clip.id);
        setTimeout(() => {
          clipIds.forEach(id => onRemoveClip(id));
        }, 0);

        // 通知父組件選取新影片
        if (finalStatus.output_path && onSynthesizeComplete) {
          console.log('📹 選取合成影片:', finalStatus.output_path);
          setTimeout(() => {
            onSynthesizeComplete(finalStatus.output_path);
          }, 100);
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
  }, [clips, assets, mergeOutputName, totalDuration, onRemoveClip, onSynthesizeComplete]);

  // ==================== 渲染 ====================

  return (
    <div 
      ref={containerRef}
      className="bg-[#1a1a1a] border-t border-[#333] flex flex-col shrink-0 relative"
      style={{ height: `${timelineHeight}px` }}
    >
      {/* ✅ 拖動調整高度的握把 */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 cursor-ns-resize group hover:bg-blue-500 transition-colors ${
          isResizing ? 'bg-blue-500' : 'bg-transparent'
        }`}
        onMouseDown={handleResizeStart}
      >
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className={`flex items-center justify-center w-16 h-6 rounded-full transition-all ${
            isResizing 
              ? 'bg-blue-600 shadow-lg scale-110' 
              : 'bg-[#333] group-hover:bg-blue-600 group-hover:shadow-lg'
          }`}>
            <GripHorizontal className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="h-12 px-4 border-b border-[#333] flex items-center justify-between shrink-0 mt-1">
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
          onClick={handleSynthesizeClick}
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

      {/* Clips Container */}
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
                  <div className="absolute -left-2 -top-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg z-10">
                    {index + 1}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* 可點擊的縮圖 */}
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

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onPreviewClip && (
                        <button
                          onClick={() => onPreviewClip(clip)}
                          className="p-2 hover:bg-blue-600/20 rounded text-gray-400 hover:text-blue-400 transition"
                          title="預覽片段"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
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

      {/* Footer */}
      <div className="h-8 px-4 border-t border-[#333] flex items-center justify-between text-[10px] text-gray-600 shrink-0">
        <span>Timeline Height: {timelineHeight}px</span>
        <span className="text-gray-700">Drag the line above to resize</span>
      </div>

      {/* ✅ 合併對話框 */}
      {showMergeDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              合併影片
            </h3>
            
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">片段數量:</span>
                <span className="text-white font-medium">{clips.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">總時長:</span>
                <span className="text-white font-mono">{formatTime(totalDuration)}</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                輸出檔名:
              </label>
              <input
                type="text"
                value={mergeOutputName}
                onChange={(e) => setMergeOutputName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleConfirmMerge()}
                placeholder="請輸入檔名"
                className="w-full px-3 py-2 bg-[#222] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                自動添加 .mp4 副檔名
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmMerge}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition font-medium"
              >
                開始合併
              </button>
              <button
                onClick={() => setShowMergeDialog(false)}
                className="flex-1 px-4 py-2 bg-[#333] hover:bg-[#444] text-white rounded-lg transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
