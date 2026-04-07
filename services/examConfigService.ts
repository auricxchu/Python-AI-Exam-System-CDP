import { DEFAULT_CONFIG } from "../constants";
import {
  Difficulty,
  ExamConfig,
  ManualPaperQuestion,
  Question,
  RuleSettings
} from "../types";

const DIFFICULTIES: Difficulty[] = ["简单", "中等", "困难"];

const getSafeRule = (
  rules: RuleSettings | undefined,
  difficulty: Difficulty,
  fallbackRules: RuleSettings
) => {
  const candidate = rules?.[difficulty];
  const fallback = fallbackRules[difficulty] || { count: 0, points: 10 };
  const candidateCount = candidate?.count;
  const candidatePoints = candidate?.points;
  return {
    count: Number.isFinite(candidateCount) ? Math.max(0, Number(candidateCount)) : fallback.count,
    points: Number.isFinite(candidatePoints) ? Math.max(0, Number(candidatePoints)) : fallback.points
  };
};

export const normalizeRuleSettings = (rules?: RuleSettings): RuleSettings => {
  const fallbackRules = DEFAULT_CONFIG.ruleSettings;
  return DIFFICULTIES.reduce<RuleSettings>((acc, difficulty) => {
    acc[difficulty] = getSafeRule(rules, difficulty, fallbackRules);
    return acc;
  }, {});
};

export const getDefaultQuestionPoints = (question: Question, ruleSettings: RuleSettings): number => {
  const fallback = ruleSettings[question.difficulty]?.points;
  return Number.isFinite(fallback) && Number(fallback) > 0 ? Number(fallback) : 10;
};

const normalizeManualPaperQuestions = (
  questions: Question[],
  manualPaperQuestions: ManualPaperQuestion[] | undefined,
  ruleSettings: RuleSettings
): ManualPaperQuestion[] => {
  if (!Array.isArray(manualPaperQuestions)) return [];

  const existingIds = new Set(questions.map((question) => question.id));
  const uniqueIds = new Set<string>();

  return manualPaperQuestions.reduce<ManualPaperQuestion[]>((acc, item) => {
    if (!item?.questionId || !existingIds.has(item.questionId) || uniqueIds.has(item.questionId)) {
      return acc;
    }

    const question = questions.find((entry) => entry.id === item.questionId);
    const safePoints = Number.isFinite(item.points) && Number(item.points) > 0
      ? Number(item.points)
      : question
        ? getDefaultQuestionPoints(question, ruleSettings)
        : 10;

    uniqueIds.add(item.questionId);
    acc.push({
      questionId: item.questionId,
      points: safePoints
    });
    return acc;
  }, []);
};

export const normalizeExamConfig = (rawConfig?: Partial<ExamConfig> | null): ExamConfig => {
  const baseConfig = DEFAULT_CONFIG as ExamConfig;
  const questionBank = Array.isArray(rawConfig?.questionBank) ? rawConfig.questionBank : baseConfig.questionBank;
  const ruleSettings = normalizeRuleSettings(rawConfig?.ruleSettings);

  return {
    ...baseConfig,
    ...rawConfig,
    accessKey: rawConfig?.accessKey ?? baseConfig.accessKey ?? "",
    duration: Number.isFinite(rawConfig?.duration) ? Number(rawConfig?.duration) : baseConfig.duration,
    questionBank,
    ruleSettings,
    assemblyMode: rawConfig?.assemblyMode === "manual" ? "manual" : "random",
    manualPaperQuestions: normalizeManualPaperQuestions(questionBank, rawConfig?.manualPaperQuestions, ruleSettings)
  };
};

export const buildRandomQuestions = (pool: Question[], rules: RuleSettings): Question[] => {
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const simple = pool.filter((question) => question.difficulty === "简单");
  const medium = pool.filter((question) => question.difficulty === "中等");
  const hard = pool.filter((question) => question.difficulty === "困难");

  const select = (source: Question[], rule?: RuleSettings[string]) => {
    if (!rule) return [];
    return shuffleArray(source)
      .slice(0, rule.count || 0)
      .map((question) => ({ ...question, points: rule.points }));
  };

  return [
    ...select(simple, rules["简单"]),
    ...select(medium, rules["中等"]),
    ...select(hard, rules["困难"])
  ];
};

export const buildManualQuestions = (
  questionBank: Question[],
  manualPaperQuestions: ManualPaperQuestion[]
): Question[] => {
  const questionMap = new Map(questionBank.map((question) => [question.id, question]));
  return manualPaperQuestions.reduce<Question[]>((acc, item) => {
    const question = questionMap.get(item.questionId);
    if (!question) return acc;
    acc.push({
      ...question,
      points: item.points
    });
    return acc;
  }, []);
};

export const buildExamQuestions = (config: ExamConfig): Question[] => {
  return config.assemblyMode === "manual"
    ? buildManualQuestions(config.questionBank, config.manualPaperQuestions)
    : buildRandomQuestions(config.questionBank, config.ruleSettings);
};

export const calculateRandomPaperTotal = (ruleSettings: RuleSettings): number => {
  return DIFFICULTIES.reduce((total, difficulty) => {
    const rule = ruleSettings[difficulty];
    return total + (rule?.count || 0) * (rule?.points || 0);
  }, 0);
};

export const calculateManualPaperTotal = (manualPaperQuestions: ManualPaperQuestion[]): number => {
  return manualPaperQuestions.reduce((total, item) => total + (item.points || 0), 0);
};
