
import { CostSettings } from '../types';

export const DEFAULT_COSTS: CostSettings = {
  paintWalls: 15,
  paintCeiling: 18,
  plasterWalls: 30,
  plasterCeiling: 25,
  floorPVC: 75,
  floorPVCVisgraat: 105,
  floorGietvloer: 120,
  floorLamelparket: 120,
  floorRenoveren: 25,
  floorRemoval: 12,
  levelingPVC: 17,
  heatingBase: 350,
  heatingPerGroup: 75,
  heatingM2Concrete: 35,
  heatingM2Wood: 90,
  toiletBudget: 1600,
  toiletBasis: 3500,
  toiletLuxe: 5000,
  bathBudget: 8000,
  bathBasis: 15000,
  bathLuxe: 30000,
  kitchenBudget: 8000,
  kitchenBasis: 15000,
  kitchenLuxe: 25000,
  // Verduurzaming - Materialen per m2
  glassMaterial: 150,
  kozijnKunststofMaterial: 600,
  kozijnHoutMaterial: 800,
  kozijnAluMaterial: 950,
  tripleGlassSurcharge: 90,
  // Verduurzaming - Arbeid per m2
  laborGlassOnly: 90,
  laborFullFrame: 175,
  // Verduurzaming - Per ruimte / raam
  windowStartupCost: 250,
  windowFinishingCost: 150,
  // Verduurzaming - Schuifpui per m1 / stuk
  slidingMaterialKunststof: 1400,
  slidingMaterialHoutAlu: 1800,
  slidingLaborFixed: 1250,
  // Verduurzaming - Projectbreed
  scaffoldingBase: 750,
  heightSurcharge: 250,
  wasteContainerCost: 450,
  // Muur sloop - Niet-dragend: startup €400 (container/afdekken), €500/m1 (slopen+afvoer+afwerking)
  wallNietDragendStartup: 400,
  wallNietDragendPerM: 500,
  // Muur sloop - Dragend: startup €2750 (berekening+vergunning+stempels), €1175/m1 (slopen+staal+afwerking)
  wallDragendStartup: 2750,
  wallDragendPerM: 1175,
  // Onvoorzien (%) – afhankelijk van bouwjaar
  onvoorzienNieuw: 5,    // na 2010
  onvoorzienMiddel: 10,  // 1945–2010
  onvoorzienOud: 15,     // voor 1945
  // Bandbreedte raming (%)
  rangeMin: 15,          // onderkant: -15%
  rangeMax: 25,          // bovenkant: +25%
};
