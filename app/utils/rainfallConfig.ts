/**
 * Enhanced Rainfall Classification Configuration
 * Supports Dual Mode (binary) and Multi Mode (advanced)
 * Admin-controlled with complete user-side hiding
 */

import fs from 'fs';
import path from 'path';
import { kv } from '@vercel/kv';

// Dual Mode Configuration
export interface DualModeConfig {
  enabled: boolean;
  threshold: number;
  heavyCodes: number[];
  ocCodes: number[]; // Other Category codes — treated as LOW on backend, shown as 'OC' on frontend
  labels: {
    below: string;
    above: string;
  };
}

export interface MultiModeClassification {
  id: string;
  variableName: string;
  label: string;
  thresholdMm: number;
  codes: number[];
  enabled: boolean;
  order: number;
  level: number;
  parentCategory: 'LOW' | 'HEAVY';
}

// Multi Mode Configuration
export interface MultiModeConfig {
  enabled: boolean;
  items: MultiModeClassification[];
}

// Overall Configuration
export interface RainfallConfig {
  mode: 'dual' | 'multi';
  classifications: {
    dual: DualModeConfig;
    multi: MultiModeConfig;
  };
  lastUpdated: string;
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'rainfall-config.json');

// Cache for configuration
let configCache: RainfallConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Load rainfall classification configuration
 */
export async function loadRainfallConfig(): Promise<RainfallConfig> {
  const now = Date.now();
  
  if (configCache && (now - cacheTimestamp) < CACHE_TTL) {
    return configCache;
  }
  let config: RainfallConfig | null = null;

  // 1. Try Vercel KV first (if environment variables are present)
  const kvUrl = (process.env.KV_REST_API_URL || process.env.STORE_KV_REST_API_URL)?.trim();
  if (kvUrl) {
    try {
      config = await kv.get<RainfallConfig>('rainfall_config');
    } catch (kvError) {
      console.error('KV load error (falling back to FS):', kvError);
    }
  }

  // 2. Fallback to Local Filesystem
  if (!config) {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const fileContent = await fs.promises.readFile(CONFIG_PATH, 'utf-8');
        config = JSON.parse(fileContent);
      }
    } catch (fsError) {
      console.error('FS load error (using defaults):', fsError);
    }
  }
  
  if (config) {
    // Migration: Ensure multi-mode items have parentCategory
    const dualThreshold = config.classifications.dual.threshold || 64.5;
    if (config.classifications.multi && config.classifications.multi.items) {
      config.classifications.multi.items = config.classifications.multi.items.map(item => {
        if (!item.parentCategory) {
          return {
            ...item,
            parentCategory: item.thresholdMm >= dualThreshold ? 'HEAVY' : 'LOW'
          };
        }
        return item;
      });
    }

    // Migration: Ensure dual-mode has heavyCodes
    if (!config.classifications.dual.heavyCodes) {
      config.classifications.dual.heavyCodes = [5, 27, 33, 37, 45, 56]; // Default heavy codes
    }

    // Migration: Ensure dual-mode has ocCodes
    if (!config.classifications.dual.ocCodes) {
      config.classifications.dual.ocCodes = [];
    }

    configCache = config;
    cacheTimestamp = now;
    return config;
  }

  // 3. Last Resort: Default Config
  const defaultConfig: RainfallConfig = {
      mode: 'dual',
      classifications: {
        dual: {
          enabled: true,
          threshold: 64.5,
          heavyCodes: [5, 27, 33, 37, 45, 56],
          ocCodes: [],
          labels: {
            below: 'L',
            above: 'H'
          }
        },
        multi: {
          enabled: false,
          items: [
            { id: 'VL', variableName: 'VL', label: 'Very Light', thresholdMm: 0.1, codes: [2, 3], enabled: true, order: 1, level: 1, parentCategory: 'LOW' },
            { id: 'L', variableName: 'L', label: 'Light', thresholdMm: 2.5, codes: [4], enabled: true, order: 2, level: 2, parentCategory: 'LOW' },
            { id: 'M', variableName: 'M', label: 'Moderate', thresholdMm: 15.6, codes: [5, 6, 7], enabled: true, order: 3, level: 3, parentCategory: 'LOW' },
            { id: 'H', variableName: 'H', label: 'Heavy', thresholdMm: 64.5, codes: [27, 33, 37, 45, 56], enabled: true, order: 4, level: 4, parentCategory: 'HEAVY' },
            { id: 'VH', variableName: 'VH', label: 'Very Heavy', thresholdMm: 115.6, codes: [8, 9, 10, 11, 12, 25, 28, 34, 39, 44], enabled: true, order: 5, level: 5, parentCategory: 'HEAVY' },
            { id: 'XH', variableName: 'XH', label: 'Extremely Heavy', thresholdMm: 204.5, codes: [26, 29, 35, 38], enabled: true, order: 6, level: 6, parentCategory: 'HEAVY' }
          ]
        }
      },
      lastUpdated: new Date().toISOString()
    };
    
    configCache = defaultConfig;
    cacheTimestamp = now;
    return defaultConfig;
}

/**
 * Save rainfall classification configuration
 */
export async function saveRainfallConfig(config: RainfallConfig): Promise<void> {
  try {
    config.lastUpdated = new Date().toISOString();
    
    // 1. Try saving to Vercel KV if available
    const kvUrl = (process.env.KV_REST_API_URL || process.env.STORE_KV_REST_API_URL)?.trim();
    if (kvUrl) {
      await kv.set('rainfall_config', config);
    }

    // 2. Try saving to Filesystem (will fail on Vercel but work locally)
    try {
      const dataDir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dataDir)) {
        await fs.promises.mkdir(dataDir, { recursive: true });
      }
      
      await fs.promises.writeFile(
        CONFIG_PATH,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    } catch (fsError) {
      // On Vercel this is expected to fail, we only log it if KV is also missing
      const kvUrl = (process.env.KV_REST_API_URL || process.env.STORE_KV_REST_API_URL)?.trim();
      if (!kvUrl) {
        console.error('Failed to save to FS and KV is not available:', fsError);
        throw fsError;
      }
      console.log('Skipped FS save (likely on Vercel)');
    }
    
    // Clear cache
    configCache = null;
    cacheTimestamp = 0;
  } catch (error: any) {
    console.error('Failed to save rainfall config:', error);
    throw new Error('Failed to save configuration: ' + error.message);
  }
}

/**
 * Classify rainfall in DUAL MODE
 * Simple binary: Below 64.5mm = L, >= 64.5mm = H
 */
export function classifyInDualMode(rainfall: number, config: RainfallConfig): string {
  const dualConfig = config.classifications.dual;
  return rainfall >= dualConfig.threshold ? dualConfig.labels.above : dualConfig.labels.below;
}

/**
 * Classify rainfall in MULTI MODE
 * Find highest enabled threshold that rainfall meets or exceeds
 */
export function classifyInMultiMode(rainfall: number, config: RainfallConfig): string {
  if (rainfall < 0) return 'INVALID';
  
  const multiConfig = config.classifications.multi;
  const enabledItems = multiConfig.items.filter(item => item.enabled);
  
  // Sort by threshold descending
  const sorted = [...enabledItems].sort((a, b) => b.thresholdMm - a.thresholdMm);
  
  // Find highest threshold that rainfall meets or exceeds
  for (const item of sorted) {
    if (rainfall >= item.thresholdMm) {
      return item.variableName;
    }
  }
  
  // Default to lowest classification
  return enabledItems[0]?.variableName || 'L';
}

/**
 * Classify rainfall based on current mode
 */
export async function classifyRainfall(rainfall: number): Promise<string> {
  const config = await loadRainfallConfig();
  
  if (config.mode === 'dual') {
    return classifyInDualMode(rainfall, config);
  } else {
    return classifyInMultiMode(rainfall, config);
  }
}

/**
 * Classify warning code in DUAL MODE
 * Uses config-based logic:
 *   - heavyCodes → labels.above (H)
 *   - ocCodes → 'OC' (displayed as OC in frontend, treated as LOW on backend)
 *   - Everything else → labels.below (L)
 */
export function classifyCodeInDualMode(code: number, config: RainfallConfig): string {
  const dualConfig = config.classifications.dual;
  const heavyCodes = dualConfig.heavyCodes || [5, 27, 33, 37, 45, 56];
  if (heavyCodes.includes(code)) return dualConfig.labels.above;
  const ocCodes = dualConfig.ocCodes || [];
  if (ocCodes.includes(code)) return 'OC';
  return dualConfig.labels.below;
}

/**
 * Classify warning code in MULTI MODE
 * Check if code exists in any enabled classification's code array
 */
export function classifyCodeInMultiMode(code: number, config: RainfallConfig): string | null {
  const multiConfig = config.classifications.multi;
  const enabledItems = multiConfig.items.filter(item => item.enabled);
  
  for (const item of enabledItems) {
    if (item.codes.includes(code)) {
      return item.variableName;
    }
  }
  
  return null;
}

/**
 * Classify warning code based on current mode
 */
export async function classifyCode(code: number): Promise<string> {
  const config = await loadRainfallConfig();
  
  if (config.mode === 'dual') {
    return classifyCodeInDualMode(code, config);
  } else {
    const classification = classifyCodeInMultiMode(code, config);
    return classification || 'L'; // Default to L if code not found
  }
}

/**
 * Switch mode and update configuration
 */
export async function switchMode(newMode: 'dual' | 'multi'): Promise<RainfallConfig> {
  const config = await loadRainfallConfig();
  
  if (config.mode === newMode) {
    return config; // Already in this mode
  }
  
  // Switch mode
  config.mode = newMode;
  
  // Update enabled flags
  config.classifications.dual.enabled = (newMode === 'dual');
  config.classifications.multi.enabled = (newMode === 'multi');
  
  // Save configuration
  await saveRainfallConfig(config);
  
  return config;
}

/**
 * Clear configuration cache
 */
export function clearConfigCache(): void {
  configCache = null;
  cacheTimestamp = 0;
}

/**
 * Get public classification info (for user-facing display)
 * Returns ONLY labels, no thresholds or codes
 */
export async function getPublicClassificationInfo(): Promise<{
  mode: 'dual' | 'multi';
  availableLabels: string[];
}> {
  const config = await loadRainfallConfig();
  
  let availableLabels: string[] = [];
  
  if (config.mode === 'dual') {
    availableLabels = [
      config.classifications.dual.labels.below,
      config.classifications.dual.labels.above
    ];
  } else {
    availableLabels = config.classifications.multi.items
      .filter(item => item.enabled)
      .sort((a, b) => a.order - b.order)
      .map(item => item.variableName);
  }
  
  return {
    mode: config.mode,
    availableLabels
  };
}
/**
 * Get the numeric level of a classification label
 * OC is treated as level 1 (same as Less/L) for backend skill-score math
 */
export async function getLevelByLabel(label: string): Promise<number> {
  const config = await loadRainfallConfig();
  
  if (config.mode === 'dual') {
    // OC is treated as LOW (level 1) for skill score purposes
    if (label === 'OC') return 1;
    return label === config.classifications.dual.labels.above ? 2 : 1;
  } else {
    const item = config.classifications.multi.items.find(i => i.variableName === label);
    return item ? item.level : 1;
  }
}
/**
 * Get the parent category (LOW/HEAVY) of a classification label
 * OC is treated as LOW for backend skill-score math
 */
export async function getParentCategoryByLabel(label: string): Promise<'LOW' | 'HEAVY'> {
  const config = await loadRainfallConfig();
  
  if (config.mode === 'dual') {
    // OC is treated as LOW for skill score purposes
    if (label === 'OC') return 'LOW';
    return label === config.classifications.dual.labels.above ? 'HEAVY' : 'LOW';
  } else {
    const item = config.classifications.multi.items.find(i => i.variableName === label);
    return item ? item.parentCategory : 'LOW';
  }
}
