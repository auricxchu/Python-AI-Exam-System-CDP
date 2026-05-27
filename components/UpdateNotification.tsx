import React from 'react';
import { RefreshCw, Download, ArrowRight, X, AlertTriangle, CheckCircle } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';

interface UpdateNotificationProps {
  status: UpdateStatus;
  version: string;
  forced: boolean;
  progress: number;
  error?: string;
  theme: 'light' | 'dark';
  onDownload: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  status,
  version,
  forced,
  progress,
  error,
  theme,
  onDownload,
  onSkip,
  onRestart,
  onDismiss
}) => {
  if (status === 'idle') return null;

  const isDark = theme === 'dark';

  const bannerBg = isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-slate-100' : 'text-slate-800';
  const textSecondary = isDark ? 'text-slate-300' : 'text-slate-500';
  const btnPrimary = isDark
    ? 'bg-blue-600 text-white hover:bg-blue-500'
    : 'bg-blue-600 text-white hover:bg-blue-700';
  const btnSecondary = isDark
    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600 border-slate-500'
    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-300';
  const progressBg = isDark ? 'bg-slate-700' : 'bg-slate-200';
  const progressFill = isDark ? 'bg-blue-500' : 'bg-blue-600';

  return (
    <div
      className={`fixed top-0 left-1/2 -translate-x-1/2 z-[100] mt-4 px-5 py-3.5 rounded-xl shadow-2xl border ${bannerBg} flex items-center gap-4 max-w-lg w-[calc(100%-2rem)] animate-in slide-in-from-top-2 duration-300`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {status === 'checking' && <RefreshCw className={`w-5 h-5 animate-spin ${textSecondary}`} />}
        {status === 'up-to-date' && <CheckCircle className="w-5 h-5 text-green-500" />}
        {status === 'available' && <Download className={`w-5 h-5 ${textSecondary}`} />}
        {status === 'downloading' && <Download className={`w-5 h-5 animate-pulse text-blue-500`} />}
        {status === 'downloaded' && <ArrowRight className="w-5 h-5 text-green-500" />}
        {status === 'error' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {status === 'checking' && (
          <p className={`text-sm font-medium ${textPrimary}`}>正在检查更新...</p>
        )}

        {status === 'up-to-date' && (
          <p className={`text-sm font-medium text-green-600 dark:text-green-400`}>
            已是最新版本
          </p>
        )}

        {status === 'available' && (
          <>
            <p className={`text-sm font-medium ${textPrimary}`}>
              {forced ? '🔴 重要更新可用' : '发现新版本'}
            </p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>
              版本 {version} — {forced ? '此更新为必须安装，请立即更新。' : '建议更新到最新版本。'}
            </p>
          </>
        )}

        {status === 'downloading' && (
          <>
            <p className={`text-sm font-medium ${textPrimary}`}>正在下载更新...</p>
            <div className={`mt-2 h-1.5 rounded-full ${progressBg} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${progressFill} transition-all duration-300`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className={`text-xs ${textSecondary} mt-1`}>{progress}%</p>
          </>
        )}

        {status === 'downloaded' && (
          <>
            <p className={`text-sm font-medium text-green-600 dark:text-green-400`}>
              更新已下载完成
            </p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>
              版本 {version} — 重启应用以完成更新。
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className={`text-sm font-medium ${textPrimary}`}>检查更新失败</p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>
              {error || '无法连接到更新服务器（请确认已发布过 GitHub Release），请稍后重试。'}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {status === 'available' && (
          <>
            <button
              type="button"
              onClick={onDownload}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnPrimary}`}
            >
              立即更新
            </button>
            {!forced && (
              <button
                type="button"
                onClick={onSkip}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${btnSecondary}`}
              >
                跳过
              </button>
            )}
          </>
        )}

        {status === 'downloaded' && (
          <button
            type="button"
            onClick={onRestart}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnPrimary}`}
          >
            立即重启
          </button>
        )}

        {(status === 'error' || status === 'downloaded') && !forced && (
          <button
            type="button"
            onClick={onDismiss}
            className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default UpdateNotification;
