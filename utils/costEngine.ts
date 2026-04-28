
import { Room, Floor, CostSettings, RoomRenovationActions, HouseMetadata, Wall } from '../types';

export interface RoomCostBreakdown {
  wallPaintCost: number;
  ceilingPaintCost: number;
  wallPlasterCost: number;
  ceilingPlasterCost: number;
  floorCost: number;
  floorRemovalCost: number;
  levelingCost: number;
  heatingInstallationCost: number; 
  toiletCost: number;
  bathroomCost: number;
  kitchenCost: number;
  // Verduurzaming
  windowRenovationCost: number;
  slidingDoorRenovationCost: number;
  // Vrije invoer
  customItemsCost: number;
  totalCost: number;
}

export const DEFAULT_ACTIONS: RoomRenovationActions = {
  paintCeiling: false,
  paintWalls: false,
  plasterWalls: false,
  plasterCeiling: false,
  floorAction: 'BEHOUDEN',
  toiletAction: 'NVT',
  bathroomAction: 'NVT',
  kitchenAction: 'NVT',
  toiletQuality: 'BASIS',
  bathroomQuality: 'BASIS',
  kitchenQuality: 'BASIS',
  underfloorHeating: false,
  removeOldFloor: false,
  subfloorType: 'BETON',
  floorQuality: 'BASIS',
  replaceWindows: false,
  windowType: 'ALTIJD_GLAS',
  glassType: 'HR++',
  replaceSlidingDoor: false,
  slidingDoorType: 'KUNSTSTOF_HR++',
};

export function calculateFloorManifoldCost(totalArea: number, settings: CostSettings): number {
  if (totalArea <= 0) return 0;
  const numGroups = Math.ceil(totalArea / 11);
  return settings.heatingBase + (numGroups * settings.heatingPerGroup);
}

export function getRoomCostBreakdown(
  room: Room | null, 
  settings: CostSettings, 
  houseHasKitchen: boolean = true,
  globalSubfloor: 'BETON' | 'HOUT' = 'BETON'
): RoomCostBreakdown {
  const result: RoomCostBreakdown = {
    wallPaintCost: 0,
    ceilingPaintCost: 0,
    wallPlasterCost: 0,
    ceilingPlasterCost: 0,
    floorCost: 0,
    floorRemovalCost: 0,
    levelingCost: 0,
    heatingInstallationCost: 0,
    toiletCost: 0,
    bathroomCost: 0,
    kitchenCost: 0,
    windowRenovationCost: 0,
    slidingDoorRenovationCost: 0,
    customItemsCost: 0,
    totalCost: 0
  };

  if (!room || !settings) return result;

  const metrics = room.metrics;
  const manual = room.analysis?.find(a => a.source === 'manual');
  const actions = { ...DEFAULT_ACTIONS, ...(manual?.actions || {}) };
  const floorType = manual?.floorType || 'none';

  // 1. Schilderen & Stucen
  result.wallPaintCost = actions.paintWalls ? (metrics.wallArea || 0) * (settings.paintWalls || 0) : 0;
  result.ceilingPaintCost = actions.paintCeiling ? (metrics.ceilingArea || 0) * (settings.paintCeiling || 0) : 0;
  result.wallPlasterCost = actions.plasterWalls ? (metrics.wallArea || 0) * (settings.plasterWalls || 0) : 0;
  result.ceilingPlasterCost = actions.plasterCeiling ? (metrics.ceilingArea || 0) * (settings.plasterCeiling || 0) : 0;

  // 2. Vloeren & Sloop
  if (actions.removeOldFloor) {
    result.floorRemovalCost = metrics.floorArea * settings.floorRemoval;
  }

  if (actions.floorAction === 'NIEUW') {
    const unitPrice =
      floorType === 'pvc'          ? settings.floorPVC :
      floorType === 'pvcVisgraat'  ? settings.floorPVCVisgraat :
      floorType === 'gietvloer'    ? settings.floorGietvloer :
      floorType === 'lamelparket'  ? settings.floorLamelparket :
      settings.floorPVC;
    result.floorCost = (metrics.floorArea || 0) * (unitPrice || 0);
    // Egalisatie nodig bij: PVC vloer (altijd) OF vloerverwarming op betonvloer (droogbouw/hout heeft geen egalisatie nodig)
    const needsLeveling = (floorType === 'pvc' || floorType === 'pvcVisgraat') || (actions.underfloorHeating && globalSubfloor !== 'HOUT');
    if (needsLeveling) {
      result.levelingCost = metrics.floorArea * settings.levelingPVC;
    }
  } else if (actions.floorAction === 'RENOVEREN') {
    result.floorCost = (metrics.floorArea || 0) * (settings.floorRenoveren || 0);
  }

  // 3. Verwarming
  if (actions.underfloorHeating) {
    const installationPrice = globalSubfloor === 'HOUT' ? settings.heatingM2Wood : settings.heatingM2Concrete;
    result.heatingInstallationCost = metrics.floorArea * installationPrice;
  }

  // 4. Sanitair & Keuken
  if (actions.toiletAction === 'NIEUW') {
    const q = actions.toiletQuality || 'BASIS';
    result.toiletCost = q === 'LUXE' ? settings.toiletLuxe : q === 'BASIS' ? settings.toiletBasis : settings.toiletBudget;
  }
  if (actions.bathroomAction === 'NIEUW') {
    const q = actions.bathroomQuality || 'BASIS';
    result.bathroomCost = q === 'LUXE' ? settings.bathLuxe : q === 'BASIS' ? settings.bathBasis : settings.bathBudget;
  }
  if (actions.kitchenAction === 'NIEUW') {
    const q = actions.kitchenQuality || 'BASIS';
    result.kitchenCost = q === 'LUXE' ? settings.kitchenLuxe : q === 'BASIS' ? settings.kitchenBasis : settings.kitchenBudget;
  }

  // 5. Verduurzaming (Kozijnen & Glas) - Gelaagde berekening
  if (actions.replaceWindows && metrics.extWindowArea > 0) {
    let materialPrice = 0;
    let laborPrice = settings.laborFullFrame;

    if (actions.windowType === 'ALTIJD_GLAS') {
      materialPrice = settings.glassMaterial;
      laborPrice = settings.laborGlassOnly;
    } else if (actions.windowType === 'KOZIJN_KUNSTSTOF') {
      materialPrice = settings.kozijnKunststofMaterial;
    } else if (actions.windowType === 'KOZIJN_HOUT') {
      materialPrice = settings.kozijnHoutMaterial;
    } else if (actions.windowType === 'KOZIJN_ALUMINIUM') {
      materialPrice = settings.kozijnAluMaterial;
    }

    const tripleSurcharge = actions.glassType === 'HR+++' ? settings.tripleGlassSurcharge : 0;
    const finishingTotal = metrics.extWindowCount * settings.windowFinishingCost;
    
    result.windowRenovationCost =
      (metrics.extWindowArea * (materialPrice + laborPrice + tripleSurcharge)) +
      finishingTotal;
  }

  // 6. Verduurzaming (Schuifpui) - Breedte + Montage
  if (actions.replaceSlidingDoor) {
    const slidingOpenings = room.openings.filter(o => o.type === 'door' && o.width > 105 && o.isExternal);
    const totalWidthM = slidingOpenings.reduce((sum, o) => sum + (o.width / 100), 0);
    const numDoors = slidingOpenings.length;

    let materialPricePerM = settings.slidingMaterialKunststof;
    if (actions.slidingDoorType.includes('HOUT') || actions.slidingDoorType.includes('ALU')) {
        materialPricePerM = settings.slidingMaterialHoutAlu;
    }
    
    result.slidingDoorRenovationCost = 
      (totalWidthM * materialPricePerM) + 
      (numDoors * settings.slidingLaborFixed);
  }

  // 7. Vrije invoer custom items
  result.customItemsCost = (manual?.customItems || []).reduce((sum, item) => sum + (item.costEstimate || 0), 0);

  result.totalCost =
    result.wallPaintCost + result.ceilingPaintCost + result.wallPlasterCost + result.ceilingPlasterCost +
    result.floorCost + result.floorRemovalCost + result.levelingCost + result.heatingInstallationCost +
    result.toiletCost + result.bathroomCost + result.kitchenCost +
    result.windowRenovationCost + result.slidingDoorRenovationCost +
    result.customItemsCost;

  return result;
}

export function calculateRoomCost(
  room: Room, 
  settings: CostSettings, 
  houseHasKitchen: boolean = true,
  globalSubfloor: 'BETON' | 'HOUT' = 'BETON'
): number {
  return getRoomCostBreakdown(room, settings, houseHasKitchen, globalSubfloor).totalCost;
}

/**
 * Per-wall demolition cost breakdown (only the per-meter portion).
 * startupCost is the reference rate for this wall type — it is NOT always charged per wall.
 * Use calculateWallDemolitionCosts() for the correct project total (startup once per type).
 */
export interface WallDemolitionCostBreakdown {
  /** Reference startup rate for this wall type (éénmalig per type in the project, not per wall) */
  startupCost: number;
  perMCost: number;
  totalCost: number;
}

export function getWallDemolitionBreakdown(wall: Wall, settings: CostSettings): WallDemolitionCostBreakdown {
  const startup = wall.isDragend ? settings.wallDragendStartup : settings.wallNietDragendStartup;
  const perM = wall.isDragend ? settings.wallDragendPerM : settings.wallNietDragendPerM;
  return { startupCost: startup, perMCost: perM * wall.length, totalCost: startup + perM * wall.length };
}

/**
 * Total wall demolition cost across all floors.
 * Startup costs are charged ONCE per type (dragend / niet-dragend), regardless of how many
 * walls of that type are being removed.
 */
export function calculateWallDemolitionCosts(floors: Floor[], settings: CostSettings): number {
  const walls = floors.flatMap(f => (f.walls || []).filter(w => w.isMarkedForRemoval && !w.isExternal));
  if (walls.length === 0) return 0;

  const hasNietDragend = walls.some(w => !w.isDragend);
  const hasDragend    = walls.some(w =>  w.isDragend);

  const startupTotal =
    (hasNietDragend ? settings.wallNietDragendStartup : 0) +
    (hasDragend     ? settings.wallDragendStartup     : 0);

  const perMTotal = walls.reduce((acc, w) => {
    const perM = w.isDragend ? settings.wallDragendPerM : settings.wallNietDragendPerM;
    return acc + perM * w.length;
  }, 0);

  return startupTotal + perMTotal;
}

/**
 * Bepaal het onvoorzien-percentage op basis van bouwjaar en instellingen.
 * – Na 2010  → onvoorzienNieuw  (standaard 5%)
 * – 1945-2010 → onvoorzienMiddel (standaard 10%)
 * – Voor 1945 → onvoorzienOud   (standaard 15%)
 */
export function getOnvoorzienPct(yearBuilt: string | undefined, settings: CostSettings): number {
  const fallback = settings.onvoorzienMiddel ?? 10;
  if (!yearBuilt) return fallback;
  const year = parseInt(yearBuilt, 10);
  if (isNaN(year)) return fallback;
  if (year > 2010) return settings.onvoorzienNieuw ?? 5;
  if (year >= 1945) return settings.onvoorzienMiddel ?? 10;
  return settings.onvoorzienOud ?? 15;
}

export function calculateTotalProjectCost(floors: Floor[], settings: CostSettings, houseMetadata: HouseMetadata): number {
  if (!floors || !settings) return 0;
  const houseHasKitchen = floors.some(f => f.rooms?.some(r => r.originalName?.toLowerCase().includes('keuken')));
  const globalSubfloor = houseMetadata.globalSubfloor || 'BETON';
  
  let totalCost = 0;
  let scaffoldingNeeded = false;
  let totalWindowArea = 0;
  let maxLevel = 0;
  let hasWindowReplacement = false; // voor éénmalige opstartkosten kozijnen
  let hasSliding = false;           // voor puincontainer bij schuifpui

  floors.forEach((floor, idx) => {
    let floorHeatingArea = 0;
    maxLevel = Math.max(maxLevel, idx);

    (floor.rooms || []).forEach(room => {
      totalCost += calculateRoomCost(room, settings, houseHasKitchen, globalSubfloor);

      const manual = room.analysis?.find(a => a.source === 'manual');
      const actions = manual?.actions;

      if (actions?.underfloorHeating) {
        floorHeatingArea += room.metrics.floorArea;
      }

      if (actions?.replaceWindows) {
        hasWindowReplacement = true;
        totalWindowArea += room.metrics.extWindowArea;
        if (idx > 0) scaffoldingNeeded = true;
      }

      if (actions?.replaceSlidingDoor) {
        hasSliding = true;
        if (idx > 0) scaffoldingNeeded = true;
      }
    });

    if (floorHeatingArea > 0) {
      totalCost += calculateFloorManifoldCost(floorHeatingArea, settings);
    }
  });

  // Projectbreedte toeslagen
  if (scaffoldingNeeded) {
    totalCost += settings.scaffoldingBase;
    // Toeslag per verdieping boven de 1e etage
    if (maxLevel > 1) {
      totalCost += (maxLevel - 1) * settings.heightSurcharge;
    }
  }

  // Éénmalige opstartkosten ramen/kozijnen (ongeacht hoeveel kamers)
  if (hasWindowReplacement) {
    totalCost += settings.windowStartupCost;
  }

  // Puincontainer: bij groot glasoppervlak OF bij schuifpui vervanging
  if (totalWindowArea > 10 || hasSliding) {
    totalCost += settings.wasteContainerCost;
  }

  // Muur sloopkosten
  totalCost += calculateWallDemolitionCosts(floors, settings);

  // Onvoorzien – percentage over de gehele subtotaal
  const onvoorzienPct = getOnvoorzienPct(houseMetadata.yearBuilt, settings);
  totalCost += totalCost * (onvoorzienPct / 100);

  return totalCost;
}
