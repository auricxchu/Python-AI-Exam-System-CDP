
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Code, GraduationCap, ChevronRight, ChevronLeft, Monitor, Key, Power, AlertCircle, Sun, Moon, Eye, EyeOff, WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentExam from './components/StudentExam';
import { storageService } from './services/storageService';
import { cloudService } from './services/cloudService';
import { AiProvider, AiProviderSettings, clearRuntimeAiSettings, clearStoredAiSettings, getAiSettings, getAvailableProviders, setRuntimeAiSettings, testProviderConnection } from './services/aiService';
import { fetchCloudAiSettings, saveCloudAiSettings } from './services/aiCloudService';
import { DEFAULT_TEACHER_PASSWORD, hasCustomAdminPassword, verifyAdminPassword } from './services/adminAuthService';
import { ExamConfig, Question, UserProfile } from './types';
import { Button, Input, ToolbarButton } from './components/ui';
import Modal from './components/Modal';
import OpeningScreen, { OPENING_TIMING } from './components/OpeningScreen';
import UpdateModal from './components/UpdateModal';

import { teacherSessionService } from './services/teacherSessionService';
import { buildExamQuestions, normalizeExamConfig } from './services/examConfigService';
import { SUPABASE_URL } from './services/supabaseClient';
import { useNetworkStatus, isNetworkError } from './hooks/useNetworkStatus';
import pkg from './package.json';

type AppMode = 'landing' | 'teacher_login' | 'teacher_dash' | 'student_login' | 'student_exam';
type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';
const OPENING_SEEN_KEY = 'app_opening_seen_v2';
type TeacherLoginForm = HTMLFormElement & {
  password: HTMLInputElement;
};

type StudentLoginForm = HTMLFormElement & {
  name: HTMLInputElement;
  sid: HTMLInputElement;
  accessKey?: HTMLInputElement;
};

const LOCAL_RUNTIME_ASSET_PATHS = [
  'pyodide/pyodide.js',
  'monaco/vs/loader.js'
];

const REMOTE_RUNTIME_ASSET_URLS = [
  "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js",
  "https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js"
];

const APP_VERSION = `v${pkg.version}`;

function isForcedUpdate(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [curMajor, curMinor] = parse(current);
  const [latMajor, latMinor] = parse(latest);
  if (latMajor > curMajor) return true;
  if (latMajor === curMajor && latMinor > curMinor) return true;
  return false;
}

function getDeviceInfo(): string {
  const parts: string[] = [APP_VERSION];

  // Prefer Electron's precise process API
  try {
    const p = (window as any).process;
    if (p?.platform) {
      const plat: string = p.platform;
      let os = '';

      if (plat === 'darwin') {
        const raw = p.getSystemVersion?.() || '';
        const ver = raw.split('.').slice(0, 2).join('.');
        os = ver ? `macOS ${ver}` : 'macOS';
      } else if (plat === 'win32') {
        const raw = p.getSystemVersion?.() || '';
        const build = parseInt(raw.split('.')[2]) || 0;
        os = build >= 22000 ? 'Windows 11' : 'Windows 10';
      } else if (plat === 'linux') {
        os = 'Linux';
      }

      if (os) {
        const arch = p.arch;
        parts.push(arch ? `${os} (${arch})` : os);
      }
    }
  } catch {}

  // Fallback: parse navigator
  if (parts.length <= 1) {
    const ua = navigator.userAgent;
    const platform = navigator.platform || '';
    let os = '';

    if (platform.startsWith('Mac')) {
      os = 'macOS';
    } else if (ua.includes('Windows')) {
      os = 'Windows';
    } else if (ua.includes('Linux')) {
      os = 'Linux';
    } else {
      os = platform || 'Unknown';
    }

    let arch = '';
    if (platform.includes('ARM') || ua.includes('arm64') || ua.includes('aarch64')) {
      arch = 'arm64';
    } else if (platform.includes('x86_64') || ua.includes('x64') || ua.includes('Win64') || ua.includes('WOW64')) {
      arch = 'x64';
    }

    parts.push(arch ? `${os} (${arch})` : os);
  }

  // Screen
  parts.push(`${screen.width}×${screen.height}`);

  // CPU
  const cores = navigator.hardwareConcurrency;
  if (cores) parts.push(`${cores}核`);

  // Memory (Chrome/Electron only)
  const mem = (navigator as any).deviceMemory;
  if (mem) parts.push(`${mem}GB`);

  return parts.join(' · ');
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('landing');
  const [config, setConfig] = useState<ExamConfig>(() => normalizeExamConfig(storageService.loadConfig()));
  const [openingDone, setOpeningDone] = useState(false);
  const [openingVariant, setOpeningVariant] = useState<'full' | 'lite'>(() => (
    localStorage.getItem(OPENING_SEEN_KEY) === '1' ? 'lite' : 'full'
  ));
  const [landingAnimKey, setLandingAnimKey] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('app_theme');
    return stored === 'dark' ? 'dark' : 'light';
  });
  
  // UI State for Modals
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCheckingNet, setIsCheckingNet] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    const stored = localStorage.getItem('app_ai_provider') as AiProvider | null;
    const defaults: AiProvider[] = ['deepseek', 'openai', 'qwen', 'moonshot', 'gemini'];
    return stored && defaults.includes(stored) ? stored : 'deepseek';
  });
  const [providerStatus, setProviderStatus] = useState<Record<AiProvider, 'idle' | 'checking' | 'ok' | 'fail'>>({
    deepseek: 'idle',
    gemini: 'idle',
    openai: 'idle',
    qwen: 'idle',
    moonshot: 'idle'
  });
  const [isCheckingProviders, setIsCheckingProviders] = useState(false);
  const modelWheelRef = useRef<HTMLDivElement | null>(null);
  const aiProviderRef = useRef<AiProvider>(aiProvider);
  const [aiGuardOpen, setAiGuardOpen] = useState(false);
  const [aiGuardNextMode, setAiGuardNextMode] = useState<AppMode | null>(null);
  const [aiGuardMessage, setAiGuardMessage] = useState("");
  const [apiSettings, setApiSettings] = useState<AiProviderSettings>(() => getAiSettings());
  const [isCheckingTeacherLogin, setIsCheckingTeacherLogin] = useState(false);


  // Update State
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateForced, setUpdateForced] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState('');
  const [updateReleaseNotes, setUpdateReleaseNotes] = useState('');
  const [updateReleaseDate, setUpdateReleaseDate] = useState('');
  const modeRef = useRef<AppMode>(mode);
  const pendingUpdateRef = useRef<{ version: string; forced: boolean; releaseNotes?: string; releaseDate?: string } | null>(null);
  const initialUpdateCheckStartedRef = useRef(false);
  const updateCheckSourceRef = useRef<'auto' | 'manual' | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Check pending update when leaving exam mode
  useEffect(() => {
    if (mode !== 'student_exam' && pendingUpdateRef.current) {
      const pending = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      setUpdateVersion(pending.version);
      setUpdateForced(pending.forced);
      setUpdateReleaseNotes(pending.releaseNotes || '');
      setUpdateReleaseDate(pending.releaseDate || '');
      setUpdateStatus('available');
      if (pending.forced) {
        const ipc = getIpc();
        if (ipc) {
          ipc.send('download-update');
          setUpdateStatus('downloading');
        }
      }
    }
  }, [mode]);

  // IPC update event listeners
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;

    const onChecking = () => {
      if (updateCheckSourceRef.current === 'manual') {
        setUpdateStatus('checking');
      }
    };

    const clearCheckTimeout = () => {
      if (checkTimeoutRef.current) {
        window.clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
    };

    const onAvailable = (_event: any, info: { version: string; releaseNotes?: string; releaseDate?: string; releaseName?: string }) => {
      clearCheckTimeout();
      const forced = isForcedUpdate(APP_VERSION, info.version);
      if (modeRef.current === 'student_exam') {
        pendingUpdateRef.current = { version: info.version, forced, releaseNotes: info.releaseNotes, releaseDate: info.releaseDate };
        return;
      }
      setUpdateVersion(info.version);
      setUpdateForced(forced);
      setUpdateReleaseNotes(info.releaseNotes || '');
      setUpdateReleaseDate(info.releaseDate || '');
      setUpdateStatus('available');
      if (forced) {
        ipc.send('download-update');
        setUpdateStatus('downloading');
      }
    };

    const onNotAvailable = () => {
      clearCheckTimeout();
      if (updateCheckSourceRef.current === 'manual') {
        setUpdateStatus('up-to-date');
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
          setUpdateStatus((prev) => (prev === 'up-to-date' ? 'idle' : prev));
        }, 3000);
      } else {
        setUpdateStatus((prev) => (prev === 'checking' ? 'idle' : prev));
      }
      updateCheckSourceRef.current = null;
    };

    const onProgress = (_event: any, info: { percent: number }) => {
      setUpdateProgress(info.percent);
      setUpdateStatus('downloading');
    };

    const onDownloaded = (_event: any, info: { version: string }) => {
      clearCheckTimeout();
      setUpdateVersion(info.version);
      setUpdateProgress(100);
      setUpdateStatus('downloaded');
      updateCheckSourceRef.current = null;
    };

    const onError = (_event: any, info: { message: string }) => {
      clearCheckTimeout();
      if (updateCheckSourceRef.current !== 'manual') {
        setUpdateError('');
        setUpdateStatus((prev) => (prev === 'checking' || prev === 'downloading' ? 'idle' : prev));
        updateCheckSourceRef.current = null;
        return;
      }
      setUpdateError(info.message);
      setUpdateStatus('error');
      updateCheckSourceRef.current = null;
    };

    ipc.on('checking-for-update', onChecking);
    ipc.on('update-available', onAvailable);
    ipc.on('update-not-available', onNotAvailable);
    ipc.on('download-progress', onProgress);
    ipc.on('update-downloaded', onDownloaded);
    ipc.on('update-error', onError);

    return () => {
      ipc.removeListener('checking-for-update', onChecking);
      ipc.removeListener('update-available', onAvailable);
      ipc.removeListener('update-not-available', onNotAvailable);
      ipc.removeListener('download-progress', onProgress);
      ipc.removeListener('update-downloaded', onDownloaded);
      ipc.removeListener('update-error', onError);
    };
  }, []);

  // Helper: get ipcRenderer in Electron (check for our aliased require)
  const getIpc = (): any => {
    const electronRequire = (window as any).electronRequire || (window as any).require;
    if (!electronRequire) return null;
    const { ipcRenderer } = electronRequire('electron');
    return ipcRenderer || null;
  };

  // Update action handlers
  const checkTimeoutRef = useRef<number | null>(null);

  const handleCheckUpdate = () => {
    const ipc = getIpc();
    if (!ipc) {
      updateCheckSourceRef.current = 'manual';
      setUpdateStatus('error');
      setUpdateError('当前环境不支持更新检查。');
      return;
    }
    updateCheckSourceRef.current = 'manual';
    setUpdateStatus('checking');
    setUpdateError('');
    ipc.send('check-for-update');
    if (checkTimeoutRef.current) window.clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = window.setTimeout(() => {
      setUpdateStatus((prev) => (prev === 'checking' ? 'error' : prev));
      setUpdateError('检查超时，请稍后重试。');
    }, 10000);
  };

  const handleDownloadUpdate = () => {
    const ipc = getIpc();
    if (!ipc) return;
    updateCheckSourceRef.current = 'manual';
    setUpdateStatus('downloading');
    ipc.send('download-update');
  };

  const handleSkipUpdate = () => {
    const ipc = getIpc();
    if (ipc) ipc.send('skip-update');
    updateCheckSourceRef.current = null;
    setUpdateStatus('idle');
  };

  const handleRestartUpdate = () => {
    const ipc = getIpc();
    if (ipc) ipc.send('quit-and-install');
  };

  const handleDismissUpdate = () => {
    updateCheckSourceRef.current = null;
    setUpdateStatus('idle');
  };

  // Student State
  const [studentUser, setStudentUser] = useState<UserProfile | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);

  // Global network status
  const { isOnline } = useNetworkStatus();
  const [configSyncStatus, setConfigSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'offline' | 'error'>('idle');

  // Sync config from cloud on load
  useEffect(() => {
    const syncConfig = async () => {
        setConfigSyncStatus('loading');
        if (!navigator.onLine) {
          console.warn("App: Device is offline, skipping cloud config sync");
          setConfigSyncStatus('offline');
          return;
        }
        const cloudConfig = await cloudService.fetchExamConfig();
        if (cloudConfig) {
            console.log("App: Synced exam config from cloud");
            setConfig(normalizeExamConfig(cloudConfig));
            setConfigSyncStatus('synced');
        } else {
            setConfigSyncStatus('error');
        }
    };
    syncConfig();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('app_theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('app_ai_provider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    if (mode === 'landing') {
      setLandingAnimKey((prev) => prev + 1);
    }
  }, [mode]);

  const handleOpeningComplete = useCallback(() => {
    setOpeningDone(true);
    if (openingVariant === 'full') {
      localStorage.setItem(OPENING_SEEN_KEY, '1');
      setOpeningVariant('lite');
    }
  }, [openingVariant]);

  useEffect(() => {
    if (openingDone) return;
    const fallbackMs = openingVariant === 'lite'
      ? OPENING_TIMING.lite.fallbackMs
      : OPENING_TIMING.full.fallbackMs;
    const timer = window.setTimeout(handleOpeningComplete, fallbackMs);
    return () => window.clearTimeout(timer);
  }, [handleOpeningComplete, openingDone, openingVariant]);

  useEffect(() => {
    if (openingDone && mode === 'landing') {
      setLandingAnimKey((prev) => prev + 1);
    }
  }, [openingDone, mode]);

  useEffect(() => {
    aiProviderRef.current = aiProvider;
  }, [aiProvider]);

  useEffect(() => {
    const handleStorage = () => {
      setApiSettings(getAiSettings());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const providerOptions: { id: AiProvider; label: string; desc: string }[] = [
    { id: 'deepseek', label: 'Deepseek', desc: 'deepseek-chat' },
    { id: 'openai', label: 'OpenAI', desc: 'gpt-4o-mini' },
    { id: 'qwen', label: '通义千问', desc: 'qwen-plus' },
    { id: 'moonshot', label: 'Moonshot', desc: 'moonshot-v1-8k' },
    { id: 'gemini', label: 'Gemini', desc: 'gemini-1.5-flash' }
  ];

  const modelSelectorCopy = {
    title: '模型选择',
    availability: '可用性',
    recheck: '检测',
    checking: '检测中...',
    configuredSuffix: ' 个已配置',
    statusOk: '可用',
    statusFail: '不可用',
    statusChecking: '检测中...',
    statusUnknown: '未检测'
  };


  const checkProviders = async () => {
    if (isCheckingProviders) return;
    setIsCheckingProviders(true);
    const targets: AiProvider[] = ['deepseek', 'openai', 'qwen', 'moonshot', 'gemini'];
    setProviderStatus(prev => {
      const next = { ...prev };
      targets.forEach(key => { next[key] = 'checking'; });
      return next;
    });

    await Promise.allSettled(
      targets.map(async (key) => {
        const ok = await testProviderConnection(key);
        setProviderStatus(prev => ({
          ...prev,
          [key]: ok ? 'ok' : 'fail'
        }));
      })
    );

    setIsCheckingProviders(false);
  };

  const handleSaveApiSettings = async (draftSettings: AiProviderSettings = apiSettings) => {
    const next = setRuntimeAiSettings(draftSettings);
    setApiSettings(next);
    const cloudResult = await saveCloudAiSettings(next);
    if (!cloudResult.success) {
      return cloudResult;
    }
    clearStoredAiSettings();
    checkProviders();
    return cloudResult;
  };

  useEffect(() => {
    if (mode === 'landing') {
      checkProviders();
    }
  }, [mode]);

  const scrollModelWheel = (direction: 'left' | 'right') => {
    const el = modelWheelRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-provider]'));
    if (!items.length) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenter = itemRect.left + itemRect.width / 2;
      const distance = Math.abs(itemCenter - centerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    const nextIndex = direction === 'left'
      ? Math.max(0, closestIndex - 1)
      : Math.min(items.length - 1, closestIndex + 1);
    items[nextIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    window.setTimeout(() => {
      updateCenterSelection();
    }, 350);
  };

  const scrollModelWheelToProvider = (provider: AiProvider, behavior: ScrollBehavior = 'smooth') => {
    const el = modelWheelRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLButtonElement>(`[data-provider="${provider}"]`);
    if (!item) return;
    item.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
    window.setTimeout(() => {
      updateCenterSelection();
    }, behavior === 'smooth' ? 350 : 0);
  };

  const updateCenterSelection = () => {
    const el = modelWheelRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-provider]'));
    if (!items.length) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    let closest: { id: AiProvider; distance: number } | undefined;
    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenter = itemRect.left + itemRect.width / 2;
      const distance = Math.abs(itemCenter - centerX);
      const id = item.dataset.provider as AiProvider;
      if (!closest || distance < closest.distance) {
        closest = { id, distance };
      }
    });
    if (closest?.id && closest.id !== aiProviderRef.current) {
      setAiProvider(closest.id);
    }
  };

  useEffect(() => {
    if (mode !== 'landing') return;
    const el = modelWheelRef.current;
    if (!el) return;
    let idleTimer: number | undefined;
    const onScroll = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        updateCenterSelection();
      }, 120);
    };
    const onResize = () => updateCenterSelection();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    updateCenterSelection();
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'landing') return;
    scrollModelWheelToProvider(aiProviderRef.current, 'auto');
  }, [mode]);

  const getAiAvailability = () => {
    const available = getAvailableProviders();
    if (!available.includes(aiProviderRef.current)) {
      return { ok: false, reason: '当前选中的 AI 模型未配置或不可用。' };
    }
    if (providerStatus[aiProviderRef.current] === 'fail') {
      return { ok: false, reason: '当前选中的 AI 模型不可用。' };
    }
    return { ok: true, reason: '' };
  };

const requestEnterMode = (nextMode: AppMode) => {
    if (nextMode !== 'student_login' && nextMode !== 'teacher_login') {
      setMode(nextMode);
      return;
    }
    const { ok, reason } = getAiAvailability();
    if (ok) {
      setMode(nextMode);
      return;
    }
    setAiGuardNextMode(nextMode);
    setAiGuardMessage(`${reason}这可能导致批改或生成功能不可用，确定继续吗？`);
    setAiGuardOpen(true);
  };

  const confirmEnterMode = () => {
    if (aiGuardNextMode) {
      setMode(aiGuardNextMode);
    }
    setAiGuardNextMode(null);
    setAiGuardOpen(false);
  };

  

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Helper to show custom alerts
  const showAppAlert = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const checkRuntimeAssets = async () => {
    const probe = async (url: string, init?: RequestInit) => {
      try {
        const response = await fetch(url, init);
        return init?.mode === 'no-cors' ? true : response.ok;
      } catch (error) {
        console.warn("Runtime asset probe failed:", url, error);
        return false;
      }
    };

    const localChecks = await Promise.all(
      LOCAL_RUNTIME_ASSET_PATHS.map((assetPath) =>
        probe(new URL(assetPath, window.location.href).toString(), { method: 'HEAD' })
      )
    );

    if (localChecks.every(Boolean)) {
      return true;
    }

    const remoteChecks = await Promise.all(
      REMOTE_RUNTIME_ASSET_URLS.map((url) => probe(url, { method: 'HEAD', mode: 'no-cors' }))
    );

    if (!remoteChecks.every(Boolean)) return false;

    // Check Supabase backend reachability if configured
    if (SUPABASE_URL) {
      const supabaseOk = await probe(SUPABASE_URL, { method: 'HEAD', mode: 'no-cors' });
      if (!supabaseOk) return false;
    }

    return true;
  };

  // Quick network connectivity probe — independent of cached local assets
  const checkNetworkReachable = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;

    const probeUrls = SUPABASE_URL
      ? [SUPABASE_URL, REMOTE_RUNTIME_ASSET_URLS[0]]
      : REMOTE_RUNTIME_ASSET_URLS;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const results = await Promise.all(
        probeUrls.map((url) =>
          fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal }).then(() => true).catch(() => false)
        )
      );
      return results.some(Boolean);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };

  const verifyLocalIntegrity = async () => {
    try {
      storageService.loadConfig();
      return true;
    } catch (e) {
      console.error('Integrity check failed', e);
      return false;
    }
  };

  const runOpeningInit = async () => {
    await Promise.allSettled([
      checkRuntimeAssets(),
      checkProviders(),
      verifyLocalIntegrity(),
      checkNetworkReachable()
    ]);

    // Trigger update check during opening (silent — only shows modal if update available)
    if (!initialUpdateCheckStartedRef.current) {
      initialUpdateCheckStartedRef.current = true;
      const ipc = getIpc();
      if (ipc) {
        updateCheckSourceRef.current = 'auto';
        ipc.send('check-for-update');
      }
    }
  };

  const handleTeacherLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as TeacherLoginForm;
    const pwd = form.password.value.trim();
    if (!pwd) {
      showAppAlert('请输入管理密码。');
      return;
    }

    setIsCheckingTeacherLogin(true);
    try {
      const cloudConfig = await cloudService.fetchExamConfig();
      const activeConfig = cloudConfig || config;
      const requiresCloudValidation = hasCustomAdminPassword(activeConfig);

      if (requiresCloudValidation && !cloudConfig) {
        if (!navigator.onLine) {
          showAppAlert('网络连接已断开。\n\n当前教师端密码已切换为云端验证，需要联网才能登录。\n请检查网络连接后重试。');
        } else {
          showAppAlert('当前教师端密码已切换为云端验证，但系统暂时无法拉取云端配置。\n请检查网络或稍后重试。');
        }
        return;
      }

      const verified = await verifyAdminPassword(pwd, activeConfig);
      if (!verified) {
        showAppAlert(`管理密码错误，请重试。${!requiresCloudValidation ? `\n当前仍在使用初始本地密码：${DEFAULT_TEACHER_PASSWORD}` : ''}`);
        return;
      }

      teacherSessionService.remember(pwd);
      if (cloudConfig) {
        setConfig(normalizeExamConfig(cloudConfig));
      }
      const cloudAiSettings = await fetchCloudAiSettings();
      if (cloudAiSettings) {
        setApiSettings(setRuntimeAiSettings(cloudAiSettings));
        clearStoredAiSettings();
      }
      setMode('teacher_dash');
    } finally {
      setIsCheckingTeacherLogin(false);
    }
  };

  const handleStudentStart = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as StudentLoginForm;
    const name = form.name.value.trim();
    const sid = form.sid.value.trim();
    const accessKey = form.accessKey?.value;

    // Validate Student ID (Must be 11 digits)
    if (!/^\d{11}$/.test(sid)) {
        showAppAlert("学号格式错误：必须为11位数字。");
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
      if (!navigator.onLine) {
        showAppAlert("网络连接已断开。\n\n系统检测到当前设备未连接互联网，无法进入考试。\n请连接网络后重试。");
        return;
      }

      setIsCheckingNet(true);
      const [isLocalReady, isOnline] = await Promise.all([
          verifyLocalIntegrity(),
          checkRuntimeAssets(),
          new Promise(r => setTimeout(r, 800))
      ]);
      setIsCheckingNet(false);

      if (!isLocalReady) {
          showAppAlert("本地运行环境检查失败。\n\n系统无法读取当前考试配置或基础运行数据。\n请重新安装程序，或联系管理员检查本地文件是否完整。");
          return;
      }

      if (!isOnline) {
          showAppAlert("网络连接检测失败。\n\n系统无法连接到必要的资源服务器，本系统需要在线加载运行环境和编辑器资源。\n请确认设备已连接互联网后重试。");
          return;
      }

      setStudentUser({ name, studentId: sid, joinedAt: new Date().toISOString() });
      const questions = buildExamQuestions(config);
      if (questions.length === 0) {
        showAppAlert(config.assemblyMode === 'manual' ? "组卷失败：当前试卷还没有选择题目，请联系老师。" : "组卷失败：题库题目不足，请联系老师。");
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
        onExit={() => {
          teacherSessionService.clear();
          clearRuntimeAiSettings();
          setMode('landing');
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        aiProvider={aiProvider}
        apiSettings={apiSettings}
        providerStatus={providerStatus}
        isCheckingProviders={isCheckingProviders}
        onSaveApiSettings={handleSaveApiSettings}
        onCheckProviders={checkProviders}
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
        aiProvider={aiProvider}
      />
    );
  }

  return (
    <>
      {!openingDone && (
        <OpeningScreen
          theme={theme}
          variant={openingVariant}
          onInit={runOpeningInit}
          onComplete={handleOpeningComplete}
        />
      )}
      <div className="landing-shell h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] flex flex-col relative overflow-hidden font-sans text-slate-200">
      {/* Background FX */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
         <div className="landing-orb landing-orb--a" />
         <div className="landing-orb landing-orb--b" />
         <div className="landing-orb landing-orb--c" />
      </div>

      {/* Update: toast when no update available */}
      {updateStatus === 'up-to-date' && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          theme === 'light' ? 'bg-green-500 text-white' : 'bg-green-600/90 text-white'
        }`}>
          <CheckCircle className="w-5 h-5" />
          <span className="font-bold text-sm">已是最新版本</span>
        </div>
      )}

      {/* Update: modal for available / downloading / downloaded / error */}
      {(updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded' || updateStatus === 'error') && (
        <UpdateModal
          status={updateStatus}
          version={updateVersion}
          forced={updateForced}
          progress={updateProgress}
          releaseNotes={updateReleaseNotes}
          releaseDate={updateReleaseDate}
          onDownload={handleDownloadUpdate}
          onSkip={handleSkipUpdate}
          onRestart={handleRestartUpdate}
          onDismiss={handleDismissUpdate}
        />
      )}

      {/* Offline full-screen overlay */}
      {!isOnline && openingDone && (
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
            系统检测到网络连接已中断。<br />
            考试需要联网才能进入，AI 评分和云端同步功能需要网络连接。<br />
            请检查网络连接后重试。
          </p>
          <button
            onClick={handleSystemExit}
            className={`mt-4 flex items-center gap-2 px-6 py-2.5 rounded-full border transition-colors text-sm font-medium ${
              theme === 'light'
                ? 'border-slate-300 text-slate-500 hover:text-red-600 hover:border-red-300'
                : 'border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50'
            }`}
          >
            <Power className="w-4 h-4" />
            退出系统
          </button>
        </div>
      )}

      {(mode === 'landing' || mode === 'teacher_login' || mode === 'student_login') && openingDone && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <ToolbarButton
            theme={theme}
            onClick={handleCheckUpdate}
            title="检查更新"
          >
            <RefreshCw className={`w-4 h-4 ${updateStatus === 'checking' || updateStatus === 'downloading' ? 'animate-spin' : ''}`} />
            <span className="text-xs font-medium">{updateStatus === 'checking' ? '检查更新中...' : '检查更新'}</span>
          </ToolbarButton>
          <ToolbarButton
            theme={theme}
            onClick={toggleTheme}
            title={theme === 'light' ? '切换到深色' : '切换到浅色'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
          </ToolbarButton>
        </div>
      )}

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

      <Modal
        isOpen={aiGuardOpen}
        onClose={() => setAiGuardOpen(false)}
        title="AI 模型不可用"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAiGuardOpen(false)}>取消</Button>
            <Button onClick={confirmEnterMode}>继续</Button>
          </>
        }
      >
        <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{aiGuardMessage}</p>
      </Modal>

      <div
        key={`landing-${landingAnimKey}`}
        className={`landing-content flex-1 min-h-0 w-full flex flex-col items-center justify-center px-4 sm:px-6 py-4 ${!openingDone ? 'landing-content--hidden' : ''}`}
      >
        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center" style={{ gap: 'var(--landing-gap)' }}>
          {mode === 'landing' && (
            <>
              <div className="landing-reveal landing-delay-1 bg-slate-800/50 p-4 sm:p-6 rounded-2xl border border-slate-700 ring-1 ring-white/5 backdrop-blur-sm" style={{ marginBottom: 'var(--landing-hero-mb)' }}>
                 <Code className="text-blue-400" style={{ width: 'var(--landing-icon-size)', height: 'var(--landing-icon-size)' }} />
              </div>
              <h1 className="landing-reveal landing-delay-2 font-bold text-white text-center tracking-tight" style={{ fontSize: 'var(--landing-title-size)' }}>
                Python 智能考试系统
              </h1>
              <p className="landing-reveal landing-delay-3 text-slate-400 text-center max-w-2xl" style={{ fontSize: 'var(--landing-subtitle-size)' }}>
                基于 AI 的自动化测评与管理平台
              </p>
              <div className="landing-reveal landing-delay-4 w-full max-w-4xl" style={{ marginBottom: 'var(--landing-model-picker-mb)' }}>
                <div className="model-picker">
                  <div className="model-picker__header">
                    <div className="model-picker__title">{modelSelectorCopy.title}</div>
                    <div className="model-picker__actions">
                      <button
                        type="button"
                        onClick={checkProviders}
                        className="model-picker__check"
                      >
                        {isCheckingProviders ? modelSelectorCopy.checking : modelSelectorCopy.recheck}
                      </button>
                    </div>
                  </div>

                  <div className="model-picker__row">
                    <button
                      type="button"
                      className="model-picker__arrow"
                      onClick={() => scrollModelWheel('left')}
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="model-wheel" ref={modelWheelRef} role="listbox" aria-label="AI models">
                      {providerOptions.map(option => {
                        const status = providerStatus[option.id];
                        const dotClass = status === 'ok'
                          ? 'model-dot--ok'
                          : status === 'fail'
                            ? 'model-dot--fail'
                            : status === 'checking'
                              ? 'model-dot--checking'
                              : 'model-dot--idle';
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={aiProvider === option.id}
                            data-provider={option.id}
                            onClick={() => {
                              if (option.id === aiProviderRef.current) return;
                              scrollModelWheelToProvider(option.id, 'smooth');
                            }}
                            className={`model-wheel__item ${aiProvider === option.id ? 'is-active' : ''}`}
                          >
                            <span className={`model-dot ${dotClass}`} />
                            <span className="model-wheel__label">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="model-picker__arrow"
                      onClick={() => scrollModelWheel('right')}
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="model-picker__meta">
                    <span className="model-picker__meta-name">
                      {apiSettings[aiProvider]?.model || providerOptions.find(option => option.id === aiProvider)?.desc}
                    </span>
                    <span className="model-picker__meta-status">
                      {modelSelectorCopy.availability} / {providerStatus[aiProvider] === 'ok'
                        ? modelSelectorCopy.statusOk
                        : providerStatus[aiProvider] === 'fail'
                          ? modelSelectorCopy.statusFail
                          : providerStatus[aiProvider] === 'checking'
                            ? modelSelectorCopy.statusChecking
                            : modelSelectorCopy.statusUnknown}
                    </span>
                  </div>
                </div>
              </div>
              <div className="landing-reveal landing-delay-5 grid md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full max-w-4xl" style={{ marginBottom: 'var(--landing-card-grid-mb)' }}>
                <button
                  onClick={() => requestEnterMode('student_login')}
                  className="group relative bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-blue-500/50 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/20 text-left overflow-hidden backdrop-blur-sm" style={{ padding: 'var(--landing-card-padding)' }}
                >
                  <div className="flex justify-between items-start mb-4 sm:mb-8">
                     <div className="bg-blue-900/20 p-3 sm:p-4 rounded-xl group-hover:scale-110 transition-transform ring-1 ring-blue-500/20">
                       <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
                     </div>
                     <GraduationCap className="w-24 h-24 sm:w-32 sm:h-32 text-slate-700 absolute -right-6 -bottom-6 transition-all transform rotate-12 opacity-20 group-hover:opacity-30 landing-card-watermark" />
                  </div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1 sm:mb-2">我是学生</h2>
                  <p className="text-slate-400 text-xs sm:text-sm mb-4 sm:mb-8 leading-relaxed">参加在线考试，实时代码运行与 AI 智能批改。</p>
                  <div className="flex items-center text-blue-400 font-bold text-sm">
                     进入考试 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => requestEnterMode('teacher_login')}
                  className="group relative bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-purple-500/50 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/20 text-left overflow-hidden backdrop-blur-sm" style={{ padding: 'var(--landing-card-padding)' }}
                >
                  <div className="flex justify-between items-start mb-4 sm:mb-8">
                     <div className="bg-purple-900/20 p-3 sm:p-4 rounded-xl group-hover:scale-110 transition-transform ring-1 ring-purple-500/20">
                       <Monitor className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400" />
                     </div>
                     <Monitor className="w-24 h-24 sm:w-32 sm:h-32 text-slate-700 absolute -right-6 -bottom-6 transition-all transform -rotate-6 opacity-20 group-hover:opacity-30 landing-card-watermark" />
                  </div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1 sm:mb-2">我是老师</h2>
                  <p className="text-slate-400 text-xs sm:text-sm mb-4 sm:mb-8 leading-relaxed">管理题库，配置试卷规则，查看考试数据。</p>
                  <div className="flex items-center text-purple-400 font-bold text-sm">
                     进入后台 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
              
              {/* System Exit Button (Flow Layout, No Overlap) */}
              <div className="landing-reveal landing-delay-6 z-20 mt-2 sm:mt-4">
                 <button
                   onClick={handleSystemExit}
                   className="landing-exit flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors px-6 py-2 rounded-full hover:bg-white/5 group border border-transparent hover:border-slate-700/40"
                 >
                   <Power className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium">退出系统</span>
                 </button>
              </div>
              <div className="landing-reveal landing-delay-6 text-slate-500 text-[9px] sm:text-[10px] tracking-wide text-center mt-2">
                &copy; 2026 朱文皓 &amp; 文静. All Rights Reserved.
              </div>
            </>
          )}

          {mode === 'teacher_login' && (
           <div className="w-full flex justify-center items-center min-h-0">
            <div className="w-full max-w-3xl mx-auto bg-slate-900/80 rounded-2xl border border-slate-700/50 backdrop-blur-md overflow-hidden grid md:grid-cols-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-blue-950/40 border-b md:border-b-0 md:border-r border-slate-800" style={{ padding: 'var(--login-card-padding)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/30">
                    <Monitor className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 tracking-[0.3em] uppercase">Teacher Portal</div>
                    <h2 className="text-2xl font-bold text-white">教师管理端</h2>
                  </div>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  管理题库、配置试卷规则、查看考试数据与成绩报告。
                </p>
                <div className="space-y-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    管理员登录后可修改考试配置
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    支持本地与云端数据同步
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    请妥善保管管理密码
                  </div>
                </div>
              </div>
              <div style={{ padding: 'var(--login-card-padding)' }}>
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Key className="w-4 h-4 text-blue-400" /> 登录验证</h3>
                </div>
                <form onSubmit={handleTeacherLogin} className="space-y-6">
                  <div>
                    <label className="block text-slate-400 text-xs mb-2">管理员密码</label>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 pr-10 text-white focus:border-blue-500 outline-none transition-colors"
                        placeholder="请输入管理密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={() => setMode('landing')} className="flex-1 min-w-[140px]">返回</Button>
                    <Button type="submit" isLoading={isCheckingTeacherLogin} disabled={isCheckingTeacherLogin} className="flex-1 min-w-[140px]">进入后台</Button>
                  </div>
                </form>
                <div className="mt-6 text-xs text-slate-500">忘记密码请联系系统管理员。</div>
              </div>
            </div>
          </div>
        )}

        {mode === 'student_login' && (
           <div className="w-full flex justify-center items-center min-h-0">
            <div className="w-full max-w-3xl mx-auto bg-slate-900/80 rounded-2xl border border-slate-700/50 backdrop-blur-md overflow-hidden grid md:grid-cols-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-indigo-950/40 border-b md:border-b-0 md:border-r border-slate-800" style={{ padding: 'var(--login-card-padding)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/30">
                    <GraduationCap className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 tracking-[0.3em] uppercase">Student Portal</div>
                    <h2 className="text-2xl font-bold text-white">考生登录</h2>
                  </div>
                </div>
                <div className="text-slate-300 text-lg font-semibold">{config.examTitle}</div>
                <p className="text-xs text-slate-500 mt-1">考试时长: {config.duration} 分钟</p>
                <div className="mt-6 space-y-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    请确认姓名与学号准确无误
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    考试过程中保持网络连接稳定
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    进入后请勿退出应用
                  </div>
                </div>
              </div>
              <div style={{ padding: 'var(--login-card-padding)' }}>
                <div className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-400" /> 资料填写
                </div>
                <form onSubmit={handleStudentStart} className="space-y-4">
                  <Input name="name" label="姓名" placeholder="请输入姓名" required />
                  <Input name="sid" label="学号" placeholder="请输入11位学号" required maxLength={11} />
                  {config.accessKey && config.accessKey.trim() !== "" && (
                    <div className="w-full">
                      <label className="block text-slate-400 text-xs mb-1.5 font-medium">考试密钥</label>
                      <div className="relative">
                        <input
                          name="accessKey"
                          type={showPassword ? "text" : "password"}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 pr-10 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                          placeholder="请输入考试访问密钥"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="secondary" onClick={() => setMode('landing')} className="flex-1 min-w-[140px]">返回</Button>
                    <Button type="submit" className="flex-1 whitespace-nowrap min-w-[140px]" isLoading={isCheckingNet}>
                      {isCheckingNet ? "正在准备环境..." : "开始考试"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <div className="absolute bottom-3 left-4 text-slate-500/50 text-[8px] sm:text-[9px] select-none pointer-events-none z-20">
        {getDeviceInfo()}
      </div>
    </div>
    </>
  );
}
