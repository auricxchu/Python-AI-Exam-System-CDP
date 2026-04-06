import { CloudResult } from "./cloudService";
import { AiProvider, AiProviderSettings } from "./aiTypes";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { teacherSessionService } from "./teacherSessionService";

const ADMIN_PASSWORD_HEADER = "x-admin-password";

type CloudJsonSchemaKind = "question_generation" | "reference_answer" | "grading";

interface ProxyPingResponse {
  ok: boolean;
}

interface ProxyTextResponse {
  ok: boolean;
  text?: string;
  error?: string;
}

interface ProxyRequestBody {
  operation: "ping" | "chat_json";
  provider: AiProvider;
  payload?: {
    schemaKind?: CloudJsonSchemaKind;
    systemPrompt?: string;
    userPrompt?: string;
    temperature?: number;
  };
}

const getAdminHeaders = (): Record<string, string> => {
  const password = teacherSessionService.getPassword();
  return password ? { [ADMIN_PASSWORD_HEADER]: password } : {};
};

export const isCloudAiProxyEnabled = (): boolean => isSupabaseConfigured && !!supabase;

export const fetchCloudAiSettings = async (): Promise<AiProviderSettings | null> => {
  if (!supabase) return null;
  const headers = getAdminHeaders();
  if (!headers[ADMIN_PASSWORD_HEADER]) return null;

  try {
    const { data, error } = await supabase.functions.invoke("admin-get-ai-settings", { headers });
    if (error) throw error;
    return (data?.settings as AiProviderSettings | undefined) || null;
  } catch (error) {
    console.warn("Failed to load AI settings from cloud:", error);
    return null;
  }
};

export const saveCloudAiSettings = async (settings: AiProviderSettings): Promise<CloudResult> => {
  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  const headers = getAdminHeaders();
  if (!headers[ADMIN_PASSWORD_HEADER]) {
    return { success: false, error: "Teacher admin session missing" };
  }

  try {
    const { error } = await supabase.functions.invoke("admin-upsert-ai-settings", {
      headers,
      body: { settings }
    });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Failed to save AI settings to cloud:", error);
    return { success: false, error: error?.message || "Unknown error" };
  }
};

export const pingCloudProvider = async (provider: AiProvider): Promise<boolean> => {
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.functions.invoke("ai-proxy", {
      body: {
        operation: "ping",
        provider
      } satisfies ProxyRequestBody
    });
    if (error) throw error;
    return !!(data as ProxyPingResponse | null)?.ok;
  } catch (error) {
    console.warn(`Cloud AI ping failed for ${provider}:`, error);
    return false;
  }
};

export const requestCloudJsonText = async (
  provider: AiProvider,
  schemaKind: CloudJsonSchemaKind,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<string | null> => {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke("ai-proxy", {
      body: {
        operation: "chat_json",
        provider,
        payload: {
          schemaKind,
          systemPrompt,
          userPrompt,
          temperature
        }
      } satisfies ProxyRequestBody
    });

    if (error) throw error;
    const result = data as ProxyTextResponse | null;
    if (!result?.ok || !result.text) {
      return null;
    }
    return result.text;
  } catch (error) {
    console.warn(`Cloud AI request failed for ${provider}:`, error);
    return null;
  }
};
