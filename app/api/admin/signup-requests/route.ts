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

/** GET /api/admin/signup-requests — list pending requests */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await adminSupabase
    .from('signup_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, requests: data });
}

/** POST /api/admin/signup-requests — approve or reject */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin(request);
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId, action } = await request.json();

  if (!requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Get the signup request
  const { data: signupReq } = await adminSupabase
    .from('signup_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!signupReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const profileStatus = action === 'approve' ? 'active' : 'rejected';

  // Update signup_request status
  await adminSupabase.from('signup_requests').update({ status: newStatus }).eq('id', requestId);

  // Update profile status
  await adminSupabase.from('profiles').update({
    status: profileStatus,
    ...(action === 'approve' ? { mode: 'dual' } : {}),
  }).eq('email', signupReq.email);

  return NextResponse.json({
    success: true,
    message: action === 'approve'
      ? `User ${signupReq.username} has been approved`
      : `User ${signupReq.username} has been rejected`,
  });
}
