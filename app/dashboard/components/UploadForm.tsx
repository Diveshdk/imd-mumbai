'use client';

/**
 * Upload Form Component
 * Allows users to upload Warning and Realised Excel files with metadata
 */

import { useState } from 'react';
import toast from 'react-hot-toast';

type UploadType = 'warning' | 'realised';

interface UploadFormProps {
  isAdmin?: boolean;
  canModify?: boolean;
}

interface UploadSummary {
  year: number;
  month: number;
  leadDay?: string;
  daysProcessed: number;
  filesCreated: number;
  errors: string[];
  warnings: string[];
}

export default function UploadForm({ isAdmin = false, canModify = false }: UploadFormProps) {
  const [uploadType, setUploadType] = useState<UploadType>('warning');
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<number>(2025);
  const [month, setMonth] = useState<number>(1);
  const [leadDay, setLeadDay] = useState<string>('D1');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // Generate year options (2020-2030)
  const yearOptions = Array.from({ length: 11 }, (_, i) => 2020 + i);

  // Month options
  const monthOptions = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  // Lead day options
  const leadDayOptions = ['D1', 'D2', 'D3', 'D4', 'D5'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const fileName = selectedFile.name.toLowerCase();
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        toast.error('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setFile(selectedFile);
      setUploadSummary(null); // Clear previous summary
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadSummary(null);

    try {
      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('year', String(year));
      formData.append('month', String(month));
      
      if (uploadType === 'warning') {
        formData.append('leadDay', leadDay);
      }

      // Determine endpoint
      const endpoint = uploadType === 'warning' 
        ? '/api/upload/warning' 
        : '/api/upload/realised';

      // Upload file
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        setUploadSummary(result.summary);
        setFile(null); // Clear file input
        
        // Reset file input element
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        toast.error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload = isAdmin || canModify;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Upload Data</h2>
        {isAdmin && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">Master Files</span>
        )}
        {!isAdmin && canModify && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">Personal Copy</span>
        )}
      </div>

      {/* Permission warning */}
      {!canUpload && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-800 font-medium">
              You do not have file modification permissions. Contact your admin to enable upload access.
            </p>
          </div>
        </div>
      )}

      {!isAdmin && canModify && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          <strong>Note:</strong> Your uploads create a personal copy of the data. The admin&apos;s master files are never modified.
        </div>
      )}

      {/* Tab Selection */}
      <div className="flex gap-2 mb-6 border-b border-gray-300">
        <button
          onClick={() => setUploadType('warning')}
          className={`px-6 py-3 font-medium transition-colors ${
            uploadType === 'warning'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Upload Warning
        </button>
        <button
          onClick={() => setUploadType('realised')}
          className={`px-6 py-3 font-medium transition-colors ${
            uploadType === 'realised'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Upload Realised
        </button>
      </div>

      {/* Upload Form */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        {/* File Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Excel File *
          </label>
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={isUploading}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Year Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Year *
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            disabled={isUploading}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Month Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Month *
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            disabled={isUploading}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lead Day Selection (only for Warning, now optional) */}
        {uploadType === 'warning' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lead Day (Optional - for single-sheet files only)
            </label>
            <select
              value={leadDay}
              onChange={(e) => setLeadDay(e.target.value)}
              disabled={isUploading}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900"
            >
              {leadDayOptions.map((ld) => (
                <option key={ld} value={ld}>
                  {ld}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Leave as default if uploading a multi-sheet file with Day1-Day5 sheets
            </p>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!file || isUploading || !canUpload}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? 'Uploading...' : !canUpload ? 'Upload Not Permitted' : 'Upload Data'}
        </button>
      </div>

      {/* Upload Summary */}
      {uploadSummary && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-4">
            ✅ Upload Successful
          </h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium">Year:</span> {uploadSummary.year}
            </p>
            <p>
              <span className="font-medium">Month:</span>{' '}
              {monthOptions.find((m) => m.value === uploadSummary.month)?.label}
            </p>
            {uploadSummary.leadDay && (
              <p>
                <span className="font-medium">Lead Day:</span> {uploadSummary.leadDay}
              </p>
            )}
            <p>
              <span className="font-medium">Days Processed:</span> {uploadSummary.daysProcessed}
            </p>
            <p>
              <span className="font-medium">Files Created:</span> {uploadSummary.filesCreated}
            </p>
            
            {uploadSummary.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="font-medium text-yellow-800 mb-2">⚠️ Warnings:</p>
                <ul className="list-disc list-inside text-yellow-700">
                  {uploadSummary.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {uploadSummary.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="font-medium text-red-800 mb-2">❌ Errors:</p>
                <ul className="list-disc list-inside text-red-700 max-h-40 overflow-y-auto">
                  {uploadSummary.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                  {uploadSummary.errors.length > 5 && (
                    <li className="text-sm italic">
                      ... and {uploadSummary.errors.length - 5} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">
          📋 Upload Instructions
        </h3>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <p className="font-semibold mb-1">Excel File Format:</p>
            <p className="ml-4">
              The file should have District names in the first column and day numbers (1-31) in subsequent columns.
            </p>
          </div>
          
          <div>
            <p className="font-semibold mb-1">Warning Sheet (New Multi-Sheet Format - Recommended):</p>
            <ul className="ml-4 list-disc list-inside space-y-1">
              <li>Upload <strong>one Excel file</strong> with <strong>5 sheets</strong> named: <code className="bg-gray-200 px-1 rounded">Day1</code>, <code className="bg-gray-200 px-1 rounded">Day2</code>, <code className="bg-gray-200 px-1 rounded">Day3</code>, <code className="bg-gray-200 px-1 rounded">Day4</code>, <code className="bg-gray-200 px-1 rounded">Day5</code></li>
              <li>Each sheet contains warning codes for that lead day</li>
              <li>All 5 lead days will be processed automatically in one upload</li>
              <li>No need to select a Lead Day - the system detects multi-sheet files automatically</li>
            </ul>
          </div>
          
          <div>
            <p className="font-semibold mb-1">Warning Sheet (Legacy Single-Sheet Format):</p>
            <ul className="ml-4 list-disc list-inside space-y-1">
              <li>Upload one Excel file per lead day (D1-D5)</li>
              <li>Select the appropriate Lead Day for each upload</li>
              <li>Requires 5 separate uploads to complete all lead days</li>
            </ul>
          </div>
          
          <div>
            <p className="font-semibold mb-1">Realised Sheet:</p>
            <ul className="ml-4 list-disc list-inside space-y-1">
              <li>Contains actual rainfall values (in mm) for each district and day</li>
              <li>Single sheet format (no changes)</li>
            </ul>
          </div>
          
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="font-semibold text-yellow-800 mb-1">⚠️ Important: Shifted Verification Logic</p>
            <p className="text-yellow-700">
              This system uses IMD's shifted verification methodology (D+1 alignment). 
              Forecasts issued on Day D are verified against realised data from Day D+1, D+2, etc., 
              depending on the lead day.
            </p>
          </div>
          
          <div>
            <p className="font-semibold mb-1">Data Storage:</p>
            <p className="ml-4">
              {isAdmin
                ? 'Files are saved as master records in Supabase and are accessible system-wide.'
                : canModify
                ? 'Files are saved as your personal copies. The admin\'s master data is not changed.'
                : 'You do not have upload permissions.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
