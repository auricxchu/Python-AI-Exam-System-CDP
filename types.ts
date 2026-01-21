
export type Difficulty = "简单" | "中等" | "困难";

export interface Question {
  id: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  template: string;
  points?: number; // assigned during exam generation
  imageUrl?: string; // URL of the uploaded image
}

export interface RuleSettings {
  [key: string]: {
    count: number;
    points: number;
  };
}

export interface ExamConfig {
  examTitle: string;
  accessKey?: string; // Exam password
  duration: number; // in minutes
  questionBank: Question[];
  ruleSettings: RuleSettings;
}

export interface UserProfile {
  name: string;
  studentId: string;
  joinedAt: string;
}

export interface GradingResult {
  passed: boolean;
  score: number;
  logic_feedback: string;
  quality_feedback: string;
  suggestion: string;
}

export interface ExamReport {
  timestamp: string;
  totalScore: number;
  studentName: string;
  studentId: string;
  results: Record<string, GradingResult>;
  questions: Question[];
  answers: Record<string, string>;
}

export interface Notification {
  message: string;
  type: 'success' | 'warning' | 'error';
}
