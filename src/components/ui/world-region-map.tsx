"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import 'leaflet/dist/leaflet.css';
import { REGION_LANGS, type RegionKey } from "@/lib/region-langs";
import { getLanguagesForRegion } from "@/lib/master-langs";

// RegionKey imported from region-langs

export function WorldRegionMap({
  selected,
  onSelect,
  className,
}: {
  selected?: string | null;
  onSelect: (region: RegionKey) => void;
  className?: string;
}) {
  // Normalize dynamic import json to avoid TS complaints in Next
  // Show a legend overlay for UX
  const [showLegend, setShowLegend] = useState(false);
  const [modalRegion, setModalRegion] = useState<RegionKey | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [legendKeys, setLegendKeys] = useState<RegionKey[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const mysteryHexRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapKey, setMapKey] = useState<string>(() => `map-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const selectedRef = useRef<string | null>(null);

  // Static color map for legend and region styling (excludes non-geographic/mystery)
  const REGION_COLORS: Record<RegionKey, string> = {
    "AMERICAS - North": "#14b8a6",
    "AMERICAS - Central & South": "#10b981",
    "EUROPE - Western & Northern": "#eab308",
    "EUROPE - Eastern & Central": "#f59e0b",
    "EUROPE - Minority & Other": "#d4a373",
    "AFRICA - North": "#fb923c",
    "AFRICA - West": "#f97316",
    "AFRICA - East": "#fdba74",
    "AFRICA - Central & Southern": "#ea580c",
    "MIDDLE EAST & WESTERN ASIA": "#ef4444",
    "ASIA - South": "#22c55e",
    "ASIA - Southeast": "#4ade80",
    "ASIA - East": "#60a5fa",
    "ASIA - Central & North": "#38bdf8",
    "OCEANIA": "#8b5cf6",
    "MYSTERIOUS": "#a855f7",
  };

  // Ensure a fresh container before we even try to initialize
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    try {
      if (el) {
        el.querySelectorAll('.leaflet-container').forEach((node) => {
          try { delete (node as any)._leaflet_id; } catch {}
          try { node.parentElement?.removeChild(node); } catch {}
        });
      }
    } catch {}
    // Always bump key during mount to avoid DOM reuse under Fast Refresh
    setMapKey(`map-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, []);

  // Dynamically import Leaflet on client
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === 'undefined') return;
        await import('leaflet');
        if (!cancelled) setLeafletReady(true);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!leafletReady) return;
    let destroyed = false;
    (async () => {
      const L: any = await import('leaflet');
      const container = mapElRef.current as HTMLDivElement | null;
      if (!container) return;
      try { delete (container as any)._leaflet_id; } catch {}
      try { if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; } } catch {}

      const map = L.map(container, { center: [20, 10], zoom: 2, scrollWheelZoom: false, worldCopyJump: true, preferCanvas: false });
      mapRef.current = map;
      // Dark basemap (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors, &copy; CARTO'
      }).addTo(map);
      // Load country polygons and group into our regions
      const topojson: any = await import('topojson-client');
      const worldModule: any = await import('world-atlas/countries-110m.json');
      const worldTopo = (worldModule && (worldModule.default || worldModule)) as any;
      // Convert TopoJSON to GeoJSON and normalize longitudes into [-180, 180]
      const countriesFcRaw = topojson.feature(worldTopo, worldTopo.objects.countries) as any;
      const normalizeLon = (lon: number) => {
        let x = lon; while (x > 180) x -= 360; while (x < -180) x += 360; return x;
      };
      function fixCoords(coords: any): any {
        if (typeof coords?.[0] === 'number') {
          const lon = normalizeLon(coords[0]);
          return [lon, coords[1]];
        }
        return coords.map(fixCoords);
      }
      let countriesFc = { ...countriesFcRaw, features: (countriesFcRaw.features || []).map((f: any) => {
        try {
          const g = JSON.parse(JSON.stringify(f));
          if (g?.geometry?.coordinates) g.geometry.coordinates = fixCoords(g.geometry.coordinates);
          return g;
        } catch { return f; }
      }) } as any;

      // Utility: clip polygon ring by vertical half-plane lon <= cutLon (keepLeft=true) or lon >= cutLon (keepLeft=false)
      try {
        function clipRingHalfPlane(ring: number[][], cutLon: number, keepLeft: boolean): number[][] {
          if (!ring || ring.length < 4) return [];
          const inside = (p: number[]) => keepLeft ? p[0] <= cutLon : p[0] >= cutLon;
          const intersect = (a: number[], b: number[]): number[] => {
            const [x1, y1] = a, [x2, y2] = b;
            if (x2 === x1) return [cutLon, y1];
            const t = (cutLon - x1) / (x2 - x1);
            return [cutLon, y1 + t * (y2 - y1)];
          };
          const out: number[][] = [];
          for (let i = 0; i < ring.length - 1; i++) {
            const curr = ring[i], next = ring[i + 1];
            const currIn = inside(curr), nextIn = inside(next);
            if (currIn && nextIn) {
              out.push(next);
            } else if (currIn && !nextIn) {
              out.push(intersect(curr, next));
            } else if (!currIn && nextIn) {
              out.push(intersect(curr, next));
              out.push(next);
            }
          }
          if (out.length < 3) return [];
          const first = out[0], last = out[out.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
          return out;
        }
        function clipGeomByLon(geom: any, cutLon: number, keepLeft: boolean): any | null {
          if (!geom) return null;
          const buildPoly = (rings: number[][][]): any | null => {
            const valid = rings.filter(r => r && r.length >= 4);
            if (!valid.length) return null;
            return { type: 'MultiPolygon', coordinates: valid.map(r => [r]) };
          };
          if (geom.type === 'Polygon') {
            const outer = (geom.coordinates && geom.coordinates[0]) || [];
            const r = clipRingHalfPlane(outer, cutLon, keepLeft);
            return buildPoly([r]);
          }
          if (geom.type === 'MultiPolygon') {
            const out: number[][][] = [];
            for (const poly of geom.coordinates || []) {
              const outer = (poly && poly[0]) || [];
              const r = clipRingHalfPlane(outer, cutLon, keepLeft);
              if (r && r.length >= 4) out.push(r);
            }
            return buildPoly(out);
          }
          return null;
        }
        // Split Russia into west-of-60°E (Europe) and east-of-60°E (Asia)
        const CUT_LON = 60; // approximate Ural boundary
        const nextFeatures: any[] = [];
        for (const f of countriesFc.features || []) {
          const nm = String((f.properties && (f.properties.name || f.properties.NAME)) || '').toLowerCase();
          const isRussia = nm === 'russia' || nm === 'russian federation' || f.id === 643 || f.id === '643';
          if (isRussia) { continue; }
          nextFeatures.push(f);
        }
        countriesFc = { ...countriesFc, features: nextFeatures } as any;
      } catch {}

      // Region bounding boxes (lon/lat): [minLon, minLat, maxLon, maxLat]
      const regionRects: Record<RegionKey, [number, number, number, number]> = {
        "AMERICAS - North": [-168, 15, -52, 72],
        "AMERICAS - Central & South": [-105, -56, -34, 15],
        // Western/Northern Europe (Iberia, France, Benelux, UK/IE, Nordics, Iceland)
        // Keep maxLon at 10E to avoid overlap with Eastern/Central when using order priority
        "EUROPE - Western & Northern": [-25, 34, 10, 72],
        // Eastern/Central Europe (Poland to Balkans, east to ~50E)
        "EUROPE - Eastern & Central": [10, 34, 50, 70],
        "EUROPE - Minority & Other": [-12, 35, 10, 45],
        "AFRICA - North": [-17, 20, 35, 37],
        "AFRICA - West": [-17, 5, 10, 20],
        "AFRICA - East": [28, -10, 50, 15],
        "AFRICA - Central & Southern": [10, -35, 40, 5],
        "MIDDLE EAST & WESTERN ASIA": [25, 12, 65, 42],
        "ASIA - South": [60, 5, 95, 35],
        "ASIA - Southeast": [95, -11, 135, 25],
        "ASIA - East": [100, 20, 150, 50],
        "ASIA - Central & North": [50, 40, 120, 75],
        "OCEANIA": [130, -45, 180, 0],
        "MYSTERIOUS": [70, -10, 75, -5],
      };

      const regionColors: Record<RegionKey, string> = REGION_COLORS;

      function inRect(lon: number, lat: number, rect: [number, number, number, number]) {
        return lon >= rect[0] && lon <= rect[2] && lat >= rect[1] && lat <= rect[3];
      }

      // Order matters when rects abut; earlier regions win for overlaps
      const regionOrder: RegionKey[] = [
        "AMERICAS - North",
        "AMERICAS - Central & South",
        "EUROPE - Eastern & Central",
        "EUROPE - Western & Northern",
        "AFRICA - North",
        "AFRICA - West",
        "AFRICA - East",
        "AFRICA - Central & Southern",
        "MIDDLE EAST & WESTERN ASIA",
        "ASIA - South",
        "ASIA - Southeast",
        "ASIA - East",
        "ASIA - Central & North",
        "OCEANIA",
      ];

      // Some countries include overseas territories that skew centroid (e.g., France with French Guiana, Denmark with Greenland).
      // Provide name-based overrides to ensure correct regional classification.
      const nameOverride: Partial<Record<string, RegionKey>> = {
        'france': 'EUROPE - Western & Northern',
        'denmark': 'EUROPE - Western & Northern',
        'norway': 'EUROPE - Western & Northern',
        'iceland': 'EUROPE - Western & Northern',
        'netherlands': 'EUROPE - Western & Northern',
        'united kingdom': 'EUROPE - Western & Northern',
        'ireland': 'EUROPE - Western & Northern',
      };

      for (const f of (countriesFc.features || [])) {
        try {
          const tmp = L.geoJSON(f);
          const b = tmp.getBounds();
          const c = b.getCenter();
          let assigned: RegionKey | null = null;
          const nm = String((f.properties && (f.properties.name || f.properties.NAME)) || '').toLowerCase();
          // Russia excluded above
          if (nameOverride[nm as keyof typeof nameOverride]) {
            assigned = nameOverride[nm as keyof typeof nameOverride] as RegionKey;
          }
          for (const rk of regionOrder) {
            const rect = regionRects[rk];
            if (inRect(c.lng, c.lat, rect)) { assigned = rk; break; }
          }
          f.properties = { ...(f.properties || {}), regionKey: assigned };
        } catch {}
      }

      // Render per-country features (Russia excluded), styled by feature.properties.regionKey
      let regionsFc = {
        type: 'FeatureCollection',
        features: (countriesFc.features || []).filter((f: any) => !!f?.properties?.regionKey)
      } as any;

      // Final safety: clip European regions to avoid wrapped copies at far west/east
      try {
        // Local copy of half-plane clipper used above
        const clipRingHalfPlaneLocal = (ring: number[][], cutLon: number, keepLeft: boolean): number[][] => {
          if (!ring || ring.length < 4) return [];
          const inside = (p: number[]) => keepLeft ? p[0] <= cutLon : p[0] >= cutLon;
          const intersect = (a: number[], b: number[]): number[] => {
            const [x1, y1] = a, [x2, y2] = b;
            if (x2 === x1) return [cutLon, y1];
            const t = (cutLon - x1) / (x2 - x1);
            return [cutLon, y1 + t * (y2 - y1)];
          };
          const out: number[][] = [];
          for (let i = 0; i < ring.length - 1; i++) {
            const curr = ring[i], next = ring[i + 1];
            const currIn = inside(curr), nextIn = inside(next);
            if (currIn && nextIn) out.push(next);
            else if (currIn && !nextIn) out.push(intersect(curr, next));
            else if (!currIn && nextIn) { out.push(intersect(curr, next)); out.push(next); }
          }
          if (out.length < 3) return [];
          const first = out[0], last = out[out.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
          return out;
        };
        const clipGeomByLon = (geom: any, cutLon: number, keepLeft: boolean): any | null => {
          if (!geom) return null;
          const buildPoly = (rings: number[][][]): any | null => {
            const valid = rings.filter(r => r && r.length >= 4);
            if (!valid.length) return null;
            return { type: 'MultiPolygon', coordinates: valid.map(r => [r]) };
          };
          if (geom.type === 'Polygon') {
            const outer = (geom.coordinates && geom.coordinates[0]) || [];
            const r = clipRingHalfPlaneLocal(outer, cutLon, keepLeft);
            return buildPoly([r]);
          }
          if (geom.type === 'MultiPolygon') {
            const out: number[][][] = [];
            for (const poly of geom.coordinates || []) {
              const outer = (poly && poly[0]) || [];
              const r = clipRingHalfPlaneLocal(outer, cutLon, keepLeft);
              if (r && r.length >= 4) out.push(r);
            }
            return buildPoly(out);
          }
          return null;
        };
        function clipGeomRange(geom: any, minLon: number, maxLon: number): any | null {
          const left = (g: any) => clipGeomByLon(g, maxLon, true);
          const right = (g: any) => clipGeomByLon(g, minLon, false);
          const g1 = left(geom); if (!g1) return null; const g2 = right(g1); return g2;
        }
        regionsFc.features = regionsFc.features.map((f: any) => {
          const rk: RegionKey | undefined = f?.properties?.regionKey;
          if (rk === 'EUROPE - Western & Northern') {
            // widen west/east and south clip to include Iberia/Italy/France
            const g = clipGeomRange(f.geometry, -40, 80); return g ? { ...f, geometry: g } : null;
          }
          if (rk === 'EUROPE - Eastern & Central') {
            const g = clipGeomRange(f.geometry, 10, 90); return g ? { ...f, geometry: g } : null;
          }
          return f;
        }).filter(Boolean);
      } catch {}

      // Split polygons that cross the antimeridian to avoid wrap artifacts (notably Russia)
      const norm = (lon: number) => { let x = lon; while (x > 180) x -= 360; while (x < -180) x += 360; return x; };
      function splitRingAtDateline(ring: number[][]): number[][][] {
        const out: number[][][] = [];
        if (!ring || ring.length < 4) return out;
        const closed = ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1];
        const pts = closed ? ring.slice(0) : ring.concat([ring[0]]);
        let curr: number[][] = [];
        const pushCurr = (pt: number[]) => { curr.push([norm(pt[0]), pt[1]]); };
        pushCurr(pts[0]);
        for (let i = 1; i < pts.length; i++) {
          let [lon1, lat1] = curr[curr.length - 1];
          let [lon2, lat2] = [norm(pts[i][0]), pts[i][1]];
          let d = lon2 - lon1;
          if (d > 180) lon2 -= 360; else if (d < -180) lon2 += 360;
          if (lon2 > 180 || lon2 < -180) {
            const boundary = lon2 > 180 ? 180 : -180;
            const t = (boundary - lon1) / (lon2 - lon1);
            const latI = lat1 + t * (lat2 - lat1);
            curr.push([boundary, latI]);
            // close and save current ring
            curr.push(curr[0]);
            out.push(curr);
            // start new ring on the opposite boundary
            const boundaryOpp = boundary === 180 ? -180 : 180;
            curr = [[boundaryOpp, latI]];
            const lon2Wrapped = lon2 > 180 ? lon2 - 360 : lon2 + 360;
            curr.push([lon2Wrapped, lat2]);
          } else {
            curr.push([lon2, lat2]);
          }
        }
        if (curr.length >= 4) {
          curr.push(curr[0]);
          out.push(curr);
        }
        // normalize all longitudes back into [-180,180]
        for (const r of out) {
          for (let j = 0; j < r.length; j++) r[j][0] = norm(r[j][0]);
        }
        return out;
      }
      function splitGeomAtDateline(geom: any): any {
        if (!geom) return geom;
        if (geom.type === 'Polygon') {
          const outer = (geom.coordinates && geom.coordinates[0]) || [];
          const rings = splitRingAtDateline(outer);
          if (!rings.length) return geom;
          return { type: 'MultiPolygon', coordinates: rings.map(r => [r]) };
        }
        if (geom.type === 'MultiPolygon') {
          const polys: any[] = [];
          for (const poly of geom.coordinates || []) {
            const outer = (poly && poly[0]) || [];
            const rings = splitRingAtDateline(outer);
            if (rings.length) rings.forEach(r => polys.push([r])); else polys.push(poly);
          }
          return { type: 'MultiPolygon', coordinates: polys };
        }
        return geom;
      }
      // No antimeridian duplication; east Russia is excluded, reducing seam risk

      const styleFn = (f: any) => {
        const rk: RegionKey | undefined = f?.properties?.regionKey;
        const isSel = selected && rk && rk === selected;
        const base = (rk && regionColors[rk]) || '#4f46e5';
        const fill = isSel ? base : base + '66';
        return {
          stroke: false,
          color: undefined,
          weight: 0,
          fillColor: fill,
          fillOpacity: isSel ? 0.45 : 0.22,
          fillRule: 'evenodd',
          noClip: false,
          interactive: true,
        };
      };

      const onEachFeature = (feature: any, layer: any) => {
        const rk: RegionKey | undefined = feature?.properties?.regionKey;
        if (!rk) return;
        try { layer.options.interactive = true; } catch {}
        try { (layer as any).bringToFront && (layer as any).bringToFront(); } catch {}
        layer.on({
          mouseover: (e: any) => {
            try {
              container.style.cursor = 'pointer';
              const sel = selectedRef.current;
              const isSel = !!sel && rk === sel;
              e.target.setStyle({ fillOpacity: isSel ? 0.45 : 0.35 });
              if (e.target.bringToFront) e.target.bringToFront();
            } catch {}
          },
          mouseout: (e: any) => {
            try {
              container.style.cursor = '';
              const sel = selectedRef.current;
              const isSel = !!sel && rk === sel;
              e.target.setStyle({ fillOpacity: isSel ? 0.45 : 0.22 });
            } catch {}
          },
          click: () => { setModalRegion(rk); },
        });
      };

      const geoLayer = L.geoJSON(regionsFc as any, { interactive: true, style: styleFn, onEachFeature, renderer: L.svg({ padding: 0.5 }) });
      geoLayerRef.current = geoLayer;
      if (map && (map as any)._container) {
        try {
          geoLayer.addTo(map);
        } catch {}
      }

      // No seam masks; rely on geometry exclusion and clipping

      // Add Diego Garcia / BIOT polygon as precise easter egg
      try {
        const biot = (countriesFc.features || []).find((f: any) => {
          const id = String(f.id || '');
          const name = String(f?.properties?.name || '');
          return id === '086' || /british indian ocean/i.test(name);
        });
        if (biot) {
          const hex = L.geoJSON(biot as any, {
            style: () => ({ color: '#a855f7', weight: 1.25, fillColor: '#a855f7', fillOpacity: 0.25, dashArray: '4,5' })
          });
          hex.on({
            mouseover: (e: any) => { try { (container as any).style.cursor = 'pointer'; e.target.setStyle({ weight: 1.75, fillOpacity: 0.35 }); if (e.target.bringToFront) e.target.bringToFront(); } catch {} },
            mouseout:  (e: any) => { try { (container as any).style.cursor = '';     e.target.setStyle({ weight: 1.25, fillOpacity: 0.25 }); } catch {} },
            click:     ()      => { try { window.dispatchEvent(new CustomEvent('cb:unlock-non-geo')); } catch {} setModalRegion('NON_GEO' as any); },
          });
          hex.addTo(map);
          mysteryHexRef.current = hex;
        }
      } catch {}

      // Add a clickable mysterious hexagon near Diego Garcia (approx -7.3, 72.4)
      try {
        const centerLat = -7.3;
        const centerLng = 72.4;
        const radiusDeg = 0.02; // super tiny; only visible when fully zoomed in
        const latRad = centerLat * Math.PI / 180;
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i; // 0,60,...
          const dLat = radiusDeg * Math.sin(ang);
          const dLng = (radiusDeg * Math.cos(ang)) / Math.cos(latRad || 1);
          pts.push([centerLat + dLat, centerLng + dLng]);
        }
        const hex = L.polygon(pts, {
          color: '#a855f7',
          weight: 0.75,
          fillColor: '#a855f7',
          fillOpacity: 0.15,
          dashArray: '2,3',
          interactive: true,
        });
        hex.on({
          mouseover: (e: any) => { try { (container as any).style.cursor = 'pointer'; e.target.setStyle({ weight: 1.75, fillOpacity: 0.35 }); if (e.target.bringToFront) e.target.bringToFront(); } catch {} },
          mouseout: (e: any) => { try { (container as any).style.cursor = ''; e.target.setStyle({ weight: 1.25, fillOpacity: 0.25 }); } catch {} },
          click: () => { try { window.dispatchEvent(new CustomEvent('cb:unlock-non-geo')); } catch {} setModalRegion('NON_GEO' as any); },
        });
        hex.addTo(map);
        mysteryHexRef.current = hex;
      } catch {}

      // Build legend keys from the actual regions present (exclude none; order by our regionOrder)
      try {
        const present = new Set<string>();
        for (const f of (regionsFc.features || [])) {
          const rk = f?.properties?.regionKey as RegionKey | undefined;
          if (rk) present.add(rk);
        }
        const sorted = regionOrder.filter(rk => present.has(rk));
        setLegendKeys(sorted as RegionKey[]);
      } catch {}

      // Ensure proper layout after mount and on resize
      try { setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0); } catch {}
      let ro: ResizeObserver | null = null;
      try {
        ro = new ResizeObserver(() => { try { map.invalidateSize(); } catch {} });
        if (container) ro.observe(container);
      } catch {}
      (map as any).__ro = ro;
    })();

    return () => {
      destroyed = true;
      try {
        if (geoLayerRef.current) { try { geoLayerRef.current.remove(); } catch {} geoLayerRef.current = null; }
        if (mysteryHexRef.current) { try { mysteryHexRef.current.remove(); } catch {} mysteryHexRef.current = null; }
        if (mapRef.current) {
          try {
            const ro = (mapRef.current as any).__ro as ResizeObserver | undefined;
            if (ro) { try { ro.disconnect(); } catch {} }
          } catch {}
          try { mapRef.current.remove(); } catch {}
          mapRef.current = null;
        }
        const el = mapElRef.current as any;
        if (el) { try { delete el._leaflet_id; } catch {} }
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, mapKey]);

  // Update styles when selection changes
  useEffect(() => {
    selectedRef.current = (selected as any) || null;
    try {
      const layer = geoLayerRef.current;
      if (layer && layer.setStyle) {
        layer.setStyle((f: any) => {
          const isSel = !!selected && (f?.properties?.regionKey === selected);
          return { fillOpacity: isSel ? 0.45 : 0.22 } as any;
        });
      }
      const hex = mysteryHexRef.current;
      if (hex && hex.setStyle) {
        const isSel = selected === 'MYSTERIOUS';
        hex.setStyle({ weight: isSel ? 2 : 1.25, fillOpacity: isSel ? 0.4 : 0.25, color: '#a855f7', fillColor: '#a855f7' });
      }
    } catch {}
  }, [selected]);

  return (
    <div className={className}>
      <div className="glass-pane rounded-xl border p-3">
        <div className="text-sm font-medium mb-2">Pick by region</div>
        <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: "16 / 9", background: 'radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.2) 100%)' }} ref={wrapperRef}>
          {/* Dedicated container to host Leaflet map */}
          <div key={mapKey} ref={mapElRef} className="w-full h-full backdrop-blur-md" style={{ height: "100%", borderRadius: 12, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), 0 8px 30px rgba(0,0,0,0.35)', background: '#1f1f1f' }} />
          {modalRegion && (
            <div className="absolute inset-0 flex items-center justify-center z-50">
              <div className="absolute inset-0 bg-black/50" onClick={() => setModalRegion(null)} />
              <div className="glass-pane relative z-50 w-full max-w-md rounded-xl border p-4 backdrop-blur-xl" style={{ background: 'rgba(16,16,20,0.6)', boxShadow: '0 10px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Languages in {(modalRegion as any) === 'NON_GEO' ? 'Other / Constructed' : modalRegion}</div>
                  <button className="px-2 py-1 rounded-md border text-xs" onClick={() => setModalRegion(null)}>Close</button>
                </div>
                <div className="max-h-64 overflow-auto space-y-1">
                  {(() => {
                    const combined = (modalRegion as any) === 'NON_GEO'
                      ? [
                          ...getLanguagesForRegion('OTHER/UNCLASSIFIED'),
                          ...getLanguagesForRegion('CONSTRUCTED & FICTIONAL LANGUAGES'),
                        ]
                      : (getLanguagesForRegion(modalRegion) || (REGION_LANGS as any)[modalRegion] || []);
                    const langs = Array.from(new Set((combined || []).filter(Boolean)));
                    return langs.map((lang: string, idx: number) => (
                      <button key={`${lang}-${idx}`} className="w-full text-left px-2 py-1 rounded-md border hover:bg-foreground/5" onClick={() => { onSelect(modalRegion); try { const ev = new CustomEvent('cb:setLanguage', { detail: { language: lang } }); window.dispatchEvent(ev); } catch {} setModalRegion(null); }}>
                      {lang}
                    </button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={()=>setShowLegend(v=>!v)} className="absolute right-2 top-2 px-2 py-1 rounded-md border text-xs bg-background/70">{showLegend ? 'Hide' : 'Legend'}</button>
          {showLegend && (
            <div className="absolute right-2 bottom-2 glass-pane rounded-md border p-2 text-xs space-y-1">
              {(legendKeys || []).map((rk) => (
                <div key={rk} className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: REGION_COLORS[rk] }}
                  />
                  <span>{rk}</span>
                </div>
              ))}
              <div className="opacity-70">(Click a region to select)</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
