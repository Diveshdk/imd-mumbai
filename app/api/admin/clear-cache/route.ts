/**
 * API Route: Clear Server-Side Cache
 * POST /api/admin/clear-cache
 * Clears both the data cache (unifiedDataLoader) and config cache (rainfallConfig).
 * Requires admin password for authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearCache } from '@/app/utils/unifiedDataLoader';
import { clearConfigCache } from '@/app/utils/rainfallConfig';

const ADMIN_PASSWORD = 'admin123';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Clear both caches
    clearCache();        // unifiedDataLoader: warning & realised file data
    clearConfigCache();  // rainfallConfig: classification configuration

    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully. The website will now fetch fresh data from disk.'
    });
  } catch (error: any) {
    console.error('Cache clear error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear cache: ' + (error.message || error.toString()) },
      { status: 500 }
    );
  }
}
