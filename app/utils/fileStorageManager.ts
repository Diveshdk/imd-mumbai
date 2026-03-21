import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { formatDate } from './dateUtils';
import { kv } from '@vercel/kv';

export interface WarningData {
  date: string;
  leadDay: string;
  districts: { [district: string]: number | null };
}

export interface RealisedData {
  date: string;
  districts: { [district: string]: number | null };
}

const DATES_INDEX_KEY = 'rainfall_available_dates';

// Helper to check if KV is configured
const isKVConfigured = () => {
  return !!(process.env.KV_REST_API_URL || process.env.STORE_KV_REST_API_URL);
};

export class FileStorageManager {
  private baseDir: string;
  private warningDir: string;
  private realisedDir: string;

  constructor(baseDir: string = 'data') {
    this.baseDir = baseDir;
    this.warningDir = path.join(baseDir, 'warning');
    this.realisedDir = path.join(baseDir, 'realised');
  }

  /**
   * Helper to manage the index of dates that have data
   */
  private async addToDatesIndex(date: string): Promise<void> {
    if (!process.env.KV_REST_API_URL) return;
    try {
      await kv.sadd(DATES_INDEX_KEY, date);
    } catch (e) {
      console.error('Failed to update dates index in KV:', e);
    }
  }

  private async removeFromDatesIndex(date: string): Promise<void> {
    if (!process.env.KV_REST_API_URL) return;
    try {
      // Logic to check if any other keys exist for this date could be complex with KV
      // For now, we only remove if it's the last type of data for this date.
      // But keeping it in index is harmless if we handle null loads.
      // So we'll just keep it simple.
    } catch (e) {
      console.error('Failed to update dates index in KV:', e);
    }
  }

  /**
   * Save warning data for a specific day
   */
  async saveWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string,
    districts: { [district: string]: number | null }
  ): Promise<void> {
    const date = formatDate(year, month, day);
    const data: WarningData = { date, leadDay, districts };

    // 1. Save to KV if available
    if (isKVConfigured()) {
      const kvKey = `warning:${year}:${month}:${leadDay}:${day}`;
      await kv.set(kvKey, data);
      await this.addToDatesIndex(date);
    }

    // 2. Save to local FS
    try {
      const dirPath = path.join(
        this.warningDir,
        String(year),
        String(month).padStart(2, '0'),
        leadDay
      );
      const filePath = path.join(dirPath, `${String(day).padStart(2, '0')}.json`);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      if (!process.env.KV_REST_API_URL) throw err;
    }
  }

  /**
   * Save realised data for a specific day
   */
  async saveRealisedData(
    year: number,
    month: number,
    day: number,
    districts: { [district: string]: number | null }
  ): Promise<void> {
    const date = formatDate(year, month, day);
    const data: RealisedData = { date, districts };

    // 1. Save to KV if available
    if (isKVConfigured()) {
      const kvKey = `realised:${year}:${month}:${day}`;
      await kv.set(kvKey, data);
      await this.addToDatesIndex(date);
    }

    // 2. Save to local FS
    try {
      const dirPath = path.join(
        this.realisedDir,
        String(year),
        String(month).padStart(2, '0')
      );
      const filePath = path.join(dirPath, `${String(day).padStart(2, '0')}.json`);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      if (!process.env.KV_REST_API_URL) throw err;
    }
  }

  /**
   * Load warning data for a specific day and lead day
   */
  async loadWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<WarningData | null> {
    // 1. Try KV
    if (isKVConfigured()) {
      try {
        const kvKey = `warning:${year}:${month}:${leadDay}:${day}`;
        const data = await kv.get<WarningData>(kvKey);
        if (data) return data;
      } catch (e) {}
    }

    // 2. Fallback to FS
    const filePath = path.join(
      this.warningDir,
      String(year),
      String(month).padStart(2, '0'),
      leadDay,
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as WarningData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load realised data for a specific day
   */
  async loadRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<RealisedData | null> {
    // 1. Try KV
    if (isKVConfigured()) {
      try {
        const kvKey = `realised:${year}:${month}:${day}`;
        const data = await kv.get<RealisedData>(kvKey);
        if (data) return data;
      } catch (e) {}
    }

    // 2. Fallback to FS
    const filePath = path.join(
      this.realisedDir,
      String(year),
      String(month).padStart(2, '0'),
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as RealisedData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if warning data exists for a specific day and lead day
   */
  async hasWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<boolean> {
    return (await this.loadWarningData(year, month, day, leadDay)) !== null;
  }

  /**
   * Check if realised data exists for a specific day
   */
  async hasRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<boolean> {
    return (await this.loadRealisedData(year, month, day)) !== null;
  }

  /**
   * Load all warning data for a month (all lead days)
   */
  async loadMonthWarningData(
    year: number,
    month: number
  ): Promise<Map<string, WarningData>> {
    const result = new Map<string, WarningData>();

    // 1. Try KV
    if (isKVConfigured()) {
      try {
        const pattern = `warning:${year}:${month}:*`;
        const keys = await kv.keys(pattern);
        for (const key of keys) {
          const data = await kv.get<WarningData>(key);
          if (data) result.set(`${data.date}_${data.leadDay}`, data);
        }
      } catch (e) {}
    }

    // 2. Combine with FS
    const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'];
    for (const leadDay of leadDays) {
      const dirPath = path.join(this.warningDir, String(year), String(month).padStart(2, '0'), leadDay);
      try {
        if (existsSync(dirPath)) {
          const files = await fs.readdir(dirPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
              const data = JSON.parse(content) as WarningData;
              const key = `${data.date}_${leadDay}`;
              if (!result.has(key)) result.set(key, data);
            }
          }
        }
      } catch {}
    }
    return result;
  }

  /**
   * Load all realised data for a month
   */
  async loadMonthRealisedData(
    year: number,
    month: number
  ): Promise<Map<string, RealisedData>> {
    const result = new Map<string, RealisedData>();

    // 1. Try KV
    if (isKVConfigured()) {
      try {
        const pattern = `realised:${year}:${month}:*`;
        const keys = await kv.keys(pattern);
        for (const key of keys) {
          const data = await kv.get<RealisedData>(key);
          if (data) result.set(data.date, data);
        }
      } catch (e) {}
    }

    // 2. FS combine
    const dirPath = path.join(this.realisedDir, String(year), String(month).padStart(2, '0'));
    try {
      if (existsSync(dirPath)) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
            const data = JSON.parse(content) as RealisedData;
            if (!result.has(data.date)) result.set(data.date, data);
          }
        }
      }
    } catch {}
    return result;
  }

  /**
   * Get list of available dates for a month
   */
  async getAvailableDates(year: number, month: number): Promise<string[]> {
    const result = new Set<string>();

    // 1. Try KV index
    if (isKVConfigured()) {
      try {
        const dates = await kv.smembers(DATES_INDEX_KEY);
        if (dates) {
          for (const d of dates) {
            if (d.startsWith(`${year}-${String(month).padStart(2, '0')}`)) result.add(d);
          }
        }
      } catch (e) {}
    }

    // 2. FS fallback
    const dirPath = path.join(this.realisedDir, String(year), String(month).padStart(2, '0'));
    try {
      if (existsSync(dirPath)) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const day = file.replace('.json', '');
            result.add(`${year}-${String(month).padStart(2, '0')}-${day}`);
          }
        }
      }
    } catch {}

    return Array.from(result).sort();
  }

  /**
   * Delete warning data
   */
  async deleteWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<void> {
    if (isKVConfigured()) {
      await kv.del(`warning:${year}:${month}:${leadDay}:${day}`);
    }
    try {
      const filePath = path.join(this.warningDir, String(year), String(month).padStart(2, '0'), leadDay, `${String(day).padStart(2, '0')}.json`);
      await fs.unlink(filePath);
    } catch {}
  }

  /**
   * Delete realised data
   */
  async deleteRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<void> {
    if (isKVConfigured()) {
      await kv.del(`realised:${year}:${month}:${day}`);
    }
    try {
      const filePath = path.join(this.realisedDir, String(year), String(month).padStart(2, '0'), `${String(day).padStart(2, '0')}.json`);
      await fs.unlink(filePath);
    } catch {}
  }
}
