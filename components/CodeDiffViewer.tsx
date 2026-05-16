import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import '../services/monacoSetup';

interface CodeDiffViewerProps {
  original: string;
  modified: string;
  theme: 'light' | 'dark';
  title?: string;
}

const DIFF_OPTIONS = {
  readOnly: true,
  renderSideBySide: true,
  useInlineViewWhenSpaceIsLimited: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  scrollbar: { handleMouseWheel: false },
  fontSize: 13,
  fontFamily: "'Fira Code', 'Consolas', monospace",
  fontLigatures: true,
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 2,
  renderIndicators: true,
  folding: false,
  contextmenu: false,
  padding: { top: 12, bottom: 12, left: 0, right: 0 },
  glyphMargin: false,
  lineDecorationsWidth: 14,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  overviewRulerLanes: 0,
};

const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({ original, modified, theme, title }) => {
  return (
    <div
      className="rounded-xl border overflow-x-auto"
      style={{ borderColor: theme === 'light' ? '#e2e8f0' : '#334155' }}
    >
      {title && (
        <div className="px-4 pt-3 pb-1">
          <span className="font-bold" style={{ color: theme === 'light' ? '#1e293b' : '#e2e8f0' }}>{title}</span>
        </div>
      )}
      <div style={{ minWidth: '720px' }}>
        <DiffEditor
          original={original ?? ''}
          modified={modified ?? ''}
          language="python"
          theme={theme === 'light' ? 'vs' : 'vs-dark'}
          options={DIFF_OPTIONS as any}
          height="400px"
          loading={
            <div className="flex items-center justify-center h-[400px] bg-slate-900 text-slate-400 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                加载代码比对...
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default CodeDiffViewer;
