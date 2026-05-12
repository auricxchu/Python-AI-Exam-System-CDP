import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import '../services/monacoSetup';

interface CodeDiffViewerProps {
  original: string;
  modified: string;
  theme: 'light' | 'dark';
}

const DIFF_OPTIONS = {
  readOnly: true,
  renderSideBySide: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  scrollbar: { handleMouseWheel: false },
  fontSize: 13,
  fontFamily: "'Fira Code', 'Consolas', monospace",
  fontLigatures: true,
  lineNumbers: 'on' as const,
  renderIndicators: true,
  folding: false,
  contextmenu: false,
  padding: { top: 12, bottom: 12 },
  glyphMargin: false,
  lineDecorationsWidth: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  overviewRulerLanes: 0,
};

const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({ original, modified, theme }) => {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme === 'light' ? '#e2e8f0' : '#334155' }}>
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
  );
};

export default CodeDiffViewer;
