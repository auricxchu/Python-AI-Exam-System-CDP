
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Settings, Save, Plus, Trash2, Pencil, LogOut, Check, AlertTriangle, 
  Database, Filter, ChevronRight, ChevronDown, Cloud, CloudUpload, RefreshCw, Loader2, Key,
  FileText, Clock, Image as ImageIcon, Upload, X, ZoomIn, AlertCircle, ExternalLink, Sun, Moon
} from 'lucide-react';
import { ExamConfig, Question, Difficulty } from '../types';
import { Button, Input, Badge } from './ui';
import Modal from './Modal';
import ImageModal from './ImageModal';
import CachedImage from './CachedImage';
import { storageService } from '../services/storageService';
import { cloudService } from '../services/cloudService';
import { useResolvedImageUrl } from '../hooks/useResolvedImageUrl';

interface TeacherDashboardProps {
  config: ExamConfig;
  onUpdateConfig: (cfg: ExamConfig) => void;
  onExit: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ config, onUpdateConfig, onExit, theme, onToggleTheme }) => {
  // State
  const [localConfig, setLocalConfig] = useState<ExamConfig>(config);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [filterDiff, setFilterDiff] = useState<Difficulty | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState("");
  
  // Edit/Add Question State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState<Partial<Question>>({
    title: "", difficulty: "简单", description: "", template: "def solution():\n    pass", imageUrl: ""
  });
  
  // New: Deferred Upload State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handlers
  const handleSaveConfig = async () => {
    // Validate Access Key
    if (!localConfig.accessKey || localConfig.accessKey.trim() === "") {
        setNotif({ msg: "保存失败: 必须设置考试访问密钥", type: "warning" });
        return;
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

  const startEdit = (q: Question) => {
    setQuestionForm(q);
    setEditingId(q.id);
    // Reset pending state when entering edit
    setPendingFile(null);
    setLocalPreviewUrl(null);
    setActiveTab('add');
  };

  const startAdd = () => {
    setQuestionForm({title:"", difficulty:"简单", description:"", template: "def solution():\n    pass", imageUrl: ""});
    setEditingId(null);
    setPendingFile(null);
    setLocalPreviewUrl(null);
    setActiveTab('add');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    const updatedQuestions = localConfig.questionBank.filter(q => q.id !== deleteId);
    const newConfig = { ...localConfig, questionBank: updatedQuestions };
    
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

  const totalScore = 
    (localConfig.ruleSettings["简单"].count * localConfig.ruleSettings["简单"].points) +
    (localConfig.ruleSettings["中等"].count * localConfig.ruleSettings["中等"].points) +
    (localConfig.ruleSettings["困难"].count * localConfig.ruleSettings["困难"].points);

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
    <div className="h-screen bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] p-8 font-sans text-slate-200 flex flex-col overflow-hidden">
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

      {/* Image Zoom Modal */}
      <ImageModal 
        isOpen={!!previewImage} 
        src={getCacheBustedUrl(resolvedPreviewImage || previewImage || "")} 
        onClose={() => setPreviewImage(null)} 
      />

      {/* Notification Toast */}
      {notif && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${notif.type === 'success' ? 'bg-green-600/90 border-green-500' : 'bg-orange-600/90 border-orange-500'}`}>
           <div className="bg-white/20 p-1 rounded-full">{notif.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}</div>
           <span className="font-bold text-sm text-white">{notif.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="max-w-[1600px] w-full mx-auto flex justify-between items-center mb-6 shrink-0 pt-2">
         <div className="flex items-center gap-4">
           <h2 className="text-2xl font-bold text-white flex items-center gap-3">
             <Cloud className="w-8 h-8 text-blue-500" /> 云端题库管理
           </h2>
           {(isLoadingCloud || isSyncing) && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-900/20 px-3 py-1 rounded-full border border-blue-800">
                <Loader2 className="w-3 h-3 animate-spin" />
                {syncStatusText || (isLoadingCloud ? "正在连接云数据库..." : "正在同步...")}
              </div>
           )}
         </div>
         <div className="flex items-center gap-4 text-slate-400 text-sm">
           <span>当前试卷设计总分: <span className="text-blue-400 font-bold">{totalScore}</span> 分</span>
           <button
             onClick={onToggleTheme}
             className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
             title={theme === 'light' ? '切换到深色' : '切换到浅色'}
           >
             {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
             <span className="text-xs font-medium">{theme === 'light' ? '深色' : '浅色'}</span>
           </button>
           <button onClick={onExit} className="hover:text-white flex items-center gap-1 transition-colors"><LogOut className="w-4 h-4"/> 返回</button>
         </div>
      </div>

      <div className="max-w-[1600px] w-full mx-auto grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Panel: Settings - Scrollable */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
           {/* Basic Settings */}
           <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-xl border border-slate-700/50">
              <h3 className="font-bold text-white border-b border-slate-800 pb-3 mb-4 flex items-center gap-2"><Settings className="w-4 h-4"/> 基础设置</h3>
              <div className="space-y-4">
                {/* Exam Title */}
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

                {/* Duration */}
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

                {/* Access Key */}
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
           </div>

           {/* Exam Rules */}
           <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-xl border border-slate-700/50">
             <h3 className="font-bold text-white border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">组卷规则 & 分值</h3>
             
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

             <div className="flex justify-between items-center text-xs text-slate-500 mb-6 px-1">
               <span>题库组成: 简{localConfig.ruleSettings["简单"].count}/ 中{localConfig.ruleSettings["中等"].count}/ 困{localConfig.ruleSettings["困难"].count}</span>
               <span className="font-bold text-white text-base">总分: {totalScore}</span>
             </div>

             <Button className="w-full" onClick={handleSaveConfig} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} 
                {isSyncing ? "正在同步..." : "保存规则配置"}
             </Button>
           </div>
        </div>

        {/* Right Panel: Content - Fills Height */}
        <div className="col-span-12 lg:col-span-8 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/50 flex flex-col h-full overflow-hidden shadow-xl">
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
                            <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); startEdit(q); }} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"><Pencil className="w-4 h-4"/></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteId(q.id); }} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
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
                              <div>
                                <span className="text-slate-500 font-bold text-xs">初始代码</span>
                                <pre className="bg-black/30 p-3 rounded border border-slate-800 mt-1 font-mono text-xs text-green-400 overflow-x-auto">{q.template}</pre>
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

                   {/* Description: Flex grow 2 to take more space */}
                   <div className="flex-[2] flex flex-col min-h-0">
                        <label className="block text-slate-400 text-xs mb-2 font-medium">题目描述</label>
                        <textarea 
                          className="w-full flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none custom-scrollbar resize-none" 
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
                                          className="w-64 h-auto object-contain rounded border border-slate-700 bg-black/40 shadow-lg" 
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

                   {/* Code Template: Flex 1 */}
                   <div className="flex-1 flex flex-col min-h-0">
                      <label className="block text-slate-400 text-xs mb-2 font-medium">代码模板</label>
                      <textarea 
                        className="w-full flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-green-400 font-mono text-sm focus:border-blue-500 outline-none custom-scrollbar resize-none" 
                        value={questionForm.template}
                        onChange={e => setQuestionForm({...questionForm, template: e.target.value})}
                        spellCheck="false"
                      />
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
