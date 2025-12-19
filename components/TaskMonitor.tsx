// src/components/TaskMonitor.tsx

import React from 'react';
import { TaskStatus } from '../services/api';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface TaskMonitorProps {
  status: TaskStatus | null;
  onClose?: () => void;
}

export const TaskMonitor: React.FC<TaskMonitorProps> = ({ status, onClose }) => {
  if (!status) return null;

  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'completed':
        return 'border-green-500/50 bg-green-500/10';
      case 'failed':
        return 'border-red-500/50 bg-red-500/10';
      case 'processing':
        return 'border-blue-500/50 bg-blue-500/10';
      default:
        return 'border-gray-500/50 bg-gray-500/10';
    }
  };

  const progressPercent = Math.round(status.progress * 100);

  return (
    <div className={`fixed bottom-4 right-4 w-96 border rounded-lg p-4 shadow-2xl ${getStatusColor()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-semibold text-sm">
            {status.status === 'processing' ? '處理中' : 
             status.status === 'completed' ? '完成' :
             status.status === 'failed' ? '失敗' : '等待中'}
          </span>
        </div>
        
        {status.status !== 'processing' && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs"
          >
            關閉
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {status.status === 'processing' && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{status.message}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Message */}
      <div className="text-xs text-gray-300 mb-2">
        {status.message}
      </div>

      {/* Metadata */}
      {status.metadata && (
        <div className="text-xs text-gray-400 space-y-1 mt-3 pt-3 border-t border-gray-700">
          {status.metadata.clip_duration && (
            <div>時長: {status.metadata.clip_duration.toFixed(3)}s</div>
          )}
          {status.metadata.merged_duration && (
            <div>合併時長: {status.metadata.merged_duration.toFixed(3)}s</div>
          )}
          {status.metadata.total_clips && (
            <div>片段數: {status.metadata.total_clips}</div>
          )}
          {status.metadata.duration_error_ms !== undefined && (
            <div className={
              status.metadata.duration_error_ms < 50 ? 'text-green-400' :
              status.metadata.duration_error_ms < 100 ? 'text-yellow-400' :
              'text-orange-400'
            }>
              誤差: {status.metadata.duration_error_ms}ms
              {status.metadata.precision_level && ` (${status.metadata.precision_level})`}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status.status === 'failed' && status.error && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">
          {status.error}
        </div>
      )}

      {/* Output URL */}
      {status.status === 'completed' && status.output_url && (
        <div className="mt-3">
          <a
            href={status.output_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            查看結果
          </a>
        </div>
      )}
    </div>
  );
};
