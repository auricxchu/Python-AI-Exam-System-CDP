
import React, { useState, useEffect } from 'react';
import { Code, GraduationCap, Presentation, ChevronRight, Monitor, LogOut, Key, Power, AlertCircle, Loader2, Wifi, WifiOff, Sun, Moon } from 'lucide-react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentExam from './components/StudentExam';
import { storageService } from './services/storageService';
import { cloudService } from './services/cloudService';
import { ExamConfig, Question, UserProfile } from './types';
import { Button, Input } from './components/ui';
import Modal from './components/Modal';

type AppMode = 'landing' | 'teacher_login' | 'teacher_dash' | 'student_login' | 'student_exam';

const shuffleArray = (array: any[]) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const generateQuestions = (pool: Question[], rules: any): Question[] => {
  const simple = pool.filter(q => q.difficulty === '简单');
  const medium = pool.filter(q => q.difficulty === '中等');
  const hard = pool.filter(q => q.difficulty === '困难');

  const select = (source: Question[], rule: any) => {
    return shuffleArray(source).slice(0, rule.count || 0).map(q => ({...q, points: rule.points}));
  };

  return [
    ...select(simple, rules['简单']),
    ...select(medium, rules['中等']),
    ...select(hard, rules['困难'])
  ];
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('landing');
  const [config, setConfig] = useState<ExamConfig>(storageService.loadConfig());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('app_theme');
    return stored === 'dark' ? 'dark' : 'light';
  });
  
  // UI State for Modals
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCheckingNet, setIsCheckingNet] = useState(false);

  // Student State
  const [studentUser, setStudentUser] = useState<UserProfile | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);

  // Sync config from cloud on load
  useEffect(() => {
    const syncConfig = async () => {
        const cloudConfig = await cloudService.fetchExamConfig();
        if (cloudConfig) {
            console.log("App: Synced exam config from cloud");
            setConfig(cloudConfig);
        }
    };
    syncConfig();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Helper to show custom alerts
  const showAppAlert = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const checkNetworkConnectivity = async () => {
    try {
        const checks = [
            // Check Pyodide CDN
            fetch("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js", { method: 'HEAD', mode: 'no-cors' }),
            // Check Monaco Editor CDN (Critical for UI)
            fetch("https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js", { method: 'HEAD', mode: 'no-cors' })
        ];

        await Promise.all(checks);
        return true;
    } catch (e) {
        console.error("Network check failed", e);
        return false;
    }
  };

  const handleTeacherLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = (e.target as any).password.value;
    // Password is set here. Change 'admin' to your desired password.
    if (pwd === 'admin') setMode('teacher_dash');
    else showAppAlert('管理密码错误，请重试。');
  };

  const handleStudentStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.target as any).name.value;
    const sid = (e.target as any).sid.value;
    const accessKey = (e.target as any).accessKey?.value;

    // Validate Student ID (Must be 11 digits)
    if (!/^\d{11}$/.test(sid)) {
        showAppAlert("学号格式错误：必须为11位数字");
        return;
    }

    // Check Access Key if configured
    if (config.accessKey && config.accessKey.trim() !== "") {
        if (accessKey !== config.accessKey) {
            showAppAlert("考试密钥错误，请向监考老师获取。");
            return;
        }
    }

    if (name && sid) {
      setIsCheckingNet(true);
      // Artificial delay to make check visible and ensure UI updates
      const [isOnline] = await Promise.all([
          checkNetworkConnectivity(),
          new Promise(r => setTimeout(r, 800))
      ]);
      setIsCheckingNet(false);

      if (!isOnline) {
          showAppAlert("网络连接检测失败。\n\n系统无法连接到必要的资源服务器 (CDN)。\n请确保设备已连接互联网，因为本系统需要在线加载 Pyodide 运行环境和编辑器资源。");
          return;
      }

      setStudentUser({ name, studentId: sid, joinedAt: new Date().toISOString() });
      const questions = generateQuestions(config.questionBank, config.ruleSettings);
      if (questions.length === 0) {
        showAppAlert("组卷失败: 题库题目不足，请联系老师。");
        return;
      }
      setExamQuestions(questions);
      setMode('student_exam');
    }
  };

  const handleSystemExit = () => {
    // Check if we are in Electron environment (check for our aliased require)
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
      // Browser environment fallback
      showAppAlert("这是网页预览模式，无法关闭窗口。\n在打包后的应用中将直接退出系统。");
    }
  };

  if (mode === 'teacher_dash') {
    return (
      <TeacherDashboard
        config={config}
        onUpdateConfig={setConfig}
        onExit={() => setMode('landing')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (mode === 'student_exam' && studentUser) {
    return (
      <StudentExam 
        user={studentUser} 
        config={config} 
        questions={examQuestions} 
        onExit={() => setMode('landing')} 
        onSystemExit={handleSystemExit}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans text-slate-200">
      {/* Background FX */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
         <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-indigo-500/10 rounded-full blur-[120px]" />
         <div className="absolute -bottom-[20%] -right-[10%] w-[70%] h-[70%] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/70 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          title={theme === 'light' ? '切换到深色' : '切换到浅色'}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
        </button>
      </div>

      {/* Global Alert Modal for Landing/Login Screens */}
      <Modal 
        isOpen={errorModalOpen} 
        onClose={() => setErrorModalOpen(false)} 
        title="系统提示"
        footer={<Button onClick={() => setErrorModalOpen(false)}>知道了</Button>}
      >
        <div className="flex items-start gap-4">
           <div className="p-2 bg-slate-700 rounded-full shrink-0">
             <AlertCircle className="w-6 h-6 text-blue-400" />
           </div>
           <p className="text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{errorMessage}</p>
        </div>
      </Modal>

      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center">
        {mode === 'landing' && (
          <>
            <div className="bg-slate-800/50 p-6 rounded-2xl mb-8 border border-slate-700 ring-1 ring-white/5 backdrop-blur-sm shadow-xl">
               <Code className="w-12 h-12 text-blue-400" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 text-center tracking-tight drop-shadow-lg">
              Python 智能考试系统
            </h1>
            <p className="text-slate-400 text-lg mb-16 text-center max-w-2xl">
              基于 AI 的自动化测评与管理平台
            </p>

            <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl mb-12">
              <button 
                onClick={() => setMode('student_login')}
                className="group relative bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-blue-500/50 rounded-2xl p-10 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/20 text-left overflow-hidden backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-8">
                   <div className="bg-blue-900/20 p-4 rounded-xl group-hover:scale-110 transition-transform ring-1 ring-blue-500/20">
                     <GraduationCap className="w-8 h-8 text-blue-400" />
                   </div>
                   <GraduationCap className="w-32 h-32 text-slate-800/50 absolute -right-6 -bottom-6 group-hover:text-blue-900/10 transition-colors transform rotate-12" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">我是学生</h2>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">参加在线考试，实时代码运行与 AI 智能批改。</p>
                <div className="flex items-center text-blue-400 font-bold text-sm">
                   进入考试 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              <button 
                onClick={() => setMode('teacher_login')}
                className="group relative bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-purple-500/50 rounded-2xl p-10 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/20 text-left overflow-hidden backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-8">
                   <div className="bg-purple-900/20 p-4 rounded-xl group-hover:scale-110 transition-transform ring-1 ring-purple-500/20">
                     <Monitor className="w-8 h-8 text-purple-400" />
                   </div>
                   <Monitor className="w-32 h-32 text-slate-800/50 absolute -right-6 -bottom-6 group-hover:text-purple-900/10 transition-colors transform -rotate-6" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">我是老师</h2>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">管理题库，配置试卷规则，查看考试数据。</p>
                <div className="flex items-center text-purple-400 font-bold text-sm">
                   进入后台 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
            
            {/* System Exit Button (Flow Layout, No Overlap) */}
            <div className="z-20 mt-4">
               <button 
                 onClick={handleSystemExit}
                 className="flex items-center gap-2 text-slate-600 hover:text-red-400/80 transition-colors px-6 py-2 rounded-full hover:bg-slate-800/50 group border border-transparent hover:border-slate-800"
               >
                 <Power className="w-4 h-4 group-hover:scale-110 transition-transform" />
                 <span className="text-sm font-medium">退出系统</span>
               </button>
            </div>
          </>
        )}

        {mode === 'teacher_login' && (
           <div className="w-full max-w-md bg-slate-900/80 p-8 rounded-xl border border-slate-700/50 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-8">
                 <h2 className="text-xl font-bold text-white flex items-center gap-2"><Monitor className="w-5 h-5 text-blue-500"/> 教师管理端</h2>
                 <button onClick={() => setMode('landing')} className="text-slate-500 hover:text-white"><LogOut className="w-4 h-4"/></button>
              </div>
              <form onSubmit={handleTeacherLogin} className="space-y-6">
                 <div>
                   <label className="block text-slate-400 text-xs mb-2">管理密码</label>
                   <input 
                     name="password" 
                     type="password" 
                     className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition-colors"
                     placeholder="请输入密码"
                   />
                 </div>
                 <Button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/30">进入后台</Button>
              </form>
           </div>
        )}

        {mode === 'student_login' && (
           <div className="w-full max-w-md bg-slate-900/80 p-8 rounded-xl border border-slate-700/50 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
              <div className="text-center mb-8">
                <div className="bg-blue-600/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                  <GraduationCap className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-white">{config.examTitle}</h2>
                <p className="text-xs text-slate-500 mt-1">考试时长: {config.duration} 分钟</p>
              </div>
              <form onSubmit={handleStudentStart} className="space-y-4">
                 <Input name="name" label="姓名" placeholder="请输入姓名" required />
                 <Input name="sid" label="学号" placeholder="请输入11位学号" required maxLength={11} />
                 {config.accessKey && config.accessKey.trim() !== "" && (
                    <Input name="accessKey" label="考试密钥" placeholder="请输入考试访问密钥" required type="password" />
                 )}
                 <div className="flex gap-3 pt-4">
                   <Button type="button" variant="secondary" onClick={() => setMode('landing')} className="flex-1">返回</Button>
                   <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30" isLoading={isCheckingNet}>
                      {isCheckingNet ? "正在检测网络..." : "开始考试"}
                   </Button>
                 </div>
              </form>
           </div>
        )}
      </div>
      
      <div className="absolute bottom-4 text-slate-600 text-[10px] tracking-wide">
        &copy; 2024 Python Exam System. All Rights Reserved.
      </div>
    </div>
  );
}
