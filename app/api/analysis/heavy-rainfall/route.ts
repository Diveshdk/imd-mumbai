import { NextRequest, NextResponse } from 'next/server';
import { compareForDateRange, calculateAccuracy, getDistrictWiseAccuracy } from '@/app/utils/comparisonEngine';
import { loadRainfallConfig } from '@/app/utils/rainfallConfig';

/**
 * POST /api/analysis/heavy-rainfall
 * Provides analysis data for graph visualization
 * 
 * Supports two modes:
 * 1. Day-wise mode: Returns district-wise metrics for selected day
 * 2. Comparison mode: Returns day-wise aggregate metrics for all 5 days
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = await loadRainfallConfig();
    const { 
      mode, 
      selectedDay, 
      threshold = config.classifications.dual.threshold, 
      startDate, 
      endDate,
      configMode
    } = body;

    // Validate inputs
    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    if (!mode || (mode !== 'day-wise' && mode !== 'comparison')) {
      return NextResponse.json(
        { success: false, error: 'Mode must be either "day-wise" or "comparison"' },
        { status: 400 }
      );
    }

    // Mode 1: Day-wise analysis (district-wise metrics for selected day)
    if (mode === 'day-wise') {
      if (!selectedDay) {
        return NextResponse.json(
          { success: false, error: 'selectedDay is required for day-wise mode' },
          { status: 400 }
        );
      }

      const leadDayCode = selectedDay; // Already in format "D1", "D2", etc.
      const comparisons = await compareForDateRange(startDate, endDate, leadDayCode, threshold, configMode);
      
      // Calculate district-wise statistics
      const districtStats = getDistrictWiseAccuracy(comparisons);
      
      const districts: any = {};
      for (const [district, stats] of districtStats.entries()) {
        const correctness = stats.accuracy; // Already in percentage (0-100)
        
        districts[district] = {
          correctness: correctness / 100, // Convert to 0-1 range for consistency
          pod: stats.pod,
          far: stats.far,
          csi: stats.csi,
          bias: stats.bias,
          h: stats.correct,
          m: stats.missedEvents,
          f: stats.falseAlarms,
          cn: stats.correctNegatives,
          total: stats.totalPredictions
        };
      }

      return NextResponse.json({
        success: true,
        mode: 'day-wise',
        selectedDay,
        threshold,
        start_date: startDate,
        end_date: endDate,
        districts
      });
    }

    // Mode 2: Comparison mode (day-wise aggregate metrics)
    if (mode === 'comparison') {
      const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'];
      const days: any = {};

      for (const leadDay of leadDays) {
        const comparisons = await compareForDateRange(startDate, endDate, leadDay, threshold, configMode);
        const aggregateStats = calculateAccuracy(comparisons);

        days[leadDay] = {
          correctness: aggregateStats.accuracy / 100, // Convert to 0-1 range
          pod: aggregateStats.pod,
          far: aggregateStats.far,
          csi: aggregateStats.csi,
          bias: aggregateStats.bias,
          h: aggregateStats.correct,
          m: aggregateStats.missedEvents,
          f: aggregateStats.falseAlarms,
          cn: aggregateStats.correctNegatives,
          total: aggregateStats.totalPredictions
        };
      }

      return NextResponse.json({
        success: true,
        mode: 'comparison',
        threshold,
        start_date: startDate,
        end_date: endDate,
        days
      });
    }

  } catch (error: any) {
    console.error('Analysis API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate analysis',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
