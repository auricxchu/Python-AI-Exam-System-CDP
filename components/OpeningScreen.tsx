import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TokenType = 'keyword' | 'function' | 'string' | 'number' | 'comment' | 'variable' | 'operator' | 'default';

type ThemeMode = 'light' | 'dark';

interface Token {
  type: TokenType;
  text: string;
}

const TYPING_TOKENS: (Token | { type: 'newline' })[] = [
  { type: 'keyword', text: 'import' }, { type: 'default', text: ' ' }, { type: 'variable', text: 'geometry_engine' }, { type: 'default', text: ' ' }, { type: 'keyword', text: 'as' }, { type: 'default', text: ' ' }, { type: 'variable', text: 'geo' }, { type: 'newline' },
  { type: 'keyword', text: 'from' }, { type: 'default', text: ' ' }, { type: 'variable', text: 'render_core' }, { type: 'default', text: ' ' }, { type: 'keyword', text: 'import' }, { type: 'default', text: ' ' }, { type: 'variable', text: 'Vector3' }, { type: 'default', text: ', ' }, { type: 'variable', text: 'Path' }, { type: 'newline' },
  { type: 'newline' },
  { type: 'comment', text: '# Optimized for WebGL 2.0' }, { type: 'newline' },
  { type: 'function', text: '@geo.accelerate' }, { type: 'default', text: '(' }, { type: 'variable', text: 'gpu' }, { type: 'default', text: '=' }, { type: 'keyword', text: 'True' }, { type: 'default', text: ')' }, { type: 'newline' },
  { type: 'keyword', text: 'def' }, { type: 'default', text: ' ' }, { type: 'function', text: 'construct_logo' }, { type: 'default', text: '():' }, { type: 'newline' },
  { type: 'default', text: '    ' }, { type: 'string', text: '"""Generates the primary vector identity."""' }, { type: 'newline' },

  { type: 'default', text: '    ' }, { type: 'comment', text: '# 1. Plot Key Vertices' }, { type: 'newline' },
  { type: 'default', text: '    ' }, { type: 'variable', text: 'ctx' }, { type: 'default', text: ' = ' }, { type: 'variable', text: 'geo' }, { type: 'default', text: '.' }, { type: 'function', text: 'Context' }, { type: 'default', text: '(' }, { type: 'variable', text: 'origin' }, { type: 'default', text: '=' }, { type: 'variable', text: 'Vector3' }, { type: 'default', text: '(0,0))' }, { type: 'newline' },
  { type: 'default', text: '    ' }, { type: 'variable', text: 'nodes' }, { type: 'default', text: ' = ' }, { type: 'variable', text: 'ctx' }, { type: 'default', text: '.' }, { type: 'function', text: 'plot_nodes' }, { type: 'default', text: '(' }, { type: 'string', text: '"J", "N"' }, { type: 'default', text: ', ' }, { type: 'variable', text: 'precision' }, { type: 'default', text: '=' }, { type: 'number', text: '0.01' }, { type: 'default', text: ')' }, { type: 'newline' },
  { type: 'newline' },

  { type: 'default', text: '    ' }, { type: 'comment', text: '# 2. Connect Spline Vectors' }, { type: 'newline' },
  { type: 'default', text: '    ' }, { type: 'variable', text: 'wireframe' }, { type: 'default', text: ' = ' }, { type: 'variable', text: 'nodes' }, { type: 'default', text: '.' }, { type: 'function', text: 'connect' }, { type: 'default', text: '(' }, { type: 'variable', text: 'smoothness' }, { type: 'default', text: '=' }, { type: 'number', text: '0.95' }, { type: 'default', text: ')' }, { type: 'newline' },
  { type: 'newline' },

  { type: 'default', text: '    ' }, { type: 'comment', text: '# 3. Rasterize Surface Layer' }, { type: 'newline' },
  { type: 'default', text: '    ' }, { type: 'variable', text: 'surface' }, { type: 'default', text: ' = ' }, { type: 'variable', text: 'wireframe' }, { type: 'default', text: '.' }, { type: 'function', text: 'fill' }, { type: 'default', text: '(' }, { type: 'string', text: '"#FFFFFF"' }, { type: 'default', text: ')' }, { type: 'newline' },

  { type: 'default', text: '    ' }, { type: 'keyword', text: 'return' }, { type: 'default', text: ' ' }, { type: 'variable', text: 'surface' }, { type: 'default', text: '.' }, { type: 'function', text: 'render' }, { type: 'default', text: '()' }
];

const TRIGGER_MAP: Record<number, number> = { 11: 1, 14: 2, 17: 3, 18: 4 };

interface TypingRunnerProps {
  theme: ThemeMode;
  onLineChange: (line: number) => void;
  onStepChange: (step: number) => void;
  onEditorExit: (value: boolean) => void;
  onSubtitle: (value: boolean) => void;
  onFadeOut: (value: boolean) => void;
  onPrelude: (value: boolean) => void;
  onPreludeText: (value: string) => void;
  isInitDone: boolean;
  onComplete: () => void;
}

const TypingRunner: React.FC<TypingRunnerProps> = React.memo(({
  theme,
  onLineChange,
  onStepChange,
  onEditorExit,
  onSubtitle,
  onFadeOut,
  onPrelude,
  onPreludeText,
  isInitDone,
  onComplete
}) => {
  const codeRef = useRef<HTMLSpanElement>(null);
  const aliveRef = useRef(true);

  const getColor = (type: TokenType) => {
    if (theme === 'light') {
      switch (type) {
        case 'keyword': return '#6d28d9';
        case 'function': return '#92400e';
        case 'string': return '#b91c1c';
        case 'number': return '#0f766e';
        case 'comment': return '#64748b';
        case 'variable': return '#1d4ed8';
        case 'operator': return '#334155';
        default: return '#111827';
      }
    }
    switch (type) {
      case 'keyword': return '#c586c0';
      case 'function': return '#dcdcaa';
      case 'string': return '#ce9178';
      case 'number': return '#b5cea8';
      case 'comment': return '#6a9955';
      case 'variable': return '#9cdcfe';
      case 'operator': return '#d4d4d4';
      default: return '#d4d4d4';
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    const runTypingSequence = async () => {
      let currentHtml = '';
      let currentLine = 1;

      await sleep(500);
      if (codeRef.current) codeRef.current.innerHTML = '';

      // Prelude: type and erase a simple hello world before logo rendering
      onPrelude(true);
      const prelude = "Hello World! \u{1F44B}";
      const preludeColor = getColor('default');
      for (let i = 0; i < prelude.length; i += 1) {
        if (!aliveRef.current) return;
        const partial = prelude.slice(0, i + 1);
        onPreludeText(partial);
        if (codeRef.current) {
          codeRef.current.innerHTML = `<span style="color: ${preludeColor}">${partial}</span>`;
        }
        await sleep(30);
      }
      await sleep(500);
      for (let i = prelude.length; i >= 0; i -= 1) {
        if (!aliveRef.current) return;
        const partial = prelude.slice(0, i);
        onPreludeText(partial);
        if (codeRef.current) {
          codeRef.current.innerHTML = partial
            ? `<span style="color: ${preludeColor}">${partial}</span>`
            : '';
        }
        await sleep(16);
      }
      await sleep(200);
      onPreludeText('');
      onPrelude(false);
      for (const token of TYPING_TOKENS) {
        if (!aliveRef.current) return;
        if (token.type === 'newline') {
          currentHtml += '\n';
          currentLine += 1;
          onLineChange(currentLine);
          if (codeRef.current) codeRef.current.innerHTML = currentHtml;

          if (TRIGGER_MAP[currentLine]) {
            const step = TRIGGER_MAP[currentLine];
            onStepChange(step);
            const pauseTime = step === 2 ? 1400 : step === 3 ? 1000 : 800;
            await sleep(pauseTime);
          } else {
            await sleep(30);
          }
          continue;
        }

        const t = token as Token;
        const color = getColor(t.type);
        const chars = t.text.split('');
        const baseSpeed = 10;
        for (let i = 0; i < chars.length; i += 1) {
          if (!aliveRef.current) return;
          const partial = chars.slice(0, i + 1).join('');
          if (codeRef.current) {
            codeRef.current.innerHTML = currentHtml + `<span style="color: ${color}">${partial}</span>`;
          }
          const delay = Math.random() * baseSpeed + 5;
          await sleep(delay);
        }
        currentHtml += `<span style="color: ${color}">${t.text}</span>`;
      }

      await sleep(800);
      if (!aliveRef.current) return;
      onSubtitle(true);
      await sleep(2600);
      if (!aliveRef.current) return;
      onEditorExit(true);
      await sleep(500);
      if (!aliveRef.current) return;
      onFadeOut(true);
      await sleep(300);
      onComplete();
    };

    runTypingSequence();
    return () => {
      aliveRef.current = false;
    };
  }, [theme, onLineChange, onStepChange, onEditorExit, onSubtitle, onFadeOut, onPrelude, onPreludeText, isInitDone, onComplete]);

  return <span ref={codeRef} />;
});

interface OpeningScreenProps {
  onComplete?: () => void;
  onInit?: () => Promise<void> | void;
  theme?: ThemeMode;
}

const OpeningScreen: React.FC<OpeningScreenProps> = ({ onComplete, onInit, theme = 'dark' }) => {
  const [editorExiting, setEditorExiting] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(1);
  const [visualStep, setVisualStep] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [initIndex, setInitIndex] = useState(0);
  const [showPrelude, setShowPrelude] = useState(false);
  const [preludeText, setPreludeText] = useState('');
  const [initDone, setInitDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const initSteps = useMemo(() => ([
    '检查程序完整性',
    '检查网络状态',
    '检测大模型可用状态',
    '加载考试环境'
  ]), []);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const scrollOffset = useMemo(() => {
    const visibleLines = 8;
    const lineHeight = 24;
    if (currentLineIndex <= visibleLines) return 0;
    return -(currentLineIndex - visibleLines) * lineHeight;
  }, [currentLineIndex]);

  const lineNumbers = useMemo(() => {
    const count = Math.max(9, currentLineIndex);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [currentLineIndex]);

  const handleComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    let alive = true;
    const runInit = async () => {
      const startedAt = Date.now();
      try {
        await onInit?.();
      } catch (error) {
        console.error('Opening init failed', error);
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < 800) {
          await sleep(800 - elapsed);
        }
        if (alive) setInitDone(true);
      }
    };
    runInit();
    return () => {
      alive = false;
    };
  }, [onInit]);

  useEffect(() => {
    if (fadeOut) return;
    const steps = initSteps;
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % steps.length;
      setInitIndex(idx);
    }, 1400);
    return () => clearInterval(timer);
  }, [fadeOut, initSteps]);

  return (
    <div className={`opening-screen fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden font-mono select-none ${fadeOut ? 'opening-fadeout' : ''} ${showSubtitle ? 'opening-subtitle-visible' : ''} ${theme === 'light' ? 'opening-theme-light' : 'opening-theme-dark'}`}>
        <div className="absolute inset-0 w-full h-full">
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className={`relative z-10 w-96 h-96 flex flex-col items-center justify-center opening-logo-wrap ${editorExiting ? 'is-exiting' : ''}`} data-step={visualStep}>
            <Icon name="jn-logo" className="w-64 h-64 relative z-20" />
            {showSubtitle && (
              <div className="opening-subtitle whitespace-nowrap">
                An Experienmental AI x Design Nexus Studio
              </div>
            )}
            {!fadeOut && (
              <div className="mt-16 text-[11px] md:text-xs font-sans tracking-[0.25em] uppercase opening-status">
                {initSteps[initIndex]}
              </div>
            )}
          </div>
        </div>
        {showPrelude && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-lg md:text-xl font-mono tracking-[0.18em] opening-prelude">
              {preludeText.replace('👋', '').trimEnd()}
              {preludeText.includes('👋') && <span className="opening-prelude__emoji">👋</span>}
            </div>
          </div>
        )}

        <div
          className={`absolute bottom-10 left-4 md:left-10 md:bottom-16 w-[90%] md:w-[500px] border rounded-lg overflow-hidden transition-[transform,opacity] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] opening-editor ${editorExiting ? 'translate-y-[150%] opacity-0' : ''}`}
        >
          <div className="p-2 px-4 flex items-center justify-between border-b opening-editor__header">
            <div className="flex gap-1.5 opacity-60">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
            </div>
            <div className="text-[11px] font-sans tracking-wide flex items-center gap-2 opening-editor__title">
              <Icon name="file-text" className="w-3 h-3" /> geometry_engine.py
            </div>
          </div>

          <div className="p-4 font-mono text-[13px] leading-6 h-56 overflow-hidden relative opening-editor__body">
            <div
              className="absolute left-0 top-4 bottom-4 w-8 text-right pr-3 border-r select-none text-[11px] leading-6 font-mono opening-editor__lines"
              style={{ transform: `translateY(${scrollOffset}px)` }}
            >
              {lineNumbers.map((line) => (
                <div key={`line-${line}`}>{line}</div>
              ))}
            </div>

            <div
              className="relative z-10 pl-10 opening-editor__code"
              style={{ transform: `translateY(${scrollOffset}px)` }}
            >
              <div
                className="absolute w-full h-6 -left-10 border-l-2 opening-editor__highlight"
                style={{ top: `${(currentLineIndex - 1) * 1.5}rem` }}
              ></div>

              <div className="whitespace-pre-wrap">
                <TypingRunner
                  theme={theme}
                  onLineChange={setCurrentLineIndex}
                  onStepChange={setVisualStep}
                  onEditorExit={setEditorExiting}
                  onSubtitle={setShowSubtitle}
                  onFadeOut={setFadeOut}
                  onPrelude={setShowPrelude}
                  onPreludeText={setPreludeText}
                  isInitDone={initDone}
                  onComplete={handleComplete}
                />
                <span className="inline-block w-2 h-4 animate-pulse align-middle ml-0.5 opening-editor__caret"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpeningScreen;
