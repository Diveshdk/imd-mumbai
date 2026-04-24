/**
 * API Route: Upload Warning Data
 * POST /api/upload/warning
 * Supports both single-sheet (legacy) and multi-sheet (new) formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearCache } from '@/app/utils/unifiedDataLoader';
import { SupabaseStorageManager } from '@/app/utils/supabaseStorageManager';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getDaysInMonth, isValidYear, isValidMonth, isValidLeadDay } from '@/app/utils/dateUtils';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────
    const { supabase } = createServerSupabaseClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile for role & permissions
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
    const leadDay = formData.get('leadDay') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (isNaN(year) || isNaN(month)) {
      return NextResponse.json({ success: false, error: 'Invalid year or month' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ success: false, error: 'File must be an Excel file (.xlsx or .xls)' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    const requiredSheets = ['Day1', 'Day2', 'Day3', 'Day4', 'Day5'];
    const hasAllRequiredSheets = requiredSheets.every((s) => sheetNames.includes(s));

    // ── Validate codes ────────────────────────────────────────────
    const { parseWarningSheet, parseMultiSheetWarningFile, validateWarningCodes } = await import('@/app/utils/warningSheetParser');

    if (hasAllRequiredSheets) {
      const multiSheetData = parseMultiSheetWarningFile(buffer, year, month);
      for (const sheetData of Object.values(multiSheetData.sheets)) {
        const invalidCodes = validateWarningCodes(sheetData as any);
        if (invalidCodes.length > 0) {
          return NextResponse.json({ success: false, error: 'invalid file, you may have uploaded some wrong file, upload the correct warning sheet' }, { status: 400 });
        }
      }
    } else {
      const parsedData = parseWarningSheet(buffer, year, month);
      const invalidCodes = validateWarningCodes(parsedData);
      if (invalidCodes.length > 0) {
        return NextResponse.json({ success: false, error: 'invalid file, you may have uploaded some wrong file, upload the correct warning sheet' }, { status: 400 });
      }
    }

    // ── Build storage manager ─────────────────────────────────────
    const storage = new SupabaseStorageManager(adminSupabase, {
      userId: user.id,
      isAdmin,
      canModify,
      canDelete: profile.can_delete,
    });

    const { extractDayData: extractWarningDayData } = await import('@/app/utils/warningSheetParser');
    const daysInMonth = getDaysInMonth(year, month);

    let filesCreated = 0;
    let daysProcessed = 0;
    const errors: string[] = [];
    let isMultiSheet = false;

    if (hasAllRequiredSheets) {
      isMultiSheet = true;
      const { parseMultiSheetWarningFile: parseMulti } = await import('@/app/utils/warningSheetParser');
      const multiSheetData = parseMulti(buffer, year, month);
      const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;

      for (const ld of leadDays) {
        const parsedData = multiSheetData.sheets[ld];
        for (let day = 1; day <= daysInMonth; day++) {
          try {
            const dayData = extractWarningDayData(parsedData, day);
            await storage.saveWarningData(year, month, day, ld, dayData);
            daysProcessed++;
            filesCreated++;
          } catch (err) {
            errors.push(`${ld} Day ${day}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } else {
      if (!leadDay) {
        return NextResponse.json({
          success: false,
          error: 'Lead day is required for single-sheet uploads. For multi-sheet uploads, ensure the file contains sheets named: Day1, Day2, Day3, Day4, Day5',
        }, { status: 400 });
      }

      const { parseWarningSheet: parseSingle } = await import('@/app/utils/warningSheetParser');
      const parsedData = parseSingle(buffer, year, month);

      for (let day = 1; day <= daysInMonth; day++) {
        try {
          const dayData = extractWarningDayData(parsedData, day);
          await storage.saveWarningData(year, month, day, leadDay, dayData);
          daysProcessed++;
          filesCreated++;
        } catch (err) {
          errors.push(`Day ${day}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    clearCache();

    return NextResponse.json({
      success: true,
      message: isMultiSheet
        ? 'Multi-sheet warning data uploaded successfully (all 5 lead days processed)'
        : 'Warning data uploaded successfully',
      isMultiSheet,
      summary: { year, month, leadDay, daysProcessed, filesCreated, errors, warnings: [] },
    });

  } catch (error) {
    console.error('Warning upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
