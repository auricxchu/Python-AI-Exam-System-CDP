import { GoogleGenAI, Type } from "@google/genai";
import {
  DeductionCategory,
  DeductionCode,
  DeductionHit,
  DeductionRule,
  Difficulty,
  ExamReviewSummary,
  GradingResult,
  LightDeductionCode,
  LightDeductionHit,
  Question,
  SkillCompletion,
  SkillRubric
} from "../types";
import { pingCloudProvider, requestCloudJsonText, isCloudAiProxyEnabled } from "./aiCloudService";
import { AI_PROVIDERS, AiProvider, AiProviderConfig, AiProviderSettings } from "./aiTypes";

type ProviderStatus = "ok" | "fail";

const hasKey = (val?: string) => !!val && val.trim().length > 0;
export type { AiProvider, AiProviderConfig, AiProviderSettings } from "./aiTypes";

const AI_SETTINGS_STORAGE_KEY = "app_ai_settings";
let runtimeAiSettings: AiProviderSettings | null = null;

// ─── Legacy deduction constants (kept for backward compat) ───

const DEDUCTION_CAPS: Record<DeductionCategory, number> = {
  syntax: 20,
  logic: 70,
  runtime: 8,
  style: 2
};

export const DEDUCTION_RULES: DeductionRule[] = [
  {
    code: "SYN_MINOR",
    label: "语法小错误",
    category: "syntax",
    weight: 8,
    description: "偶发性手误，如中英文符号混用、单处拼写问题，不影响整体逻辑理解。"
  },
  {
    code: "SYN_BLOCK",
    label: "结构性语法错误",
    category: "syntax",
    weight: 12,
    description: "缩进、函数定义或代码块结构错误，导致程序整体无法解析。"
  },
  {
    code: "LOG_MISS",
    label: "核心逻辑缺失",
    category: "logic",
    weight: 50,
    description: "缺少题目要求的关键处理路径，如关键循环、判断或计算步骤。"
  },
  {
    code: "LOG_WRONG",
    label: "逻辑方向偏差",
    category: "logic",
    weight: 20,
    description: "有逻辑尝试，但边界、公式或条件方向写偏。"
  },
  {
    code: "RUN_VAR",
    label: "变量使用错误",
    category: "runtime",
    weight: 3,
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
  }
];

const DEDUCTION_RULE_MAP = Object.fromEntries(
  DEDUCTION_RULES.map((rule) => [rule.code, rule])
) as Record<DeductionCode, DeductionRule>;

// ─── New: Lightweight deduction rules (logic removed) ───

const LIGHT_DEDUCTION_CAPS: Record<string, number> = {
  syntax: 15,
  runtime: 8,
  style: 2
};

export const LIGHT_DEDUCTION_RULES: { code: LightDeductionCode; label: string; category: "syntax" | "runtime" | "style"; weight: number; description: string }[] = [
  {
    code: "SYN_PARSE",
    label: "解析级语法错误",
    category: "syntax",
    weight: 12,
    description: "缩进、括号或代码块结构错误，导致程序整体无法解析。"
  },
  {
    code: "SYN_MINOR",
    label: "语法小错误",
    category: "syntax",
    weight: 6,
    description: "偶发性手误，如中英文符号混用、单处拼写问题。"
  },
  {
    code: "RUN_VAR",
    label: "变量使用错误",
    category: "runtime",
    weight: 3,
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
  }
];

const LIGHT_DEDUCTION_RULE_MAP = Object.fromEntries(
  LIGHT_DEDUCTION_RULES.map((rule) => [rule.code, rule])
) as Record<LightDeductionCode, typeof LIGHT_DEDUCTION_RULES[number]>;

// ─── Rubric inference cache (module scope) ───

const rubricCache = new Map<string, SkillRubric[]>();

const rubricCacheKey = (title: string, description: string): string => {
  return `${title}::${description}`;
};

// ─── AI provider config ───

const defaultProviderModels: Record<AiProvider, string> = {
  deepseek: "deepseek-chat",
  gemini: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  qwen: process.env.QWEN_MODEL || "qwen-plus",
  moonshot: process.env.MOONSHOT_MODEL || "moonshot-v1-8k"
};

const buildDefaultSettings = (): AiProviderSettings => {
  return {
    deepseek: { apiKey: "", model: defaultProviderModels.deepseek },
    gemini: { apiKey: "", model: defaultProviderModels.gemini },
    openai: { apiKey: "", model: defaultProviderModels.openai },
    qwen: { apiKey: "", model: defaultProviderModels.qwen },
    moonshot: { apiKey: "", model: defaultProviderModels.moonshot }
  };
};

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
  if (runtimeAiSettings) return runtimeAiSettings;
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

export const setRuntimeAiSettings = (settings: AiProviderSettings): AiProviderSettings => {
  const sanitized = sanitizeSettings(settings);
  runtimeAiSettings = sanitized;
  return sanitized;
};

export const clearRuntimeAiSettings = () => {
  runtimeAiSettings = null;
};

export const saveAiSettings = (settings: AiProviderSettings): AiProviderSettings => {
  const sanitized = setRuntimeAiSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
};

export const clearStoredAiSettings = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
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
  const localProviders = (Object.keys(settings) as AiProvider[]).filter((key) => hasKey(settings[key].apiKey));
  if (localProviders.length > 0) return localProviders;
  return isCloudAiProxyEnabled() ? [...AI_PROVIDERS] : [];
};

const normalizeDifficulty = (input: string | undefined): Difficulty => {
  if (!input) return "简单";
  const value = input.toLowerCase();
  if (value.includes("难") || value.includes("hard")) return "困难";
  if (value.includes("中") || value.includes("medium")) return "中等";
  return "简单";
};

type GeneratedQuestion = Pick<Question, "title" | "description" | "difficulty" | "template">;

// ─── Raw AI response types ───

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

type RawSkillGradingResponse = {
  skill_completions?: {
    skillId?: string;
    completion?: number;
    evidence?: string;
  }[];
  light_deductions?: {
    code?: string;
    evidence?: string;
  }[];
  corrected_answer?: string;
  feedback?: {
    highlights?: string;
    main_issues?: string;
    suggestions?: string;
  };
};

type RawRubricInferenceResponse = {
  rubric?: {
    skillId?: string;
    description?: string;
    score?: number;
  }[];
};

type RawReferenceAnswerResponse = {
  reference_answer?: string;
};

// ─── JSON helpers ───

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

const requestCloudJsonObject = async <T>(
  provider: AiProvider,
  schemaKind: "question_generation" | "reference_answer" | "grading" | "rubric_inference",
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<T | null> => {
  const text = await requestCloudJsonText(provider, schemaKind as any, systemPrompt, userPrompt, temperature);
  if (!text) return null;
  try {
    return parseJsonObject<T>(text);
  } catch (error) {
    console.error(`Failed to parse cloud AI response for ${provider}:`, error);
    return null;
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

// ─── Question generation ───

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
    raw = await requestCloudJsonObject<GeneratedQuestion>(
      provider,
      "question_generation",
      questionGenerationPrompt(),
      userPrompt,
      0.6
    );
    if (raw) {
      return {
        title: (raw.title || current.title || "???").trim(),
        description: (raw.description || current.description || "").trim(),
        difficulty: normalizeDifficulty(raw.difficulty),
        template: (raw.template || current.template || "def solution():\n    pass").trim()
      };
    }
    if (isCloudAiProxyEnabled()) {
      return null;
    }

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

// ─── Reference answer generation ───

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
  const cloudRaw = await requestCloudJsonObject<RawReferenceAnswerResponse>(
    provider,
    "reference_answer",
    referenceAnswerPrompt(),
    referenceAnswerUserPrompt(title, description, template),
    0.3
  );
  if (cloudRaw?.reference_answer?.trim()) {
    return cloudRaw.reference_answer.trim();
  }
  if (isCloudAiProxyEnabled()) return null;
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

// ─── Provider connection testing ───

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
  return testProviderConnectionWithSettings(provider, undefined, false);
};

export const testProviderConnectionWithSettings = async (
  provider: AiProvider,
  settingsOverride?: AiProviderSettings,
  preferLocal = false
): Promise<boolean> => {
  const cloudPing = await pingCloudProvider(provider);
  if (isCloudAiProxyEnabled() && !preferLocal) return cloudPing;

  const settings = settingsOverride ? setRuntimeAiSettings(settingsOverride) : getAiSettings();
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

// ═══════════════════════════════════════════════════════════════
// NEW: Skill-based grading system
// ═══════════════════════════════════════════════════════════════

// ─── Prompts ───

const skillGradingPrompt = (rubric: SkillRubric[]) => {
  const rubricLines = rubric
    .map((r) => `- skillId: "${r.skillId}", 描述: "${r.description}", 占比: ${r.score}%`)
    .join("\n");

  return `你是一名编程教学评分助手。
你的任务不是给代码打总分，而是根据给定的评分标准（rubric），判断学生代码对每个能力点的完成程度，并识别轻量级的语法/运行时/风格错误。

请严格遵循：
1. 只输出合法 JSON，不要输出 Markdown。
2. 不要计算总分。
3. 对每个能力点给出 0.0~1.0 的完成度：
   - 1.0 = 完全正确实现
   - 0.7~0.9 = 基本正确，有小瑕疵
   - 0.4~0.6 = 有思路但实现不完整
   - 0.1~0.3 = 仅有初步尝试
   - 0.0 = 完全缺失
4. 轻量错误只允许使用以下代码（逻辑问题由完成度体现，不要用错误码表达）：
   - SYN_PARSE: 缩进、括号或代码块结构错误，导致程序整体无法解析
   - SYN_MINOR: 偶发性手误，如中英文符号混用、单处拼写问题
   - RUN_VAR: 变量名拼写错误、变量未定义就使用
   - RUN_TYPE: 类型不匹配导致运行失败
   - STY_NAME: 变量名过于随意，几乎无法体现含义
5. 同类错误重复出现只需给一次最具代表性的证据。
6. 评语必须先肯定，再指出问题，最后给出下一步建议。

评分标准（Rubric）：
${rubricLines}

输出 JSON 结构：
{
  "skill_completions": [
    { "skillId": "array_iteration", "completion": 1.0, "evidence": "正确使用for循环遍历了列表" }
  ],
  "light_deductions": [
    { "code": "SYN_MINOR", "evidence": "第3行print使用了中文括号" }
  ],
  "corrected_answer": "修正后的完整Python代码",
  "feedback": {
    "highlights": "做得好的地方",
    "main_issues": "主要问题",
    "suggestions": "下一步建议"
  }
}`;
};

const rubricInferencePrompt = () => `你是一名 Python 编程教学专家。
请根据题目信息，推断这道题考察了哪些编程能力点，并为每个能力点分配合理的百分比权重。

要求：
1. 只输出合法 JSON，不要输出 Markdown。
2. skillId 使用英文驼峰命名，如 "array_iteration", "even_check", "max_update"。
3. 能力点数量建议 3~6 个。
4. 各能力点的 score 是百分比，所有 score 之和必须等于 100。
5. 能力点应该具体、可判断，避免过于笼统（如"编程能力"）。
6. description 用中文描述。

常见能力点参考：
- 输入处理（读取用户输入、解析数据）
- 遍历/迭代（for/while循环）
- 条件判断（if/else分支）
- 数学计算（算术运算、公式实现）
- 数据结构操作（列表/字典/集合的增删改查）
- 函数定义与调用
- 字符串处理
- 排序/查找算法
- 递归
- 边界处理
- 输出格式化

输出 JSON 结构：
{
  "rubric": [
    { "skillId": "input_reading", "description": "读取输入数据", "score": 15 },
    { "skillId": "array_iteration", "description": "遍历数组", "score": 25 }
  ]
}`;

const rubricInferenceUserPrompt = (title: string, description: string) => `题目名称：
${title}

题目描述：
${description}

请推断这道题目考察的能力点并分配分值。`;

// ─── Score calculation ───

const normalizeSkillCompletions = (
  raw: RawSkillGradingResponse["skill_completions"] | undefined,
  rubric: SkillRubric[]
): SkillCompletion[] => {
  if (!raw?.length) return [];
  const rubricMap = new Map(rubric.map((r) => [r.skillId, r]));

  return raw
    .filter((item) => item.skillId && rubricMap.has(item.skillId))
    .map((item) => {
      let completion = Number(item.completion);
      if (isNaN(completion)) completion = 0;
      completion = Math.max(0, Math.min(1, completion));
      return {
        skillId: item.skillId!,
        completion,
        evidence: item.evidence?.trim() || undefined
      };
    });
};

const normalizeLightDeductions = (
  raw: RawSkillGradingResponse["light_deductions"] | undefined
): LightDeductionHit[] => {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const hits: LightDeductionHit[] = [];

  for (const item of raw) {
    const code = item.code as LightDeductionCode | undefined;
    if (!code || !(code in LIGHT_DEDUCTION_RULE_MAP)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    const rule = LIGHT_DEDUCTION_RULE_MAP[code];
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

const createSkillResultFromSummary = (
  rubricUsed: SkillRubric[],
  skillCompletions: SkillCompletion[],
  lightDeductions: LightDeductionHit[],
  summary: { highlights: string; mainIssues: string; nextSteps: string },
  options?: {
    blank?: boolean;
    correctedAnswer?: string;
  }
): GradingResult => {
  const blank = options?.blank ?? false;

  // Calculate skill score
  const totalRubricScore = rubricUsed.reduce((sum, r) => sum + r.score, 0);
  let skillScore = 0;
  if (totalRubricScore > 0) {
    const rubricMap = new Map(rubricUsed.map((r) => [r.skillId, r]));
    let earnedSum = 0;
    for (const comp of skillCompletions) {
      const rubricItem = rubricMap.get(comp.skillId);
      if (rubricItem) {
        earnedSum += rubricItem.score * comp.completion;
      }
    }
    skillScore = Math.round((earnedSum / totalRubricScore) * 100);
  }

  // Calculate light deductions
  const deductionByCategory: Record<string, number> = { syntax: 0, runtime: 0, style: 0 };
  for (const ded of lightDeductions) {
    deductionByCategory[ded.category] = (deductionByCategory[ded.category] || 0) + ded.weight;
  }
  const cappedDeductions = {
    syntax: Math.min(deductionByCategory.syntax, LIGHT_DEDUCTION_CAPS.syntax),
    runtime: Math.min(deductionByCategory.runtime, LIGHT_DEDUCTION_CAPS.runtime),
    style: Math.min(deductionByCategory.style, LIGHT_DEDUCTION_CAPS.style)
  };
  const deductionTotal = cappedDeductions.syntax + cappedDeductions.runtime + cappedDeductions.style;
  const finalScore = Math.max(0, skillScore - deductionTotal);

  // Build legacy-compatible fields
  const pathHit = !blank && skillCompletions.some((c) => c.completion > 0);
  const legacyCategoryTotals: Record<DeductionCategory, number> = {
    syntax: cappedDeductions.syntax,
    logic: 0,
    runtime: cappedDeductions.runtime,
    style: cappedDeductions.style
  };
  const legacyDetectedTags: DeductionHit[] = lightDeductions.map((d) => ({
    code: (d.code === "SYN_PARSE" ? "SYN_BLOCK" : d.code) as DeductionCode,
    label: d.label,
    category: d.category as DeductionCategory,
    weight: d.weight,
    evidence: d.evidence
  }));

  return {
    passed: finalScore >= 60,
    score: finalScore,
    fullScore: 100,
    earnedScore: finalScore,
    blank,
    correctedAnswer: options?.correctedAnswer?.trim() || undefined,

    // New fields
    skillCompletions,
    rubricUsed,
    skillScore,
    lightDeductions,
    deductionTotal,

    // Legacy derived fields
    pathHit,
    detectedTags: legacyDetectedTags,
    scoreBreakdown: {
      rawScore: skillScore,
      finalScore,
      deductionTotal,
      floorApplied: false,
      categoryTotals: legacyCategoryTotals
    },
    summary,
    logic_feedback: summary.mainIssues,
    quality_feedback:
      lightDeductions.length > 0
        ? `轻量扣分：${lightDeductions.map((d) => `${d.label}(-${d.weight})`).join("、")}`
        : "未命中轻量扣分项。",
    suggestion: summary.nextSteps
  };
};

// ─── Blank / Error results ───

export const createBlankGradingResult = (correctedAnswer?: string): GradingResult =>
  createSkillResultFromSummary(
    [],
    [],
    [],
    {
      highlights: "本题暂未作答，暂时没有可评价的亮点。",
      mainIssues: "当前答案为空，系统未检测到有效作答内容。",
      nextSteps: "先完成基础作答，再逐步检查输入、逻辑和输出。"
    },
    { blank: true, correctedAnswer }
  );

const createErrorGradingResult = (message: string, detail: string): GradingResult =>
  createSkillResultFromSummary(
    [],
    [],
    [],
    {
      highlights: "本次未能完成有效阅卷。",
      mainIssues: message,
      nextSteps: detail
    }
  );

// ─── AI API callers for skill grading ───

const classifySkillWithGemini = async (
  apiKey: string,
  model: string,
  title: string,
  description: string,
  code: string,
  rubric: SkillRubric[]
): Promise<RawSkillGradingResponse> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: `${skillGradingPrompt(rubric)}\n\n${skillGradingUserPrompt(title, description, code)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          corrected_answer: { type: Type.STRING },
          skill_completions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skillId: { type: Type.STRING },
                completion: { type: Type.NUMBER },
                evidence: { type: Type.STRING }
              }
            }
          },
          light_deductions: {
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
  return parseJsonObject<RawSkillGradingResponse>(response.text);
};

const classifySkillWithOpenAICompatible = async (
  provider: string,
  apiKey: string,
  url: string,
  model: string,
  title: string,
  description: string,
  code: string,
  rubric: SkillRubric[]
): Promise<RawSkillGradingResponse> =>
  requestOpenAIJson(
    provider,
    apiKey,
    url,
    model,
    skillGradingPrompt(rubric),
    skillGradingUserPrompt(title, description, code),
    0.1
  );

const skillGradingUserPrompt = (title: string, description: string, code: string) => `题目名称：
${title}

题目描述：
${description}

学生代码：
${code}

请根据评分标准判断每个能力点的完成度，并识别轻量语法/运行时/风格错误。不要自行打总分。`;

// ─── Rubric inference API caller ───

const callRubricInference = async (
  provider: AiProvider,
  title: string,
  description: string
): Promise<SkillRubric[] | null> => {
  const settings = getAiSettings();
  const key = settings[provider].apiKey;

  // Try cloud proxy first
  const cloudRaw = await requestCloudJsonObject<RawRubricInferenceResponse>(
    provider,
    "rubric_inference",
    rubricInferencePrompt(),
    rubricInferenceUserPrompt(title, description),
    0.3
  );
  if (cloudRaw?.rubric?.length) {
    return cloudRaw.rubric
      .filter((r) => r.skillId && r.description && typeof r.score === "number" && r.score > 0)
      .map((r) => ({
        skillId: r.skillId!,
        description: r.description!,
        score: r.score!
      }));
  }
  if (isCloudAiProxyEnabled()) return null;
  if (!hasKey(key)) return null;

  try {
    let raw: RawRubricInferenceResponse;
    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: settings.gemini.apiKey });
      const response = await ai.models.generateContent({
        model: settings.gemini.model,
        contents: `${rubricInferencePrompt()}\n\n${rubricInferenceUserPrompt(title, description)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rubric: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skillId: { type: Type.STRING },
                    description: { type: Type.STRING },
                    score: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      });
      if (!response.text) throw new Error("Empty response from Gemini");
      raw = parseJsonObject<RawRubricInferenceResponse>(response.text);
    } else if (provider === "deepseek") {
      raw = await requestOpenAIJson(
        "Deepseek",
        settings.deepseek.apiKey,
        "https://api.deepseek.com/chat/completions",
        settings.deepseek.model,
        rubricInferencePrompt(),
        rubricInferenceUserPrompt(title, description),
        0.3
      );
    } else if (provider === "openai") {
      raw = await requestOpenAIJson(
        "OpenAI",
        settings.openai.apiKey,
        "https://api.openai.com/v1/chat/completions",
        settings.openai.model,
        rubricInferencePrompt(),
        rubricInferenceUserPrompt(title, description),
        0.3
      );
    } else if (provider === "qwen") {
      raw = await requestOpenAIJson(
        "Qwen",
        settings.qwen.apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        settings.qwen.model,
        rubricInferencePrompt(),
        rubricInferenceUserPrompt(title, description),
        0.3
      );
    } else {
      raw = await requestOpenAIJson(
        "Moonshot",
        settings.moonshot.apiKey,
        "https://api.moonshot.cn/v1/chat/completions",
        settings.moonshot.model,
        rubricInferencePrompt(),
        rubricInferenceUserPrompt(title, description),
        0.3
      );
    }

    if (raw?.rubric?.length) {
      return raw.rubric
        .filter((r) => r.skillId && r.description && typeof r.score === "number" && r.score > 0)
        .map((r) => ({
          skillId: r.skillId!,
          description: r.description!,
          score: r.score!
        }));
    }
    return null;
  } catch (error) {
    console.error("Rubric Inference Error:", error);
    return null;
  }
};

// ─── Public API ───

/**
 * AI 自动推断题目考察的能力点（Rubric）。
 * 用于旧题兼容：无 rubric 的题目可通过此函数自动生成评分标准。
 */
export const inferRubricForQuestion = async (
  title: string,
  description: string,
  provider: AiProvider = "deepseek"
): Promise<SkillRubric[] | null> => {
  const cacheKey = rubricCacheKey(title, description);
  const cached = rubricCache.get(cacheKey);
  if (cached) return cached;

  const rubric = await callRubricInference(provider, title, description);
  if (rubric && rubric.length > 0) {
    rubricCache.set(cacheKey, rubric);
  }
  return rubric;
};

/**
 * 基于 Rubric 的能力完成度评分（核心评分函数）。
 */
export const gradeQuestionWithRubric = async (
  title: string,
  description: string,
  code: string,
  rubric: SkillRubric[],
  provider: AiProvider = "deepseek"
): Promise<GradingResult> => {
  if (!isMeaningfulCode(code)) {
    return createBlankGradingResult();
  }

  const settings = getAiSettings();
  const key = settings[provider].apiKey;

  const cloudRaw = await requestCloudJsonObject<RawSkillGradingResponse>(
    provider,
    "grading",
    skillGradingPrompt(rubric),
    skillGradingUserPrompt(title, description, code),
    0.1
  );
  if (cloudRaw) {
    const skillCompletions = normalizeSkillCompletions(cloudRaw.skill_completions, rubric);
    const lightDeductions = normalizeLightDeductions(cloudRaw.light_deductions);
    return createSkillResultFromSummary(
      rubric,
      skillCompletions,
      lightDeductions,
      {
        highlights: cloudRaw.feedback?.highlights?.trim() || "你已经做出了有效尝试，值得肯定。",
        mainIssues: cloudRaw.feedback?.main_issues?.trim() || "当前代码还有一些可以继续改进的地方。",
        nextSteps: cloudRaw.feedback?.suggestions?.trim() || "建议先修正明显错误，再重新运行检查结果。"
      },
      { correctedAnswer: cloudRaw.corrected_answer }
    );
  }
  if (isCloudAiProxyEnabled()) {
    return createErrorGradingResult(
      "云端 AI 服务不可用。",
      "请联系老师检查云端模型配置或稍后重试。"
    );
  }
  if (!hasKey(key)) {
    return createErrorGradingResult("API Key 缺失。", "请先在 API 设置中配置对应模型的 Key。");
  }

  try {
    let raw: RawSkillGradingResponse;
    if (provider === "gemini") {
      raw = await classifySkillWithGemini(settings.gemini.apiKey, settings.gemini.model, title, description, code, rubric);
    } else if (provider === "deepseek") {
      raw = await classifySkillWithOpenAICompatible(
        "Deepseek", settings.deepseek.apiKey,
        "https://api.deepseek.com/chat/completions", settings.deepseek.model,
        title, description, code, rubric
      );
    } else if (provider === "openai") {
      raw = await classifySkillWithOpenAICompatible(
        "OpenAI", settings.openai.apiKey,
        "https://api.openai.com/v1/chat/completions", settings.openai.model,
        title, description, code, rubric
      );
    } else if (provider === "qwen") {
      raw = await classifySkillWithOpenAICompatible(
        "Qwen", settings.qwen.apiKey,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", settings.qwen.model,
        title, description, code, rubric
      );
    } else {
      raw = await classifySkillWithOpenAICompatible(
        "Moonshot", settings.moonshot.apiKey,
        "https://api.moonshot.cn/v1/chat/completions", settings.moonshot.model,
        title, description, code, rubric
      );
    }

    const skillCompletions = normalizeSkillCompletions(raw.skill_completions, rubric);
    const lightDeductions = normalizeLightDeductions(raw.light_deductions);
    return createSkillResultFromSummary(
      rubric,
      skillCompletions,
      lightDeductions,
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

const isMeaningfulCode = (code: string): boolean => {
  const compact = code.replace(/\s+/g, "").toLowerCase();
  if (!compact) return false;
  const placeholders = ["pass", "todo", "solution()", "defsolution():pass"];
  return !placeholders.includes(compact);
};

/**
 * 统一的评分入口（兼容旧接口）。
 * 内部自动处理：有 rubric 直接用，无 rubric 先 AI 推断再评分。
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

  // Try to get rubric: first from cache, then infer if needed
  const cacheKey = rubricCacheKey(title, description);
  let rubric = rubricCache.get(cacheKey);

  if (!rubric) {
    const inferred = await callRubricInference(provider, title, description);
    if (inferred && inferred.length > 0) {
      rubricCache.set(cacheKey, inferred);
      rubric = inferred as SkillRubric[] | undefined;
    }
  }

  // If still no rubric (AI inference failed), use a minimal fallback rubric
  if (!rubric || rubric.length === 0) {
    rubric = [
      { skillId: "input_processing", description: "输入处理", score: 20 },
      { skillId: "core_logic", description: "核心逻辑实现", score: 50 },
      { skillId: "output_result", description: "输出结果", score: 30 }
    ]; // scores sum to 100%
  }

  return gradeQuestionWithRubric(title, description, code, rubric, provider);
};

// ═══════════════════════════════════════════════════════════════
// Exam review summary (refactored for skill-based grading)
// ═══════════════════════════════════════════════════════════════

const TAG_WEAKNESS_COPY: Record<string, string> = {
  SYN_PARSE: "代码结构还不够稳定，缩进或代码块组织需要再练习。",
  SYN_MINOR: "容易在符号、拼写这类小语法问题上丢分。",
  SYN_BLOCK: "代码结构还不够稳定，缩进或代码块组织需要再练习。",
  LOG_MISS: "核心解题步骤偶尔缺失，说明还需要加强题意拆解。",
  LOG_WRONG: "已经能写出思路，但在公式、边界或条件方向上容易偏掉。",
  RUN_VAR: "变量名一致性需要再注意，运行时容易因为小手误中断。",
  RUN_TYPE: "类型转换和输入处理还不够稳定。",
  STY_NAME: "命名可读性偏弱，后续维护和检查会更吃力。"
};

const TAG_SUGGESTION_COPY: Record<string, string> = {
  SYN_PARSE: "先练习缩进、函数定义和代码块结构，再追求复杂逻辑。",
  SYN_MINOR: "提交前重点检查括号、冒号和关键字拼写。",
  SYN_BLOCK: "先练习缩进、函数定义和代码块结构，再追求复杂逻辑。",
  LOG_MISS: "做题时先写出「输入-处理-输出」三步框架，再补充细节。",
  LOG_WRONG: "多用小样例手算，验证边界和公式方向是否正确。",
  RUN_VAR: "统一变量命名，运行前从上到下核对变量是否都已定义。",
  RUN_TYPE: "对输入值先确认类型，必要时显式使用 int()、float() 或 str() 转换。",
  STY_NAME: "尽量用能表达含义的变量名，减少 a、b、c 这类临时命名。"
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

  // Find questions with high scores
  const highScoreTitles = graded
    .filter((item) => item.result.score >= 80)
    .slice(0, 2)
    .map((item) => `《${item.question.title}》`);

  // Find lowest skill completions across all questions
  const lowSkills: { desc: string; avgCompletion: number }[] = [];
  const skillAccumulator = new Map<string, { total: number; count: number; desc: string }>();

  for (const { result } of graded) {
    for (const comp of result.skillCompletions) {
      const rubricDef = result.rubricUsed.find((r) => r.skillId === comp.skillId);
      const desc = rubricDef?.description || comp.skillId;
      const key = comp.skillId;
      if (!skillAccumulator.has(key)) {
        skillAccumulator.set(key, { total: 0, count: 0, desc });
      }
      const acc = skillAccumulator.get(key)!;
      acc.total += comp.completion;
      acc.count += 1;
    }
  }

  for (const [, acc] of skillAccumulator) {
    lowSkills.push({ desc: acc.desc, avgCompletion: acc.total / acc.count });
  }
  lowSkills.sort((a, b) => a.avgCompletion - b.avgCompletion);

  // Light deduction frequency
  const dedCounter = new Map<string, number>();
  for (const { result } of graded) {
    for (const ded of result.lightDeductions) {
      dedCounter.set(ded.code, (dedCounter.get(ded.code) || 0) + 1);
    }
  }
  const sortedDeds = [...dedCounter.entries()].sort((a, b) => b[1] - a[1]);
  const topDedCodes = sortedDeds.slice(0, 3).map(([code]) => code);

  // Build strengths
  const strengths: string[] = [];
  const highCompletionSkills = lowSkills.filter((s) => s.avgCompletion >= 0.7).length;
  const totalSkills = lowSkills.length;
  if (totalSkills > 0 && highCompletionSkills / totalSkills >= 0.5) {
    strengths.push("多数能力点完成度较高，说明解题思路比较清晰。");
  }
  if (highScoreTitles.length > 0) {
    strengths.push(`在 ${highScoreTitles.join("、")} 这类题目上，你已经能比较稳定地完成主要逻辑。`);
  }
  if (sortedDeds.every(([code]) => code !== "SYN_PARSE" && code !== "SYN_MINOR")) {
    strengths.push("整体语法基础比较稳定，明显的结构性语法问题不多。");
  }
  if (strengths.length === 0) {
    strengths.push("你已经在每道题上做出了尝试，这本身就是建立编程能力的重要一步。");
  }

  // Build weaknesses
  const weaknesses: string[] = [];
  for (const skill of lowSkills.slice(0, 3)) {
    if (skill.avgCompletion < 0.6) {
      weaknesses.push(`"${skill.desc}"能力点完成度偏低（${Math.round(skill.avgCompletion * 100)}%），需要重点加强。`);
    }
  }
  for (const code of topDedCodes) {
    const copy = TAG_WEAKNESS_COPY[code];
    if (copy && !weaknesses.includes(copy)) {
      weaknesses.push(copy);
    }
  }
  if (weaknesses.length === 0) {
    weaknesses.push("本次没有检测到集中的失分点，说明主要问题更偏向细节波动。");
  }

  // Build next steps
  const nextSteps: string[] = [];
  for (const skill of lowSkills.slice(0, 2)) {
    if (skill.avgCompletion < 0.7) {
      nextSteps.push(`重点练习"${skill.desc}"相关题目，提升该能力点的熟练度。`);
    }
  }
  for (const code of topDedCodes) {
    const copy = TAG_SUGGESTION_COPY[code];
    if (copy && !nextSteps.includes(copy)) {
      nextSteps.push(copy);
    }
  }
  if (nextSteps.length === 0) {
    nextSteps.push("继续保持当前节奏，多做几道类似题巩固解题流程。");
  }

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
