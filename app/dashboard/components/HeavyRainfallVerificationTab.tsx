'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

interface SkillScores {
  POD: number;
  FAR: number;
  CSI: number;
  Bias: number;
  H: number;
  M: number;
  F: number;
  CN: number;
  Total: number;
}

interface LeadTimeData {
  scores: SkillScores;
  count: number;
}

interface DistrictWiseData {
  [district: string]: SkillScores;
}

interface OverviewResults {
  success: boolean;
  threshold: number;
  start_date: string;
  end_date: string;
  lead_times: {
    [key: string]: LeadTimeData;
  };
}

interface DetailedResults {
  success: boolean;
  threshold: number;
  start_date: string;
  end_date: string;
  selectedDay: string;
  district_wise: DistrictWiseData;
}

interface ComparisonRow {
  date: string;
  forecastCode: number | null;
  forecastClass: string;
  realisedMm: number | null;
  realisedClass: string;
  type: 'Correct' | 'False Alarm' | 'Missed Event' | 'Correct Negative';
}

interface DistrictDetail {
  district: string;
  selectedDay: string;
  rows: ComparisonRow[];
  totals: { H: number; M: number; F: number; CN: number; POD: number; FAR: number; CSI: number; Bias: number };
}

interface HeavyRainfallVerificationTabProps {
  mode?: 'dual' | 'multi';
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
}

export default function HeavyRainfallVerificationTab({ 
  mode = 'dual', 
  startDate, 
  setStartDate, 
  endDate, 
  setEndDate 
}: HeavyRainfallVerificationTabProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [overviewResults, setOverviewResults] = useState<OverviewResults | null>(null);
  const [detailedResults, setDetailedResults] = useState<DetailedResults | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [districtDetail, setDistrictDetail] = useState<DistrictDetail | null>(null);
  const { config, isLoading: configLoading } = useRainfallConfig();

  const runVerification = async () => {
    setIsLoading(true);
    setSelectedDay(null);
    setDetailedResults(null);
    setDistrictDetail(null);
    
    try {
      const response = await fetch('/api/verification/heavy-rainfall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate, 
          endDate, 
          configMode: mode 
        })
      });
      const result = await response.json();
      if (result.success) {
        setOverviewResults(result);
        toast.success('Verification completed successfully!');
      } else {
        toast.error(result.error || 'Verification failed');
      }
    } catch (error: any) {
      toast.error('Failed to run verification: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDayDetails = async (day: string) => {
    setIsLoading(true);
    setSelectedDay(day);
    setDistrictDetail(null);
    
    try {
      const response = await fetch('/api/verification/heavy-rainfall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate, 
          endDate, 
          selectedDay: day, 
          configMode: mode 
        })
      });
      const result = await response.json();
      if (result.success) {
        setDetailedResults(result);
      } else {
        toast.error(result.error || 'Failed to load details');
      }
    } catch (error: any) {
      toast.error('Failed to load details: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDistrictDetail = async (district: string) => {
    if (!selectedDay) return;
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/verification/heavy-rainfall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate, 
          endDate, 
          selectedDay, 
          selectedDistrict: district, 
          configMode: mode 
        })
      });
      const result = await response.json();
      if (result.success) {
        setDistrictDetail({ district, selectedDay, rows: result.rows, totals: result.totals });
      } else {
        toast.error(result.error || 'Failed to load district detail');
      }
    } catch (error: any) {
      toast.error('Failed to load district detail: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (value: number, metric: string) => {
    if (metric === 'FAR') {
      if (value <= 0.3) return 'text-green-600';
      if (value <= 0.5) return 'text-yellow-600';
      return 'text-red-600';
    } else {
      if (value >= 0.7) return 'text-green-600';
      if (value >= 0.5) return 'text-yellow-600';
      return 'text-red-600';
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'Correct': return 'bg-green-100 text-green-800 font-bold';
      case 'Missed Event': return 'bg-red-100 text-red-800 font-bold';
      case 'False Alarm': return 'bg-orange-100 text-orange-800 font-bold';
      case 'Correct Negative': return 'bg-blue-100 text-blue-800 font-bold';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getDayNumber = (leadTime: string) => leadTime.replace('Day-', '');
  const getDayCode = (dayNumber: string) => `D${dayNumber}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          HRV-1: Heavy Rainfall Verification System
        </h2>
        <p className="text-gray-600 mb-6">
          Day-wise verification analysis with district-level drill-down and formula audit
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
        </div>

        <button
          onClick={runVerification}
          disabled={isLoading}
          className={`px-6 py-3 rounded-md font-medium ${
            isLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? 'Running Verification...' : 'Run Heavy Rainfall Verification'}
        </button>
      </div>

      {/* Overview: Day Cards */}
      {overviewResults && !selectedDay && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Verification Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Threshold/Method:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {mode === 'multi' ? 'Multi-Category' : `${overviewResults.threshold}mm`}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Date Range:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {format(new Date(overviewResults.start_date), 'MMM dd')} - {format(new Date(overviewResults.end_date), 'MMM dd, yyyy')}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Lead Times:</span>
                <span className="ml-2 font-semibold text-gray-900">Day 1 to Day 5</span>
              </div>
              <div>
                <span className="text-gray-600">Mode:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${mode === 'multi' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {configLoading ? 'Loading...' : (mode === 'multi' ? 'Categorical (Multi)' : 'Binary (Dual)')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Day-Wise Verification Summary</h3>
                  <p className="text-sm text-gray-600 mt-1">Click any day row for detailed district-wise analysis</p>
                </div>
                <button
                  onClick={() => {
                    try {
                      const excelData: any[][] = [];
                      excelData.push(['Heavy Rainfall Verification (HRV-1) - Overview']);
                      excelData.push([`Verification Mode: ${mode === 'multi' ? 'Multi-Category' : 'Dual (Binary)'}`]);
                      excelData.push([`Date Range: ${startDate} to ${endDate}`]);
                      excelData.push([]);
                      excelData.push(['Day', 'Hit (H)', 'Miss (M)', 'False Alarm (F)', 'CN', 'Total', 'POD=H/(H+M)', 'CSI=H/(H+M+F)', 'FAR=F/(H+F)', 'BIAS=(H+F)/(H+M)']);
                      Object.entries(overviewResults.lead_times).forEach(([leadTime, data]) => {
                        const { H, M, F, CN, Total } = data.scores;
                        excelData.push([
                          `Day ${getDayNumber(leadTime)}`,
                          H, M, F, CN, Total,
                          data.scores.POD.toFixed(4),
                          data.scores.CSI.toFixed(4),
                          data.scores.FAR.toFixed(4),
                          data.scores.Bias.toFixed(4)
                        ]);
                      });
                      const ws = XLSX.utils.aoa_to_sheet(excelData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Overview');
                      XLSX.writeFile(wb, `HRV1_Overview_${startDate}_to_${endDate}.xlsx`);
                      toast.success('Downloaded overview table');
                    } catch (error: any) {
                      toast.error('Failed to export table');
                    }
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2 text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Day</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-green-700 uppercase">Hit (H)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-red-700 uppercase">Miss (M)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-orange-700 uppercase">False Alarm (F)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-blue-700 uppercase">CN</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">POD</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">CSI</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">FAR</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">BIAS</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(overviewResults.lead_times).map(([leadTime, data]) => {
                    const dayNum = getDayNumber(leadTime);
                    const dayCode = getDayCode(dayNum);
                    return (
                      <tr
                        key={leadTime}
                        onClick={() => loadDayDetails(dayCode)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">Day {dayNum}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 font-semibold">{data.scores.H}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-red-600 font-semibold">{data.scores.M}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-orange-600 font-semibold">{data.scores.F}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-blue-600 font-semibold">{data.scores.CN}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(data.scores.POD, 'POD')}`}>{data.scores.POD.toFixed(3)}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(data.scores.CSI, 'CSI')}`}>{data.scores.CSI.toFixed(3)}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(data.scores.FAR, 'FAR')}`}>{data.scores.FAR.toFixed(3)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-700">{data.scores.Bias.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Contingency Table Legend &amp; Formulas:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-start"><span className="font-bold text-green-600 w-6">H:</span><span className="text-gray-600">Hits — Forecast = Heavy, Observed = Heavy</span></div>
                <div className="flex items-start"><span className="font-bold text-red-600 w-6">M:</span><span className="text-gray-600">Misses — Forecast ≠ Heavy, Observed = Heavy</span></div>
                <div className="flex items-start"><span className="font-bold text-orange-600 w-6">F:</span><span className="text-gray-600">False Alarms — Forecast = Heavy, Observed ≠ Heavy</span></div>
                <div className="flex items-start"><span className="font-bold text-blue-600 w-6">CN:</span><span className="text-gray-600">Correct Negatives — Forecast ≠ Heavy, Observed ≠ Heavy</span></div>
              </div>
              <div className="space-y-1 font-mono">
                <div className="text-gray-700"><span className="font-bold">POD</span> = H / (H + M)</div>
                <div className="text-gray-700"><span className="font-bold">FAR</span> = F / (H + F)</div>
                <div className="text-gray-700"><span className="font-bold">CSI</span> = H / (H + M + F)</div>
                <div className="text-gray-700"><span className="font-bold">BIAS</span> = (H + F) / (H + M)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed View: District-Wise Table */}
      {detailedResults && selectedDay && !districtDetail && (
        <div className="space-y-6">
          <button
            onClick={() => { setSelectedDay(null); setDetailedResults(null); }}
            className="flex items-center text-blue-600 hover:text-blue-700 font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Overview
          </button>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {selectedDay} Verification — District-Wise Analysis
            </h3>
            <p className="text-sm text-gray-600">
              Click on any district row to see a date-by-date formula audit panel.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">District-Wise Statistics</h3>
                  <p className="text-sm text-gray-600 mt-1">Month-long verification for {selectedDay} across all districts</p>
                </div>
                <button
                  onClick={() => {
                    try {
                      const excelData: any[][] = [];
                      excelData.push([`HRV-1 Verification — ${selectedDay}`]);
                      excelData.push([`Date Range: ${startDate} to ${endDate}`]);
                      excelData.push([]);
                      excelData.push(['District', 'Hit (H)', 'Miss (M)', 'False Alarm (F)', 'CN', 'Total', 'POD=H/(H+M)', 'CSI=H/(H+M+F)', 'FAR=F/(H+F)', 'BIAS=(H+F)/(H+M)']);
                      Object.entries(detailedResults.district_wise)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .forEach(([district, scores]) => {
                          const { H, M, F, CN, Total } = scores;
                          excelData.push([
                            district, H, M, F, CN, Total,
                            scores.POD.toFixed(4),
                            scores.CSI.toFixed(4),
                            scores.FAR.toFixed(4),
                            scores.Bias.toFixed(4)
                          ]);
                        });
                      const ws = XLSX.utils.aoa_to_sheet(excelData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, selectedDay);
                      XLSX.writeFile(wb, `HRV1_${selectedDay}_${startDate}_to_${endDate}.xlsx`);
                      toast.success(`Downloaded ${selectedDay} verification table`);
                    } catch (error: any) {
                      toast.error('Failed to export table');
                    }
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2 text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">District</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-green-700 uppercase">Hit (H)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-red-700 uppercase">Miss (M)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-orange-700 uppercase">False Alarm (F)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-blue-700 uppercase">CN</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">POD</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">CSI</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">FAR</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">BIAS</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(detailedResults.district_wise)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([district, scores]) => (
                      <tr
                        key={district}
                        onClick={() => loadDistrictDetail(district)}
                        className="hover:bg-amber-50 cursor-pointer transition-colors group"
                        title="Click to see formula audit panel"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-700 group-hover:underline">
                          {district} →
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 font-semibold">{scores.H}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-red-600 font-semibold">{scores.M}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-orange-600 font-semibold">{scores.F}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-blue-600 font-semibold">{scores.CN}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(scores.POD, 'POD')}`}>{scores.POD.toFixed(3)}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(scores.CSI, 'CSI')}`}>{scores.CSI.toFixed(3)}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-semibold ${getScoreColor(scores.FAR, 'FAR')}`}>{scores.FAR.toFixed(3)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-700">{scores.Bias.toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* District Formula Audit Panel */}
      {districtDetail && selectedDay && (
        <div className="space-y-6">
          {/* Breadcrumb nav */}
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => { setSelectedDay(null); setDetailedResults(null); setDistrictDetail(null); }}
              className="text-blue-600 hover:underline"
            >← Overview</button>
            <span className="text-gray-400">/</span>
            <button
              onClick={() => setDistrictDetail(null)}
              className="text-blue-600 hover:underline"
            >{selectedDay} Districts</button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-800 font-semibold">{districtDetail.district}</span>
          </div>

          {/* Formula Card */}
          <div className="bg-white border-2 border-indigo-200 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{districtDetail.district} — Formula Audit</h3>
                <p className="text-sm text-gray-500">{selectedDay} · {startDate} to {endDate}</p>
              </div>
            </div>

            {/* Raw counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Hit (H)', value: districtDetail.totals.H, color: 'bg-green-50 border-green-300 text-green-800' },
                { label: 'Miss (M)', value: districtDetail.totals.M, color: 'bg-red-50 border-red-300 text-red-800' },
                { label: 'False Alarm (F)', value: districtDetail.totals.F, color: 'bg-orange-50 border-orange-300 text-orange-800' },
                { label: 'Correct Neg (CN)', value: districtDetail.totals.CN, color: 'bg-blue-50 border-blue-300 text-blue-800' },
              ].map(item => (
                <div key={item.label} className={`border rounded-lg p-4 ${item.color}`}>
                  <div className="text-2xl font-black">{item.value}</div>
                  <div className="text-xs font-semibold mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            {/* Formula breakdowns */}
            {(() => {
              const { H, M, F, CN, POD, FAR, CSI, Bias } = districtDetail.totals;
              const total = H + M + F + CN;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      name: 'POD', full: 'Probability of Detection',
                      formula: `H / (H + M)`,
                      substituted: `${H} / (${H} + ${M})`,
                      denominator: H + M,
                      result: POD,
                      color: 'border-emerald-400 bg-emerald-50',
                    },
                    {
                      name: 'FAR', full: 'False Alarm Ratio',
                      formula: `F / (H + F)`,
                      substituted: `${F} / (${H} + ${F})`,
                      denominator: H + F,
                      result: FAR,
                      color: 'border-orange-400 bg-orange-50',
                    },
                    {
                      name: 'CSI', full: 'Critical Success Index',
                      formula: `H / (H + M + F)`,
                      substituted: `${H} / (${H} + ${M} + ${F})`,
                      denominator: H + M + F,
                      result: CSI,
                      color: 'border-violet-400 bg-violet-50',
                    },
                    {
                      name: 'BIAS', full: 'Frequency Bias',
                      formula: `(H + F) / (H + M)`,
                      substituted: `(${H} + ${F}) / (${H} + ${M})`,
                      denominator: H + M,
                      result: Bias,
                      color: 'border-sky-400 bg-sky-50',
                    },
                  ].map(item => (
                    <div key={item.name} className={`border-2 rounded-xl p-4 ${item.color}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-black text-gray-900">{item.name}</span>
                        <span className="text-xs text-gray-500 font-medium">{item.full}</span>
                      </div>
                      <div className="font-mono text-sm text-gray-700 mb-1">= {item.formula}</div>
                      <div className="font-mono text-sm text-gray-600 mb-1">= {item.substituted}</div>
                      {item.denominator === 0 ? (
                        <div className="font-mono text-sm text-gray-500">= 0 (no events — denominator is 0)</div>
                      ) : (
                        <div className="font-mono text-sm">
                          = {item.denominator === 0 ? 0 : (item.name === 'BIAS' ? H + F : item.name === 'FAR' ? F : H)} / {item.denominator}
                          {' '}= <span className="font-black text-gray-900">{item.result.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
              Total data points for this district in period: <span className="font-bold text-gray-700">{districtDetail.totals.H + districtDetail.totals.M + districtDetail.totals.F + districtDetail.totals.CN}</span>
              {' '}(H + M + F + CN = {districtDetail.totals.H} + {districtDetail.totals.M} + {districtDetail.totals.F} + {districtDetail.totals.CN})
            </div>
          </div>

          {/* Per-date raw table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Date-by-Date Raw Data</h3>
              <p className="text-sm text-gray-600 mt-1">Each row is one day's issue date comparison for {districtDetail.district}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Forecast Code</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Forecast Class</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Observed (mm)</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Observed Class</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Outcome</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {districtDetail.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data found for this district in the selected period</td>
                    </tr>
                  ) : (
                    districtDetail.rows
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-gray-800">{row.date}</td>
                          <td className="px-4 py-3 text-center font-mono text-gray-700">{row.forecastCode ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold">{row.forecastClass}</span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-gray-700">
                            {row.realisedMm != null ? `${row.realisedMm.toFixed(1)} mm` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-xs font-bold">{row.realisedClass}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${getTypeStyle(row.type)}`}>{row.type}</span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* No Results State */}
      {!overviewResults && !isLoading && (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-600 text-lg">Configure parameters and run verification to see results</p>
          <p className="text-gray-500 text-sm mt-2">Click any day card to view district-wise analysis → click any district for formula audit</p>
        </div>
      )}
    </div>
  );
}
