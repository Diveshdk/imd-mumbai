import { NextRequest, NextResponse } from 'next/server';
import {
  loadRainfallConfig,
  saveRainfallConfig,
  type RainfallConfig,
  type MultiModeClassification
} from '@/app/utils/rainfallConfig';

// Admin password (in production, use environment variable)
const ADMIN_PASSWORD = 'admin123';

/**
 * GET /api/admin/rainfall-config
 * Fetch current rainfall classification configuration
 */
export async function GET(request: NextRequest) {
  try {
    const config = await loadRainfallConfig();
    
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Failed to load rainfall config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load configuration',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/rainfall-config
 * Save updated rainfall classification configuration
 * Requires password authentication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, config } = body;
    
    // Validate password
    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid password'
        },
        { status: 401 }
      );
    }
    
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
            errors.push(`Dual Mode: Code ${code} must be a non-negative integer`);
          }
        }
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
