/**
 * Unified Data Loader - Single Source of Truth
 * Reads from Supabase when credentials are available, falls back to local filesystem.
 */

import { SupabaseStorageManager, WarningData, RealisedData } from './supabaseStorageManager';
import { adminSupabase } from '@/lib/supabase/admin';
import { parseDate, formatDate } from './dateUtils';

// Simple in-memory cache
const cache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface UserContext {
  userId: string | null;
  isAdmin: boolean;
  canModify: boolean;
  canDelete: boolean;
}

const DEFAULT_ADMIN_CTX: UserContext = {
  userId: null,
  isAdmin: true,
  canModify: true,
  canDelete: true,
};

function getStorage(ctx: UserContext = DEFAULT_ADMIN_CTX): SupabaseStorageManager {
  return new SupabaseStorageManager(adminSupabase, ctx);
}

/**
 * Load warning data for a specific date and lead day
 */
export async function loadWarningForDate(
  year: number,
  month: number,
  day: number,
  leadDay: string,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<WarningData | null> {
  const cacheKey = `warning_${ctx.userId ?? 'admin'}_${year}_${month}_${day}_${leadDay}`;

  const cached = cache.get(cacheKey) as CacheEntry;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const storage = getStorage(ctx);
  const data = await storage.loadWarningData(year, month, day, leadDay);

  if (data) {
    cache.set(cacheKey, { data, timestamp: Date.now() });
  }

  return data;
}

/**
 * Load realised data for a specific date
 */
export async function loadRealisedForDate(
  year: number,
  month: number,
  day: number,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<RealisedData | null> {
  const cacheKey = `realised_${ctx.userId ?? 'admin'}_${year}_${month}_${day}`;

  const cached = cache.get(cacheKey) as CacheEntry;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const storage = getStorage(ctx);
  const data = await storage.loadRealisedData(year, month, day);

  if (data) {
    cache.set(cacheKey, { data, timestamp: Date.now() });
  }

  return data;
}

/**
 * Load data for a date range
 */
export async function loadDataForDateRange(
  startDate: string,
  endDate: string,
  leadDay?: string,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<{
  warning: Map<string, WarningData>;
  realised: Map<string, RealisedData>;
}> {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const warningData = new Map<string, WarningData>();
  const realisedData = new Map<string, RealisedData>();

  const currentDate = new Date(start.year, start.month - 1, start.day);
  const endDateObj = new Date(end.year, end.month - 1, end.day);

  while (currentDate <= endDateObj) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const dateStr = formatDate(year, month, day);

    if (leadDay) {
      const warning = await loadWarningForDate(year, month, day, leadDay, ctx);
      if (warning) {
        warningData.set(dateStr, warning);
      }
    }

    const realised = await loadRealisedForDate(year, month, day, ctx);
    if (realised) {
      realisedData.set(dateStr, realised);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { warning: warningData, realised: realisedData };
}

/**
 * Load all warning data for a month (all lead days)
 */
export async function loadMonthWarningData(
  year: number,
  month: number,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<Map<string, WarningData>> {
  const cacheKey = `month_warning_${ctx.userId ?? 'admin'}_${year}_${month}`;

  const cached = cache.get(cacheKey) as CacheEntry;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const storage = getStorage(ctx);
  const data = await storage.loadMonthWarningData(year, month);

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Load all realised data for a month
 */
export async function loadMonthRealisedData(
  year: number,
  month: number,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<Map<string, RealisedData>> {
  const cacheKey = `month_realised_${ctx.userId ?? 'admin'}_${year}_${month}`;

  const cached = cache.get(cacheKey) as CacheEntry;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const storage = getStorage(ctx);
  const data = await storage.loadMonthRealisedData(year, month);

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Get available dates for a month
 */
export async function getAvailableDates(
  year: number,
  month: number,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<string[]> {
  const cacheKey = `available_dates_${ctx.userId ?? 'admin'}_${year}_${month}`;

  const cached = cache.get(cacheKey) as CacheEntry;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const storage = getStorage(ctx);
  const dates = await storage.getAvailableDates(year, month);

  cache.set(cacheKey, { data: dates, timestamp: Date.now() });
  return dates;
}

/**
 * Check if data exists for a specific date
 */
export async function hasDataForDate(
  year: number,
  month: number,
  day: number,
  type: 'warning' | 'realised',
  leadDay?: string,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<boolean> {
  const storage = getStorage(ctx);
  if (type === 'warning') {
    if (!leadDay) {
      const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'];
      for (const ld of leadDays) {
        if (await storage.hasWarningData(year, month, day, ld)) return true;
      }
      return false;
    }
    return await storage.hasWarningData(year, month, day, leadDay);
  } else {
    return await storage.hasRealisedData(year, month, day);
  }
}

/**
 * Aggregate monthly statistics
 */
export async function aggregateMonthStats(
  year: number,
  month: number,
  leadDay: string,
  ctx: UserContext = DEFAULT_ADMIN_CTX
): Promise<{
  totalDays: number;
  daysWithWarning: number;
  daysWithRealised: number;
  daysWithBoth: number;
}> {
  const warningData = await loadMonthWarningData(year, month, ctx);
  const realisedData = await loadMonthRealisedData(year, month, ctx);

  const warningDates = new Set<string>();
  const realisedDates = new Set(realisedData.keys());

  for (const [key, data] of warningData.entries()) {
    if (data.leadDay === leadDay) {
      warningDates.add(data.date);
    }
  }

  const daysWithBoth = Array.from(warningDates).filter((date) =>
    realisedDates.has(date)
  ).length;

  return {
    totalDays: new Date(year, month, 0).getDate(),
    daysWithWarning: warningDates.size,
    daysWithRealised: realisedDates.size,
    daysWithBoth,
  };
}

/**
 * Clear cache (call after new upload)
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// Export context type
export type { UserContext };

// Export types
export type { WarningData, RealisedData } from './supabaseStorageManager';
