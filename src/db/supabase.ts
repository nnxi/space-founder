import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!config.supabase.url || !config.supabase.key) {
      throw new Error("Supabase URL 및 Key 설정이 누락되었습니다.");
    }

    // 백엔드 전용 통신이므로 config.supabase.key는 Service Role Key여야 합니다.
    client = createClient(config.supabase.url, config.supabase.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}