/**
 * Rainfall Classification Utilities
 * Based on IMD thresholds for Maharashtra and Goa
 */

export interface RainfallCategory {
  name: string;
  color: string;
  min: number;
  max: number | null;
}

export const RAINFALL_CATEGORIES: RainfallCategory[] = [
  { name: 'No Rainfall', color: '#D3D3D3', min: 0, max: 0 },
  { name: 'Very Light Rain', color: '#E1F5FE', min: 0.1, max: 2.4 },
  { name: 'Light Rain', color: '#FFFFE0', min: 2.5, max: 15.5 },
  { name: 'Moderate Rain', color: '#FFFF00', min: 15.6, max: 64.4 },
  { name: 'Heavy Rain', color: '#FFA500', min: 64.5, max: 115.5 },
  { name: 'Very Heavy Rain', color: '#FF0000', min: 115.6, max: 204.4 },
  { name: 'Extremely Heavy Rain', color: '#8B0000', min: 204.5, max: null },
];

/**
 * Get color based on rainfall value
 */
export function getRainfallColor(value: number): string {
  if (value === 0) return '#D3D3D3';
  if (value <= 2.4) return '#E1F5FE';
  if (value <= 15.5) return '#FFFFE0';
  if (value <= 64.4) return '#FFFF00';
  if (value <= 115.5) return '#FFA500';
  if (value <= 204.4) return '#FF0000';
  return '#8B0000';
}

/**
 * Get category name based on rainfall value
 */
export function getRainfallCategory(value: number): string {
  if (value === 0) return 'No Rainfall';
  if (value <= 2.4) return 'Very Light Rain';
  if (value <= 15.5) return 'Light Rain';
  if (value <= 64.4) return 'Moderate Rain';
  if (value <= 115.5) return 'Heavy Rain';
  if (value <= 204.4) return 'Very Heavy Rain';
  return 'Extremely Heavy Rain';
}

export { normalizeDistrictName } from './districtNormalizer';



/**
 * Monthly Rainfall Categories for CBAR (0 to 1500 mm)
 */
export const MONTHLY_RAINFALL_CATEGORIES: RainfallCategory[] = [
  { name: 'Very Low', color: '#E3F2FD', min: 0, max: 100 },
  { name: 'Low', color: '#90CAF9', min: 101, max: 250 },
  { name: 'Moderate', color: '#42A5F5', min: 251, max: 500 },
  { name: 'High', color: '#1E88E5', min: 501, max: 750 },
  { name: 'Very High', color: '#FDD835', min: 751, max: 1000 },
  { name: 'Extreme', color: '#FB8C00', min: 1001, max: 1250 },
  { name: 'Exceptional', color: '#E53935', min: 1251, max: 1500 },
  { name: 'Ultra Extreme', color: '#B71C1C', min: 1501, max: null },
];

/**
 * Get monthly color based on accumulated value
 */
export function getMonthlyRainfallColor(value: number): string {
  if (value <= 100) return '#E3F2FD';
  if (value <= 250) return '#90CAF9';
  if (value <= 500) return '#42A5F5';
  if (value <= 750) return '#1E88E5';
  if (value <= 1000) return '#FDD835';
  if (value <= 1250) return '#FB8C00';
  if (value <= 1500) return '#E53935';
  return '#B71C1C';
}

/**
 * Get monthly category name based on accumulated value
 */
export function getMonthlyRainfallCategory(value: number): string {
  if (value <= 100) return 'Very Low';
  if (value <= 250) return 'Low';
  if (value <= 500) return 'Moderate';
  if (value <= 750) return 'High';
  if (value <= 1000) return 'Very High';
  if (value <= 1250) return 'Extreme';
  if (value <= 1500) return 'Exceptional';
  return 'Ultra Extreme';
}

/**
 * Get continuous color based on rainfall value using linear interpolation
 */
export function getRainfallColorContinuous(rainfall: number): string {
  if (rainfall === 0) return '#D3D3D3';
  
  const stops = [
    { threshold: 0.1, color: [225, 245, 254] },   // #E1F5FE
    { threshold: 2.5, color: [255, 255, 224] },   // #FFFFE0
    { threshold: 15.6, color: [255, 255, 0] },    // #FFFF00
    { threshold: 64.5, color: [255, 165, 0] },    // #FFA500
    { threshold: 115.6, color: [255, 0, 0] },     // #FF0000
    { threshold: 204.5, color: [139, 0, 0] },     // #8B0000
  ];

  if (rainfall < stops[0].threshold) return `rgb(${stops[0].color.join(',')})`;
  if (rainfall >= stops[stops.length - 1].threshold) return `rgb(${stops[stops.length - 1].color.join(',')})`;

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (rainfall >= s1.threshold && rainfall < s2.threshold) {
      const range = s2.threshold - s1.threshold;
      const weight = (rainfall - s1.threshold) / range;
      
      const r = Math.round(s1.color[0] + (s2.color[0] - s1.color[0]) * weight);
      const g = Math.round(s1.color[1] + (s2.color[1] - s1.color[1]) * weight);
      const b = Math.round(s1.color[2] + (s2.color[2] - s1.color[2]) * weight);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return '#D3D3D3';
}

/**
 * Get color based on rainfall value using smooth continuous scale
 */
export function getRainfallColorDynamic(rainfall: number, config?: any): string {
  return getRainfallColorContinuous(rainfall);
}

/**
 * Get category based on rainfall value and current config
 */
export function getRainfallCategoryDynamic(rainfall: number, config: any): string {
  if (rainfall === 0) return 'No Rainfall';

  if (config?.mode === 'dual') {
    const dual = config.classifications.dual;
    return rainfall >= (dual?.threshold || 64.5) ? dual?.labels?.above || 'Heavy' : dual?.labels?.below || 'Light/No';
  } else {
    const items = [...(config?.classifications?.multi?.items || [])]
      .filter(i => i.enabled)
      .sort((a, b) => b.thresholdMm - a.thresholdMm);
    
    for (const item of items) {
      if (rainfall >= item.thresholdMm) {
        return item.label;
      }
    }
    return 'Less';
  }
}

/**
 * Find district column in GeoJSON properties
 */
export function findDistrictColumn(properties: any): string | null {
  const potentialCols = ['dtname', 'district', 'DISTRICT', 'NAME_2', 'Dist_Name', 'Name'];
  
  for (const col of potentialCols) {
    if (properties[col]) {
      return col;
    }
  }
  
  return null;
}
