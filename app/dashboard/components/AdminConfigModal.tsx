'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import type { RainfallConfig, MultiModeClassification } from '@/app/utils/useRainfallConfig';

interface AdminConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminConfigModal({ isOpen, onClose }: AdminConfigModalProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState<RainfallConfig | null>(null);
  const [editedConfig, setEditedConfig] = useState<RainfallConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<'dual' | 'multi' | null>(null);
  // Local string state for threshold inputs to allow free-form typing
  const [thresholdInputs, setThresholdInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isAuthenticated && !config) {
      loadConfig();
    }
  }, [isAuthenticated]);



  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/rainfall-config');
      const result = await response.json();

      if (result.success) {
        // Migration: Ensure all items have parentCategory
        const config: RainfallConfig = result.config;
        if (config.classifications.multi && config.classifications.multi.items) {
          config.classifications.multi.items = config.classifications.multi.items.map(item => ({
            ...item,
            parentCategory: item.parentCategory || (item.thresholdMm >= 64.5 ? 'HEAVY' : 'LOW')
          }));
        }

        setConfig(config);
        setEditedConfig(JSON.parse(JSON.stringify(config)));
      } else {
        toast.error('Failed to load configuration');
      }
    } catch (error: any) {
      console.error('Load error:', error);
      toast.error('Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === 'admin123') {
      setIsAuthenticated(true);
      toast.success('Access granted');
    } else {
      toast.error('Invalid password');
      setPassword('');
    }
  };

  const handleModeChange = (newMode: 'dual' | 'multi') => {
    if (!editedConfig || editedConfig.mode === newMode) return;
    
    setPendingMode(newMode);
    setShowModeConfirm(true);
  };

  const confirmModeSwitch = async () => {
    if (!pendingMode) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/rainfall-config/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: 'admin123',
          mode: pendingMode
        })
      });

      const result = await response.json();

      if (result.success) {
        setConfig(result.config);
        setEditedConfig(JSON.parse(JSON.stringify(result.config)));
        toast.success(`Switched to ${pendingMode} mode`);
        setShowModeConfirm(false);
        setPendingMode(null);
      } else {
        toast.error(result.error || 'Failed to switch mode');
      }
    } catch (error: any) {
      console.error('Mode switch error:', error);
      toast.error('Failed to switch mode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editedConfig) return;

    setIsSaving(true);
    try {
      // Auto-sort and re-level items based on threshold before saving
      // This ensures Level 1, 2, 3 always match ascending rainfall intensity
      const sortedItems = [...editedConfig.classifications.multi.items]
        .sort((a, b) => a.thresholdMm - b.thresholdMm)
        .map((item, index) => ({
          ...item,
          level: index + 1,
          order: index + 1,
          parentCategory: item.thresholdMm >= 64.5 ? 'HEAVY' : 'LOW'
        } as MultiModeClassification));

      const finalConfig = {
        ...editedConfig,
        classifications: {
          ...editedConfig.classifications,
          multi: {
            ...editedConfig.classifications.multi,
            items: sortedItems
          }
        }
      };

      const response = await fetch('/api/admin/rainfall-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: 'admin123',
          config: finalConfig
        })
      });

      const result = await response.json();

      if (result.success) {
        setConfig(result.config);
        setEditedConfig(JSON.parse(JSON.stringify(result.config)));
        toast.success('Configuration saved successfully!');
      } else {
        const errorMsg = result.error || 'Failed to save configuration';
        const details = Array.isArray(result.details) 
          ? result.details.join('\n') 
          : result.details;
        
        toast.error(
          <div className="max-w-xs overflow-hidden">
            <div className="font-bold">{errorMsg}</div>
            {details && <div className="text-xs mt-1 whitespace-pre-wrap">{details}</div>}
          </div>,
          { duration: 5000 }
        );
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (config) {
      setEditedConfig(JSON.parse(JSON.stringify(config)));
      toast.success('Changes discarded');
    }
  };

  const handleAddClassification = () => {
    if (!editedConfig) return;

    // Find a default threshold that isn't 0 to avoid immediate duplicates
    const items = editedConfig.classifications.multi.items;
    const maxThreshold = items.length > 0 ? Math.max(...items.map(i => i.thresholdMm)) : 0;
    const newThreshold = maxThreshold + 5.0;

    const newItem: MultiModeClassification = {
      id: `NEW_${Date.now()}`,
      variableName: 'NEW',
      label: 'New Classification',
      thresholdMm: newThreshold,
      codes: [],
      enabled: true,
      order: items.length + 1,
      level: items.length + 1,
      parentCategory: newThreshold >= 64.5 ? 'HEAVY' : 'LOW'
    };

    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        multi: {
          ...editedConfig.classifications.multi,
          items: [...editedConfig.classifications.multi.items, newItem]
        }
      }
    });
  };

  const handleDeleteClassification = (index: number) => {
    if (!editedConfig) return;

    if (confirm('Are you sure you want to delete this classification?')) {
      const newItems = editedConfig.classifications.multi.items.filter((_, i) => i !== index);
      setEditedConfig({
        ...editedConfig,
        classifications: {
          ...editedConfig.classifications,
          multi: {
            ...editedConfig.classifications.multi,
            items: newItems
          }
        }
      });
      toast.success('Classification removed');
    }
  };

  const handleUpdateClassification = (index: number, field: keyof MultiModeClassification, value: any) => {
    if (!editedConfig) return;

    const newItems = [...editedConfig.classifications.multi.items];
    newItems[index] = {
      ...newItems[index],
      [field]: value
    };

    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        multi: {
          ...editedConfig.classifications.multi,
          items: newItems
        }
      }
    });
  };

  // Handle threshold input change (tracks raw string, does NOT update config)
  const handleThresholdChange = (itemId: string, raw: string) => {
    setThresholdInputs(prev => ({ ...prev, [itemId]: raw }));
  };

  // On blur, commit the parsed value to config (batches threshold + parentCategory in one update)
  const handleThresholdBlur = (actualIndex: number, itemId: string) => {
    if (!editedConfig) return;
    const raw = thresholdInputs[itemId] ?? '';
    const val = parseFloat(raw);
    if (isNaN(val)) return;

    const newItems = [...editedConfig.classifications.multi.items];
    newItems[actualIndex] = {
      ...newItems[actualIndex],
      thresholdMm: val,
      parentCategory: val >= 64.5 ? 'HEAVY' : 'LOW'
    };

    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        multi: {
          ...editedConfig.classifications.multi,
          items: newItems
        }
      }
    });
  };

  const handleDualThresholdBlur = () => {
    if (!editedConfig) return;
    const raw = thresholdInputs['dual-threshold'] ?? '';
    const val = parseFloat(raw);
    if (isNaN(val)) return;

    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        dual: {
          ...editedConfig.classifications.dual,
          threshold: val
        }
      }
    });
  };

  const handleCodesChange = (index: number, codesString: string) => {
    const codes = codesString
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s))
      .filter(n => !isNaN(n));

    handleUpdateClassification(index, 'codes', codes);
  };

  const handleAddCode = (index: number, code: number) => {
    if (!editedConfig) return;

    const currentItem = editedConfig.classifications.multi.items[index];
    
    // Check if code already exists in current classification
    if (currentItem.codes.includes(code)) {
      toast.error(`Code ${code} already exists in this classification`);
      return;
    }

    // Check if code exists in other classifications
    const otherUsedCodes = getAllUsedCodes(index);
    if (otherUsedCodes.includes(code)) {
      toast.error(`Code ${code} is already used in another classification`);
      return;
    }

    // Add the code
    const newCodes = [...currentItem.codes, code].sort((a, b) => a - b);
    handleUpdateClassification(index, 'codes', newCodes);
    toast.success(`Code ${code} added successfully`);
  };

  const handleRemoveCode = (index: number, code: number) => {
    if (!editedConfig) return;

    const currentItem = editedConfig.classifications.multi.items[index];
    const newCodes = currentItem.codes.filter(c => c !== code);
    handleUpdateClassification(index, 'codes', newCodes);
    toast.success(`Code ${code} removed`);
  };

  const handleAddOcCode = (code: number) => {
    if (!editedConfig) return;

    const currentOcCodes = editedConfig.classifications.dual.ocCodes || [];
    const currentHeavyCodes = editedConfig.classifications.dual.heavyCodes || [];

    if (currentOcCodes.includes(code)) {
      toast.error(`Code ${code} already exists in OC category`);
      return;
    }
    if (currentHeavyCodes.includes(code)) {
      toast.error(`Code ${code} is already in the Heavy category — remove it there first`);
      return;
    }

    const newCodes = [...currentOcCodes, code].sort((a, b) => a - b);
    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        dual: {
          ...editedConfig.classifications.dual,
          ocCodes: newCodes
        }
      }
    });
    toast.success(`Code ${code} added to OC category`);
  };

  const handleRemoveOcCode = (code: number) => {
    if (!editedConfig) return;

    const currentCodes = editedConfig.classifications.dual.ocCodes || [];
    const newCodes = currentCodes.filter(c => c !== code);
    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        dual: {
          ...editedConfig.classifications.dual,
          ocCodes: newCodes
        }
      }
    });
    toast.success(`Code ${code} removed from OC category`);
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const response = await fetch('/api/admin/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'admin123' })
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Cache cleared! The website will now serve fresh data.');
      } else {
        toast.error(result.error || 'Failed to clear cache');
      }
    } catch (error: any) {
      toast.error('Failed to clear cache: ' + error.message);
    } finally {
      setIsClearingCache(false);
    }
  };


  const handleAddDualCode = (code: number) => {
    if (!editedConfig) return;

    const currentCodes = editedConfig.classifications.dual.heavyCodes || [];
    
    if (currentCodes.includes(code)) {
      toast.error(`Code ${code} already exists in Heavy category`);
      return;
    }

    // Ensure the code isn't already in OC category
    const ocCodes = editedConfig.classifications.dual.ocCodes || [];
    if (ocCodes.includes(code)) {
      toast.error(`Code ${code} is already in the OC category — remove it there first`);
      return;
    }

    const newCodes = [...currentCodes, code].sort((a, b) => a - b);
    
    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        dual: {
          ...editedConfig.classifications.dual,
          heavyCodes: newCodes
        }
      }
    });
    toast.success(`Code ${code} added to Heavy category`);
  };

  const handleRemoveDualCode = (code: number) => {
    if (!editedConfig) return;

    const currentCodes = editedConfig.classifications.dual.heavyCodes || [];
    const newCodes = currentCodes.filter(c => c !== code);
    
    setEditedConfig({
      ...editedConfig,
      classifications: {
        ...editedConfig.classifications,
        dual: {
          ...editedConfig.classifications.dual,
          heavyCodes: newCodes
        }
      }
    });
    toast.success(`Code ${code} removed from Heavy category`);
  };




  const getAllUsedCodes = (excludeIndex?: number): number[] => {
    if (!editedConfig) return [];
    
    const allCodes: number[] = [];
    editedConfig.classifications.multi.items.forEach((item, idx) => {
      if (excludeIndex === undefined || idx !== excludeIndex) {
        allCodes.push(...item.codes);
      }
    });
    
    return allCodes;
  };

  const getDuplicateCodes = (index: number): number[] => {
    if (!editedConfig) return [];
    
    const currentCodes = editedConfig.classifications.multi.items[index].codes;
    const otherCodes = getAllUsedCodes(index);
    
    return currentCodes.filter(code => otherCodes.includes(code));
  };

  const handleClose = () => {
    setIsAuthenticated(false);
    setPassword('');
    setConfig(null);
    setEditedConfig(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">
              Admin Configuration - Rainfall Classification System
            </h2>
            <button onClick={handleClose} className="text-white hover:text-gray-200 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {!isAuthenticated ? (
              // Password Form
              <div className="max-w-md mx-auto">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-yellow-800 font-medium">Admin Access Required</span>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter Admin Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    Authenticate
                  </button>
                </form>
              </div>
            ) : isLoading ? (
              // Loading State
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading configuration...</p>
                </div>
              </div>
            ) : editedConfig ? (
              // Configuration Interface
              <div className="space-y-6">
                {/* Mode Selector */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Classification Mode</h3>
                  <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="mode"
                        value="dual"
                        checked={editedConfig.mode === 'dual'}
                        onChange={() => handleModeChange('dual')}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">
                        <strong>Dual Mode</strong> (Simple Binary)
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="mode"
                        value="multi"
                        checked={editedConfig.mode === 'multi'}
                        onChange={() => handleModeChange('multi')}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">
                        <strong>Multi Mode</strong> (Advanced Custom)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Dual Mode Panel */}
                {editedConfig.mode === 'dual' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-blue-900 mb-4">Dual Mode Configuration</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white rounded-lg p-4 border border-blue-200">
                        <p className="text-sm text-gray-700 mb-3">
                          <strong>Classification Logic:</strong>
                        </p>
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Rainfall Threshold (mm)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                thresholdInputs['dual-threshold'] !== undefined
                                  ? thresholdInputs['dual-threshold']
                                  : String(editedConfig.classifications.dual.threshold)
                              }
                              onChange={(e) => handleThresholdChange('dual-threshold', e.target.value)}
                              onBlur={handleDualThresholdBlur}
                              onFocus={() => {
                                if (thresholdInputs['dual-threshold'] === undefined) {
                                  setThresholdInputs(prev => ({ 
                                    ...prev, 
                                    ['dual-threshold']: String(editedConfig.classifications.dual.threshold) 
                                  }));
                                }
                              }}
                              className="w-24 px-2 py-1 border border-blue-300 rounded text-sm text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-500 italic">mm</span>
                          </div>
                        </div>
                        <ul className="space-y-4 text-sm text-gray-600">
                          <li className="flex flex-col gap-2">
                            <div className="flex items-center">
                              <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                              <span>Below {editedConfig.classifications.dual.threshold}mm → </span>
                              <strong className="ml-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                {editedConfig.classifications.dual.labels.below} (Less)
                              </strong>
                            </div>
                            <p className="text-[10px] text-gray-500 italic pl-5">
                              Applied to all codes NOT explicitly defined as Heavy.
                            </p>
                          </li>
                          <li className="flex flex-col gap-2">
                            <div className="flex items-center">
                              <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                              <span>≥ {editedConfig.classifications.dual.threshold}mm → </span>
                              <strong className="ml-1 text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                {editedConfig.classifications.dual.labels.above} (Heavy)
                              </strong>
                            </div>
                            <p className="text-[10px] text-gray-500 italic pl-5">
                              Applied to specific codes entered on the right.
                            </p>
                          </li>
                        </ul>
                        <div className="mt-6 pt-4 border-t border-gray-100">
                          <p className="text-[10px] text-gray-400">
                            Threshold is fixed at 64.5mm in Dual Mode. To use custom thresholds, switch to Multi Mode.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-blue-200">
                        <p className="text-sm font-semibold text-gray-900 mb-3">
                          Heavy Category Codes:
                        </p>
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              id="dual-code-input"
                              placeholder="Enter code (e.g. 5)"
                              className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const input = e.currentTarget;
                                  const code = parseInt(input.value);
                                  if (!isNaN(code)) {
                                    handleAddDualCode(code);
                                    input.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById('dual-code-input') as HTMLInputElement;
                                if (input) {
                                  const code = parseInt(input.value);
                                  if (!isNaN(code)) {
                                    handleAddDualCode(code);
                                    input.value = '';
                                  }
                                }
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
                            >
                              Add
                            </button>
                          </div>
                          
                          <div className="min-h-[100px] border border-gray-100 rounded-md p-3 bg-gray-50">
                            <div className="flex flex-wrap gap-2">
                              {(editedConfig.classifications.dual.heavyCodes || []).map((code) => (
                                <div
                                  key={code}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs font-semibold shadow-sm animate-in fade-in zoom-in duration-200"
                                >
                                  <span>{code}</span>
                                  <button
                                    onClick={() => handleRemoveDualCode(code)}
                                    className="hover:text-red-900 transition-colors p-0.5"
                                    title="Remove code"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              {(editedConfig.classifications.dual.heavyCodes || []).length === 0 && (
                                <p className="text-xs text-gray-400 italic py-2">No codes added. All rainfall will be classified as 'Less'.</p>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500 italic">
                            All codes NOT listed here will automatically fall into the <strong>Less Rainfall ({editedConfig.classifications.dual.labels.below})</strong> category.
                          </p>
                        </div>
                      </div>
                      {/* OC (Other Category) Codes */}
                      <div className="bg-white rounded-lg p-4 border border-purple-200 mt-4">
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          Other Category (OC) Codes:
                        </p>
                        <p className="text-xs text-purple-700 mb-3 italic">
                          These codes are treated as <strong>Less Rainfall</strong> on the backend (skill scores), but displayed as <strong>OC</strong> in the verification sheet frontend.
                        </p>
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              id="oc-code-input"
                              placeholder="Enter OC code"
                              className="flex-1 px-3 py-2 border border-purple-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-400"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const input = e.currentTarget;
                                  const code = parseInt(input.value);
                                  if (!isNaN(code)) {
                                    handleAddOcCode(code);
                                    input.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById('oc-code-input') as HTMLInputElement;
                                if (input) {
                                  const code = parseInt(input.value);
                                  if (!isNaN(code)) {
                                    handleAddOcCode(code);
                                    input.value = '';
                                  }
                                }
                              }}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
                            >
                              Add
                            </button>
                          </div>

                          <div className="min-h-[80px] border border-gray-100 rounded-md p-3 bg-gray-50">
                            <div className="flex flex-wrap gap-2">
                              {(editedConfig.classifications.dual.ocCodes || []).map((code) => (
                                <div
                                  key={code}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-md text-xs font-semibold shadow-sm"
                                >
                                  <span>{code}</span>
                                  <button
                                    onClick={() => handleRemoveOcCode(code)}
                                    className="hover:text-purple-900 transition-colors p-0.5"
                                    title="Remove OC code"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              {(editedConfig.classifications.dual.ocCodes || []).length === 0 && (
                                <p className="text-xs text-gray-400 italic py-2">No OC codes added. All non-Heavy codes will be classified as 'Less'.</p>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500 italic">
                            OC codes appear as <strong>OC</strong> in the verification sheet but count as Less for skill scores (POD/FAR/CSI/BIAS).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Multi Mode Panel */}
                {editedConfig.mode === 'multi' && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-green-900 mb-2">Multi Mode Configuration</h3>
                      <p className="text-xs text-green-700 mb-2">
                        Define classifications by setting their <strong>Base Rainfall (mm)</strong>. The system will automatically calculate the ranges and sort them in ascending order.
                      </p>
                    </div>

                    {/* Classification Table */}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category Name</th>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base (mm)</th>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calculated Range</th>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Associated Codes</th>
                            <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Enabled</th>
                            <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {[...editedConfig.classifications.multi.items]
                            .sort((a, b) => a.thresholdMm - b.thresholdMm)
                            .map((item, index, sortedItems) => {
                              const nextItem = sortedItems[index + 1];
                              const displayRange = nextItem 
                                ? `${item.thresholdMm.toFixed(1)} - ${nextItem.thresholdMm.toFixed(1)}` 
                                : `Above ${item.thresholdMm.toFixed(1)}`;
                              
                              const duplicates = getDuplicateCodes(index);
                              const otherUsedCodes = getAllUsedCodes(index);
                              const actualIndex = editedConfig.classifications.multi.items.findIndex(i => i.id === item.id);

                              return (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                  {/* Category Name */}
                                  <td className="px-3 py-4 align-top">
                                    <input
                                      type="text"
                                      value={item.variableName}
                                      onChange={(e) => handleUpdateClassification(actualIndex, 'variableName', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder="e.g. LOW"
                                    />
                                  </td>

                                  {/* Base Rainfall (Threshold) */}
                                  <td className="px-3 py-4 align-top w-28">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={
                                        thresholdInputs[item.id] !== undefined
                                          ? thresholdInputs[item.id]
                                          : String(item.thresholdMm)
                                      }
                                      onChange={(e) => handleThresholdChange(item.id, e.target.value)}
                                      onBlur={() => handleThresholdBlur(actualIndex, item.id)}
                                      onFocus={() => {
                                        // Initialize local string state from config value when focusing
                                        if (thresholdInputs[item.id] === undefined) {
                                          setThresholdInputs(prev => ({ ...prev, [item.id]: String(item.thresholdMm) }));
                                        }
                                      }}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder="e.g. 64.5"
                                    />
                                  </td>

                                  {/* Calculated Range */}
                                  <td className="px-3 py-4 align-top w-36">
                                    <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 block text-center min-h-[28px]">
                                      {displayRange}
                                    </span>
                                  </td>

                                  {/* Associated Codes */}
                                  <td className="px-3 py-4 align-top">
                                    <div className="space-y-2">
                                      <div className="flex gap-1">
                                        <input
                                          type="number"
                                          id={`code-input-${item.id}`}
                                          placeholder="Add code"
                                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const input = e.currentTarget;
                                              const code = parseInt(input.value);
                                              if (!isNaN(code)) {
                                                handleAddCode(actualIndex, code);
                                                input.value = '';
                                              }
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            const input = document.getElementById(`code-input-${item.id}`) as HTMLInputElement;
                                            if (input) {
                                              const code = parseInt(input.value);
                                              if (!isNaN(code)) {
                                                handleAddCode(actualIndex, code);
                                                input.value = '';
                                              }
                                            }
                                          }}
                                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                        >
                                          Add
                                        </button>
                                      </div>
                                      
                                      <div className="flex flex-wrap gap-1">
                                        {item.codes.map((code) => {
                                          const isDuplicate = otherUsedCodes.includes(code);
                                          return (
                                            <div
                                              key={code}
                                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                                isDuplicate
                                                  ? 'bg-red-100 border border-red-300 text-red-800'
                                                  : 'bg-blue-100 border border-blue-300 text-blue-800'
                                              }`}
                                            >
                                              <span className="font-bold">{code}</span>
                                              <button
                                                onClick={() => handleRemoveCode(actualIndex, code)}
                                                className="hover:text-red-600"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {duplicates.length > 0 && (
                                        <p className="text-[10px] text-red-600 font-medium">Duplicate codes found!</p>
                                      )}
                                    </div>
                                  </td>

                                  {/* Enabled Toggle */}
                                  <td className="px-3 py-4 align-top text-center w-20">
                                    <input
                                      type="checkbox"
                                      checked={item.enabled}
                                      onChange={(e) => handleUpdateClassification(actualIndex, 'enabled', e.target.checked)}
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                  </td>

                                  {/* Delete Action */}
                                  <td className="px-3 py-4 align-top text-center w-16">
                                    <button
                                      onClick={() => handleDeleteClassification(actualIndex)}
                                      className="text-red-500 hover:text-red-700 transition-colors"
                                      title="Delete"
                                    >
                                      <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Button */}
                    <button
                      onClick={handleAddClassification}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add New Classification Category
                    </button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-gray-200">
                  {/* Left: Cache */}
                  <button
                    onClick={handleClearCache}
                    disabled={isClearingCache || isSaving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                    title="Clear server-side cache so the website fetches fresh data from disk"
                  >
                    {isClearingCache ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Clearing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Clear Website Cache
                      </>
                    )}
                  </button>

                  {/* Right: Cancel + Save */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel Changes
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Configuration
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mode Switch Confirmation Dialog */}
      {showModeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Mode Switch</h3>
            <p className="text-sm text-gray-600 mb-6">
              {pendingMode === 'dual' 
                ? 'Switching to Dual Mode will use a fixed 64.5mm threshold for binary classification (L/H).'
                : 'Switching to Multi Mode will enable advanced custom classifications with multiple levels.'}
            </p>
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3 mb-6">
              <strong>Warning:</strong> All verification results will be recalculated based on the new mode.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModeConfirm(false);
                  setPendingMode(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmModeSwitch}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
              >
                {isSaving ? 'Switching...' : 'Confirm Switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
