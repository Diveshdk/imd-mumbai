import { NextRequest, NextResponse } from 'next/server';
import { compareForDate, calculateAccuracy } from '@/app/utils/comparisonEngine';
import { parseDate } from '@/app/utils/dateUtils';

/**
 * GET /api/verification/[date]
 * Lazy-loads verification data for a specific date
 * Calculates on-demand from file-based storage
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ date: string }> }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') as 'dual' | 'multi' | null;
    // Await params for Next.js 15+
    const { date } = await context.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Parse date - this is the SELECTED DATE (e.g., June 11)
    const { year, month, day } = parseDate(date);
    
    // FINAL LOGIC:
    // When 11th June is selected:
    // 1. Forecast/Warning Source: Use the SELECTED DATE (June 11) for ALL lead days (D1-D5).
    //    This fetches data/warning/D[1-5]/2025-06-11.
    // 2. Realized/Observed Data: Use the SELECTED DATE + 1 (June 12) for ALL lead days.
    //    All tables (D1-D5) will show the same observed data from June 12.
    
    // NEW LOGIC:
    // - Realized data is always from SELECTED DATE + 1 (e.g., June 12)
    // - Warning data is always from the SAME SELECTED DATE (e.g., June 11)
    //   but fetched from different lead-day folders:
    //   D1 = Forecast issued on June 11
    //   D2 = Forecast issued on June 11
    //   ... etc.
  
    // Calculate verification for all lead days
    const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'];
    const leadTimeResults: any = {};
    const allVerifications: any[] = [];
    
    // Target date for REALIZED data (Selected Date + 1)
    const targetDate = new Date(year, month - 1, day);
    targetDate.setDate(targetDate.getDate() + 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();
    
    for (let i = 0; i < leadDays.length; i++) {
      const leadDay = leadDays[i];
      const leadDayName = `day${i + 1}`;
      
      // WARNING SOURCE: Always use the SELECTED DATE (e.g., June 11)
      // REALIZED SOURCE: Always use the SELECTED DATE + 1 (calculated above as targetYear/Month/Day)
      const comparisons = await compareForDate(year, month, day, leadDay, targetYear, targetMonth, targetDay, undefined, mode || undefined);
      const stats = calculateAccuracy(comparisons);
      
      // Format verifications for UI - use new comparison structure
      const verifications = comparisons.map(c => ({
        district: c.district,
        date: c.date,
        forecastCode: c.forecastCode,
        forecastClassification: c.forecastClassification,
        forecastLevel: c.forecastLevel,
        realisedRainfall: c.realisedRainfall,
        realisedClassification: c.realisedClassification,
        realisedLevel: c.realisedLevel,
        match: c.match,
        type: c.type
      }));
      
      leadTimeResults[leadDayName] = {
        verifications,
        statistics: {
          hits: stats.correct,
          misses: stats.missedEvents,
          falseAlarms: stats.falseAlarms,
          correctNegatives: stats.correctNegatives,
          total: stats.totalPredictions,
          accuracy: stats.accuracy
        }
      };
      
      allVerifications.push(...verifications);
    }
    
    // Calculate overall statistics
    const allComparisons = [];
    for (let i = 0; i < leadDays.length; i++) {
      const leadDay = leadDays[i];
      
      // Same logic for overall stats
      const comparisons = await compareForDate(year, month, day, leadDay, targetYear, targetMonth, targetDay, undefined, mode || undefined);
      allComparisons.push(...comparisons);
    }
    const overallStats = calculateAccuracy(allComparisons);
    
    const result = {
      success: true,
      date,
      cached: false, // TODO: Add caching later
      day1: leadTimeResults.day1,
      day2: leadTimeResults.day2,
      day3: leadTimeResults.day3,
      day4: leadTimeResults.day4,
      day5: leadTimeResults.day5,
      overall: {
        verifications: allVerifications,
        statistics: {
          hits: overallStats.correct,
          misses: overallStats.missedEvents,
          falseAlarms: overallStats.falseAlarms,
          correctNegatives: overallStats.correctNegatives,
          total: overallStats.totalPredictions,
          accuracy: overallStats.accuracy
        }
      }
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Date verification error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to get date verification',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
