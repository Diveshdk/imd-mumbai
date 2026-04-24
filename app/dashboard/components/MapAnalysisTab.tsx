'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-hot-toast';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';
import { MONTHLY_RAINFALL_CATEGORIES, RAINFALL_CATEGORIES } from '@/app/utils/rainfallColors';
import { downloadLeafletMap } from '@/app/utils/mapExportUtils';

// Dynamically import the map component to avoid SSR issues with Leaflet
const MapVisualization = dynamic(() => import('@/app/dashboard/components/MapVisualization'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  ),
});

const MultiMapPanel = dynamic(() => import('@/app/dashboard/components/MultiMapPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-blue-200">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
  ),
});

interface DistrictRainfall {
  district: string;
  rainfall: number;
}

const VERIFICATION_METRICS = ['pod', 'far', 'bias', 'csi', 'accuracy'] as const;

interface MapAnalysisTabProps {
  mode?: 'dual' | 'multi';
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

export default function MapAnalysisTab({ 
  mode = 'dual', 
  selectedDate, 
  setSelectedDate,
  selectedMonth,
  setSelectedMonth
}: MapAnalysisTabProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [rainfallData, setRainfallData] = useState<DistrictRainfall[]>([]);
  const [metric, setMetric] = useState<'rainfall' | 'pod' | 'far' | 'bias' | 'csi' | 'subdivision' | 'accuracy'>('rainfall');
  const [metricData, setMetricData] = useState<Record<string, any>>({});
  const [leadDay, setLeadDay] = useState<string>('D1');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitchingMode] = useState(false);
  // Category selector for multi-mode
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // Research panel visibility
  const [showResearchPanel, setShowResearchPanel] = useState(false);
  
  const { config } = useRainfallConfig();

  // Derive available multi-mode categories — use the prop 'mode' instead of global config.mode
  const multiCategories = mode === 'multi'
    ? (config?.classifications?.multi?.items || [])
        .filter((i: any) => i.enabled)
        .sort((a: any, b: any) => a.order - b.order)
    : [];

  // Set default date to today
  useEffect(() => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    setSelectedDate(dateStr);
    
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(monthStr);
  }, []);

  // Set default category when multi-mode categories load
  useEffect(() => {
    if (multiCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(multiCategories[0].variableName);
    }
  }, [multiCategories.length]);

  // Fetch data when parameters change
  useEffect(() => {
    if (metric === 'rainfall') {
      if (viewMode === 'daily' && selectedDate) {
        fetchRainfallData('daily', selectedDate);
      } else if (viewMode === 'monthly' && selectedMonth) {
        fetchRainfallData('monthly', selectedMonth);
      }
    } else if (metric !== 'subdivision') {
      const range = getRangeForFetch();
      if (range) {
        fetchMetricData(range.start, range.end, leadDay);
      }
    }
  }, [viewMode, selectedDate, selectedMonth, metric, leadDay, selectedCategory]);

  const getRangeForFetch = () => {
    if (viewMode === 'daily' && selectedDate) {
      return { start: selectedDate, end: selectedDate };
    } else if (viewMode === 'monthly' && selectedMonth) {
      const [year, month] = selectedMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      return { 
        start: `${selectedMonth}-01`, 
        end: `${selectedMonth}-${String(lastDay).padStart(2, '0')}` 
      };
    }
    return null;
  };

  const fetchRainfallData = async (view: 'daily' | 'monthly', value: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        view,
        [view === 'daily' ? 'date' : 'month']: value,
      });

      const response = await fetch(`/api/rainfall-data?${params}`);
      const result = await response.json();

      if (response.ok) {
        setRainfallData(result.data || []);
      } else {
        toast.error(result.error || 'Failed to fetch rainfall data');
        setRainfallData([]);
      }
    } catch (error: any) {
      console.error('Error fetching rainfall data:', error);
      toast.error('Failed to load rainfall data');
      setRainfallData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetricData = async (startDate: string, endDate: string, leadDay: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ 
        startDate, 
        endDate, 
        leadDay,
        mode // Pass the user's specific mode to the API
      });

      // If in multi-mode and a category is selected, pass it for per-category stats
      const isVerificationMetric = VERIFICATION_METRICS.includes(metric as any);
      if (config?.mode === 'multi' && isVerificationMetric && selectedCategory) {
        params.set('category', selectedCategory);
      }

      const response = await fetch(`/api/map-metrics?${params}`);
      const result = await response.json();

      if (response.ok && result.success) {
        setMetricData(result.districts || {});
      } else {
        toast.error(result.error || 'Failed to fetch verification metrics');
        setMetricData({});
      }
    } catch (error: any) {
      console.error('Error fetching metric data:', error);
      toast.error('Failed to load verification metrics');
      setMetricData({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewModeChange = (mode: 'daily' | 'monthly') => {
    setViewMode(mode);
    setRainfallData([]);
    setMetricData({});
    setShowResearchPanel(false);
  };

  const handleMetricChange = (m: string) => {
    setMetric(m as any);
    if (m === 'rainfall' || m === 'subdivision') {
      setShowResearchPanel(false);
    }
  };

  const renderLegend = () => {
    if (metric === 'rainfall') {
      if (viewMode === 'monthly') {
        const stops = [
          { pos: '0%', color: '#E3F2FD', val: '0' },
          { pos: '16.6%', color: '#90CAF9', val: '250' },
          { pos: '33.3%', color: '#42A5F5', val: '500' },
          { pos: '50%', color: '#1E88E5', val: '750' },
          { pos: '66.6%', color: '#FDD835', val: '1000' },
          { pos: '83.3%', color: '#FB8C00', val: '1250' },
          { pos: '100%', color: '#E53935', val: '1500+' }
        ];

        return (
          <div className="space-y-6">
            <div className="relative w-full h-8 rounded-lg shadow-inner overflow-hidden border border-gray-200"
                 style={{ background: `linear-gradient(to right, ${stops.map(s => s.color).join(', ')})` }}>
            </div>
            <div className="relative w-full h-6">
              {stops.map((stop, idx) => (
                <div key={idx} className="absolute top-0 text-[10px] font-bold text-gray-700 -translate-x-1/2"
                     style={{ left: stop.pos }}>
                  {stop.val}
                </div>
              ))}
              <div className="absolute right-0 top-6 text-[10px] text-gray-500 italic mt-1">Values in mm</div>
            </div>
          </div>
        );
      }

      const stops = [
        { pos: '0%', color: '#D3D3D3', val: '0' },
        { pos: '14.2%', color: '#E1F5FE', val: '2.5' },
        { pos: '28.5%', color: '#FFFFE0', val: '15.6' },
        { pos: '42.8%', color: '#FFFF00', val: '64.5' },
        { pos: '57.1%', color: '#FFA500', val: '115.6' },
        { pos: '71.4%', color: '#FF0000', val: '204.5' },
        { pos: '100%', color: '#8B0000', val: 'Max' }
      ];

      return (
        <div className="space-y-6">
          <div className="relative w-full h-8 rounded-lg shadow-inner overflow-hidden border border-gray-200"
               style={{ background: `linear-gradient(to right, ${stops.map(s => s.color).join(', ')})` }}>
          </div>
          <div className="relative w-full h-6">
            {stops.map((stop, idx) => (
              <div key={idx} className="absolute top-0 text-[10px] font-bold text-gray-700 -translate-x-1/2"
                   style={{ left: stop.pos }}>
                {stop.val}
              </div>
            ))}
            <div className="absolute right-0 top-6 text-[10px] text-gray-500 italic mt-1">Daily Rainfall in mm</div>
          </div>
        </div>
      );
    }
    
    if (metric === 'subdivision') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Konkan', color: '#6366f1' },
            { name: 'S. Madhya MH', color: '#10b981' },
            { name: 'N. Madhya MH', color: '#f59e0b' },
            { name: 'Marathwada', color: '#ef4444' }
          ].map(sub => (
            <div key={sub.name} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: sub.color }}></div>
              <div className="text-sm font-medium text-gray-900">{sub.name}</div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-24 h-4 bg-gradient-to-r from-[#f0fdf4] via-[#22c55e] to-[#166534] rounded"></div>
          <span className="text-xs text-gray-600">Low to High Score</span>
        </div>
        <p className="text-xs text-gray-500 italic">Districts with no data are shown in gray.</p>
        {config?.mode === 'multi' && selectedCategory && VERIFICATION_METRICS.includes(metric as any) && (
          <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded">
            Category: {selectedCategory}
          </span>
        )}
      </div>
    );
  };

  const researchRange = getRangeForFetch();
  const canShowResearchPanel = !!(researchRange);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Map Analysis</h2>
          <p className="text-gray-600">
            Visualize district-wise rainfall and meteorological verification factors
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Research Panel Button */}
          {canShowResearchPanel && (
            <button
              onClick={() => setShowResearchPanel(prev => !prev)}
              className={`px-4 py-2 font-semibold rounded-md shadow transition flex items-center gap-2 cursor-pointer text-sm border ${
                showResearchPanel
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {showResearchPanel ? 'Hide Research Panel' : '📊 5-Map Research Panel'}
            </button>
          )}
          <button
            onClick={async () => {
              try {
                const period = viewMode === 'daily' ? selectedDate : selectedMonth;
                const metricLabel = metric === 'rainfall'
                  ? (viewMode === 'daily' ? `Rainfall: ${selectedDate}` : `Rainfall: ${selectedMonth}`)
                  : metric.toUpperCase();
                await downloadLeafletMap(
                  'map-visualization-container',
                  `Maharashtra_Map_${metric}_${period}`,
                  { title: `Maharashtra — ${metricLabel}`, subtitle: `Generated: ${new Date().toLocaleString('en-IN')}` }
                );
              } catch (e: any) {
                toast.error('Download failed: ' + e.message);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span>Download PNG</span>
          </button>
        </div>
      </div>

      {/* Controls Container */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 border-b pb-2">Time & Mode Selection</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-black uppercase mb-2">View Mode</label>
              <select 
                value={viewMode} 
                onChange={(e) => handleViewModeChange(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-400 rounded-md text-sm text-black font-semibold"
              >
                <option value="daily">Daily View</option>
                <option value="monthly">Monthly View</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-black uppercase mb-2">Classification Mode</label>
              <div className={`px-3 py-2 border rounded-md text-sm font-bold ${
                mode === 'multi' 
                  ? 'bg-purple-50 border-purple-300 text-purple-700' 
                  : 'bg-blue-50 border-blue-300 text-blue-700'
              }`}>
                {mode === 'multi' ? '🔵 Multi (Categorical)' : '⚪ Dual (Binary)'}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Set in Admin Panel only</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-black uppercase mb-2">
              {viewMode === 'daily' ? 'Select Date' : 'Select Month'}
            </label>
            {viewMode === 'daily' ? (
              <input
                type="date"
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-400 rounded-md text-sm text-black font-semibold"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-400 rounded-md text-sm text-black font-semibold"
              />
            )}
          </div>
        </div>

        {/* Metric Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 border-b pb-2">Metric Selection</h3>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Active Metric</label>
            <div className="grid grid-cols-3 gap-2">
              {['rainfall', 'pod', 'far', 'bias', 'csi', 'subdivision', 'accuracy'].map((m) => (
                <button
                  key={m}
                  onClick={() => handleMetricChange(m)}
                  className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                    metric === m 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {(metric !== 'rainfall' && metric !== 'subdivision' || canShowResearchPanel) && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                Lead Time {canShowResearchPanel && metric === 'rainfall' && <span className="text-indigo-500 normal-case font-normal">(used by Research Panel)</span>}
              </label>
              <div className="flex gap-2">
                {['D1', 'D2', 'D3', 'D4', 'D5'].map((d) => (
                  <button
                    key={d}
                    onClick={() => setLeadDay(d)}
                    className={`flex-1 py-2 text-xs font-medium rounded-md border transition-colors ${
                      leadDay === d 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category selector — only in multi-mode, for verification metrics */}
          {mode === 'multi' && VERIFICATION_METRICS.includes(metric as any) && multiCategories.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-purple-700 uppercase mb-2">
                🔵 Category (Multi-Mode)
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 bg-purple-50 rounded-md text-sm text-purple-900 font-semibold focus:ring-2 focus:ring-purple-400"
              >
                <option value="">— General (Overall) —</option>
                {multiCategories.map((cat: any) => (
                  <option key={cat.variableName} value={cat.variableName}>
                    {cat.variableName} — {cat.label} (≥{cat.thresholdMm} mm)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-purple-500 mt-1">
                {selectedCategory
                  ? `Showing per-category binary stats for "${selectedCategory}"`
                  : 'Showing overall verification across all categories'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-800">
          {metric === 'rainfall' ? (
            viewMode === 'daily' 
              ? `Displaying actual rainfall recorded on ${selectedDate}. Values shown on each district in mm.`
              : `Displaying total accumulated rainfall for ${selectedMonth}. Hover for max rainfall date.`
          ) : metric === 'subdivision' ? (
            "Displaying districts grouped by IMD Meteorological Subdivisions."
          ) : (
            `Displaying ${metric.toUpperCase()} verification scores for ${leadDay} forecasts.${
              mode === 'multi' && selectedCategory
                ? ` Category filter: "${selectedCategory}" (binary event per district).`
                : ' Metric values shown on each district.'
            }`
          )}
        </div>
      </div>

      {/* Research Panel (5-Map Grid) */}
      {showResearchPanel && (
        <div className="mt-8">
          <MultiMapPanel
            startDate={researchRange?.start || ''}
            endDate={researchRange?.end || ''}
            leadDay={leadDay}
            viewMode={viewMode}
            selectedDate={selectedDate}
            selectedMonth={selectedMonth}
            selectedCategory={selectedCategory}
            configMode={mode}
            onClose={() => setShowResearchPanel(false)}
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <MapVisualization 
          rainfallData={rainfallData} 
          viewMode={viewMode}
          selectedDate={selectedDate}
          selectedMonth={selectedMonth}
          metric={metric}
          metricData={metricData}
          interactive={true}
          mode={mode}
        />
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {metric === 'rainfall' ? 'Rainfall Classification Legend' : 'Map Legend'}
        </h3>
        {renderLegend()}
      </div>
    </div>
  );
}
