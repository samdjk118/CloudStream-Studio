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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 控制面板高度調整
  const [controlsHeight, setControlsHeight] = useState(192); // 預設 48 * 4 = 192px (h-48)
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  
  // Clipping state
  const [startPoint, setStartPoint] = useState(0);
  const [endPoint, setEndPoint] = useState(0);

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
      
      const deltaY = resizeStartY.current - e.clientY; // 向上拖是正值
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

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
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
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    console.log('Video metadata loaded');
    setIsLoading(false);
    
    if (videoRef.current) {
      const dur = videoRef.current.duration;
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

  const handleCreateClip = () => {
    if (!video) return;
    const newClip: Clip = {
      id: crypto.randomUUID(),
      sourceVideoId: video.id,
      name: `${video.name} (Clip ${Math.floor(startPoint)}s-${Math.floor(endPoint)}s)`,
      startTime: startPoint,
      endTime: endPoint,
    };
    onAddClip(newClip);
  };

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '0:00';
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      {/* Video Area - 動態高度 */}
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
          onEnded={() => setIsPlaying(false)}
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

      {/* Resize Handle - 可拖曳的分隔線 */}
      <div
        className={`h-1 bg-[#333] hover:bg-blue-500 cursor-row-resize flex items-center justify-center group transition-colors relative ${
          isResizing ? 'bg-blue-500' : ''
        }`}
        onMouseDown={handleResizeStart}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <GripHorizontal className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transition-colors" />
        </div>
        {/* 擴大可點擊區域 */}
        <div className="absolute inset-x-0 -top-2 -bottom-2" />
      </div>

      {/* Controls Area - 動態高度 */}
      <div 
        className="bg-[#1e1e1e] border-t border-[#333] p-4 flex flex-col gap-4 shrink-0 overflow-y-auto"
        style={{ height: `${controlsHeight}px` }}
      >
        
        {/* Scrubber & Clipping Markers */}
        <div className="relative h-12 flex items-center shrink-0">
            {/* Background Track */}
            <div className="absolute left-0 right-0 h-2 bg-[#333] rounded"></div>

            {/* Selected Range Highlight */}
            {duration > 0 && (
              <div 
                className="absolute h-2 bg-blue-900/50 rounded"
                style={{
                  left: `${(startPoint / duration) * 100}%`,
                  width: `${((endPoint - startPoint) / duration) * 100}%`
                }}
              ></div>
            )}

            {/* Playhead */}
            {duration > 0 && (
              <div 
                className="absolute w-0.5 h-8 bg-white z-20 pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rotate-45"></div>
              </div>
            )}

            {/* Scrubber Input */}
            <input 
              type="range" 
              min={0} 
              max={duration || 100} 
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if(videoRef.current) videoRef.current.currentTime = val;
                setCurrentTime(val);
              }}
              disabled={!duration}
              className="absolute w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
            />

            {/* Start Marker */}
            {duration > 0 && (
              <div 
                className="absolute w-4 h-8 bg-blue-500 rounded-l cursor-ew-resize z-20 flex items-center justify-center group"
                style={{ left: `${(startPoint / duration) * 100}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-0.5 h-4 bg-white/50"></div>
                <div className="absolute -top-8 bg-blue-600 text-white text-[10px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                  In: {formatTime(startPoint)}
                </div>
              </div>
            )}
        </div>

        {/* Precision Controls */}
        <div className="flex justify-between items-end shrink-0">
          <div className="flex gap-6 items-center">
            {/* Playback */}
            <button 
              onClick={togglePlay}
              disabled={!!error || isLoading}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition disabled:bg-gray-600 disabled:cursor-not-allowed shrink-0"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <div className="text-sm font-mono text-gray-400 shrink-0">
              {formatTime(currentTime)} <span className="text-gray-600">/</span> {formatTime(duration)}
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-2 ml-4 group relative shrink-0">
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
          </div>

          {/* Clipping Actions */}
          <div className="flex gap-4 items-center bg-[#111] p-2 rounded-lg border border-[#333] shrink-0">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Start</label>
              <input 
                type="number" 
                value={Math.floor(startPoint * 10) / 10} 
                onChange={(e) => setStartPoint(Math.min(parseFloat(e.target.value) || 0, endPoint))}
                disabled={!duration}
                className="w-16 bg-[#222] border border-[#444] text-white text-xs p-1 rounded focus:border-blue-500 outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">End</label>
              <input 
                type="number" 
                value={Math.floor(endPoint * 10) / 10} 
                onChange={(e) => setEndPoint(Math.max(parseFloat(e.target.value) || 0, startPoint))}
                disabled={!duration}
                className="w-16 bg-[#222] border border-[#444] text-white text-xs p-1 rounded focus:border-blue-500 outline-none disabled:opacity-50"
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

        {/* 高度指示器（可選） */}
        <div className="text-[10px] text-gray-600 text-center shrink-0">
          Controls Height: {controlsHeight}px (Drag the line above to resize)
        </div>
      </div>
    </div>
  );
};
