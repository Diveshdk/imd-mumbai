'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

interface DistrictMetrics {
  correctness: number;
  pod: number;
  far: number;
  csi: number;
  bias: number;
}

interface DayData {
  [district: string]: DistrictMetrics;
}

interface MetricData {
  [district: string]: {
    D1: number;
    D2: number;
    D3: number;
    D4: number;
    D5: number;
  };
}

interface AllMetricsData {
  correctness: MetricData;
  pod: MetricData;
  far: MetricData;
  csi: MetricData;
  bias: MetricData;
}

export default function TabularAnalysisTab() {
  const [startDate, setStartDate] = useState<string>('2025-06-01');
  const [endDate, setEndDate] = useState<string>('2025-06-30');
  const [isLoading, setIsLoading] = useState(false);
  const [allMetricsData, setAllMetricsData] = useState<AllMetricsData | null>(null);
  const { config, isLoading: configLoading } = useRainfallConfig();

  const runAnalysis = async () => {
    setIsLoading(true);
    
    try {
      const allDaysData: AllMetricsData = {
        correctness: {},
        pod: {},
        far: {},
        csi: {},
        bias: {}
      };

      // Fetch data for all 5 days
      for (const day of ['D1', 'D2', 'D3', 'D4', 'D5']) {
        const response = await fetch('/api/analysis/heavy-rainfall', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'day-wise',
            selectedDay: day,
            startDate,
            endDate
          })
        });

        const result = await response.json();

        if (!result.success) {
          toast.error(`Failed to load data for ${day}`);
          continue;
        }

        // Transform data into metric-wise structure
        for (const [district, metrics] of Object.entries(result.districts) as [string, DistrictMetrics][]) {
          // Initialize district if not exists
          if (!allDaysData.correctness[district]) {
            allDaysData.correctness[district] = {} as any;
            allDaysData.pod[district] = {} as any;
            allDaysData.far[district] = {} as any;
            allDaysData.csi[district] = {} as any;
            allDaysData.bias[district] = {} as any;
          }
          
          // Store metrics for this day
          (allDaysData.correctness[district] as any)[day] = metrics.correctness;
          (allDaysData.pod[district] as any)[day] = metrics.pod;
          (allDaysData.far[district] as any)[day] = metrics.far;
          (allDaysData.csi[district] as any)[day] = metrics.csi;
          (allDaysData.bias[district] as any)[day] = metrics.bias;
        }
      }

      setAllMetricsData(allDaysData);
      toast.success('Analysis completed successfully!');
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error('Failed to run analysis: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatValue = (value: number | undefined, metricName: string): string => {
    if (value === undefined || value === null) return 'N/A';
    
    if (metricName === 'Correctness' || metricName.includes('Correctness')) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toFixed(3);
  };

  const exportToExcel = (metricName: string, data: MetricData) => {
    try {
      const excelData: any[][] = [];
      
      // Row 1: Title
      excelData.push([`${metricName} - Heavy Rainfall Verification`]);
      
      // Row 2: Date Range
      excelData.push([`Date Range: ${startDate} to ${endDate}`]);
      
      // Row 3: Threshold/Mode
      excelData.push([`Mode: ${config?.mode === 'multi' ? 'Multi-Category' : 'Dual (Binary)'}`]);
      if (config?.mode !== 'multi') {
        const threshold = config?.classifications?.dual?.threshold;
        excelData.push([`Threshold: ${threshold !== undefined ? threshold : '...'}mm (Admin)`]);
      }
      
      // Row 4: Empty
      excelData.push([]);
      
      // Row 5: Headers
      excelData.push(['District', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5']);
      
      // Data rows
      Object.entries(data)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([district, days]) => {
          excelData.push([
            district,
            formatValue(days.D1, metricName),
            formatValue(days.D2, metricName),
            formatValue(days.D3, metricName),
            formatValue(days.D4, metricName),
            formatValue(days.D5, metricName)
          ]);
        });
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, metricName.substring(0, 31)); // Excel sheet name limit
      
      // Generate filename
      const dateStr = `${startDate}_to_${endDate}`;
      const cleanMetricName = metricName.replace(/[()]/g, '').replace(/\s+/g, '_');
      const filename = `${cleanMetricName}_TabularAnalysis_${dateStr}.xlsx`;
      
      // Download
      XLSX.writeFile(wb, filename);
      toast.success(`Downloaded ${metricName} table`);
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export table');
    }
  };

  const MetricTable = ({ metricName, data }: { metricName: string; data: MetricData }) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4 border-b pb-3">
        <h3 className="text-xl font-bold text-gray-800">{metricName}</h3>
        <button
          onClick={() => exportToExcel(metricName, data)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Excel
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider sticky left-0 bg-gray-50">
                District
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-black uppercase tracking-wider">
                Day 1
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-black uppercase tracking-wider">
                Day 2
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-black uppercase tracking-wider">
                Day 3
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-black uppercase tracking-wider">
                Day 4
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-black uppercase tracking-wider">
                Day 5
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(data)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([district, days]) => (
                <tr key={district} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-black sticky left-0 bg-white">
                    {district}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-semibold">
                    {formatValue(days.D1, metricName)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-semibold">
                    {formatValue(days.D2, metricName)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-semibold">
                    {formatValue(days.D3, metricName)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-semibold">
                    {formatValue(days.D4, metricName)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 font-semibold">
                    {formatValue(days.D5, metricName)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Tabular Analysis
        </h2>
        <p className="text-gray-600 mb-6">
          District-wise metrics in table format showing Day 1-5 performance across the selected date range
        </p>

        {/* Configuration Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-bold text-black mb-2">
              Verification Mode
            </label>
            <div className={`px-3 py-2 border rounded-md font-bold text-sm ${config?.mode === 'multi' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
              {configLoading ? 'Loading Mode...' : (config?.mode === 'multi' ? 'Multi Mode (Categorical)' : 'Dual Mode (Binary)')}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-black mb-2">
              Threshold / Method
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 font-bold">
              {config?.mode === 'multi' ? 'Multi-Category (Admin Config)' : `${config?.classifications?.dual?.threshold ?? '...'} mm (Admin Config)`}
            </div>
            <p className="text-xs text-gray-400 mt-1">Change this in Admin Panel only</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={runAnalysis}
          disabled={isLoading}
          className={`px-6 py-3 rounded-md font-medium ${
            isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? 'Running Analysis...' : 'Run Tabular Analysis'}
        </button>
      </div>

      {/* Results */}
      {allMetricsData && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Metric-wise Analysis (Day 1-5)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-black font-bold">Date Range:</span>
                <span className="ml-2 font-black text-gray-900">
                  {format(new Date(startDate), 'MMM dd')} - {format(new Date(endDate), 'MMM dd, yyyy')}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Threshold/Method:</span>
                <span className="ml-2 font-black text-gray-900">
                  {config?.mode === 'multi' ? 'Multi-Category' : `${config?.classifications?.dual?.threshold ?? '...'}mm (Admin)`}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Districts:</span>
                <span className="ml-2 font-black text-gray-900">
                  {Object.keys(allMetricsData.correctness).length}
                </span>
              </div>
            </div>
          </div>

          {/* Metric Tables */}
          <MetricTable metricName="Correctness" data={allMetricsData.correctness} />
          <MetricTable metricName="POD (Probability of Detection)" data={allMetricsData.pod} />
          <MetricTable metricName="FAR (False Alarm Ratio)" data={allMetricsData.far} />
          <MetricTable metricName="CSI (Critical Success Index)" data={allMetricsData.csi} />
          <MetricTable metricName="Bias" data={allMetricsData.bias} />

          {/* Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> Each table shows district-wise performance for Day 1 through Day 5 across the entire date range 
              ({format(new Date(startDate), 'MMM dd')} - {format(new Date(endDate), 'MMM dd, yyyy')}). 
              Values are calculated from real verified data (H, M, F, CN counts) for each day.
            </p>
          </div>
        </div>
      )}

      {/* No Results State */}
      {!allMetricsData && !isLoading && (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-600 text-lg">Configure parameters and run analysis to see tables</p>
          <p className="text-gray-500 text-sm mt-2">
            5 metric-wise tables showing Day 1-5 performance for all districts
          </p>
        </div>
      )}
    </div>
  );
}
