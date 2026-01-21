import { ExamConfig, ExamReport } from "../types";
import { DEFAULT_CONFIG } from "../constants";

const CONFIG_KEY = "pyexam_config";
const REPORT_PREFIX = "pyexam_report_";

export const storageService = {
  loadConfig: (): ExamConfig => {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to load config", e);
    }
    return DEFAULT_CONFIG;
  },

  saveConfig: (config: ExamConfig): void => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error("Failed to save config", e);
    }
  },

  saveReport: (userId: string, report: ExamReport): void => {
    try {
      const key = `${REPORT_PREFIX}${userId}_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(report));
    } catch (e) {
      console.error("Failed to save report", e);
    }
  },

  getReports: (): ExamReport[] => {
    const reports: ExamReport[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(REPORT_PREFIX)) {
        try {
          const item = localStorage.getItem(key);
          if (item) reports.push(JSON.parse(item));
        } catch (e) {}
      }
    }
    return reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
};
