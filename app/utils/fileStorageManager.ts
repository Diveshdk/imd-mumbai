/**
 * File Storage Manager for IMD Upload System
 * Manages day-wise JSON file storage for Warning and Realised data
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { formatDate } from './dateUtils';

export interface WarningData {
  date: string;
  leadDay: string;
  districts: { [district: string]: number | null };
}

export interface RealisedData {
  date: string;
  districts: { [district: string]: number | null };
}

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

    // Construct path: /data/warning/YYYY/MM/D1-D5/DD.json
    const dirPath = path.join(
      this.warningDir,
      String(year),
      String(month).padStart(2, '0'),
      leadDay
    );
    const filePath = path.join(dirPath, `${String(day).padStart(2, '0')}.json`);

    // Create directory structure
    await fs.mkdir(dirPath, { recursive: true });

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
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

    // Construct path: /data/realised/YYYY/MM/DD.json
    const dirPath = path.join(
      this.realisedDir,
      String(year),
      String(month).padStart(2, '0')
    );
    const filePath = path.join(dirPath, `${String(day).padStart(2, '0')}.json`);

    // Create directory structure
    await fs.mkdir(dirPath, { recursive: true });

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
      // File doesn't exist or can't be read
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
      // File doesn't exist or can't be read
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
    const filePath = path.join(
      this.warningDir,
      String(year),
      String(month).padStart(2, '0'),
      leadDay,
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if realised data exists for a specific day
   */
  async hasRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<boolean> {
    const filePath = path.join(
      this.realisedDir,
      String(year),
      String(month).padStart(2, '0'),
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all warning data for a month (all lead days)
   */
  async loadMonthWarningData(
    year: number,
    month: number
  ): Promise<Map<string, WarningData>> {
    const result = new Map<string, WarningData>();
    const leadDays = ['D1', 'D2', 'D3', 'D4', 'D5'];

    for (const leadDay of leadDays) {
      const dirPath = path.join(
        this.warningDir,
        String(year),
        String(month).padStart(2, '0'),
        leadDay
      );

      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(dirPath, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as WarningData;
            const key = `${data.date}_${leadDay}`;
            result.set(key, data);
          }
        }
      } catch {
        // Directory doesn't exist, skip
        continue;
      }
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
    const dirPath = path.join(
      this.realisedDir,
      String(year),
      String(month).padStart(2, '0')
    );

    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(dirPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as RealisedData;
          result.set(data.date, data);
        }
      }
    } catch {
      // Directory doesn't exist
      return result;
    }

    return result;
  }

  /**
   * Get list of available dates for a month (dates with realised data)
   */
  async getAvailableDates(year: number, month: number): Promise<string[]> {
    const monthData = await this.loadMonthRealisedData(year, month);
    return Array.from(monthData.keys()).sort();
  }

  /**
   * Delete warning data for a specific day and lead day
   */
  async deleteWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<void> {
    const filePath = path.join(
      this.warningDir,
      String(year),
      String(month).padStart(2, '0'),
      leadDay,
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Delete realised data for a specific day
   */
  async deleteRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<void> {
    const filePath = path.join(
      this.realisedDir,
      String(year),
      String(month).padStart(2, '0'),
      `${String(day).padStart(2, '0')}.json`
    );

    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, ignore
    }
  }
}
