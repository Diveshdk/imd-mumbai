/**
 * API Route: Clear Server-Side Cache
 * POST /api/admin/clear-cache
 * Clears both the data cache (unifiedDataLoader) and config cache (rainfallConfig).
 * Requires admin session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearCache } from '@/app/utils/unifiedDataLoader';
import { clearConfigCache } from '@/app/utils/rainfallConfig';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { supabase } = createServerSupabaseClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    // Clear both caches
    clearCache();
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully. The website will now fetch fresh data from Supabase.',
    });
  } catch (error: any) {
    console.error('Cache clear error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear cache: ' + (error.message || error.toString()) },
      { status: 500 }
    );
  }
}
