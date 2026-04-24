import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/reset-data
 * Deletes all user-specific copies in user_data_files for the current user.
 * This effectively reverts their view to the master data files.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase } = createServerSupabaseClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all records from user_data_files for this user
    const { error } = await supabase
      .from('user_data_files')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'All personal data copies have been cleared. You are now viewing master data.' 
    });
  } catch (error: any) {
    console.error('Reset data API error:', error);
    return NextResponse.json(
      { error: 'Failed to reset data', details: error.message },
      { status: 500 }
    );
  }
}
