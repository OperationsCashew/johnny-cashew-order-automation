
import React, { useMemo, useState, useRef } from 'react';
import { Floor, Point, CostSettings } from '../types';

interface FloorPlan3DProps {
  floor: Floor;
  totalProjectCost: number;
  costSettings: CostSettings;
  selectedRoomId: string | null;
  onRoomClick: (roomId: string) => void;
  selectedWallId?: string | null;
  onWallClick?: (wallId: string) => void;
}

// Area-weighted centroid using Shoelace formula (more accurate than vertex average)
const getPolyAreaCentroid = (poly: Point[]): Point => {
  let cx = 0, cy = 0, area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const cross = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    area += cross;
    cx += (poly[i].x + poly[j].x) * cross;
    cy += (poly[i].y + poly[j].y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-9) return { x: poly[0].x, y: poly[0].y };
  return { x: cx / (6 * area), y: cy / (6 * area) };
};

// Point-in-polygon check (ray casting)
const isInsidePoly = (pt: Point, poly: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
};

// Visual center: area-weighted centroid if inside polygon, else fallback for concave shapes
const getVisualCenter = (poly: Point[]): Point => {
  if (poly.length === 0) return { x: 0, y: 0 };
  const centroid = getPolyAreaCentroid(poly);
  if (isInsidePoly(centroid, poly)) return centroid;
  // Concave polygon: fall back to vertex average (usually close to inside)
  const avg = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  if (isInsidePoly(avg, poly)) return avg;
  // Last resort: midpoint of the edge closest to the centroid, nudged toward vertex average
  let best = { x: (poly[0].x + poly[1].x) / 2, y: (poly[0].y + poly[1].y) / 2 };
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const mid = { x: (poly[i].x + poly[j].x) / 2, y: (poly[i].y + poly[j].y) / 2 };
    const d = (mid.x - centroid.x) ** 2 + (mid.y - centroid.y) ** 2;
    if (d < bestD) { bestD = d; best = mid; }
  }
  return { x: (best.x + avg.x) / 2, y: (best.y + avg.y) / 2 };
};

const getGradientId = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('badkamer') || n.includes('douche') || n.includes('toilet') || n.includes('wc')) return 'gradWet';
  if (n.includes('woon') || n.includes('keuken') || n.includes('eet')) return 'gradLiving';
  if (n.includes('slaap')) return 'gradSleep';
  if (n.includes('hal') || n.includes('overloop') || n.includes('entree') || n.includes('gang')) return 'gradHall';
  if (n.includes('kast') || n.includes('berging')) return 'gradStorage';
  return 'gradBase';
};

const FloorPlan3D: React.FC<FloorPlan3DProps> = ({ floor, totalProjectCost, costSettings, selectedRoomId, onRoomClick, selectedWallId, onWallClick }) => {
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null); 
  const groupRef = useRef<SVGGElement>(null);
  const transform = useRef({ x: 0, y: 0, k: 1 }); 
  const isDragging = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 }); 
  const startTransform = useRef({ x: 0, y: 0 }); 

  const updateTransform = () => {
    if (groupRef.current) {
      const { x, y, k } = transform.current;
      groupRef.current.setAttribute('transform', `translate(${x}, ${y}) scale(${k})`);
    }
  };

  const { transformedRooms, transformedOpenings, projectedInnerWalls, viewBox, scaleFactor } = useMemo(() => {
    const cos30 = 0.866;
    const sin30 = 0.5;
    const project = (p: Point) => ({ x: (p.x - p.y) * cos30, y: (p.x + p.y) * sin30 });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    const processedRooms = floor.rooms.map(room => {
      const projectedPoly = room.poly.map(project);
      projectedPoly.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });

      // Always compute from polygon — FML label coords are unreliable (placed by designer, often in corners)
      const labelPos = getVisualCenter(projectedPoly);

      return { ...room, poly: projectedPoly, centroid: labelPos };
    });

    const processedOpenings = floor.rooms.flatMap(room => 
      room.openings.map(op => {
        if (!op.startPoint || !op.endPoint) return null;
        
        const isSliding = op.type === 'door' && op.width > 105;
        const dx = op.endPoint.x - op.startPoint.x;
        const dy = op.endPoint.y - op.startPoint.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        
        const nx = -dy / len;
        const ny = dx / len;

        const angle = -Math.PI / 4;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const rdx = dx * cosA - dy * sinA;
        const rdy = dx * sinA + dy * cosA;
        const openPoint = { x: op.startPoint.x + rdx, y: op.startPoint.y + rdy };
        const doorAngleStart = Math.atan2(dy, dx);
        const doorAngleEnd = Math.atan2(rdy, rdx);
        let angleDiff = doorAngleEnd - doorAngleStart;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const numArcSteps = 14;
        const arcPoints2D = Array.from({ length: numArcSteps + 1 }, (_, j) => {
          const t = j / numArcSteps;
          const a = doorAngleStart + angleDiff * t;
          return { x: op.startPoint.x + Math.cos(a) * len, y: op.startPoint.y + Math.sin(a) * len };
        });

        const offset = 8; 
        const p1Start = { x: op.startPoint.x + nx * offset, y: op.startPoint.y + ny * offset };
        const p1End = { x: op.startPoint.x + dx * 0.6 + nx * offset, y: op.startPoint.y + dy * 0.6 + ny * offset };
        const p2Start = { x: op.startPoint.x + dx * 0.4 - nx * offset, y: op.startPoint.y + dy * 0.4 - ny * offset };
        const p2End = { x: op.endPoint.x - nx * offset, y: op.endPoint.y - ny * offset };

        const midPoint2D = { x: op.startPoint.x + dx * 0.5, y: op.startPoint.y + dy * 0.5 };
        const labelPoint2D = { x: midPoint2D.x + nx * 25, y: midPoint2D.y + ny * 25 };

        return {
          ...op,
          isSliding,
          projectedStart: project(op.startPoint),
          projectedEnd: project(op.endPoint),
          projectedOpen: project(openPoint),
          projectedArcPoints: arcPoints2D.map(project),
          projectedP1Start: project(p1Start),
          projectedP1End: project(p1End),
          projectedP2Start: project(p2Start),
          projectedP2End: project(p2End),
          projectedLabel: project(labelPoint2D)
        };
      })
    ).filter(Boolean);

    const width = maxX - minX;
    const padding = width * 0.15; 
    const dynamicScale = width / 1000; 

    // Project inner walls for rendering and interaction
    const projectedInnerWalls = (floor.walls || [])
      .filter(w => !w.isExternal)
      .map(w => ({
        ...w,
        projA: project(w.a),
        projB: project(w.b),
      }));

    return {
      transformedRooms: processedRooms,
      transformedOpenings: processedOpenings,
      projectedInnerWalls,
      viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + (padding * 2)} ${maxY - minY + (padding * 2)}`,
      scaleFactor: dynamicScale,
    };
  }, [floor]);

  const getSVGPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const svgMouse = getSVGPoint(e.clientX, e.clientY);
    const worldX = (svgMouse.x - transform.current.x) / transform.current.k;
    const worldY = (svgMouse.y - transform.current.y) / transform.current.k;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(transform.current.k * factor, 0.5), 20);
    const newX = svgMouse.x - (worldX * newScale);
    const newY = svgMouse.y - (worldY * newScale);
    transform.current = { x: newX, y: newY, k: newScale };
    updateTransform();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startDragPos.current = { x: e.clientX, y: e.clientY };
    startTransform.current = { x: transform.current.x, y: transform.current.y };
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !svgRef.current) return;
    const dxPx = e.clientX - startDragPos.current.x;
    const dyPx = e.clientY - startDragPos.current.y;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const scaleX = 1 / ctm.a;
    const scaleY = 1 / ctm.d;
    transform.current.x = startTransform.current.x + (dxPx * scaleX);
    transform.current.y = startTransform.current.y + (dyPx * scaleY);
    updateTransform();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.cursor = 'grab';
  };

  const handleZoomBtn = (direction: 'in' | 'out') => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const fakeEvent = {
          preventDefault: () => {}, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
          deltaY: direction === 'in' ? -100 : 100
      } as React.WheelEvent;
      handleWheel(fakeEvent);
  };

  const handleFitToScreen = () => {
      transform.current = { x: 0, y: 0, k: 1 };
      updateTransform();
  };

  const strokeBase = scaleFactor * 1.5;
  const strokeSelected = scaleFactor * 5.0; 
  const fontSizeBase = scaleFactor * 16; 
  const fontSizeHover = scaleFactor * 32; 

  const sortedRooms = [...transformedRooms].sort((a, b) => {
    const aActive = a.id === hoveredRoomId || a.id === selectedRoomId;
    const bActive = b.id === hoveredRoomId || b.id === selectedRoomId;
    if (aActive && !bActive) return 1;
    if (!aActive && bActive) return -1;
    return 0;
  });

  return (
    <div 
      className="w-full h-full bg-slate-50/30 rounded-3xl relative overflow-hidden flex items-center justify-center p-4 border border-slate-100 shadow-inner"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: 'grab' }}
    >
      <svg 
        ref={svgRef}
        viewBox={viewBox} 
        className="w-full h-full max-h-[80vh]" 
        style={{ pointerEvents: 'none', touchAction: 'none' }} 
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="gradSelected" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5b8db8" stopOpacity="1" />
            <stop offset="100%" stopColor="#4682b4" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="gradHover" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#bfdbfe" stopOpacity="1" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="gradLiving" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#fed7aa" /><stop offset="100%" stopColor="#fdba74" /></linearGradient>
          <linearGradient id="gradWet" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#7dd3fc" /></linearGradient>
          <linearGradient id="gradSleep" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#bbf7d0" /><stop offset="100%" stopColor="#86efac" /></linearGradient>
          <linearGradient id="gradHall" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#e2e8f0" /><stop offset="100%" stopColor="#cbd5e1" /></linearGradient>
          <linearGradient id="gradStorage" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#e7e5e4" /><stop offset="100%" stopColor="#d6d3d1" /></linearGradient>
          <linearGradient id="gradBase" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#f1f5f9" /><stop offset="100%" stopColor="#e2e8f0" /></linearGradient>

          <filter id="extOpeningGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={scaleFactor * 4} result="blur"/>
            <feComposite in="blur" in2="SourceGraphic" operator="out" result="glow"/>
            <feFlood floodColor="#00f0ff" result="color"/>
            <feComposite in="color" in2="glow" operator="in" result="glowFinal"/>
            <feMerge>
              <feMergeNode in="glowFinal"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={scaleFactor * 2} />
            <feOffset dx={scaleFactor * 2} dy={scaleFactor * 4} result="offsetblur" />
            <feComponentTransfer><feFuncA type="linear" slope="0.3" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          <filter id="wallGlow" x="-50%" y="-50%" width="200%" height="200%">
             <feGaussianBlur stdDeviation={scaleFactor * 2} result="coloredBlur"/>
             <feComponentTransfer in="coloredBlur" result="glow1">
                <feFuncA type="linear" slope="4"/>
             </feComponentTransfer>
             <feMerge>
                 <feMergeNode in="glow1"/>
                 <feMergeNode in="SourceGraphic"/>
             </feMerge>
          </filter>
        </defs>

        <g ref={groupRef} pointerEvents="auto" style={{ transformOrigin: '0 0' }}>
          {sortedRooms.map((room) => {
            const isSelected = selectedRoomId === room.id;
            const isHovered = hoveredRoomId === room.id;
            const pointsStr = room.poly.map(p => `${p.x},${p.y}`).join(' ');
            let fillUrl = `url(#${getGradientId(room.name)})`;
            if (isSelected) fillUrl = "url(#gradSelected)";
            else if (isHovered) fillUrl = "url(#gradHover)";
            const strokeColor = isSelected ? '#4682b4' : (isHovered ? '#60a5fa' : '#94a3b8');
            const activeFilter = isSelected ? "url(#wallGlow)" : "url(#dropShadow)";
            return (
              <g 
                key={room.id} 
                onClick={(e) => { e.stopPropagation(); onRoomClick(room.id); }} 
                onMouseEnter={() => setHoveredRoomId(room.id)}
                onMouseLeave={() => setHoveredRoomId(null)}
                className="cursor-pointer transition-all duration-300"
                style={{ transform: isHovered || isSelected ? `translateY(-${scaleFactor}px)` : 'none' }}
              >
                <polygon 
                  points={pointsStr} 
                  fill={fillUrl}
                  fillOpacity={isSelected ? 0.8 : 1}
                  stroke={strokeColor} 
                  strokeWidth={isSelected ? strokeSelected : strokeBase}
                  strokeLinejoin="round"
                  filter={activeFilter}
                />
                <text 
                  x={room.centroid.x} y={room.centroid.y} 
                  textAnchor="middle" dominantBaseline="middle"
                  className="pointer-events-none select-none transition-all duration-300 ease-out font-sans"
                  style={{
                    fontSize: (isHovered || isSelected) ? fontSizeHover : fontSizeBase,
                    fontWeight: (isHovered || isSelected) ? 700 : 600,
                    fill: isSelected ? '#ffffff' : '#1e293b',
                    textShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(255,255,255,0.6)'
                  }}
                >
                  {room.name}
                </text>
              </g>
            );
          })}

          {transformedOpenings.map((op, i) => {
            if (!op) return null;
            const isDoor = op.type === 'door';
            const isSliding = op.isSliding;
            
            const strokeColor = isDoor ? '#1e293b' : (op.isExternal ? '#00f0ff' : '#1e293b');
            const strokeW = op.isExternal ? scaleFactor * 3.5 : scaleFactor * 2.5;
            const filterEffect = (!isDoor && op.isExternal) ? "url(#extOpeningGlow)" : "";

            if (isDoor) {
              if (isSliding) {
                return (
                  <g key={`sliding-${i}`} style={{ opacity: 0.9 }}>
                    <title>{`Schuifpui (${op.width} cm)`}</title>
                    <line 
                      x1={op.projectedP1Start.x} y1={op.projectedP1Start.y}
                      x2={op.projectedP1End.x} y2={op.projectedP1End.y}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                    />
                    <line 
                      x1={op.projectedP2Start.x} y1={op.projectedP2Start.y}
                      x2={op.projectedP2End.x} y2={op.projectedP2End.y}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                    />
                    <line 
                      x1={op.projectedStart.x} y1={op.projectedStart.y}
                      x2={op.projectedEnd.x} y2={op.projectedEnd.y}
                      stroke={strokeColor}
                      strokeWidth={strokeW * 0.2}
                      opacity={0.2}
                    />
                    <text 
                      x={op.projectedLabel.x} y={op.projectedLabel.y}
                      textAnchor="middle" dominantBaseline="middle"
                      className="pointer-events-none select-none font-sans"
                      style={{
                        fontSize: scaleFactor * 10,
                        fontWeight: 900,
                        fill: strokeColor,
                        letterSpacing: '0.05em',
                        opacity: 0.6
                      }}
                    >
                    </text>
                  </g>
                );
              } else {
                return (
                  <g key={`door-${i}`} style={{ opacity: 0.9 }}>
                    <title>{`Deur (${op.width} cm)`}</title>
                    <polyline
                      points={op.projectedArcPoints.map((p: {x: number; y: number}) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeW * 0.4}
                      strokeDasharray={`${scaleFactor * 4}, ${scaleFactor * 3}`}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <line 
                      x1={op.projectedStart.x} y1={op.projectedStart.y}
                      x2={op.projectedOpen.x} y2={op.projectedOpen.y}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      filter={filterEffect}
                    />
                    <line 
                      x1={op.projectedStart.x} y1={op.projectedStart.y}
                      x2={op.projectedEnd.x} y2={op.projectedEnd.y}
                      stroke={strokeColor}
                      strokeWidth={strokeW * 0.25}
                      opacity={0.3}
                    />
                  </g>
                );
              }
            } else {
              return (
                <line 
                  key={`window-${i}`}
                  x1={op.projectedStart.x} y1={op.projectedStart.y}
                  x2={op.projectedEnd.x} y2={op.projectedEnd.y}
                  stroke={strokeColor}
                  strokeWidth={strokeW * 1.8}
                  strokeLinecap="round"
                  filter={filterEffect}
                  style={{ pointerEvents: 'none', opacity: 0.95 }} 
                >
                  <title>{`Raam (${op.width} cm)`}</title>
                </line>
              );
            }
          })}
          {/* Inner walls — rendered last so they sit on top and can capture clicks */}
          {projectedInnerWalls.map(wall => {
            const isSelected = wall.id === selectedWallId;
            const wallColor = wall.isMarkedForRemoval
              ? '#ef4444'   // rood = te slopen
              : wall.isDragend
                ? '#1d4ed8' // donkerblauw = dragend
                : '#22c55e'; // groen = niet-dragend

            return (
              <g
                key={wall.id}
                onClick={(e) => { e.stopPropagation(); onWallClick?.(wall.id); }}
                style={{ cursor: onWallClick ? 'pointer' : 'default' }}
              >
                {/* Wide transparent hit area for easy clicking */}
                <line
                  x1={wall.projA.x} y1={wall.projA.y}
                  x2={wall.projB.x} y2={wall.projB.y}
                  stroke="transparent"
                  strokeWidth={scaleFactor * 22}
                  style={{ pointerEvents: 'stroke' }}
                />
                {/* Visible colored wall line */}
                <line
                  x1={wall.projA.x} y1={wall.projA.y}
                  x2={wall.projB.x} y2={wall.projB.y}
                  stroke={isSelected ? '#ffffff' : wallColor}
                  strokeWidth={isSelected ? scaleFactor * 9 : scaleFactor * 5}
                  strokeLinecap="round"
                  opacity={isSelected ? 1 : 0.85}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Selection halo */}
                {isSelected && (
                  <line
                    x1={wall.projA.x} y1={wall.projA.y}
                    x2={wall.projB.x} y2={wall.projB.y}
                    stroke={wallColor}
                    strokeWidth={scaleFactor * 14}
                    strokeLinecap="round"
                    opacity={0.35}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Wall legend — only shown when inner walls exist */}
      {projectedInnerWalls.length > 0 && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow border border-slate-100 text-[10px] font-black uppercase tracking-widest pointer-events-none">
          <div className="text-slate-400 mb-2">Binnenmuren</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-1.5 rounded-full bg-green-500"/>
              <span className="text-slate-600">Niet-dragend</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-1.5 rounded-full bg-blue-700"/>
              <span className="text-slate-600">Dragend</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-1.5 rounded-full bg-red-500"/>
              <span className="text-slate-600">Te slopen</span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto">
        <button className="bg-white w-10 h-10 rounded-full shadow-lg hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center text-slate-700 font-bold border border-slate-200" onClick={() => handleZoomBtn('in')} title="Zoom In"><span className="text-xl leading-none mb-1">+</span></button>
        <button className="bg-white w-10 h-10 rounded-full shadow-lg hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center text-slate-700 font-bold border border-slate-200" onClick={handleFitToScreen} title="Fit to Screen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg></button>
        <button className="bg-white w-10 h-10 rounded-full shadow-lg hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center text-slate-700 font-bold border border-slate-200" onClick={() => handleZoomBtn('out')} title="Zoom Out"><span className="text-xl leading-none mb-1">-</span></button>
      </div>
    </div>
  );
};

export default FloorPlan3D;
