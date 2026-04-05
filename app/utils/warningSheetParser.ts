/**
 * Warning Sheet Parser
 * Parses Warning Excel files with day-column format
 * Structure: District | 1 | 2 | 3 | ... | 30 | 31
 */

import * as XLSX from 'xlsx';
import { getDaysInMonth } from './dateUtils';

/**
 * Valid IMD warning codes that are allowed in uploaded files.
 * Any other non-null code will cause the upload to be rejected.
 */
export const VALID_WARNING_CODES: ReadonlySet<number> = new Set([
  1, 4, 5, 8, 9, 12, 13, 14, 15, 16, 17, 21, 24, 25, 26, 27, 28, 29, 37, 44
]);

/**
 * Validate that all non-null codes in the parsed warning data belong
 * to the allowed set. Returns the list of invalid codes found.
 */
export function validateWarningCodes(parsedData: ParsedWarningData): number[] {
  const invalidCodes: Set<number> = new Set();
  for (const row of parsedData.rows) {
    for (const value of Object.values(row.dailyValues)) {
      if (value !== null && value !== undefined && !VALID_WARNING_CODES.has(value)) {
        invalidCodes.add(value);
      }
    }
  }
  return Array.from(invalidCodes).sort((a, b) => a - b);
}

export interface WarningSheetRow {
  district: string;
  dailyValues: { [day: number]: number | null };
}

export interface ParsedWarningData {
  rows: WarningSheetRow[];
  daysInMonth: number;
}

/**
 * Parse Warning Excel file
 * @param fileBuffer - Excel file buffer
 * @param year - Year for the data
 * @param month - Month number (1-12)
 * @returns Parsed warning data
 */
export function parseWarningSheet(
  fileBuffer: Buffer,
  year: number,
  month: number
): ParsedWarningData {
  // Read Excel file
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON (array of arrays)
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (!data || data.length === 0) {
    throw new Error('Empty Excel file');
  }
  
  // Calculate expected days in month
  const daysInMonth = getDaysInMonth(year, month);
  
  // Find header row (should contain "District" and day numbers)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row.length > 0) {
      const firstCell = String(row[0] || '').toLowerCase().trim();
      if (firstCell.includes('district')) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  if (headerRowIndex === -1) {
    throw new Error('Could not find header row with "District" column');
  }
  
  // Validate header has day columns (1, 2, 3, ...)
  const headerRow = data[headerRowIndex];
  const expectedColumns = daysInMonth + 1; // District column + day columns
  
  if (headerRow.length < expectedColumns) {
    throw new Error(
      `Expected at least ${expectedColumns} columns (District + ${daysInMonth} days), found ${headerRow.length}`
    );
  }
  
  // Parse data rows
  const rows: WarningSheetRow[] = [];
  
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    
    if (!row || row.length === 0) continue;
    
    // Get district name from first column
    const districtName = String(row[0] || '').trim();
    
    if (!districtName) continue;
    
    // Skip rows that look like headers, separators, or regional groupings
    const skipPatterns = [
      'district', 'total', 'average', 'sum', '---', '===',
      'north konkan', 'south konkan', 'madhya maharashtra', 'marathwada', 'vidarbha'
    ];
    
    const lowerDistrict = districtName.toLowerCase();
    if (skipPatterns.some(pattern => lowerDistrict.includes(pattern))) {
      continue;
    }
    
    // Extract daily values
    const dailyValues: { [day: number]: number | null } = {};
    
    for (let day = 1; day <= daysInMonth; day++) {
      const columnIndex = day; // Column 0 is district, column 1 is day 1, etc.
      const cellValue = row[columnIndex];
      
      if (cellValue === undefined || cellValue === null || cellValue === '') {
        dailyValues[day] = null;
      } else {
        const numValue = parseFloat(String(cellValue));
        if (isNaN(numValue)) {
          dailyValues[day] = null;
        } else {
          // Extract base code (integer part) for decimal codes like 5.1, 27.2
          dailyValues[day] = Math.floor(numValue);
        }
      }
    }
    
    rows.push({
      district: districtName.toUpperCase(),
      dailyValues
    });
  }
  
  if (rows.length === 0) {
    throw new Error('No valid district data found in Excel file');
  }
  
  return {
    rows,
    daysInMonth
  };
}

/**
 * Extract day-wise data from parsed warning sheet
 * CRITICAL: Normalizes district names and aggregates Ghats data
 * @param parsedData - Parsed warning data
 * @param day - Day number (1-31)
 * @returns District-wise warning codes for the specified day (normalized)
 */
export function extractDayData(
  parsedData: ParsedWarningData,
  day: number
): { [district: string]: number | null } {
  const { normalizeDistrictData } = require('./districtNormalizer');
  
  const rawResult: { [district: string]: number | null } = {};
  
  for (const row of parsedData.rows) {
    rawResult[row.district] = row.dailyValues[day] || null;
  }
  
  // CRITICAL: Normalize district names and aggregate Ghats
  return normalizeDistrictData(rawResult);
}

/**
 * Multi-Sheet Warning Data Interface
 * Represents a warning file with all 5 lead days in separate sheets
 */
export interface MultiSheetWarningData {
  year: number;
  month: number;
  sheets: {
    D1: ParsedWarningData;
    D2: ParsedWarningData;
    D3: ParsedWarningData;
    D4: ParsedWarningData;
    D5: ParsedWarningData;
  };
}

/**
 * Parse Multi-Sheet Warning Excel file
 * Expects a single Excel file with 5 sheets named: Day1, Day2, Day3, Day4, Day5
 * 
 * @param fileBuffer - Excel file buffer
 * @param year - Year for the data
 * @param month - Month number (1-12)
 * @returns Parsed multi-sheet warning data with all 5 lead days
 */
export function parseMultiSheetWarningFile(
  fileBuffer: Buffer,
  year: number,
  month: number
): MultiSheetWarningData {
  // Read Excel file
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // Define required sheet names and their mapping to lead days
  const requiredSheets = {
    'Day1': 'D1',
    'Day2': 'D2',
    'Day3': 'D3',
    'Day4': 'D4',
    'Day5': 'D5'
  };
  
  // Validate that all required sheets are present
  const missingSheets: string[] = [];
  for (const sheetName of Object.keys(requiredSheets)) {
    if (!workbook.SheetNames.includes(sheetName)) {
      missingSheets.push(sheetName);
    }
  }
  
  if (missingSheets.length > 0) {
    throw new Error(
      `Missing required sheets: ${missingSheets.join(', ')}. ` +
      `Excel file must contain exactly 5 sheets named: Day1, Day2, Day3, Day4, Day5`
    );
  }
  
  // Parse each sheet
  const sheets: any = {};
  
  for (const [sheetName, leadDay] of Object.entries(requiredSheets)) {
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found in workbook`);
    }
    
    // Convert to JSON (array of arrays)
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (!data || data.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty`);
    }
    
    // Parse the sheet data using the same logic as single-sheet parser
    const parsedSheet = parseSheetData(data, year, month, sheetName);
    sheets[leadDay] = parsedSheet;
  }
  
  return {
    year,
    month,
    sheets: {
      D1: sheets.D1,
      D2: sheets.D2,
      D3: sheets.D3,
      D4: sheets.D4,
      D5: sheets.D5
    }
  };
}

/**
 * Internal helper: Parse sheet data (shared logic for single and multi-sheet parsing)
 */
function parseSheetData(
  data: any[][],
  year: number,
  month: number,
  sheetName: string = 'default'
): ParsedWarningData {
  // Calculate expected days in month
  const daysInMonth = getDaysInMonth(year, month);
  
  // Find header row (should contain "District" and day numbers)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row.length > 0) {
      const firstCell = String(row[0] || '').toLowerCase().trim();
      if (firstCell.includes('district')) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  if (headerRowIndex === -1) {
    throw new Error(`Could not find header row with "District" column in sheet "${sheetName}"`);
  }
  
  // Validate header has day columns (1, 2, 3, ...)
  const headerRow = data[headerRowIndex];
  const expectedColumns = daysInMonth + 1; // District column + day columns
  
  if (headerRow.length < expectedColumns) {
    throw new Error(
      `Sheet "${sheetName}": Expected at least ${expectedColumns} columns (District + ${daysInMonth} days), found ${headerRow.length}`
    );
  }
  
  // Parse data rows
  const rows: WarningSheetRow[] = [];
  
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    
    if (!row || row.length === 0) continue;
    
    // Get district name from first column
    const districtName = String(row[0] || '').trim();
    
    if (!districtName) continue;
    
    // Skip rows that look like headers, separators, or regional groupings
    const skipPatterns = [
      'district', 'total', 'average', 'sum', '---', '===',
      'north konkan', 'south konkan', 'madhya maharashtra', 'marathwada', 'vidarbha'
    ];
    
    const lowerDistrict = districtName.toLowerCase();
    if (skipPatterns.some(pattern => lowerDistrict.includes(pattern))) {
      continue;
    }
    
    // Extract daily values
    const dailyValues: { [day: number]: number | null } = {};
    
    for (let day = 1; day <= daysInMonth; day++) {
      const columnIndex = day; // Column 0 is district, column 1 is day 1, etc.
      const cellValue = row[columnIndex];
      
      if (cellValue === undefined || cellValue === null || cellValue === '') {
        dailyValues[day] = null;
      } else {
        const numValue = parseFloat(String(cellValue));
        if (isNaN(numValue)) {
          dailyValues[day] = null;
        } else {
          // Extract base code (integer part) for decimal codes like 5.1, 27.2
          dailyValues[day] = Math.floor(numValue);
        }
      }
    }
    
    rows.push({
      district: districtName.toUpperCase(),
      dailyValues
    });
  }
  
  if (rows.length === 0) {
    throw new Error(`No valid district data found in sheet "${sheetName}"`);
  }
  
  return {
    rows,
    daysInMonth
  };
}

