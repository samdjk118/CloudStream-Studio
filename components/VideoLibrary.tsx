import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VideoAsset } from '../types';
import { Upload, Trash2, Video, Loader2, Play, Film, RefreshCw } from 'lucide-react';
import { getThumbnailWithCache, clearThumbnailForVideo } from './thumbnail';

interface VideoLibraryProps {
  videos: VideoAsset[];
  onSelectVideo: (video: VideoAsset) => void;
  onUpload: (file: File) => void;
  onDelete: (video: VideoAsset) => void;
  isLoading: boolean;
  isUploading: boolean;
}

export const VideoLibrary: React.FC<VideoLibraryProps> = ({
  videos,
  onSelectVideo,
  onUpload,
  onDelete,
  isLoading,
  isUploading
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  
  // 用於追蹤哪些影片已經請求過縮圖
  const requestedThumbnails = useRef<Set<string>>(new Set());
  
  // 儲存所有影片卡片的 refs
  const videoCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 生成單個縮圖的函數
  const generateThumbnail = useCallback(async (video: VideoAsset) => {
    // 如果已經有縮圖、正在載入、或已經請求過，跳過
    if (
      thumbnails[video.id] || 
      loadingThumbnails.has(video.id) ||
      requestedThumbnails.current.has(video.id)
    ) {
      return;
    }

    // 標記為已請求
    requestedThumbnails.current.add(video.id);

    // 標記為載入中
    setLoadingThumbnails(prev => new Set(prev).add(video.id));

    try {
      console.log(`📸 請求縮圖: ${video.name}`);
      
      // 使用後端 API 取得縮圖
      const thumbnail = await getThumbnailWithCache(video.url, 1.0, {
        width: 320,
        height: 180
      });
      
      if (thumbnail) {
        setThumbnails(prev => ({
          ...prev,
          [video.id]: thumbnail
        }));
        console.log(`✓ 縮圖完成: ${video.name}`);
      } else {
        console.warn(`⚠️ 縮圖為空: ${video.name}`);
      }
    } catch (error) {
      console.error(`❌ 縮圖失敗 (${video.name}):`, error);
    } finally {
      setLoadingThumbnails(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
    }
  }, [thumbnails, loadingThumbnails]);

  // 重新產生縮圖
  const handleRegenerateThumbnail = useCallback(async (e: React.MouseEvent, video: VideoAsset) => {
    e.stopPropagation();
    
    console.log(`🔄 重新產生縮圖: ${video.name}`);
    
    // 清除快取
    clearThumbnailForVideo(video.url);
    
    // 從 state 中移除
    setThumbnails(prev => {
      const newThumbnails = { ...prev };
      delete newThumbnails[video.id];
      return newThumbnails;
    });
    
    // 從已請求集合中移除
    requestedThumbnails.current.delete(video.id);
    
    // 重新產生
    await generateThumbnail(video);
  }, [generateThumbnail]);

  // 使用 Intersection Observer 實現延遲載入
  useEffect(() => {
    // 如果沒有影片，直接返回
    if (videos.length === 0) return;

    // 建立 Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const videoId = entry.target.getAttribute('data-video-id');
            if (videoId) {
              const video = videos.find(v => v.id === videoId);
              if (video) {
                // 當卡片進入視窗時，生成縮圖
                generateThumbnail(video);
              }
            }
          }
        });
      },
      {
        root: null, // 使用 viewport
        rootMargin: '50px', // 提前 50px 開始載入
        threshold: 0.1 // 當 10% 可見時觸發
      }
    );

    // 觀察所有影片卡片
    videoCardRefs.current.forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    // 清理函數
    return () => {
      observer.disconnect();
    };
  }, [videos, generateThumbnail]);

  // 當影片列表改變時，清理舊的 refs 和快取
  useEffect(() => {
    const currentVideoIds = new Set(videos.map(v => v.id));
    
    // 移除不存在的影片的 refs
    videoCardRefs.current.forEach((_, id) => {
      if (!currentVideoIds.has(id)) {
        videoCardRefs.current.delete(id);
        requestedThumbnails.current.delete(id);
        
        // 清理縮圖
        const video = videos.find(v => v.id === id);
        if (video) {
          clearThumbnailForVideo(video.url);
        }
      }
    });
  }, [videos]);

  const handleVideoClick = (video: VideoAsset) => {
    setSelectedVideoId(video.id);
    onSelectVideo(video);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  const handleDelete = (e: React.MouseEvent, video: VideoAsset) => {
    e.stopPropagation();
    if (window.confirm(`確定要刪除 "${video.name}" 嗎？`)) {
      // 清理縮圖快取
      clearThumbnailForVideo(video.url);
      
      onDelete(video);
      
      if (selectedVideoId === video.id) {
        setSelectedVideoId(null);
      }
      
      // 清理相關資料
      videoCardRefs.current.delete(video.id);
      requestedThumbnails.current.delete(video.id);
      
      // 從 state 中移除縮圖
      setThumbnails(prev => {
        const newThumbnails = { ...prev };
        delete newThumbnails[video.id];
        return newThumbnails;
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const getVideoKey = (video: VideoAsset, index: number): string => {
    if (typeof video.id === 'string') {
      return video.id;
    }
    if (video.name) {
      return `${video.name}-${index}`;
    }
    return `video-${index}`;
  };

  return (
    <div className="w-80 bg-[#1a1a1a] border-r border-[#333] flex flex-col shrink-0">
      {/* Header */}
      <div className="h-14 px-4 border-b border-[#333] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-semibold">Video Library</h2>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={isUploading}
          className="p-2 hover:bg-[#333] rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Upload video"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-gray-400 hover:text-blue-400" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Loading videos...</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center mb-3">
              <Video className="w-8 h-8" />
            </div>
            <p className="text-sm text-center">No videos in bucket</p>
            <p className="text-xs text-gray-600 mt-1 text-center">Upload a video to get started</p>
          </div>
        ) : (
          videos.map((video, index) => {
            const key = getVideoKey(video, index);
            const isSelected = selectedVideoId === video.id;
            const thumbnail = thumbnails[video.id];
            const isLoadingThumbnail = loadingThumbnails.has(video.id);

            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) {
                    videoCardRefs.current.set(video.id, el);
                  }
                }}
                data-video-id={video.id}
                onClick={() => handleVideoClick(video)}
                className={`group relative bg-[#222] rounded-lg overflow-hidden cursor-pointer transition-all hover:bg-[#2a2a2a] ${
                  isSelected ? 'ring-2 ring-blue-500 bg-[#2a2a2a]' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="relative w-full h-40 bg-black flex items-center justify-center overflow-hidden">
                  {isLoadingThumbnail ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
                      <span className="text-xs text-gray-600">Loading preview...</span>
                    </div>
                  ) : thumbnail ? (
                    <>
                      <img
                        src={thumbnail}
                        alt={video.name}
                        className="w-full h-full object-cover"
                      />
                      {/* Play Overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-600">
                      <Film className="w-12 h-12" />
                      <span className="text-xs">Scroll to load</span>
                    </div>
                  )}

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-medium shadow-lg">
                      Playing
                    </div>
                  )}

                  {/* Loading Badge */}
                  {isLoadingThumbnail && (
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full font-medium">
                      Generating...
                    </div>
                  )}

                  {/* Cached Badge */}
                  {thumbnail && !isLoadingThumbnail && (
                    <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-[10px] px-2 py-1 rounded-full font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Cached
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3
                    className="text-sm font-medium text-white truncate mb-1"
                    title={video.name}
                  >
                    {video.name}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{video.size ? formatFileSize(video.size) : 'Unknown size'}</span>
                    {video.contentType && (
                      <span className="text-gray-600">
                        {video.contentType.split('/')[1]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Regenerate Thumbnail Button */}
                  {thumbnail && (
                    <button
                      onClick={(e) => handleRegenerateThumbnail(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-blue-600 rounded transition-colors"
                      title="Regenerate thumbnail"
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                    </button>
                  )}
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDelete(e, video)}
                    className="p-1.5 bg-black/50 hover:bg-red-600 rounded transition-colors"
                    title="Delete video"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {videos.length > 0 && (
        <div className="h-10 px-4 border-t border-[#333] flex items-center justify-between text-xs text-gray-500 shrink-0">
          <span>{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
          <span>
            {videos.reduce((sum, v) => sum + (v.size || 0), 0) > 0
              ? formatFileSize(videos.reduce((sum, v) => sum + (v.size || 0), 0))
              : ''}
          </span>
        </div>
      )}
    </div>
  );
};
