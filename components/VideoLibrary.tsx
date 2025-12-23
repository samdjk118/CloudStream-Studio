import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { VideoAsset } from '../types';
import { Upload, Trash2, Video, Loader2, Play, Film, RefreshCw, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { getThumbnailWithCache, clearThumbnailForVideo } from './thumbnail';

interface VideoLibraryProps {
  videos: VideoAsset[];
  onSelectVideo: (video: VideoAsset) => void;
  onUpload: (file: File) => void;
  onDelete: (video: VideoAsset) => void;
  isLoading: boolean;
  isUploading: boolean;
  videoStatuses?: Record<string, string>; // ✅ 影片狀態（準備中/就緒）
}

const ITEMS_PER_PAGE = 12; // 每頁顯示 12 個影片
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const VideoLibrary: React.FC<VideoLibraryProps> = ({
  videos,
  onSelectVideo,
  onUpload,
  onDelete,
  isLoading,
  isUploading,
  videoStatuses = {}
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [optimizingVideos, setOptimizingVideos] = useState<Set<string>>(new Set());

  // 追蹤已請求縮圖的影片
  const requestedThumbnails = useRef<Set<string>>(new Set());
  
  // 儲存影片卡片的 refs
  const videoCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ==================== 分頁計算 ====================
  const totalPages = Math.ceil(videos.length / ITEMS_PER_PAGE);
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return videos.slice(startIndex, endIndex);
  }, [videos, currentPage]);

  // 當影片列表改變時，調整頁碼
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [videos.length, totalPages, currentPage]);

  // ==================== 縮圖生成 ====================
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
    setLoadingThumbnails(prev => new Set(prev).add(video.id));

    try {
      console.log(`📸 請求縮圖: ${video.name}`);
      
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
    
    clearThumbnailForVideo(video.url);
    
    setThumbnails(prev => {
      const newThumbnails = { ...prev };
      delete newThumbnails[video.id];
      return newThumbnails;
    });
    
    requestedThumbnails.current.delete(video.id);
    await generateThumbnail(video);
  }, [generateThumbnail]);

  // ==================== Intersection Observer ====================
  useEffect(() => {
    if (paginatedVideos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const videoId = entry.target.getAttribute('data-video-id');
            if (videoId) {
              const video = paginatedVideos.find(v => v.id === videoId);
              if (video) {
                generateThumbnail(video);
              }
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    videoCardRefs.current.forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [paginatedVideos, generateThumbnail]);

  // ==================== 清理舊資料 ====================
  useEffect(() => {
    const currentVideoIds = new Set(videos.map(v => v.id));
    
    videoCardRefs.current.forEach((_, id) => {
      if (!currentVideoIds.has(id)) {
        videoCardRefs.current.delete(id);
        requestedThumbnails.current.delete(id);
        
        const video = videos.find(v => v.id === id);
        if (video) {
          clearThumbnailForVideo(video.url);
        }
      }
    });
  }, [videos]);

  // ==================== 影片最佳化 ====================
  const handleOptimize = async (e: React.MouseEvent, video: VideoAsset) => {
    e.stopPropagation();
    
    try {
      const videoPath = (video as any).fullPath || video.name;
      
      if (!window.confirm(`最佳化 "${video.name}"？\n\n這將加速影片載入，但需要一些時間處理。`)) {
        return;
      }
      
      console.log('🔧 開始最佳化:', videoPath);
      
      setOptimizingVideos(prev => new Set(prev).add(video.id));
      
      const response = await fetch(
        `${API_BASE}/api/videos/optimize/${encodeURIComponent(videoPath)}`,
        { method: 'POST' }
      );
      
      if (!response.ok) {
        throw new Error('最佳化失敗');
      }
      
      const result = await response.json();
      console.log('✅ 任務已創建:', result.task_id);
      
      alert('最佳化任務已啟動！\n完成後影片載入速度會更快。');
      
      // 輪詢任務狀態
      pollOptimizeTask(result.task_id, video.id);
      
    } catch (error) {
      console.error('❌ 最佳化失敗:', error);
      alert('最佳化失敗');
      setOptimizingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
    }
  };

  const pollOptimizeTask = async (taskId: string, videoId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`);
        const task = await response.json();
        
        console.log(`📊 最佳化進度: ${(task.progress * 100).toFixed(0)}%`);
        
        if (task.status === 'completed') {
          alert('✅ 最佳化完成！影片現在載入更快了。');
          setOptimizingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(videoId);
            return newSet;
          });
        } else if (task.status === 'failed') {
          alert(`❌ 最佳化失敗: ${task.error}`);
          setOptimizingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(videoId);
            return newSet;
          });
        } else {
          setTimeout(checkStatus, 2000);
        }
      } catch (error) {
        console.error('查詢狀態失敗:', error);
        setOptimizingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(videoId);
          return newSet;
        });
      }
    };
    
    checkStatus();
  };

  // ==================== 事件處理 ====================
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
    
    // 檢查是否為 HLS 檔案
    const pathToDelete = (video as any).fullPath || video.name;
    if (pathToDelete.includes('/hls/') || 
        pathToDelete.endsWith('.m3u8') || 
        pathToDelete.endsWith('.ts')) {
      alert('⚠️ 無法刪除 HLS 檔案。請刪除原始影片。');
      return;
    }
    
    if (window.confirm(`確定要刪除 "${video.name}" 嗎？`)) {
      clearThumbnailForVideo(video.url);
      onDelete(video);
      
      if (selectedVideoId === video.id) {
        setSelectedVideoId(null);
      }
      
      videoCardRefs.current.delete(video.id);
      requestedThumbnails.current.delete(video.id);
      
      setThumbnails(prev => {
        const newThumbnails = { ...prev };
        delete newThumbnails[video.id];
        return newThumbnails;
      });
    }
  };

  // ==================== 工具函數 ====================
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

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    document.querySelector('.video-list-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ==================== 渲染 ====================
  return (
    <div className="w-80 bg-[#1a1a1a] border-r border-[#333] flex flex-col shrink-0">
      {/* Header */}
      <div className="h-14 px-4 border-b border-[#333] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-semibold">影片庫</h2>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={isUploading}
          className="p-2 hover:bg-[#333] rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="上傳影片"
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

      {/* 分頁資訊 */}
      {videos.length > 0 && !isLoading && (
        <div className="px-4 py-2 border-b border-[#333] flex items-center justify-between text-xs text-gray-400 shrink-0">
          <span>
            顯示 {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, videos.length)} / 共 {videos.length} 個
          </span>
          <span>第 {currentPage} / {totalPages} 頁</span>
        </div>
      )}

      {/* Video List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 video-list-container">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">載入影片中...</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center mb-3">
              <Video className="w-8 h-8" />
            </div>
            <p className="text-sm text-center">儲存桶中沒有影片</p>
            <p className="text-xs text-gray-600 mt-1 text-center">上傳影片以開始使用</p>
          </div>
        ) : (
          paginatedVideos.map((video, index) => {
            const key = getVideoKey(video, index);
            const isSelected = selectedVideoId === video.id;
            const thumbnail = thumbnails[video.id];
            const isLoadingThumbnail = loadingThumbnails.has(video.id);
            const videoStatus = videoStatuses[video.id];
            const isOptimizing = optimizingVideos.has(video.id);

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
                      <span className="text-xs text-gray-600">載入預覽中...</span>
                    </div>
                  ) : thumbnail ? (
                    <>
                      <img
                        src={thumbnail}
                        alt={video.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-600">
                      <Film className="w-12 h-12" />
                      <span className="text-xs">滾動以載入</span>
                    </div>
                  )}

                  {/* Status Badges */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-medium shadow-lg">
                      播放中
                    </div>
                  )}

                  {isOptimizing && (
                    <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full font-medium shadow-lg flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      最佳化中
                    </div>
                  )}

                  {videoStatus === 'ready' && !isOptimizing && (
                    <div className="absolute top-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded-full font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      ⚡ 已最佳化
                    </div>
                  )}

                  {isLoadingThumbnail && (
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full font-medium">
                      生成中...
                    </div>
                  )}

                  {thumbnail && !isLoadingThumbnail && (
                    <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-[10px] px-2 py-1 rounded-full font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      已快取
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
                    <span>{video.size ? formatFileSize(video.size) : '未知大小'}</span>
                    {video.contentType && (
                      <span className="text-gray-600">
                        {video.contentType.split('/')[1]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Optimize Button */}
                  {videoStatus !== 'ready' && !isOptimizing && (
                    <button
                      onClick={(e) => handleOptimize(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-green-600 rounded transition-colors"
                      title="最佳化影片載入"
                    >
                      <Zap className="w-4 h-4 text-white" />
                    </button>
                  )}
                  
                  {/* Regenerate Thumbnail */}
                  {thumbnail && (
                    <button
                      onClick={(e) => handleRegenerateThumbnail(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-blue-600 rounded transition-colors"
                      title="重新產生縮圖"
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                    </button>
                  )}
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDelete(e, video)}
                    className="p-1.5 bg-black/50 hover:bg-red-600 rounded transition-colors"
                    title="刪除影片"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 分頁控制 */}
      {!isLoading && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-[#333] flex items-center justify-between shrink-0">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#333] hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
            上一頁
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  className={`w-8 h-8 rounded text-sm transition ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-[#333] text-gray-400'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#333] hover:text-white"
          >
            下一頁
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Footer */}
      {videos.length > 0 && (
        <div className="h-10 px-4 border-t border-[#333] flex items-center justify-between text-xs text-gray-500 shrink-0">
          <span>{videos.length} 個影片</span>
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
