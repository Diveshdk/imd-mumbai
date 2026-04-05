/**
 * Client-side hook for loading rainfall configuration
 * Updated to support dual/multi mode system
 */

'use client';

import { useState, useEffect } from 'react';

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

export interface MultiModeConfig {
  enabled: boolean;
  items: MultiModeClassification[];
}

export interface RainfallConfig {
  mode: 'dual' | 'multi';
  classifications: {
    dual: DualModeConfig;
    multi: MultiModeConfig;
  };
  lastUpdated: string;
}

export function useRainfallConfig() {
  const [config, setConfig] = useState<RainfallConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/rainfall-config');
      const result = await response.json();

      if (result.success) {
        setConfig(result.config);
      } else {
        setError(result.error || 'Failed to load configuration');
      }
    } catch (err: any) {
      console.error('Failed to load rainfall config:', err);
      setError('Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return {
    config,
    isLoading,
    error,
    reload: loadConfig
  };
}

/**
 * Get available classification labels based on current mode
 * Does NOT expose thresholds or codes
 */
export function getAvailableLabels(config: RainfallConfig | null): string[] {
  if (!config) return [];
  
  if (config.mode === 'dual') {
    return [config.classifications.dual.labels.below, config.classifications.dual.labels.above];
  } else {
    return config.classifications.multi.items
      .filter(item => item.enabled)
      .sort((a, b) => a.order - b.order)
      .map(item => item.variableName);
  }
}
