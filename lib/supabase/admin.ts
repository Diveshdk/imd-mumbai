import { createClient } from '@supabase/supabase-js';

/**
 * Admin (service role) Supabase client.
 * Bypasses RLS — only use in server-side API routes.
 */
export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
