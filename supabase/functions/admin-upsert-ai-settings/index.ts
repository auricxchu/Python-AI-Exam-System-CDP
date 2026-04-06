import { AI_PROVIDERS, defaultProviderModels } from "../_shared/ai.ts";
import { corsHeaders, createServiceClient, json, requireAdminPassword } from "../_shared/admin.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAdminPassword(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const inputSettings = body?.settings as Record<string, { apiKey?: string; model?: string }> | undefined;
  if (!inputSettings) {
    return json({ error: "Missing settings payload" }, 400);
  }

  const rows = AI_PROVIDERS.map((provider) => ({
    provider,
    api_key: inputSettings[provider]?.apiKey?.trim?.() || "",
    model: inputSettings[provider]?.model?.trim?.() || defaultProviderModels[provider],
    updated_at: new Date().toISOString()
  }));

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ai_provider_settings")
    .upsert(rows, { onConflict: "provider" });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ success: true });
});
