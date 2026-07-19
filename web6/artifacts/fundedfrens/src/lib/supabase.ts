import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Surface a clear error in the browser console so developers know
  // exactly which environment variables are missing. Without these the
  // auth client connects to nothing and login silently fails.
  console.error(
    '[FundedFrens] Missing Supabase environment variables.\n' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel ' +
      'project settings (Settings → Environment Variables).\n' +
      'Auth will not work until these are configured.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseKey ?? 'placeholder_key',
);
