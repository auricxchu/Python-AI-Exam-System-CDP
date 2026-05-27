import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { Button } from './ui';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';

interface UpdateModalProps {
  status: UpdateStatus;
  version: string;
  forced: boolean;
  progress: number;
  releaseNotes?: string;
  releaseDate?: string;
  onDownload: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

function formatReleaseNotes(raw?: string): string {
  if (!raw) return '';
  // Strip leading/trailing whitespace, limit to reasonable length
  return raw.trim().slice(0, 3000);
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  status,
  version,
  forced,
  progress,
  releaseNotes,
  releaseDate,
  onDownload,
  onSkip,
  onRestart,
  onDismiss
}) => {
  if (status === 'idle' || status === 'up-to-date') return null;

  const notes = formatReleaseNotes(releaseNotes);

  const renderBody = () => {
    switch (status) {
      case 'checking':
        return (
          <div className="flex flex-col items-center py-6 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-slate-300">正在检查更新...</p>
          </div>
        );

      case 'available':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Download className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <p className="text-white font-semibold">版本 {version}</p>
                {releaseDate && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    发布于 {new Date(releaseDate).toLocaleDateString('zh-CN')}
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium">更新内容</p>
              {notes ? (
                <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-900/50 border border-slate-700 p-3">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{notes}</pre>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-900/50 border border-slate-700 p-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    更新日志暂未提供，请前往{' '}
                    <a href="https://github.com/auricxchu/Python-AI-Exam-System-CDP/releases" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                      GitHub Releases
                    </a>
                    {' '}查看版本 {version} 的更新内容。
                  </p>
                </div>
              )}
            </div>
            {forced && (
              <p className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                此版本为重要更新，必须安装后才能继续使用。
              </p>
            )}
          </div>
        );

      case 'downloading':
        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <p className="text-white font-medium">正在下载 {version}...</p>
            </div>
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 text-right">{progress}%</p>
          </div>
        );

      case 'downloaded':
        return (
          <div className="flex flex-col items-center py-4 gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-semibold">更新已下载完成</p>
            <p className="text-sm text-slate-400">版本 {version} — 重启应用以完成更新。</p>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center py-4 gap-3">
            <p className="text-slate-300 text-sm">检查更新时出现问题，请稍后重试。</p>
          </div>
        );

      default:
        return null;
    }
  };

  const renderFooter = () => {
    switch (status) {
      case 'available':
        if (forced) {
          return <Button onClick={onDownload}>立即更新</Button>;
        }
        return (
          <>
            <Button variant="secondary" onClick={onSkip}>稍后再说</Button>
            <Button onClick={onDownload}>立即更新</Button>
          </>
        );

      case 'downloaded':
        return <Button onClick={onRestart}>立即重启</Button>;

      case 'error':
        return <Button variant="secondary" onClick={onDismiss}>关闭</Button>;

      default:
        return null;
    }
  };

  const canClose = !forced && (status === 'available' || status === 'error');

  return (
    <Modal
      isOpen
      onClose={canClose ? onSkip : (() => {})}
      title={
        status === 'checking' ? '检查更新' :
        status === 'available' ? (forced ? '重要更新可用' : '发现新版本') :
        status === 'downloading' ? '正在下载更新' :
        status === 'downloaded' ? '更新就绪' :
        status === 'error' ? '更新检查失败' :
        '检查更新'
      }
      panelClassName="max-w-lg"
      closeOnOutsideClick={canClose}
      footer={renderFooter()}
    >
      {renderBody()}
    </Modal>
  );
};

export default UpdateModal;
