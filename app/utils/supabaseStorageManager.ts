/**
 * Supabase Storage Manager
 * Replaces FileStorageManager — reads/writes to Supabase database.
 *
 * Read priority:
 *   1. user_data_files (user's own copy, if they've modified)
 *   2. master_data_files (admin's original)
 *
 * Write rules:
 *   - Admin writes → master_data_files
 *   - User with can_modify → user_data_files (copy-on-write)
 */

import { SupabaseClient } from '@supabase/supabase-js';
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

interface UserContext {
  userId: string | null;
  isAdmin: boolean;
  canModify: boolean;
  canDelete: boolean;
}

export class SupabaseStorageManager {
  constructor(
    private supabase: SupabaseClient,
    private ctx: UserContext
  ) {}

  // ─── SAVE WARNING DATA ──────────────────────────────────────────

  async saveWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string,
    districts: { [district: string]: number | null }
  ): Promise<void> {
    const date = formatDate(year, month, day);
    const payload = {
      type: 'warning' as const,
      year,
      month,
      day,
      lead_day: leadDay,
      districts,
      updated_at: new Date().toISOString(),
    };

    if (this.ctx.isAdmin) {
      // Admin → upsert into master_data_files
      const { error } = await this.supabase.from('master_data_files').upsert(
        { ...payload, uploaded_by: this.ctx.userId },
        { onConflict: 'type,year,month,day,lead_day' }
      );
      if (error) throw new Error(`Failed to save master warning data: ${error.message}`);
    } else if (this.ctx.canModify && this.ctx.userId) {
      // User with modify permission → copy-on-write in user_data_files
      // First, find the master file ID if it exists
      const { data: masterFile } = await this.supabase
        .from('master_data_files')
        .select('id')
        .eq('type', 'warning')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .eq('lead_day', leadDay)
        .maybeSingle();

      const { error } = await this.supabase.from('user_data_files').upsert(
        {
          ...payload,
          user_id: this.ctx.userId,
          master_file_id: masterFile?.id ?? null,
        },
        { onConflict: 'user_id,type,year,month,day,lead_day' }
      );
      if (error) throw new Error(`Failed to save user warning copy: ${error.message}`);
    } else {
      throw new Error('Insufficient permissions to save warning data');
    }
  }

  // ─── SAVE REALISED DATA ─────────────────────────────────────────

  async saveRealisedData(
    year: number,
    month: number,
    day: number,
    districts: { [district: string]: number | null }
  ): Promise<void> {
    const payload = {
      type: 'realised' as const,
      year,
      month,
      day,
      lead_day: null,
      districts,
      updated_at: new Date().toISOString(),
    };

    if (this.ctx.isAdmin) {
      const { error } = await this.supabase.from('master_data_files').upsert(
        { ...payload, uploaded_by: this.ctx.userId },
        { onConflict: 'type,year,month,day,lead_day' }
      );
      if (error) throw new Error(`Failed to save master realised data: ${error.message}`);
    } else if (this.ctx.canModify && this.ctx.userId) {
      const { data: masterFile } = await this.supabase
        .from('master_data_files')
        .select('id')
        .eq('type', 'realised')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .is('lead_day', null)
        .maybeSingle();

      const { error } = await this.supabase.from('user_data_files').upsert(
        {
          ...payload,
          user_id: this.ctx.userId,
          master_file_id: masterFile?.id ?? null,
        },
        { onConflict: 'user_id,type,year,month,day,lead_day' }
      );
      if (error) throw new Error(`Failed to save user realised copy: ${error.message}`);
    } else {
      throw new Error('Insufficient permissions to save realised data');
    }
  }

  // ─── LOAD WARNING DATA ──────────────────────────────────────────

  async loadWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<WarningData | null> {
    // Check user copy first (if non-admin user)
    if (this.ctx.userId && !this.ctx.isAdmin) {
      const { data: userFile } = await this.supabase
        .from('user_data_files')
        .select('districts')
        .eq('user_id', this.ctx.userId)
        .eq('type', 'warning')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .eq('lead_day', leadDay)
        .maybeSingle();

      if (userFile) {
        return {
          date: formatDate(year, month, day),
          leadDay,
          districts: userFile.districts as { [k: string]: number | null },
        };
      }
    }

    // Fall back to master data
    const { data } = await this.supabase
      .from('master_data_files')
      .select('districts')
      .eq('type', 'warning')
      .eq('year', year)
      .eq('month', month)
      .eq('day', day)
      .eq('lead_day', leadDay)
      .maybeSingle();

    if (!data) return null;
    return {
      date: formatDate(year, month, day),
      leadDay,
      districts: data.districts as { [k: string]: number | null },
    };
  }

  // ─── LOAD REALISED DATA ─────────────────────────────────────────

  async loadRealisedData(
    year: number,
    month: number,
    day: number
  ): Promise<RealisedData | null> {
    // Check user copy first
    if (this.ctx.userId && !this.ctx.isAdmin) {
      const { data: userFile } = await this.supabase
        .from('user_data_files')
        .select('districts')
        .eq('user_id', this.ctx.userId)
        .eq('type', 'realised')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .is('lead_day', null)
        .maybeSingle();

      if (userFile) {
        return {
          date: formatDate(year, month, day),
          districts: userFile.districts as { [k: string]: number | null },
        };
      }
    }

    const { data } = await this.supabase
      .from('master_data_files')
      .select('districts')
      .eq('type', 'realised')
      .eq('year', year)
      .eq('month', month)
      .eq('day', day)
      .is('lead_day', null)
      .maybeSingle();

    if (!data) return null;
    return {
      date: formatDate(year, month, day),
      districts: data.districts as { [k: string]: number | null },
    };
  }

  // ─── HAS WARNING DATA ───────────────────────────────────────────

  async hasWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<boolean> {
    const data = await this.loadWarningData(year, month, day, leadDay);
    return data !== null;
  }

  // ─── HAS REALISED DATA ──────────────────────────────────────────

  async hasRealisedData(year: number, month: number, day: number): Promise<boolean> {
    const data = await this.loadRealisedData(year, month, day);
    return data !== null;
  }

  // ─── LOAD MONTH WARNING DATA ────────────────────────────────────

  async loadMonthWarningData(
    year: number,
    month: number
  ): Promise<Map<string, WarningData>> {
    const result = new Map<string, WarningData>();

    // Load master data
    const { data: masterRows } = await this.supabase
      .from('master_data_files')
      .select('day, lead_day, districts')
      .eq('type', 'warning')
      .eq('year', year)
      .eq('month', month);

    if (masterRows) {
      for (const row of masterRows) {
        const date = formatDate(year, month, row.day);
        const key = `${date}_${row.lead_day}`;
        result.set(key, {
          date,
          leadDay: row.lead_day,
          districts: row.districts,
        });
      }
    }

    // Overlay with user copies if non-admin user
    if (this.ctx.userId && !this.ctx.isAdmin) {
      const { data: userRows } = await this.supabase
        .from('user_data_files')
        .select('day, lead_day, districts')
        .eq('user_id', this.ctx.userId)
        .eq('type', 'warning')
        .eq('year', year)
        .eq('month', month);

      if (userRows) {
        for (const row of userRows) {
          const date = formatDate(year, month, row.day);
          const key = `${date}_${row.lead_day}`;
          result.set(key, {
            date,
            leadDay: row.lead_day,
            districts: row.districts,
          });
        }
      }
    }

    return result;
  }

  // ─── LOAD MONTH REALISED DATA ───────────────────────────────────

  async loadMonthRealisedData(
    year: number,
    month: number
  ): Promise<Map<string, RealisedData>> {
    const result = new Map<string, RealisedData>();

    const { data: masterRows } = await this.supabase
      .from('master_data_files')
      .select('day, districts')
      .eq('type', 'realised')
      .eq('year', year)
      .eq('month', month);

    if (masterRows) {
      for (const row of masterRows) {
        const date = formatDate(year, month, row.day);
        result.set(date, { date, districts: row.districts });
      }
    }

    // Overlay user copies
    if (this.ctx.userId && !this.ctx.isAdmin) {
      const { data: userRows } = await this.supabase
        .from('user_data_files')
        .select('day, districts')
        .eq('user_id', this.ctx.userId)
        .eq('type', 'realised')
        .eq('year', year)
        .eq('month', month)
        .is('lead_day', null);

      if (userRows) {
        for (const row of userRows) {
          const date = formatDate(year, month, row.day);
          result.set(date, { date, districts: row.districts });
        }
      }
    }

    return result;
  }

  // ─── GET AVAILABLE DATES ────────────────────────────────────────

  async getAvailableDates(year: number, month: number): Promise<string[]> {
    const monthData = await this.loadMonthRealisedData(year, month);
    return Array.from(monthData.keys()).sort();
  }

  // ─── DELETE WARNING DATA ────────────────────────────────────────

  async deleteWarningData(
    year: number,
    month: number,
    day: number,
    leadDay: string
  ): Promise<void> {
    if (this.ctx.isAdmin) {
      await this.supabase
        .from('master_data_files')
        .delete()
        .eq('type', 'warning')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .eq('lead_day', leadDay);
    } else if (this.ctx.canDelete && this.ctx.userId) {
      await this.supabase
        .from('user_data_files')
        .delete()
        .eq('user_id', this.ctx.userId)
        .eq('type', 'warning')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .eq('lead_day', leadDay);
    }
  }

  // ─── DELETE REALISED DATA ───────────────────────────────────────

  async deleteRealisedData(year: number, month: number, day: number): Promise<void> {
    if (this.ctx.isAdmin) {
      await this.supabase
        .from('master_data_files')
        .delete()
        .eq('type', 'realised')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .is('lead_day', null);
    } else if (this.ctx.canDelete && this.ctx.userId) {
      await this.supabase
        .from('user_data_files')
        .delete()
        .eq('user_id', this.ctx.userId)
        .eq('type', 'realised')
        .eq('year', year)
        .eq('month', month)
        .eq('day', day)
        .is('lead_day', null);
    }
  }
}
