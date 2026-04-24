import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { normalizeDistrictName } from '@/app/utils/districtNormalizer';

// API route for fetching daily and monthly realised rainfall data
interface DistrictRainfall {
  district: string;
  rainfall: number;
  maxRainfallDate?: string;
  maxRainfallValue?: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const view = searchParams.get('view'); // 'daily' or 'monthly'
    const date = searchParams.get('date'); // Format: YYYY-MM-DD
    const month = searchParams.get('month'); // Format: YYYY-MM

    if (!view || (view !== 'daily' && view !== 'monthly')) {
      return NextResponse.json(
        { error: 'Invalid view parameter. Must be "daily" or "monthly"' },
        { status: 400 }
      );
    }

    if (view === 'daily' && !date) {
      return NextResponse.json(
        { error: 'Date parameter required for daily view' },
        { status: 400 }
      );
    }

    if (view === 'monthly' && !month) {
      return NextResponse.json(
        { error: 'Month parameter required for monthly view' },
        { status: 400 }
      );
    }

    let result: DistrictRainfall[] = [];

    if (view === 'daily') {
      result = await getDailyRainfall(date!);
    } else {
      result = await getMonthlyRainfall(month!);
    }

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('Rainfall data API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rainfall data', details: error.message },
      { status: 500 }
    );
  }
}

async function getDailyRainfall(dateStr: string): Promise<DistrictRainfall[]> {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);

  // Query Supabase for this specific day's realised data
  const { data, error } = await adminSupabase
    .from('master_data_files')
    .select('districts')
    .eq('type', 'realised')
    .eq('year', year)
    .eq('month', month)
    .eq('day', day)
    .is('lead_day', null)
    .maybeSingle();

  if (error) {
    console.error('Supabase getDailyRainfall error:', error);
    return [];
  }

  if (!data?.districts) return [];

  const result: DistrictRainfall[] = [];
  for (const [district, rainfall] of Object.entries(data.districts as Record<string, number | null>)) {
    if (rainfall !== null && !isNaN(rainfall)) {
      const normalizedDistrict = normalizeDistrictName(district);
      result.push({
        district: normalizedDistrict,
        rainfall: parseFloat(rainfall.toFixed(1)),
      });

      // Handle Mumbai special case
      if (normalizedDistrict === 'MUMBAI') {
        result.push({
          district: 'MUMBAI SUBURBAN',
          rainfall: parseFloat(rainfall.toFixed(1)),
        });
      }
    }
  }

  return result;
}

async function getMonthlyRainfall(monthStr: string): Promise<DistrictRainfall[]> {
  const [yearStr, monthNum] = monthStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthNum);

  // Query all days for this month
  const { data, error } = await adminSupabase
    .from('master_data_files')
    .select('day, districts')
    .eq('type', 'realised')
    .eq('year', year)
    .eq('month', month)
    .is('lead_day', null)
    .order('day', { ascending: true });

  if (error) {
    console.error('Supabase getMonthlyRainfall error:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Accumulate totals per district
  const districtStats = new Map<string, { total: number; maxVal: number; maxDate: string }>();

  for (const row of data) {
    const dateStr = `${yearStr}-${monthNum}-${String(row.day).padStart(2, '0')}`;
    const districts = row.districts as Record<string, number | null>;

    for (const [district, rainfall] of Object.entries(districts)) {
      if (rainfall !== null && !isNaN(rainfall)) {
        const normalizedDistrict = normalizeDistrictName(district);

        if (!districtStats.has(normalizedDistrict)) {
          districtStats.set(normalizedDistrict, { total: 0, maxVal: -1, maxDate: '' });
        }

        const stats = districtStats.get(normalizedDistrict)!;
        stats.total += rainfall;

        if (rainfall > stats.maxVal) {
          stats.maxVal = rainfall;
          stats.maxDate = dateStr;
        }
      }
    }
  }

  const result: DistrictRainfall[] = [];
  for (const [district, stats] of districtStats.entries()) {
    result.push({
      district,
      rainfall: parseFloat(stats.total.toFixed(1)),
      maxRainfallDate: stats.maxDate,
      maxRainfallValue: parseFloat(stats.maxVal.toFixed(1)),
    });

    if (district === 'MUMBAI') {
      result.push({
        district: 'MUMBAI SUBURBAN',
        rainfall: parseFloat(stats.total.toFixed(1)),
        maxRainfallDate: stats.maxDate,
        maxRainfallValue: parseFloat(stats.maxVal.toFixed(1)),
      });
    }
  }

  return result;
}
