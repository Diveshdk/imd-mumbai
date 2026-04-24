import { NextRequest, NextResponse } from 'next/server';
import {
  compareForDateRange,
  getDistrictWiseAccuracy,
  calculateCategoryBinaryAccuracy,
  type Comparison,
} from '@/app/utils/comparisonEngine';
import { loadRainfallConfig } from '@/app/utils/rainfallConfig';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const leadDay = searchParams.get('leadDay') || 'D1';
    const category = searchParams.get('category'); // Optional: multi-mode category filter
    const mode = searchParams.get('mode') as 'dual' | 'multi' | null;
    const threshold = searchParams.get('threshold') ? parseFloat(searchParams.get('threshold')!) : undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Get comparisons for the date range and lead day
    const comparisons = await compareForDateRange(startDate, endDate, leadDay, threshold, mode || undefined);

    const districts: Record<string, any> = {};

    if (category) {
      // Per-category binary verification stats (used in Multi-Mode category selector)
      const config = await loadRainfallConfig();

      // Group comparisons by district
      const districtMap = new Map<string, Comparison[]>();
      for (const cmp of comparisons) {
        if (!districtMap.has(cmp.district)) districtMap.set(cmp.district, []);
        districtMap.get(cmp.district)!.push(cmp);
      }

      for (const [district, distComps] of districtMap.entries()) {
        const stats = calculateCategoryBinaryAccuracy(distComps, category);
        // Normalize to uppercase to match GeoJSON DISTRICT_NORM keys
        const key = district.toUpperCase();
        districts[key] = {
          pod: stats.pod,
          far: stats.far,
          csi: stats.csi,
          bias: stats.bias,
          accuracy: stats.accuracy,
          total: stats.totalPredictions,
          category,
        };
      }
    } else {
      // Standard overall verification stats
      const districtStats = getDistrictWiseAccuracy(comparisons);
      for (const [district, stats] of districtStats.entries()) {
        // Normalize to uppercase to match GeoJSON DISTRICT_NORM keys
        const key = district.toUpperCase();
        districts[key] = {
          pod: stats.pod,
          far: stats.far,
          csi: stats.csi,
          bias: stats.bias,
          accuracy: stats.accuracy,
          total: stats.totalPredictions,
        };
      }
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      leadDay,
      category: category || null,
      districts,
    });
  } catch (error: any) {
    console.error('Map metrics API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
