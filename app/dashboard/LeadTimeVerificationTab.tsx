'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import CalendarView from './components/CalendarView';
import DateVerificationView from './components/DateVerificationView';

interface DateInfo {
  date: string;
  accuracy: number | null;
  cached: boolean;
}

interface LeadTimeVerificationTabProps {
  mode?: 'dual' | 'multi';
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
}

export default function LeadTimeVerificationTab({ 
  mode = 'dual', 
  selectedDate, 
  setSelectedDate 
}: LeadTimeVerificationTabProps) {
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [isCheckingData, setIsCheckingData] = useState(true);
  const [overallAccuracy, setOverallAccuracy] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedMonth, setSelectedMonth] = useState(6);
  const [availableMonths, setAvailableMonths] = useState<Array<{year: number, month: number, label: string}>>([]);

  // Check for existing data on mount
  useEffect(() => {
    checkForData();
  }, []);

  // Load dates when month/year changes
  useEffect(() => {
    if (hasData) {
      loadAvailableDates();
      setSelectedDate(null); // Clear selected date when month changes
      setVerificationData(null);
    }
  }, [hasData, selectedYear, selectedMonth]);

  const checkForData = async () => {
    setIsCheckingData(true);
    try {
      const response = await fetch('/api/metadata');
      const result = await response.json();

      if (result.success && result.hasData) {
        setHasData(true);
        
        // Extract available months from metadata
        const months: Array<{year: number, month: number, label: string}> = [];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        
        if (result.metadata?.uploads?.forecast) {
          result.metadata.uploads.forecast.forEach((monthKey: string) => {
            const [year, month] = monthKey.split('-').map(Number);
            if (year && month) {
              months.push({
                year,
                month,
                label: `${monthNames[month - 1]} ${year}`
              });
            }
          });
        }
        
        // Sort by year and month descending (most recent first)
        months.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });
        
        setAvailableMonths(months);
        
        // Set to most recent month
        if (months.length > 0) {
          setSelectedYear(months[0].year);
          setSelectedMonth(months[0].month);
        }
        
        toast.success('Data loaded from storage');
      } else {
        setHasData(false);
      }
    } catch (error: any) {
      console.error('Metadata check error:', error);
      setHasData(false);
    } finally {
      setIsCheckingData(false);
    }
  };

  const loadAvailableDates = async () => {
    try {
      const response = await fetch(`/api/dates?year=${selectedYear}&month=${selectedMonth}`);
      const result = await response.json();

      if (result.success) {
        setAvailableDates(result.dates);
        
        // Calculate overall accuracy from cached dates
        const cachedDates = result.dates.filter((d: DateInfo) => d.accuracy !== null);
        if (cachedDates.length > 0) {
          const avgAccuracy = cachedDates.reduce((sum: number, d: DateInfo) => sum + (d.accuracy || 0), 0) / cachedDates.length;
          setOverallAccuracy(avgAccuracy);
        }
      }
    } catch (error: any) {
      console.error('Dates load error:', error);
      toast.error('Failed to load dates');
    }
  };

  const handleMonthChange = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleDateSelect = async (date: string) => {
    setSelectedDate(date);
    setIsLoadingDate(true);
    setVerificationData(null);

    try {
      const response = await fetch(`/api/verification/${date}?mode=${mode}`);
      const result = await response.json();

      if (result.success) {
        setVerificationData(result);
        
        // Update overall accuracy if this is a new calculation
        if (!result.cached) {
          loadAvailableDates(); // Refresh to get updated accuracy
        }
        
        if (result.cached) {
          toast.success('Loaded from cache');
        } else {
          toast.success('Verification calculated and cached');
        }
      } else {
        toast.error(result.error || 'Failed to load date data');
      }
    } catch (error: any) {
      console.error('Date load error:', error);
      toast.error('Failed to load date data: ' + error.message);
    } finally {
      setIsLoadingDate(false);
    }
  };

  const getAccuracyColor = (accuracy: number | null) => {
    if (accuracy === null) return 'text-black font-bold';
    if (accuracy >= 75) return 'text-green-600';
    if (accuracy >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyBadge = (accuracy: number | null) => {
    if (accuracy === null) return 'bg-gray-100 text-gray-800';
    if (accuracy >= 75) return 'bg-green-100 text-green-800';
    if (accuracy >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (isCheckingData) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking for data...</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-2">⚠️ No Data Found</h3>
          <p className="text-yellow-700 mb-4">
            No IMD data has been uploaded yet. The data needs to be uploaded once, and it will be stored permanently.
          </p>
          <p className="text-sm text-yellow-600">
            Contact your system administrator to run the one-time data upload script.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Accuracy Display */}
      {overallAccuracy !== null && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-black mb-1">Overall System Accuracy</h3>
              <p className="text-sm text-black font-bold">Based on cached verifications</p>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold ${getAccuracyColor(overallAccuracy)}`}>
                {overallAccuracy.toFixed(1)}%
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2 ${getAccuracyBadge(overallAccuracy)}`}>
                {overallAccuracy >= 75 ? '🟢 Good' : overallAccuracy >= 60 ? '🟡 Moderate' : '🔴 Needs Improvement'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Lead-Time Verification Analysis
        </h2>
        <p className="text-gray-600 mb-4">
          Select a date to view detailed verification results. Data is loaded on-demand and cached for fast access.
        </p>
        
        {/* Month/Year Selector */}
        {availableMonths.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Month
            </label>
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number);
                handleMonthChange(year, month);
              }}
              className="block w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
            >
              {availableMonths.map(({ year, month, label }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">✓ Data Available</h3>
          <p className="text-sm text-blue-700">
            {availableDates.length} dates available for {availableMonths.find(m => m.year === selectedYear && m.month === selectedMonth)?.label || `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}`}.
            Click any date to view verification results.
          </p>
        </div>
      </div>

      {/* Calendar */}
      <CalendarView
        month={selectedMonth}
        year={selectedYear}
        availableDates={availableDates.map(d => d.date)}
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
      />

      {/* Loading State */}
      {isLoadingDate && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <svg className="animate-spin h-12 w-12 mx-auto text-blue-600 mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Loading verification data...</p>
        </div>
      )}

      {/* Verification Results */}
      {selectedDate && verificationData && !isLoadingDate && (
        <div>
          {verificationData.cached && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-700">
                ⚡ Loaded from cache - instant access!
              </p>
            </div>
          )}
          <DateVerificationView
            selectedDate={selectedDate}
            overall={verificationData.overall}
            day1={verificationData.day1}
            day2={verificationData.day2}
            day3={verificationData.day3}
            day4={verificationData.day4}
            day5={verificationData.day5}
          />
        </div>
      )}

      {/* No Date Selected */}
      {!selectedDate && !isLoadingDate && (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-900 mb-4 font-bold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-black font-bold text-lg">Select a date from the calendar to view verification results</p>
          <p className="text-black font-bold text-sm mt-2">Results are calculated on-demand and cached for fast access</p>
        </div>
      )}
    </div>
  );
}
