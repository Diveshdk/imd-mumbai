'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-hot-toast';

// Dynamically import MapVisualization to avoid SSR issues
const MapVisualization = dynamic(() => import('@/app/dashboard/components/MapVisualization'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ height: '450px' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-500 text-xs">Loading map...</p>
      </div>
    </div>
  ),
});

const PANEL_METRICS: Array<{
  key: 'pod' | 'far' | 'bias' | 'csi' | 'accuracy';
  label: string;
  description: string;
}> = [
  { key: 'pod', label: 'POD', description: 'Probability of Detection' },
  { key: 'far', label: 'FAR', description: 'False Alarm Ratio' },
  { key: 'bias', label: 'BIAS', description: 'Frequency Bias' },
  { key: 'csi', label: 'CSI', description: 'Critical Success Index' },
  { key: 'accuracy', label: 'ACC', description: 'Overall Accuracy (%)' },
];

interface MultiMapPanelProps {
  startDate: string;
  endDate: string;
  leadDay: string;
  viewMode: 'daily' | 'monthly';
  selectedDate: string;
  selectedMonth: string;
  /** Category for per-category binary stats in multi-mode (empty = overall) */
  selectedCategory?: string;
  /** Current config mode: 'dual' | 'multi' */
  configMode?: 'dual' | 'multi';
  onClose?: () => void;
}

export default function MultiMapPanel({
  startDate,
  endDate,
  leadDay,
  viewMode,
  selectedDate,
  selectedMonth,
  selectedCategory = '',
  configMode = 'dual',
  onClose,
}: MultiMapPanelProps) {
  const [metricData, setMetricData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-fetch whenever date range, lead day, or category changes
  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchData();
  }, [startDate, endDate, leadDay, selectedCategory, configMode]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, leadDay });

      // Pass category for per-category binary stats when in multi-mode
      if (configMode === 'multi' && selectedCategory) {
        params.set('category', selectedCategory);
      }

      const response = await fetch(`/api/map-metrics?${params}`);
      const result = await response.json();

      if (response.ok && result.success) {
        setMetricData(result.districts || {});
      } else {
        toast.error(result.error || 'Failed to fetch verification data for panel');
        setMetricData({});
      }
    } catch (error: any) {
      console.error('MultiMapPanel fetch error:', error);
      toast.error('Failed to load research panel data');
      setMetricData({});
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Download the panel as PNG.
   * Strategy: The panel maps use SVG (preferCanvas=false / interactive=false).
   * We use html2canvas with foreignObjectRendering for reliable SVG capture.
   */
  const handleDownload = async () => {
    if (!panelRef.current) return;
    setIsDownloading(true);
    
    // Save current scroll position
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    try {
      // Scroll to top-left to avoid html2canvas offset issues
      window.scrollTo(0, 0);

      const html2canvas = (await import('html2canvas')).default;

      // Wait for any pending renders/fitBounds to settle after scroll
      await new Promise(r => setTimeout(r, 600));

      const canvas = await html2canvas(panelRef.current, {
        backgroundColor: '#ffffff',
        scale: 1.5, // 1.5 is safer for high-DPI coordinate alignment
        logging: true, // Enable logging for debugging if needed
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: 0,
        // Force a large virtual window to prevent any viewport-based clipping
        windowWidth: 1920,
        windowHeight: 3000,
        // Workaround for 'lab' and 'oklch' color parsing errors in html2canvas
        onclone: (clonedDoc: Document) => {
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * { 
              transition: none !important; 
              animation: none !important; 
              text-shadow: none !important;
            }
            /* Force Leaflet to NOT use 3D transforms in the capture clone */
            .leaflet-map-pane, .leaflet-tile-pane, .leaflet-objects-pane, 
            .leaflet-shadow-pane, .leaflet-overlay-pane, .leaflet-marker-pane, 
            .leaflet-tooltip-pane, .leaflet-popup-pane, .leaflet-layer, .leaflet-zoom-animated {
              transform: none !important;
              left: 0 !important;
              top: 0 !important;
            }
            /* Reset SVG clipping which often causes 'cut' maps in capture */
            svg.leaflet-zoom-animated {
              width: 100% !important;
              height: 100% !important;
              transform: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);

          // Aggressive manual style sanitization using computed styles
          const elements = clonedDoc.getElementsByTagName("*");
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            
            // Fix Leaflet paths that might be offset
            if (el.tagName === 'path') {
              el.style.transform = 'none';
            }

            if (el.style) {
              const computed = window.getComputedStyle(el);
              const properties = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke', 'outlineColor'];
              properties.forEach(prop => {
                const val = (computed as any)[prop];
                if (val && (val.includes('oklch') || val.includes('lab'))) {
                   const fallback = prop === 'color' || prop === 'fill' ? '#111827' : 'rgba(0,0,0,0)';
                   el.style.setProperty(prop === 'backgroundColor' ? 'background-color' : 
                                      prop === 'borderColor' ? 'border-color' : 
                                      prop === 'outlineColor' ? 'outline-color' : prop, 
                                      fallback, 'important');
                }
              });
            }
          }
        },
        // Ignore Leaflet's internal image elements that can fail cross-origin
        ignoreElements: (el: Element) => {
          // Ignore tile layers (there are none here, but safety net)
          return el.tagName === 'IMG' && (el as HTMLImageElement).crossOrigin !== 'anonymous';
        },
      } as any);

      // Trigger download
      canvas.toBlob((blob) => {
        if (!blob) { toast.error('Failed to create image'); setIsDownloading(false); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const period = viewMode === 'daily' ? selectedDate : selectedMonth;
        const catSuffix = selectedCategory ? `_${selectedCategory}` : '';
        link.download = `Research_Panel_${period}_${leadDay}${catSuffix}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Research panel downloaded!');
        setIsDownloading(false);
      }, 'image/png');
    } catch (err: any) {
      console.error('Download error:', err);
      toast.error('Download failed: ' + err.message);
      setIsDownloading(false);
    } finally {
      // Restore scroll position
      window.scrollTo(scrollX, scrollY);
    }
  };

  const periodLabel = viewMode === 'daily'
    ? new Date(selectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const categoryLabel = configMode === 'multi' && selectedCategory
    ? ` · Category: ${selectedCategory}`
    : '';

  return (
    <div className="bg-white rounded-xl shadow-lg border border-blue-200 overflow-hidden">
      {/* Panel Header (outside panelRef — not captured in download) */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-white text-base font-bold tracking-wide">📊 Research Panel — 5-Metric View</h2>
          <p className="text-blue-200 text-xs mt-0.5">
            {periodLabel} · Lead: <strong className="text-white">{leadDay}</strong>{categoryLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            disabled={isDownloading || isLoading || Object.keys(metricData).length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 font-semibold rounded-lg text-sm shadow hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div> Downloading...</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PNG
              </>
            )}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-white hover:text-blue-200 transition" title="Close panel">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-600 text-sm font-medium">Loading all 5 verification maps...</p>
            {selectedCategory && configMode === 'multi' && (
              <p className="text-purple-500 text-xs mt-1">Category: {selectedCategory}</p>
            )}
          </div>
        </div>
      )}

      {/* 5-Map Grid — this div IS captured by html2canvas */}
      {!isLoading && (
        <div ref={panelRef} className="bg-white p-5">
          {/* Export header */}
          <div className="text-center mb-4 pb-3 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Maharashtra Verification Research Panel</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {periodLabel} · Lead Day {leadDay}
              {categoryLabel && <span className="text-purple-600 font-semibold"> · {categoryLabel}</span>}
              {' · All Verification Metrics'}
            </p>
          </div>

          {Object.keys(metricData).length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <svg className="w-14 h-14 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-base font-medium">No verification data available</p>
              <p className="text-sm mt-1">There is no uploaded data for the selected period.</p>
            </div>
          ) : (
            <>
              {/* Top row: POD, FAR, BIAS */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {PANEL_METRICS.slice(0, 3).map((m) => (
                  <div key={m.key} className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                    <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 text-center">
                      <span className="text-sm font-bold text-gray-800">{m.label}</span>
                      <span className="text-xs text-gray-500 ml-1">— {m.description}</span>
                    </div>
                    {/* interactive=false → static map, compact=true → no title overlay, SVG rendering for download */}
                    <div style={{ height: '450px', position: 'relative' }}>
                      <MapVisualization
                        rainfallData={[]}
                        viewMode={viewMode}
                        selectedDate={selectedDate}
                        selectedMonth={selectedMonth}
                        metric={m.key}
                        metricData={metricData}
                        interactive={false}
                        compact={true}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom row: CSI, ACCURACY (centred) */}
              <div className="flex justify-center gap-2">
                {PANEL_METRICS.slice(3).map((m) => (
                  <div
                    key={m.key}
                    className="rounded-lg overflow-hidden border border-gray-200 shadow-sm"
                    style={{ width: 'calc(33.333% - 4px)' }}
                  >
                    <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 text-center">
                      <span className="text-sm font-bold text-gray-800">{m.label}</span>
                      <span className="text-xs text-gray-500 ml-1">— {m.description}</span>
                    </div>
                    <div style={{ height: '450px', position: 'relative' }}>
                      <MapVisualization
                        rainfallData={[]}
                        viewMode={viewMode}
                        selectedDate={selectedDate}
                        selectedMonth={selectedMonth}
                        metric={m.key}
                        metricData={metricData}
                        interactive={false}
                        compact={true}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer for exported image */}
              <div className="mt-4 pt-2 border-t border-gray-100 text-center text-xs text-gray-400">
                Maharashtra Weather Verification System · {new Date().toLocaleString('en-IN')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
