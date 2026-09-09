import { useEffect, useRef, useState } from 'react';
import { loadMaps, mapsConfigured } from '../lib/maps';
import type { TelemetrySample } from '../lib/telemetry';

interface LiveMapProps {
  positions?: TelemetrySample[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
}

type MarkerLike = { map: google.maps.Map | null };

export function LiveMap({ positions = [], center, zoom = 14, height = '360px' }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<MarkerLike[]>([]);
  const [failed, setFailed] = useState(false);

  const configured = mapsConfigured();

  useEffect(() => {
    if (!configured || mapRef.current) return;

    loadMaps()
      .then(() => {
        if (!containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: center ?? { lat: 9.082, lng: 8.6753 },
          zoom,
          mapId: 'transit_live',
          disableDefaultUI: true,
          backgroundColor: '#131313',
        });
      })
      .catch(() => setFailed(true));
  }, [configured, center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !configured) return;

    for (const marker of markersRef.current) marker.map = null;
    markersRef.current = [];

    let cancelled = false;
    void loadMaps().then(() => {
      if (cancelled || !mapRef.current) return;
      const { AdvancedMarkerElement } = google.maps.marker;
      for (const p of positions) {
        const el = document.createElement('div');
        el.className =
          'h-3 w-3 bg-on-tertiary-container border border-white shadow-[0_0_0_4px_rgba(194,34,41,0.35)]';
        const marker = new AdvancedMarkerElement({
          position: { lat: p.lat, lng: p.lng },
          map: mapRef.current,
          content: el,
          title: p.deviceId,
        });
        markersRef.current.push(marker as unknown as MarkerLike);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [positions, configured]);

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
          <div className="label-caps text-on-surface-variant">Google Maps not configured</div>
          <div className="data-mono mt-xs text-[11px] text-on-surface-variant">
            Set VITE_GOOGLE_MAPS_API_KEY to enable live tracking
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