import { NextRequest, NextResponse } from 'next/server';
import { compareForDateRange, calculateCategoryBinaryAccuracy } from '@/app/utils/comparisonEngine';

/**
 * POST /api/verification/category-wise
 * Run category-specific binary verification
 * 
 * Categories: H (Heavy), VH (Very Heavy), XH (Extremely Heavy)
 * 
 * Supports three modes:
 * 1. Overview mode (no selectedDay, no selectedDistrict):
 *    Returns per-lead-day category metrics
 * 2. District-list mode (selectedDay, no selectedDistrict):
 *    Returns district-wise category metrics for a specific day
 * 3. District-detail mode (selectedDay + selectedDistrict):
 *    Returns per-date raw comparisons per category for formula audit
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, selectedDay, selectedDistrict } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    const categories = ['H', 'VH', 'XH'] as const;

    // MODE 3: District-detail — per-date raw comparisons for formula audit
    if (selectedDay && selectedDistrict) {
      const leadDayCode = selectedDay;
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, undefined, 'multi');
      const districtComparisons = comparisons.filter(c => c.district === selectedDistrict);

      const categoryDetails: any = {};
      for (const cat of categories) {
        const H = districtComparisons.filter(c => c.forecastClassification === cat && c.realisedClassification === cat).length;
        const M = districtComparisons.filter(c => c.forecastClassification !== cat && c.realisedClassification === cat).length;
        const F = districtComparisons.filter(c => c.forecastClassification === cat && c.realisedClassification !== cat).length;
        const CN = districtComparisons.filter(c => c.forecastClassification !== cat && c.realisedClassification !== cat).length;

        const POD = (H + M) > 0 ? H / (H + M) : 0;
        const FAR = (H + F) > 0 ? F / (H + F) : 0;
        const CSI = (H + M + F) > 0 ? H / (H + M + F) : 0;
        const Bias = (H + M) > 0 ? (H + F) / (H + M) : 0;

        // Build row-level data for this category
        const rows = districtComparisons.map(c => ({
          date: c.date,
          forecastCode: c.forecastCode,
          forecastClass: c.forecastClassification,
          realisedMm: c.realisedRainfall,
          realisedClass: c.realisedClassification,
          // Compute per-row outcome for THIS category
          outcome: c.forecastClassification === cat && c.realisedClassification === cat ? 'Hit'
            : c.forecastClassification !== cat && c.realisedClassification === cat ? 'Miss'
            : c.forecastClassification === cat && c.realisedClassification !== cat ? 'False Alarm'
            : 'Correct Negative'
        }));

        categoryDetails[cat] = { H, M, F, CN, POD, FAR, CSI, Bias, rows };
      }

      return NextResponse.json({
        success: true,
        district: selectedDistrict,
        selectedDay,
        start_date: startDate,
        end_date: endDate,
        categories: categoryDetails
      });
    }

    // MODE 2: District-list for a specific day
    if (selectedDay) {
      const leadDayCode = selectedDay;
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, undefined, 'multi');

      // Group by district
      const districtMap = new Map<string, typeof comparisons>();
      for (const comp of comparisons) {
        if (!districtMap.has(comp.district)) districtMap.set(comp.district, []);
        districtMap.get(comp.district)!.push(comp);
      }

      const categoryResults: any = {};
      for (const cat of categories) {
        const districtWise: any = {};
        for (const [district, districtComps] of districtMap.entries()) {
          const stats = calculateCategoryBinaryAccuracy(districtComps, cat);
          districtWise[district] = {
            H: stats.correct,
            M: stats.missedEvents,
            F: stats.falseAlarms,
            CN: stats.correctNegatives,
            Total: stats.totalPredictions,
            POD: stats.pod,
            FAR: stats.far,
            CSI: stats.csi,
            Bias: stats.bias
          };
        }
        categoryResults[cat] = districtWise;
      }

      return NextResponse.json({
        success: true,
        start_date: startDate,
        end_date: endDate,
        selectedDay,
        categories: categoryResults
      });
    }

    // MODE 1: Overview — all 5 lead days
    const leadDays = ['Day-1', 'Day-2', 'Day-3', 'Day-4', 'Day-5'];
    const leadTimeResults: any = {};

    for (const leadDay of leadDays) {
      const leadDayCode = leadDay.replace('Day-', 'D');
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, undefined, 'multi');

      const categoryStats: any = {};
      for (const cat of categories) {
        const stats = calculateCategoryBinaryAccuracy(comparisons, cat);
        categoryStats[cat] = {
          H: stats.correct,
          M: stats.missedEvents,
          F: stats.falseAlarms,
          CN: stats.correctNegatives,
          Total: stats.totalPredictions,
          POD: stats.pod,
          FAR: stats.far,
          CSI: stats.csi,
          Bias: stats.bias
        };
      }
      leadTimeResults[leadDay] = categoryStats;
    }

    return NextResponse.json({
      success: true,
      start_date: startDate,
      end_date: endDate,
      lead_times: leadTimeResults
    });

  } catch (error: any) {
    console.error('Category-wise verification error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run verification', details: error.toString() },
      { status: 500 }
    );
  }
}
