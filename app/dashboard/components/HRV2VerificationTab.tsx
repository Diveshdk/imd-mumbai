'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

interface SkillScores {
  H: number;
  M: number;
  F: number;
  CN: number;
  Total: number;
  POD: number;
  FAR: number;
  CSI: number;
  Bias: number;
}

interface LeadTimeResults {
  [day: string]: {
    [category: string]: SkillScores;
  };
}

interface DetailedResults {
  success: boolean;
  start_date: string;
  end_date: string;
  selectedDay: string;
  categories: {
    [category: string]: {
      [district: string]: SkillScores;
    };
  };
}

interface OverviewResults {
  success: boolean;
  start_date: string;
  end_date: string;
  lead_times: LeadTimeResults;
}

interface ComparisonRow {
  date: string;
  forecastCode: number | null;
  forecastClass: string;
  realisedMm: number | null;
  realisedClass: string;
  outcome: 'Hit' | 'Miss' | 'False Alarm' | 'Correct Negative';
}

interface CategoryDetail {
  H: number; M: number; F: number; CN: number;
  POD: number; FAR: number; CSI: number; Bias: number;
  rows: ComparisonRow[];
}

interface DistrictDetail {
  district: string;
  selectedDay: string;
  categories: { [cat: string]: CategoryDetail };
}

// Static colors remain the same
const CATEGORY_COLORS: { [key: string]: { bg: string; border: string; text: string } } = {
  'H': { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800' },
  'VH': { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800' },
  'XH': { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800' }
};

interface HRV2VerificationTabProps {
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
}

export default function HRV2VerificationTab({ 
  startDate, 
  setStartDate, 
  endDate, 
  setEndDate 
}: HRV2VerificationTabProps) {
  const { config } = useRainfallConfig();

  // Dynamic category names based on config
  const getCategoryName = (cat: string) => {
    if (!config) return cat === 'H' ? 'Heavy Rainfall' : (cat === 'VH' ? 'Very Heavy' : 'Extremely Heavy');
    
    const item = config.classifications.multi.items.find(i => i.id === cat);
    if (item) {
      return `${item.label} (${item.variableName})`;
    }
    
    // Fallback to defaults if not found
    const defaults: { [key: string]: string } = {
      'H': 'Heavy Rainfall (64.5–115.5 mm)',
      'VH': 'Very Heavy Rainfall (115.6–204.4 mm)',
      'XH': 'Extremely Heavy Rainfall (≥204.5 mm)'
    };
    return defaults[cat] || cat;
  };
  const [isLoading, setIsLoading] = useState(false);
  const [overviewResults, setOverviewResults] = useState<OverviewResults | null>(null);
  const [detailedResults, setDetailedResults] = useState<DetailedResults | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [districtDetail, setDistrictDetail] = useState<DistrictDetail | null>(null);

  const runVerification = async () => {
    setIsLoading(true);
    setSelectedDay(null);
    setDetailedResults(null);
    setDistrictDetail(null);
    try {
      const response = await fetch('/api/verification/category-wise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate })
      });
      const result = await response.json();
      if (result.success) {
        setOverviewResults(result);
        toast.success('HRV-2 Verification completed!');
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
      const response = await fetch('/api/verification/category-wise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, selectedDay: day })
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
      const response = await fetch('/api/verification/category-wise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, selectedDay, selectedDistrict: district })
      });
      const result = await response.json();
      if (result.success) {
        setDistrictDetail({ district, selectedDay, categories: result.categories });
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

  const getOutcomeStyle = (outcome: string) => {
    switch (outcome) {
      case 'Hit': return 'bg-green-100 text-green-800 font-bold';
      case 'Miss': return 'bg-red-100 text-red-800 font-bold';
      case 'False Alarm': return 'bg-orange-100 text-orange-800 font-bold';
      case 'Correct Negative': return 'bg-blue-100 text-blue-800 font-bold';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const FormulaAuditCard = ({ cat, catDetail }: { cat: string; catDetail: CategoryDetail }) => {
    const { H, M, F, CN, POD, FAR, CSI, Bias } = catDetail;
    const total = H + M + F + CN;
    return (
      <div className={`border-2 rounded-xl p-5 ${CATEGORY_COLORS[cat].border} ${CATEGORY_COLORS[cat].bg}`}>
        <h4 className={`text-base font-bold mb-4 ${CATEGORY_COLORS[cat].text}`}>{getCategoryName(cat)}</h4>

        {/* Raw Counts */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'H', val: H, color: 'bg-green-100 border-green-300 text-green-800' },
            { label: 'M', val: M, color: 'bg-red-100 border-red-300 text-red-800' },
            { label: 'F', val: F, color: 'bg-orange-100 border-orange-300 text-orange-800' },
            { label: 'CN', val: CN, color: 'bg-blue-100 border-blue-300 text-blue-800' },
          ].map(item => (
            <div key={item.label} className={`border rounded-lg p-2 text-center ${item.color}`}>
              <div className="text-xl font-black">{item.val}</div>
              <div className="text-xs font-semibold">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Formula Derivations */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'POD', formula: `${H} / (${H}+${M})`, denom: H + M, num: H, result: POD },
            { name: 'FAR', formula: `${F} / (${H}+${F})`, denom: H + F, num: F, result: FAR },
            { name: 'CSI', formula: `${H} / (${H}+${M}+${F})`, denom: H + M + F, num: H, result: CSI },
            { name: 'BIAS', formula: `(${H}+${F}) / (${H}+${M})`, denom: H + M, num: H + F, result: Bias },
          ].map(item => (
            <div key={item.name} className="bg-white border border-gray-200 rounded-lg p-2">
              <div className="text-xs font-black text-gray-700 mb-0.5">{item.name}</div>
              <div className="font-mono text-xs text-gray-500">= {item.formula}</div>
              {item.denom === 0
                ? <div className="font-mono text-xs text-gray-400">= 0 (no events)</div>
                : <div className="font-mono text-xs font-bold text-gray-900">= {item.num}/{item.denom} = {item.result.toFixed(4)}</div>
              }
            </div>
          ))}
        </div>

        <div className="mt-2 text-xs text-gray-500 font-mono">
          Total = H+M+F+CN = {H}+{M}+{F}+{CN} = {total}
        </div>
      </div>
    );
  };

  const downloadCategoryExcel = (cat: string) => {
    if (!overviewResults) return;
    try {
      const excelData: any[][] = [];
      excelData.push([`HRV-2 Verification — ${getCategoryName(cat)}`]);
      excelData.push([`Date Range: ${startDate} to ${endDate}`]);
      excelData.push([]);
      excelData.push(['Day', 'Hit (H)', 'Miss (M)', 'F. Alarm (F)', 'CN', 'Total', 'POD=H/(H+M)', 'CSI=H/(H+M+F)', 'FAR=F/(H+F)', 'BIAS=(H+F)/(H+M)']);
      Object.entries(overviewResults.lead_times).forEach(([day, data]) => {
        const s = data[cat];
        excelData.push([day, s.H, s.M, s.F, s.CN, s.Total, s.POD.toFixed(4), s.CSI.toFixed(4), s.FAR.toFixed(4), s.Bias.toFixed(4)]);
      });
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cat);
      XLSX.writeFile(wb, `HRV2_${cat}_${startDate}_to_${endDate}.xlsx`);
      toast.success(`Downloaded ${cat} table`);
    } catch { toast.error('Export failed'); }
  };

  const downloadDetailedExcel = (cat: string) => {
    if (!detailedResults || !selectedDay) return;
    try {
      const excelData: any[][] = [];
      excelData.push([`HRV-2 — ${getCategoryName(cat)} — ${selectedDay}`]);
      excelData.push([`Date Range: ${startDate} to ${endDate}`]);
      excelData.push([]);
      excelData.push(['District', 'Hit (H)', 'Miss (M)', 'F. Alarm (F)', 'CN', 'Total', 'POD=H/(H+M)', 'CSI=H/(H+M+F)', 'FAR=F/(H+F)', 'BIAS=(H+F)/(H+M)']);
      Object.entries(detailedResults.categories[cat])
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([district, s]) => {
          excelData.push([district, s.H, s.M, s.F, s.CN, s.Total, s.POD.toFixed(4), s.CSI.toFixed(4), s.FAR.toFixed(4), s.Bias.toFixed(4)]);
        });
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${cat}_${selectedDay}`);
      XLSX.writeFile(wb, `HRV2_${cat}_${selectedDay}_${startDate}_to_${endDate}.xlsx`);
      toast.success(`Downloaded ${cat} district table`);
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">HRV-2: Category-wise Multi-Mode Verification</h2>
        <p className="text-gray-600 mb-6">Independent binary verification per rainfall severity. Click a day → district → see formula audit panel.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900" />
          </div>
        </div>
        <button onClick={runVerification} disabled={isLoading}
          className={`px-6 py-3 rounded-md font-medium ${isLoading ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {isLoading ? 'Running...' : 'Run HRV-2 Verification'}
        </button>
      </div>

      {/* LEVEL 1: Overview by Day */}
      {overviewResults && !selectedDay && (
        <div className="space-y-10">
          {['H', 'VH', 'XH'].map(cat => (
            <div key={cat} className="bg-white rounded-lg shadow overflow-hidden border">
              <div className={`px-6 py-4 border-b flex justify-between items-center ${CATEGORY_COLORS[cat].bg}`}>
                <div>
                  <h3 className={`text-lg font-bold ${CATEGORY_COLORS[cat].text}`}>{getCategoryName(cat)}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Click any day row for district-wise breakdown</p>
                </div>
                <button onClick={() => downloadCategoryExcel(cat)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Excel
                </button>
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
                    {Object.entries(overviewResults.lead_times).map(([day, data]) => {
                      const s = data[cat];
                      const dayCode = day.replace('Day-', 'D');
                      return (
                        <tr key={day} onClick={() => loadDayDetails(dayCode)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-blue-600">{day}</td>
                          <td className="px-6 py-4 text-center text-sm text-green-600 font-semibold">{s.H}</td>
                          <td className="px-6 py-4 text-center text-sm text-red-600 font-semibold">{s.M}</td>
                          <td className="px-6 py-4 text-center text-sm text-orange-600 font-semibold">{s.F}</td>
                          <td className="px-6 py-4 text-center text-sm text-blue-600 font-semibold">{s.CN}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.POD, 'POD')}`}>{s.POD.toFixed(3)}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.CSI, 'CSI')}`}>{s.CSI.toFixed(3)}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.FAR, 'FAR')}`}>{s.FAR.toFixed(3)}</td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-gray-700">{s.Bias.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LEVEL 2: District List for a specific Day */}
      {detailedResults && selectedDay && !districtDetail && (
        <div className="space-y-8">
          <button onClick={() => { setSelectedDay(null); setDetailedResults(null); }}
            className="flex items-center text-blue-600 hover:text-blue-700 font-medium">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Overview
          </button>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-lg font-bold text-gray-900">{selectedDay} — District-wise Analysis</h3>
            <p className="text-sm text-gray-600 mt-1">Click on any district row to see the step-by-step formula audit for all categories.</p>
          </div>

          {['H', 'VH', 'XH'].map(cat => (
            <div key={cat} className="bg-white rounded-lg shadow overflow-hidden border">
              <div className={`px-6 py-4 border-b flex justify-between items-center ${CATEGORY_COLORS[cat].bg}`}>
                <h3 className={`text-lg font-bold ${CATEGORY_COLORS[cat].text}`}>{getCategoryName(cat)}</h3>
                <button onClick={() => downloadDetailedExcel(cat)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">District</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-green-700 uppercase">Hit (H)</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-red-700 uppercase">Miss (M)</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-orange-700 uppercase">FA (F)</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-blue-700 uppercase">CN</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">POD</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">CSI</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">FAR</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">BIAS</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(detailedResults.categories[cat])
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([district, s]) => (
                        <tr key={district} onClick={() => loadDistrictDetail(district)}
                          className="hover:bg-amber-50 cursor-pointer transition-colors group" title="Click for formula audit">
                          <td className="px-6 py-4 text-sm font-bold text-blue-700 group-hover:underline">{district} →</td>
                          <td className="px-6 py-4 text-center text-sm text-green-600 font-semibold">{s.H}</td>
                          <td className="px-6 py-4 text-center text-sm text-red-600 font-semibold">{s.M}</td>
                          <td className="px-6 py-4 text-center text-sm text-orange-600 font-semibold">{s.F}</td>
                          <td className="px-6 py-4 text-center text-sm text-blue-600 font-semibold">{s.CN}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.POD, 'POD')}`}>{s.POD.toFixed(3)}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.CSI, 'CSI')}`}>{s.CSI.toFixed(3)}</td>
                          <td className={`px-6 py-4 text-center text-sm font-bold ${getScoreColor(s.FAR, 'FAR')}`}>{s.FAR.toFixed(3)}</td>
                          <td className="px-6 py-4 text-center text-sm font-bold text-gray-700">{s.Bias.toFixed(3)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LEVEL 3: District Formula Audit Panel */}
      {districtDetail && selectedDay && (
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setSelectedDay(null); setDetailedResults(null); setDistrictDetail(null); }}
              className="text-blue-600 hover:underline">← Overview</button>
            <span className="text-gray-400">/</span>
            <button onClick={() => setDistrictDetail(null)} className="text-blue-600 hover:underline">{selectedDay} Districts</button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-800 font-semibold">{districtDetail.district}</span>
          </div>

          {/* Formula Audit Panel — one card per category */}
          <div className="bg-white border-2 border-indigo-200 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{districtDetail.district} — Formula Audit (All Categories)</h3>
                <p className="text-sm text-gray-500">{selectedDay} · {startDate} to {endDate}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['H', 'VH', 'XH'] as const).map(cat => (
                <FormulaAuditCard key={cat} cat={cat} catDetail={districtDetail.categories[cat]} />
              ))}
            </div>
          </div>

          {/* Raw date-by-date table — one section per category */}
          {(['H', 'VH', 'XH'] as const).map(cat => (
            <div key={cat} className="bg-white rounded-lg shadow overflow-hidden">
              <div className={`px-6 py-4 border-b ${CATEGORY_COLORS[cat].bg}`}>
                <h3 className={`text-base font-bold ${CATEGORY_COLORS[cat].text}`}>{getCategoryName(cat)} — Date-by-Date</h3>
                <p className="text-sm text-gray-500">Outcome per issue date for this category only</p>
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
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Outcome for {cat}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {districtDetail.categories[cat]?.rows?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data for this period</td>
                      </tr>
                    ) : (
                      (districtDetail.categories[cat]?.rows ?? [])
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
                              <span className={`px-2 py-0.5 rounded text-xs ${getOutcomeStyle(row.outcome)}`}>{row.outcome}</span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!overviewResults && !isLoading && (
        <div className="bg-gray-50 rounded-lg p-12 text-center border-2 border-dashed">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-600 text-lg">Run HRV-2 verification to see category-wise insights</p>
          <p className="text-gray-500 text-sm mt-2">Click any day → district → formula audit panel with step-by-step derivations</p>
        </div>
      )}
    </div>
  );
}
