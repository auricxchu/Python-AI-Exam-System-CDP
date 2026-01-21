
import React from 'react';
import Editor, { loader } from "@monaco-editor/react";
import { Play, Loader2 } from 'lucide-react';

// Using unpkg for stability
loader.config({ 
  paths: { 
    vs: "https://unpkg.com/monaco-editor@0.44.0/min/vs" 
  } 
});

interface CodeEditorProps {
  code: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  onRun?: () => void;
  isRunning?: boolean;
  theme?: 'light' | 'dark';
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, readOnly, onRun, isRunning, theme = 'light' }) => {
  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  const editorTheme = theme === 'light' ? 'vs' : 'vs-dark';
  const containerClass = theme === 'light' ? 'bg-white text-slate-800' : 'bg-[#1e1e1e] text-slate-200';

  return (
    <div className={`relative h-full flex flex-col font-mono text-sm group ${containerClass}`}>
      {/* Editor Header Bar */}
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center select-none shrink-0 z-10">
        
        {/* Left: File Name */}
        <div className="text-xs font-medium text-slate-400">main.py</div>

        {/* Right: Actions & Info */}
        <div className="flex items-center gap-4">
           <span className="text-slate-600 text-[10px] hidden sm:flex items-center gap-2">
             <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-500 border border-slate-800">Python 3.10</span>
           </span>

           {/* Run Button - Moved to Right Side (IDE Style) */}
           {onRun && (
            <button 
              onClick={onRun}
              disabled={isRunning}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded transition-all text-xs font-bold
                ${isRunning 
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 active:scale-95'
                }
              `}
              title="运行代码 (F5 / Ctrl+Enter)"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {isRunning ? '运行中...' : '运行代码'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          <Editor
          height="100%"
          defaultLanguage="python"
          value={code}
          theme={editorTheme}
          onChange={handleEditorChange}
          options={{
            readOnly: readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'Fira Code', 'Consolas', monospace",
            fontLigatures: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            padding: { top: 16, bottom: 16 },
            lineNumbers: "on",
            renderLineHighlight: "all",
            contextmenu: true,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
          loading={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-slate-500 gap-3 z-50">
              <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-xs">正在初始化编辑器...</span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default CodeEditor;
