import { NextRequest, NextResponse } from 'next/server';
import { compareForDateRange, calculateAccuracy, getDistrictWiseAccuracy } from '@/app/utils/comparisonEngine';
import { loadRainfallConfig } from '@/app/utils/rainfallConfig';

/**
 * POST /api/verification/heavy-rainfall
 * Run heavy rainfall verification using file-based storage
 * 
 * Supports three modes:
 * 1. Overview mode (no selectedDay, no selectedDistrict): Returns stats for all 5 lead days
 * 2. Detailed mode (with selectedDay): Returns district-wise stats for specific day
 * 3. District detail mode (selectedDay + selectedDistrict): Returns per-date raw comparisons for formula audit
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = await loadRainfallConfig();
    const { 
      threshold = config.classifications.dual.threshold, 
      startDate, 
      endDate, 
      selectedDay, 
      selectedDistrict 
    } = body;

    // Validate inputs
    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Mode 3: Per-district date-by-date breakdown for formula audit
    if (selectedDay && selectedDistrict) {
      const leadDayCode = selectedDay;
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, threshold);
      
      // Filter to only this district
      const districtComparisons = comparisons.filter(c => c.district === selectedDistrict);

      if (districtComparisons.length === 0) {
        return NextResponse.json({
          success: true,
          district: selectedDistrict,
          selectedDay,
          start_date: startDate,
          end_date: endDate,
          rows: [],
          totals: { H: 0, M: 0, F: 0, CN: 0, POD: 0, FAR: 0, CSI: 0, Bias: 0 }
        });
      }

      // Build per-date rows
      const rows = districtComparisons.map(c => ({
        date: c.date,
        forecastCode: c.forecastCode,
        forecastClass: c.forecastClassification,
        realisedMm: c.realisedRainfall,
        realisedClass: c.realisedClassification,
        type: c.type
      }));

      // Aggregate totals
      const H = districtComparisons.filter(c => c.type === 'Correct').length;
      const M = districtComparisons.filter(c => c.type === 'Missed Event').length;
      const F = districtComparisons.filter(c => c.type === 'False Alarm').length;
      const CN = districtComparisons.filter(c => c.type === 'Correct Negative').length;

      const POD = (H + M) > 0 ? H / (H + M) : 0;
      const FAR = (H + F) > 0 ? F / (H + F) : 0;
      const CSI = (H + M + F) > 0 ? H / (H + M + F) : 0;
      const Bias = (H + M) > 0 ? (H + F) / (H + M) : 0;

      return NextResponse.json({
        success: true,
        district: selectedDistrict,
        selectedDay,
        start_date: startDate,
        end_date: endDate,
        rows,
        totals: { H, M, F, CN, POD, FAR, CSI, Bias }
      });
    }

    // Mode 2: Detailed view for specific day (district-wise summary)
    if (selectedDay) {
      const leadDayCode = selectedDay; // Already in format "D1", "D2", etc.
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, threshold);
      
      // Calculate district-wise statistics for this specific day
      const districtStats = getDistrictWiseAccuracy(comparisons);
      
      const districtWise: any = {};
      for (const [district, stats] of districtStats.entries()) {
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

      return NextResponse.json({
        success: true,
        threshold,
        start_date: startDate,
        end_date: endDate,
        selectedDay,
        district_wise: districtWise
      });
    }

    // Mode 1: Overview mode - stats for all 5 lead days
    const leadDays = ['Day-1', 'Day-2', 'Day-3', 'Day-4', 'Day-5'];
    const leadTimeResults: any = {};

    for (const leadDay of leadDays) {
      const leadDayCode = leadDay.replace('Day-', 'D');
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, threshold);
      const stats = calculateAccuracy(comparisons);

      leadTimeResults[leadDay] = {
        scores: {
          H: stats.correct,
          M: stats.missedEvents,
          F: stats.falseAlarms,
          CN: stats.correctNegatives,
          Total: stats.totalPredictions,
          POD: stats.pod,
          FAR: stats.far,
          CSI: stats.csi,
          Bias: stats.bias
        },
        count: stats.totalPredictions
      };
    }

    return NextResponse.json({
      success: true,
      threshold,
      start_date: startDate,
      end_date: endDate,
      lead_times: leadTimeResults
    });

  } catch (error: any) {
    console.error('Heavy rainfall verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to run verification',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
