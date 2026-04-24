import { NextRequest, NextResponse } from 'next/server';
import {
  loadRainfallConfig,
  saveRainfallConfig,
  type RainfallConfig,
  type MultiModeClassification
} from '@/app/utils/rainfallConfig';
import { adminSupabase } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireAdmin(request: NextRequest) {
  const { supabase } = createServerSupabaseClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminSupabase.from('profiles').select('role, status, can_modify, can_delete').eq('id', user.id).single();
  if (!profile || profile.status !== 'active') return null;
  const isAuthorized = profile.role === 'admin' || profile.can_modify || profile.can_delete;
  if (!isAuthorized) return null;
  return user;
}

/**
 * GET /api/admin/rainfall-config
 * Fetch current rainfall classification configuration
 */
export async function GET(request: NextRequest) {
  try {
    const config = await loadRainfallConfig();
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error('Failed to load rainfall config:', error);
    return NextResponse.json({ success: false, error: 'Failed to load configuration', details: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/rainfall-config
 * Save updated rainfall classification configuration
 * Requires password authentication
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized — admin access required' }, { status: 401 });
    }

    const body = await request.json();
    const { config } = body;
    // Validate config structure
    // if (!config || !config.classifications || !Array.isArray(config.classifications)) {
    //   return NextResponse.json(
    //     {
    //       success: false,
    //       error: 'Invalid configuration structure'
    //     },
    //     { status: 400 }
    //   );
    // }
    
    // Migration: Ensure multi-mode items have parentCategory BEFORE validation
    // Use the Dual Mode threshold as a reference if available
    const dualThreshold = config.classifications.dual.threshold || 64.5;
    if (config.mode === 'multi' && config.classifications.multi && config.classifications.multi.items) {
      config.classifications.multi.items = config.classifications.multi.items.map((item: MultiModeClassification) => ({
        ...item,
        parentCategory: item.parentCategory || (item.thresholdMm >= dualThreshold ? 'HEAVY' : 'LOW')
      }));
    }

    // Validate each classification
    const errors: string[] = [];
    const thresholds = new Set<number>();
    
    if (config.mode === 'multi') {
      const items = config.classifications.multi.items;
      for (let i = 0; i < items.length; i++) {
        const classification: MultiModeClassification = items[i];
        
        // Validate required fields
        if (!classification.id || !classification.variableName) {
          errors.push(`Classification ${i + 1} (${classification.label}): Missing id or variableName`);
        }
        
        // Validate threshold
        if (typeof classification.thresholdMm !== 'number' || classification.thresholdMm < 0) {
          errors.push(`Classification ${i + 1} (${classification.label}): Threshold must be a non-negative number`);
        }
        
        // Check for duplicate thresholds
        if (thresholds.has(classification.thresholdMm)) {
          errors.push(`Classification ${i + 1} (${classification.label}): Duplicate threshold ${classification.thresholdMm}mm`);
        }
        thresholds.add(classification.thresholdMm);
        
        // Validate codes array
        if (!Array.isArray(classification.codes)) {
          errors.push(`Classification ${i + 1} (${classification.label}): Codes must be an array`);
        } else {
          for (const code of classification.codes) {
            if (!Number.isInteger(code) || code < 0) {
              errors.push(`Classification ${i + 1} (${classification.label}): Code ${code} must be a non-negative integer`);
            }
          }
        }
        
        // Validate order
        if (typeof classification.order !== 'number') {
          errors.push(`Classification ${i + 1} (${classification.label}): Order must be a number`);
        }

        // Validate parentCategory (now should be present due to migration above)
        if (!classification.parentCategory || (classification.parentCategory !== 'LOW' && classification.parentCategory !== 'HEAVY')) {
          errors.push(`Classification ${i + 1} (${classification.label}): Parent category must be LOW or HEAVY`);
        }
      }
    } else if (config.mode === 'dual') {
      const dual = config.classifications.dual;
      
      // Validate threshold
      if (typeof dual.threshold !== 'number' || dual.threshold < 0) {
        errors.push("Dual Mode: Threshold must be a non-negative number");
      }

      if (!Array.isArray(dual.heavyCodes)) {
        errors.push("Dual Mode: heavyCodes must be an array");
      } else {
        for (const code of dual.heavyCodes) {
          if (!Number.isInteger(code) || code < 0) {
            errors.push(`Dual Mode: Heavy code ${code} must be a non-negative integer`);
          }
        }
      }

      // Validate ocCodes (optional, default empty)
      if (dual.ocCodes !== undefined && dual.ocCodes !== null) {
        if (!Array.isArray(dual.ocCodes)) {
          errors.push("Dual Mode: ocCodes must be an array");
        } else {
          for (const code of dual.ocCodes) {
            if (!Number.isInteger(code) || code < 0) {
              errors.push(`Dual Mode: OC code ${code} must be a non-negative integer`);
            }
          }
          // Ensure no overlap between heavyCodes and ocCodes
          if (Array.isArray(dual.heavyCodes)) {
            const heavySet = new Set(dual.heavyCodes);
            const overlapping = (dual.ocCodes as number[]).filter((c: number) => heavySet.has(c));
            if (overlapping.length > 0) {
              errors.push(`Dual Mode: Codes [${overlapping.join(', ')}] cannot be in both Heavy and OC categories`);
            }
          }
        }
      } else {
        // Ensure ocCodes is always initialized
        config.classifications.dual.ocCodes = [];
      }
    }

    
    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: errors
        },
        { status: 400 }
      );
    }
    
    // Save configuration
    await saveRainfallConfig(config);
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully',
      config
    });
    
  } catch (error: any) {
    console.error('Failed to save rainfall config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error saving configuration',
        details: error.message || error.toString()
      },
      { status: 500 }
    );
  }
}
