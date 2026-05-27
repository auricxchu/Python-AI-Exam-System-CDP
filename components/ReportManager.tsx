import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Download, Eye, Loader2, AlertTriangle, CheckCircle,
  Users, Calendar, ChevronRight, ChevronDown, CheckSquare, Square,
  ArrowUp, ArrowDown, Trash2
} from 'lucide-react';
import CodeDiffViewer from './CodeDiffViewer';
import CachedImage from './CachedImage';
import JSZip from 'jszip';
import { cloudService, ExamReportRow } from '../services/cloudService';
import { Button, ToolbarButton } from './ui';
import Modal from './Modal';

interface ReportManagerProps {
  theme: 'light' | 'dark';
}

interface ExamGroup {
  examTitle: string;
  reports: ExamReportRow[];
  studentCount: number;
  avgScore: number;
  startTime: string;
  endTime: string;
}

const ReportManager: React.FC<ReportManagerProps> = ({ theme }) => {
  const [reports, setReports] = useState<ExamReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewReport, setPreviewReport] = useState<ExamReportRow | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'studentId' | 'score' | 'time'>('studentId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; urls: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isLight = theme === 'light';

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await cloudService.fetchExamReports();
      setReports(data);
      if (data.length === 0) {
        setError('暂无考试成绩记录');
      }
    } catch {
      setError('加载成绩数据失败，请检查网络连接');
    } finally {
      setIsLoading(false);
    }
  };

  const groupedExams = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, ExamReportRow[]>();
    for (const r of reports) {
      const title = r.report_json?.examTitle || '未知考试';
      if (!map.has(title)) map.set(title, []);
      map.get(title)!.push(r);
    }
    return Array.from(map.entries()).map(([examTitle, examReports]) => {
      const scores = examReports.map(r => r.score).filter(s => !isNaN(s));
      const avgScore = scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
        : 0;
      const times = examReports
        .map(r => r.report_json?.startTime)
        .filter(Boolean)
        .sort();
      return {
        examTitle,
        reports: examReports.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
        studentCount: examReports.length,
        avgScore,
        startTime: times[0] || '',
        endTime: times[times.length - 1] || ''
      };
    });
  }, [reports]);

  const toggleSelectAll = (group: ExamGroup) => {
    const newSelected = new Set(selectedIds);
    const allSelected = group.reports.every(r => newSelected.has(r.id));
    for (const r of group.reports) {
      if (allSelected) {
        newSelected.delete(r.id);
      } else {
        newSelected.add(r.id);
      }
    }
    setSelectedIds(newSelected);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const getReportFilename = (report: ExamReportRow) => {
    if (report.report_url) {
      const parts = report.report_url.split('/');
      const leaf = parts[parts.length - 1];
      if (leaf) return decodeURIComponent(leaf);
    }
    return `${report.student_id}_${report.student_name}_ExamReport.txt`;
  };

  const downloadSingle = async (report: ExamReportRow) => {
    const filename = getReportFilename(report);
    if (report.report_url) {
      const text = await cloudService.fetchReportBlob(report.report_url);
      if (text) {
        triggerDownload(filename, text);
        return;
      }
    }
    // Fallback: generate from report_json
    const text = generateTxtFromJson(report);
    triggerDownload(filename, text);
  };

  const downloadSelected = async (group: ExamGroup) => {
    const selected = group.reports.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) return;

    setIsDownloading(true);
    try {
      if (selected.length === 1) {
        await downloadSingle(selected[0]);
      } else {
        const zip = new JSZip();
        for (const report of selected) {
          const filename = getReportFilename(report);
          let text: string | null = null;
          if (report.report_url) {
            text = await cloudService.fetchReportBlob(report.report_url);
          }
          if (!text) {
            text = generateTxtFromJson(report);
          }
          zip.file(filename, text);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const safeTitle = group.examTitle.replace(/[/\\?%*:|"<>]/g, '_');
        triggerBlobDownload(`${safeTitle}_成绩单汇总.zip`, blob);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(filename, blob);
  };

  const triggerBlobDownload = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteSingle = (report: ExamReportRow) => {
    setDeleteTarget({
      ids: [report.id],
      urls: report.report_url ? [report.report_url] : [],
      label: `${report.student_name}（${report.student_id}）的成绩单`
    });
  };

  const handleDeleteSelected = (group: ExamGroup) => {
    const selected = group.reports.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setDeleteTarget({
      ids: selected.map(r => r.id),
      urls: selected.map(r => r.report_url).filter(Boolean) as string[],
      label: `选中的 ${selected.length} 份成绩单`
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      for (let i = 0; i < deleteTarget.ids.length; i++) {
        await cloudService.deleteExamReport(deleteTarget.ids[i], deleteTarget.urls[i]);
      }
      setSelectedIds(new Set());
      await loadReports();
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const formatScore = (score: number) => {
    if (isNaN(score)) return '0.0';
    return score.toFixed(1);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const sortReports = (list: ExamReportRow[]) => {
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.student_name || '').localeCompare(b.student_name || '', 'zh');
          break;
        case 'studentId':
          cmp = (a.student_id || '').localeCompare(b.student_id || '', 'zh');
          break;
        case 'score':
          cmp = (a.score || 0) - (b.score || 0);
          break;
        case 'time':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'score' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3" />
      : <ArrowDown className="w-3 h-3" />;
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const cardBg = isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-700/50';
  const textPrimary = isLight ? 'text-slate-900' : 'text-white';
  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const tableHeaderBg = isLight ? 'bg-slate-50' : 'bg-slate-800/50';
  const tableRowHover = isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30';
  const tableBorder = isLight ? 'border-slate-200' : 'border-slate-700/50';
  const preBg = isLight
    ? 'bg-slate-50 text-slate-800 border-slate-200'
    : 'bg-slate-950/75 text-slate-200 border-slate-800';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className={`text-sm ${textMuted}`}>正在加载成绩数据...</p>
      </div>
    );
  }

  if (error || reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className={`p-4 rounded-full ${isLight ? 'bg-slate-100' : 'bg-slate-800'}`}>
          <FileText className={`w-10 h-10 ${textMuted}`} />
        </div>
        <p className={`text-sm ${textMuted}`}>{error || '暂无考试成绩记录'}</p>
        <Button variant="secondary" onClick={loadReports} className="mt-2">
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview Modal */}
      <Modal
        isOpen={!!previewReport}
        onClose={() => setPreviewReport(null)}
        title={previewReport ? `${previewReport.student_name} - 成绩单` : ''}
        footer={<Button onClick={() => setPreviewReport(null)}>关闭</Button>}
        panelClassName="max-w-[70vw]"
      >
        {previewReport && (
          <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
            <ReportPreview report={previewReport} theme={theme} />
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title="确认删除"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>取消</Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>
              确认删除
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full shrink-0 ${isLight ? 'bg-red-50' : 'bg-red-500/10'}`}>
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className={`text-sm font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              确定要删除{deleteTarget?.label}吗？
            </p>
            <p className={`text-xs mt-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              此操作将同时删除云端存储的成绩单文件和数据库记录，不可恢复。
            </p>
          </div>
        </div>
      </Modal>

      {/* Exam Groups */}
      {groupedExams.map((group) => {
        const isExpanded = expandedExam === group.examTitle;
        const allSelected = group.reports.length > 0 && group.reports.every(r => selectedIds.has(r.id));
        const someSelected = group.reports.some(r => selectedIds.has(r.id));
        const selectedCount = group.reports.filter(r => selectedIds.has(r.id)).length;

        return (
          <div key={group.examTitle} className={`rounded-xl border ${cardBg} overflow-hidden`}>
            {/* Exam Header - clickable */}
            <button
              type="button"
              className="w-full flex items-center justify-between p-5 text-left"
              onClick={() => setExpandedExam(isExpanded ? null : group.examTitle)}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={`p-2.5 rounded-lg shrink-0 ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/10 text-blue-400'}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className={`font-bold text-lg ${textPrimary} truncate`}>{group.examTitle}</h3>
                  <div className={`flex flex-wrap gap-4 mt-1 text-xs ${textMuted}`}>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {group.studentCount} 名学生
                    </span>
                    <span className="flex items-center gap-1">
                      平均分: <span className="font-bold text-blue-400">{formatScore(group.avgScore)}</span>
                    </span>
                    {group.startTime && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(group.startTime)}
                        {group.endTime && group.endTime !== group.startTime && ` ~ ${formatDate(group.endTime)}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 ml-4">
                {isExpanded ? <ChevronDown className={`w-5 h-5 ${textMuted}`} /> : <ChevronRight className={`w-5 h-5 ${textMuted}`} />}
              </div>
            </button>

            {/* Expanded Student List */}
            {isExpanded && (
              <div className={`border-t ${tableBorder} p-5`}>
                {/* Batch actions */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(group)}
                    className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                      isLight ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {allSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : someSelected ? <Square className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                    {allSelected ? '取消全选' : '全选'}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={selectedCount === 0 || isDownloading}
                      isLoading={isDownloading}
                      onClick={() => downloadSelected(group)}
                      className={isLight ? 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800 shadow-none text-xs h-8 rounded-lg' : 'text-xs h-8 rounded-lg shadow-none'}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {selectedCount > 0 ? `下载选中 (${selectedCount})` : '批量下载'}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={selectedCount === 0 || isDeleting}
                      isLoading={isDeleting}
                      onClick={() => handleDeleteSelected(group)}
                      className="text-xs h-8 rounded-lg shadow-none"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {selectedCount > 0 ? `删除选中 (${selectedCount})` : '批量删除'}
                    </Button>
                  </div>
                </div>

                {/* Student Table */}
                <div className={`rounded-lg border ${tableBorder} overflow-hidden`}>
                  <div className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 text-xs font-bold ${tableHeaderBg} ${textMuted}`}>
                    <span className="w-6" />
                    <SortHeader field="name" label="姓名" sortField={sortField} sortDir={sortDir} onSort={handleSort} isLight={isLight} />
                    <SortHeader field="studentId" label="学号" sortField={sortField} sortDir={sortDir} onSort={handleSort} isLight={isLight} />
                    <SortHeader field="score" label="得分" sortField={sortField} sortDir={sortDir} onSort={handleSort} isLight={isLight} />
                    <SortHeader field="time" label="提交时间" sortField={sortField} sortDir={sortDir} onSort={handleSort} isLight={isLight} />
                    <span>操作</span>
                  </div>
                  {sortReports(group.reports).map((report) => (
                    <div
                      key={report.id}
                      className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 text-sm items-center border-t ${tableBorder} ${tableRowHover} transition-colors`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSelect(report.id)}
                        className="w-6 flex justify-center"
                      >
                        {selectedIds.has(report.id)
                          ? <CheckSquare className="w-4 h-4 text-blue-400" />
                          : <Square className={`w-4 h-4 ${textMuted}`} />}
                      </button>
                      <span className={`font-medium ${textPrimary} truncate`}>{report.student_name || '-'}</span>
                      <span className={`${textMuted} truncate`}>{report.student_id || '-'}</span>
                      <span className={`font-bold font-mono ${textPrimary}`}>{formatScore(report.score)}</span>
                      <span className={`${textMuted} text-xs`}>{formatFullDate(report.created_at)}</span>
                      <div className="flex items-center gap-1">
                        <ToolbarButton
                          theme={theme}
                          onClick={() => setPreviewReport(report)}
                          title="预览成绩单"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </ToolbarButton>
                        <ToolbarButton
                          theme={theme}
                          onClick={() => downloadSingle(report)}
                          title="下载成绩单"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </ToolbarButton>
                        <ToolbarButton
                          theme={theme}
                          onClick={() => handleDeleteSingle(report)}
                          title="删除成绩单"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </ToolbarButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Report Preview (rendered from report_json) ───

const ReportPreview: React.FC<{ report: ExamReportRow; theme: 'light' | 'dark' }> = ({ report, theme }) => {
  const isLight = theme === 'light';
  const json = report.report_json;
  const questions = json?.questions || [];
  const results = json?.results || {};
  const answers = json?.answers || {};
  const totalPossible = questions.reduce((s, q) => s + (q.points || 0), 0);

  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const textPrimary = isLight ? 'text-slate-900' : 'text-white';
  const labelMuted = isLight ? 'text-slate-400' : 'text-slate-500';
  const codeBlockClass = isLight
    ? 'bg-slate-100 text-slate-800 rounded-lg p-3 text-xs leading-6 whitespace-pre-wrap break-all max-h-60 overflow-auto font-mono'
    : 'bg-slate-950 text-slate-200 rounded-lg p-3 text-xs leading-6 whitespace-pre-wrap break-all max-h-60 overflow-auto font-mono';
  const panelClass = isLight
    ? 'bg-slate-50 border border-slate-200 rounded-lg p-3'
    : 'bg-slate-900/50 border border-slate-800 rounded-lg p-3';
  const strengthTone = isLight
    ? 'border-emerald-200 bg-emerald-50'
    : 'border-emerald-500/20 bg-emerald-500/10';
  const issueTone = isLight
    ? 'border-rose-200 bg-rose-50'
    : 'border-rose-500/20 bg-rose-500/10';
  const nextTone = isLight
    ? 'border-blue-200 bg-blue-50'
    : 'border-blue-500/20 bg-blue-500/10';

  const getDeductionToneClass = (category: string) => {
    if (isLight) {
      switch (category) {
        case 'syntax': return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'logic': return 'bg-rose-50 text-rose-700 border-rose-200';
        case 'runtime': return 'bg-orange-50 text-orange-700 border-orange-200';
        case 'style': return 'bg-sky-50 text-sky-700 border-sky-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
      }
    }
    switch (category) {
      case 'syntax': return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'logic': return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
      case 'runtime': return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
      case 'style': return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
      default: return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className={`text-xl font-bold ${textPrimary}`}>考试成绩单</h2>
        <p className={`text-3xl font-bold text-blue-400 mt-2`}>
          {json?.totalScore != null ? json.totalScore.toFixed(1) : '-'}
          <span className={`text-lg font-normal ml-1 ${textMuted}`}>/ {totalPossible}</span>
        </p>
      </div>

      {/* Info grid */}
      <div className={`grid grid-cols-2 gap-x-6 gap-y-2 text-sm ${panelClass}`}>
        <InfoRow label="考生姓名" value={json?.studentName} />
        <InfoRow label="考生学号" value={json?.studentId} />
        <InfoRow label="考试名称" value={json?.examTitle} />
        <InfoRow label="开始时间" value={json?.startTime ? new Date(json.startTime).toLocaleString('zh-CN') : '-'} />
        <InfoRow label="完成时间" value={json?.endTime ? new Date(json.endTime).toLocaleString('zh-CN') : '-'} />
        <InfoRow label="提交时间" value={new Date(report.created_at).toLocaleString('zh-CN')} />
      </div>

      {/* Review Summary */}
      {json?.reviewSummary && (
        <div className="space-y-3">
          <p className={`text-sm leading-relaxed ${textMuted}`}>{json.reviewSummary.overview}</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className={`${panelClass} ${strengthTone}`}>
              <span className="font-bold block mb-1.5">做得好的点</span>
              <ul className="space-y-1">
                {json.reviewSummary.strengths.map((s, i) => (
                  <li key={`s-${i}`}>- {s}</li>
                ))}
              </ul>
            </div>
            <div className={`${panelClass} ${issueTone}`}>
              <span className="font-bold block mb-1.5">主要失分点</span>
              <ul className="space-y-1">
                {json.reviewSummary.weaknesses.map((w, i) => (
                  <li key={`w-${i}`}>- {w}</li>
                ))}
              </ul>
            </div>
            <div className={`${panelClass} ${nextTone}`}>
              <span className="font-bold block mb-1.5">下一步提高</span>
              <ul className="space-y-1">
                {json.reviewSummary.nextSteps.map((n, i) => (
                  <li key={`n-${i}`}>- {n}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Per-question results */}
      {questions.map((q, idx) => {
        const res = results[q.id];
        if (!res) return null;
        const pts = Number(((res.score / 100) * (q.points || 0)).toFixed(1));
        return (
          <div key={q.id} className={panelClass}>
            {/* Question header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className={`font-bold ${textPrimary}`}>第{idx + 1}题：{q.title}</span>
                <div className={`flex flex-wrap gap-2 mt-1 text-xs ${textMuted}`}>
                  <span>{q.difficulty}</span>
                  <span>满分 {q.points} 分</span>
                  <span>得分 <span className="font-bold">{pts}</span> 分</span>
                  <span>评分 {res.score}%</span>
                </div>
              </div>
            </div>

            {/* Question description */}
            <p className={`text-xs whitespace-pre-wrap leading-relaxed mb-3 ${textMuted}`}>{q.description}</p>

            {/* Question image */}
            {q.imageUrl && (
              <div className="mb-3">
                <CachedImage
                  src={q.imageUrl}
                  alt={`${q.title} 配图`}
                  referrerPolicy="no-referrer"
                  className={`rounded-lg border max-w-full max-h-[300px] ${isLight ? 'border-slate-200' : 'border-slate-700'}`}
                />
              </div>
            )}

            {/* Skill completion bars */}
            {res.skillCompletions && res.skillCompletions.length > 0 ? (
              <div className="space-y-1.5 mb-3">
                <span className={`text-xs font-bold ${textMuted}`}>能力完成度</span>
                {res.skillCompletions.map((skill) => {
                  const rubricDef = res.rubricUsed?.find(r => r.skillId === skill.skillId);
                  const earnedPct = Math.round(skill.completion * 100);
                  const barColor = earnedPct >= 80 ? 'bg-emerald-500' : earnedPct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                  return (
                    <div key={skill.skillId} className="flex items-center gap-2">
                      <span className={`text-xs truncate w-28 ${textMuted}`} title={rubricDef?.description}>{rubricDef?.description || skill.skillId}</span>
                      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}>
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${earnedPct}%` }} />
                      </div>
                      <span className={`text-xs w-8 text-right ${textMuted}`}>{earnedPct}%</span>
                      {rubricDef && (
                        <span className={`text-xs w-14 text-right ${textMuted}`}>
                          {Math.round(rubricDef.score * skill.completion)}/{rubricDef.score}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : res.blank ? (
              <div className={`text-xs px-2.5 py-1 rounded-full border inline-block mb-3 ${
                isLight
                  ? 'border-slate-200 bg-slate-100 text-slate-500'
                  : 'border-slate-700 bg-slate-800/50 text-slate-500'
              }`}>本题暂未作答</div>
            ) : (
              /* Legacy deduction tags for old reports */
              <div className="flex flex-wrap gap-2 mb-3">
                {res.detectedTags && res.detectedTags.length > 0 ? (
                  res.detectedTags.map((tag) => (
                    <div key={tag.code} className={`text-xs px-2.5 py-1 rounded-full border ${getDeductionToneClass(tag.category)}`} title={tag.evidence}>
                      {tag.label} (-{tag.weight}%)
                    </div>
                  ))
                ) : (
                  <div className={`text-xs px-2.5 py-1 rounded-full border ${
                    isLight
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  }`}>未命中固定扣分标签</div>
                )}
              </div>
            )}

            {/* Light deduction tags */}
            {res.lightDeductions && res.lightDeductions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {res.lightDeductions.map((ded) => (
                  <div key={ded.code} className={`text-xs px-2 py-0.5 rounded-full border ${getDeductionToneClass(ded.category)}`} title={ded.evidence}>
                    {ded.label} (-{ded.weight})
                  </div>
                ))}
              </div>
            )}

            {/* Summary grid */}
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div className={`${panelClass} ${strengthTone}`}>
                <span className="font-bold">做得好的点</span>
                <p className="mt-1">{res.summary?.highlights || '-'}</p>
              </div>
              <div className={`${panelClass} ${issueTone}`}>
                <span className="font-bold">主要失分点</span>
                <p className="mt-1">{res.summary?.mainIssues || '-'}</p>
              </div>
              <div className={`${panelClass} ${nextTone}`}>
                <span className="font-bold">下一步提高</span>
                <p className="mt-1">{res.summary?.nextSteps || '-'}</p>
              </div>
            </div>

            {/* Skill completion evidence */}
            {res.skillCompletions && res.skillCompletions.some(s => s.evidence) && (
              <div className={`p-3 rounded-lg border mb-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className={`font-bold block mb-1.5 text-xs ${textPrimary}`}>能力评估依据</span>
                <ul className={`space-y-1.5 text-xs ${textMuted}`}>
                  {res.skillCompletions.filter(s => s.evidence).map((skill) => (
                    <li key={skill.skillId} className="leading-relaxed">
                      <span className={textPrimary}>{res.rubricUsed?.find(r => r.skillId === skill.skillId)?.description || skill.skillId}：</span>
                      {skill.evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Light deduction evidence */}
            {res.lightDeductions && res.lightDeductions.length > 0 && (
              <div className={`p-3 rounded-lg border mb-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className={`font-bold block mb-1.5 text-xs ${textPrimary}`}>轻量扣分证据</span>
                <ul className={`space-y-1.5 text-xs ${textMuted}`}>
                  {res.lightDeductions.map((ded) => (
                    <li key={ded.code} className="leading-relaxed">
                      <span className={textPrimary}>{ded.label}：</span>{ded.evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Legacy deduction evidence for old reports */}
            {(!res.skillCompletions || res.skillCompletions.length === 0) && (!res.lightDeductions || res.lightDeductions.length === 0) && res.detectedTags && res.detectedTags.length > 0 && (
              <div className={`p-3 rounded-lg border mb-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className={`font-bold block mb-1.5 text-xs ${textPrimary}`}>扣分证据</span>
                <ul className={`space-y-1.5 text-xs ${textMuted}`}>
                  {res.detectedTags.map((tag) => (
                    <li key={tag.code} className="leading-relaxed">
                      <span className={textPrimary}>{tag.label}：</span>{tag.evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Code diff / student answer */}
            {res.correctedAnswer ? (
              (() => {
                const studentAnswer = (answers[q.id] ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
                const normalizedCorrected = (res.correctedAnswer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
                const isIdentical = studentAnswer === normalizedCorrected;
                return isIdentical ? (
                  <div className={`mt-3 p-4 rounded-xl border ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <span className={`font-bold block mb-2 ${textPrimary}`}>考生作答 vs AI 参考答案</span>
                    <div className={`flex items-center gap-2 text-xs mb-3 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      <CheckCircle className="w-4 h-4" /> 答案与参考答案完全一致
                    </div>
                    <pre className={codeBlockClass}>{answers[q.id]}</pre>
                  </div>
                ) : (
                  <div className="mt-3">
                    <CodeDiffViewer
                      original={answers[q.id] ?? ''}
                      modified={res.correctedAnswer ?? ''}
                      theme={theme}
                      title="答案对比"
                    />
                    <div className="flex mt-1.5">
                      <span className={`flex-1 text-center text-[11px] ${labelMuted}`}>学生作答</span>
                      <span className={`flex-1 text-center text-[11px] ${labelMuted}`}>AI 参考答案</span>
                    </div>
                  </div>
                );
              })()
            ) : (
              answers[q.id] ? (
                <div className={`mt-3 p-4 rounded-xl border ${isLight ? 'bg-white/90 border-slate-200' : 'bg-slate-900/70 border-slate-800'}`}>
                  <span className={`font-bold block mb-2 ${textPrimary}`}>学生作答</span>
                  <pre className={codeBlockClass}>{answers[q.id]}</pre>
                </div>
              ) : null
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Generate TXT from JSON (fallback when report_url is unavailable) ───

function generateTxtFromJson(report: ExamReportRow): string {
  const json = report.report_json;
  if (!json) return '无报告数据';

  const lines: string[] = [];
  const questions = json.questions || [];
  const results = json.results || {};
  const answers = json.answers || {};

  lines.push("================================================================");
  lines.push("               PYTHON 智能考试系统 - 考试报告");
  lines.push("================================================================");
  lines.push(`考生姓名: ${json.studentName || report.student_name || '-'}`);
  lines.push(`考生学号: ${json.studentId || report.student_id || '-'}`);
  lines.push(`考试科目: ${json.examTitle || '-'}`);
  lines.push(`开始时间: ${json.startTime ? new Date(json.startTime).toLocaleString() : '-'}`);
  lines.push(`完成时间: ${json.endTime ? new Date(json.endTime).toLocaleString() : '-'}`);
  lines.push(`最终得分: ${(json.totalScore ?? 0).toFixed(1)} 分`);
  lines.push("================================================================");

  if (json.reviewSummary) {
    lines.push("[阅卷总结]");
    lines.push(`总体评价: ${json.reviewSummary.overview}`);
    lines.push(`做得好的点: ${json.reviewSummary.strengths.join("；")}`);
    lines.push(`主要失分点: ${json.reviewSummary.weaknesses.join("；")}`);
    lines.push(`下一步提高: ${json.reviewSummary.nextSteps.join("；")}`);
    lines.push("================================================================");
  }
  lines.push("");

  questions.forEach((q, idx) => {
    const res = results[q.id];
    if (!res) return;
    lines.push(`题目 ${idx + 1}: ${q.title} (${q.difficulty}) - [${q.points}分]`);
    lines.push(`----------------------------------------------------------------`);
    lines.push(`[题目内容]`);
    lines.push(q.description);
    lines.push("");
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
}

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="text-slate-500 shrink-0">{label}：</span>
    <span className="text-slate-300 truncate">{value || '-'}</span>
  </div>
);

type SortField = 'name' | 'studentId' | 'score' | 'time';

const SortHeader: React.FC<{
  field: SortField; label: string;
  sortField: SortField; sortDir: 'asc' | 'desc';
  onSort: (f: SortField) => void;
  isLight: boolean;
}> = ({ field, label, sortField, sortDir, onSort, isLight }) => {
  const active = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 transition-colors ${isLight ? 'hover:text-slate-900' : 'hover:text-white'}`}
    >
      {label}
      {active && (
        sortDir === 'asc'
          ? <ArrowUp className="w-3 h-3 text-blue-400" />
          : <ArrowDown className="w-3 h-3 text-blue-400" />
      )}
    </button>
  );
};

export default ReportManager;
