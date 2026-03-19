import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { VideoAsset } from '../types';
import {
  Upload, Trash2, Video, Loader2, Play, Film, RefreshCw,
  ChevronLeft, ChevronRight, Zap, Search, X, Edit2, Check
} from 'lucide-react';
import { getThumbnailWithCache, clearThumbnailForVideo } from './thumbnail';
import { renameVideo } from '../services/api';

interface VideoLibraryProps {
  videos: VideoAsset[];
  currentPage: number;
  totalPages: number;
  totalVideos: number;
  onPageChange: (page: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectVideo: (video: VideoAsset) => void;
  onUpload: (file: File) => void;
  onDelete: (video: VideoAsset) => void;
  isLoading: boolean;
  isUploading: boolean;
  videoStatuses?: Record<string, string>;
  onVideosUpdate?: () => void;
}

const ITEMS_PER_PAGE = 12;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const OPTIMIZE_TIMEOUT = 5 * 60 * 1000;
const POLL_INTERVAL = 3000;

export const VideoLibrary: React.FC<VideoLibraryProps> = ({
  videos,
  currentPage,
  totalPages,
  totalVideos,
  onPageChange,
  searchQuery,
  onSearchChange,
  onSelectVideo,
  onUpload,
  onDelete,
  isLoading,
  isUploading,
  videoStatuses = {},
  onVideosUpdate
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());

  // 重新命名狀態
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const requestedThumbnails = useRef<Set<string>>(new Set());
  const videoCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pollingTasksRef = useRef<Map<string, { timeoutId: number; aborted: boolean }>>(new Map());

  // 組件卸載時清理所有輪詢
  useEffect(() => {
    return () => {
      pollingTasksRef.current.forEach((task, taskId) => {
        task.aborted = true;
        if (task.timeoutId) {
          clearTimeout(task.timeoutId);
        }
        console.log(`🧹 清理輪詢任務: ${taskId}`);
      });
      pollingTasksRef.current.clear();
    };
  }, []);

  // 重新命名處理
  const handleStartRename = useCallback((e: React.MouseEvent, video: VideoAsset) => {
    e.stopPropagation();
    setEditingVideoId(video.id);

    let displayName = video.name;
    if (displayName.endsWith('.mp4')) {
      displayName = displayName.slice(0, -4);
    }

    setEditingName(displayName);
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingVideoId(null);
    setEditingName('');
  }, []);

  const handleConfirmRename = useCallback(async (video: VideoAsset) => {
    if (!editingName.trim()) {
      alert('檔名不能為空');
      return;
    }

    if (editingName === video.name.replace('.mp4', '')) {
      handleCancelRename();
      return;
    }

    const gcsPath = (video as any).fullPath || video.name;

    try {
      setIsRenaming(true);

      await renameVideo({
        gcs_path: gcsPath,
        new_name: editingName.trim()
      });

      console.log('✅ 重新命名成功');

      if (onVideosUpdate) {
        onVideosUpdate();
      } else {
        console.warn('⚠️ onVideosUpdate 未提供，建議刷新頁面');
        alert('重新命名成功！請刷新頁面查看更新。');
      }

      handleCancelRename();

    } catch (error) {
      console.error('❌ 重新命名失敗:', error);
      alert(`重新命名失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    } finally {
      setIsRenaming(false);
    }
  }, [editingName, onVideosUpdate, handleCancelRename]);

  // 縮圖生成
  const generateThumbnail = useCallback(async (video: VideoAsset) => {
    if (
      thumbnails[video.id] ||
      loadingThumbnails.has(video.id) ||
      requestedThumbnails.current.has(video.id)
    ) {
      return;
    }

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

  // Intersection Observer
  useEffect(() => {
    if (videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const videoId = entry.target.getAttribute('data-video-id');
            if (videoId) {
              const video = videos.find(v => v.id === videoId);
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
  }, [videos, generateThumbnail]);

  // 清理舊資料
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

  // 事件處理
  const handleVideoClick = useCallback((video: VideoAsset) => {
    setSelectedVideoId(video.id);
    onSelectVideo(video);
  }, [onSelectVideo]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  }, [onUpload]);

  const handleDelete = useCallback((e: React.MouseEvent, video: VideoAsset) => {
    e.stopPropagation();

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
  }, [onDelete, selectedVideoId]);

  // 工具函數
  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }, []);

  const getVideoKey = useCallback((video: VideoAsset, index: number): string => {
    if (typeof video.id === 'string') {
      return video.id;
    }
    if (video.name) {
      return `${video.name}-${index}`;
    }
    return `video-${index}`;
  }, []);

  const goToPage = useCallback((page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)));
    document.querySelector('.video-list-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [totalPages, onPageChange]);

  // 渲染
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

      {/* 搜尋欄 */}
      <div className="px-4 py-3 border-b border-[#333] shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="搜尋影片..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-[#222] border border-[#333] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-[#333] rounded transition"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        {searchQuery && (
          <div className="mt-2 text-xs text-gray-500">
            找到 {totalVideos} 個結果
          </div>
        )}
      </div>

      {/* 分頁資訊 */}
      {totalVideos > 0 && !isLoading && (
        <div className="px-4 py-2 border-b border-[#333] flex items-center justify-between text-xs text-gray-400 shrink-0">
          <span>
            顯示 {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalVideos)} / 共 {totalVideos} 個
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
            <p className="text-sm text-center">
              {searchQuery ? '沒有找到符合的影片' : '儲存桶中沒有影片'}
            </p>
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="mt-2 text-xs text-blue-400 hover:underline"
              >
                清除搜尋
              </button>
            )}
          </div>
        ) : (
          videos.map((video, index) => {
            const key = getVideoKey(video, index);
            const isSelected = selectedVideoId === video.id;
            const thumbnail = thumbnails[video.id];
            const isLoadingThumbnail = loadingThumbnails.has(video.id);
            const videoStatus = videoStatuses[video.id];
            const isEditing = editingVideoId === video.id;

            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) {
                    videoCardRefs.current.set(video.id, el);
                  }
                }}
                data-video-id={video.id}
                onClick={() => !isEditing && handleVideoClick(video)}
                className={`group relative bg-[#222] rounded-lg overflow-hidden cursor-pointer transition-all hover:bg-[#2a2a2a] ${isSelected ? 'ring-2 ring-blue-500 bg-[#2a2a2a]' : ''
                  } ${isEditing ? 'ring-2 ring-yellow-500' : ''}`}
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

                  {isSelected && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-medium shadow-lg">
                      播放中
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  {isEditing ? (
                    <div className="flex items-center gap-1 mb-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleConfirmRename(video);
                          } else if (e.key === 'Escape') {
                            handleCancelRename();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1 text-sm bg-[#333] border border-blue-500 rounded text-white focus:outline-none"
                        autoFocus
                        disabled={isRenaming}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirmRename(video);
                        }}
                        disabled={isRenaming}
                        className="p-1 bg-green-600 hover:bg-green-500 rounded transition disabled:opacity-50"
                        title="確認"
                      >
                        {isRenaming ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelRename();
                        }}
                        disabled={isRenaming}
                        className="p-1 bg-red-600 hover:bg-red-500 rounded transition disabled:opacity-50"
                        title="取消"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <h3
                      className="text-sm font-medium text-white truncate mb-1"
                      title={video.name}
                    >
                      {video.name}
                    </h3>
                  )}

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
                  {!isEditing && (
                    <button
                      onClick={(e) => handleStartRename(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-yellow-600 rounded transition-colors"
                      title="重新命名"
                    >
                      <Edit2 className="w-4 h-4 text-white" />
                    </button>
                  )}

                  {thumbnail && !isEditing && (
                    <button
                      onClick={(e) => handleRegenerateThumbnail(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-blue-600 rounded transition-colors"
                      title="重新產生縮圖"
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                    </button>
                  )}

                  {!isEditing && (
                    <button
                      onClick={(e) => handleDelete(e, video)}
                      className="p-1.5 bg-black/50 hover:bg-red-600 rounded transition-colors"
                      title="刪除影片"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 分頁控制 */}
      {
        !isLoading && totalPages > 1 && (
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
                    className={`w-8 h-8 rounded text-sm transition ${currentPage === pageNum
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
        )
      }

      {/* Footer */}
      {
        totalVideos > 0 && (
          <div className="h-10 px-4 border-t border-[#333] flex items-center justify-between text-xs text-gray-500 shrink-0">
            <span>{totalVideos} 個影片</span>
            <span>
              {videos.reduce((sum, v) => sum + (v.size || 0), 0) > 0
                ? `本頁: ${formatFileSize(videos.reduce((sum, v) => sum + (v.size || 0), 0))}`
                : ''}
            </span>
          </div>
        )
      }
    </div>
  );
};
