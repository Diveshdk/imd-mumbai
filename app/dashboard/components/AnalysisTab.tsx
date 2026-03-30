'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { downloadChartAsImage, generateChartFileName } from '@/app/utils/chartDownloadUtils';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

// ─── Maharashtra Meteorological Subdivisions ─────────────────────────────────
// Based on IMD Maharashtra meteorological subdivision classifications.
// District names match the canonical names used after normalisation.
const MAHARASHTRA_SUBDIVISIONS = [
  {
    name: 'Konkan',
    shortName: 'Konkan',
    color: '#6366f1',
    cities: [
      'MUMBAI', 'MUMBAI SUBURBAN', 'THANE', 'PALGHAR',
      'RAIGAD', 'RATNAGIRI', 'SINDHUDURG'
    ]
  },
  {
    name: 'South Madhya Maharashtra',
    shortName: 'S. Madhya MH',
    color: '#10b981',
    cities: [
      'PUNE', 'SATARA', 'SANGLI', 'KOLHAPUR', 'SOLAPUR'
    ]
  },
  {
    name: 'North Madhya Maharashtra',
    shortName: 'N. Madhya MH',
    color: '#f59e0b',
    cities: [
      'NASHIK', 'DHULE', 'JALGAON', 'NANDURBAR', 'AHMEDNAGAR'
    ]
  },
  {
    name: 'Marathwada',
    shortName: 'Marathwada',
    color: '#ef4444',
    cities: [
      'CHHATRAPATI SAMBHAJI NAGAR', 'AURANGABAD', 'JALNA',
      'BEED', 'LATUR', 'OSMANABAD', 'NANDED', 'HINGOLI', 'PARBHANI'
    ]
  }
];

interface DistrictMetrics {
  correctness: number;
  pod: number;
  far: number;
  csi: number;
  bias: number;
  h: number;
  m: number;
  f: number;
  cn: number;
  total: number;
}

interface DayWiseData {
  success: boolean;
  mode: 'day-wise';
  selectedDay: string;
  threshold: number;
  start_date: string;
  end_date: string;
  districts: {
    [district: string]: DistrictMetrics;
  };
}

interface ComparisonData {
  success: boolean;
  mode: 'comparison';
  threshold: number;
  start_date: string;
  end_date: string;
  days: {
    [day: string]: DistrictMetrics;
  };
}

export default function AnalysisTab() {
  const [analysisMode, setAnalysisMode] = useState<'day-wise' | 'comparison'>('day-wise');
  const [selectedDay, setSelectedDay] = useState<string>('D1');
  const [startDate, setStartDate] = useState<string>('2025-06-01');
  const [endDate, setEndDate] = useState<string>('2025-06-30');
  const [isLoading, setIsLoading] = useState(false);
  const [dayWiseData, setDayWiseData] = useState<DayWiseData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const { config, isLoading: configLoading } = useRainfallConfig();

  const runAnalysis = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/analysis/heavy-rainfall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: analysisMode,
          selectedDay: analysisMode === 'day-wise' ? selectedDay : undefined,
          startDate,
          endDate
        })
      });

      const result = await response.json();

      if (result.success) {
        if (analysisMode === 'day-wise') {
          setDayWiseData(result);
        } else {
          setComparisonData(result);
        }
        toast.success('Analysis completed successfully!');
      } else {
        toast.error(result.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error('Failed to run analysis: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadChart = async (chartId: string, metric: string, additionalInfo?: string) => {
    try {
      const fileName = generateChartFileName(metric, analysisMode, additionalInfo);
      await downloadChartAsImage(chartId, fileName);
      toast.success('Chart downloaded successfully!');
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('Failed to download chart: ' + error.message);
    }
  };

  const prepareDistrictChartData = (data: DayWiseData, metric: keyof DistrictMetrics) => {
    return Object.entries(data.districts)
      .map(([district, metrics]) => ({
        district,
        value: metric === 'correctness' ? metrics[metric] * 100 : metrics[metric]
      }))
      .sort((a, b) => a.district.localeCompare(b.district));
  };

  const prepareDayComparisonData = (data: ComparisonData, metric: keyof DistrictMetrics) => {
    return Object.entries(data.days)
      .map(([day, metrics]) => ({
        day: day.replace('D', 'Day '),
        value: metric === 'correctness' ? metrics[metric] * 100 : metrics[metric]
      }));
  };

  const getMetricColor = (metric: string) => {
    const colors: { [key: string]: string } = {
      correctness: '#10b981', // green
      pod: '#3b82f6',         // blue
      far: '#ef4444',         // red
      csi: '#8b5cf6',         // purple
      bias: '#f59e0b'         // orange
    };
    return colors[metric] || '#6b7280';
  };

  const getMetricLabel = (metric: string) => {
    const labels: { [key: string]: string } = {
      correctness: 'Correctness (%)',
      pod: 'POD',
      far: 'FAR',
      csi: 'CSI',
      bias: 'Bias'
    };
    return labels[metric] || metric.toUpperCase();
  };

  // ─── Subdivision Aggregation Helpers ───────────────────────────────────────

  /**
   * For a given day-wise result, aggregate district metrics into
   * the 4 Maharashtra meteorological subdivisions by averaging.
   */
  const prepareSubdivisionChartData = (data: DayWiseData) => {
    return MAHARASHTRA_SUBDIVISIONS.map((subdivision) => {
      // Collect metrics for all districts belonging to this subdivision
      const matched: DistrictMetrics[] = [];

      for (const [districtRaw, metrics] of Object.entries(data.districts)) {
        const district = districtRaw.toUpperCase().trim();
        const belongs = subdivision.cities.some(
          (city) => city.toUpperCase() === district
        );
        if (belongs) {
          matched.push(metrics);
        }
      }

      if (matched.length === 0) {
        return {
          subdivision: subdivision.shortName,
          fullName: subdivision.name,
          color: subdivision.color,
          correctness: 0,
          pod: 0,
          far: 0,
          csi: 0,
          bias: 0,
          districtCount: 0
        };
      }

      const avg = (key: keyof DistrictMetrics) =>
        matched.reduce((sum, m) => sum + (m[key] as number), 0) / matched.length;

      return {
        subdivision: subdivision.shortName,
        fullName: subdivision.name,
        color: subdivision.color,
        correctness: parseFloat((avg('correctness') * 100).toFixed(2)), // Convert 0-1 to %
        pod: parseFloat(avg('pod').toFixed(3)),
        far: parseFloat(avg('far').toFixed(3)),
        csi: parseFloat(avg('csi').toFixed(3)),
        bias: parseFloat(avg('bias').toFixed(3)),
        districtCount: matched.length
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Graphical Analysis
        </h2>
        <p className="text-black font-semibold mb-6">
          Visual graph-based analysis of verification metrics
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
            <label className="block text-sm font-bold text-black mb-2">
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
            <label className="block text-sm font-bold text-black mb-2">
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

        {/* Mode Toggle */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => {
              setAnalysisMode('day-wise');
              setDayWiseData(null);
            }}
            className={`px-6 py-3 rounded-md font-medium ${
              analysisMode === 'day-wise'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Day-Wise Analysis
          </button>
          <button
            onClick={() => {
              setAnalysisMode('comparison');
              setComparisonData(null);
            }}
            className={`px-6 py-3 rounded-md font-medium ${
              analysisMode === 'comparison'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All-Day Comparison
          </button>
        </div>

        {/* Day Selector (only for day-wise mode) */}
        {analysisMode === 'day-wise' && (
          <div className="mb-6">
            <label className="block text-sm font-bold text-black mb-2">
              Select Day
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-bold"
            >
              <option value="D1">Day 1</option>
              <option value="D2">Day 2</option>
              <option value="D3">Day 3</option>
              <option value="D4">Day 4</option>
              <option value="D5">Day 5</option>
            </select>
          </div>
        )}

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
          {isLoading ? 'Running Analysis...' : 'Run Analysis'}
        </button>
      </div>

      {/* Day-Wise Analysis Results */}
      {dayWiseData && analysisMode === 'day-wise' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-lg p-6">
            <h3 className="text-lg font-bold text-black mb-2">
              {dayWiseData.selectedDay.replace('D', 'Day ')} - District-Wise Analysis
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-black font-bold">Selected Day:</span>
                <span className="ml-2 font-black text-black">{dayWiseData.selectedDay}</span>
              </div>
              <div>
                <span className="text-black font-bold">Date Range:</span>
                <span className="ml-2 font-black text-black">
                  {format(new Date(dayWiseData.start_date), 'MMM dd')} - {format(new Date(dayWiseData.end_date), 'MMM dd, yyyy')}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Threshold/Method:</span>
                <span className="ml-2 font-black text-black">
                  {config?.mode === 'multi' ? 'Multi-Category' : `${dayWiseData.threshold ?? '...'}mm`}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Districts:</span>
                <span className="ml-2 font-black text-black">
                  {Object.keys(dayWiseData.districts).length}
                </span>
              </div>
            </div>
          </div>

          {/* Correctness Graph */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Correctness by District</h3>
              <button
                onClick={() => handleDownloadChart('correctness-district-chart', 'correctness', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="correctness-district-chart">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepareDistrictChartData(dayWiseData, 'correctness')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="district" 
                    angle={-45} 
                    textAnchor="end" 
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis label={{ value: 'Correctness (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => value ? `${Number(value).toFixed(2)}%` : 'N/A'} />
                  <Bar dataKey="value" fill={getMetricColor('correctness')} name="Correctness" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* POD Graph */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">POD (Probability of Detection) by District</h3>
              <button
                onClick={() => handleDownloadChart('pod-district-chart', 'pod', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="pod-district-chart">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepareDistrictChartData(dayWiseData, 'pod')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="district" 
                    angle={-45} 
                    textAnchor="end" 
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis label={{ value: 'POD', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Bar dataKey="value" fill={getMetricColor('pod')} name="POD" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FAR Graph */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">FAR (False Alarm Ratio) by District</h3>
              <button
                onClick={() => handleDownloadChart('far-district-chart', 'far', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="far-district-chart">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepareDistrictChartData(dayWiseData, 'far')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="district" 
                    angle={-45} 
                    textAnchor="end" 
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis label={{ value: 'FAR', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Bar dataKey="value" fill={getMetricColor('far')} name="FAR" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CSI Graph */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">CSI (Critical Success Index) by District</h3>
              <button
                onClick={() => handleDownloadChart('csi-district-chart', 'csi', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="csi-district-chart">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepareDistrictChartData(dayWiseData, 'csi')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="district" 
                    angle={-45} 
                    textAnchor="end" 
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis label={{ value: 'CSI', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Bar dataKey="value" fill={getMetricColor('csi')} name="CSI" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bias Graph */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Bias by District</h3>
              <button
                onClick={() => handleDownloadChart('bias-district-chart', 'bias', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="bias-district-chart">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepareDistrictChartData(dayWiseData, 'bias')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="district" 
                    angle={-45} 
                    textAnchor="end" 
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis label={{ value: 'Bias', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Bar dataKey="value" fill={getMetricColor('bias')} name="Bias" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Rainfall Analysis by Subdivision ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Rainfall Analysis by Subdivision</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  District verification metrics aggregated across the 4 Maharashtra meteorological subdivisions
                </p>
              </div>
              <button
                onClick={() => handleDownloadChart('subdivision-chart', 'subdivision', dayWiseData.selectedDay)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>

            {/* Subdivision legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {MAHARASHTRA_SUBDIVISIONS.map((sub) => {
                const found = prepareSubdivisionChartData(dayWiseData).find(
                  (d) => d.fullName === sub.name
                );
                return (
                  <div key={sub.name} className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-full text-sm">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: sub.color }} />
                    <span className="text-gray-700 font-medium">{sub.shortName}</span>
                    {found && found.districtCount > 0 && (
                      <span className="text-gray-500">({found.districtCount} district{found.districtCount !== 1 ? 's' : ''})</span>
                    )}
                    {found && found.districtCount === 0 && (
                      <span className="text-orange-500 text-xs">(no data)</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Multi-metric subdivision bar chart */}
            <div id="subdivision-chart">
              <ResponsiveContainer width="100%" height={420}>
                <BarChart
                  data={prepareSubdivisionChartData(dayWiseData)}
                  margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="subdivision"
                    angle={-20}
                    textAnchor="end"
                    height={70}
                    tick={{ fontSize: 12, fontWeight: 600 }}
                  />
                  <YAxis
                    label={{ value: 'Metric Value', angle: -90, position: 'insideLeft', offset: 10 }}
                  />
                  <Tooltip
                    formatter={(value: any, name?: string) => {
                      const val = value ?? 0;
                      const n = name ?? '';
                      if (n === 'Correctness (%)') return [`${val}%`, n];
                      return [val, n];
                    }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = prepareSubdivisionChartData(dayWiseData).find(
                        (d) => d.subdivision === label
                      );
                      return (
                        <div className="bg-white border-2 border-black rounded-lg p-3 shadow-lg text-sm">
                          <p className="font-bold text-black mb-2">{item?.fullName}</p>
                          {payload.map((entry: any) => (
                            <p key={entry.name} style={{ color: entry.fill }} className="flex justify-between gap-4 font-bold">
                              <span>{entry.name}:</span>
                              <span className="font-black">
                                {entry.name === 'Correctness (%)'
                                  ? `${entry.value}%`
                                  : entry.value}
                              </span>
                            </p>
                          ))}
                          {item && <p className="text-black font-bold text-xs mt-2">{item.districtCount} district(s) averaged</p>}
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="correctness" name="Correctness (%)" fill="#10b981" radius={[4, 4, 0, 0]}>
                    {prepareSubdivisionChartData(dayWiseData).map((entry, index) => (
                      <Cell key={`cell-corr-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                  <Bar dataKey="pod" name="POD" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="csi" name="CSI" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="far" name="FAR" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Summary table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 border border-gray-200 font-semibold text-gray-700">Subdivision</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">Districts</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">Correctness</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">POD</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">FAR</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">CSI</th>
                    <th className="text-center px-4 py-2 border border-gray-200 font-semibold text-gray-700">Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {prepareSubdivisionChartData(dayWiseData).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                          <span className="font-medium text-gray-800">{row.fullName}</span>
                        </div>
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200 text-gray-600">
                        {row.districtCount > 0 ? row.districtCount : <span className="text-orange-500">N/A</span>}
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200">
                        {row.districtCount > 0
                          ? <span className="font-medium text-emerald-700">{row.correctness}%</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200">
                        {row.districtCount > 0
                          ? <span className="font-medium text-blue-700">{row.pod}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200">
                        {row.districtCount > 0
                          ? <span className="font-medium text-red-700">{row.far}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200">
                        {row.districtCount > 0
                          ? <span className="font-medium text-purple-700">{row.csi}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="text-center px-4 py-2 border border-gray-200">
                        {row.districtCount > 0
                          ? <span className="font-medium text-amber-700">{row.bias}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All-Day Comparison Results */}
      {comparisonData && analysisMode === 'comparison' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-lg p-6">
            <h3 className="text-lg font-bold text-black mb-2">All-Day Comparison Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-black font-bold">Date Range:</span>
                <span className="ml-2 font-black text-black">
                  {format(new Date(comparisonData.start_date), 'MMM dd')} - {format(new Date(comparisonData.end_date), 'MMM dd, yyyy')}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Threshold/Method:</span>
                <span className="ml-2 font-black text-black">
                  {config?.mode === 'multi' ? 'Multi-Category' : `${comparisonData.threshold ?? '...'}mm`}
                </span>
              </div>
              <div>
                <span className="text-black font-bold">Days Compared:</span>
                <span className="ml-2 font-black text-black">Day 1 to Day 5</span>
              </div>
            </div>
          </div>

          {/* Correctness Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Correctness Comparison (Day 1-5)</h3>
              <button
                onClick={() => handleDownloadChart('correctness-comparison-chart', 'correctness')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="correctness-comparison-chart">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareDayComparisonData(comparisonData, 'correctness')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis label={{ value: 'Correctness (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => value ? `${Number(value).toFixed(2)}%` : 'N/A'} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getMetricColor('correctness')} 
                    strokeWidth={2}
                    name="Correctness"
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* POD Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">POD Comparison (Day 1-5)</h3>
              <button
                onClick={() => handleDownloadChart('pod-comparison-chart', 'pod')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="pod-comparison-chart">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareDayComparisonData(comparisonData, 'pod')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis label={{ value: 'POD', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getMetricColor('pod')} 
                    strokeWidth={2}
                    name="POD"
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FAR Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">FAR Comparison (Day 1-5)</h3>
              <button
                onClick={() => handleDownloadChart('far-comparison-chart', 'far')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="far-comparison-chart">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareDayComparisonData(comparisonData, 'far')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis label={{ value: 'FAR', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getMetricColor('far')} 
                    strokeWidth={2}
                    name="FAR"
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CSI Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">CSI Comparison (Day 1-5)</h3>
              <button
                onClick={() => handleDownloadChart('csi-comparison-chart', 'csi')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="csi-comparison-chart">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareDayComparisonData(comparisonData, 'csi')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis label={{ value: 'CSI', angle: -90, position: 'insideLeft' }} domain={[0, 1]} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getMetricColor('csi')} 
                    strokeWidth={2}
                    name="CSI"
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bias Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Bias Comparison (Day 1-5)</h3>
              <button
                onClick={() => handleDownloadChart('bias-comparison-chart', 'bias')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Download chart as PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
            <div id="bias-comparison-chart">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareDayComparisonData(comparisonData, 'bias')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis label={{ value: 'Bias', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => value ? Number(value).toFixed(3) : 'N/A'} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={getMetricColor('bias')} 
                    strokeWidth={2}
                    name="Bias"
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* No Results State */}
      {!dayWiseData && !comparisonData && !isLoading && (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-600 text-lg">Configure parameters and run analysis to see graphs</p>
          <p className="text-gray-500 text-sm mt-2">
            {analysisMode === 'day-wise' 
              ? 'District-wise metric visualization for selected day' 
              : 'Day-wise performance comparison across all 5 days'}
          </p>
        </div>
      )}
    </div>
  );
}
