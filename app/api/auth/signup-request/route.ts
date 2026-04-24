import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/signup-request
 * Creates a Supabase Auth user and a pending signup_request.
 * The user cannot log in until admin approves.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, username } = await request.json();

    if (!email || !password || !username) {
      return NextResponse.json({ success: false, error: 'Email, password, and username are required' }, { status: 400 });
    }

    if (username.length < 3) {
      return NextResponse.json({ success: false, error: 'Username must be at least 3 characters' }, { status: 400 });
    }

    // Check if username is already taken
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ success: false, error: 'Username already taken' }, { status: 409 });
    }

    // Check if email is already used
    const { data: usersData } = await adminSupabase.auth.admin.listUsers();
    const existingUser = usersData?.users?.find((u) => u.email === email);
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });
    }

    // Create auth user (disabled/pending state — we manage status via profiles table)
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification, admin approves manually
    });

    if (authError) {
      return NextResponse.json({ success: false, error: authError.message }, { status: 400 });
    }

    // Create profile with pending status
    const { error: profileError } = await adminSupabase.from('profiles').insert({
      id: authData.user!.id,
      username,
      email,
      role: 'user',
      status: 'pending',
      mode: 'dual',
      can_modify: false,
      can_delete: false,
    });

    if (profileError) {
      // Rollback auth user
      await adminSupabase.auth.admin.deleteUser(authData.user!.id);
      return NextResponse.json({ success: false, error: profileError.message }, { status: 500 });
    }

    // Create signup request record for admin panel
    await adminSupabase.from('signup_requests').insert({
      username,
      email,
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      message: 'Sign-up request submitted. You will be notified when your account is approved.',
    });

  } catch (err: any) {
    console.error('Signup request error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
