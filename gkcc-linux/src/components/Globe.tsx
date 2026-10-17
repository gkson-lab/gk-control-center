import { useEffect, useState } from 'react';

type Ring = [number, number][];

// Decode quantized TopoJSON arcs into [lon, lat] polylines, without needing the
// topojson-client / world-atlas npm packages (which would add a build-time
// dependency + install step). Drawing every arc gives the full coastline.
function decodeTopology(topo: {
  arcs: number[][][];
  transform: { scale: [number, number]; translate: [number, number] };
}): Ring[] {
  const { scale, translate } = topo.transform;
  const rings: Ring[] = [];
  for (const arc of topo.arcs) {
    let x = 0;
    let y = 0;
    const line: Ring = [];
    for (const d of arc) {
      x += d[0];
      y += d[1];
      line.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
    }
    rings.push(line);
  }
  return rings;
}

interface GlobeProps {
  isDark: boolean;
  lat: number | null;
  lon: number | null;
  size?: number;
}

/**
 * Spinning orthographic globe with a real coastline world map (fetched once at
 * runtime) plus a graticule. No fill, so you see through to the back (drawn
 * fainter). Line color follows the theme. If the map can't be fetched (offline),
 * it gracefully shows just the graticule.
 */
export function Globe({ isDark, lat, lon, size = 360 }: GlobeProps) {
  const [rot, setRot] = useState(0);
  const [landRings, setLandRings] = useState<Ring[]>([]);

  // Fetch the world coastline once.
  useEffect(() => {
    let cancelled = false;
    const sources = [
      'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json',
      'https://unpkg.com/world-atlas@2/land-110m.json',
    ];
    (async () => {
      for (const url of sources) {
        try {
          const res = await fetch(url);
          const topo = await res.json();
          if (!cancelled && topo?.arcs && topo?.transform) {
            setLandRings(decodeTopology(topo));
            return;
          }
        } catch {
          /* try next source */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Spin.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setRot((r) => (r + dt * 0.012) % 360); // ~12°/s
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const R = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const tilt = (51 * Math.PI) / 180; // elevated, looking down on the North Pole
  const line = isDark ? '#faf9f5' : '#141413';
  const markerColor = '#3b82f6'; // location dot: blue regardless of theme

  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const project = (latDeg: number, lonDeg: number) => {
    const phi = (latDeg * Math.PI) / 180;
    const lambda = ((lonDeg + rot) * Math.PI) / 180;
    const x = Math.cos(phi) * Math.sin(lambda);
    const y = Math.sin(phi);
    const z = Math.cos(phi) * Math.cos(lambda);
    const y2 = y * cosT - z * sinT;
    const z2 = y * sinT + z * cosT;
    return { x: cx + x * R, y: cy - y2 * R, visible: z2 >= 0 };
  };

  type P = ReturnType<typeof project>;
  const seg = (a: P, b: P) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

  let gridFront = '';
  let gridBack = '';
  const addGrid = (a: P, b: P) => {
    if (a.visible && b.visible) gridFront += seg(a, b);
    else gridBack += seg(a, b);
  };
  for (let lon0 = 0; lon0 < 180; lon0 += 30) {
    let prev: P | null = null;
    for (let la = -90; la <= 90; la += 6) {
      const p = project(la, lon0);
      if (prev) addGrid(prev, p);
      prev = p;
    }
  }
  for (const la0 of [-60, -30, 0, 30, 60]) {
    let prev: P | null = null;
    for (let lo = 0; lo <= 360; lo += 6) {
      const p = project(la0, lo);
      if (prev) addGrid(prev, p);
      prev = p;
    }
  }

  let landFront = '';
  let landBack = '';
  for (const ring of landRings) {
    let prev: P | null = null;
    for (let i = 0; i < ring.length; i++) {
      const p = project(ring[i][1], ring[i][0]);
      if (prev) {
        if (prev.visible && p.visible) landFront += seg(prev, p);
        else landBack += seg(prev, p);
      }
      prev = p;
    }
  }

  const marker = lat != null && lon != null ? project(lat, lon) : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={line} strokeOpacity={0.22} strokeWidth={1} />
      <path d={gridBack} stroke={line} strokeOpacity={0.07} strokeWidth={0.6} fill="none" />
      <path d={landBack} stroke={line} strokeOpacity={0.14} strokeWidth={0.7} fill="none" />
      <path d={gridFront} stroke={line} strokeOpacity={0.22} strokeWidth={0.6} fill="none" />
      <path d={landFront} stroke={line} strokeOpacity={0.7} strokeWidth={0.9} fill="none" />
      {marker && (
        <g opacity={marker.visible ? 1 : 0.3}>
          <circle cx={marker.x} cy={marker.y} r={10} fill="none" stroke={markerColor} strokeOpacity={0.5}>
            <animate attributeName="r" from="5" to="15" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={marker.x} cy={marker.y} r={6} fill={markerColor} />
          <circle cx={marker.x} cy={marker.y} r={6} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1} />
        </g>
      )}
    </svg>
  );
}
