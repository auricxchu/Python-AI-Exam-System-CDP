import { GoogleGenAI, Type } from "@google/genai";
import {
  DeductionCategory,
  DeductionCode,
  DeductionHit,
  DeductionRule,
  Difficulty,
  ExamReviewSummary,
  GradingResult,
  Question
} from "../types";

export type AiProvider = "deepseek" | "gemini" | "openai" | "qwen" | "moonshot";

type ProviderStatus = "ok" | "fail";

const hasKey = (val?: string) => !!val && val.trim().length > 0;

export interface AiProviderConfig {
  apiKey: string;
  model: string;
}

export type AiProviderSettings = Record<AiProvider, AiProviderConfig>;

const AI_SETTINGS_STORAGE_KEY = "app_ai_settings";
const SCORE_FLOOR_IF_PATH_HIT = 40;

const DEDUCTION_CAPS: Record<DeductionCategory, number> = {
  syntax: 25,
  logic: 25,
  runtime: 10,
  style: 5
};

export const DEDUCTION_RULES: DeductionRule[] = [
  {
    code: "SYN_MINOR",
    label: "语法小错误",
    category: "syntax",
    weight: 10,
    description: "偶发性手误，如中英文符号混用、单处拼写问题，不影响整体逻辑理解。"
  },
  {
    code: "SYN_BLOCK",
    label: "结构性语法错误",
    category: "syntax",
    weight: 20,
    description: "缩进、函数定义或代码块结构错误，导致程序整体无法解析。"
  },
  {
    code: "LOG_MISS",
    label: "核心逻辑缺失",
    category: "logic",
    weight: 15,
    description: "缺少题目要求的关键处理路径，如关键循环、判断或计算步骤。"
  },
  {
    code: "LOG_WRONG",
    label: "逻辑方向偏差",
    category: "logic",
    weight: 10,
    description: "有逻辑尝试，但边界、公式或条件方向写偏。"
  },
  {
    code: "RUN_VAR",
    label: "变量使用错误",
    category: "runtime",
    weight: 5,
    description: "变量名拼写错误、变量未定义就使用。"
  },
  {
    code: "RUN_TYPE",
    label: "类型使用错误",
    category: "runtime",
    weight: 5,
    description: "类型不匹配导致运行失败，如字符串与整数直接相加。"
  },
  {
    code: "STY_NAME",
    label: "命名可读性不足",
    category: "style",
    weight: 2,
    description: "变量名过于随意，几乎无法体现含义。"
  },
  {
    code: "STY_DOC",
    label: "缺少说明",
    category: "style",
    weight: 3,
    description: "完全没有注释或必要的说明性文字。"
  }
];

const DEDUCTION_RULE_MAP = Object.fromEntries(
  DEDUCTION_RULES.map((rule) => [rule.code, rule])
) as Record<DeductionCode, DeductionRule>;

const defaultProviderModels: Record<AiProvider, string> = {
  deepseek: "deepseek-chat",
  gemini: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  qwen: process.env.QWEN_MODEL || "qwen-plus",
  moonshot: process.env.MOONSHOT_MODEL || "moonshot-v1-8k"
};

const envProviderKeys: Record<AiProvider, string> = {
  deepseek: process.env.DEEPSEEK_API_KEY || "",
  gemini: process.env.API_KEY || "",
  openai: process.env.OPENAI_API_KEY || "",
  qwen: process.env.QWEN_API_KEY || "",
  moonshot: process.env.MOONSHOT_API_KEY || ""
};

const buildDefaultSettings = (): AiProviderSettings => ({
  deepseek: { apiKey: envProviderKeys.deepseek, model: defaultProviderModels.deepseek },
  gemini: { apiKey: envProviderKeys.gemini, model: defaultProviderModels.gemini },
  openai: { apiKey: envProviderKeys.openai, model: defaultProviderModels.openai },
  qwen: { apiKey: envProviderKeys.qwen, model: defaultProviderModels.qwen },
  moonshot: { apiKey: envProviderKeys.moonshot, model: defaultProviderModels.moonshot }
});

const sanitizeSettings = (
  raw: Partial<Record<AiProvider, Partial<AiProviderConfig>>> | null | undefined
): AiProviderSettings => {
  const defaults = buildDefaultSettings();
  if (!raw) return defaults;
  return {
    deepseek: {
      apiKey: raw.deepseek?.apiKey?.trim?.() ?? defaults.deepseek.apiKey,
      model: raw.deepseek?.model?.trim?.() || defaults.deepseek.model
    },
    gemini: {
      apiKey: raw.gemini?.apiKey?.trim?.() ?? defaults.gemini.apiKey,
      model: raw.gemini?.model?.trim?.() || defaults.gemini.model
    },
    openai: {
      apiKey: raw.openai?.apiKey?.trim?.() ?? defaults.openai.apiKey,
      model: raw.openai?.model?.trim?.() || defaults.openai.model
    },
    qwen: {
      apiKey: raw.qwen?.apiKey?.trim?.() ?? defaults.qwen.apiKey,
      model: raw.qwen?.model?.trim?.() || defaults.qwen.model
    },
    moonshot: {
      apiKey: raw.moonshot?.apiKey?.trim?.() ?? defaults.moonshot.apiKey,
      model: raw.moonshot?.model?.trim?.() || defaults.moonshot.model
    }
  };
};

export const getAiSettings = (): AiProviderSettings => {
  if (typeof window === "undefined") return buildDefaultSettings();
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return buildDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to load AI settings:", error);
    return buildDefaultSettings();
  }
};

export const saveAiSettings = (settings: AiProviderSettings): AiProviderSettings => {
  const sanitized = sanitizeSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const getAvailableProviders = (): AiProvider[] => {
  const settings = getAiSettings();
  return (Object.keys(settings) as AiProvider[]).filter((key) => hasKey(settings[key].apiKey));
};

const normalizeDifficulty = (input: string | undefined): Difficulty => {
  if (!input) return "简单";
  const value = input.toLowerCase();
  if (value.includes("难") || value.includes("hard")) return "困难";
  if (value.includes("中") || value.includes("medium")) return "中等";
  return "简单";
};

type GeneratedQuestion = Pick<Question, "title" | "description" | "difficulty" | "template">;

type RawDetectedTag = {
  code?: string;
  evidence?: string;
};

type RawGradingResponse = {
  path_hit?: boolean;
  detected_tags?: RawDetectedTag[];
  corrected_answer?: string;
  feedback?: {
    highlights?: string;
    main_issues?: string;
    suggestions?: string;
  };
};

type RawReferenceAnswerResponse = {
  reference_answer?: string;
};

const normalizeJsonText = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  return trimmed;
};

const parseJsonObject = <T>(text: string): T => {
  const normalized = normalizeJsonText(text);
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1)) as T;
    }
    throw new Error("AI 返回的 JSON 无法解析");
  }
};

const requestOpenAIJson = async (
  provider: string,
  apiKey: string,
  url: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<any> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider} API Error: ${response.status} - ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${provider}`);
  return parseJsonObject(content);
};

const questionGenerationPrompt = () => `你是一名 Python 编程考试出题助手。
请仅返回合法 JSON，不要输出 Markdown。

输出结构：
{
  "title": "题目标题",
  "description": "完整题目描述，需包含输入/输出要求",
  "difficulty": "简单|中等|困难",
  "template": "给学生的初始代码模板"
}`;

export const generateQuestion = async (
  instruction: string,
  current: Partial<Question>,
  provider: AiProvider = "deepseek"
): Promise<GeneratedQuestion | null> => {
  const settings = getAiSettings();

  const userPrompt = `用户希望生成或修改一道 Python 考试题。

用户指令：
${instruction}

当前草稿：
- 标题：${current.title || "无"}
- 描述：${current.description || "无"}
- 难度：${current.difficulty || "未指定"}
- 模板：${current.template || "无"}

要求：
1. 题目必须适合单文件 Python 作答。
2. 描述清晰，适合考试场景。
3. 模板尽量保留函数入口或输入输出骨架。
4. 难度只能是：简单 / 中等 / 困难。`;

  try {
    let raw: any;
    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: settings.gemini.apiKey });
      const response = await ai.models.generateContent({
        model: settings.gemini.model,
        contents: `${questionGenerationPrompt()}\n\n${userPrompt}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              template: { type: Type.STRING }
            }
          }
        }
      });
      if (!response.text) throw new Error("Empty response from Gemini");
      raw = parseJsonObject(response.text);
    } else if (provider === "deepseek") {
      raw = await requestOpenAIJson(
        "Deepseek",
        settings.deepseek.apiKey,
        "https://api.deepseek.com/chat/completions",
        settings.deepseek.model,
        questionGenerationPrompt(),
        userPrompt,
        0.6
      );
    } else if (provider === "openai") {
      raw = await requestOpenAIJson(
        "OpenAI",
        settings.openai.apiKey,
        "https://api.openai.com/v1/chat/completions",
        settings.openai.model,
        questionGenerationPrompt(),
        userPrompt,
        0.6
      );
    } else if (provider === "qwen") {
      raw = await requestOpenAIJson(
        "Qwen",
        settings.qwen.apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        settings.qwen.model,
        questionGenerationPrompt(),
        userPrompt,
        0.6
      );
    } else {
      raw = await requestOpenAIJson(
        "Moonshot",
        settings.moonshot.apiKey,
        "https://api.moonshot.cn/v1/chat/completions",
        settings.moonshot.model,
        questionGenerationPrompt(),
        userPrompt,
        0.6
      );
    }

    return {
      title: (raw.title || current.title || "新题目").trim(),
      description: (raw.description || current.description || "").trim(),
      difficulty: normalizeDifficulty(raw.difficulty),
      template: (raw.template || current.template || "def solution():\n    pass").trim()
    };
  } catch (error) {
    console.error("AI Generate Error:", error);
    return null;
  }
};

const referenceAnswerPrompt = () => `你是一名 Python 编程考试讲评老师。
请根据题目生成一份适合学生对照学习的参考答案。
请仅返回合法 JSON，不要输出 Markdown。

输出结构：
{
  "reference_answer": "完整可运行的 Python 参考代码"
}`;

const referenceAnswerUserPrompt = (
  title: string,
  description: string,
  template?: string
) => `题目名称：
${title}

题目描述：
${description}

现有模板：
${template?.trim() || "无"}

要求：
1. 给出完整、可运行、适合初学者理解的 Python 参考答案。
2. 尽量沿用题目模板中的函数名、参数名或输入输出骨架。
3. 代码保持简洁，不要附带解释文字。
4. 只返回 JSON。`;

export const generateReferenceAnswer = async (
  title: string,
  description: string,
  template: string | undefined,
  provider: AiProvider = "deepseek"
): Promise<string | null> => {
  const settings = getAiSettings();
  const key = settings[provider].apiKey;
  if (!hasKey(key)) return null;

  try {
    let raw: RawReferenceAnswerResponse;
    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: settings.gemini.apiKey });
      const response = await ai.models.generateContent({
        model: settings.gemini.model,
        contents: `${referenceAnswerPrompt()}\n\n${referenceAnswerUserPrompt(title, description, template)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reference_answer: { type: Type.STRING }
            }
          }
        }
      });
      if (!response.text) throw new Error("Empty response from Gemini");
      raw = parseJsonObject<RawReferenceAnswerResponse>(response.text);
    } else if (provider === "deepseek") {
      raw = await requestOpenAIJson(
        "Deepseek",
        settings.deepseek.apiKey,
        "https://api.deepseek.com/chat/completions",
        settings.deepseek.model,
        referenceAnswerPrompt(),
        referenceAnswerUserPrompt(title, description, template),
        0.3
      );
    } else if (provider === "openai") {
      raw = await requestOpenAIJson(
        "OpenAI",
        settings.openai.apiKey,
        "https://api.openai.com/v1/chat/completions",
        settings.openai.model,
        referenceAnswerPrompt(),
        referenceAnswerUserPrompt(title, description, template),
        0.3
      );
    } else if (provider === "qwen") {
      raw = await requestOpenAIJson(
        "Qwen",
        settings.qwen.apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        settings.qwen.model,
        referenceAnswerPrompt(),
        referenceAnswerUserPrompt(title, description, template),
        0.3
      );
    } else {
      raw = await requestOpenAIJson(
        "Moonshot",
        settings.moonshot.apiKey,
        "https://api.moonshot.cn/v1/chat/completions",
        settings.moonshot.model,
        referenceAnswerPrompt(),
        referenceAnswerUserPrompt(title, description, template),
        0.3
      );
    }

    return raw.reference_answer?.trim() || null;
  } catch (error) {
    console.error("Reference Answer Error:", error);
    return null;
  }
};

const pingOpenAICompatible = async (
  provider: string,
  apiKey: string,
  url: string,
  model: string
): Promise<ProviderStatus> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0
      })
    });
    return response.ok ? "ok" : "fail";
  } catch (error) {
    console.error(`${provider} Ping Error:`, error);
    return "fail";
  } finally {
    clearTimeout(timeout);
  }
};

export const testProviderConnection = async (provider: AiProvider): Promise<boolean> => {
  const settings = getAiSettings();
  const key = settings[provider].apiKey;
  if (!hasKey(key)) return false;
  const apiKey = key as string;

  if (provider === "gemini") {
    try {
      const ai = new GoogleGenAI({ apiKey });
      await withTimeout(
        ai.models.generateContent({
          model: settings.gemini.model,
          contents: "ping",
          config: { responseMimeType: "text/plain" }
        }),
        6000
      );
      return true;
    } catch (error) {
      console.error("Gemini Ping Error:", error);
      return false;
    }
  }

  if (provider === "deepseek") {
    return (
      (await pingOpenAICompatible(
        "Deepseek",
        apiKey,
        "https://api.deepseek.com/chat/completions",
        settings.deepseek.model
      )) === "ok"
    );
  }

  if (provider === "openai") {
    return (
      (await pingOpenAICompatible(
        "OpenAI",
        apiKey,
        "https://api.openai.com/v1/chat/completions",
        settings.openai.model
      )) === "ok"
    );
  }

  if (provider === "qwen") {
    return (
      (await pingOpenAICompatible(
        "Qwen",
        apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        settings.qwen.model
      )) === "ok"
    );
  }

  if (provider === "moonshot") {
    return (
      (await pingOpenAICompatible(
        "Moonshot",
        apiKey,
        "https://api.moonshot.cn/v1/chat/completions",
        settings.moonshot.model
      )) === "ok"
    );
  }

  return false;
};

const gradingClassifierPrompt = () => `你是一名极其温和、客观、稳定的 Python 代码分析员。
你的任务不是给总分，而是识别固定标签并提取证据。

请严格遵循：
1. 只输出合法 JSON。
2. 不要计算总分。
3. 只允许使用以下错误代码：
   - SYN_MINOR
   - SYN_BLOCK
   - LOG_MISS
   - LOG_WRONG
   - RUN_VAR
   - RUN_TYPE
   - STY_NAME
   - STY_DOC
4. 如果代码能看出明显的解题尝试，尤其出现了与题目相关的输入、计算、循环、判断、函数等关键路径，请将 path_hit 设为 true。
5. 如果只是小语法错误，不要因此否定整体逻辑。
6. 若同类错误重复出现，只需给出一次最具代表性的证据。
7. 评语必须先肯定，再指出问题，最后给出下一步建议。

标签说明：
- SYN_MINOR: 小语法手误，如中英文符号混用、个别关键字拼写错误，但能看懂整体结构。
- SYN_BLOCK: 结构性语法错误，如缩进、函数定义、代码块结构错误，导致整体无法解析。
- LOG_MISS: 缺少关键逻辑路径。
- LOG_WRONG: 写出了逻辑，但方向偏差、边界或公式错误。
- RUN_VAR: 变量名拼错、未定义变量。
- RUN_TYPE: 类型不匹配导致运行错误。
- STY_NAME: 命名几乎无意义，可读性明显不足。
- STY_DOC: 完全没有注释或说明。

输出 JSON 结构：
{
  "path_hit": true,
  "detected_tags": [
    { "code": "SYN_MINOR", "evidence": "第 3 行 print 使用了中文括号" }
  ],
  "corrected_answer": "请给出一份简洁、可运行、适合初学者参考的修正版 Python 代码",
  "feedback": {
    "highlights": "先说做得好的地方",
    "main_issues": "主要问题描述",
    "suggestions": "下一步建议"
  }
}`;

const gradingUserPrompt = (title: string, description: string, code: string) => `题目名称：
${title}

题目描述：
${description}

学生代码：
${code}

请只做标签识别和证据提取，不要自行打总分。`;

const isMeaningfulCode = (code: string): boolean => {
  const compact = code.replace(/\s+/g, "").toLowerCase();
  if (!compact) return false;
  const placeholders = ["pass", "todo", "solution()", "defsolution():pass"];
  return !placeholders.includes(compact);
};

const createResultFromSummary = (
  pathHit: boolean,
  detectedTags: DeductionHit[],
  summary: { highlights: string; mainIssues: string; nextSteps: string },
  options?: {
    blank?: boolean;
    correctedAnswer?: string;
    baseScore?: number;
  }
): GradingResult => {
  const blank = options?.blank ?? false;
  const baseScore = options?.baseScore ?? 100;
  const categoryTotals: Record<DeductionCategory, number> = {
    syntax: 0,
    logic: 0,
    runtime: 0,
    style: 0
  };

  detectedTags.forEach((tag) => {
    categoryTotals[tag.category] += tag.weight;
  });

  const cappedCategoryTotals: Record<DeductionCategory, number> = {
    syntax: Math.min(categoryTotals.syntax, DEDUCTION_CAPS.syntax),
    logic: Math.min(categoryTotals.logic, DEDUCTION_CAPS.logic),
    runtime: Math.min(categoryTotals.runtime, DEDUCTION_CAPS.runtime),
    style: Math.min(categoryTotals.style, DEDUCTION_CAPS.style)
  };

  const deductionTotal =
    cappedCategoryTotals.syntax +
    cappedCategoryTotals.logic +
    cappedCategoryTotals.runtime +
    cappedCategoryTotals.style;

  const rawScore = Math.max(0, baseScore - deductionTotal);
  const floorApplied = !blank && pathHit && rawScore < SCORE_FLOOR_IF_PATH_HIT;
  const finalScore = floorApplied ? SCORE_FLOOR_IF_PATH_HIT : rawScore;

  return {
    passed: finalScore >= 60,
    score: finalScore,
    fullScore: 100,
    earnedScore: finalScore,
    pathHit,
    blank,
    correctedAnswer: options?.correctedAnswer?.trim() || undefined,
    detectedTags,
    scoreBreakdown: {
      rawScore,
      finalScore,
      deductionTotal,
      floorApplied,
      categoryTotals: cappedCategoryTotals
    },
    summary,
    logic_feedback: summary.mainIssues,
    quality_feedback:
      detectedTags.length > 0
        ? `命中扣分项：${detectedTags.map((tag) => `${tag.label}(-${tag.weight}%)`).join("、")}`
        : "未命中明显扣分项。",
    suggestion: summary.nextSteps
  };
};

export const createBlankGradingResult = (correctedAnswer?: string): GradingResult =>
  createResultFromSummary(
    false,
    [],
    {
      highlights: "本题暂未作答，暂时没有可评价的亮点。",
      mainIssues: "当前答案为空，系统未检测到有效作答内容。",
      nextSteps: "先完成基础作答，再逐步检查输入、逻辑和输出。"
    },
    { blank: true, baseScore: 0, correctedAnswer }
  );

const createErrorGradingResult = (message: string, detail: string): GradingResult =>
  createResultFromSummary(
    false,
    [],
    {
      highlights: "本次未能完成有效阅卷。",
      mainIssues: message,
      nextSteps: detail
    },
    { baseScore: 0 }
  );

const normalizeDetectedTags = (raw: RawDetectedTag[] | undefined): DeductionHit[] => {
  if (!raw?.length) return [];
  const seen = new Set<DeductionCode>();
  const hits: DeductionHit[] = [];

  for (const item of raw) {
    const code = item.code as DeductionCode | undefined;
    if (!code || !(code in DEDUCTION_RULE_MAP)) continue;
    if (code === "SYN_MINOR" && raw.some((candidate) => candidate.code === "SYN_BLOCK")) {
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    const rule = DEDUCTION_RULE_MAP[code];
    hits.push({
      code,
      label: rule.label,
      category: rule.category,
      weight: rule.weight,
      evidence: item.evidence?.trim() || "AI 未提供具体证据。"
    });
  }

  return hits;
};

const classifyWithGemini = async (
  apiKey: string,
  model: string,
  title: string,
  description: string,
  code: string
): Promise<RawGradingResponse> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: `${gradingClassifierPrompt()}\n\n${gradingUserPrompt(title, description, code)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          path_hit: { type: Type.BOOLEAN },
          corrected_answer: { type: Type.STRING },
          detected_tags: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                evidence: { type: Type.STRING }
              }
            }
          },
          feedback: {
            type: Type.OBJECT,
            properties: {
              highlights: { type: Type.STRING },
              main_issues: { type: Type.STRING },
              suggestions: { type: Type.STRING }
            }
          }
        }
      }
    }
  });

  if (!response.text) throw new Error("Empty response from Gemini");
  return parseJsonObject<RawGradingResponse>(response.text);
};

const classifyWithOpenAICompatible = async (
  provider: string,
  apiKey: string,
  url: string,
  model: string,
  title: string,
  description: string,
  code: string
): Promise<RawGradingResponse> =>
  requestOpenAIJson(
    provider,
    apiKey,
    url,
    model,
    gradingClassifierPrompt(),
    gradingUserPrompt(title, description, code),
    0.1
  );

/**
 * AI 只负责标签识别，程序统一计算分数。
 */
export const gradeQuestion = async (
  title: string,
  description: string,
  code: string,
  provider: AiProvider = "deepseek"
): Promise<GradingResult> => {
  if (!isMeaningfulCode(code)) {
    return createBlankGradingResult();
  }

  const settings = getAiSettings();
  const key = settings[provider].apiKey;
  if (!hasKey(key)) {
    return createErrorGradingResult("API Key 缺失。", "请先在 API 设置中配置对应模型的 Key。");
  }

  try {
    let raw: RawGradingResponse;
    if (provider === "gemini") {
      raw = await classifyWithGemini(settings.gemini.apiKey, settings.gemini.model, title, description, code);
    } else if (provider === "deepseek") {
      raw = await classifyWithOpenAICompatible(
        "Deepseek",
        settings.deepseek.apiKey,
        "https://api.deepseek.com/chat/completions",
        settings.deepseek.model,
        title,
        description,
        code
      );
    } else if (provider === "openai") {
      raw = await classifyWithOpenAICompatible(
        "OpenAI",
        settings.openai.apiKey,
        "https://api.openai.com/v1/chat/completions",
        settings.openai.model,
        title,
        description,
        code
      );
    } else if (provider === "qwen") {
      raw = await classifyWithOpenAICompatible(
        "Qwen",
        settings.qwen.apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        settings.qwen.model,
        title,
        description,
        code
      );
    } else {
      raw = await classifyWithOpenAICompatible(
        "Moonshot",
        settings.moonshot.apiKey,
        "https://api.moonshot.cn/v1/chat/completions",
        settings.moonshot.model,
        title,
        description,
        code
      );
    }

    const detectedTags = normalizeDetectedTags(raw.detected_tags);
    return createResultFromSummary(
      !!raw.path_hit,
      detectedTags,
      {
        highlights: raw.feedback?.highlights?.trim() || "你已经做出了有效尝试，值得肯定。",
        mainIssues: raw.feedback?.main_issues?.trim() || "当前代码还有一些可以继续改进的地方。",
        nextSteps: raw.feedback?.suggestions?.trim() || "建议先修正明显错误，再重新运行检查结果。"
      },
      { correctedAnswer: raw.corrected_answer }
    );
  } catch (error: any) {
    console.error("Grading Error:", error);
    return createErrorGradingResult(
      `评分服务连接失败：${error.message || "未知错误"}`,
      "请检查网络连接或稍后重新提交。"
    );
  }
};

const TAG_WEAKNESS_COPY: Record<DeductionCode, string> = {
  SYN_MINOR: "容易在符号、拼写这类小语法问题上丢分。",
  SYN_BLOCK: "代码结构还不够稳定，缩进或代码块组织需要再练习。",
  LOG_MISS: "核心解题步骤偶尔缺失，说明还需要加强题意拆解。",
  LOG_WRONG: "已经能写出思路，但在公式、边界或条件方向上容易偏掉。",
  RUN_VAR: "变量名一致性需要再注意，运行时容易因为小手误中断。",
  RUN_TYPE: "类型转换和输入处理还不够稳定。",
  STY_NAME: "命名可读性偏弱，后续维护和检查会更吃力。",
  STY_DOC: "说明性文字偏少，解题思路不够容易被读懂。"
};

const TAG_SUGGESTION_COPY: Record<DeductionCode, string> = {
  SYN_MINOR: "提交前重点检查括号、冒号和关键字拼写。",
  SYN_BLOCK: "先练习缩进、函数定义和代码块结构，再追求复杂逻辑。",
  LOG_MISS: "做题时先写出“输入-处理-输出”三步框架，再补充细节。",
  LOG_WRONG: "多用小样例手算，验证边界和公式方向是否正确。",
  RUN_VAR: "统一变量命名，运行前从上到下核对变量是否都已定义。",
  RUN_TYPE: "对输入值先确认类型，必要时显式使用 int()、float() 或 str() 转换。",
  STY_NAME: "尽量用能表达含义的变量名，减少 a、b、c 这类临时命名。",
  STY_DOC: "给关键步骤补一句注释，帮助自己和老师快速理解思路。"
};

export const buildExamReviewSummary = (
  results: Record<string, GradingResult>,
  questions: Question[]
): ExamReviewSummary => {
  const graded = questions
    .map((question) => ({ question, result: results[question.id] }))
    .filter((item) => !!item.result);

  if (!graded.length) {
    return {
      overview: "本次还没有形成可分析的答题结果。",
      strengths: ["建议先完成基础作答，再查看系统总结。"],
      weaknesses: ["当前没有足够数据判断主要失分点。"],
      nextSteps: ["先完成每题的核心代码，再关注细节优化。"]
    };
  }

  const attempted = graded.filter((item) => !item.result.blank);
  if (!attempted.length) {
    return {
      overview: "本次交卷中各题均未作答，当前还无法从代码表现中分析你的强项与薄弱点。",
      strengths: ["系统已为大部分题目生成参考答案，方便你按题逐题回看。"],
      weaknesses: ["本次各题都没有形成有效代码，因此暂时无法判断具体失分类型。"],
      nextSteps: [
        "先从前几道基础题开始补写可运行代码，再逐步检查输入、处理和输出。",
        "对照每题参考答案，优先理解函数结构、变量含义和解题步骤。",
        "下次至少先完成每题的基础骨架，避免整题空白。"
      ]
    };
  }

  const avgScore = graded.reduce((sum, item) => sum + item.result.score, 0) / graded.length;
  const pathHitCount = graded.filter((item) => item.result.pathHit).length;
  const highScoreTitles = graded
    .filter((item) => item.result.score >= 80)
    .slice(0, 2)
    .map((item) => `《${item.question.title}》`);

  const tagCounter = new Map<DeductionCode, number>();
  graded.forEach((item) => {
    item.result.detectedTags.forEach((tag) => {
      tagCounter.set(tag.code, (tagCounter.get(tag.code) || 0) + 1);
    });
  });

  const sortedTags = [...tagCounter.entries()].sort((a, b) => b[1] - a[1]);
  const topTags = sortedTags.slice(0, 3).map(([code]) => code);

  const strengths: string[] = [];
  if (pathHitCount / graded.length >= 0.7) {
    strengths.push("大多数题目都写出了关键路径，说明你已经知道该从哪里开始解题。");
  }
  if (highScoreTitles.length > 0) {
    strengths.push(`在 ${highScoreTitles.join("、")} 这类题目上，你已经能比较稳定地完成主要逻辑。`);
  }
  if (sortedTags.every(([code]) => !String(code).startsWith("SYN"))) {
    strengths.push("整体语法基础比较稳定，明显的结构性语法问题不多。");
  }
  if (strengths.length === 0) {
    strengths.push("你已经在每道题上做出了尝试，这本身就是建立编程能力的重要一步。");
  }

  const weaknesses =
    topTags.length > 0
      ? topTags.map((code) => TAG_WEAKNESS_COPY[code])
      : ["本次没有检测到集中的失分标签，说明主要问题更偏向细节波动。"];

  const nextSteps =
    topTags.length > 0
      ? [...new Set(topTags.map((code) => TAG_SUGGESTION_COPY[code]))]
      : ["继续保持当前节奏，多做几道类似题巩固解题流程。"];

  let overview = "本次作答整体表现比较均衡。";
  if (avgScore >= 85) {
    overview = "本次作答整体完成度较高，已经表现出比较稳定的编程基础。";
  } else if (avgScore >= 60) {
    overview = "本次作答已经具备较清晰的解题意识，后续重点是减少低级失误。";
  } else {
    overview = "本次作答说明你已经开始建立解题路径，下一步要优先提升代码稳定性和核心逻辑完整度。";
  }

  return {
    overview,
    strengths,
    weaknesses,
    nextSteps
  };
};
