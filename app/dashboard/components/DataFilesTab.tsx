'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

interface DataFile {
  id: string;
  type: 'warning' | 'realised';
  year: number;
  month: number;
  day: number;
  lead_day: string | null;
  districts: Record<string, number | null>;
  updated_at: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const YEARS = Array.from({ length: 8 }, (_, i) => 2022 + i);

export default function DataFilesTab() {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [files, setFiles] = useState<DataFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DataFile | null>(null);
  const [editedDistricts, setEditedDistricts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'warning' | 'realised'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setSelectedFile(null);
    try {
      const res = await fetch(`/api/admin/data-files?year=${year}&month=${month}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
      } else {
        toast.error(data.error || 'Failed to load files');
      }
    } catch {
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleSelectFile = (file: DataFile) => {
    setSelectedFile(file);
    setDeleteConfirmId(null);
    // Initialize editable values as strings for the inputs
    const initialValues: Record<string, string> = {};
    for (const [dist, val] of Object.entries(file.districts)) {
      initialValues[dist] = val === null ? '' : String(val);
    }
    setEditedDistricts(initialValues);
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      // Convert string inputs back to numbers/null
      const parsed: Record<string, number | null> = {};
      for (const [dist, raw] of Object.entries(editedDistricts)) {
        const trimmed = raw.trim();
        if (trimmed === '' || trimmed === '-') {
          parsed[dist] = null;
        } else {
          const n = parseFloat(trimmed);
          parsed[dist] = isNaN(n) ? null : n;
        }
      }

      const res = await fetch(`/api/admin/data-files?id=${selectedFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districts: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Saved successfully');
        // Update in local state
        const updated = { ...selectedFile, districts: parsed, updated_at: data.file.updated_at };
        setSelectedFile(updated);
        setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/data-files?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('File deleted');
        setFiles(prev => prev.filter(f => f.id !== id));
        if (selectedFile?.id === id) setSelectedFile(null);
        setDeleteConfirmId(null);
      } else {
        toast.error(data.error || 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredFiles = files.filter(f => filter === 'all' || f.type === filter);

  const warningCount = files.filter(f => f.type === 'warning').length;
  const realisedCount = files.filter(f => f.type === 'realised').length;

  const fileLabel = (f: DataFile) => {
    const day = String(f.day).padStart(2, '0');
    const mo = String(f.month).padStart(2, '0');
    if (f.type === 'warning') {
      return `Day ${day}/${mo} — ${f.lead_day}`;
    }
    return `Day ${day}/${mo}`;
  };

  const hasChanges = selectedFile
    ? Object.entries(editedDistricts).some(([dist, raw]) => {
        const original = selectedFile.districts[dist];
        const trimmed = raw.trim();
        if (trimmed === '' || trimmed === '-') return original !== null;
        const n = parseFloat(trimmed);
        return isNaN(n) ? original !== null : n !== original;
      })
    : false;

  return (
    <div className="flex gap-6 h-[calc(100vh-220px)] min-h-[600px]">
      {/* ── Left Panel: Month/Year picker + File list ── */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Picker */}
        <div className="p-4 border-b bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select Period</p>
          <div className="flex gap-2 mb-3">
            <select
              value={month}
              onChange={e => setMonth(parseInt(e.target.value))}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {/* Filter pills */}
          <div className="flex gap-1.5">
            {(['all', 'warning', 'realised'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-xs py-1 rounded-full font-semibold transition-colors ${
                  filter === f
                    ? f === 'warning' ? 'bg-orange-500 text-white'
                      : f === 'realised' ? 'bg-green-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? `All (${files.length})` : f === 'warning' ? `Warn (${warningCount})` : `Real (${realisedCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No files found</p>
              <p className="text-xs text-gray-400 mt-1">Upload data to see files here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Group by type */}
              {(['warning', 'realised'] as const).map(type => {
                const typeFiles = filteredFiles.filter(f => f.type === type);
                if (typeFiles.length === 0) return null;
                return (
                  <div key={type}>
                    <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wide sticky top-0 z-10 ${
                      type === 'warning' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {type === 'warning' ? '⚠ Warning Data' : '🌧 Realised Data'}
                      <span className="ml-2 font-normal opacity-75">({typeFiles.length})</span>
                    </div>
                    {typeFiles.map(file => (
                      <button
                        key={file.id}
                        onClick={() => handleSelectFile(file)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between group ${
                          selectedFile?.id === file.id
                            ? 'bg-blue-50 border-l-4 border-blue-600'
                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-semibold ${selectedFile?.id === file.id ? 'text-blue-700' : 'text-gray-800'}`}>
                            {fileLabel(file)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {Object.keys(file.districts).length} districts
                          </p>
                        </div>
                        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${selectedFile?.id === file.id ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <div className="p-3 border-t bg-gray-50">
          <button
            onClick={fetchFiles}
            disabled={isLoading}
            className="w-full text-sm text-gray-600 hover:text-blue-600 font-medium py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Right Panel: District editor ── */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {!selectedFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-500">Select a file to edit</p>
            <p className="text-sm text-gray-400 mt-1">Choose a file from the left panel</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    selectedFile.type === 'warning'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {selectedFile.type === 'warning' ? '⚠ Warning' : '🌧 Realised'}
                  </span>
                  <h3 className="text-base font-bold text-gray-900">
                    {MONTHS[selectedFile.month - 1]} {selectedFile.day}, {selectedFile.year}
                    {selectedFile.lead_day && (
                      <span className="ml-2 text-sm font-semibold text-blue-600">({selectedFile.lead_day})</span>
                    )}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {Object.keys(selectedFile.districts).length} districts · Last updated: {new Date(selectedFile.updated_at).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    Unsaved changes
                  </span>
                )}
                <button
                  onClick={() => handleDelete(selectedFile.id)}
                  disabled={isDeleting}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                    deleteConfirmId === selectedFile.id
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'border border-red-300 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {deleteConfirmId === selectedFile.id ? '⚠ Confirm Delete' : 'Delete File'}
                </button>
                {deleteConfirmId === selectedFile.id && (
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* District Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {Object.entries(editedDistricts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([district, value]) => {
                    const original = selectedFile.districts[district];
                    const trimmed = value.trim();
                    const parsed = trimmed === '' ? null : parseFloat(trimmed);
                    const isDirty = isNaN(parsed as number)
                      ? original !== null
                      : parsed !== original;

                    return (
                      <div
                        key={district}
                        className={`rounded-xl border-2 p-3 transition-colors ${
                          isDirty
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide truncate mb-1.5">
                          {district}
                        </p>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={value}
                          placeholder={selectedFile.type === 'warning' ? 'Code' : 'mm'}
                          onChange={e => setEditedDistricts(prev => ({
                            ...prev,
                            [district]: e.target.value
                          }))}
                          className={`w-full text-sm font-bold rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-2 bg-white transition-colors ${
                            isDirty
                              ? 'border-amber-400 text-amber-700 focus:ring-amber-300'
                              : 'border-gray-200 text-gray-800 focus:ring-blue-300'
                          }`}
                        />
                        {isDirty && original !== undefined && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            was: {original === null ? '—' : original}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Footer actions */}
            {hasChanges && (
              <div className="px-6 py-3 border-t bg-amber-50 flex items-center justify-between">
                <p className="text-sm text-amber-700 font-medium">
                  You have unsaved changes. Click "Save Changes" to apply them to master data.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSelectFile(selectedFile)}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
