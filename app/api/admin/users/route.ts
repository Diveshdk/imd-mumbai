import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireAdmin(request: NextRequest) {
  const { supabase } = createServerSupabaseClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminSupabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') return null;
  return user;
}

/** GET /api/admin/users — list all non-admin users */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await adminSupabase
    .from('profiles')
    .select('id, username, email, role, status, mode, can_modify, can_delete, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, users: data });
}
