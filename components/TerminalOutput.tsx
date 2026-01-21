
import React, { useRef, useEffect } from 'react';
import { Terminal, Loader2 } from 'lucide-react';

interface TerminalOutputProps {
  output: string | null;
  loading?: boolean;
  inputPending?: boolean;
  inputValue?: string;
  onInputChange?: (val: string) => void;
  onInputSubmit?: () => void;
  theme?: 'light' | 'dark';
}

const TerminalOutput: React.FC<TerminalOutputProps> = ({
  output,
  loading,
  inputPending,
  inputValue,
  onInputChange,
  onInputSubmit,
  theme = 'light'
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, loading]);

  useEffect(() => {
    if (inputPending && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputPending]);

  return (
    <div className={`h-full w-full border-t flex flex-col font-mono text-sm ${isLight ? 'bg-white border-slate-200' : 'bg-black border-slate-800'}`}>
      <div className={`px-4 py-1.5 text-xs flex items-center gap-2 border-b select-none ${isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
        <Terminal className="w-3 h-3" />
        <span>控制台输出</span>
      </div>
      <div ref={scrollRef} className={`flex-1 p-4 overflow-y-auto font-mono whitespace-pre-wrap w-full custom-scrollbar ${isLight ? 'text-slate-800' : 'text-green-400'}`}>
        {loading && !output ? (
          <div className={`flex items-center gap-2 animate-pulse ${isLight ? 'text-amber-600' : 'text-yellow-400'}`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>正在初始化运行环境...</span>
          </div>
        ) : output ? (
          <>
             {output}
             {loading && <span className={`animate-pulse inline-block w-2 h-4 ml-1 align-middle ${isLight ? 'bg-slate-700' : 'bg-green-400'}`}></span>}
          </>
        ) : (
          <span className={`${isLight ? 'text-slate-400' : 'text-slate-700'} italic`}>等待运行...</span>
        )}
      </div>
      {inputPending && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onInputSubmit?.();
          }}
          className={`border-t p-3 flex items-center gap-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}
        >
          <span className={`${isLight ? 'text-slate-500' : 'text-slate-500'} text-xs`}>Input&gt;</span>
          <input
            ref={inputRef}
            value={inputValue || ''}
            onChange={(e) => onInputChange?.(e.target.value)}
            className={`flex-1 border rounded px-3 py-2 text-sm outline-none focus:border-blue-500 ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'}`}
            placeholder="请输入内容并回车..."
          />
          <button
            type="submit"
            className="px-3 py-2 text-xs font-bold rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            发送
          </button>
        </form>
      )}
    </div>
  );
};

export default TerminalOutput;
