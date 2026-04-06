export type AiProvider = "deepseek" | "gemini" | "openai" | "qwen" | "moonshot";
export type CloudJsonSchemaKind = "question_generation" | "reference_answer" | "grading";

export const defaultProviderModels: Record<AiProvider, string> = {
  deepseek: "deepseek-chat",
  gemini: "gemini-1.5-flash",
  openai: "gpt-4o-mini",
  qwen: "qwen-plus",
  moonshot: "moonshot-v1-8k"
};

export const AI_PROVIDERS: AiProvider[] = ["deepseek", "gemini", "openai", "qwen", "moonshot"];

export type StoredAiSetting = {
  apiKey: string;
  model: string;
};

export const normalizeSettingsRows = (
  rows: Array<{ provider: string; api_key: string; model: string }> | null
): Record<AiProvider, StoredAiSetting> => {
  const base = Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, { apiKey: "", model: defaultProviderModels[provider] }])
  ) as Record<AiProvider, StoredAiSetting>;

  for (const row of rows || []) {
    if (!AI_PROVIDERS.includes(row.provider as AiProvider)) continue;
    const provider = row.provider as AiProvider;
    base[provider] = {
      apiKey: row.api_key || "",
      model: row.model || defaultProviderModels[provider]
    };
  }

  return base;
};

const responseSchemas: Record<CloudJsonSchemaKind, unknown> = {
  question_generation: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      description: { type: "STRING" },
      difficulty: { type: "STRING" },
      template: { type: "STRING" }
    }
  },
  reference_answer: {
    type: "OBJECT",
    properties: {
      reference_answer: { type: "STRING" }
    }
  },
  grading: {
    type: "OBJECT",
    properties: {
      path_hit: { type: "BOOLEAN" },
      detected_tags: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            code: { type: "STRING" },
            evidence: { type: "STRING" }
          }
        }
      },
      corrected_answer: { type: "STRING" },
      feedback: {
        type: "OBJECT",
        properties: {
          highlights: { type: "STRING" },
          main_issues: { type: "STRING" },
          suggestions: { type: "STRING" }
        }
      }
    }
  }
};

const getOpenAICompatibleEndpoint = (provider: Exclude<AiProvider, "gemini">) => {
  switch (provider) {
    case "deepseek":
      return "https://api.deepseek.com/chat/completions";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "qwen":
      return "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    case "moonshot":
      return "https://api.moonshot.cn/v1/chat/completions";
  }
};

export const pingProvider = async (provider: AiProvider, settings: StoredAiSetting) => {
  if (!settings.apiKey) return false;

  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { temperature: 0, responseMimeType: "text/plain" }
        })
      }
    );
    return response.ok;
  }

  const response = await fetch(getOpenAICompatibleEndpoint(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0
    })
  });
  return response.ok;
};

export const requestJsonText = async (
  provider: AiProvider,
  settings: StoredAiSetting,
  payload: {
    schemaKind: CloudJsonSchemaKind;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }
) => {
  if (!settings.apiKey) {
    throw new Error(`Missing API key for ${provider}`);
  }

  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${payload.systemPrompt}\n\n${payload.userPrompt}` }] }],
          generationConfig: {
            temperature: payload.temperature ?? 0.2,
            responseMimeType: "application/json",
            responseSchema: responseSchemas[payload.schemaKind]
          }
        })
      }
    );

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message || `${provider} request failed`);
    }
    const text = json?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned empty content");
    return text;
  }

  const response = await fetch(getOpenAICompatibleEndpoint(provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: payload.systemPrompt },
        { role: "user", content: payload.userPrompt }
      ],
      temperature: payload.temperature ?? 0.2,
      response_format: { type: "json_object" }
    })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `${provider} request failed`);
  }
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} returned empty content`);
  return text;
};
