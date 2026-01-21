
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Send, Clock, Flag, FileText, CheckCircle, Brain, LogOut, Loader2, ChevronRight, User, CloudUpload, Download, FileCheck, AlertTriangle, Power, AlertCircle, Wifi, WifiOff, Keyboard, Type, ZoomIn, Command, Info, Sun, Moon
} from 'lucide-react';
import { ExamConfig, Question, GradingResult, UserProfile, ExamReport } from '../types';
import { Button } from './ui';
import CodeEditor from './CodeEditor';
import TerminalOutput from './TerminalOutput';
import Modal from './Modal';
import ImageModal from './ImageModal'; // Import ImageModal
import CachedImage from './CachedImage';
import { gradeQuestion } from '../services/geminiService';
import { runPythonCodeLocal, initPyodide } from '../services/pyodideService';
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
}

const StudentExam: React.FC<StudentExamProps> = ({ user, config, questions, onExit, onSystemExit, theme, onToggleTheme }) => {
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
  
  // Results
  const [examFinished, setExamFinished] = useState(false);
  const [results, setResults] = useState<Record<string, GradingResult>>({});
  const [finalScore, setFinalScore] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{success: boolean, error?: string} | null>(null);
  
  // UI Modals
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null); // Image Modal

  // Input Handling State
  const [inputPending, setInputPending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const resolveInputRef = useRef<((value: string) => void) | null>(null);

  // Environment State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [systemTime, setSystemTime] = useState(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
  
  // Input Method & Keyboard State
  const [capsLock, setCapsLock] = useState(false);
  const [imeActive, setImeActive] = useState(false);
  const [imeStatus, setImeStatus] = useState<{ open: boolean; name?: string } | null>(null);

  // Image Loading State (per question)
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Init answers
    const initialAnswers: Record<string, string> = {};
    questions.forEach(q => initialAnswers[q.id] = q.template);
    setAnswers(initialAnswers);
  }, [questions]);

  const currentQ = questions[currentIdx];
  const resolvedPreviewImage = useResolvedImageUrl(previewImage);
  const resolvedCurrentImage = useResolvedImageUrl(currentQ.imageUrl);
  const cacheBustToken = useMemo(() => Date.now().toString(), []);

  // Reset image error state when question or resolved image changes
  useEffect(() => {
    setImageError(false);
  }, [currentIdx, resolvedCurrentImage]);

  // Init Pyodide in background
  useEffect(() => {
    const loadEngine = async () => {
      try {
        await initPyodide();
        setPyodideReady(true);
      } catch (e) {
        console.error("Pyodide failed to load", e);
      }
    };
    loadEngine();
  }, []);


  // --- SHORTCUTS & RUN LOGIC ---
  const handleRun = async () => {
    if (isRunning) return; // Prevent double run
    setIsRunning(true);
    const code = answers[currentQ.id];
    
    // Clear previous output first
    setOutputs(prev => ({ ...prev, [currentQ.id]: "" }));

    try {
        await runPythonCodeLocal(
            code, 
            (currentOutput) => {
                setOutputs(prev => {
                    const old = prev[currentQ.id] || "";
                    return { ...prev, [currentQ.id]: old + currentOutput };
                });
            },
            () => {
                return new Promise<string>((resolve) => {
                    setInputValue("");
                    resolveInputRef.current = resolve;
                    setInputPending(true);
                });
            }
        );
    } catch (e: any) {
        setOutputs(prev => ({ ...prev, [currentQ.id]: (prev[currentQ.id] || "") + `\n系统错误: ${e.message}` }));
    }
    
    setIsRunning(false);
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

        // CapsLock Listener
        if (e.getModifierState("CapsLock") !== capsLock) {
            setCapsLock(e.getModifierState("CapsLock"));
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
       if (e.getModifierState("CapsLock") !== capsLock) {
        setCapsLock(e.getModifierState("CapsLock"));
      }
    };

    const handleCompositionStart = () => setImeActive(true);
    const handleCompositionEnd = () => setImeActive(false);

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('compositionstart', handleCompositionStart);
    window.addEventListener('compositionend', handleCompositionEnd);

    // Clock Interval
    const clockInterval = setInterval(() => {
        setSystemTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);

    // Network Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('compositionstart', handleCompositionStart);
        window.removeEventListener('compositionend', handleCompositionEnd);
        clearInterval(clockInterval);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [capsLock, isRunning, pyodideReady, currentIdx, answers]); // Deps for handleRun closure

  useEffect(() => {
    const electronRequire = (window as any).electronRequire || (window as any).require;
    if (!electronRequire) return;
    const { ipcRenderer } = electronRequire('electron');
    ipcRenderer.invoke('ime-status-get').then((payload: { open: boolean; name?: string } | null) => {
      if (payload) setImeStatus(payload);
    }).catch(() => {});
    const handler = (_event: any, payload: { open: boolean; name?: string }) => {
      setImeStatus(payload);
    };
    ipcRenderer.on('ime-status', handler);
    return () => {
      ipcRenderer.removeListener('ime-status', handler);
    };
  }, []);

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
      if (resolveInputRef.current) {
          setOutputs(prev => ({
              ...prev,
              [currentQ.id]: (prev[currentQ.id] || "") + inputValue + "\n"
          }));
          
          resolveInputRef.current(inputValue);
          resolveInputRef.current = null;
          setInputPending(false);
      }
  };

  const handleSafeSystemExit = () => {
    if ((window as any).require) {
        onSystemExit();
    } else {
        setInfoMessage("这是网页预览模式，无法关闭窗口。\n在打包后的应用中将直接退出系统。");
        setInfoModalOpen(true);
    }
  };

  const generateTxtReport = (score: number, gradingResults: Record<string, GradingResult>) => {
    const lines = [];
    lines.push("================================================================");
    lines.push(`               PYTHON 智能考试系统 - 考试报告`);
    lines.push("================================================================");
    lines.push(`考生姓名: ${user.name}`);
    lines.push(`考生学号: ${user.studentId}`);
    lines.push(`考试科目: ${config.examTitle}`);
    lines.push(`交卷时间: ${new Date().toLocaleString()}`);
    lines.push(`最终得分: ${score} 分`);
    lines.push("================================================================\n");

    questions.forEach((q, idx) => {
      const res = gradingResults[q.id];
      lines.push(`题目 ${idx + 1}: ${q.title} (${q.difficulty}) - [${q.points}分]`);
      lines.push(`----------------------------------------------------------------`);
      lines.push(`[学生代码]`);
      lines.push(answers[q.id] || "(未作答)");
      lines.push(`\n[运行得分]: ${res.score} / 100`);
      lines.push(`[逻辑反馈]: ${res.logic_feedback}`);
      lines.push(`[改进建议]: ${res.suggestion}`);
      lines.push(`\n`);
    });

    lines.push("================================================================");
    lines.push("End of Report");
    return lines.join("\n");
  };

  const finishExam = async () => {
    setSubmitModalOpen(false);
    setIsSubmitting(true);
    
    // Step 1: AI Grading
    setSubmissionStep("grading");
    const gradingPromises = questions.map(async (q) => {
      const code = answers[q.id];
      if (!code || code === q.template) {
        return { 
          id: q.id, 
          result: { passed: false, score: 0, logic_feedback: "未作答", quality_feedback: "N/A", suggestion: "下次尝试一下吧。" } as GradingResult 
        };
      }
      const result = await gradeQuestion(q.title, q.description, code);
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

    const finalCalculatedScore = Math.round(score);
    setResults(newResults);
    setFinalScore(finalCalculatedScore);
    
    // Step 2: Generate Report Content
    setSubmissionStep("generating");
    await new Promise(r => setTimeout(r, 500)); 
    
    const txtContent = generateTxtReport(finalCalculatedScore, newResults);
    const filename = `${user.name}_${user.studentId}_ExamReport.txt`;
    
    // Step 3: Cloud Upload
    setSubmissionStep("uploading");
    
    const reportData: ExamReport = {
      timestamp: new Date().toISOString(),
      totalScore: finalCalculatedScore,
      studentName: user.name,
      studentId: user.studentId,
      results: newResults,
      questions,
      answers
    };

    const uploadResult = await cloudService.uploadExamReport(user.studentId, filename, txtContent, reportData);
    setUploadStatus(uploadResult);

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
                 AI 智能批改中
              </div>
              <div className={`flex items-center gap-2 ${submissionStep === 'generating' ? 'text-blue-400 animate-pulse' : submissionStep === 'uploading' ? 'text-green-400' : 'text-slate-600'}`}>
                 {submissionStep === 'generating' ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} 
                 生成考试数据
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] p-8 font-sans text-slate-200 flex flex-col items-center justify-center relative overflow-hidden">
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
             <div className="p-2 bg-slate-700 rounded-full shrink-0">
               <AlertCircle className="w-6 h-6 text-blue-400" />
             </div>
             <p className="text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{infoMessage}</p>
          </div>
        </Modal>

        <div className="max-w-4xl w-full bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-slate-950/50 p-8 text-center border-b border-slate-800">
             <div className="inline-block bg-blue-900/30 p-4 rounded-full mb-4 ring-1 ring-blue-500/50">
               <Brain className="w-12 h-12 text-blue-400" />
             </div>
             <h2 className="text-3xl font-bold text-white mb-2">考试结束</h2>
             <p className="text-slate-400">最终得分</p>
             <div className="text-6xl font-bold text-blue-400 mt-2">{finalScore}</div>
             
             <div className="flex justify-center gap-4 mt-6">
                {uploadStatus?.success ? (
                  <div className="flex items-center gap-2 text-xs bg-blue-900/20 text-blue-400 px-3 py-1.5 rounded-full border border-blue-900/50">
                     <CloudUpload className="w-3 h-3"/> 成绩已上传云端
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs bg-orange-900/20 text-orange-400 px-3 py-1.5 rounded-full border border-orange-900/50" title={uploadStatus?.error}>
                     <AlertTriangle className="w-3 h-3"/> 云端上传失败 (已存本地)
                  </div>
                )}
             </div>
          </div>
          
          <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar bg-slate-900/30">
            {questions.map((q, idx) => {
              const res = results[q.id];
              const pts = Math.round((res.score / 100) * (q.points || 0));
              return (
                <div key={q.id} className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 hover:border-slate-600 transition-colors">
                   <div className="flex justify-between items-start mb-3">
                     <div>
                       <h3 className="font-bold text-white text-lg">{idx + 1}. {q.title}</h3>
                       <div className="flex gap-2 mt-1">
                          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{q.difficulty}</span>
                          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">满分: {q.points} 分</span>
                       </div>
                     </div>
                     <div className="text-right">
                       <div className={`text-xl font-bold ${res.passed ? 'text-green-400' : 'text-red-400'}`}>{pts} 分</div>
                       <div className="text-xs text-slate-500">AI 评分: {res.score}%</div>
                     </div>
                   </div>
                   <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
                     <div className="bg-slate-900/80 p-3 rounded border border-slate-800/80">
                        <span className="text-purple-400 font-bold block mb-1">逻辑反馈</span>
                        <p className="text-slate-400">{res.logic_feedback}</p>
                     </div>
                     <div className="bg-slate-900/80 p-3 rounded border border-slate-800/80">
                        <span className="text-yellow-400 font-bold block mb-1">改进建议</span>
                        <p className="text-slate-400">{res.suggestion}</p>
                     </div>
                   </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex justify-center gap-4">
            <Button onClick={onExit} variant="secondary"><LogOut className="w-4 h-4"/> 返回首页</Button>
            <Button onClick={handleSafeSystemExit} className="bg-red-600 hover:bg-red-500 shadow-red-900/20"><Power className="w-4 h-4"/> 退出系统</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex overflow-hidden font-sans">
      <Modal 
        isOpen={submitModalOpen} 
        onClose={() => setSubmitModalOpen(false)}
        title="提交试卷"
        footer={
           <>
             <Button variant="secondary" onClick={() => setSubmitModalOpen(false)}>取消</Button>
             <Button onClick={() => finishExam()}>确认交卷</Button>
           </>
        }
      >
        <p>确定要提交试卷吗？提交后将无法修改答案。</p>
        <p className="text-xs text-slate-500 mt-2">注意：提交后系统将自动生成考试报告并上传至云端。</p>
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
        <div className="p-4 border-b border-slate-800 bg-slate-950/30">
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
          <Button className="w-full py-3" onClick={() => setSubmitModalOpen(true)}>
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
                
                {/* Input Method Status (Clear Visual Indicator) */}
                <div 
                   className="flex items-center gap-2 px-3 py-1.5 border rounded-full select-none bg-slate-900 border-slate-700"
                >
                    <div className={`flex items-center gap-1.5 ${capsLock ? 'text-blue-400' : 'text-slate-500'}`}>
                        <Keyboard className="w-4 h-4" />
                        <span className="text-xs font-bold tracking-wide">
                            CAPS: {capsLock ? 'ON' : 'OFF'}
                        </span>
                    </div>
                    <div className="w-px h-3 bg-slate-700"></div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-bold">
                      {(imeStatus ? imeStatus.open : imeActive) ? '中' : '英'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {imeStatus?.name || '输入法'}
                    </span>
                </div>

                <button
                  onClick={onToggleTheme}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors select-none"
                  title={theme === 'light' ? '切换到深色' : '切换到浅色'}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
                </button>

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

                {/* System Clock */}
                <div className="flex items-center gap-2 text-slate-400 select-none">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-mono tracking-wide">{systemTime}</span>
                </div>
            </div>
         </header>

         <div className="flex-1 flex min-h-0">
            {/* Description Panel */}
            <div className="w-[40%] bg-slate-900/50 border-r border-slate-800 flex flex-col min-h-0">
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
                          className="rounded-lg border border-slate-700 bg-black/20 w-80 h-auto max-w-full shadow-lg hover:opacity-90 transition-opacity min-h-[100px]"
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

            {/* Editor & Terminal */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
               <div className="flex-1 min-h-0">
                  <CodeEditor 
                    code={answers[currentQ.id]} 
                    onChange={(val) => setAnswers(prev => ({ ...prev, [currentQ.id]: val }))} 
                    onRun={handleRun}
                    isRunning={isRunning}
                    theme={theme}
                  />
               </div>
               
               <div className="h-72 shrink-0 relative">
                  <TerminalOutput
                    output={outputs[currentQ.id] || null}
                    loading={isRunning}
                    inputPending={inputPending}
                    inputValue={inputValue}
                    onInputChange={setInputValue}
                    onInputSubmit={submitInput}
                    theme={theme}
                  />
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default StudentExam;
