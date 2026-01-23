import { GoogleGenAI, Type } from "@google/genai";
import { GradingResult, Question, Difficulty } from "../types";

const buildSystemPrompt = () => `You are a code grader. Grade the Python code based on the problem description.
Return ONLY a valid JSON object. Do not output markdown code blocks.

The JSON structure must be:
{
  "passed": boolean, // true if code is correct
  "score": number, // 0-100
  "logic_feedback": "string", // Chinese, brief feedback on logic
  "quality_feedback": "string", // Chinese, brief feedback on code style
  "suggestion": "string" // Chinese, one improvement suggestion
}`;

const buildUserPrompt = (title: string, description: string, code: string) => `Problem: ${title}
Description: ${description}

Student Code:
${code}`;

export type AiProvider = "deepseek" | "gemini" | "openai" | "qwen" | "moonshot";

type ProviderStatus = "ok" | "fail";

const hasKey = (val?: string) => !!val && val.trim().length > 0;

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

const providerKeys: Record<AiProvider, string | undefined> = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  gemini: process.env.API_KEY,
  openai: process.env.OPENAI_API_KEY,
  qwen: process.env.QWEN_API_KEY,
  moonshot: process.env.MOONSHOT_API_KEY
};

export const getAvailableProviders = (): AiProvider[] => {
  return (Object.keys(providerKeys) as AiProvider[]).filter((key) => hasKey(providerKeys[key]));
};

const normalizeDifficulty = (input: string | undefined): Difficulty => {
  if (!input) return "简单";
  const value = input.toLowerCase();
  if (value.includes("难") || value.includes("hard")) return "困难";
  if (value.includes("中") || value.includes("medium")) return "中等";
  if (value.includes("简") || value.includes("easy")) return "简单";
  return "简单";
};

type GeneratedQuestion = Pick<Question, "title" | "description" | "difficulty" | "template">;

const requestOpenAIJson = async (
  provider: string,
  apiKey: string,
  url: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
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
      temperature: 0.6
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider} API Error: ${response.status} - ${errText.slice(0, 120)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${provider}`);
  return JSON.parse(content);
};

export const generateQuestion = async (
  instruction: string,
  current: Partial<Question>,
  provider: AiProvider = "deepseek"
): Promise<GeneratedQuestion | null> => {
  const resolved = provider;

  const systemPrompt = `你是 Python 考试题目生成器。仅返回 JSON，不要输出 Markdown。
JSON 字段必须包含：
{
  "title": "string",
  "description": "string",
  "difficulty": "简单|中等|困难",
  "template": "string"
}`;

  const currentSnapshot = `当前草稿:
题目名称: ${current.title || ""}
题目描述: ${current.description || ""}
难度: ${current.difficulty || ""}
代码模板: ${current.template || ""}`;

  const userPrompt = `用户指令:
${instruction}

${currentSnapshot}

要求:
- 题目为单文件 Python 题
- 题目描述清晰，包含输入输出说明
- 模板保留函数入口 def solution():`;

  try {
    let raw: any;
    if (resolved === "gemini") {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        contents: `${systemPrompt}\n\n${userPrompt}`,
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
      raw = JSON.parse(response.text);
    } else if (resolved === "deepseek") {
      raw = await requestOpenAIJson(
        "Deepseek",
        process.env.DEEPSEEK_API_KEY as string,
        "https://api.deepseek.com/chat/completions",
        "deepseek-chat",
        systemPrompt,
        userPrompt
      );
    } else if (resolved === "openai") {
      raw = await requestOpenAIJson(
        "OpenAI",
        process.env.OPENAI_API_KEY as string,
        "https://api.openai.com/v1/chat/completions",
        process.env.OPENAI_MODEL || "gpt-4o-mini",
        systemPrompt,
        userPrompt
      );
    } else if (resolved === "qwen") {
      raw = await requestOpenAIJson(
        "Qwen",
        process.env.QWEN_API_KEY as string,
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        process.env.QWEN_MODEL || "qwen-plus",
        systemPrompt,
        userPrompt
      );
    } else {
      raw = await requestOpenAIJson(
        "Moonshot",
        process.env.MOONSHOT_API_KEY as string,
        "https://api.moonshot.cn/v1/chat/completions",
        process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
        systemPrompt,
        userPrompt
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
  const key = providerKeys[provider];
  if (!hasKey(key)) return false;
  const apiKey = key as string;

  if (provider === "gemini") {
    try {
      const ai = new GoogleGenAI({ apiKey });
      await withTimeout(
        ai.models.generateContent({
          model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
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
    return (await pingOpenAICompatible("Deepseek", apiKey, "https://api.deepseek.com/chat/completions", "deepseek-chat")) === "ok";
  }

  if (provider === "openai") {
    return (await pingOpenAICompatible("OpenAI", apiKey, "https://api.openai.com/v1/chat/completions", process.env.OPENAI_MODEL || "gpt-4o-mini")) === "ok";
  }

  if (provider === "qwen") {
    return (await pingOpenAICompatible("Qwen", apiKey, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", process.env.QWEN_MODEL || "qwen-plus")) === "ok";
  }

  if (provider === "moonshot") {
    return (await pingOpenAICompatible("Moonshot", apiKey, "https://api.moonshot.cn/v1/chat/completions", process.env.MOONSHOT_MODEL || "moonshot-v1-8k")) === "ok";
  }

  return false;
};

/**
 * Grades the code based on the problem description.
 * Supports multiple AI providers (Deepseek/OpenAI/Qwen/Moonshot/Gemini).
 */
export const gradeQuestion = async (
  title: string,
  description: string,
  code: string,
  provider: AiProvider = "deepseek"
): Promise<GradingResult> => {
  const available = getAvailableProviders();

  if (!available.includes(provider)) {
    return {
      passed: false,
      score: 0,
      logic_feedback: "API Key 缺失",
      quality_feedback: "未检测到所选模型配置",
      suggestion: "请在 .env 文件中配置对应模型的 API Key"
    };
  }

  const selected = provider;

  if (!selected) {
    return {
      passed: false,
      score: 0,
      logic_feedback: "API Key 缺失",
      quality_feedback: "未检测到所选模型配置",
      suggestion: "请在 .env 文件中配置对应模型的 API Key"
    };
  }

  if (selected === "deepseek") {
    return await gradeWithDeepseek(title, description, code);
  }

  if (selected === "openai") {
    return await gradeWithOpenAICompatible(
      "OpenAI",
      process.env.OPENAI_API_KEY as string,
      "https://api.openai.com/v1/chat/completions",
      process.env.OPENAI_MODEL || "gpt-4o-mini",
      title,
      description,
      code
    );
  }

  if (selected === "qwen") {
    return await gradeWithOpenAICompatible(
      "Qwen",
      process.env.QWEN_API_KEY as string,
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      process.env.QWEN_MODEL || "qwen-plus",
      title,
      description,
      code
    );
  }

  if (selected === "moonshot") {
    return await gradeWithOpenAICompatible(
      "Moonshot",
      process.env.MOONSHOT_API_KEY as string,
      "https://api.moonshot.cn/v1/chat/completions",
      process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
      title,
      description,
      code
    );
  }

  return await gradeWithGemini(title, description, code);
};

/**
 * OpenAI-compatible API implementation (OpenAI / Qwen / Moonshot)
 */
async function gradeWithOpenAICompatible(
  provider: string,
  apiKey: string,
  url: string,
  model: string,
  title: string,
  description: string,
  code: string
): Promise<GradingResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(title, description, code);

  try {
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
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider} API Error: ${response.status} - ${errText.slice(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      try {
        return JSON.parse(content) as GradingResult;
      } catch (e) {
        console.error(`${provider} JSON Parse Error:`, content);
        throw new Error("AI \u8fd4\u56de\u683c\u5f0f\u9519\u8bef\uff0c\u65e0\u6cd5\u89e3\u6790");
      }
    }
    throw new Error(`Empty response from ${provider}`);

  } catch (error: any) {
    console.error(`${provider} Grading Error:`, error);
    return {
      passed: false,
      score: 0,
      logic_feedback: `\u8bc4\u5206\u670d\u52a1\u8fde\u63a5\u5931\u8d25: ${error.message || '\u672a\u77e5\u9519\u8bef'}`,
      quality_feedback: "\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\u6216 Key \u662f\u5426\u6b63\u786e",
      suggestion: "\u8bf7\u91cd\u8bd5\u63d0\u4ea4\uff0c\u6216\u8054\u7cfb\u76d1\u8003\u8001\u5e08"
    };
  }
}

/**
 * Implementation for Deepseek API (OpenAI Compatible)
 */
async function gradeWithDeepseek(title: string, description: string, code: string): Promise<GradingResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const url = "https://api.deepseek.com/chat/completions";

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(title, description, code);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepseek API Error: ${response.status} - ${errText.slice(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      try {
        return JSON.parse(content) as GradingResult;
      } catch (e) {
        console.error("JSON Parse Error:", content);
        throw new Error("AI 返回格式错误，无法解析");
      }
    }
    throw new Error("Empty response from Deepseek");

  } catch (error: any) {
    console.error("Deepseek Grading Error:", error);
    return {
      passed: false,
      score: 0,
      logic_feedback: `评分服务连接失败: ${error.message || '未知错误'}`,
      quality_feedback: "请检查网络连接或 Key 是否正确",
      suggestion: "请重试提交，或联系监考老师"
    };
  }
}

/**
 * Implementation for Google Gemini API
 */
async function gradeWithGemini(title: string, description: string, code: string): Promise<GradingResult> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Grade this Python code for the problem "${title}".
      
      Problem Description:
      ${description}
      
      Student Code:
      ${code}
      
      Provide a JSON response with the following fields:
      - passed (boolean): Whether the code solves the problem correctly.
      - score (number): 0-100 score based on correctness and code quality.
      - logic_feedback (string): Brief feedback on the logic in Chinese (中文).
      - quality_feedback (string): Brief feedback on code style/quality in Chinese (中文).
      - suggestion (string): One suggestion for improvement in Chinese (中文).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            passed: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            logic_feedback: { type: Type.STRING },
            quality_feedback: { type: Type.STRING },
            suggestion: { type: Type.STRING },
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as GradingResult;
    }
    throw new Error("Empty response from Gemini");

  } catch (error: any) {
    console.error("Gemini Grading Error:", error);
    return {
      passed: false,
      score: 0,
      logic_feedback: `AI 评分失败: ${error.message || '未知错误'}`,
      quality_feedback: "请查看控制台详情",
      suggestion: "请重试提交"
    };
  }
}
