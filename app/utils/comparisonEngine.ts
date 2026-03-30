/**
 * Comparison Engine - Warning vs Realised Analysis
 * Performs verification analysis using file-based data
 * CRITICAL: Uses IMD's shifted verification methodology (D+1 alignment)
 * NOW USES: Admin-configurable dual/multi mode classification
 */

import {
  loadWarningForDate,
  loadRealisedForDate,
  loadDataForDateRange,
  type WarningData,
  type RealisedData
} from './unifiedDataLoader';
import { calculateVerificationDate, parseDate, formatDate } from './dateUtils';
import {
  loadRainfallConfig,
  classifyRainfall,
  classifyCode,
  getLevelByLabel,
  getParentCategoryByLabel
} from './rainfallConfig';

export interface Comparison {
  date: string;
  district: string;
  forecastCode: number | null;
  forecastClassification: string; // L, H, VH, XH (or custom)
  forecastLevel: number;
  realisedRainfall: number | null;
  realisedClassification: string; // L, H, VH, XH (or custom)
  realisedLevel: number;
  match: boolean;
  type: 'Correct' | 'False Alarm' | 'Missed Event' | 'Correct Negative';
}

export interface AccuracyStats {
  totalPredictions: number;
  correct: number;
  falseAlarms: number;
  missedEvents: number;
  correctNegatives: number;
  accuracy: number;
  pod: number; // Probability of Detection
  far: number; // False Alarm Ratio
  csi: number; // Critical Success Index
  bias: number; // Bias Score
}

/**
 * Classify rainfall using current mode (dual or multi)
 * Accepts an optional dualThresholdOverride so UI can pass a custom threshold
 */
function classifyRainfallValue(rainfall: number, config: any, dualThresholdOverride?: number, modeOverride?: 'dual' | 'multi'): string {
  const mode = modeOverride || config.mode;
  if (mode === 'dual') {
    const dual = config.classifications.dual;
    const threshold = dualThresholdOverride !== undefined ? dualThresholdOverride : dual.threshold;
    return rainfall >= threshold ? dual.labels.above : dual.labels.below;
  } else {
    const items = [...config.classifications.multi.items]
      .filter(i => i.enabled)
      .sort((a, b) => b.thresholdMm - a.thresholdMm);
    
    for (const item of items) {
      if (rainfall >= item.thresholdMm) return item.variableName;
    }
    return items.length > 0 ? items[items.length - 1].variableName : 'L';
  }
}

/**
 * Classify warning code using current mode (dual or multi)
 * Accepts an optional dualThresholdOverride - in dual mode, codes >= 5 map to heavy (same logic)
 */
function classifyWarningCode(code: number, config: any, dualThresholdOverride?: number, modeOverride?: 'dual' | 'multi'): string {
  const mode = modeOverride || config.mode;
  if (mode === 'dual') {
    const dual = config.classifications.dual;
    // Use user-defined heavy codes if available, otherwise default to legacy >= 5
    const heavyCodes = dual.heavyCodes || [5, 27, 33, 37, 45, 56];
    return heavyCodes.includes(code) ? dual.labels.above : dual.labels.below;
  } else {
    const item = config.classifications.multi.items.find((i: any) => i.codes.includes(code));
    if (item) return item.variableName;
    
    // Fallback: search for lowest enabled item if code not found
    const items = config.classifications.multi.items.filter((i: any) => i.enabled).sort((a: any, b: any) => a.order - b.order);
    return items.length > 0 ? items[0].variableName : 'L';
  }
}

/**
 * Helper to get level and parent category from label
 * FIXED: accepts modeOverride so HRV-2 can force multi-mode resolution
 * even when global config.mode is 'dual'.
 */
function getInfoForLabel(label: string, config: any, modeOverride?: 'dual' | 'multi'): { level: number; pc: 'LOW' | 'HEAVY' } {
  const mode = modeOverride || config.mode;
  if (mode === 'dual') {
    const isAbove = label === config.classifications.dual.labels.above;
    return {
      level: isAbove ? 2 : 1,
      pc: isAbove ? 'HEAVY' : 'LOW'
    };
  } else {
    const item = config.classifications.multi.items.find((i: any) => i.variableName === label);
    if (item) {
      // Fallback for parentCategory based on IMD standards if missing
      // Use the Dual Mode threshold as a reference if available
      let pc = item.parentCategory;
      if (!pc) {
        const dualThreshold = config.classifications.dual.threshold || 64.5;
        pc = item.thresholdMm >= dualThreshold ? 'HEAVY' : 'LOW';
      }
      return { level: item.level, pc };
    }
    return { level: 1, pc: 'LOW' };
  }
}

/**
 * Check if two classifications match for verification
 * In both dual and multi mode, exact label match = correct
 */
function classificationsMatch(forecast: string, realised: string): boolean {
  return forecast === realised;
}

/**
 * CRITICAL: Compare warning vs realised for a single ISSUE date
 * NEW LOGIC: All realized data comes from selectedDate + 1, warnings go backwards
 * 
 * @param issueYear - Issue date year (when forecast was issued)
 * @param issueMonth - Issue date month
 * @param issueDay - Issue date day
 * @param leadDay - Lead day (D1, D2, D3, D4, D5)
 * @param selectedYear - Optional: Selected date year (for new verification logic)
 * @param selectedMonth - Optional: Selected date month (for new verification logic)
 * @param selectedDay - Optional: Selected date day (for new verification logic)
 * @param dualThresholdOverride - Optional: Override dual mode threshold in mm
 * @returns Array of comparisons for all districts
 */
export async function compareForDate(
  issueYear: number,
  issueMonth: number,
  issueDay: number,
  leadDay: string,
  selectedYear?: number,
  selectedMonth?: number,
  selectedDay?: number,
  dualThresholdOverride?: number,
  modeOverride?: 'dual' | 'multi'
): Promise<Comparison[]> {
  const issueDateStr = formatDate(issueYear, issueMonth, issueDay);
  let verificationDate;
  // NEW LOGIC: Use provided selected date if available, otherwise calculate
  // Standard logic is now Issue Date + 1 for all lead times (set in dateUtils)
  if (selectedYear && selectedMonth && selectedDay) {
    verificationDate = {
      year: selectedYear,
      month: selectedMonth,
      day: selectedDay
    };
  } else {
    const calcResult = calculateVerificationDate(issueYear, issueMonth, issueDay, leadDay);
    verificationDate = {
      year: calcResult.year,
      month: calcResult.month,
      day: calcResult.day
    };
  }

  // Load configuration ONCE per request for all districts
  const config = await loadRainfallConfig();

  // Load warning data from ISSUE DATE (when forecast was issued)
  const warning = await loadWarningForDate(
    issueYear,
    issueMonth,
    issueDay,
    leadDay
  );

  // Load realised data from VERIFICATION DATE
  const realised = await loadRealisedForDate(
    verificationDate.year,
    verificationDate.month,
    verificationDate.day
  );

  if (!warning || !realised) {
    console.log(`[compareForDate] Missing data for ${issueDateStr}: warning=${!!warning}, realised=${!!realised}`);
    return [];
  }

  const comparisons: Comparison[] = [];

  // Get all districts from both datasets
  const warningDistricts = warning?.districts || {};
  const realisedDistricts = realised?.districts || {};

  const allDistricts = new Set([
    ...Object.keys(warningDistricts),
    ...Object.keys(realisedDistricts)
  ]);

  if (allDistricts.size === 0) {
    console.log(`[compareForDate] No districts found for ${issueDateStr}`);
  }

  for (const district of allDistricts) {
    const rawWarningCode = warningDistricts[district];
    const rawRealisedRainfall = realisedDistricts[district];

    // Skip if both are null/undefined
    if (rawWarningCode == null && rawRealisedRainfall == null) {
      continue;
    }

    const forecastClass = rawWarningCode != null ? classifyWarningCode(rawWarningCode, config, dualThresholdOverride, modeOverride) : 'L';
    const realisedClass = rawRealisedRainfall != null ? classifyRainfallValue(rawRealisedRainfall, config, dualThresholdOverride, modeOverride) : 'L';

    // FIXED: pass modeOverride so HRV-2 multi-mode level/category lookups are correct
    const fInfo = getInfoForLabel(forecastClass, config, modeOverride);
    const rInfo = getInfoForLabel(realisedClass, config, modeOverride);

    const forecastLevel = fInfo.level;
    const realisedLevel = rInfo.level;
    const forecastPC = fInfo.pc;
    const realisedPC = rInfo.pc;

    let type: 'Correct' | 'False Alarm' | 'Missed Event' | 'Correct Negative';

    const match = forecastLevel === realisedLevel;

    if (forecastLevel === realisedLevel) {
      if (forecastPC === 'HEAVY') {
        type = 'Correct';
      } else {
        type = 'Correct Negative';
      }
    } else if (forecastLevel > realisedLevel) {
      type = 'False Alarm';
    } else {
      type = 'Missed Event';
    }

    comparisons.push({
      date: issueDateStr,
      district,
      forecastCode: rawWarningCode,
      forecastClassification: forecastClass,
      forecastLevel: forecastLevel,
      realisedRainfall: rawRealisedRainfall,
      realisedClassification: realisedClass,
      realisedLevel: realisedLevel,
      match,
      type
    });
  }

  return comparisons;
}

/**
 * CRITICAL: Compare warning vs realised for a date range
 * Uses IMD's shifted verification methodology for each issue date
 */
export async function compareForDateRange(
  startDate: string,
  endDate: string,
  leadDay: string,
  dualThresholdOverride?: number,
  modeOverride?: 'dual' | 'multi'
): Promise<Comparison[]> {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const allComparisons: Comparison[] = [];

  // Iterate through ISSUE date range (not target dates)
  const currentDate = new Date(start.year, start.month - 1, start.day);
  const endDateObj = new Date(end.year, end.month - 1, end.day);

  while (currentDate <= endDateObj) {
    const issueYear = currentDate.getFullYear();
    const issueMonth = currentDate.getMonth() + 1;
    const issueDay = currentDate.getDate();

    // Get comparisons for this issue date
    const comparisons = await compareForDate(issueYear, issueMonth, issueDay, leadDay, undefined, undefined, undefined, dualThresholdOverride, modeOverride);
    allComparisons.push(...comparisons);

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return allComparisons;
}

/**
 * Calculate accuracy statistics from comparisons
 * VALIDATED: Formulas match meteorological standards
 * 
 * Contingency Table:
 * - H (Hits): Heavy forecast AND heavy observed
 * - M (Misses): No heavy forecast BUT heavy observed  
 * - F (False Alarms): Heavy forecast BUT not heavy observed
 * - CN (Correct Non-Events): No heavy forecast AND no heavy observed
 * 
 * Skill Scores:
 * - POD = H / (H + M)  [Probability of Detection]
 * - FAR = F / (H + F)  [False Alarm Ratio]
 * - CSI = H / (H + M + F)  [Critical Success Index]
 * - Bias = (H + F) / (H + M)  [Frequency Bias]
 */
export function calculateAccuracy(comparisons: Comparison[]): AccuracyStats {
  if (comparisons.length === 0) {
    return {
      totalPredictions: 0,
      correct: 0,
      falseAlarms: 0,
      missedEvents: 0,
      correctNegatives: 0,
      accuracy: 0,
      pod: 0,
      far: 0,
      csi: 0,
      bias: 0
    };
  }

  // Count each type
  const correct = comparisons.filter(c => c.type === 'Correct').length;
  const falseAlarms = comparisons.filter(c => c.type === 'False Alarm').length;
  const missedEvents = comparisons.filter(c => c.type === 'Missed Event').length;
  const correctNegatives = comparisons.filter(c => c.type === 'Correct Negative').length;

  const totalPredictions = comparisons.length;
  const accuracy = ((correct + correctNegatives) / totalPredictions) * 100;

  // Contingency table values (using meteorological terminology)
  const H = correct; // Hits: Heavy forecast AND heavy observed
  const M = missedEvents; // Misses: No heavy forecast BUT heavy observed
  const F = falseAlarms; // False Alarms: Heavy forecast BUT not heavy observed
  const CN = correctNegatives; // Correct Negatives: No heavy forecast AND no heavy observed

  // Calculate skill scores with division-by-zero guards
  // POD = H / (H + M) - Probability of Detection
  const pod = (H + M) > 0 ? H / (H + M) : 0;

  // FAR = F / (H + F) - False Alarm Ratio
  // Special case: If (H + F) = 0, FAR = 0 (not NaN)
  const far = (H + F) > 0 ? F / (H + F) : 0;

  // CSI = H / (H + M + F) - Critical Success Index
  const csi = (H + M + F) > 0 ? H / (H + M + F) : 0;

  // Bias = (H + F) / (H + M) - Frequency Bias
  const bias = (H + M) > 0 ? (H + F) / (H + M) : 0;

  return {
    totalPredictions,
    correct: H,
    falseAlarms: F,
    missedEvents: M,
    correctNegatives: CN,
    accuracy,
    pod,
    far,
    csi,
    bias
  };
}

/**
 * Compare across multiple lead days
 */
export async function compareMultipleLeadDays(
  startDate: string,
  endDate: string,
  leadDays: string[]
): Promise<Map<string, { comparisons: Comparison[]; stats: AccuracyStats }>> {
  const results = new Map<string, { comparisons: Comparison[]; stats: AccuracyStats }>();

  for (const leadDay of leadDays) {
    const comparisons = await compareForDateRange(startDate, endDate, leadDay);
    const stats = calculateAccuracy(comparisons);
    results.set(leadDay, { comparisons, stats });
  }

  return results;
}

/**
 * Calculate binary accuracy statistics for a specific category
 * Treated as a binary event: Category vs Not Category
 */
export function calculateCategoryBinaryAccuracy(
  comparisons: Comparison[],
  category: string
): AccuracyStats {
  if (comparisons.length === 0) {
    return {
      totalPredictions: 0,
      correct: 0,
      falseAlarms: 0,
      missedEvents: 0,
      correctNegatives: 0,
      accuracy: 0,
      pod: 0,
      far: 0,
      csi: 0,
      bias: 0
    };
  }

  // Hit (H): Forecast = Category AND Observed = Same Category
  const H = comparisons.filter(
    c => c.forecastClassification === category && c.realisedClassification === category
  ).length;

  // Miss (M): Observed = Category BUT Forecast ≠ Category
  const M = comparisons.filter(
    c => c.forecastClassification !== category && c.realisedClassification === category
  ).length;

  // False Alarm (F): Forecast = Category BUT Observed ≠ Category
  const F = comparisons.filter(
    c => c.forecastClassification === category && c.realisedClassification !== category
  ).length;

  // Correct Negative (CN): All other cases
  const CN = comparisons.filter(
    c => c.forecastClassification !== category && c.realisedClassification !== category
  ).length;

  const totalPredictions = comparisons.length;
  const accuracy = ((H + CN) / totalPredictions) * 100;

  // Skills Scores
  const pod = (H + M) > 0 ? H / (H + M) : 0;
  const far = (H + F) > 0 ? F / (H + F) : 0;
  const csi = (H + M + F) > 0 ? H / (H + M + F) : 0;
  const bias = (H + M) > 0 ? (H + F) / (H + M) : 0;

  return {
    totalPredictions,
    correct: H,
    falseAlarms: F,
    missedEvents: M,
    correctNegatives: CN,
    accuracy,
    pod,
    far,
    csi,
    bias
  };
}

/**
 * Get district-wise accuracy
 */
export function getDistrictWiseAccuracy(
  comparisons: Comparison[]
): Map<string, AccuracyStats> {
  const districtMap = new Map<string, Comparison[]>();

  // Group by district
  for (const comparison of comparisons) {
    if (!districtMap.has(comparison.district)) {
      districtMap.set(comparison.district, []);
    }
    districtMap.get(comparison.district)!.push(comparison);
  }

  // Calculate stats for each district
  const districtStats = new Map<string, AccuracyStats>();
  for (const [district, districtComparisons] of districtMap.entries()) {
    districtStats.set(district, calculateAccuracy(districtComparisons));
  }

  return districtStats;
}
