
import { Point, Room, Floor, FMLProject, Wall, WallOpening, WallState } from '../types';

// --- Hulpfuncties ---

function getMidpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function distToSegmentSquared(p: Point, v: Point, w: Point): number {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function calculateArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 20000;
}

function calculatePerimeter(poly: Point[]): number {
  let perimeter = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[i].x - poly[j].x;
    const dy = poly[i].y - poly[j].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter / 100;
}

function isPointInPoly(pt: {x: number, y: number}, poly: {x: number, y: number}[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Counts how many room polygons have an edge near the given midpoint.
 * - Outer wall: midpoint is near only 1 room edge → isExternal = true
 * - Inner wall: midpoint is near 2 room edges (one per side) → isExternal = false
 *
 * Tolerance of 18² accounts for half-wall-thickness offset between
 * room polygon edges and the FML wall centerline.
 */
function countAdjacentRooms(mid: Point, roomPolys: Point[][]): number {
  const TOLERANCE_SQ = 18 * 18;
  let count = 0;
  for (const poly of roomPolys) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      if (distToSegmentSquared(mid, p1, p2) < TOLERANCE_SQ) {
        count++;
        break; // count each room only once
      }
    }
  }
  return count;
}

/** Average centroid of an FML polygon (works with {x,y,z} or {x,y} points) */
function fmlPolyCentroid(poly: {x: number; y: number}[]): {x: number; y: number} {
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
}

/** True if the FML area object has a meaningful designer-set name */
function areaHasUsableName(area: any): boolean {
  const n = (area.name || '').trim();
  return n !== '' && n !== '?';
}

/**
 * Kiest de meest logische naam voor een unnamed area met meerdere surfaces:
 * 1. Woonkamer + Keuken (elke combinatie)  → "Woonkeuken"
 * 2. Bevat Woonkamer (maar geen Keuken)    → "Woonkamer" wint
 * 3. Alles andere                          → eerste naam (meest prominente surface)
 */
function combineSurfaceNames(names: string[]): string {
  const lc = names.map(n => n.toLowerCase());
  const has = (kw: string) => lc.some(n => n.includes(kw));
  if (has('woon') && has('keuken')) return 'Woonkeuken';
  if (has('woon'))                   return 'Woonkamer';
  return names[0];
}

// --- Main Parser ---

export function parseFML(
  jsonString: string,
  yearBuilt?: string,
  onLog?: (msg: string) => void,
  wallStateOverrides?: Record<string, WallState>
): Floor[] {
  try {
    const content = jsonString.trim();
    if (content.startsWith('<')) {
        onLog?.("⚠️ Bestand is XML, verwacht JSON.");
        return [];
    }

    const data: FMLProject = JSON.parse(content);
    if (!data.floors || !Array.isArray(data.floors)) return [];

    // Pre-war rule: all inner walls are load-bearing
    const yearNum = yearBuilt ? parseInt(yearBuilt, 10) : NaN;
    const isPreWar = !isNaN(yearNum) && yearNum < 1945;

    const roomNameCounts: Record<string, number> = {};
    const excludedNames = ['situatie', 'overzicht', 'totaal overzicht', 'totaaloverzicht', 'begane grond tuin', 'perceel', 'tuin'];

    const floors = data.floors
      .filter(fmlFloor => {
        const name = (fmlFloor.name || "").toLowerCase().trim();
        return !excludedNames.some(excluded => name.includes(excluded));
      })
      .map((fmlFloor, floorIndex) => {
        const floorHeightM = fmlFloor.height / 100;
        const design = fmlFloor.designs?.[0];
        const fmlWalls = design?.walls || [];
        const fmlLabels = design?.labels || [];

        // FloorPlanner slaat sommige ruimtes op in 'surfaces' i.p.v. 'areas'
        // (bijv. Keuken, Tuin, Terras). Slimme merge: gebruik areas als basis, surfaces als aanvulling.
        //
        // Case A — Surface INSIDE een NAAMLOZE area:
        //   De area is een onbenoemd container-vlak. De surface geeft de naam. Area wordt onderdrukt;
        //   de surface-polygoon wordt de ruimte (polygon volgt toch al de muurlijnen).
        //
        // Case B — Surface INSIDE een BENOEMDE area:
        //   De area heeft al een goede naam (Slaapkamer, Badkamer, ...). De surface is een decoratief overlay.
        //   De surface wordt onderdrukt; de benoemde area blijft de ruimte.
        //
        // Case C — Surface ZONDER bevattende area:
        //   Geen overeenkomende area gevonden (Tuin, Balkon, begane grond Keuken, ...).
        //   Surface wordt als eigen ruimte toegevoegd.
        const rawAreas: any[] = design?.areas || [];
        const rawSurfaces = (design?.surfaces || []).filter(
          (s: any) => s.name && s.name.trim() !== '' && s.name.trim() !== '?' && s.poly?.length >= 3
        );

        const consumedAreaIndices = new Set<number>();    // Case A: naamloze areas vervangen door surfaces
        const suppressedSurfaceIndices = new Set<number>(); // Case B: surfaces binnen benoemde areas → skip
        const areaToSurfaces = new Map<number, number[]>(); // areaIdx → [surfaceIdx, ...]

        rawSurfaces.forEach((surface: any, si: number) => {
          const centroid = fmlPolyCentroid(surface.poly);
          for (let ai = 0; ai < rawAreas.length; ai++) {
            const area = rawAreas[ai];
            if (!area.poly || area.poly.length < 3) continue;
            if (isPointInPoly(centroid, area.poly)) {
              if (areaHasUsableName(area)) {
                suppressedSurfaceIndices.add(si);  // Case B
              } else {
                consumedAreaIndices.add(ai);        // Case A
                if (!areaToSurfaces.has(ai)) areaToSurfaces.set(ai, []);
                areaToSurfaces.get(ai)!.push(si);
              }
              break; // eerste (binnenste) bevattende area wint
            }
          }
          // Case C: geen match → surface blijft als eigen ruimte
        });

        // Voor elke naamloze area met 2+ surfaces: maak één gecombineerde ruimte
        // met de area-polygoon (correcte muurlijnen) en een samengestelde naam.
        // Bij 1 surface: surface-polygoon blijft als eigen ruimte (niet onderdrukt).
        const combinedAreaEntries: any[] = [];
        areaToSurfaces.forEach((surfaceIndices, ai) => {
          if (surfaceIndices.length > 1) {
            const surfaceNames = surfaceIndices.map(si => (rawSurfaces[si].name as string).trim());
            const combinedName = combineSurfaceNames(surfaceNames);
            combinedAreaEntries.push({ ...rawAreas[ai], name: combinedName, customName: undefined });
            surfaceIndices.forEach(si => suppressedSurfaceIndices.add(si));
          }
        });

        const areas = [
          ...rawAreas.filter((_: any, i: number) => !consumedAreaIndices.has(i)),
          ...rawSurfaces.filter((_: any, i: number) => !suppressedSurfaceIndices.has(i)),
          ...combinedAreaEntries,
        ];

        // Build room polygon list for adjacency detection
        const roomPolys: Point[][] = areas.map((a: any) =>
          a.poly.map((p: any) => ({ x: p.x, y: p.y }))
        );

        // Build enriched walls with isExternal, length, isDragend, isMarkedForRemoval
        const walls: Wall[] = fmlWalls.map((w, wallIdx) => {
          const wallA = { x: w.a.x, y: w.a.y };
          const wallB = { x: w.b.x, y: w.b.y };
          const mid = getMidpoint(wallA, wallB);
          const lengthCm = Math.sqrt((wallB.x - wallA.x)**2 + (wallB.y - wallA.y)**2);
          const lengthM = Math.round((lengthCm / 100) * 100) / 100;

          // A wall bordering ≤1 room is on the outer perimeter
          const adjRooms = countAdjacentRooms(mid, roomPolys);
          const isExternal = adjRooms <= 1;

          // Dragend logic per requirements:
          //  - Outer walls: always dragend (cannot be removed)
          //  - Pre-1945 inner walls: all dragend
          //  - Post-1945 inner walls: >15 cm = dragend, ≤15 cm = niet-dragend
          const thickness = w.thickness || 0;
          let isDragend: boolean;
          if (isExternal) {
            isDragend = true;
          } else if (isPreWar) {
            isDragend = true;
          } else {
            isDragend = thickness > 15;
          }

          const wallId = `floor-${floorIndex}-wall-${wallIdx}`;

          // Apply saved overrides (from previously loaded project state)
          if (wallStateOverrides?.[wallId]) {
            isDragend = wallStateOverrides[wallId].isDragend;
          }

          return {
            id: wallId,
            a: wallA,
            b: wallB,
            thickness: w.thickness,
            openings: (w.openings || []).map(o => ({
              t: o.t, width: o.width, z_height: o.z_height || 210, type: o.type, z: o.z
            })),
            isExternal,
            length: lengthM,
            isDragend,
            isMarkedForRemoval: wallStateOverrides?.[wallId]?.isMarkedForRemoval ?? false,
          };
        });

        interface RoomSegment { p1: Point; p2: Point; roomId: number; }
        const allRoomSegments: RoomSegment[] = [];
        areas.forEach((area: any, rIdx: number) => {
            const poly = area.poly;
            for(let i=0; i<poly.length; i++){
                allRoomSegments.push({ p1: poly[i], p2: poly[(i+1) % poly.length], roomId: rIdx });
            }
        });

        const rooms: Room[] = areas.map((area: any, roomIndex: number) => {
          const poly = area.poly.map((p: any) => ({ x: p.x, y: p.y }));
          const floorArea = calculateArea(poly);
          const perimeter = calculatePerimeter(poly);

          let baseName = '';
          let labelPoint: Point | undefined = undefined;

          // 1. HOOGSTE PRIORITEIT: De customName (indien aanwezig)
          if (area.customName && area.customName.trim() !== '') {
            baseName = area.customName.trim();
          }

          // 2. TWEEDE PRIORITEIT: De structurele 'name'
          // '?' is een placeholder die FloorPlanner gebruikt voor naamloze areas — behandel als leeg
          if (!baseName && area.name && area.name.trim() !== '' && area.name.trim() !== '?' && !area.name.toLowerCase().includes('area')) {
            baseName = area.name.trim();
          }

          // 3. DERDE PRIORITEIT: Mapping op basis van area.type
          if (!baseName) {
            switch(area.type) {
              case 0:
              case 1:
              case 12: baseName = 'Woonkamer'; break;
              case 2:  baseName = 'Keuken'; break;
              case 3:  baseName = 'Slaapkamer'; break;
              case 4:  baseName = 'Badkamer'; break;
              case 5:  baseName = 'Toilet'; break;
              case 6:  baseName = 'Entree'; break;
              case 8:  baseName = 'Gang'; break;
              case 9:  baseName = 'Berging'; break;
              case 10: baseName = 'Overloop'; break;
              case 11: baseName = 'Zolder'; break;
              case 13: baseName = 'Eetkamer'; break;
              case 14: baseName = 'Studeerkamer'; break;
              case 16: baseName = 'Balkon'; break;
              case 17: baseName = 'Terras'; break;
              case 20: baseName = 'Garage'; break;
              case 62: baseName = 'Vide'; break;
            }
          }

          const matchingLabels = fmlLabels.filter((label: any) => isPointInPoly({ x: label.x, y: label.y }, poly));
          const roomLabelTexts = matchingLabels.map((l: any) => l.text?.toLowerCase() || "");
          const allText = roomLabelTexts.join(' ');

          const hasLiving = roomLabelTexts.some((t: string) => /(woon|living|huiskamer|zitkamer)/i.test(t)) || baseName === 'Woonkamer';
          const hasKitchen = roomLabelTexts.some((t: string) => /(keuken|kitchen|kook)/i.test(t)) || baseName === 'Keuken';

          if (hasLiving && hasKitchen) {
            baseName = 'Woonkeuken';
          } else if (!baseName) {
            if (/(woonkamer|huiskamer|living|zitkamer|lounge)/i.test(allText)) baseName = 'Woonkamer';
            else if (/(keuken|kitchen|kook)/i.test(allText)) baseName = 'Keuken';
            else if (/(slaapkamer|bedroom|slapen|chamber)/i.test(allText)) baseName = 'Slaapkamer';
            else if (/(badkamer|bathroom|douche|shower|bad)/i.test(allText)) baseName = 'Badkamer';
            else if (/(wc|toilet|restroom|lavatory)/i.test(allText)) baseName = 'Toilet';
            else if (/(gang|hal|entree|hallway|entry|vestibule|corridor)/i.test(allText)) baseName = 'Gang';
            else if (/(overloop|landing)/i.test(allText)) baseName = 'Overloop';
            else if (/(kelder|basement|souterrain)/i.test(allText)) baseName = 'Kelder';
            else if (/(zolder|attic|loft)/i.test(allText)) baseName = 'Zolder';
            else if (/(berging|storage|opberg|bijkeuken|utility|pantry|schuur|shed)/i.test(allText)) baseName = 'Berging';
            else if (/(kast|closet|cupboard|wardrobe|voorraad)/i.test(allText)) baseName = 'Kast';
            else if (/(werkkamer|kantoor|office|study|studeerkamer|hobby)/i.test(allText)) baseName = 'Studeerkamer';
            else if (/(eetkamer|dining)/i.test(allText)) baseName = 'Eetkamer';
            else if (/(garage|carport)/i.test(allText)) baseName = 'Garage';
            else if (/(balkon|balcony|terras|terrace|dakterras)/i.test(allText)) baseName = 'Balkon';
            else if (/(wasruimte|laundry|wasmachine)/i.test(allText)) baseName = 'Wasruimte';
            else if (/(techniek|cv-ruimte|boiler|mechanical|installatie)/i.test(allText)) baseName = 'Technische ruimte';
            else if (/(column|kolom|pilaar|pillar)/i.test(allText)) baseName = 'Kolom';
            else if (/(vide|loft|void)/i.test(allText)) baseName = 'Vide';
          }

          if (!baseName) {
            // Sla hoogte-labels (h=Xcm, h<Xcm) en de disclaimer over — die zijn geen kamer-namen
            const firstLabel = matchingLabels.find((l: any) =>
              !l.text?.includes('©') &&
              !/^h[=<>]/i.test((l.text || '').trim()) &&
              !l.text?.toLowerCase().includes('plattegronden zijn geproduceerd')
            );
            baseName = firstLabel ? firstLabel.text.split('\n')[0].trim() : 'Kamer';
          }

          const bestLabelForPos = matchingLabels.find((l: any) => !l.text?.includes('©')) || matchingLabels[0];
          if (bestLabelForPos) {
            labelPoint = { x: bestLabelForPos.x, y: bestLabelForPos.y };
          }

          roomNameCounts[baseName] = (roomNameCounts[baseName] || 0) + 1;
          const finalName = roomNameCounts[baseName] > 1 ? `${baseName} ${roomNameCounts[baseName]}` : baseName;

          const roomOpenings: (WallOpening & { isExternal: boolean; startPoint: Point; endPoint: Point })[] = [];
          let extWindowCount = 0; let intWindowCount = 0;
          let extDoorCount = 0; let intDoorCount = 0;
          let extWindowArea = 0; let extDoorArea = 0;
          let extWallLength = 0; let intWallLength = 0;

          const wallThicknessToleranceSq = 30 * 30;

          for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];
            const midPoint = getMidpoint(p1, p2);

            const isSharedWall = allRoomSegments.some(seg => {
                if (seg.roomId === roomIndex) return false;
                return distToSegmentSquared(midPoint, seg.p1, seg.p2) < wallThicknessToleranceSq;
            });

            const isExternalWall = !isSharedWall;
            const segmentLength = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2) / 100;
            if (isExternalWall) extWallLength += segmentLength; else intWallLength += segmentLength;

            walls.forEach(wall => {
              const dx = wall.b.x - wall.a.x;
              const dy = wall.b.y - wall.a.y;
              const wallLen = Math.sqrt(dx*dx + dy*dy);
              const ux = dx/wallLen; const uy = dy/wallLen;

              wall.openings.forEach(op => {
                const opPos = { x: wall.a.x + op.t * dx, y: wall.a.y + op.t * dy };
                if (distToSegmentSquared(opPos, p1, p2) < (25 * 25)) {
                  const areaM2 = (op.width * op.z_height) / 10000;
                  const isDoor = op.type === 'door' || (op.z !== undefined && op.z < 10);
                  const halfW = op.width / 2;
                  const startPoint = { x: opPos.x - ux * halfW, y: opPos.y - uy * halfW };
                  const endPoint = { x: opPos.x + ux * halfW, y: opPos.y + uy * halfW };

                  roomOpenings.push({ ...op, isExternal: isExternalWall, startPoint, endPoint });

                  if (isExternalWall) {
                      if (isDoor) { extDoorCount++; extDoorArea += areaM2; }
                      else { extWindowCount++; extWindowArea += areaM2; }
                  } else {
                      if (isDoor) intDoorCount++; else intWindowCount++;
                  }
                }
              });
            });
          }

          const grossExtWallArea = extWallLength * floorHeightM;
          const grossIntWallArea = intWallLength * floorHeightM;
          const netExtWallArea = Math.max(0, grossExtWallArea - extWindowArea - extDoorArea);
          const netIntWallArea = Math.max(0, grossIntWallArea - (intDoorCount * 2.0));

          return {
            id: `floor-${floorIndex}-room-${roomIndex}`,
            name: finalName,
            originalName: baseName,
            poly,
            labelPoint,
            metrics: {
              floorArea, ceilingArea: floorArea, perimeter, height: floorHeightM,
              wallArea: netExtWallArea + netIntWallArea,
              openingArea: extWindowArea + extDoorArea,
              extWallArea: netExtWallArea, intWallArea: netIntWallArea,
              extWindowCount, intWindowCount, extDoorCount, intDoorCount,
              extWindowArea, extDoorArea,
              windowCount: extWindowCount + intWindowCount, doorCount: extDoorCount + intDoorCount,
              windowArea: extWindowArea, doorArea: extDoorArea
            },
            analysis: [], color: area.color || '#CCCCCC', openings: roomOpenings
          };
        });

        return { id: String(fmlFloor.id), name: fmlFloor.name, level: fmlFloor.level, height: floorHeightM, rooms, walls };
      }).sort((a, b) => a.level - b.level);

    return floors;
  } catch (error) {
    onLog?.(`❌ FML Parsing fout: ${String(error)}`);
    return [];
  }
}
