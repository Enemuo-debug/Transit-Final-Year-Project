import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapsConfigured, mapStyleUrl } from '../lib/maps';
import type { TelemetrySample } from '../lib/telemetry';

export interface MapLine {
  id: string | number;
  coordinates: [number, number][];
  color?: string;
}

export interface MapIncident {
  id: number;
  lat: number;
  lng: number;
  severity?: string;
}

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapVehicle {
  lat: number;
  lng: number;
  heading?: number;
}

interface LiveMapProps {
  positions?: TelemetrySample[];
  lines?: MapLine[];
  corridor?: FeatureCollection | null;
  incidents?: MapIncident[];
  markers?: MapMarker[];
  vehicle?: MapVehicle;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  picking?: boolean;
  onMapClick?: (coords: MapPoint) => void;
}

const LINES_SOURCE = 'transit-lines';
const CORRIDOR_SOURCE = 'transit-corridor';

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ffb4ab',
  HIGH: '#ffb4ab',
  MEDIUM: '#ffd27a',
  LOW: '#9ad5ff',
};

export function LiveMap({
  positions = [],
  lines = [],
  corridor = null,
  incidents = [],
  markers = [],
  vehicle,
  center,
  zoom = 14,
  height = '360px',
  picking = false,
  onMapClick,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pinMarkersRef = useRef<maplibregl.Marker[]>([]);
  const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const createdRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Keep the click handler fresh without re-registering the listener.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const previousCenterRef = useRef<{ lat: number | null; lng: number | null; zoom: number }>({
    lat: null,
    lng: null,
    zoom,
  });

  const configured = mapsConfigured();

  useEffect(() => {
    if (!configured || createdRef.current || !containerRef.current) return;
    createdRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(),
      center: [center?.lng ?? 8.6753, center?.lat ?? 9.082],
      zoom,
    });
    map.on('error', () => setFailed(true));
    map.on('load', () => {
      if (!map.getSource(CORRIDOR_SOURCE)) {
        map.addSource(CORRIDOR_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'transit-corridor-fill',
          type: 'fill',
          source: CORRIDOR_SOURCE,
          paint: {
            'fill-color': '#1a73e8',
            'fill-opacity': 0.12,
          },
        });
        map.addLayer({
          id: 'transit-corridor-outline',
          type: 'line',
          source: CORRIDOR_SOURCE,
          paint: {
            'line-color': '#1a73e8',
            'line-width': 1.5,
            'line-opacity': 0.6,
          },
        });
      }

      if (!map.getSource(LINES_SOURCE)) {
        map.addSource(LINES_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: LINES_SOURCE,
          type: 'line',
          source: LINES_SOURCE,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-opacity': 0.9,
          },
        });
      }
      setReady(true);
    });
    map.on('click', (e) => {
      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;

    return () => {
      for (const marker of markersRef.current) marker.remove();
      for (const marker of incidentMarkersRef.current) marker.remove();
      for (const marker of pinMarkersRef.current) marker.remove();
      vehicleMarkerRef.current?.remove();
      vehicleMarkerRef.current = null;
      markersRef.current = [];
      incidentMarkersRef.current = [];
      pinMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      createdRef.current = false;
      setReady(false);
    };
  }, [configured]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const previous = previousCenterRef.current;
    const lat = center?.lat ?? null;
    const lng = center?.lng ?? null;
    if (previous.lat !== lat || previous.lng !== lng || previous.zoom !== zoom) {
      map.easeTo({ center: [lng ?? 8.6753, lat ?? 9.082], zoom });
      previousCenterRef.current = { lat, lng, zoom };
    }
  });

  // Crosshair cursor while picking
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = picking ? 'crosshair' : '';
  }, [picking, ready]);

  // Vehicle markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const p of positions) {
      const el = document.createElement('div');
      el.className =
        'h-3 w-3 bg-on-tertiary-container border border-white shadow-[0_0_0_4px_rgba(194,34,41,0.35)]';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [positions, configured]);

  // Incident markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured || !ready) return;

    for (const marker of incidentMarkersRef.current) marker.remove();
    incidentMarkersRef.current = [];

    for (const incident of incidents) {
      const color = SEVERITY_COLOR[incident.severity ?? ''] ?? '#ffd27a';
      const el = document.createElement('div');
      el.className = 'h-3 w-3 border-2 border-black';
      el.style.backgroundColor = color;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([incident.lng, incident.lat])
        .addTo(map);
      incidentMarkersRef.current.push(marker);
    }
  }, [incidents, configured, ready]);

  // Numbered pins (route stops, picked points)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured) return;

    for (const marker of pinMarkersRef.current) marker.remove();
    pinMarkersRef.current = [];

    for (const pin of markers) {
      const el = document.createElement('div');
      el.className =
        'flex items-center justify-center border border-white text-[10px] font-bold text-white';
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.backgroundColor = pin.color ?? '#c22229';
      if (pin.label !== undefined) el.textContent = pin.label;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      pinMarkersRef.current.push(marker);
    }
  }, [markers, configured]);

  // Navigation-style vehicle marker (rotates with heading)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured) return;

    vehicleMarkerRef.current?.remove();
    vehicleMarkerRef.current = null;
    if (!vehicle) return;

    const el = document.createElement('div');
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';

    const arrow = document.createElement('div');
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '8px solid transparent';
    arrow.style.borderRight = '8px solid transparent';
    arrow.style.borderBottom = '18px solid #1a73e8';
    arrow.style.filter = 'drop-shadow(0 0 3px rgba(0,0,0,0.7))';
    arrow.style.transform = `rotate(${vehicle.heading ?? 0}deg)`;
    el.appendChild(arrow);

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([vehicle.lng, vehicle.lat])
      .addTo(map);
    vehicleMarkerRef.current = marker;
  }, [vehicle?.lat, vehicle?.lng, vehicle?.heading, configured]);

  // Corridor polygon (buffer around the route line)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(CORRIDOR_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(corridor ?? { type: 'FeatureCollection', features: [] });
  }, [corridor, ready]);

  // Route corridor lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured || !ready) return;
    const source = map.getSource(LINES_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: lines
        .filter((line) => line.coordinates.length >= 2)
        .map((line) => ({
          type: 'Feature' as const,
          properties: { color: line.color ?? '#c22229' },
          geometry: { type: 'LineString' as const, coordinates: line.coordinates },
        })),
    });
  }, [lines, configured, ready]);

  if (!configured) {
    return (
      <div
        className="grid-pattern flex w-full items-center justify-center border border-outline-variant bg-surface-container-lowest"
        style={{ height }}
      >
        <div className="px-md py-md text-center">
          <span className="material-symbols-outlined mb-sm block text-[28px] text-on-surface-variant">
            map
          </span>
          <div className="label-caps text-on-surface-variant">MapTiler not configured</div>
          <div className="data-mono mt-xs text-[11px] text-on-surface-variant">
            Set VITE_MAPTILER_API_KEY to enable live tracking
          </div>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className="grid-pattern flex w-full items-center justify-center border border-outline-variant bg-surface-container-lowest"
        style={{ height }}
      >
        <div className="label-caps text-on-surface-variant">Map failed to load</div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full border border-outline-variant" style={{ height }} />;
}
