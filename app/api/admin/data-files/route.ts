import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireAdmin(request: NextRequest) {
  const { supabase } = createServerSupabaseClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role, status, can_modify, can_delete')
    .eq('id', user.id)
    .single();
  if (!profile || profile.status !== 'active') return null;
  const isAuthorized = profile.role === 'admin' || profile.can_modify || profile.can_delete;
  if (!isAuthorized) return null;
  return user;
}

/**
 * GET /api/admin/data-files?year=2025&month=6
 * Returns all master_data_files for the given month (warning + realised)
 */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const year = parseInt(params.get('year') || '0');
  const month = parseInt(params.get('month') || '0');

  if (!year || !month) {
    return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('master_data_files')
    .select('id, type, year, month, day, lead_day, districts, uploaded_by, created_at, updated_at')
    .eq('year', year)
    .eq('month', month)
    .order('type', { ascending: true })
    .order('day', { ascending: true })
    .order('lead_day', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, files: data });
}

/**
 * PATCH /api/admin/data-files?id=<uuid>
 * Update districts for a specific master_data_file
 */
export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { districts } = await request.json();
  if (!districts || typeof districts !== 'object') {
    return NextResponse.json({ error: 'districts object is required' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('master_data_files')
    .update({ districts, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, file: data });
}

/**
 * DELETE /api/admin/data-files?id=<uuid>
 * Delete a specific master_data_file
 */
export async function DELETE(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await adminSupabase
    .from('master_data_files')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
