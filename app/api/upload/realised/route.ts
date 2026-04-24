/**
 * API Route: Upload Realised Data
 * POST /api/upload/realised
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearCache } from '@/app/utils/unifiedDataLoader';
import { SupabaseStorageManager } from '@/app/utils/supabaseStorageManager';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getDaysInMonth } from '@/app/utils/dateUtils';

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────
    const { supabase } = createServerSupabaseClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role, status, can_modify, can_delete')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Account not active' }, { status: 403 });
    }

    const isAdmin = profile.role === 'admin';
    const canModify = profile.can_modify;

    if (!isAdmin && !canModify) {
      return NextResponse.json({ success: false, error: 'You do not have permission to upload files' }, { status: 403 });
    }

    // ── Parse form data ───────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const year = parseInt(formData.get('year') as string, 10);
    const month = parseInt(formData.get('month') as string, 10);

    if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    if (isNaN(year) || isNaN(month)) return NextResponse.json({ success: false, error: 'Invalid year or month' }, { status: 400 });

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ success: false, error: 'File must be an Excel file (.xlsx or .xls)' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── Parse & save ──────────────────────────────────────────────
    const { parseRealisedSheet, extractDayData } = await import('@/app/utils/realisedSheetParser');
    const parsedData = parseRealisedSheet(buffer, year, month);
    const daysInMonth = getDaysInMonth(year, month);

    const storage = new SupabaseStorageManager(adminSupabase, {
      userId: user.id,
      isAdmin,
      canModify,
      canDelete: profile.can_delete,
    });

    let daysProcessed = 0;
    let filesCreated = 0;
    const errors: string[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      try {
        const dayData = extractDayData(parsedData, day);
        await storage.saveRealisedData(year, month, day, dayData);
        daysProcessed++;
        filesCreated++;
      } catch (err) {
        errors.push(`Day ${day}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    clearCache();

    return NextResponse.json({
      success: true,
      message: 'Realised data uploaded successfully',
      summary: { year, month, daysProcessed, filesCreated, errors, warnings: [] },
    });

  } catch (error) {
    console.error('Realised upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
