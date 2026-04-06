import { AI_PROVIDERS, AiProvider, normalizeSettingsRows, pingProvider, requestJsonText } from "../_shared/ai.ts";
import { corsHeaders, createServiceClient, json } from "../_shared/admin.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await request.json().catch(() => null);
  const operation = body?.operation as "ping" | "chat_json" | undefined;
  const provider = body?.provider as AiProvider | undefined;
  const payload = body?.payload as {
    schemaKind?: "question_generation" | "reference_answer" | "grading";
    systemPrompt?: string;
    userPrompt?: string;
    temperature?: number;
  } | undefined;

  if (!operation || !provider || !AI_PROVIDERS.includes(provider)) {
    return json({ error: "Invalid proxy request" }, 400);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_provider_settings")
    .select("provider, api_key, model")
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, 500);
  }

  const settings = normalizeSettingsRows(data ? [data] : []);
  const current = settings[provider];

  if (operation === "ping") {
    try {
      const ok = await pingProvider(provider, current);
      return json({ ok });
    } catch (proxyError: any) {
      return json({ ok: false, error: proxyError?.message || "Ping failed" }, 200);
    }
  }

  if (!payload?.schemaKind || !payload.systemPrompt || !payload.userPrompt) {
    return json({ error: "Missing proxy payload" }, 400);
  }

  try {
    const text = await requestJsonText(provider, current, payload);
    return json({ ok: true, text });
  } catch (proxyError: any) {
    return json({ ok: false, error: proxyError?.message || "Proxy request failed" }, 200);
  }
});
