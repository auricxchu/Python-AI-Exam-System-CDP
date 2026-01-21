import { GoogleGenAI, Type } from "@google/genai";
import { GradingResult } from "../types";

/**
 * Grades the code based on the problem description.
 * Supports both Gemini API and Deepseek API.
 */
export const gradeQuestion = async (
  title: string,
  description: string,
  code: string
): Promise<GradingResult> => {
  
  // 1. Priority: Check for Deepseek API Key
  if (process.env.DEEPSEEK_API_KEY) {
    return await gradeWithDeepseek(title, description, code);
  }

  // 2. Fallback: Check for Gemini API Key
  if (process.env.API_KEY) {
    return await gradeWithGemini(title, description, code);
  }

  return {
    passed: false,
    score: 0,
    logic_feedback: "API Key 缺失",
    quality_feedback: "未检测到 AI 服务配置",
    suggestion: "请在 .env 文件中配置 API_KEY (Gemini) 或 DEEPSEEK_API_KEY"
  };
};

/**
 * Implementation for Deepseek API (OpenAI Compatible)
 */
async function gradeWithDeepseek(title: string, description: string, code: string): Promise<GradingResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const url = "https://api.deepseek.com/chat/completions";

  const systemPrompt = `You are a code grader. Grade the Python code based on the problem description.
  Return ONLY a valid JSON object. Do not output markdown code blocks.
  
  The JSON structure must be:
  {
    "passed": boolean, // true if code is correct
    "score": number, // 0-100
    "logic_feedback": "string", // Chinese, brief feedback on logic
    "quality_feedback": "string", // Chinese, brief feedback on code style
    "suggestion": "string" // Chinese, one improvement suggestion
  }`;

  const userPrompt = `Problem: ${title}
  Description: ${description}
  
  Student Code:
  ${code}`;

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