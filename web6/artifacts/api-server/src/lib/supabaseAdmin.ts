// ---------------------------------------------------------------------------
// Supabase Admin Client
// Uses the service role key — NEVER expose this to the frontend.
// Bypasses RLS for server-side operations.
// ---------------------------------------------------------------------------
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Lazy singleton — created on first use so env vars can be loaded beforehand.
let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) _client = createAdminClient();
  return _client;
}
