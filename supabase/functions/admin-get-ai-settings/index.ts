import { AI_PROVIDERS, defaultProviderModels, normalizeSettingsRows } from "../_shared/ai.ts";
import { corsHeaders, createServiceClient, json, requireAdminPassword } from "../_shared/admin.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAdminPassword(request);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_provider_settings")
    .select("provider, api_key, model");

  if (error) {
    return json({ error: error.message }, 500);
  }

  const settings = normalizeSettingsRows(data);
  return json({
    settings: Object.fromEntries(
      AI_PROVIDERS.map((provider) => [
        provider,
        {
          apiKey: settings[provider].apiKey,
          model: settings[provider].model || defaultProviderModels[provider]
        }
      ])
    )
  });
});
