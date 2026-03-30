import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  getRainfallColor,
  getRainfallColorDynamic, 
  getRainfallCategory, 
  getMonthlyRainfallColor,
  getMonthlyRainfallCategory,
  normalizeDistrictName, 
  findDistrictColumn 
} from '@/app/utils/rainfallColors';
import { useRainfallConfig } from '@/app/utils/useRainfallConfig';

interface DistrictRainfall {
  district: string;
  rainfall: number;
  maxRainfallDate?: string;
  maxRainfallValue?: number;
}

interface MapVisualizationProps {
  rainfallData: DistrictRainfall[];
  viewMode: 'daily' | 'monthly';
  selectedDate: string;
  selectedMonth: string;
  metric?: 'rainfall' | 'pod' | 'far' | 'bias' | 'csi' | 'subdivision' | 'accuracy';
  metricData?: Record<string, any>;
  /** If false, disables all map interaction (drag, zoom, scroll, keyboard). Default: true */
  interactive?: boolean;
  /** If true, shows a short metric label instead of full heading text. Default: false */
  compact?: boolean;
}

// Maharashtra Meteorological Subdivisions
const MAHARASHTRA_SUBDIVISIONS = [
  {
    name: 'Konkan',
    color: '#6366f1',
    cities: ['MUMBAI', 'MUMBAI SUBURBAN', 'THANE', 'PALGHAR', 'RAIGAD', 'RATNAGIRI', 'SINDHUDURG']
  },
  {
    name: 'South Madhya Maharashtra',
    color: '#10b981',
    cities: ['PUNE', 'SATARA', 'SANGLI', 'KOLHAPUR', 'SOLAPUR']
  },
  {
    name: 'North Madhya Maharashtra',
    color: '#f59e0b',
    cities: ['NASHIK', 'DHULE', 'JALGAON', 'NANDURBAR', 'AHMEDNAGAR']
  },
  {
    name: 'Marathwada',
    color: '#ef4444',
    cities: ['CHHATRAPATI SAMBHAJI NAGAR', 'AURANGABAD', 'JALNA', 'BEED', 'LATUR', 'OSMANABAD', 'NANDED', 'HINGOLI', 'PARBHANI']
  }
];

// Component to fit bounds when data changes
function FitBounds({ geoJsonData }: { geoJsonData: any }) {
  const map = useMap();

  useEffect(() => {
    if (geoJsonData) {
      // Ensure the map container size is correctly recognized before fitting bounds
      const timer = setTimeout(() => {
        map.invalidateSize();
        const geoJsonLayer = L.geoJSON(geoJsonData);
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          // Use more padding for compact/panel maps to prevent clipping during capture
          const p = 15; 
          map.fitBounds(bounds, { padding: [p, p] });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [geoJsonData, map]);

  // Handle window resize to re-invalidate and re-center
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      if (geoJsonData) {
        const bounds = L.geoJSON(geoJsonData).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [10, 10] });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map, geoJsonData]);

  return null;
}

// Component to add value labels for districts (metric value or rainfall mm)
interface MapValueLabelsProps {
  geoJsonData: any;
  metric: string;
  metricData: Record<string, any>;
  rainfallData: DistrictRainfall[];
  viewMode: 'daily' | 'monthly';
}

function MapValueLabels({ geoJsonData, metric, metricData, rainfallData, viewMode }: MapValueLabelsProps) {
  const map = useMap();

  useEffect(() => {
    if (!geoJsonData) return;
    
    // No labels for subdivision
    if (metric === 'subdivision') return;

    // Build a quick lookup for rainfall data
    const rainfallMap = new Map<string, number>();
    rainfallData.forEach(item => rainfallMap.set(item.district, item.rainfall));

    const labelGroup = L.layerGroup().addTo(map);
    const geoJsonLayer = L.geoJSON(geoJsonData);
    
    geoJsonLayer.eachLayer((layer: any) => {
      if (layer.getBounds) {
        const distCol = findDistrictColumn(layer.feature.properties);
        const districtNorm = layer.feature.properties['DISTRICT_NORM'] || '';
        
        let labelText = '';

        if (metric === 'rainfall') {
          const val = rainfallMap.get(districtNorm);
          if (val !== undefined && val > 0) {
            labelText = `${val.toFixed(0)}`;
          }
        } else {
          // Verification metric: show numeric value
          const stats = metricData[districtNorm];
          if (stats) {
            const val = stats[metric];
            if (typeof val === 'number') {
              if (metric === 'accuracy') {
                labelText = `${val.toFixed(0)}%`;
              } else if (metric === 'bias') {
                labelText = val.toFixed(2);
              } else {
                labelText = val.toFixed(2);
              }
            }
          }
        }

        if (labelText) {
          L.marker(layer.getBounds().getCenter(), {
            icon: L.divIcon({
              className: '',
              html: `<div style="font-size: 9px; font-weight: 800; color: #111; text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; text-align: center; width: 50px; transform: translateX(-25px); pointer-events: none; letter-spacing: 0.3px;">${labelText}</div>`,
            }),
            interactive: false
          }).addTo(labelGroup);
        }
      }
    });

    return () => {
      map.removeLayer(labelGroup);
    };
  }, [geoJsonData, map, metric, metricData, rainfallData, viewMode]);

  return null;
}

export default function MapVisualization({
  rainfallData,
  viewMode,
  selectedDate,
  selectedMonth,
  metric = 'rainfall',
  metricData = {},
  interactive = true,
  compact = false,
}: MapVisualizationProps) {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { config } = useRainfallConfig();

  // Load GeoJSON files
  useEffect(() => {
    const loadGeoJson = async () => {
      setIsLoading(true);
      try {
        const [maharashtraResponse, goaResponse] = await Promise.all([
          fetch('/geojson/MAHARASHTRA_DISTRICTS.geojson'),
          fetch('/geojson/GOA_DISTRICTS.geojson'),
        ]);

        const maharashtraData = await maharashtraResponse.json();
        const goaData = await goaResponse.json();

        // Normalize features
        const processFeatures = (data: any) => {
          if (!data.features) return [];
          data.features.forEach((feature: any) => {
            const distCol = findDistrictColumn(feature.properties);
            if (distCol && feature.properties[distCol]) {
              const distName = feature.properties[distCol].toString();
              feature.properties['DISTRICT_NORM'] = normalizeDistrictName(distName);
            }
          });
          return data.features;
        };

        const combined = {
          type: 'FeatureCollection',
          features: [
            ...processFeatures(maharashtraData),
            ...processFeatures(goaData),
          ],
        };

        setGeoJsonData(combined);
      } catch (error) {
        console.error('Error loading GeoJSON:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadGeoJson();
  }, []);

  // Create a map of district -> stats
  const rainfallMap = new Map<string, DistrictRainfall>();
  rainfallData.forEach((item) => {
    rainfallMap.set(item.district, item);
  });

  const getMetricColor = (districtNorm: string, val: number) => {
    if (metric === 'pod' || metric === 'csi') {
      // Green scale for POD/CSI (High is good)
      if (val >= 0.8) return '#166534';
      if (val >= 0.6) return '#22c55e';
      if (val >= 0.4) return '#86efac';
      if (val >= 0.2) return '#dcfce7';
      return '#f0fdf4';
    }
    if (metric === 'accuracy') {
      // Green scale for Accuracy (High is good) - same as POD
      if (val >= 90) return '#166534';
      if (val >= 80) return '#22c55e';
      if (val >= 70) return '#86efac';
      if (val >= 60) return '#dcfce7';
      return '#f0fdf4';
    }
    if (metric === 'far') {
      // Red scale for FAR (Low is good)
      if (val >= 0.8) return '#991b1b';
      if (val >= 0.6) return '#ef4444';
      if (val >= 0.4) return '#fca5a5';
      if (val >= 0.2) return '#fee2e2';
      return '#fef2f2';
    }
    if (metric === 'bias') {
      // Diverging for Bias (1.0 is perfect)
      if (val > 1.5) return '#9a3412'; // High Overforecast
      if (val > 1.1) return '#f97316'; // Overforecast
      if (val >= 0.9) return '#22c55e'; // Good
      if (val >= 0.5) return '#3b82f6'; // Underforecast
      return '#1e3a8a'; // Deep Underforecast
    }
    if (metric === 'subdivision') {
      for (const sub of MAHARASHTRA_SUBDIVISIONS) {
        if (sub.cities.some(c => normalizeDistrictName(c) === districtNorm)) {
          return sub.color;
        }
      }
      return '#D3D3D3';
    }
    return '#D3D3D3';
  };

  // Style function for GeoJSON
  const style = (feature: any) => {
    const districtNorm = feature.properties.DISTRICT_NORM;
    let color = '#D3D3D3';

    if (metric === 'rainfall') {
      const rainfall = rainfallMap.get(districtNorm)?.rainfall || 0;
      if (viewMode === 'daily') {
        color = getRainfallColor(rainfall);
      } else {
        color = getMonthlyRainfallColor(rainfall);
      }
    } else if (metric === 'subdivision') {
      color = getMetricColor(districtNorm, 0);
    } else {
      const val = metricData[districtNorm]?.[metric] ?? -1;
      if (val !== -1) {
        color = getMetricColor(districtNorm, val);
      }
    }

    return {
      fillColor: color,
      weight: 1,
      opacity: 1,
      color: '#333',
      fillOpacity: 0.7,
    };
  };

  const highlightStyle = {
    weight: 3,
    color: '#000',
    fillOpacity: 0.9,
  };

  const onEachFeature = (feature: any, layer: any) => {
    const distCol = findDistrictColumn(feature.properties);
    const districtName = distCol ? feature.properties[distCol] : 'Unknown';
    const districtNorm = feature.properties.DISTRICT_NORM;
    
    let tooltipContent = `<strong>${districtName}</strong><br/>`;

    if (metric === 'rainfall') {
      const data = rainfallMap.get(districtNorm);
      const rainfall = data?.rainfall || 0;
      const category = viewMode === 'daily' ? getRainfallCategory(rainfall) : getMonthlyRainfallCategory(rainfall);
      
      if (viewMode === 'daily') {
        tooltipContent += `Rainfall: <strong>${rainfall.toFixed(1)} mm</strong><br/>Category: <em>${category}</em>`;
      } else {
        tooltipContent += `Total accumulation: <strong>${rainfall.toFixed(1)} mm</strong><br/>Category: <em>${category}</em><br/>`;
        if (data?.maxRainfallValue !== undefined && data?.maxRainfallDate) {
          tooltipContent += `Max rainfall: <strong>${data.maxRainfallValue.toFixed(1)} mm</strong> on <strong>${data.maxRainfallDate}</strong>`;
        } else if (data?.maxRainfallDate) {
          tooltipContent += `Max rainfall date: <strong>${data.maxRainfallDate}</strong>`;
        }
      }
    } else if (metric === 'subdivision') {
      const sub = MAHARASHTRA_SUBDIVISIONS.find(s => s.cities.some(c => normalizeDistrictName(c) === districtNorm));
      tooltipContent += `Subdivision: <strong>${sub?.name || 'N/A'}</strong>`;
    } else {
      const stats = metricData[districtNorm];
      if (stats) {
        const val = stats[metric];
        tooltipContent += `${metric.toUpperCase()}: <strong>${typeof val === 'number' ? val.toFixed(3) : 'N/A'}</strong><br/>`;
        tooltipContent += `Total predictions: ${stats.total || 0}`;
      } else {
        tooltipContent += `No verification data available`;
      }
    }

    layer.bindTooltip(`<div style="font-family: sans-serif;">${tooltipContent}</div>`, {
      sticky: false,
      direction: 'top',
    });

    layer.on({
      mouseover: (e: any) => {
        const layer = e.target;
        layer.setStyle(highlightStyle);
        layer.bringToFront();
      },
      mouseout: (e: any) => {
        const layer = e.target;
        layer.setStyle(style(feature));
      },
      click: (e: any) => {
        const data = rainfallMap.get(districtNorm);
        const rainfall = data?.rainfall || 0;
        if (viewMode === 'monthly') {
          alert(`District: ${districtName}\nTotal Cumulative Rainfall for this month: ${rainfall.toFixed(1)} mm`);
        } else {
          alert(`District: ${districtName}\nRainfall for ${new Date(selectedDate).toLocaleDateString('en-IN')}: ${rainfall.toFixed(1)} mm`);
        }
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading map data...</p>
        </div>
      </div>
    );
  }

  const mapHeight = compact ? '450px' : '700px';

  return (
    <div 
      className="relative overflow-hidden" 
      id={compact ? undefined : 'map-visualization-container'}
      style={{ backgroundColor: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #e5e7eb', height: mapHeight }}
    >
      <MapContainer
        center={[19.7515, 75.7139]}
        zoom={7}
        minZoom={6}
        // Use preferCanvas only in interactive mode — SVG is needed for html2canvas export
        preferCanvas={interactive}
        style={{ height: mapHeight, width: '100%', borderRadius: '0.5rem', background: 'transparent' }}
        className="z-0"
        zoomControl={!compact}
        dragging={interactive}
        scrollWheelZoom={!compact}
        doubleClickZoom={!compact}
        touchZoom={!compact}
        keyboard={interactive}
        boxZoom={interactive}
      >
        <GeoJSON
          key={`${JSON.stringify(rainfallData)}-${metric}-${config?.mode}-${JSON.stringify(Object.keys(metricData))}`}
          data={geoJsonData}
          style={style}
          onEachFeature={onEachFeature}
        />
        <MapValueLabels
          geoJsonData={geoJsonData}
          metric={metric}
          metricData={metricData}
          rainfallData={rainfallData}
          viewMode={viewMode}
        />
        <FitBounds geoJsonData={geoJsonData} />
      </MapContainer>

      {/* Map title overlay — compact mode shows short label only */}
      {!compact && (
        <div 
          className="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 z-[1000]"
          style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.9)', 
            borderRadius: '0.5rem', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            {metric === 'rainfall' 
              ? (viewMode === 'daily' 
                  ? `Rainfall: ${new Date(selectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                  : `Rainfall: ${new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`)
              : metric === 'subdivision' 
                ? 'Subdivisions'
                : metric.toUpperCase()
            }
          </h3>
        </div>
      )}
    </div>
  );
}
