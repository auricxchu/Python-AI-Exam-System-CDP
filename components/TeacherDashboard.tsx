
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Settings, Save, Plus, Trash2, Pencil, LogOut, Check, CheckCircle, AlertTriangle,
  Database, Filter, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Cloud, CloudUpload, RefreshCw, Loader2, Key,
  FileText, Clock, Image as ImageIcon, Upload, X, ZoomIn, AlertCircle, ExternalLink, Sun, Moon, Wand2
} from 'lucide-react';
import { ExamConfig, Question, Difficulty, ExamAssemblyMode, SkillRubric } from '../types';
import { AiProvider, AiProviderSettings, generateQuestion, testProviderConnectionWithSettings, inferRubricForQuestion } from '../services/aiService';
import { DEFAULT_TEACHER_PASSWORD, hasCustomAdminPassword, hashAdminPassword, verifyAdminPassword } from '../services/adminAuthService';
import { Button, Input, Badge, ToolbarButton } from './ui';
import Modal from './Modal';
import ImageModal from './ImageModal';
import CachedImage from './CachedImage';
import { storageService } from '../services/storageService';
import { cloudService } from '../services/cloudService';
import { useResolvedImageUrl } from '../hooks/useResolvedImageUrl';
import { teacherSessionService } from '../services/teacherSessionService';
import { calculateManualPaperTotal, calculateRandomPaperTotal, getDefaultQuestionPoints } from '../services/examConfigService';

interface TeacherDashboardProps {
  config: ExamConfig;
  onUpdateConfig: (cfg: ExamConfig) => void;
  onExit: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  aiProvider: AiProvider;
  apiSettings: AiProviderSettings;
  providerStatus: Record<AiProvider, 'idle' | 'checking' | 'ok' | 'fail'>;
  isCheckingProviders: boolean;
  onSaveApiSettings: (settings: AiProviderSettings) => Promise<{ success: boolean; error?: string }>;
  onCheckProviders: () => void;
}

const providerDocs: Record<AiProvider, string> = {
  deepseek: 'https://platform.deepseek.com/',
  openai: 'https://platform.openai.com/api-keys',
  qwen: 'https://help.aliyun.com/zh/model-studio/get-api-key',
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey'
};

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  config,
  onUpdateConfig,
  onExit,
  theme,
  onToggleTheme,
  aiProvider,
  apiSettings,
  providerStatus,
  isCheckingProviders,
  onSaveApiSettings,
  onCheckProviders
}) => {
  // State
  const [localConfig, setLocalConfig] = useState<ExamConfig>(config);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [filterDiff, setFilterDiff] = useState<Difficulty | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [apiSettingsDraft, setApiSettingsDraft] = useState<AiProviderSettings>(apiSettings);
  const [draftProviderStatus, setDraftProviderStatus] = useState<Record<AiProvider, 'idle' | 'checking' | 'ok' | 'fail'>>(providerStatus);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingApiSettings, setIsSavingApiSettings] = useState(false);
  const [isCheckingDraftProviders, setIsCheckingDraftProviders] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingGuideAfterApiSetup, setPendingGuideAfterApiSetup] = useState(false);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
    
  // Edit/Add Question State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState<Partial<Question>>({
    title: "", difficulty: "简单", description: "", template: "def solution():\n    pass", imageUrl: "", rubric: []
  });
  
  // New: Deferred Upload State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);
  const rubricBarRef = useRef<HTMLDivElement>(null);
  const [draggingRubricBoundary, setDraggingRubricBoundary] = useState<number | null>(null);
  const rubricMinSegmentPercent = 2;

  // Modals & Previews
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null); // For ImageModal
  const [notif, setNotif] = useState<{ msg: string, type: 'success' | 'warning' } | null>(null);
  const resolvedPreviewImage = useResolvedImageUrl(previewImage);
  
  // Load full config from "Cloud" on mount
  useEffect(() => {
    const loadFromCloud = async () => {
      setIsLoadingCloud(true);
      try {
        const cloudConfig = await cloudService.fetchExamConfig();
        // Only update if we got valid config
        if (cloudConfig) {
            setLocalConfig(cloudConfig);
            onUpdateConfig(cloudConfig);
            setNotif({ msg: "已从云端同步最新考试配置", type: "success" });
        } else {
             console.log("Using local/default config as cloud was empty.");
             // Auto-initialize cloud if empty using local config
             await cloudService.saveExamConfig(localConfig);
             setNotif({ msg: "云端题库初始化成功 (使用本地配置)", type: "success" });
        }
      } catch (e) {
        setNotif({ msg: "云端同步失败，使用本地缓存", type: "warning" });
      } finally {
        setIsLoadingCloud(false);
      }
    };
    loadFromCloud();
  }, []); // Run once on mount

  // Cleanup blob URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (notif) {
      const timer = setTimeout(() => setNotif(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notif]);

  const resizeTextareaToContent = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => {
    resizeTextareaToContent(descriptionTextareaRef.current);
  }, [questionForm.description]);

  useEffect(() => {
    resizeTextareaToContent(templateTextareaRef.current);
  }, [questionForm.template]);

  useEffect(() => {
    setApiSettingsDraft(apiSettings);
  }, [apiSettings]);

  useEffect(() => {
    setDraftProviderStatus(providerStatus);
  }, [providerStatus]);

  useEffect(() => {
    if (!hasCustomAdminPassword(localConfig)) {
      setMustChangePassword(true);
      setPasswordModalOpen(true);
    }
  }, [localConfig]);

  // Handlers
  const handleSaveConfig = async () => {
    // Validate Access Key
    if (!localConfig.accessKey || localConfig.accessKey.trim() === "") {
        setNotif({ msg: "保存失败: 必须设置考试访问密钥", type: "warning" });
        return;
    }
    if (localConfig.assemblyMode === 'manual') {
      if (localConfig.manualPaperQuestions.length === 0) {
        setNotif({ msg: "保存失败: 自由组卷至少需要选择一道题目", type: "warning" });
        return;
      }
      if (localConfig.manualPaperQuestions.some((item) => item.points <= 0)) {
        setNotif({ msg: "保存失败: 自由组卷中的题目分值必须大于 0", type: "warning" });
        return;
      }
    }

    setIsSyncing(true);
    setSyncStatusText("正在保存规则...");
    // Save to local
    storageService.saveConfig(localConfig);
    onUpdateConfig(localConfig);
    
    // Save to cloud
    const result = await cloudService.saveExamConfig(localConfig);
    setIsSyncing(false);
    setSyncStatusText("");

    if (result.success) {
        setNotif({ msg: "考试规则已保存并同步至云端", type: "success" });
    } else {
        setNotif({ msg: `保存本地成功，但云端同步失败: ${result.error}`, type: "warning" });
    }
  };

  const handleSaveApiSettingsInTeacher = async () => {
    setIsSavingApiSettings(true);
    try {
      const result = await onSaveApiSettings(apiSettingsDraft);
      if (!result.success) {
        setNotif({ msg: `API 设置同步失败: ${result.error || '未知错误'}`, type: "warning" });
        return;
      }
      setNotif({ msg: "API 设置已保存并同步到云端", type: "success" });
      setApiSettingsOpen(false);
      if (pendingGuideAfterApiSetup) {
        setPendingGuideAfterApiSetup(false);
        setUsageGuideOpen(true);
      }
    } finally {
      setIsSavingApiSettings(false);
    }
  };

  const handleCheckDraftApiSettings = async () => {
    if (isCheckingDraftProviders) return;
    setIsCheckingDraftProviders(true);
    const targets: AiProvider[] = ['deepseek', 'openai', 'qwen', 'moonshot', 'gemini'];
    setDraftProviderStatus((prev) => {
      const next = { ...prev };
      targets.forEach((key) => {
        next[key] = 'checking';
      });
      return next;
    });

    await Promise.allSettled(
      targets.map(async (key) => {
        const ok = await testProviderConnectionWithSettings(key, apiSettingsDraft, true);
        setDraftProviderStatus((prev) => ({
          ...prev,
          [key]: ok ? 'ok' : 'fail'
        }));
      })
    );

    setIsCheckingDraftProviders(false);
  };

  const handleChangePassword = async () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const nextPassword = passwordForm.nextPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !nextPassword || !confirmPassword) {
      setNotif({ msg: "请完整填写密码信息", type: "warning" });
      return;
    }
    if (!(await verifyAdminPassword(currentPassword, localConfig))) {
      setNotif({ msg: "当前管理密码错误", type: "warning" });
      return;
    }
    if (nextPassword.length < 4) {
      setNotif({ msg: "新密码至少需要 4 位", type: "warning" });
      return;
    }
    if (nextPassword !== confirmPassword) {
      setNotif({ msg: "两次输入的新密码不一致", type: "warning" });
      return;
    }

    setIsSavingPassword(true);
    setIsSyncing(true);
    setSyncStatusText("正在同步管理密码...");
    try {
      const newConfig: ExamConfig = {
        ...localConfig,
        adminPasswordHash: await hashAdminPassword(nextPassword),
        adminPasswordUpdatedAt: new Date().toISOString()
      };

      const result = await cloudService.saveExamConfig(newConfig);
      if (!result.success) {
        setNotif({ msg: `密码同步失败: ${result.error}`, type: "warning" });
        return;
      }

      setLocalConfig(newConfig);
      onUpdateConfig(newConfig);
      storageService.saveConfig(newConfig);
      teacherSessionService.remember(nextPassword);
      setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
      setPasswordModalOpen(false);
      if (mustChangePassword) {
        setMustChangePassword(false);
        setPendingGuideAfterApiSetup(true);
        setApiSettingsOpen(true);
      }
      setNotif({ msg: "管理密码已更新，后续将优先使用云端验证", type: "success" });
    } finally {
      setIsSavingPassword(false);
      setIsSyncing(false);
      setSyncStatusText("");
    }
  };

  const handleRuleChange = (diff: string, field: 'count' | 'points', val: string) => {
    const num = parseInt(val) || 0;
    setLocalConfig(prev => ({
      ...prev,
      ruleSettings: {
        ...prev.ruleSettings,
        [diff]: { ...prev.ruleSettings[diff], [field]: num }
      }
    }));
  };

  const handleAssemblyModeChange = (mode: ExamAssemblyMode) => {
    setLocalConfig((prev) => ({
      ...prev,
      assemblyMode: mode
    }));
  };

  const handleAddQuestionToPaper = (question: Question) => {
    setLocalConfig((prev) => {
      if (prev.manualPaperQuestions.some((item) => item.questionId === question.id)) {
        return prev;
      }
      return {
        ...prev,
        assemblyMode: 'manual',
        manualPaperQuestions: [
          ...prev.manualPaperQuestions,
          {
            questionId: question.id,
            points: getDefaultQuestionPoints(question, prev.ruleSettings)
          }
        ]
      };
    });
    setNotif({ msg: `已将《${question.title}》添加到试卷`, type: "success" });
  };

  const handleRemoveQuestionFromPaper = (questionId: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      manualPaperQuestions: prev.manualPaperQuestions.filter((item) => item.questionId !== questionId)
    }));
  };

  const handleManualQuestionPointsChange = (questionId: string, value: string) => {
    const points = parseInt(value) || 0;
    setLocalConfig((prev) => ({
      ...prev,
      manualPaperQuestions: prev.manualPaperQuestions.map((item) => (
        item.questionId === questionId
          ? { ...item, points }
          : item
      ))
    }));
  };

  const handleMoveManualQuestion = (index: number, direction: 'up' | 'down') => {
    setLocalConfig((prev) => {
      const next = [...prev.manualPaperQuestions];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return {
        ...prev,
        manualPaperQuestions: next
      };
    });
  };

  // 1. Select File (Local Preview Only)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (512KB limit)
    const maxSize = 512 * 1024;
    if (file.size > maxSize) {
      setNotif({ msg: "图片大小不能超过 512KB", type: "warning" });
      return;
    }

    // Set pending file and create local preview
    setPendingFile(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setQuestionForm(prev => ({ ...prev, imageUrl: "" }));
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.title || !questionForm.description) {
      setNotif({ msg: "请填写所有必填字段", type: "warning" });
      return;
    }

    setIsSyncing(true);
    
    // 2. Handle Upload Phase (if pending file exists)
    let finalImageUrl = questionForm.imageUrl;
    if (pendingFile) {
        setSyncStatusText("正在上传图片...");
        const uploadResult = await cloudService.uploadImage(pendingFile);
        if (uploadResult.success && uploadResult.url) {
            finalImageUrl = uploadResult.url;
        } else {
            setIsSyncing(false);
            setSyncStatusText("");
            setNotif({ msg: `图片上传失败: ${uploadResult.error}`, type: "warning" });
            return; // Stop saving if upload fails
        }
    }

    setSyncStatusText("正在同步数据...");

    const newQuestion = { 
      ...questionForm, 
      imageUrl: finalImageUrl,
      id: editingId || `q_${Date.now()}` 
    } as Question;

    // Optimistic UI Update (Locally)
    const updatedQuestions = editingId 
        ? localConfig.questionBank.map(q => q.id === editingId ? newQuestion : q)
        : [...localConfig.questionBank, newQuestion];

    const newConfig = { ...localConfig, questionBank: updatedQuestions };
    
    setLocalConfig(newConfig);
    onUpdateConfig(newConfig); 

    // Save to Cloud
    const result = await cloudService.saveExamConfig(newConfig);
    setIsSyncing(false);
    setSyncStatusText("");

    if (result.success) {
      setNotif({ msg: editingId ? "题目已更新" : "题目已添加", type: "success" });
      // Clear form only on success
      setEditingId(null);
      setQuestionForm({ title: "", difficulty: "简单", description: "", template: "def solution():\n    pass", imageUrl: "" });
      setPendingFile(null);
      setLocalPreviewUrl(null);
      setActiveTab('list');
    } else {
      setNotif({ msg: `云端同步失败: ${result.error}`, type: "warning" });
    }
  };

  const handleAiGenerate = async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed) {
      setNotif({ msg: "请输入 AI 指令", type: "warning" });
      return;
    }
    setAiGenerating(true);
    const result = await generateQuestion(trimmed, questionForm, aiProvider);
    setAiGenerating(false);
    if (!result) {
      setNotif({ msg: "AI 生成失败，请稍后重试", type: "warning" });
      return;
    }
    setQuestionForm(prev => ({
      ...prev,
      title: result.title,
      description: result.description,
      difficulty: result.difficulty,
      template: result.template
    }));
    setAiPrompt("");
    setNotif({ msg: "AI 已生成题目草稿", type: "success" });
  };

  const handleAiInferRubric = async () => {
    if (!questionForm.title || !questionForm.description) {
      setNotif({ msg: "请先填写题目名称和描述", type: "warning" });
      return;
    }
    setAiGenerating(true);
    const rubric = await inferRubricForQuestion(
      questionForm.title,
      questionForm.description,
      aiProvider
    );
    setAiGenerating(false);
    if (rubric && rubric.length > 0) {
      // Normalize to 100% total
      const total = rubric.reduce((s, r) => s + r.score, 0);
      const normalized = total > 0
        ? rubric.map(r => ({ ...r, score: Math.round((r.score / total) * 100) }))
        : rubric.map((r, i) => ({ ...r, score: i === 0 ? 100 : 0 }));
      // Fix rounding
      const sum = normalized.reduce((s, r) => s + r.score, 0);
      if (sum !== 100 && normalized.length > 0) {
        normalized[0] = { ...normalized[0], score: normalized[0].score + (100 - sum) };
      }
      setQuestionForm(prev => ({ ...prev, rubric: normalized }));
      setNotif({ msg: `AI 已推断 ${rubric.length} 个能力点`, type: "success" });
    } else {
      setNotif({ msg: "AI 推断失败，请手动添加能力点", type: "warning" });
    }
  };

  const redistributePercents = (rubric: SkillRubric[], changedIndex: number, newValue: number): SkillRubric[] => {
    const old = [...rubric];
    const oldValue = old[changedIndex].score;
    const diff = newValue - oldValue;
    if (diff === 0) return old;

    old[changedIndex] = { ...old[changedIndex], score: newValue };

    const others = old.filter((_, i) => i !== changedIndex);
    const othersTotal = others.reduce((s, r) => s + r.score, 0);

    if (othersTotal <= 0) {
      // Only one skill, just set to 100 and return
      old[changedIndex] = { ...old[changedIndex], score: 100 };
      return old;
    }

    // Distribute the difference proportionally among others
    const updated = old.map((skill, i) => {
      if (i === changedIndex) return skill;
      const proportion = skill.score / othersTotal;
      const newScore = Math.max(1, Math.round(skill.score - diff * proportion));
      return { ...skill, score: newScore };
    });

    // Fix rounding errors: adjust the first other skill to make sum = 100
    const sum = updated.reduce((s, r) => s + r.score, 0);
    const firstOther = updated.findIndex((_, i) => i !== changedIndex);
    if (firstOther >= 0 && sum !== 100) {
      updated[firstOther] = { ...updated[firstOther], score: Math.max(1, updated[firstOther].score + (100 - sum)) };
    }

    return updated;
  };

  const handleAddRubricSkill = () => {
    setQuestionForm(prev => {
      const rubric = prev.rubric || [];
      if (rubric.length === 0) {
        return { ...prev, rubric: [{ skillId: `skill_${Date.now()}`, description: "", score: 100 }] };
      }
      // Give new skill 10%, reduce others proportionally
      const reduced = rubric.map(r => ({ ...r, score: Math.round(r.score * 0.9) }));
      // Fix rounding
      const sum = reduced.reduce((s, r) => s + r.score, 0) + 10;
      if (sum !== 100 && reduced.length > 0) {
        reduced[0] = { ...reduced[0], score: Math.max(1, reduced[0].score + (90 - reduced.reduce((s, r) => s + r.score, 0))) };
      }
      return {
        ...prev,
        rubric: [...reduced, { skillId: `skill_${Date.now()}`, description: "", score: 10 }]
      };
    });
  };

  const handleUpdateRubricSkill = (index: number, field: 'description' | 'score', value: string) => {
    setQuestionForm(prev => {
      const rubric = [...(prev.rubric || [])];
      if (!rubric[index]) return prev;
      if (field === 'score') {
        const newValue = Math.max(1, Math.min(99, parseInt(value) || 1));
        return { ...prev, rubric: redistributePercents(rubric, index, newValue) };
      } else {
        rubric[index] = { ...rubric[index], description: value };
        return { ...prev, rubric };
      }
    });
  };

  const getNearestRubricBoundaryIndex = (clientX: number) => {
    const rubric = questionForm.rubric || [];
    const bar = rubricBarRef.current;
    if (!bar || rubric.length < 2) return null;

    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return null;

    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    let cumulative = 0;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < rubric.length - 1; index += 1) {
      cumulative += rubric[index].score || 0;
      const boundaryX = rect.width * (cumulative / 100);
      const distance = Math.abs(x - boundaryX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    return nearestIndex;
  };

  const updateRubricBoundaryFromClientX = (boundaryIndex: number, clientX: number) => {
    const bar = rubricBarRef.current;
    if (!bar) return;

    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;

    setQuestionForm(prev => {
      const rubric = [...(prev.rubric || [])];
      const leftSkill = rubric[boundaryIndex];
      const rightSkill = rubric[boundaryIndex + 1];
      if (!leftSkill || !rightSkill) return prev;

      const beforeBoundaryTotal = rubric
        .slice(0, boundaryIndex)
        .reduce((sum, skill) => sum + (skill.score || 0), 0);
      const pairTotal = (leftSkill.score || 0) + (rightSkill.score || 0);
      if (pairTotal <= 1) return prev;

      const pointerPercent = (Math.max(0, Math.min(rect.width, clientX - rect.left)) / rect.width) * 100;
      const rawLeftScore = Math.round(pointerPercent - beforeBoundaryTotal);
      const minSegmentPercent = pairTotal >= rubricMinSegmentPercent * 2 ? rubricMinSegmentPercent : 1;
      const maxLeftScore = pairTotal - minSegmentPercent;
      const leftScore = Math.max(minSegmentPercent, Math.min(maxLeftScore, rawLeftScore));
      const rightScore = pairTotal - leftScore;

      if (leftSkill.score === leftScore && rightSkill.score === rightScore) return prev;

      rubric[boundaryIndex] = { ...leftSkill, score: leftScore };
      rubric[boundaryIndex + 1] = { ...rightSkill, score: rightScore };
      return { ...prev, rubric };
    });
  };

  const handleRubricBarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const boundaryIndex = getNearestRubricBoundaryIndex(event.clientX);
    if (boundaryIndex === null) return;

    event.preventDefault();
    setDraggingRubricBoundary(boundaryIndex);
    updateRubricBoundaryFromClientX(boundaryIndex, event.clientX);
  };

  useEffect(() => {
    if (draggingRubricBoundary === null) return;

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      updateRubricBoundaryFromClientX(draggingRubricBoundary, event.clientX);
    };
    const handleMouseUp = () => setDraggingRubricBoundary(null);

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingRubricBoundary]);

  const handleRemoveRubricSkill = (index: number) => {
    setQuestionForm(prev => {
      const rubric = (prev.rubric || []).filter((_, i) => i !== index);
      if (rubric.length === 0) return { ...prev, rubric };
      // Redistribute the removed skill's % proportionally
      const total = rubric.reduce((s, r) => s + r.score, 0);
      if (total <= 0) {
        const even = Math.round(100 / rubric.length);
        return { ...prev, rubric: rubric.map((r, i) => ({ ...r, score: i === 0 ? 100 - even * (rubric.length - 1) : even })) };
      }
      const normalized = rubric.map(r => ({ ...r, score: Math.round((r.score / total) * 100) }));
      const sum = normalized.reduce((s, r) => s + r.score, 0);
      if (sum !== 100 && normalized.length > 0) {
        normalized[0] = { ...normalized[0], score: normalized[0].score + (100 - sum) };
      }
      return { ...prev, rubric: normalized };
    });
  };

  const startEdit = (q: Question) => {
    setQuestionForm({ ...q, rubric: q.rubric || [] });
    setEditingId(q.id);
    setPendingFile(null);
    setLocalPreviewUrl(null);
    setActiveTab('add');
  };

  const startAdd = () => {
    setQuestionForm({title:"", difficulty:"简单", description:"", template: "def solution():\n    pass", imageUrl: "", rubric: []});
    setEditingId(null);
    setPendingFile(null);
    setLocalPreviewUrl(null);
    setActiveTab('add');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    const updatedQuestions = localConfig.questionBank.filter(q => q.id !== deleteId);
    const newConfig = {
      ...localConfig,
      questionBank: updatedQuestions,
      manualPaperQuestions: localConfig.manualPaperQuestions.filter((item) => item.questionId !== deleteId)
    };
    
    setLocalConfig(newConfig);
    onUpdateConfig(newConfig);
    
    setDeleteId(null);
    setNotif({ msg: "题目已删除，正在同步...", type: "success" });

    // Sync FULL config to Cloud
    setIsSyncing(true);
    setSyncStatusText("正在同步删除操作...");
    const result = await cloudService.saveExamConfig(newConfig);
    setIsSyncing(false);
    setSyncStatusText("");
    
    if (result.success) {
      setNotif({ msg: "云端同步完成", type: "success" });
    } else {
      setNotif({ msg: `云端同步失败: ${result.error}`, type: "warning" });
    }
  };

  const filteredQuestions = localConfig.questionBank.filter(q => filterDiff === 'all' || q.difficulty === filterDiff);
  const selectedQuestionIds = new Set(localConfig.manualPaperQuestions.map((item) => item.questionId));
  const manualPaperEntries = localConfig.manualPaperQuestions.map((item, index) => ({
    ...item,
    index,
    question: localConfig.questionBank.find((question) => question.id === item.questionId) || null
  }));
  const manualDifficultyCounts = manualPaperEntries.reduce<Record<Difficulty, number>>((acc, item) => {
    if (item.question) {
      acc[item.question.difficulty] += 1;
    }
    return acc;
  }, { 简单: 0, 中等: 0, 困难: 0 });

  const totalScore = localConfig.assemblyMode === 'manual'
    ? calculateManualPaperTotal(localConfig.manualPaperQuestions)
    : calculateRandomPaperTotal(localConfig.ruleSettings);
  const selectedQuestionCount = localConfig.assemblyMode === 'manual'
    ? manualPaperEntries.length
    : localConfig.ruleSettings["简单"].count + localConfig.ruleSettings["中等"].count + localConfig.ruleSettings["困难"].count;
  const paperCompositionText = localConfig.assemblyMode === 'manual'
    ? `简${manualDifficultyCounts["简单"]}/ 中${manualDifficultyCounts["中等"]}/ 困${manualDifficultyCounts["困难"]}`
    : `简${localConfig.ruleSettings["简单"].count}/ 中${localConfig.ruleSettings["中等"].count}/ 困${localConfig.ruleSettings["困难"].count}`;
  const manualPaperActionButtonClass = `rounded p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    theme === 'light'
      ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
  }`;
  const manualPaperRemoveButtonClass = `rounded p-2 transition-colors ${
    theme === 'light'
      ? 'text-slate-500 hover:bg-red-50 hover:text-red-500'
      : 'text-slate-400 hover:bg-slate-800 hover:text-red-400'
  }`;
  const manualPaperPointsInputClass = `w-16 rounded-lg border px-2.5 py-1 text-sm font-semibold outline-none transition-colors ${
    theme === 'light'
      ? 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
      : 'border-slate-700 bg-slate-800 text-white focus:border-blue-500'
  }`;

  // Determine what image to show in the form
  const displayImageUrl = localPreviewUrl || questionForm.imageUrl;
  const resolvedDisplayImageUrl = useResolvedImageUrl(displayImageUrl);
  const cacheBustToken = useMemo(() => Date.now().toString(), []);

  // Helper to append timestamp to bypass cache
  const getCacheBustedUrl = (url: string | undefined | null) => {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('appimg:')) return url; // Don't cache bust local or appimg
    // Check if url already has params
    const separator = url.includes('?') ? '&' : '?';
    // Use a simpler timestamp to avoid infinite re-renders if called in render loop, 
    // but here we want to force it once per session or reload.
    // Ideally, this timestamp should come from the question data modification time, 
    // but for now, Date.now() ensures fresh load on component mount.
    return `${url}${separator}t=${cacheBustToken}`; 
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] p-4 sm:p-6 font-sans text-slate-200 flex flex-col overflow-hidden">
{/* Modals */}
      <Modal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        title="删除题目"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="danger" onClick={handleDelete}>确认删除</Button>
          </>
        }
      >
        <p>确定要从云端题库中永久删除这道题目吗？</p>
      </Modal>

      <Modal
        isOpen={apiSettingsOpen}
        onClose={() => setApiSettingsOpen(false)}
        title="AI API 设置"
        panelClassName="w-[92vw] max-w-[600px]"
        bodyClassName="h-[46vh] overflow-y-auto custom-scrollbar"
        footer={
          <>
            <Button variant="secondary" onClick={handleCheckDraftApiSettings} isLoading={isCheckingDraftProviders} disabled={isCheckingDraftProviders}>
              <RefreshCw className="w-4 h-4" />
              {isCheckingDraftProviders ? '检测中...' : '检测连通性'}
            </Button>
            <Button variant="secondary" onClick={() => setApiSettingsOpen(false)}>取消</Button>
            <Button onClick={handleSaveApiSettingsInTeacher} isLoading={isSavingApiSettings} disabled={isSavingApiSettings}>
              <Save className="w-4 h-4" />
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3 pr-2">
          {(['deepseek', 'openai', 'qwen', 'moonshot', 'gemini'] as AiProvider[]).map((provider) => {
            const status = draftProviderStatus[provider];
            const statusLabel = status === 'ok'
              ? '可用'
              : status === 'fail'
                ? '不可用'
                : status === 'checking'
                  ? '检测中...'
                  : '未检测';
            const providerLabel = provider === 'qwen'
              ? '通义千问'
              : provider === 'deepseek'
                ? 'DeepSeek'
                : provider === 'moonshot'
                  ? 'Moonshot'
                  : provider === 'gemini'
                    ? 'Gemini'
                    : 'OpenAI';

            return (
              <div key={`teacher-api-${provider}`} className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <span>{providerLabel}</span>
                        <a
                          href={providerDocs[provider]}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                          title={`${providerLabel} API 文档`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{statusLabel}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">API Key</label>
                    <Input
                      type="password"
                      value={apiSettingsDraft[provider].apiKey}
                      onChange={(e) => setApiSettingsDraft((prev) => ({
                        ...prev,
                        [provider]: {
                          ...prev[provider],
                          apiKey: e.target.value
                        }
                      }))}
                      placeholder={`输入 ${providerLabel} API Key`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        isOpen={passwordModalOpen}
        onClose={() => {
          if (!mustChangePassword) {
            setPasswordModalOpen(false);
          }
        }}
        title="修改管理密码"
        closeOnOutsideClick={!mustChangePassword}
        footer={
          <>
            {!mustChangePassword && (
              <Button variant="secondary" onClick={() => setPasswordModalOpen(false)}>取消</Button>
            )}
            <Button onClick={handleChangePassword} isLoading={isSavingPassword} disabled={isSavingPassword}>
              <Save className="w-4 h-4" />
              保存新密码
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {mustChangePassword && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${
                theme === 'light'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              }`}
            >
              当前仍在使用默认教师密码。请先立即修改密码并妥善保存，随后系统会引导你完成 AI Key 配置。
            </div>
          )}
          <Input
            label="当前密码"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            placeholder={hasCustomAdminPassword(localConfig) ? '请输入当前云端管理密码' : `当前默认密码：${DEFAULT_TEACHER_PASSWORD}`}
          />
          <Input
            label="新密码"
            type="password"
            value={passwordForm.nextPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, nextPassword: e.target.value }))}
            placeholder="请输入新管理密码"
          />
          <Input
            label="确认新密码"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            placeholder="再次输入新管理密码"
          />
          <p className="text-xs text-slate-400 leading-relaxed">
            修改成功后，教师端登录会优先使用云端密码校验，不再只依赖本地默认密码。
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={usageGuideOpen}
        onClose={() => setUsageGuideOpen(false)}
        title="教师端使用说明"
        footer={<Button onClick={() => setUsageGuideOpen(false)}>开始使用</Button>}
      >
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>1. 先在左侧基础设置中填写考试名称、考试时长和考试访问密钥。</p>
          <p>2. 再进入 AI API 设置，填入可用的 AI Key，并先用“检测连通性”验证后再保存。</p>
          <p>3. 右侧题库列表用于维护题目，你也可以使用 AI 指令辅助生成题干和模板。</p>
          <p>4. 设置好组卷规则与分值后，记得点击保存规则配置同步到云端。</p>
        </div>
      </Modal>

      {/* Image Zoom Modal */}
      <ImageModal 
        isOpen={!!previewImage} 
        src={getCacheBustedUrl(resolvedPreviewImage || previewImage || "")} 
        onClose={() => setPreviewImage(null)} 
      />

      {/* Notification Toast */}
      {notif && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${notif.type === 'success' ? 'bg-green-600/90' : 'bg-orange-600/90'}`}>
           <div className="bg-white/20 p-1 rounded-full">{notif.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</div>
           <span className="font-bold text-sm text-white">{notif.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="w-full max-w-none flex justify-between items-center mb-6 shrink-0 pt-2">
         <div className="flex items-center gap-4">
           <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
             云端题库管理
           </h2>
           {(isLoadingCloud || isSyncing) && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-900/20 px-3 py-1 rounded-full border border-blue-800">
                <Loader2 className="w-3 h-3 animate-spin" />
                {syncStatusText || (isLoadingCloud ? "正在连接云数据库..." : "正在同步...")}
              </div>
           )}
         </div>
         <div className="flex items-center gap-2 text-slate-400">
           <ToolbarButton
             theme={theme}
             onClick={onToggleTheme}
           >
             {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
             <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
           </ToolbarButton>
           <ToolbarButton
             theme={theme}
             onClick={() => setApiSettingsOpen(true)}
           >
             <Settings className="w-4 h-4" />
             <span className="text-xs font-medium">AI API 设置</span>
           </ToolbarButton>
           <ToolbarButton
             theme={theme}
             onClick={() => setPasswordModalOpen(true)}
           >
             <Key className="w-4 h-4" />
             <span className="text-xs font-medium">修改管理密码</span>
           </ToolbarButton>
           <ToolbarButton
             theme={theme}
             onClick={onExit}
           >
             <LogOut className="w-4 h-4" />
             <span className="text-xs font-medium">返回首页</span>
           </ToolbarButton>
         </div>
      </div>

      <div className="w-full max-w-none grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Panel: Settings - Scrollable */}
        <div className="col-span-12 lg:col-span-5 flex min-h-0 flex-col gap-3 sm:gap-4 lg:gap-6 overflow-y-auto custom-scrollbar pr-2">
           {/* Basic Settings */}
           <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50">
              <h3 className="font-bold text-white border-b border-slate-800 pb-2 mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> 基础设置</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
                  <div>
                      <label className="block text-slate-400 text-xs mb-1.5 font-medium">考试名称</label>
                      <div className="relative">
                          <input
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 pl-9 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                              value={localConfig.examTitle}
                              onChange={e => setLocalConfig({...localConfig, examTitle: e.target.value})}
                          />
                          <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      </div>
                  </div>
                  <div>
                      <label className="block text-slate-400 text-xs mb-1.5 font-medium">考试时长 (分钟)</label>
                      <div className="relative">
                          <input
                              type="number"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 pl-9 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                              value={localConfig.duration}
                              onChange={e => setLocalConfig({...localConfig, duration: parseInt(e.target.value)})}
                          />
                          <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      </div>
                  </div>
                  <div>
                      <label className="block text-slate-400 text-xs mb-1.5 font-medium">考试访问密钥</label>
                      <div className="relative">
                          <input
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 pl-9 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                              value={localConfig.accessKey || ''}
                              onChange={e => setLocalConfig({...localConfig, accessKey: e.target.value})}
                              placeholder="学生入场密码"
                          />
                          <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      </div>
                  </div>
                </div>

                <div>
                    <label className="block text-slate-400 text-xs mb-2 font-medium">组卷方式</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { id: 'random' as const, label: '随机抽题', desc: '按难度规则自动组卷' },
                          { id: 'manual' as const, label: '自由选题', desc: '从题库自由挑选试卷题目' }
                        ].map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleAssemblyModeChange(option.id)}
                            className={`rounded-xl border px-4 py-3 text-left transition-all ${
                              localConfig.assemblyMode === option.id
                                ? 'border-blue-500 bg-blue-500/10 text-white'
                                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                          >
                            <div className="text-sm font-bold">{option.label}</div>
                            <div className="mt-1 text-xs opacity-80">{option.desc}</div>
                          </button>
                        ))}
                    </div>
                </div>
              </div>
           </div>

           <div className="flex flex-col overflow-hidden bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50">
             <h3 className="font-bold text-white border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
               {localConfig.assemblyMode === 'random' ? '随机抽题设置' : '自由选题设置'}
             </h3>

             <div className={`${localConfig.assemblyMode === 'manual' ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
             {localConfig.assemblyMode === 'random' ? (
               <div className="overflow-hidden rounded-lg border border-slate-800 mb-4">
                 <div className="grid grid-cols-4 bg-slate-800/50 p-2 text-xs font-bold text-slate-500 text-center">
                   <div>难度</div>
                   <div>抽题数</div>
                   <div>单题分</div>
                   <div>小计</div>
                 </div>
                 {["简单", "中等", "困难"].map(diff => {
                   const rule = localConfig.ruleSettings[diff];
                   const color = diff === "简单" ? "text-green-400" : diff === "中等" ? "text-yellow-400" : "text-red-400";
                   return (
                     <div key={diff} className="grid grid-cols-4 p-2 items-center border-t border-slate-800 bg-slate-900">
                       <div className={`${color} font-bold text-sm text-center`}>{diff}</div>
                       <div className="px-2">
                          <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-sm text-center" value={rule.count} onChange={e => handleRuleChange(diff, 'count', e.target.value)} />
                       </div>
                       <div className="px-2">
                          <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-sm text-center" value={rule.points} onChange={e => handleRuleChange(diff, 'points', e.target.value)} />
                       </div>
                       <div className="text-center text-sm font-bold text-slate-400">
                          {rule.count * rule.points}
                       </div>
                     </div>
                   );
                 })}
               </div>
             ) : (
               <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                 {manualPaperEntries.length === 0 ? (
                   <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-6 text-sm leading-relaxed text-slate-400">
                     右侧题库中的题目在自由选题模式下会出现“添加到试卷”按钮。先选择题目，再回到这里调整顺序和分值。
                   </div>
                 ) : (
                   manualPaperEntries.map((item) => (
                     <div key={item.questionId} className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 transition-all hover:border-slate-600">
                       <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                           <div className="flex items-center gap-2">
                             <h4 className="truncate text-sm font-bold text-white">{item.index + 1}. {item.question?.title || '题目已不存在'}</h4>
                             <Badge color={item.question?.difficulty === '简单' ? 'green' : item.question?.difficulty === '中等' ? 'yellow' : 'red'}>
                               {item.question?.difficulty || '异常'}
                             </Badge>
                           </div>
                           {!item.question && (
                             <div className="mt-1.5">
                               <span className="text-xs text-red-400">该题已从题库移除，建议移出试卷。</span>
                             </div>
                           )}
                         </div>
                         <div className="flex shrink-0 items-center gap-1.5">
                           <span className="text-xs font-medium text-slate-400">分值</span>
                           <input
                             type="number"
                             min={1}
                             className={manualPaperPointsInputClass}
                             value={item.points}
                             onChange={(e) => handleManualQuestionPointsChange(item.questionId, e.target.value)}
                           />
                           <button
                             type="button"
                             onClick={() => handleMoveManualQuestion(item.index, 'up')}
                             disabled={item.index === 0}
                             className={manualPaperActionButtonClass}
                             title="上移"
                           >
                             <ArrowUp className="w-4 h-4" />
                           </button>
                           <button
                             type="button"
                             onClick={() => handleMoveManualQuestion(item.index, 'down')}
                             disabled={item.index === manualPaperEntries.length - 1}
                             className={manualPaperActionButtonClass}
                             title="下移"
                           >
                             <ArrowDown className="w-4 h-4" />
                           </button>
                           <button
                             type="button"
                             onClick={() => handleRemoveQuestionFromPaper(item.questionId)}
                             className={`manual-paper-remove ${manualPaperRemoveButtonClass}`}
                             title="移出试卷"
                           >
                             <X className="w-4 h-4" />
                           </button>
                         </div>
                       </div>
                     </div>
                   ))
                 )}
               </div>
             )}
             </div>

             <div className={`${localConfig.assemblyMode === 'manual' ? 'mt-5' : ''} mb-6 px-1`}>
               <div className="flex items-center justify-between text-xs text-slate-500">
                 <span>试卷组成: {paperCompositionText}</span>
                 <span>已选题目: {selectedQuestionCount} 题</span>
               </div>
               <div className="mt-3 flex items-end justify-between border-t border-slate-800 pt-3">
                 <span className="text-sm text-slate-400">试卷总分</span>
                 <div className="flex items-end gap-2">
                   <span className="text-2xl font-bold text-blue-500">{totalScore}</span>
                   <span className="pb-1 text-sm font-medium text-slate-400">分</span>
                 </div>
               </div>
             </div>

             <Button className={`${localConfig.assemblyMode === 'manual' ? 'mt-5' : ''} w-full`} onClick={handleSaveConfig} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} 
                {isSyncing ? "正在同步..." : (localConfig.assemblyMode === 'manual' ? "保存自由组卷配置" : "保存随机组卷配置")}
             </Button>
           </div>
        </div>

        {/* Right Panel: Content - Fills Height */}
        <div className="col-span-12 lg:col-span-7 bg-slate-900/80 rounded-xl border border-slate-700/50 flex flex-col h-full overflow-hidden">
           <div className="flex border-b border-slate-700/50 bg-slate-800/30 shrink-0">
              {[{ id: 'list', label: '云端题库列表' }, { id: 'add', label: editingId ? '编辑题目' : '添加题目' }].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => { if(tab.id === 'add') startAdd(); else setActiveTab('list'); }}
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === tab.id ? 'bg-slate-800/50 text-white border-t-2 border-t-blue-500' : 'text-slate-500 hover:text-white hover:bg-slate-800/30'}`}
                >
                  {tab.label}
                </button>
              ))}
           </div>

           <div className="flex-1 overflow-hidden p-6 relative">
              {/* Question List Tab */}
              {activeTab === 'list' && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4 justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Filter className="w-3 h-3"/> 难度筛选:</span>
                      {['all', '简单', '中等', '困难'].map(f => (
                        <button 
                          key={f} 
                          onClick={() => setFilterDiff(f as any)} 
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${filterDiff === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}
                        >
                          {f === 'all' ? '全部' : f}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                       <Cloud className="w-3 h-3" />
                       已同步 {localConfig.questionBank.length} 道题目
                    </div>
                  </div>

                  {isLoadingCloud ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-500" />
                      <p>正在连接云数据库...</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                      {filteredQuestions.map(q => (
                        <div key={q.id} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 hover:border-slate-600 transition-all">
                          <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                            <div className="flex items-center gap-4">
                                {expandedId === q.id ? <ChevronDown className="w-4 h-4 text-blue-400"/> : <ChevronRight className="w-4 h-4 text-slate-500"/>}
                                <div>
                                  <div className="flex items-center gap-2">
                                     <h4 className="font-bold text-white text-sm">{q.title}</h4>
                                     {q.imageUrl && <span title="包含图片"><ImageIcon className="w-3 h-3 text-blue-400" /></span>}
                                  </div>
                                  <div className="mt-1">
                                    <Badge color={q.difficulty === '简单' ? 'green' : q.difficulty === '中等' ? 'yellow' : 'red'}>{q.difficulty}</Badge>
                                  </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {localConfig.assemblyMode === 'manual' && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (selectedQuestionIds.has(q.id)) {
                                        handleRemoveQuestionFromPaper(q.id);
                                      } else {
                                        handleAddQuestionToPaper(q);
                                      }
                                    }}
                                    className={`group p-2 rounded transition-colors ${
                                      selectedQuestionIds.has(q.id)
                                        ? (
                                            theme === 'light'
                                              ? 'text-emerald-600 hover:text-red-500 hover:bg-slate-100'
                                              : 'text-green-400 hover:text-red-400 hover:bg-slate-800'
                                          )
                                        : (
                                            theme === 'light'
                                              ? 'text-slate-500 hover:text-emerald-600 hover:bg-slate-100'
                                              : 'text-slate-500 hover:text-green-400 hover:bg-slate-800'
                                          )
                                    }`}
                                    title={selectedQuestionIds.has(q.id) ? '移出试卷' : '添加到试卷'}
                                  >
                                    {selectedQuestionIds.has(q.id) ? (
                                      <>
                                        <Check className="w-4 h-4 block group-hover:hidden" />
                                        <X className="w-4 h-4 hidden group-hover:block" />
                                      </>
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                  </button>
                                </>
                              )}
                              <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); startEdit(q); }} className="teacher-action-edit p-2 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"><Pencil className="w-4 h-4"/></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteId(q.id); }} className="teacher-action-delete p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                              </div>
                            </div>
                          </div>
                          {expandedId === q.id && (
                            <div className="mt-4 pt-4 border-t border-slate-700/50 text-sm space-y-3 pl-8 animate-in fade-in slide-in-from-top-2">
                              <div>
                                <span className="text-slate-500 font-bold text-xs">题目描述</span>
                                <p className="text-slate-300 mt-1 whitespace-pre-wrap">{q.description}</p>
                                {q.imageUrl && (
                                    <div className="mt-2 relative group w-fit cursor-zoom-in" onClick={() => setPreviewImage(q.imageUrl!)}>
                                        <CachedImage
                                          src={getCacheBustedUrl(q.imageUrl)} 
                                          alt="preview" 
                                          className="w-64 h-auto rounded border border-slate-700 hover:opacity-80 transition-opacity bg-black/30"
                                          // Removed referrerPolicy="no-referrer" to allow proper headers, relied on cache busting instead
                                          onError={(e) => {
                                            // Only replace if it's not already the placeholder to avoid infinite loops
                                            const target = e.target as HTMLImageElement;
                                            if (!target.src.includes('data:image/svg') && (target.src.startsWith('appimg://') || target.src.startsWith('blob:') || target.src.startsWith('data:'))) {
                                               target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NDc0OGIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9“MTIiIHI9IjEwIi8+PGxpbmUgeDE9IjEyIiB5MT0iOCIgeDI9IjEyIiB5Mj0iMTIiLz48bGluZSB4MT0iMTIiIHkxPSIxNiIgeDI9IjEyLjAxIiB5Mj0iMTYiLz48L3N2Zz4='; 
                                               e.currentTarget.parentElement?.setAttribute('title', "图片无法加载。请确保 Supabase Storage 权限正确，且已清理浏览器缓存。");
                                            }
                                          }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded">
                                            <ZoomIn className="w-6 h-6 text-white drop-shadow-lg"/>
                                        </div>
                                    </div>
                                )}
                              </div>
                              {q.rubric && q.rubric.length > 0 && (
                                <div>
                                  <span className="text-slate-400 text-xs font-medium">
                                    能力点 ({q.rubric.length}项)
                                  </span>
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {q.rubric.map((skill) => (
                                      <span key={skill.skillId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
                                        {skill.description}
                                        <span className="text-slate-500">{skill.score}%</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="text-slate-400 text-xs font-medium">代码模板</span>
                                <pre className="bg-slate-950 p-3 rounded border border-slate-700 mt-1 font-mono text-xs text-green-400 overflow-x-auto">{q.template}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredQuestions.length === 0 && <div className="text-center text-slate-500 mt-10">云端题库中没有找到符合条件的题目。</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Add/Edit Tab - UPDATED LAYOUT */}
              {activeTab === 'add' && (
                <div className="flex flex-col h-full gap-4">
                   <div className="shrink-0 space-y-3">
                        <div>
                            <label className="block text-slate-400 text-xs mb-2 font-medium">{'\u0041\u0049 \u6307\u4ee4'}</label>
                            <div className="ai-prompt-row">
                                <input type="text"
                                    className="ai-prompt-input"
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    placeholder={'\u4f8b\u5982\uff1a\u751f\u6210\u4e00\u9053\u7b80\u5355\u6392\u5e8f\u9898 / \u96be\u4e86\u6362\u4e00\u9053 / \u6362\u6210\u8ba1\u7b97\u673a\u80cc\u666f'}
                                />
                                <button
                                    type="button"
                                    onClick={handleAiGenerate}
                                    disabled={aiGenerating}
                                    className={`ai-generate-button ${aiGenerating ? 'is-busy' : ''}`}
                                >
                                    <Wand2 className="w-4 h-4" />
                                    <span>{aiGenerating ? '\u751f\u6210\u4e2d' : '\u751f\u6210'}</span>
                                </button>
                            </div>
                        </div>
                        <div>
                            <Input label="题目名称" value={questionForm.title} onChange={e => setQuestionForm({...questionForm, title: e.target.value})} placeholder="例如: 两数之和" />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs mb-2 font-medium">难度等级</label>
                            <div className="flex gap-2">
                                {['简单', '中等', '困难'].map(d => (
                                <button 
                                    key={d} 
                                    onClick={() => setQuestionForm({...questionForm, difficulty: d as Difficulty})}
                                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors ${questionForm.difficulty === d ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                                >
                                    {d}
                                </button>
                                ))}
                            </div>
                        </div>
                   </div>

                   <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                   {/* Description: Flex grow 2 to take more space */}
                   <div className="flex flex-col">
                        <label className="block text-slate-400 text-xs mb-2 font-medium">题目描述</label>
                        <textarea
                          ref={descriptionTextareaRef}
                          rows={8}
                          className={`w-full border rounded-lg p-3 focus:border-blue-500 outline-none overflow-hidden resize-y ${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'}`}
                          value={questionForm.description}
                          onChange={e => setQuestionForm({...questionForm, description: e.target.value})}
                          placeholder="请输入详细的题目描述..."
                        />
                   </div>

                   {/* Image Upload Section: EXPANDED SIZE */}
                   <div className="shrink-0">
                        <label className="block text-slate-400 text-xs mb-2 font-medium flex justify-between">
                            <span>辅助图片 (选填)</span>
                            {displayImageUrl && <span className="text-[10px] text-blue-400 flex items-center gap-1"><Check className="w-3 h-3"/> 已就绪 (点击保存时上传)</span>}
                        </label>
                        <div 
                             className={`bg-slate-900/50 border border-dashed rounded-lg min-h-[160px] text-center transition-all flex items-center justify-center gap-4 cursor-pointer relative group ${displayImageUrl ? 'border-blue-500/30' : 'border-slate-700 hover:bg-slate-800/50 hover:border-blue-500/50'}`}
                        >
                             <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleFileSelect} 
                             />
                             {displayImageUrl ? (
                                <div className="flex flex-col items-center gap-4 w-full h-full p-4 justify-center">
                                    <div 
                                        className="flex flex-col items-center gap-2 cursor-zoom-in relative"
                                        onClick={(e) => { e.stopPropagation(); setPreviewImage(resolvedDisplayImageUrl || displayImageUrl); }}
                                    >
                                        <CachedImage
                                          src={getCacheBustedUrl(resolvedDisplayImageUrl || displayImageUrl)} 
                                          alt="上传预览" 
                                          className="w-64 h-auto object-contain rounded border border-slate-700 bg-black/40"
                                          // Removed referrerPolicy
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            if (!target.src.includes('data:image/svg') && (target.src.startsWith('appimg://') || target.src.startsWith('blob:') || target.src.startsWith('data:'))) {
                                               target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NDc0OGIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9“MTIiIHI9IjEwIi8+PGxpbmUgeDE9IjEyIiB5MT0iOCIgeDI9IjEyIiB5Mj0iMTIiLz48bGluZSB4MT0iMTIiIHkxPSIxNiIgeDI9IjEyLjAxIiB5Mj0iMTYiLz48L3N2Zz4=';
                                            }
                                          }}
                                        />
                                        <div className="absolute top-0 right-0">
                                            {pendingFile && <span className="flex h-3 w-3 relative">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                            </span>}
                                        </div>
                                        <div className="text-center">
                                            {pendingFile ? (
                                                <span className="text-blue-400 text-sm font-bold flex items-center justify-center gap-1 mb-1"><FileText className="w-4 h-4"/> 待上传: {pendingFile.name.slice(0, 15)}...</span>
                                            ) : (
                                                <span className="text-green-400 text-sm font-bold flex items-center justify-center gap-1 mb-1"><Check className="w-4 h-4"/> 当前云端图片</span>
                                            )}
                                            <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                                              点击图片放大 
                                              <a 
                                                 href={displayImageUrl} 
                                                 target="_blank" 
                                                 rel="noopener noreferrer" 
                                                 className="text-blue-500 hover:text-blue-400 p-1 hover:bg-blue-900/30 rounded"
                                                 title="在新窗口打开 (用于调试)"
                                                 onClick={e => e.stopPropagation()}
                                              >
                                                <ExternalLink className="w-3 h-3"/>
                                              </a>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                            className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded transition-colors text-xs flex items-center gap-2 border border-slate-700"
                                        >
                                            <RefreshCw className="w-3 h-3" /> 重新选择
                                        </button>
                                        <button 
                                            onClick={handleRemoveImage}
                                            className="text-red-400 hover:text-white hover:bg-red-500/20 px-3 py-1.5 rounded transition-colors text-xs flex items-center gap-2 border border-slate-700 hover:border-red-500/30"
                                        >
                                            <Trash2 className="w-3 h-3" /> 移除
                                        </button>
                                    </div>
                                </div>
                             ) : (
                                <div 
                                    className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-blue-400 w-full h-full justify-center"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <CloudUpload className="w-10 h-10 mb-2" />
                                    <div className="text-center">
                                        <span className="text-sm font-bold block mb-1">点击选择图片</span>
                                        <span className="text-xs opacity-70 border border-slate-700 px-2 py-0.5 rounded bg-slate-800">最大限制 512KB</span>
                                    </div>
                                </div>
                             )}
                        </div>
                   </div>

                   {/* Rubric Editor — percentage-based */}
                   <div className="shrink-0">
                      <label className="block text-slate-400 text-xs mb-2 font-medium flex justify-between items-center">
                        <span>能力点评分标准 (占比 %)</span>
                        <span className={`text-[10px] font-bold ${
                          (questionForm.rubric || []).reduce((s, r) => s + (r.score || 0), 0) === 100
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}>
                          总占比: {(questionForm.rubric || []).reduce((s, r) => s + (r.score || 0), 0)}%
                        </span>
                      </label>

                      {/* Stacked percentage bar */}
                      {(questionForm.rubric || []).length > 0 && (
                        <div className="mb-3">
                          <div
                            ref={rubricBarRef}
                            className={`relative h-3 rounded-full border cursor-col-resize select-none ${theme === 'light' ? 'bg-slate-200 border-slate-300' : 'bg-slate-800 border-slate-700'}`}
                            onMouseDown={handleRubricBarMouseDown}
                          >
                            <div className="h-full rounded-full overflow-hidden flex">
                              {(questionForm.rubric || []).map((skill, idx) => {
                                const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-600', 'bg-violet-500', 'bg-pink-500', 'bg-amber-700', 'bg-gray-500'];
                                return (
                                  <div
                                    key={idx}
                                    className={`${colors[idx % colors.length]} h-full ${draggingRubricBoundary === null ? 'transition-all duration-300' : ''}`}
                                    style={{ width: `${Math.max(1, skill.score)}%` }}
                                    title={`${skill.description || '未命名'}: ${skill.score}%`}
                                  />
                                );
                              })}
                            </div>
                            {(questionForm.rubric || []).slice(0, -1).map((skill, idx, rubric) => {
                              const boundaryPercent = rubric
                                .slice(0, idx + 1)
                                .reduce((sum, item) => sum + (item.score || 0), 0);
                              return (
                                <div
                                  key={`${skill.skillId}-${idx}-boundary`}
                                  className={`absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm cursor-col-resize ${
                                    draggingRubricBoundary === idx
                                      ? theme === 'light'
                                        ? 'bg-white border-blue-400 shadow-blue-400/40'
                                        : 'bg-white border-blue-300 shadow-blue-500/50'
                                      : theme === 'light'
                                        ? 'bg-white/90 border-slate-400/80 hover:bg-white hover:border-blue-300'
                                        : 'bg-slate-950/90 border-white/70 hover:bg-slate-100 hover:border-blue-300'
                                  }`}
                                  style={{ left: `${boundaryPercent}%` }}
                                  title="拖动调整相邻能力点占比"
                                />
                              );
                            })}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {(questionForm.rubric || []).map((skill, idx) => {
                              const colors = ['text-red-400', 'text-orange-400', 'text-yellow-300', 'text-emerald-400', 'text-cyan-400', 'text-blue-400', 'text-violet-400', 'text-pink-400', 'text-amber-500', 'text-gray-400'];
                              const dots = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-600', 'bg-violet-500', 'bg-pink-500', 'bg-amber-700', 'bg-gray-500'];
                              return (
                                <span key={idx} className="flex items-center gap-1 text-[10px]">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${dots[idx % dots.length]}`} />
                                  <span className={`${colors[idx % colors.length]} truncate max-w-[120px]`}>
                                    {skill.description || `能力${idx + 1}`}
                                  </span>
                                  <span className="text-slate-500">{skill.score}%</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {(questionForm.rubric || []).length === 0 ? (
                          <div className="text-xs text-slate-500 bg-slate-900/50 border border-dashed border-slate-700 rounded-lg px-4 py-3">
                            未定义评分标准。可点击下方按钮手动添加或让 AI 推断。
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                            {(questionForm.rubric || []).map((skill, index) => (
                              <div key={index} className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 group">
                                <span className="text-[10px] text-slate-600 w-5 shrink-0">{index + 1}</span>
                                <input
                                  type="text"
                                  className={`flex-1 border rounded px-2 py-1 text-xs focus:border-blue-500 outline-none ${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'}`}
                                  value={skill.description}
                                  onChange={(e) => handleUpdateRubricSkill(index, 'description', e.target.value)}
                                  placeholder="能力描述，如：遍历数组"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    className={`w-12 border rounded px-1.5 py-1 text-xs text-center focus:border-blue-500 outline-none ${theme === 'light' ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'}`}
                                    value={skill.score || ''}
                                    onChange={(e) => handleUpdateRubricSkill(index, 'score', e.target.value)}
                                    min={1}
                                    max={99}
                                  />
                                  <span className="text-[10px] text-slate-500 w-4">%</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRubricSkill(index)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                                  title="删除此能力点"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleAddRubricSkill}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" /> 添加能力点
                          </button>
                          <button
                            type="button"
                            onClick={handleAiInferRubric}
                            disabled={aiGenerating}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              aiGenerating
                                ? 'border-slate-700 bg-slate-800/30 text-slate-500 cursor-not-allowed'
                                : 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 hover:border-blue-500/60'
                            }`}
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            {aiGenerating ? '推断中...' : 'AI 推断能力点'}
                          </button>
                        </div>
                      </div>
                   </div>

                   {/* Code Template: Flex 1 */}
                   <div className="flex flex-col">
                      <label className="block text-slate-400 text-xs mb-2 font-medium">代码模板</label>
                      <textarea
                        ref={templateTextareaRef}
                        rows={8}
                        className={`w-full border rounded-lg p-3 font-mono text-sm focus:border-blue-500 outline-none overflow-hidden resize-y ${theme === 'light' ? 'bg-white border-slate-300 text-green-700' : 'bg-slate-950 border-slate-700 text-green-400'}`}
                        value={questionForm.template}
                        onChange={e => setQuestionForm({...questionForm, template: e.target.value})}
                        spellCheck="false"
                      />
                   </div>
                   </div>

                   <div className="shrink-0 pt-2">
                     <Button className="w-full" onClick={handleSaveQuestion} disabled={isSyncing}>
                       {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? <Save className="w-4 h-4"/> : <Plus className="w-4 h-4"/>)} 
                       {syncStatusText ? syncStatusText : (editingId ? '保存并同步' : '添加并同步')}
                     </Button>
                   </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
