/**
 * API Route: Upload Warning Data
 * POST /api/upload/warning
 * Supports both single-sheet (legacy) and multi-sheet (new) formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { processWarningUpload, processMultiSheetWarningUpload } from '@/app/utils/uploadProcessor';
import { clearCache } from '@/app/utils/unifiedDataLoader';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    
    const file = formData.get('file') as File;
    const year = parseInt(formData.get('year') as string, 10);
    const month = parseInt(formData.get('month') as string, 10);
    const leadDay = formData.get('leadDay') as string | null;
    
    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    if (isNaN(year) || isNaN(month)) {
      return NextResponse.json(
        { success: false, error: 'Invalid year or month' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, error: 'File must be an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Detect if this is a multi-sheet file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    
    // Check if file has the multi-sheet format (Day1, Day2, Day3, Day4, Day5)
    const requiredSheets = ['Day1', 'Day2', 'Day3', 'Day4', 'Day5'];
    const hasAllRequiredSheets = requiredSheets.every(sheet => sheetNames.includes(sheet));

    // ── VALIDATION: check all codes against the allowed set ──────────────────
    const { parseWarningSheet, parseMultiSheetWarningFile, validateWarningCodes } = await import('@/app/utils/warningSheetParser');

    if (hasAllRequiredSheets) {
      // Validate all 5 sheets
      const multiSheetData = parseMultiSheetWarningFile(buffer, year, month);
      for (const sheetData of Object.values(multiSheetData.sheets)) {
        const invalidCodes = validateWarningCodes(sheetData as any);
        if (invalidCodes.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'invalid file, you may have uploaded some wrong file, upload the correct warning sheet'
            },
            { status: 400 }
          );
        }
      }
    } else {
      // Validate single sheet
      const parsedData = parseWarningSheet(buffer, year, month);
      const invalidCodes = validateWarningCodes(parsedData);
      if (invalidCodes.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'invalid file, you may have uploaded some wrong file, upload the correct warning sheet'
          },
          { status: 400 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    
    let summary;
    let isMultiSheet = false;
    
    if (hasAllRequiredSheets) {
      // Multi-sheet format detected
      isMultiSheet = true;
      summary = await processMultiSheetWarningUpload(buffer, { year, month });
    } else {
      // Single-sheet format (legacy)
      if (!leadDay) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Lead day is required for single-sheet uploads. For multi-sheet uploads, ensure the file contains sheets named: Day1, Day2, Day3, Day4, Day5' 
          },
          { status: 400 }
        );
      }
      
      summary = await processWarningUpload(buffer, { year, month, leadDay });
    }
    
    // Clear data cache
    clearCache();

    // Return success response
    return NextResponse.json({
      success: true,
      message: isMultiSheet 
        ? 'Multi-sheet warning data uploaded successfully (all 5 lead days processed)' 
        : 'Warning data uploaded successfully',
      isMultiSheet,
      summary
    });
    
  } catch (error) {
    console.error('Warning upload error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      },
      { status: 500 }
    );
  }
}

