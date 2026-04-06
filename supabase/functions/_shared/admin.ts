import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });

export const createServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

const sha256Hex = async (input: string) => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const requireAdminPassword = async (request: Request) => {
  const suppliedPassword = request.headers.get("x-admin-password")?.trim();
  if (!suppliedPassword) {
    return { ok: false as const, response: json({ error: "Missing admin password header" }, 401) };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("question_bank")
    .select("data")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, response: json({ error: error.message }, 500) };
  }

  const adminPasswordHash = data?.data?.adminPasswordHash as string | undefined;
  const expectedHash = adminPasswordHash?.trim();
  const verified = expectedHash
    ? (await sha256Hex(suppliedPassword)) === expectedHash
    : suppliedPassword === "admin";

  if (!verified) {
    return { ok: false as const, response: json({ error: "Invalid admin password" }, 403) };
  }

  return { ok: true as const, supabase };
};
