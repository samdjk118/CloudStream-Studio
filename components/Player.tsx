// frontend/src/components/Player.tsx

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VideoAsset, Clip } from '../types';
import { Play, Pause, Scissors, Gauge, AlertCircle, GripHorizontal } from 'lucide-react';

interface PlayerProps {
  video: VideoAsset | null;
  onAddClip: (clip: Clip) => void;
  autoPlay?: boolean;
}

export const Player: React.FC<PlayerProps> = ({ video, onAddClip, autoPlay = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 控制面板高度調整
  const [controlsHeight, setControlsHeight] = useState(192);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  
  // Clipping state - ✅ 使用 3 位小數精度
  const [startPoint, setStartPoint] = useState(0);
  const [endPoint, setEndPoint] = useState(0);
  
  // 拖曳狀態
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null);

  // ✅ 精度工具函數
  const roundToPrecision = (value: number, precision: number = 3): number => {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
  };

  // ✅ 修改時間格式函數 - 支持毫秒（3位小數）
  const formatTime = (t: number): string => {
    if (!isFinite(t)) return '0:00.000';
    
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.round((t % 1) * 1000); // 毫秒（0-999）
    
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // ✅ 將 分:秒.毫秒 轉換回秒數（3位小數）
  const parseTimeString = (timeStr: string): number => {
    try {
      const parts = timeStr.split(':');
      if (parts.length !== 2) return 0;
      
      const mins = parseInt(parts[0]) || 0;
      const secsParts = parts[1].split('.');
      const secs = parseInt(secsParts[0]) || 0;
      const ms = secsParts[1] ? parseInt(secsParts[1].padEnd(3, '0').slice(0, 3)) : 0;
      
      const totalSeconds = mins * 60 + secs + ms / 1000;
      return roundToPrecision(totalSeconds, 3);
    } catch {
      return 0;
    }
  };

  // Reset state when video changes
  useEffect(() => {
    if (video) {
      console.log('Loading video:', video);
      setError(null);
      setIsLoading(true);
      setIsPlaying(false);
      setCurrentTime(0);
      setStartPoint(0);
      setEndPoint(video.duration || 0);
      setPlaybackRate(1);
      
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = 1;
        videoRef.current.load();
      }
    }
  }, [video]);

  // 當 startPoint 改變時，將播放頭移到 start 位置
  useEffect(() => {
    if (videoRef.current && !isDraggingStart && !isDraggingEnd && !isDraggingScrubber) {
      videoRef.current.currentTime = startPoint;
      setCurrentTime(startPoint);
    }
  }, [startPoint]);

  // 監控播放進度，確保只在藍色區間內播放
  useEffect(() => {
    if (!videoRef.current || !isPlaying) return;

    const checkPlaybackBounds = () => {
      if (!videoRef.current) return;
      
      const current = videoRef.current.currentTime;
      
      // 如果播放超出 end 位置，停止播放並回到 start
      if (current >= endPoint) {
        videoRef.current.pause();
        videoRef.current.currentTime = startPoint;
        setCurrentTime(startPoint);
        setIsPlaying(false);
      }
      
      // 如果播放位置在 start 之前，跳到 start
      if (current < startPoint) {
        videoRef.current.currentTime = startPoint;
        setCurrentTime(startPoint);
      }
    };

    const intervalId = setInterval(checkPlaybackBounds, 50);

    return () => clearInterval(intervalId);
  }, [isPlaying, startPoint, endPoint]);

  // 處理拖曳調整高度
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = controlsHeight;
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = Math.max(150, Math.min(600, resizeStartHeight.current + deltaY));
      setControlsHeight(newHeight);
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

  // 處理時間軸標記拖曳
  useEffect(() => {
    const handleMarkerDrag = (e: MouseEvent) => {
      if (!scrubberRef.current || (!isDraggingStart && !isDraggingEnd && !isDraggingScrubber)) return;
      
      const rect = scrubberRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const newTime = roundToPrecision(percentage * duration, 3); // ✅ 保留 3 位小數
      
      if (isDraggingStart) {
        const newStart = Math.min(newTime, endPoint - 0.001); // ✅ 最小間隔 1 毫秒
        setStartPoint(roundToPrecision(newStart, 3));
        // 拖曳 start 時，同步移動播放頭
        if (videoRef.current) {
          videoRef.current.currentTime = newStart;
          setCurrentTime(newStart);
        }
      } else if (isDraggingEnd) {
        const newEnd = Math.max(newTime, startPoint + 0.001); // ✅ 最小間隔 1 毫秒
        setEndPoint(roundToPrecision(newEnd, 3));
      } else if (isDraggingScrubber) {
        // 拖曳播放指針 - 限制在藍色區間內
        const clampedTime = Math.max(startPoint, Math.min(newTime, endPoint));
        if (videoRef.current) {
          videoRef.current.currentTime = clampedTime;
          setCurrentTime(clampedTime);
        }
      }
    };

    const handleMarkerDragEnd = (e: MouseEvent) => {
      // 檢查 Start Marker 是點擊還是拖曳
      if (dragStartPosition && isDraggingStart) {
        const deltaX = Math.abs(e.clientX - dragStartPosition.x);
        const deltaY = Math.abs(e.clientY - dragStartPosition.y);
        
        // 如果移動距離很小（< 5px），視為點擊
        if (deltaX < 5 && deltaY < 5 && videoRef.current) {
          // 點擊行為：跳轉到 Start 位置
          videoRef.current.currentTime = startPoint;
          setCurrentTime(startPoint);
          console.log('Clicked Start Marker - Jump to:', startPoint.toFixed(3));
        } else {
          console.log('Dragged Start Marker - New position:', startPoint.toFixed(3));
        }
      }
      
      // 重置狀態
      setIsDraggingStart(false);
      setIsDraggingEnd(false);
      setIsDraggingScrubber(false);
      setDragStartPosition(null);
    };

    if (isDraggingStart || isDraggingEnd || isDraggingScrubber) {
      document.addEventListener('mousemove', handleMarkerDrag);
      document.addEventListener('mouseup', handleMarkerDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMarkerDrag);
        document.removeEventListener('mouseup', handleMarkerDragEnd);
      };
    }
  }, [isDraggingStart, isDraggingEnd, isDraggingScrubber, duration, startPoint, endPoint, dragStartPosition, currentTime]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // 播放前確保在藍色區間內
      const current = videoRef.current.currentTime;
      if (current < startPoint || current >= endPoint) {
        videoRef.current.currentTime = startPoint;
        setCurrentTime(startPoint);
      }
      
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.error('Play error:', err);
          setError('Failed to play video: ' + err.message);
          setIsPlaying(false);
        });
    }
  }, [isPlaying, startPoint, endPoint]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(roundToPrecision(videoRef.current.currentTime, 3)); // ✅ 保留 3 位小數
    }
  };

  const handleLoadedMetadata = () => {
    console.log('Video metadata loaded');
    setIsLoading(false);
    
    if (videoRef.current) {
      const dur = roundToPrecision(videoRef.current.duration, 3); // ✅ 保留 3 位小數
      setDuration(dur);
      if (endPoint === 0 || endPoint > dur) {
        setEndPoint(dur);
      }
      
      if (autoPlay) {
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(console.error);
      }
    }
  };

  const handleCanPlay = () => {
    console.log('Video can play');
    setIsLoading(false);
    setError(null);
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video error:', e);
    setIsLoading(false);
    
    const videoElement = e.currentTarget;
    let errorMessage = 'Failed to load video';
    
    if (videoElement.error) {
      switch (videoElement.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video loading aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error while loading video';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decoding failed';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported or source not found';
          break;
        default:
          errorMessage = 'Unknown video error';
      }
      
      if (videoElement.error.message) {
        errorMessage += ': ' + videoElement.error.message;
      }
    }
    
    setError(errorMessage);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rate = parseFloat(e.target.value);
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // ✅ 創建剪輯時使用 3 位小數
  const handleCreateClip = () => {
    if (!video) return;
    
    const clipDuration = roundToPrecision(endPoint - startPoint, 3);
    
    const newClip: Clip = {
      id: crypto.randomUUID(),
      sourceVideoId: video.id,
      name: `${video.name} (${formatTime(startPoint)}-${formatTime(endPoint)})`,
      startTime: roundToPrecision(startPoint, 3), // ✅ 3 位小數
      endTime: roundToPrecision(endPoint, 3),     // ✅ 3 位小數
    };
    
    console.log('📌 創建剪輯:', {
      name: newClip.name,
      startTime: newClip.startTime,
      endTime: newClip.endTime,
      duration: clipDuration
    });
    
    onAddClip(newClip);
  };

  // 處理直接點擊時間軸
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!scrubberRef.current || !videoRef.current || !duration) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const clickedTime = roundToPrecision(percentage * duration, 3); // ✅ 3 位小數
    
    // 限制在藍色區間內
    const clampedTime = Math.max(startPoint, Math.min(clickedTime, endPoint));
    
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    
    console.log('Timeline clicked:', {
      clickedTime: clickedTime.toFixed(3),
      clampedTime: clampedTime.toFixed(3)
    });
  };

  if (!video) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black text-gray-500 flex-col min-h-0">
        <div className="w-16 h-16 border-2 border-gray-700 rounded-full flex items-center justify-center mb-4">
          <Play className="w-8 h-8 ml-1" />
        </div>
        <p>Select a video from the bucket to start editing</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-black overflow-hidden relative min-h-0">
      {/* Video Area */}
      <div 
        className="flex items-center justify-center relative bg-black group"
        style={{ height: `calc(100% - ${controlsHeight}px)` }}
      >
        <video
          ref={videoRef}
          className="max-h-full max-w-full outline-none"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={handleCanPlay}
          onError={handleError}
          onEnded={() => {
            setIsPlaying(false);
            if (videoRef.current) {
              videoRef.current.currentTime = startPoint;
              setCurrentTime(startPoint);
            }
          }}
          onClick={togglePlay}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
        >
          <source src={video.url} type="video/mp4" />
          <source src={video.url} type="video/webm" />
          Your browser does not support the video tag.
        </video>
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white text-sm">Loading video...</p>
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8">
            <div className="max-w-md bg-red-900/30 border border-red-500 rounded-lg p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-white text-lg font-semibold mb-2">Video Error</h3>
              <p className="text-red-200 text-sm mb-4">{error}</p>
              <div className="text-xs text-gray-400 font-mono break-all mb-4">
                Source: {video.url}
              </div>
              <button
                onClick={() => {
                  setError(null);
                  if (videoRef.current) {
                    videoRef.current.load();
                  }
                }}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        
        {/* Play/Pause Overlay */}
        {!error && !isLoading && (
          <div 
            className={`absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer transition-opacity duration-200 ${
              isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            }`}
            onClick={togglePlay}
          >
            <div className="w-16 h-16 bg-white/10 backdrop-blur rounded-full flex items-center justify-center hover:scale-105 transition hover:bg-white/20">
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white fill-current" />
              ) : (
                <Play className="w-8 h-8 ml-1 text-white fill-current" />
              )}
            </div>
          </div>
        )}
      </div>

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

      {/* Controls Area */}
      <div 
        className="bg-[#1e1e1e] border-t border-[#333] p-4 flex flex-col gap-4 shrink-0 overflow-y-auto"
        style={{ height: `${controlsHeight}px` }}
      >
        
        {/* Scrubber & Clipping Markers */}
        <div 
          ref={scrubberRef} 
          className="relative h-12 flex items-center shrink-0"
          onMouseDown={(e) => {
            // 只有點擊背景軌道時才觸發
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('timeline-track')) {
              handleTimelineClick(e);
            }
          }}
        >
            {/* Background Track */}
            <div className="timeline-track absolute left-0 right-0 h-2 bg-[#333] rounded pointer-events-auto"></div>

            {/* Selected Range Highlight */}
            {duration > 0 && (
              <div 
                className="absolute h-2 bg-blue-600/60 rounded cursor-pointer pointer-events-auto"
                style={{
                  left: `${(startPoint / duration) * 100}%`,
                  width: `${((endPoint - startPoint) / duration) * 100}%`
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleTimelineClick(e);
                }}
              ></div>
            )}

            {/* Playhead */}
            {duration > 0 && currentTime >= startPoint && currentTime <= endPoint && (
              <div 
                className={`absolute w-0.5 h-8 bg-white z-20 cursor-ew-resize group/playhead transition-all ${
                  isDraggingScrubber ? 'w-1 bg-blue-400' : ''
                }`}
                style={{ 
                  left: `${(currentTime / duration) * 100}%`
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  
                  setDragStartPosition({ x: e.clientX, y: e.clientY });
                  setIsDraggingScrubber(true);
                  
                  if (isPlaying && videoRef.current) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                  }
                }}
              >
                <div className={`absolute -top-1 -left-1.5 w-3 h-3 bg-white rotate-45 cursor-ew-resize hover:scale-125 transition-all ${
                  isDraggingScrubber ? 'scale-150 bg-blue-400' : ''
                }`}></div>
                
                {/* ✅ 顯示毫秒精度 */}
                <div className={`absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none transition-all ${
                  isDraggingScrubber 
                    ? 'bg-blue-500 text-white opacity-100 scale-110' 
                    : 'bg-white/90 text-black opacity-0 group-hover/playhead:opacity-100'
                }`}>
                  {formatTime(currentTime)}
                </div>
                
                <div className="absolute -left-3 -right-3 -top-2 -bottom-2 cursor-ew-resize"></div>
              </div>
            )}

            {/* Start Marker */}
            {duration > 0 && (
              <div 
                className="absolute w-4 h-8 bg-blue-500 rounded-l cursor-ew-resize z-30 flex items-center justify-center group hover:bg-blue-400 active:bg-blue-600 transition-colors"
                style={{ 
                  left: `${(startPoint / duration) * 100}%`,
                  transform: 'translateX(-50%)'
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  
                  setDragStartPosition({ x: e.clientX, y: e.clientY });
                  setIsDraggingStart(true);
                  
                  if (isPlaying && videoRef.current) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                  }
                }}
              >
                <div className="w-0.5 h-4 bg-white/50"></div>
                {/* ✅ 顯示毫秒精度 */}
                <div className="absolute -top-8 bg-blue-600 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none shadow-lg">
                  Start: {formatTime(startPoint)} • Click to jump
                </div>
              </div>
            )}

            {/* End Marker */}
            {duration > 0 && (
              <div 
                className="absolute w-4 h-8 bg-blue-500 rounded-r cursor-ew-resize z-30 flex items-center justify-center group hover:bg-blue-400 active:bg-blue-600 transition-colors"
                style={{ 
                  left: `${(endPoint / duration) * 100}%`,
                  transform: 'translateX(-50%)'
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsDraggingEnd(true);
                  if (isPlaying && videoRef.current) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                  }
                }}
              >
                <div className="w-0.5 h-4 bg-white/50"></div>
                {/* ✅ 顯示毫秒精度 */}
                <div className="absolute -top-8 bg-blue-600 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none shadow-lg">
                  End: {formatTime(endPoint)}
                </div>
              </div>
            )}
        </div>

        {/* Precision Controls */}
        <div className="flex justify-between items-start shrink-0 gap-4">
          {/* 左側：播放控制區 */}
          <div className="flex flex-col gap-3">
            {/* 第一行：播放按鈕 + 時間 */}
            <div className="flex gap-4 items-center">
              <button 
                onClick={togglePlay}
                disabled={!!error || isLoading}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition disabled:bg-gray-600 disabled:cursor-not-allowed shrink-0"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              
              {/* ✅ 顯示毫秒精度 */}
              <div className="text-sm font-mono text-gray-400 shrink-0">
                {formatTime(currentTime)} <span className="text-gray-600">/</span> {formatTime(duration)}
              </div>
            </div>

            {/* 第二行：速度控制 + 區間資訊 */}
            <div className="flex gap-4 items-center ml-14">
              {/* Speed Control */}
              <div className="flex items-center gap-2 group relative shrink-0">
                <Gauge className="w-4 h-4 text-gray-500" />
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1" 
                  value={playbackRate}
                  onChange={handleSpeedChange}
                  disabled={!!error || isLoading}
                  className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="text-xs text-gray-400 font-mono w-8 text-right">{playbackRate.toFixed(1)}x</span>
              </div>

              {/* ✅ 顯示毫秒精度的區間資訊 */}
              <div className="text-xs font-mono text-blue-400 bg-blue-900/20 px-2 py-1 rounded border border-blue-500/30 shrink-0">
                Clip: {formatTime(startPoint)} → {formatTime(endPoint)} ({formatTime(endPoint - startPoint)})
              </div>
            </div>
          </div>

          {/* 右側：Clipping Actions */}
          <div className="flex gap-4 items-center bg-[#111] p-2 rounded-lg border border-[#333] shrink-0">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Start</label>
              {/* ✅ 輸入框支持毫秒 */}
              <input 
                type="text" 
                value={formatTime(startPoint)} 
                onChange={(e) => {
                  const newTime = parseTimeString(e.target.value);
                  setStartPoint(Math.min(newTime, endPoint - 0.001));
                }}
                placeholder="0:00.000"
                disabled={!duration}
                className="w-24 bg-[#222] border border-[#444] text-white text-xs p-1 rounded focus:border-blue-500 outline-none disabled:opacity-50 text-center font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">End</label>
              {/* ✅ 輸入框支持毫秒 */}
              <input 
                type="text" 
                value={formatTime(endPoint)} 
                onChange={(e) => {
                  const newTime = parseTimeString(e.target.value);
                  setEndPoint(Math.max(newTime, startPoint + 0.001));
                }}
                placeholder="0:00.000"
                disabled={!duration}
                className="w-24 bg-[#222] border border-[#444] text-white text-xs p-1 rounded focus:border-blue-500 outline-none disabled:opacity-50 text-center font-mono"
              />
            </div>
            <div className="h-8 w-px bg-[#333] mx-2"></div>
            <button 
              onClick={handleCreateClip}
              disabled={!duration || startPoint >= endPoint}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <Scissors className="w-4 h-4" />
              Clip & Add
            </button>
          </div>
        </div>

        {/* 高度指示器 */}
        <div className="text-[10px] text-gray-600 text-center shrink-0">
          Controls Height: {controlsHeight}px (Drag the line above to resize)
        </div>
      </div>
    </div>
  );
};
