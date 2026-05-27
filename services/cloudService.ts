
import { Question, ExamReport, ExamConfig, ExamFeedbackPayload } from "../types";
import { DEFAULT_CONFIG, DEFAULT_QUESTIONS } from "../constants";
import { supabase } from "./supabaseClient";
import { normalizeExamConfig } from "./examConfigService";
import { isNetworkError } from "../hooks/useNetworkStatus";

export interface CloudResult {
  success: boolean;
  error?: string;
  url?: string;
}

export interface ExamReportRow {
  id: string;
  created_at: string;
  student_id: string;
  student_name: string;
  score: number;
  report_url: string;
  report_json: ExamReport;
}

const createTicketId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const cloudService = {
  /**
   * Fetch full exam config from Supabase DB
   */
  fetchExamConfig: async (): Promise<ExamConfig | null> => {
    if (!supabase) {
      console.warn("Supabase not configured, using local defaults.");
      return null;
    }

    try {
      // Assuming a table 'question_bank' (keeping name for compat) with a 'data' column
      const { data, error } = await supabase
        .from('question_bank')
        .select('data')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (!data || !data.data) {
        console.log("Cloud: No config found in DB.");
        return null;
      }

      // Backward compatibility: If data is just an array of questions, wrap it
      if (Array.isArray(data.data)) {
          return normalizeExamConfig({
              ...DEFAULT_CONFIG,
              questionBank: data.data as Question[]
          });
      }

      return normalizeExamConfig(data.data as ExamConfig);
    } catch (e) {
      if (isNetworkError(e)) {
        console.warn("Cloud fetch: Network offline, using local config");
      } else {
        console.error("Cloud fetch error:", e);
      }
      return null;
    }
  },

  /**
   * Save full exam config to Supabase DB
   */
  saveExamConfig: async (config: ExamConfig): Promise<CloudResult> => {
    if (!supabase) {
      console.warn("Supabase not configured, saving to localStorage only.");
      localStorage.setItem("cloud_exam_config_backup", JSON.stringify(config));
      return { success: false, error: "Supabase not configured" };
    }

    try {
      // 1. Insert a new record with the entire config
      const { error } = await supabase
        .from('question_bank')
        .insert([{ data: normalizeExamConfig(config) }]);

      if (error) throw error;
      
      console.log("Cloud: Exam configuration synced.");

      // 2. Auto-Cleanup: Keep only the latest 10 versions
      const { data: oldRecords } = await supabase
        .from('question_bank')
        .select('id')
        .order('updated_at', { ascending: false })
        .range(10, 50);
      
      if (oldRecords && oldRecords.length > 0) {
        const idsToDelete = oldRecords.map(r => r.id);
        await supabase
          .from('question_bank')
          .delete()
          .in('id', idsToDelete);
      }

      return { success: true };
    } catch (e: any) {
      if (isNetworkError(e)) {
        console.warn("Cloud save: Network offline");
        return { success: false, error: "网络未连接，数据已保存到本地" };
      }
      console.error("Cloud save error:", e);
      return { success: false, error: e.message || "Unknown error" };
    }
  },

  /**
   * Upload an image asset for a question
   */
  uploadImage: async (file: File): Promise<CloudResult> => {
    if (!supabase) {
      return { success: false, error: "未配置 Supabase，无法上传图片" };
    }

    try {
      // FORCE SAFE FILENAME: Use numeric timestamp + random string to avoid Chinese char issues in URL
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `questions/${fileName}`;

      console.log(`Uploading ${file.name} as ${filePath}`);

      // Upload to 'exam-assets' bucket
      const { error: uploadError } = await supabase
        .storage
        .from('exam-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);
        if (uploadError.message.includes("Bucket not found")) {
            return { success: false, error: "请在 Supabase 创建名为 'exam-assets' 的公开存储桶" };
        }
        if (uploadError.message.includes("row-level security") || uploadError.message.includes("violates row-level security policy")) {
            return { success: false, error: "权限不足：请在 Supabase Storage 检查 'exam-assets' 的 RLS 策略 (需允许 public insert)" };
        }
        throw uploadError;
      }

      // Get Public URL
      const { data: { publicUrl } } = supabase
        .storage
        .from('exam-assets')
        .getPublicUrl(filePath);

      console.log("Image available at:", publicUrl);

      return { success: true, url: publicUrl };

    } catch (e: any) {
      if (isNetworkError(e)) {
        console.warn("Image upload: Network offline");
        return { success: false, error: "网络连接已断开，无法上传图片" };
      }
      console.error("Image upload error:", e);
      return { success: false, error: e.message || "上传失败 (请检查服务器 RLS 策略)" };
    }
  },

  /**
   * Upload exam report
   */
  uploadExamReport: async (studentId: string, filename: string, txtContent: string, jsonReport: ExamReport): Promise<CloudResult> => {
    // Always save locally as backup first
    const key = `cloud_report_${studentId}_${Date.now()}`;
    try {
      localStorage.setItem(key, JSON.stringify(jsonReport));
    } catch (e) {
      console.warn("Local backup failed", e);
    }

    if (!supabase) {
      console.warn("Supabase not configured, mocking upload.");
      await new Promise(r => setTimeout(r, 1000));
      return { success: false, error: "Supabase not configured" };
    }

    try {
      // 1. Upload TXT File to Storage
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      // Sanitize report filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeStudentId = studentId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeExamTitle = jsonReport.examTitle.replace(/[^a-zA-Z0-9一-鿿._-]/g, '_').substring(0, 80) || '未知考试';
      const filePath = `${safeStudentId}/${safeExamTitle}/${Date.now()}_${sanitizedFilename}`;
      
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('exam-reports')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get Public URL
      const { data: { publicUrl } } = supabase
        .storage
        .from('exam-reports')
        .getPublicUrl(filePath);

      // 2. Insert Record into DB
      const { error: dbError } = await supabase
        .from('exam_reports')
        .insert([{
          student_id: studentId,
          student_name: jsonReport.studentName || "Unknown",
          score: jsonReport.totalScore,
          report_url: publicUrl,
          report_json: jsonReport
        }]);

      if (dbError) throw dbError;

      console.log("Cloud: Upload successful. URL:", publicUrl);
      return { success: true, url: publicUrl };

    } catch (e: any) {
      if (isNetworkError(e)) {
        console.warn("Cloud upload: Network offline");
        return { success: false, error: "网络连接已断开，成绩已保存到本地" };
      }
      console.error("Cloud upload error:", e);
      return { success: false, error: e.message || "Unknown error" };
    }
  },

  submitExamFeedback: async (payload: ExamFeedbackPayload): Promise<CloudResult> => {
    const backupKey = `exam_feedback_${payload.studentId}_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const ticketId = createTicketId();
    const normalizedCategory = payload.category === "grading" ? "grading" : payload.category === "other" ? "other" : "technical";

    try {
      localStorage.setItem(
        backupKey,
        JSON.stringify({
          ticketId,
          createdAt,
          ...payload
        })
      );
    } catch (error) {
      console.warn("Local feedback backup failed", error);
    }

    if (!supabase) {
      return { success: false, error: "Supabase not configured" };
    }

    try {
      const filePath = `${payload.studentId}/${createdAt.replace(/[:.]/g, "-")}_${normalizedCategory}_${ticketId}.json`;
      const feedbackBlob = new Blob(
        [
          JSON.stringify(
            {
              ticketId,
              createdAt,
              ...payload
            },
            null,
            2
          )
        ],
        { type: "application/json;charset=utf-8" }
      );

      const { error: uploadError } = await supabase
        .storage
        .from("exam-feedbacks")
        .upload(filePath, feedbackBlob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/json"
        });

      if (uploadError) {
        if (uploadError.message.includes("Bucket not found")) {
          return { success: false, error: "请先在 Supabase 创建名为 'exam-feedbacks' 的反馈存储桶" };
        }
        throw uploadError;
      }

      const { error: dbError } = await supabase
        .from("exam_feedback_tickets")
        .insert([
          {
            ticket_id: ticketId,
            category: normalizedCategory,
            message: payload.message.trim(),
            student_id: payload.studentId,
            student_name: payload.studentName,
            exam_title: payload.examTitle,
            exam_started_at: payload.startTime,
            exam_finished_at: payload.endTime,
            score: payload.score,
            ai_provider: payload.aiProvider || null,
            report_url: payload.reportUrl || null,
            storage_path: filePath,
            exam_context: payload.examContext || {},
            client_context: payload.clientContext || {}
          }
        ]);

      if (dbError) throw dbError;

      return { success: true, url: filePath };
    } catch (error: any) {
      if (isNetworkError(error)) {
        console.warn("Feedback submit: Network offline");
        return { success: false, error: "网络连接已断开，反馈已保存到本地" };
      }
      console.error("Feedback submit error:", error);
      return { success: false, error: error?.message || "Unknown error" };
    }
  },

  /**
   * Fetch all exam reports from Supabase
   */
  fetchExamReports: async (): Promise<ExamReportRow[]> => {
    if (!supabase) {
      console.warn("Supabase not configured, cannot fetch reports.");
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('exam_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as ExamReportRow[];
    } catch (e: any) {
      if (isNetworkError(e)) {
        console.warn("Fetch reports: Network offline");
      } else {
        console.error("Fetch reports error:", e);
      }
      return [];
    }
  },

  /**
   * Fetch the text content of a report from its public URL
   */
  fetchReportBlob: async (reportUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(reportUrl);
      if (!response.ok) {
        console.warn(`Failed to fetch report from ${reportUrl}: ${response.status}`);
        return null;
      }
      return await response.text();
    } catch (e: any) {
      console.error("Fetch report blob error:", e);
      return null;
    }
  },

  /**
   * Delete an exam report by ID, including the storage file
   */
  deleteExamReport: async (id: string, reportUrl?: string): Promise<CloudResult> => {
    if (!supabase) {
      return { success: false, error: "Supabase not configured" };
    }

    try {
      // 1. Delete from DB
      const { error: dbError } = await supabase
        .from('exam_reports')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      // 2. Delete from storage if we have a URL
      if (reportUrl) {
        try {
          const url = new URL(reportUrl);
          const pathMatch = url.pathname.match(/\/exam-reports\/(.+)$/);
          if (pathMatch) {
            const storagePath = decodeURIComponent(pathMatch[1]);
            await supabase.storage.from('exam-reports').remove([storagePath]);
          }
        } catch {
          // Storage cleanup failure is non-fatal
          console.warn("Failed to parse or delete storage file for report", id);
        }
      }

      return { success: true };
    } catch (e: any) {
      if (isNetworkError(e)) {
        return { success: false, error: "网络未连接" };
      }
      console.error("Delete report error:", e);
      return { success: false, error: e.message || "Unknown error" };
    }
  }
};
