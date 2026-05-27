import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type BannerVariant = 'warning' | 'info' | 'success' | 'error';

interface StatusBannerProps {
  variant: BannerVariant;
  icon?: React.ReactNode;
  message: React.ReactNode;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
  theme?: 'light' | 'dark';
  autoDismiss?: number;
  onDismiss?: () => void;
}

const variantStyles: Record<BannerVariant, { bg: string; border: string; text: string; darkBg: string; darkBorder: string; darkText: string }> = {
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    darkBg: 'bg-amber-950/40',
    darkBorder: 'border-amber-500/30',
    darkText: 'text-amber-200'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    darkBg: 'bg-blue-950/40',
    darkBorder: 'border-blue-500/30',
    darkText: 'text-blue-200'
  },
  success: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    darkBg: 'bg-green-950/40',
    darkBorder: 'border-green-500/30',
    darkText: 'text-green-200'
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-700',
    darkBg: 'bg-red-950/40',
    darkBorder: 'border-red-500/30',
    darkText: 'text-red-300'
  }
};

const StatusBanner: React.FC<StatusBannerProps> = ({
  variant,
  icon,
  message,
  detail,
  actions,
  theme = 'dark',
  autoDismiss,
  onDismiss
}) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (autoDismiss && onDismiss) {
      timerRef.current = window.setTimeout(onDismiss, autoDismiss);
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }
  }, [autoDismiss, onDismiss]);

  const s = variantStyles[variant];
  const isDark = theme === 'dark';

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 max-w-lg w-[calc(100%-2rem)] animate-in slide-in-from-top-2 duration-300 ${
        isDark ? `${s.darkBg} ${s.darkBorder} ${s.darkText}` : `${s.bg} ${s.border} ${s.text}`
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{message}</div>
        {detail && <div className={`text-xs mt-0.5 ${isDark ? 'opacity-70' : 'opacity-60'}`}>{detail}</div>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      {onDismiss && !actions && (
        <button
          type="button"
          onClick={onDismiss}
          className={`shrink-0 p-1 rounded-lg transition-colors ${
            isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default StatusBanner;
