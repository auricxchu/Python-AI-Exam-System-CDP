export type Difficulty = "简单" | "中等" | "困难";
export type ExamAssemblyMode = "random" | "manual";

export interface Question {
  id: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  template: string;
  points?: number;
  imageUrl?: string;
}

export interface RuleSettings {
  [key: string]: {
    count: number;
    points: number;
  };
}

export interface ManualPaperQuestion {
  questionId: string;
  points: number;
}

export interface ExamConfig {
  examTitle: string;
  accessKey?: string;
  adminPasswordHash?: string;
  adminPasswordUpdatedAt?: string;
  duration: number;
  questionBank: Question[];
  ruleSettings: RuleSettings;
  assemblyMode: ExamAssemblyMode;
  manualPaperQuestions: ManualPaperQuestion[];
}

export interface UserProfile {
  name: string;
  studentId: string;
  joinedAt: string;
}

export type DeductionCategory = "syntax" | "logic" | "runtime" | "style";

export type DeductionCode =
  | "SYN_MINOR"
  | "SYN_BLOCK"
  | "LOG_MISS"
  | "LOG_WRONG"
  | "RUN_VAR"
  | "RUN_TYPE"
  | "STY_NAME"
  | "STY_DOC";

export interface DeductionRule {
  code: DeductionCode;
  label: string;
  category: DeductionCategory;
  weight: number;
  description: string;
}

export interface DeductionHit {
  code: DeductionCode;
  label: string;
  category: DeductionCategory;
  weight: number;
  evidence: string;
}

export interface GradingSummary {
  highlights: string;
  mainIssues: string;
  nextSteps: string;
}

export interface ScoreBreakdown {
  rawScore: number;
  finalScore: number;
  deductionTotal: number;
  floorApplied: boolean;
  categoryTotals: Record<DeductionCategory, number>;
}

export interface GradingResult {
  passed: boolean;
  score: number;
  fullScore: number;
  earnedScore: number;
  pathHit: boolean;
  blank: boolean;
  correctedAnswer?: string;
  detectedTags: DeductionHit[];
  scoreBreakdown: ScoreBreakdown;
  summary: GradingSummary;
  logic_feedback: string;
  quality_feedback: string;
  suggestion: string;
}

export interface ExamReviewSummary {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  nextSteps: string[];
}

export interface ExamReport {
  timestamp: string;
  totalScore: number;
  examTitle: string;
  startTime: string;
  endTime: string;
  studentName: string;
  studentId: string;
  results: Record<string, GradingResult>;
  reviewSummary?: ExamReviewSummary;
  questions: Question[];
  answers: Record<string, string>;
}

export interface ExamFeedbackPayload {
  category: "technical" | "grading" | "other";
  message: string;
  studentName: string;
  studentId: string;
  examTitle: string;
  startTime: string;
  endTime: string;
  score: number;
  aiProvider?: string;
  reportUrl?: string;
  examContext?: Record<string, unknown>;
  clientContext?: Record<string, unknown>;
}

export interface Notification {
  message: string;
  type: "success" | "warning" | "error";
}
