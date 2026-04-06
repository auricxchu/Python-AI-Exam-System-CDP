export type AiProvider = "deepseek" | "gemini" | "openai" | "qwen" | "moonshot";

export interface AiProviderConfig {
  apiKey: string;
  model: string;
}

export type AiProviderSettings = Record<AiProvider, AiProviderConfig>;

export const AI_PROVIDERS: AiProvider[] = ["deepseek", "gemini", "openai", "qwen", "moonshot"];
