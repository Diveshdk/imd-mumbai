import { NextRequest, NextResponse } from 'next/server';
import { switchMode, loadRainfallConfig } from '@/app/utils/rainfallConfig';
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
 * POST /api/admin/rainfall-config/mode
 * Switch between dual and multi mode — requires active admin session
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized — admin session required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mode } = body;

    // Validate mode
    if (!mode || (mode !== 'dual' && mode !== 'multi')) {
      return NextResponse.json(
        { success: false, error: 'Invalid mode. Must be "dual" or "multi"' },
        { status: 400 }
      );
    }

    // Switch mode
    const updatedConfig = await switchMode(mode);

    return NextResponse.json({
      success: true,
      message: `Switched to ${mode} mode successfully`,
      config: updatedConfig
    });

  } catch (error: any) {
    console.error('Failed to switch mode:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to switch mode', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/rainfall-config/mode
 * Get current mode — public read
 */
export async function GET(request: NextRequest) {
  try {
    const config = await loadRainfallConfig();
    return NextResponse.json({ success: true, mode: config.mode });
  } catch (error: any) {
    console.error('Failed to get mode:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get mode', details: error.message },
      { status: 500 }
    );
  }
}
