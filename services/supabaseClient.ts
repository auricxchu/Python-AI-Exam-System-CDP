import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.SUPABASE_URL || "https://yzuhyzdjhffimgufddsr.supabase.co";
export const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_oadXrPeC0YFrWlFcklnhFg_g0CFkR0X";

export const isSupabaseConfigured = SUPABASE_URL !== "https://your-project.supabase.co";
export const supabase = isSupabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
