
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Send, Clock, Flag, FileText, CheckCircle, LogOut, Loader2, ChevronRight, ChevronDown, User, CloudUpload, Download, FileCheck, AlertTriangle, Power, AlertCircle, Wifi, WifiOff, ZoomIn, Command, Info, Sun, Moon, ShieldAlert, MessageSquare
} from 'lucide-react';
import { ExamConfig, Question, GradingResult, UserProfile, ExamReport, ExamReviewSummary } from '../types';
import { Button, ToolbarButton } from './ui';
import CodeEditor from './CodeEditor';
import TerminalOutput from './TerminalOutput';
import Modal from './Modal';
import ImageModal from './ImageModal'; // Import ImageModal
import CachedImage from './CachedImage';
import CodeDiffViewer from './CodeDiffViewer';
import { gradeQuestion, AiProvider, buildExamReviewSummary, createBlankGradingResult, generateReferenceAnswer } from '../services/aiService';
import { runPythonCodeLocal, initPyodide, resetPyodideWorker, abortPyodideRun, resetPyodideRuntime } from '../services/pyodideService';
import { cloudService } from '../services/cloudService';
import { useResolvedImageUrl } from '../hooks/useResolvedImageUrl';

interface StudentExamProps {
  user: UserProfile;
  config: ExamConfig;
  questions: Question[];
  onExit: () => void;
  onSystemExit: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  aiProvider: AiProvider;
}

const StudentExam: React.FC<StudentExamProps> = ({ user, config, questions, onExit, onSystemExit, theme, onToggleTheme, aiProvider }) => {
  // State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.duration * 60);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [isRunning, setIsRunning] = useState(false);
  
  // Submission Status States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<"idle" | "grading" | "generating" | "uploading" | "done">("idle");
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoadError, setPyodideLoadError] = useState(false);
  
  // Results
  const [examFinished, setExamFinished] = useState(false);
  const [results, setResults] = useState<Record<string, GradingResult>>({});
  const [finalScore, setFinalScore] = useState(0);
  const [animatedFinalScore, setAnimatedFinalScore] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{success: boolean, error?: string, url?: string} | null>(null);
  const [examFinishedAt, setExamFinishedAt] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ExamReviewSummary | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [usedProvider, setUsedProvider] = useState<AiProvider>(aiProvider);
  const [reportExportMeta, setReportExportMeta] = useState<{ filename: string; content: string } | null>(null);
  const [desktopExportStatus, setDesktopExportStatus] = useState<{ success: boolean; path?: string; error?: string; auto?: boolean } | null>(null);
  const [isExportingReport, setIsExportingReport] = useState(false);

  const providerLabel = (value: AiProvider) => {
    switch (value) {
      case 'deepseek':
        return 'Deepseek';
      case 'openai':
        return 'OpenAI';
      case 'qwen':
        return '通义千问';
      case 'moonshot':
        return 'Moonshot';
      case 'gemini':
        return 'Gemini';
      default:
        return '默认';
    }
  };
  
  // UI Modals
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<'technical' | 'grading' | 'other'>('technical');
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{ success: boolean; error?: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null); // Image Modal

  // Input Handling State
  const [inputPending, setInputPending] = useState(false);
  const [inputPendingKey, setInputPendingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolveInputRef = useRef<((value: string) => void) | null>(null);
  const runNonceRef = useRef<Record<string, number>>({});
  const outputShadowRef = useRef<Record<string, string>>({});
  const mainSplitRef = useRef<HTMLDivElement | null>(null);
  const editorSplitRef = useRef<HTMLDivElement | null>(null);
  const scoreAnimationFrameRef = useRef<number | null>(null);
  const defaultDescWidth = 420;
  const defaultTerminalHeight = 260;
  const [descWidth, setDescWidth] = useState(defaultDescWidth);
  const [terminalHeight, setTerminalHeight] = useState(defaultTerminalHeight);
  const [dragging, setDragging] = useState<null | 'desc' | 'terminal'>(null);

  // Environment State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [systemTime, setSystemTime] = useState(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
  const offlineSinceRef = useRef<number | null>(null);
  const [offlineLocked, setOfflineLocked] = useState(false);

  // Input Method & Keyboard State
  // Image Loading State (per question)
  const [imageError, setImageError] = useState(false);
  const [resultImageErrors, setResultImageErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Init answers
    const initialAnswers: Record<string, string> = {};
    questions.forEach(q => initialAnswers[q.id] = q.template);
    setAnswers(initialAnswers);
  }, [questions]);

  const currentQ = questions[currentIdx];
  const currentKey = `${currentQ.id}__${currentIdx}`;
  const resolvedPreviewImage = useResolvedImageUrl(previewImage);
  const resolvedCurrentImage = useResolvedImageUrl(currentQ.imageUrl);
  const cacheBustToken = useMemo(() => Date.now().toString(), []);
  // Reset image error state when question or resolved image changes
  useEffect(() => {
    setImageError(false);
  }, [currentIdx, resolvedCurrentImage]);

  useEffect(() => {
    setInputPending(false);
    setInputPendingKey(null);
    setInputValue("");
  }, [currentKey]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (dragging === 'desc') {
        const container = mainSplitRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const minDesc = 320;
        const minEditor = 460;
        const maxDesc = Math.max(minDesc, rect.width - minEditor);
        const next = Math.min(maxDesc, Math.max(minDesc, event.clientX - rect.left));
        setDescWidth(next);
      }

      if (dragging === 'terminal') {
        const container = editorSplitRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const minTerminal = 160;
        const minEditor = 260;
        const y = event.clientY - rect.top;
        const next = Math.min(rect.height - minEditor, Math.max(minTerminal, rect.height - y));
        setTerminalHeight(next);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      document.body.classList.remove('splitter-dragging');
    };

    document.body.classList.add('splitter-dragging');
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('splitter-dragging');
    };
  }, [dragging]);

  // Init Pyodide in background
  useEffect(() => {
    const loadEngine = async () => {
      try {
        await initPyodide();
        setPyodideReady(true);
        setPyodideLoadError(false);
      } catch (e) {
        console.error("Pyodide failed to load", e);
        setPyodideLoadError(true);
      }
    };
    loadEngine();
  }, []);


  // --- SHORTCUTS & RUN LOGIC ---
  const handleRun = async () => {
    if (isRunning && !inputPending) return; // Prevent double run
    setIsRunning(true);
    if (inputPending) {
      const cancelNonce = (runNonceRef.current[currentKey] || 0) + 1;
      runNonceRef.current[currentKey] = cancelNonce;
      setOutputs(prev => ({ ...prev, [currentKey]: "" }));
      abortPyodideRun(inputPendingKey || undefined);
      resetPyodideWorker();
      resolveInputRef.current = null;
      setInputPending(false);
      setInputPendingKey(null);
    }
    if (inputPendingKey && inputPendingKey !== currentKey) {
      const cancelNonce = (runNonceRef.current[inputPendingKey] || 0) + 1;
      runNonceRef.current[inputPendingKey] = cancelNonce;
      setOutputs(prev => ({ ...prev, [inputPendingKey]: "" }));
      abortPyodideRun(inputPendingKey);
      resetPyodideWorker();
      resolveInputRef.current = null;
      setInputPending(false);
      setInputPendingKey(null);
    }
    resetPyodideRuntime();
    const code = answers[currentQ.id];
    const runKey = currentKey;
    const runNonce = (runNonceRef.current[runKey] || 0) + 1;
    runNonceRef.current[runKey] = runNonce;
    
    // Clear previous output first
    setOutputs(prev => ({ ...prev, [runKey]: "" }));
    outputShadowRef.current[runKey] = "";

    const timeoutId = window.setTimeout(() => {
        if (runNonceRef.current[runKey] !== runNonce) return;
        abortPyodideRun(runKey);
        resetPyodideWorker();
        setOutputs(prev => ({
            ...prev,
            [runKey]: (prev[runKey] || "") + "\n运行超时，已重置运行环境，请重试。\n"
        }));
        setIsRunning(false);
    }, 60000);

    try {
        await runPythonCodeLocal(
            code, 
            (currentOutput) => {
                if (runNonceRef.current[runKey] != runNonce) return;
                if (!currentOutput) return;
                const display = (outputShadowRef.current[runKey] || "") + currentOutput;
                outputShadowRef.current[runKey] = display;
                setOutputs(prev => ({ ...prev, [runKey]: display }));
                if (currentOutput.includes('OSError: [Errno 29]') || currentOutput.includes('I/O error')) {
                    abortPyodideRun(runKey);
                    resetPyodideWorker();
                }
            },
            () => {
                if (runNonceRef.current[runKey] != runNonce) return Promise.resolve("");
                return new Promise<string>((resolve) => {
                    setInputValue("");
                    resolveInputRef.current = resolve;
                    setInputPending(true);
                    setInputPendingKey(runKey);
                });
            },
            runKey
        );
    } catch (e: any) {
        if (runNonceRef.current[runKey] != runNonce) return;
        setOutputs(prev => ({ ...prev, [runKey]: (prev[runKey] || "") + `\n系统错误: ${e.message}` }));
    }
    
    window.clearTimeout(timeoutId);
    if (runNonceRef.current[runKey] === runNonce) {
      setIsRunning(false);
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        // F5 or Ctrl+Enter to Run
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
            e.preventDefault(); // Stop F5 refresh
            if (!isRunning && pyodideReady) {
                handleRun();
            }
            return;
        }

    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    // Clock Interval
    const clockInterval = setInterval(() => {
        setSystemTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);

    // Network Listeners
    const handleOnline = () => {
      setIsOnline(true);
      offlineSinceRef.current = null;
      setOfflineLocked(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (!offlineSinceRef.current) {
        offlineSinceRef.current = Date.now();
      }
    };
    // If already offline on mount, start the offline timer immediately
    if (!navigator.onLine && !offlineSinceRef.current) {
      offlineSinceRef.current = Date.now();
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic offline check: lock exam after 30s without network
    const offlineCheckInterval = window.setInterval(() => {
      if (!navigator.onLine && offlineSinceRef.current && !examFinished) {
        const elapsed = Date.now() - offlineSinceRef.current;
        if (elapsed > 30000) {
          setOfflineLocked(true);
        }
      }
    }, 5000);

    return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
        clearInterval(clockInterval);
        clearInterval(offlineCheckInterval);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [isRunning, pyodideReady, currentIdx, answers, examFinished]); // Deps for handleRun closure

  useEffect(() => {
    const electronRequire = (window as any).electronRequire || (window as any).require;
    if (!electronRequire) return;
    const { ipcRenderer } = electronRequire('electron');

    ipcRenderer.invoke('exam-security-set', true).catch(() => {});

    const handler = (_event: any, payload: { reason?: string; occurredAt?: string }) => {
      console.warn("Exam security warning:", payload?.reason || "unknown");
    };

    ipcRenderer.on('exam-security-warning', handler);

    return () => {
      ipcRenderer.removeListener('exam-security-warning', handler);
      // Note: do NOT clear exam security here on unmount.
      // Security is cleared when exam finishes (see the examFinished effect below),
      // or when the exit button is pressed, to avoid exiting fullscreen.
    };
  }, []);

  // Clear exam security (kiosk mode) when exam finishes, but keep fullscreen.
  // This must happen AFTER finishExam sets examFinished=true.
  useEffect(() => {
    if (!examFinished) return;
    const electronRequire = (window as any).electronRequire || (window as any).require;
    if (!electronRequire) return;
    const { ipcRenderer } = electronRequire('electron');
    ipcRenderer.invoke('exam-security-set', false).catch(() => {});
  }, [examFinished]);

  useEffect(() => {
    if (examFinished) return;
    if (timeLeft <= 0) {
      finishExam();
      return;
    }
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, examFinished]);

  const submitInput = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputValue.trim()) return;
      if (resolveInputRef.current) {
          const targetKey = inputPendingKey ?? currentKey;
          const shadow = outputShadowRef.current[targetKey] || "";
          const next = shadow + inputValue + "\n";
          outputShadowRef.current[targetKey] = next;
          setOutputs(prev => ({
              ...prev,
              [targetKey]: next
          }));
          
          resolveInputRef.current(inputValue);
          resolveInputRef.current = null;
          setInputPending(false);
          setInputPendingKey(null);
      }
  };

  const handleSafeSystemExit = () => {
    const electronRequire = (window as any).electronRequire || (window as any).require;
    if (electronRequire) {
        try {
            const { ipcRenderer } = electronRequire('electron');
            ipcRenderer.send('app-exit');
        } catch (e) {
            console.error("Failed to quit app", e);
            window.close();
        }
    } else {
        setInfoMessage("这是网页预览模式，无法关闭窗口。\n在打包后的应用中将直接退出系统。");
        setInfoModalOpen(true);
    }
  };

  const formatScoreDisplay = (value: number) => value.toFixed(1);

  useEffect(() => {
    if (scoreAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scoreAnimationFrameRef.current);
      scoreAnimationFrameRef.current = null;
    }

    if (!examFinished) {
      setAnimatedFinalScore(0);
      return;
    }

    const duration = 900;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Number((finalScore * eased).toFixed(1));
      setAnimatedFinalScore(nextValue);

      if (progress < 1) {
        scoreAnimationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        setAnimatedFinalScore(finalScore);
        scoreAnimationFrameRef.current = null;
      }
    };

    setAnimatedFinalScore(0);
    scoreAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (scoreAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scoreAnimationFrameRef.current);
        scoreAnimationFrameRef.current = null;
      }
    };
  }, [examFinished, finalScore]);

  const getQuestionAwardedPoints = (result: GradingResult, questionPoints?: number) => {
    return Number(((result.score / 100) * (questionPoints || 0)).toFixed(1));
  };

  const getDeductionToneClass = (category: string, isLightTheme = false) => {
    if (isLightTheme) {
      switch (category) {
        case 'syntax':
          return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'logic':
          return 'bg-rose-50 text-rose-700 border-rose-200';
        case 'runtime':
          return 'bg-orange-50 text-orange-700 border-orange-200';
        case 'style':
          return 'bg-sky-50 text-sky-700 border-sky-200';
        default:
          return 'bg-slate-100 text-slate-700 border-slate-200';
      }
    }

    switch (category) {
      case 'syntax':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'logic':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
      case 'runtime':
        return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
      case 'style':
        return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
    }
  };

  const getSummaryPanelTone = (
    tone: 'emerald' | 'rose' | 'blue',
    isLightTheme = false
  ) => {
    if (isLightTheme) {
      switch (tone) {
        case 'emerald':
          return {
            panel: 'bg-emerald-50 border-emerald-200',
            title: 'text-emerald-700'
          };
        case 'rose':
          return {
            panel: 'bg-rose-50 border-rose-200',
            title: 'text-rose-700'
          };
        case 'blue':
          return {
            panel: 'bg-blue-50 border-blue-200',
            title: 'text-blue-700'
          };
      }
    }

    switch (tone) {
      case 'emerald':
        return {
          panel: 'bg-emerald-500/10 border-emerald-500/20',
          title: 'text-emerald-300'
        };
      case 'rose':
        return {
          panel: 'bg-rose-500/10 border-rose-500/20',
          title: 'text-rose-300'
        };
      case 'blue':
        return {
          panel: 'bg-blue-500/10 border-blue-500/20',
          title: 'text-blue-300'
        };
    }
  };

  const generateTxtReport = (
    score: number,
    gradingResults: Record<string, GradingResult>,
    startTime: string,
    endTime: string,
    examSummary: ExamReviewSummary | null
  ) => {
    const lines = [];
    lines.push("================================================================");
    lines.push(`               PYTHON 智能考试系统 - 考试报告`);
    lines.push("================================================================");
    lines.push(`考生姓名: ${user.name}`);
    lines.push(`考生学号: ${user.studentId}`);
    lines.push(`考试科目: ${config.examTitle}`);
    lines.push(`开始时间: ${new Date(startTime).toLocaleString()}`);
    lines.push(`完成时间: ${new Date(endTime).toLocaleString()}`);
    lines.push(`最终得分: ${formatScoreDisplay(score)} 分`);
    lines.push("================================================================");
    if (examSummary) {
      lines.push("[阅卷总结]");
      lines.push(`总体评价: ${examSummary.overview}`);
      lines.push(`做得好的点: ${examSummary.strengths.join("；")}`);
      lines.push(`主要失分点: ${examSummary.weaknesses.join("；")}`);
      lines.push(`下一步提高: ${examSummary.nextSteps.join("；")}`);
      lines.push("================================================================");
    }
    lines.push("");

    questions.forEach((q, idx) => {
      const res = gradingResults[q.id];
      lines.push(`题目 ${idx + 1}: ${q.title} (${q.difficulty}) - [${q.points}分]`);
      lines.push(`----------------------------------------------------------------`);
      lines.push(`[学生代码]`);
      lines.push(answers[q.id] || "(未作答)");
      lines.push("");
      lines.push(`[能力得分]: ${res.skillScore} / 100`);
      lines.push(`[轻量扣分]: -${res.deductionTotal}`);
      lines.push(`[最终得分]: ${res.score} / 100`);
      if (res.skillCompletions && res.skillCompletions.length > 0) {
        lines.push("[能力完成度]");
        res.skillCompletions.forEach((skill) => {
          const def = res.rubricUsed.find(r => r.skillId === skill.skillId);
          lines.push(`- ${def?.description || skill.skillId}: ${Math.round(skill.completion * 100)}% (${def ? Math.round(def.score * skill.completion) : '?'}/${def?.score || '?'}分)`);
        });
      } else if (res.detectedTags.length > 0) {
        lines.push("[扣分明细]");
        res.detectedTags.forEach((tag) => {
          lines.push(`- ${tag.label} (-${tag.weight}%): ${tag.evidence}`);
        });
      }
      if (res.lightDeductions && res.lightDeductions.length > 0) {
        lines.push("[轻量扣分明细]");
        res.lightDeductions.forEach((ded) => {
          lines.push(`- ${ded.label} (-${ded.weight}%): ${ded.evidence}`);
        });
      }
      lines.push(`[做得好的点]: ${res.summary.highlights}`);
      lines.push(`[主要失分点]: ${res.summary.mainIssues}`);
      lines.push(`[下一步提高]: ${res.summary.nextSteps}`);
      if (res.correctedAnswer) {
        lines.push(`[AI 修正版参考答案]`);
        lines.push(res.correctedAnswer);
      }
      lines.push("");
    });

    lines.push("================================================================");
    lines.push("End of Report");
    return lines.join("\n");
  };

  const finishExam = async () => {
    setSubmitModalOpen(false);
    setIsSubmitting(true);
    const resolvedProvider = aiProvider;
    setUsedProvider(resolvedProvider);
    
    // Step 1: AI Grading
    setSubmissionStep("grading");
    const gradingPromises = questions.map(async (q) => {
      const code = answers[q.id];
      if (!code || code === q.template) {
        return { 
          id: q.id, 
          result: createBlankGradingResult()
        };
      }
      const result = await gradeQuestion(q.title, q.description, code, resolvedProvider);
      return { id: q.id, result };
    });

    const gradedItems = await Promise.all(gradingPromises);
    
    const newResults: Record<string, GradingResult> = {};
    let score = 0;
    
    gradedItems.forEach(item => {
      newResults[item.id] = item.result;
      const points = questions.find(q => q.id === item.id)?.points || 0;
      score += (item.result.score / 100) * points;
    });

    // Step 2: Generate Report Content
    setSubmissionStep("generating");
    await new Promise(r => setTimeout(r, 500));

    const blankQuestions = questions.filter((question) => newResults[question.id]?.blank);
    if (blankQuestions.length > 0) {
      const referenceAnswers = await Promise.all(
        blankQuestions.map(async (question) => ({
          id: question.id,
          correctedAnswer: await generateReferenceAnswer(
            question.title,
            question.description,
            question.template,
            resolvedProvider
          )
        }))
      );

      referenceAnswers.forEach(({ id, correctedAnswer }) => {
        if (!correctedAnswer) return;
        newResults[id] = createBlankGradingResult(correctedAnswer);
      });
    }

    const finalCalculatedScore = Number(score.toFixed(1));
    const computedReviewSummary = buildExamReviewSummary(newResults, questions);
    setResults(newResults);
    setFinalScore(finalCalculatedScore);
    setReviewSummary(computedReviewSummary);
    setExpandedResultId(questions[0]?.id || null);
    
    const finishedAt = new Date().toISOString();
    setExamFinishedAt(finishedAt);
    const txtContent = generateTxtReport(finalCalculatedScore, newResults, user.joinedAt, finishedAt, computedReviewSummary);
    const filename = `${user.name}_${user.studentId}_ExamReport.txt`;
    setReportExportMeta({ filename, content: txtContent });
    
    // Step 3: Cloud Upload
    setSubmissionStep("uploading");
    
    const reportData: ExamReport = {
      timestamp: new Date().toISOString(),
      totalScore: finalCalculatedScore,
      examTitle: config.examTitle,
      startTime: user.joinedAt,
      endTime: finishedAt,
      studentName: user.name,
      studentId: user.studentId,
      results: newResults,
      reviewSummary: computedReviewSummary,
      questions,
      answers
    };

    const uploadResult = await cloudService.uploadExamReport(user.studentId, filename, txtContent, reportData);
    setUploadStatus(uploadResult);
    if (!uploadResult.success) {
      await exportReportToDesktop(filename, txtContent, true);
    }

    setSubmissionStep("done");
    setExamFinished(true);
    setIsSubmitting(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Helper for cache busting
  const getCacheBustedUrl = (url: string | undefined | null) => {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('appimg:')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${cacheBustToken}`; 
  };

  const exportReportToDesktop = async (filename: string, content: string, auto = false) => {
    setIsExportingReport(true);
    try {
      const electronRequire = (window as any).electronRequire || (window as any).require;
      if (electronRequire) {
        const { ipcRenderer } = electronRequire('electron');
        const result = await ipcRenderer.invoke('export-report-to-desktop', { filename, content });
        setDesktopExportStatus({
          success: !!result?.success,
          path: result?.path,
          error: result?.error,
          auto
        });
        return result;
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      const fallbackResult = { success: true, path: '浏览器下载目录' };
      setDesktopExportStatus({ ...fallbackResult, auto });
      return fallbackResult;
    } catch (error: any) {
      const message = error?.message || '导出失败';
      const failedResult = { success: false, error: message };
      setDesktopExportStatus({ ...failedResult, auto });
      return failedResult;
    } finally {
      setIsExportingReport(false);
    }
  };

  const submitFeedbackTicket = async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      setInfoMessage("请先填写你遇到的问题或对成绩的疑问。");
      setInfoModalOpen(true);
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const answeredCount = questions.filter((question) => {
        const answer = answers[question.id];
        return !!answer && answer !== question.template;
      }).length;

      const result = await cloudService.submitExamFeedback({
        category: feedbackCategory,
        message,
        studentName: user.name,
        studentId: user.studentId,
        examTitle: config.examTitle,
        startTime: user.joinedAt,
        endTime: examFinishedAt || new Date().toISOString(),
        score: finalScore,
        aiProvider: usedProvider,
        reportUrl: uploadStatus?.url,
        examContext: {
          questionCount: questions.length,
          answeredCount,
          durationMinutes: config.duration,
          uploadStatus,
          reviewSummary,
          results,
          questions,
          answers
        },
        clientContext: {
          theme,
          isOnline,
          userAgent: navigator.userAgent,
          exportedToDesktop: !!desktopExportStatus?.success
        }
      });

      setFeedbackStatus(result.success ? { success: true } : { success: false, error: result.error });

      if (result.success) {
        setFeedbackModalOpen(false);
        setFeedbackMessage("");
        setFeedbackCategory('technical');
        setInfoMessage("反馈工单已提交，系统已附带本次考试信息，老师可以在后台查看。");
      } else {
        setInfoMessage(`反馈提交失败：${result.error || '未知错误'}`);
      }
      setInfoModalOpen(true);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (isSubmitting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] flex flex-col items-center justify-center text-white space-y-6">
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
        </div>
        
        <div className="text-center space-y-2">
           <h2 className="text-2xl font-bold">正在处理试卷...</h2>
           <div className="flex flex-col gap-2 text-slate-400 text-sm mt-4 min-w-[200px] text-left">
              <div className={`flex items-center gap-2 ${submissionStep === 'grading' ? 'text-blue-400 animate-pulse' : submissionStep === 'generating' || submissionStep === 'uploading' ? 'text-green-400' : 'text-slate-600'}`}>
                 {submissionStep === 'grading' ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>} 
                 AI 能力分析中
              </div>
              <div className={`flex items-center gap-2 ${submissionStep === 'generating' ? 'text-blue-400 animate-pulse' : submissionStep === 'uploading' ? 'text-green-400' : 'text-slate-600'}`}>
                 {submissionStep === 'generating' ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} 
                 生成阅卷报告
              </div>
              <div className={`flex items-center gap-2 ${submissionStep === 'uploading' ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`}>
                 {submissionStep === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin"/> : <CloudUpload className="w-4 h-4"/>} 
                 上传至云端服务器
              </div>
           </div>
        </div>
      </div>
    );
  }

  if (examFinished) {
    const isLightTheme = theme === 'light';
    const totalPossiblePoints = questions.reduce((s, q) => s + (q.points || 0), 0);
    const scoreRate = totalPossiblePoints > 0 ? (finalScore / totalPossiblePoints) * 100 : 0;
    const pageClass = isLightTheme
      ? 'h-screen w-full bg-gradient-to-br from-slate-100 via-white to-blue-100 font-sans text-slate-900 overflow-hidden relative'
      : 'h-screen w-full bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] font-sans text-slate-200 overflow-hidden relative';
    const asideCardClass = isLightTheme
      ? 'rounded-3xl border border-slate-200 bg-white/90 p-8'
      : 'rounded-3xl border border-slate-700/80 bg-slate-950/65 p-8';
    const rightCardClass = isLightTheme
      ? 'rounded-[28px] border border-slate-200 bg-white/90 overflow-hidden flex-1 flex flex-col min-h-0'
      : 'rounded-[28px] border border-slate-700/50 bg-slate-900/80 overflow-hidden flex-1 flex flex-col min-h-0';
    const rightPaneClass = isLightTheme
      ? 'p-8 overflow-y-auto custom-scrollbar bg-slate-50/70 flex-1'
      : 'p-8 overflow-y-auto custom-scrollbar bg-slate-900/30 flex-1';
    const softPanelClass = isLightTheme
      ? 'rounded-2xl border border-slate-200 bg-white'
      : 'rounded-2xl border border-slate-700/80 bg-slate-800/55';
    const textPrimaryClass = isLightTheme ? 'text-slate-900' : 'text-white';
    const textMutedClass = isLightTheme ? 'text-slate-600' : 'text-slate-400';
    const summaryListClass = isLightTheme ? 'text-slate-700' : 'text-slate-300';
    const codeBlockClass = isLightTheme
      ? 'mt-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 p-4 text-xs leading-6 whitespace-pre-wrap break-all custom-scrollbar max-h-80 overflow-auto'
      : 'mt-2 rounded-xl border border-slate-800 bg-slate-950/75 text-slate-200 p-4 text-xs leading-6 whitespace-pre-wrap break-all custom-scrollbar max-h-80 overflow-auto';
    const countPillClass = isLightTheme
      ? 'text-xs px-3 py-1 rounded-full border border-slate-200 bg-white text-slate-600'
      : 'text-xs px-3 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-400';
    const uploadPillClass = uploadStatus?.success
      ? (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-200'
        : 'flex items-center gap-2 text-xs bg-blue-900/20 text-blue-400 px-3 py-1.5 rounded-full border border-blue-900/50')
      : (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200'
        : 'flex items-center gap-2 text-xs bg-orange-900/20 text-orange-400 px-3 py-1.5 rounded-full border border-orange-900/50');
    const resultCardClass = isLightTheme
      ? 'rounded-2xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-slate-300'
      : 'rounded-2xl border border-slate-700/80 bg-slate-800/55 overflow-hidden transition-colors hover:border-slate-600';
    const resultDividerClass = isLightTheme
      ? 'border-t border-slate-200 pt-5'
      : 'border-t border-slate-800/80 pt-5';
    const metaChipClass = isLightTheme
      ? 'text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700'
      : 'text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300';
    const pathHitChipClass = isLightTheme
      ? 'text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200'
      : 'text-xs bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20';
    const noDeductionChipClass = isLightTheme
      ? 'text-xs px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'text-xs px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    const floorChipClass = isLightTheme
      ? 'text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700'
      : 'text-xs px-2.5 py-1 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300';
    const scoreClass = (passed: boolean) =>
      isLightTheme
        ? (passed ? 'text-emerald-700' : 'text-red-700')
        : (passed ? 'text-green-400' : 'text-red-400');
    const chevronWrapClass = isLightTheme
      ? 'flex h-5 w-5 shrink-0 items-center justify-center text-slate-500'
      : 'flex h-5 w-5 shrink-0 items-center justify-center text-slate-400';
    const asideDividerClass = isLightTheme ? 'border-slate-300/80' : 'border-slate-700/80';
    const exportPillClass = desktopExportStatus?.success
      ? (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200'
        : 'flex items-center gap-2 text-xs bg-emerald-900/20 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-900/50')
      : (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-rose-50 text-rose-700 px-3 py-1.5 rounded-full border border-rose-200'
        : 'flex items-center gap-2 text-xs bg-rose-900/20 text-rose-300 px-3 py-1.5 rounded-full border border-rose-900/50');
    const feedbackStatusClass = feedbackStatus?.success
      ? (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200'
        : 'flex items-center gap-2 text-xs bg-emerald-900/20 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-900/50')
      : (isLightTheme
        ? 'flex items-center gap-2 text-xs bg-rose-50 text-rose-700 px-3 py-1.5 rounded-full border border-rose-200'
        : 'flex items-center gap-2 text-xs bg-rose-900/20 text-rose-300 px-3 py-1.5 rounded-full border border-rose-900/50');
    const feedbackInputClass = isLightTheme
      ? 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200'
      : 'w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30';
    const feedbackHintClass = isLightTheme ? 'text-slate-500' : 'text-slate-400';

    return (
      <div className={pageClass}>
        {/* Background FX (Matching App.tsx) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
           <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-indigo-500/10 rounded-full blur-[120px]" />
           <div className="absolute -bottom-[20%] -right-[10%] w-[70%] h-[70%] bg-purple-500/10 rounded-full blur-[120px]" />
        </div>

        {/* Info Modal for Exit Warning */}
        <Modal 
          isOpen={infoModalOpen} 
          onClose={() => setInfoModalOpen(false)} 
          title="系统提示"
          footer={<Button onClick={() => setInfoModalOpen(false)}>知道了</Button>}
        >
          <div className="flex items-start gap-4">
             <div className={`p-2 rounded-full shrink-0 ${isLightTheme ? 'bg-slate-100' : 'bg-slate-700'}`}>
               <AlertCircle className="w-6 h-6 text-blue-400" />
             </div>
             <p className={`${isLightTheme ? 'text-slate-700' : 'text-slate-300'} mt-1 whitespace-pre-wrap leading-relaxed`}>{infoMessage}</p>
          </div>
        </Modal>

        {/* Scoring system info modal */}
        <Modal
          isOpen={scoringInfoOpen}
          onClose={() => setScoringInfoOpen(false)}
          title="评分系统说明"
          panelClassName="max-w-[60vw]"
          footer={<Button onClick={() => setScoringInfoOpen(false)}>我知道了</Button>}
        >
          <div className={`grid grid-cols-3 gap-6 text-sm leading-relaxed ${isLightTheme ? 'text-slate-700' : 'text-slate-300'}`}>
            {/* Column 1: 能力完成度 */}
            <div className="space-y-3">
              <div className={`rounded-xl border p-3 ${isLightTheme ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20'}`}>
                <p className={`font-bold text-sm ${isLightTheme ? 'text-blue-700' : 'text-blue-300'}`}>能力导向评分</p>
                <p className={`text-xs mt-1 ${isLightTheme ? 'text-blue-600' : 'text-blue-200'}`}>
                  不再是传统的"找错扣分"，而是评估你<b>掌握了什么</b>。
                </p>
              </div>
              <p className={`font-bold ${textPrimaryClass}`}>一、能力完成度（主体）</p>
              <ul className={`space-y-2 text-xs ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
                <li>• 每道题预先定义了若干<b>能力点</b>（如"遍历数组"），每项有权重。</li>
                <li>• AI 对每个能力点给出<b>完成度</b>（0%~100%）。</li>
                <li>• 进度条颜色：<span className="text-emerald-500 font-bold">绿≥80%</span> <span className="text-yellow-500 font-bold">黄≥50%</span> <span className="text-red-500 font-bold">红&lt;50%</span></li>
              </ul>
            </div>

            {/* Column 2: 轻量扣分 */}
            <div className="space-y-3">
              <p className={`font-bold ${textPrimaryClass}`}>二、轻量扣分（少量）</p>
              <ul className={`space-y-2 text-xs ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
                <li>• 仅对<b>语法、运行时、命名</b>类错误做少量扣分。</li>
                <li>• <b>逻辑问题</b>已通过能力完成度体现，不再重复扣分。</li>
              </ul>
              <div className={`rounded-lg border p-2.5 text-xs ${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700'}`}>
                <p className={`font-bold mb-1.5 ${textMutedClass}`}>扣分明细</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span className={textMutedClass}>解析级语法错误</span><span className="text-right">-12</span>
                  <span className={textMutedClass}>语法小错误</span><span className="text-right">-3</span>
                  <span className={textMutedClass}>变量使用错误</span><span className="text-right">-5</span>
                  <span className={textMutedClass}>类型使用错误</span><span className="text-right">-8</span>
                  <span className={textMutedClass}>命名可读性不足</span><span className="text-right">-2</span>
                </div>
              </div>
            </div>

            {/* Column 3: 最终计分 */}
            <div className="space-y-3">
              <p className={`font-bold ${textPrimaryClass}`}>三、最终计分</p>
              <div className={`rounded-lg border p-3 text-center text-xs ${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700'}`}>
                <p className={`font-mono font-bold ${textPrimaryClass}`}>能力得分 − 轻量扣分</p>
                <p className={`font-mono font-bold ${textPrimaryClass}`}>= 最终得分(0-100)</p>
                <p className={`mt-1.5 pt-1.5 border-t ${isLightTheme ? 'border-slate-200' : 'border-slate-700'} ${textMutedClass}`}>
                  实际得分 = (最终得分/100) × 题目分值
                </p>
              </div>
              <div className={`rounded-xl border p-3 text-xs ${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700'}`}>
                <p className={`font-bold mb-1 ${textMutedClass}`}>举例</p>
                <p className={`leading-relaxed ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
                  一道 25 分的题，能力全部完成（100分），有 1 个语法小错误扣 3 分 → 最终 97 分 → 实际得 97%×25=24.3 分。
                </p>
              </div>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={feedbackModalOpen}
          onClose={() => !isSubmittingFeedback && setFeedbackModalOpen(false)}
          title="提交反馈工单"
          footer={
            <>
              <Button variant="secondary" onClick={() => setFeedbackModalOpen(false)} disabled={isSubmittingFeedback}>
                取消
              </Button>
              <Button onClick={submitFeedbackTicket} isLoading={isSubmittingFeedback}>
                提交反馈
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <div className={`text-xs font-medium mb-2 ${feedbackHintClass}`}>反馈类型</div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFeedbackCategory('technical')}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    feedbackCategory === 'technical'
                      ? (isLightTheme
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-blue-500/40 bg-blue-500/10 text-blue-300')
                      : (isLightTheme
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600')
                  }`}
                >
                  技术问题
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackCategory('grading')}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    feedbackCategory === 'grading'
                      ? (isLightTheme
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-blue-500/40 bg-blue-500/10 text-blue-300')
                      : (isLightTheme
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600')
                  }`}
                >
                  成绩疑问
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackCategory('other')}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    feedbackCategory === 'other'
                      ? (isLightTheme
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-blue-500/40 bg-blue-500/10 text-blue-300')
                      : (isLightTheme
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600')
                  }`}
                >
                  其他
                </button>
              </div>
            </div>

            <div>
              <div className={`text-xs font-medium mb-2 ${feedbackHintClass}`}>问题描述</div>
              <textarea
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                rows={6}
                maxLength={2000}
                placeholder={feedbackCategory === 'technical' ? '请描述你遇到的技术问题，例如无法运行、页面异常、导出失败等。' : feedbackCategory === 'grading' ? '请说明你对成绩或评语的疑问，老师查看时会自动带上本次考试信息。' : '请分享你的建议、体验或任何想告诉老师的内容。'}
                className={feedbackInputClass}
              />
              <div className={`mt-2 text-[11px] ${feedbackHintClass}`}>
                提交时会自动附带姓名、学号、考试名称、考试时间、得分、答题结果和当前成绩信息。
              </div>
            </div>
          </div>
        </Modal>

        <ImageModal
          isOpen={!!previewImage}
          src={getCacheBustedUrl(resolvedPreviewImage || previewImage || "")}
          onClose={() => setPreviewImage(null)}
        />

        {/* Top-right toolbar */}
        <div className="absolute top-2 right-4 sm:top-3 sm:right-6 md:top-4 md:right-8 z-20 flex items-center gap-2">
          <ToolbarButton
            theme={theme}
            onClick={onToggleTheme}
            title={theme === 'light' ? '切换到深色' : '切换到浅色'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>{theme === 'light' ? '深色' : '浅色'}</span>
          </ToolbarButton>
          <ToolbarButton
            theme={theme}
            onClick={() => setScoringInfoOpen(true)}
            title="评分系统说明"
          >
            <Info className="w-4 h-4" /> 评分说明
          </ToolbarButton>
        </div>

        {/* Content layout — fills viewport, leaves room for top-right toolbar */}
        <div className="absolute inset-0 flex gap-4 sm:gap-6 pt-12 sm:pt-14 md:pt-16 p-4 sm:p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500">
          {/* Left column — no scroll */}
          <div className="w-[340px] sm:w-[380px] md:w-[430px] shrink-0 flex flex-col overflow-y-auto custom-scrollbar">
              <div className={asideCardClass}>
                <div className="text-center">
                  <div className="report-logo inline-block bg-blue-900/30 p-4 rounded-full mb-4 ring-1 ring-blue-500/50">
                    <FileCheck className="w-12 h-12 text-blue-400" />
                  </div>
                  <h2 className={`text-2xl font-bold mb-2 ${textPrimaryClass}`}>考试成绩单</h2>
                  <div className="text-5xl font-bold text-blue-400 mt-2 tabular-nums">
                    {formatScoreDisplay(animatedFinalScore)}
                    <span className={`text-xl font-normal ml-1 ${textMutedClass}`}>
                      / {totalPossiblePoints}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${textMutedClass}`}>
                    得分率 {formatScoreDisplay(scoreRate)}%
                  </p>
                </div>

                <div className="report-info-grid">
                  <div className="report-info-row">
                    <span className="report-info-label">考试名称</span>
                    <span className="report-info-value">{config.examTitle}</span>
                  </div>
                  <div className="report-info-row">
                    <span className="report-info-label">考生姓名</span>
                    <span className="report-info-value">{user.name}</span>
                  </div>
                  <div className="report-info-row">
                    <span className="report-info-label">考生学号</span>
                    <span className="report-info-value">{user.studentId}</span>
                  </div>
                  <div className="report-info-row">
                    <span className="report-info-label">开始考试时间</span>
                    <span className="report-info-value">{new Date(user.joinedAt).toLocaleString()}</span>
                  </div>
                  <div className="report-info-row">
                    <span className="report-info-label">完成考试时间</span>
                    <span className="report-info-value">{examFinishedAt ? new Date(examFinishedAt).toLocaleString() : new Date().toLocaleString()}</span>
                  </div>
                  <div className="report-info-row">
                    <span className="report-info-label">批改模型</span>
                    <span className="report-info-value">{providerLabel(usedProvider)}</span>
                  </div>
                </div>

                <div className="flex justify-center mt-6">
                  <div className="flex flex-col items-center gap-3">
                    {uploadStatus?.success ? (
                      <div className={uploadPillClass}>
                        <CloudUpload className="w-3 h-3"/> 成绩已上传云端
                      </div>
                    ) : (
                      <div className={uploadPillClass} title={uploadStatus?.error}>
                        <AlertTriangle className="w-3 h-3"/> 云端上传失败（已存本地）
                      </div>
                    )}

                    {desktopExportStatus && (
                      <div className={exportPillClass} title={desktopExportStatus.error || desktopExportStatus.path}>
                        {desktopExportStatus.success ? <Download className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {desktopExportStatus.success
                          ? (desktopExportStatus.auto ? '成绩单已自动导出到桌面' : '成绩单已导出到桌面')
                          : '成绩单导出失败'}
                      </div>
                    )}

                    {feedbackStatus && (
                      <div className={feedbackStatusClass} title={feedbackStatus.error}>
                        {feedbackStatus.success ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {feedbackStatus.success ? '反馈工单已提交' : '反馈提交失败'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`pt-6 mt-6 border-t ${asideDividerClass}`}>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => reportExportMeta && exportReportToDesktop(reportExportMeta.filename, reportExportMeta.content)}
                    variant="secondary"
                    isLoading={isExportingReport}
                    disabled={!reportExportMeta}
                    className={isLightTheme ? 'h-11 rounded-xl bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800 shadow-none' : 'h-11 rounded-xl shadow-none'}
                  >
                    <Download className="w-4 h-4"/> 导出成绩单
                  </Button>
                  <Button
                    onClick={() => setFeedbackModalOpen(true)}
                    variant="info"
                    className={`h-11 rounded-xl shadow-none ${isLightTheme ? 'bg-blue-100 hover:bg-blue-200 border-blue-200 text-blue-700' : ''}`}
                  >
                    <MessageSquare className="w-4 h-4"/> 反馈问题
                  </Button>
                  <Button onClick={onExit} variant="secondary" className={isLightTheme ? 'h-11 rounded-xl bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800 shadow-none' : 'h-11 rounded-xl shadow-none'}>
                    <LogOut className="w-4 h-4"/> 返回首页
                  </Button>
                  <Button onClick={handleSafeSystemExit} variant="danger" className="h-11 rounded-xl shadow-none">
                    <Power className="w-4 h-4"/> 退出系统
                  </Button>
                </div>
              </div>
            </div>

            {/* Right column — review summary + per-question results */}
            <div className={rightCardClass}>
              <div className={rightPaneClass}>
                {reviewSummary && (
                  <div className="space-y-4 mb-8">
                    <div>
                      <h3 className={`text-xl font-bold ${textPrimaryClass}`}>阅卷总结</h3>
                      <p className={`text-sm mt-1 leading-relaxed ${textMutedClass}`}>{reviewSummary.overview}</p>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div className={`${getSummaryPanelTone('emerald', isLightTheme).panel} rounded-lg border p-4`}>
                        <span className={`${getSummaryPanelTone('emerald', isLightTheme).title} font-bold block mb-2`}>做得好的点</span>
                        <ul className={`space-y-2 ${summaryListClass}`}>
                          {reviewSummary.strengths.map((item, idx) => (
                            <li key={`strength-${idx}`} className="leading-relaxed">• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className={`${getSummaryPanelTone('rose', isLightTheme).panel} rounded-lg border p-4`}>
                        <span className={`${getSummaryPanelTone('rose', isLightTheme).title} font-bold block mb-2`}>主要失分点</span>
                        <ul className={`space-y-2 ${summaryListClass}`}>
                          {reviewSummary.weaknesses.map((item, idx) => (
                            <li key={`weakness-${idx}`} className="leading-relaxed">• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className={`${getSummaryPanelTone('blue', isLightTheme).panel} rounded-lg border p-4`}>
                        <span className={`${getSummaryPanelTone('blue', isLightTheme).title} font-bold block mb-2`}>下一步提高</span>
                        <ul className={`space-y-2 ${summaryListClass}`}>
                          {reviewSummary.nextSteps.map((item, idx) => (
                            <li key={`next-step-${idx}`} className="leading-relaxed">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className={`text-xl font-bold ${textPrimaryClass}`}>分题解析</h3>
                    <p className={`text-sm ${textMutedClass}`}>展开后可查看题目内容、扣分依据、考生答案与 AI 参考答案。</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={countPillClass}>
                      共 {questions.length} 题
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                {questions.map((q, idx) => {
                const res = results[q.id];
                const pts = getQuestionAwardedPoints(res, q.points);
                const isExpanded = expandedResultId === q.id;
                const studentAnswer = answers[q.id] && answers[q.id] !== q.template ? answers[q.id] : '（未作答）';
                const strengthTone = getSummaryPanelTone('emerald', isLightTheme);
                const issueTone = getSummaryPanelTone('rose', isLightTheme);
                const nextTone = getSummaryPanelTone('blue', isLightTheme);

                  return (
                    <div key={q.id} className={resultCardClass}>
                    <div className="relative">
                      <button
                        type="button"
                        className={`${chevronWrapClass} absolute left-4 top-1/2 z-10 -translate-y-1/2`}
                        onClick={() => setExpandedResultId((prev) => prev === q.id ? null : q.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? '收起题目解析' : '展开题目解析'}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    <div
                      className="cursor-pointer select-none pl-[52px] pr-5 pt-4 pb-5"
                      onClick={() => setExpandedResultId((prev) => prev === q.id ? null : q.id)}
                      role="button"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-start justify-between gap-4 min-w-0">
                        <div className="min-w-0">
                          <h3 className={`font-bold text-lg ${textPrimaryClass}`}>{idx + 1}. {q.title}</h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className={metaChipClass}>{q.difficulty}</span>
                            <span className={metaChipClass}>满分: {q.points} 分</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`flex items-end justify-end gap-1 font-bold leading-none ${scoreClass(res.passed)}`}>
                            <span className="text-[2rem]">{formatScoreDisplay(pts)}</span>
                            <span className="text-[1.35rem] leading-none translate-y-[-1px]">分</span>
                          </div>
                          <div className={`text-xs mt-2 ${textMutedClass}`}>标准评分: {res.score}%</div>
                        </div>
                      </div>

                      {/* Skill completion bars (new format) */}
                      {res.skillCompletions && res.skillCompletions.length > 0 ? (
                        <div className="space-y-1.5 mt-4">
                          <span className={`text-xs font-bold ${textMutedClass}`}>能力完成度</span>
                          {res.skillCompletions.map((skill) => {
                            const rubricDef = res.rubricUsed?.find(r => r.skillId === skill.skillId);
                            const earnedPct = Math.round(skill.completion * 100);
                            const barColor = earnedPct >= 80 ? 'bg-emerald-500' : earnedPct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                            return (
                              <div key={skill.skillId} className="flex items-center gap-2">
                                <span className={`text-xs truncate w-28 ${textMutedClass}`} title={rubricDef?.description}>{rubricDef?.description || skill.skillId}</span>
                                <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isLightTheme ? 'bg-slate-200' : 'bg-slate-700'}`}>
                                  <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${earnedPct}%` }} />
                                </div>
                                <span className={`text-xs w-8 text-right ${textMutedClass}`}>{earnedPct}%</span>
                                {rubricDef && (
                                  <span className={`text-xs w-14 text-right ${textMutedClass}`}>
                                    {Math.round(rubricDef.score * skill.completion)}/{rubricDef.score}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : res.blank ? (
                        <div className={`text-xs px-2.5 py-1 rounded-full border inline-block mt-4 ${
                          isLightTheme
                            ? 'border-slate-200 bg-slate-100 text-slate-500'
                            : 'border-slate-700 bg-slate-800/50 text-slate-500'
                        }`}>
                          本题暂未作答
                        </div>
                      ) : (
                        /* Fallback: old deduction tag display for old reports */
                        <div className="flex flex-wrap gap-2 mt-4">
                          {res.detectedTags && res.detectedTags.length > 0 ? (
                            res.detectedTags.map((tag) => (
                              <div
                                key={`${q.id}-${tag.code}`}
                                className={`text-xs px-2.5 py-1 rounded-full border ${getDeductionToneClass(tag.category, isLightTheme)}`}
                                title={tag.evidence}
                              >
                                {tag.label} (-{tag.weight}%)
                              </div>
                            ))
                          ) : (
                            <div className={noDeductionChipClass}>
                              未命中固定扣分标签
                            </div>
                          )}
                          {res.scoreBreakdown?.floorApplied && (
                            <div className={floorChipClass}>
                              已触发关键路径保底
                            </div>
                          )}
                        </div>
                      )}

                      {/* Light deductions (if any) */}
                      {res.lightDeductions && res.lightDeductions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {res.lightDeductions.map((ded) => (
                            <div
                              key={`${q.id}-${ded.code}`}
                              className={`text-xs px-2 py-0.5 rounded-full border ${getDeductionToneClass(ded.category, isLightTheme)}`}
                              title={ded.evidence}
                            >
                              {ded.label} (-{ded.weight})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>

                      {isExpanded && (
                        <div className={`ml-[52px] mr-5 pb-5 space-y-4 ${resultDividerClass}`}>
                          <div className={`${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'} p-4 rounded-xl border`}>
                            <span className={`font-bold block mb-2 ${textPrimaryClass}`}>题目内容</span>
                            <p className={`text-sm whitespace-pre-wrap leading-7 ${summaryListClass}`}>{q.description}</p>
                            {q.imageUrl && !resultImageErrors[q.id] && (
                              <div
                                className="mt-4 relative group w-fit cursor-zoom-in"
                                onClick={() => setPreviewImage(q.imageUrl!)}
                              >
                                <CachedImage
                                  src={getCacheBustedUrl(q.imageUrl)}
                                  alt={`${q.title} 配图`}
                                  referrerPolicy="no-referrer"
                                  className={`rounded-lg border ${isLightTheme ? 'border-slate-200 bg-white' : 'border-slate-700 bg-black/20'} w-auto h-auto max-w-full max-h-[360px] hover:shadow-lg hover:opacity-90 transition-all min-h-[100px]`}
                                  onError={(e) => {
                                    const src = (e.currentTarget as HTMLImageElement).currentSrc || "";
                                    if (src.startsWith('appimg://') || src.startsWith('blob:') || src.startsWith('data:')) {
                                      setResultImageErrors((prev) => ({ ...prev, [q.id]: true }));
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                                  <ZoomIn className="w-8 h-8 text-white drop-shadow-md" />
                                </div>
                              </div>
                            )}
                            {q.imageUrl && resultImageErrors[q.id] && (
                              <div className={`mt-4 w-full p-4 border border-dashed rounded-lg text-xs flex flex-col items-center gap-2 ${isLightTheme ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-slate-700 bg-slate-800/50 text-slate-500'}`}>
                                <AlertTriangle className="w-6 h-6 text-orange-400" />
                                <span>图片加载失败: 权限不足或路径错误</span>
                              </div>
                            )}
                          </div>

                          {/* Skill completion evidence */}
                          {res.skillCompletions && res.skillCompletions.some(s => s.evidence) && (
                            <div className={`${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'} p-4 rounded-xl border`}>
                              <span className={`font-bold block mb-2 ${textPrimaryClass}`}>能力评估依据</span>
                              <ul className={`space-y-2 text-sm ${textMutedClass}`}>
                                {res.skillCompletions.filter(s => s.evidence).map((skill) => (
                                  <li key={`${q.id}-${skill.skillId}-evidence`} className="leading-relaxed">
                                    <span className={textPrimaryClass}>
                                      {res.rubricUsed?.find(r => r.skillId === skill.skillId)?.description || skill.skillId}：
                                    </span>
                                    {skill.evidence}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Light deduction evidence */}
                          {res.lightDeductions && res.lightDeductions.length > 0 && (
                            <div className={`${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'} p-4 rounded-xl border`}>
                              <span className={`font-bold block mb-2 ${textPrimaryClass}`}>轻量扣分证据</span>
                              <ul className={`space-y-2 text-sm ${textMutedClass}`}>
                                {res.lightDeductions.map((ded) => (
                                  <li key={`${q.id}-${ded.code}-evidence`} className="leading-relaxed">
                                    <span className={textPrimaryClass}>{ded.label}：</span>{ded.evidence}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Fallback: old deduction evidence for old reports */}
                          {(!res.skillCompletions || res.skillCompletions.length === 0) && (!res.lightDeductions || res.lightDeductions.length === 0) && res.detectedTags && res.detectedTags.length > 0 && (
                            <div className={`${isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'} p-4 rounded-xl border`}>
                              <span className={`font-bold block mb-2 ${textPrimaryClass}`}>扣分证据</span>
                              <ul className={`space-y-2 text-sm ${textMutedClass}`}>
                                {res.detectedTags.map((tag) => (
                                  <li key={`${q.id}-${tag.code}-evidence`} className="leading-relaxed">
                                    <span className={textPrimaryClass}>{tag.label}：</span>{tag.evidence}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className={`${strengthTone.panel} p-4 rounded-xl border`}>
                              <span className={`${strengthTone.title} font-bold block mb-2`}>做得好的点</span>
                              <p className={`${summaryListClass} leading-relaxed`}>{res.summary.highlights}</p>
                            </div>
                            <div className={`${issueTone.panel} p-4 rounded-xl border`}>
                              <span className={`${issueTone.title} font-bold block mb-2`}>主要失分点</span>
                              <p className={`${summaryListClass} leading-relaxed`}>{res.summary.mainIssues}</p>
                            </div>
                            <div className={`${nextTone.panel} p-4 rounded-xl border`}>
                              <span className={`${nextTone.title} font-bold block mb-2`}>下一步提高</span>
                              <p className={`${summaryListClass} leading-relaxed`}>{res.summary.nextSteps}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {res.correctedAnswer ? (
                              (() => {
                                const normalizedStudent = (studentAnswer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
                                const normalizedCorrected = (res.correctedAnswer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
                                const isIdentical = normalizedStudent === normalizedCorrected;
                                return isIdentical ? (
                                  <div className={`p-4 rounded-xl border ${isLightTheme ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                                    <span className={`font-bold block mb-3 ${textPrimaryClass}`}>考生作答 vs AI 参考答案</span>
                                    <div className={`flex items-center gap-2 text-sm mb-3 ${isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}`}>
                                      <CheckCircle className="w-4 h-4" /> 答案与参考答案完全一致
                                    </div>
                                    <pre className={codeBlockClass}>{studentAnswer}</pre>
                                  </div>
                                ) : (
                                  <div>
                                    <CodeDiffViewer
                                      original={studentAnswer}
                                      modified={res.correctedAnswer}
                                      theme={theme}
                                      title="答案对比"
                                    />
                                    <div className="flex mt-1.5">
                                      <span className={`flex-1 text-center text-[11px] ${isLightTheme ? 'text-slate-400' : 'text-slate-500'}`}>你的作答</span>
                                      <span className={`flex-1 text-center text-[11px] ${isLightTheme ? 'text-slate-400' : 'text-slate-500'}`}>AI 参考答案</span>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <>
                                <div className={`${isLightTheme ? 'bg-white/90 border-slate-200' : 'bg-slate-900/70 border-slate-800'} p-4 rounded-xl border`}>
                                  <span className={`font-bold block ${textPrimaryClass}`}>考生作答</span>
                                  <pre className={codeBlockClass}>{studentAnswer}</pre>
                                </div>
                                <div className={`${isLightTheme ? 'bg-white/90 border-slate-200' : 'bg-slate-900/70 border-slate-800'} p-4 rounded-xl border`}>
                                  <span className={`font-bold block ${textPrimaryClass}`}>AI 修正版参考答案</span>
                                  <pre className={codeBlockClass}>当前未生成 AI 修正版参考答案。</pre>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 flex overflow-hidden font-sans">
<Modal 
        isOpen={submitModalOpen} 
        onClose={() => setSubmitModalOpen(false)}
        title="提交试卷"
        footer={
           <>
             <Button variant="secondary" onClick={() => setSubmitModalOpen(false)}>取消</Button>
             <Button onClick={() => finishExam()}>{unansweredCount > 0 ? '仍然交卷' : '确认交卷'}</Button>
           </>
        }
      >
        <p>确定要提交试卷吗？提交后将无法修改答案。</p>
        {unansweredCount > 0 && (
          <div className={`mt-3 rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${
            theme === 'light'
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">还有 {unansweredCount} 道题目未作答</p>
              <p className="text-xs mt-1 opacity-80">未作答的题目将被判为空白，得分为 0。建议返回检查后再交卷。</p>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">提交后系统将自动生成考试报告并上传至云端。</p>
      </Modal>

      {/* Image Zoom Modal */}
      <ImageModal 
        isOpen={!!previewImage} 
        src={getCacheBustedUrl(resolvedPreviewImage || previewImage || "")} 
        onClose={() => setPreviewImage(null)} 
      />

      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Exam Title Section */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/30 exam-title-bar">
            <h3 className="font-bold text-white text-sm leading-tight text-center">{config.examTitle}</h3>
        </div>

        {/* User Profile */}
        <div className="p-5 border-b border-slate-800">
           <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <User className="w-5 h-5"/>
              </div>
              <div>
                <h2 className="font-bold text-white text-sm truncate w-32">{user.name}</h2>
                <p className="text-xs text-slate-500">{user.studentId}</p>
              </div>
           </div>
        </div>

        {/* Timer */}
        <div className="p-5 border-b border-slate-800 flex justify-center">
           <div className={`text-2xl font-mono font-bold tracking-wider ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-blue-400'}`}>
              <div className="flex items-center gap-2">
                 <Clock className="w-5 h-5"/> {formatTime(timeLeft)}
              </div>
           </div>
        </div>

        {/* Question List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
           {questions.map((q, idx) => {
             const isActive = idx === currentIdx;
             const isMarked = marked[q.id];
             const isAnswered = answers[q.id] && answers[q.id] !== q.template;

             return (
               <button 
                 key={q.id}
                 onClick={() => setCurrentIdx(idx)}
                 className={`w-full text-left p-3 rounded-xl border transition-all relative flex justify-between items-center group ${
                   isActive 
                   ? 'bg-blue-900/20 border-blue-500/50 shadow-md ring-1 ring-blue-500/20' 
                   : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                 }`}
               >
                 <div className="flex-1 min-w-0 mr-3">
                   <div className={`font-bold text-sm truncate mb-1.5 ${isActive ? 'text-white' : 'text-slate-300'}`}>
                     {idx + 1}. {q.title}
                   </div>
                   <div className="flex gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        q.difficulty === '简单' ? 'border-green-900/50 text-green-500 bg-green-900/10' : 
                        q.difficulty === '中等' ? 'border-yellow-900/50 text-yellow-500 bg-yellow-900/10' : 
                        'border-red-900/50 text-red-500 bg-red-900/10'
                      }`}>
                        {q.difficulty}
                      </span>
                      <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/50">
                        {q.points}分
                      </span>
                   </div>
                 </div>

                 {/* Status Icons Container */}
                 <div className="flex items-center gap-2 flex-shrink-0">
                    {isMarked && (
                      <Flag className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                    )}
                    {isAnswered && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_4px_rgba(59,130,246,0.8)]" />
                    )}
                 </div>
               </button>
             );
           })}
        </div>

        <div className="p-4 border-t border-slate-800">
          <Button className="w-full py-3" onClick={() => {
            const unanswered = questions.filter(q => {
              const code = answers[q.id];
              return !code || code === q.template;
            });
            setUnansweredCount(unanswered.length);
            setSubmitModalOpen(true);
          }}>
            <Send className="w-4 h-4"/> 交 卷
          </Button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
         <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 shadow-sm z-30">
            <div className="flex items-center gap-4">
               <h1 className="font-bold text-white text-lg flex items-center gap-3">
                 <span>{currentIdx + 1}. {currentQ.title}</span>
               </h1>
               
               <button 
                  onClick={() => setMarked(prev => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }))}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-all ${
                    marked[currentQ.id] 
                    ? 'bg-orange-900/20 border-orange-500/50 text-orange-400 hover:bg-orange-900/30' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-200'
                  }`}
               >
                  <Flag className={`w-3.5 h-3.5 ${marked[currentQ.id] ? 'fill-current' : ''}`}/>
                  {marked[currentQ.id] ? '已标记' : '标记此题'}
               </button>
            </div>
            
            <div className="flex items-center gap-6">
                
                <ToolbarButton
                  theme="dark"
                  onClick={onToggleTheme}
                  title={theme === 'light' ? '切换到深色' : '切换到浅色'}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
                </ToolbarButton>

                {/* Network Status */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg select-none">
                    {isOnline ? (
                         <div className="flex items-center gap-2 text-green-400" title="网络连接正常">
                             <Wifi className="w-4 h-4" />
                         </div>
                    ) : (
                         <div className="flex items-center gap-2 text-red-400 animate-pulse" title="网络已断开">
                             <WifiOff className="w-4 h-4" />
                         </div>
                    )}
                </div>

                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border select-none shadow-sm ${
                    theme === 'light'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-amber-500/10 border-amber-400/30 text-amber-300'
                  }`}
                  title="考试防作弊监控运行中"
                >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-semibold tracking-[0.04em]">防作弊启用中</span>
                </div>

                {/* System Clock */}
                <div className="flex items-center gap-2 text-slate-400 select-none">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-mono tracking-wide">{systemTime}</span>
                </div>
            </div>
         </header>

         <div className="flex-1 flex min-h-0" ref={mainSplitRef}>
            {/* Description Panel */}
            <div className="bg-slate-900/50 border-r border-slate-800 flex flex-col min-h-0" style={{ width: descWidth }}>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  <h3 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4"/> 题目描述
                  </h3>
                  
                  <div className="text-slate-300 leading-relaxed whitespace-pre-wrap font-sans text-sm mb-6">
                    {currentQ.description}
                  </div>

                  {currentQ.imageUrl && !imageError && (
                    <div className="mb-6 relative group w-fit cursor-zoom-in" onClick={() => setPreviewImage(currentQ.imageUrl!)}>
                        <CachedImage
                          key={resolvedCurrentImage || currentQ.imageUrl} // Critical: Force re-mount on change to reset internal loading state
                          src={getCacheBustedUrl(resolvedCurrentImage || currentQ.imageUrl)} 
                          alt="题目配图" 
                          referrerPolicy="no-referrer"
                          className="rounded-lg border border-slate-700 bg-black/20 w-80 h-auto max-w-full hover:shadow-lg hover:opacity-90 transition-all min-h-[100px]"
                          onError={(e) => {
                             const src = (e.currentTarget as HTMLImageElement).currentSrc || "";
                             // Only mark as error after appimg resolves to avoid early CDN failures
                             if (src.startsWith('appimg://') || src.startsWith('blob:') || src.startsWith('data:')) {
                               setImageError(true);
                             }
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                            <ZoomIn className="w-8 h-8 text-white drop-shadow-md"/>
                        </div>
                    </div>
                  )}
                  {/* Fallback UI for Broken Image */}
                  {currentQ.imageUrl && imageError && (
                     <div className="mb-6 w-full p-4 border border-dashed border-slate-700 rounded-lg bg-slate-800/50 text-slate-500 text-xs flex flex-col items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-orange-400"/>
                        <span>图片加载失败: 权限不足或路径错误</span>
                     </div>
                  )}

                  <div className="flex gap-2">
                     <span className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400">难度: {currentQ.difficulty}</span>
                     <span className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400">满分: {currentQ.points} 分</span>
                  </div>
               </div>
            </div>

            <div
              className="splitter splitter-vertical"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => setDragging('desc')}
              onDoubleClick={() => setDescWidth(defaultDescWidth)}
            />

            {/* Editor & Terminal */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]" ref={editorSplitRef}>
               {pyodideLoadError && !pyodideReady && (
                 <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-red-300 text-xs flex items-center gap-2">
                   <AlertCircle className="w-4 h-4 shrink-0" />
                   <span>Python 运行环境加载失败，请检查网络连接。代码运行功能暂不可用。</span>
                 </div>
               )}
               <div className="flex-1 min-h-0">
                  <CodeEditor
                    code={answers[currentQ.id]} 
                    onChange={(val) => setAnswers(prev => ({ ...prev, [currentQ.id]: val }))} 
                    onRun={handleRun}
                    isRunning={isRunning}
                    theme={theme}
                  />
               </div>

               <div
                 className="splitter splitter-horizontal"
                 role="separator"
                 aria-orientation="horizontal"
                 onMouseDown={() => setDragging('terminal')}
                 onDoubleClick={() => setTerminalHeight(defaultTerminalHeight)}
               />

               <div className="shrink-0 relative terminal-pane" style={{ height: terminalHeight }}>
                  <TerminalOutput
                    output={outputs[currentKey] || null}
                    loading={isRunning}
                    inputPending={inputPending && inputPendingKey === currentKey}
                    inputValue={inputValue}
                    onInputChange={setInputValue}
                    onInputSubmit={submitInput}
                    theme={theme}
                  />
               </div>
            </div>
         </div>
      </div>

      {/* Offline Lock Overlay */}
      {offlineLocked && !examFinished && (
        <div className={`absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 backdrop-blur-sm ${
          theme === 'light'
            ? 'bg-white/95 text-slate-800'
            : 'bg-slate-950/95 text-white'
        }`}>
          <WifiOff className={`w-16 h-16 ${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} />
          <h2 className="text-2xl font-bold">网络连接已断开</h2>
          <p className={`text-sm max-w-md text-center leading-relaxed ${
            theme === 'light' ? 'text-slate-600' : 'text-slate-400'
          }`}>
            系统检测到网络连接已中断超过 30 秒。<br />
            为防止题目泄露，考试已暂停。<br />
            请等待监考老师协助恢复网络后继续答题。
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentExam;
;
