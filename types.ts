
export interface Point {
  x: number;
  y: number;
}

export interface RoomMetrics {
  floorArea: number;   // m2
  wallArea: number;    // m2 (net area after subtracting openings)
  ceilingArea: number; // m2
  perimeter: number;   // m
  height: number;      // m
  openingArea: number; // m2 (total area of windows and doors)
  windowCount: number; 
  doorCount: number;   
  windowArea: number;  
  doorArea: number;    
  // Sustainability & Energy metrics
  extWallArea: number;   
  intWallArea: number;   
  extWindowCount: number;
  intWindowCount: number; 
  extDoorCount: number;   
  intDoorCount: number;   
  extWindowArea: number;
  extDoorArea: number;
}

export interface GroundingLink {
  uri: string;
  title: string;
}

export interface RoomRenovationActions {
  paintCeiling: boolean;
  paintWalls: boolean;
  plasterWalls: boolean;
  plasterCeiling: boolean;
  floorAction: 'NIEUW' | 'RENOVEREN' | 'BEHOUDEN' | 'ONBEKEND';
  toiletAction: 'NIEUW' | 'BEHOUDEN' | 'NVT';
  bathroomAction: 'NIEUW' | 'BEHOUDEN' | 'NVT';
  kitchenAction: 'NIEUW' | 'BEHOUDEN' | 'NVT';
  toiletQuality?: 'BUDGET' | 'BASIS' | 'LUXE';
  bathroomQuality?: 'BUDGET' | 'BASIS' | 'LUXE';
  kitchenQuality?: 'BUDGET' | 'BASIS' | 'LUXE';
  underfloorHeating: boolean;
  removeOldFloor: boolean;
  subfloorType: 'BETON' | 'HOUT';
  floorQuality?: 'BUDGET' | 'BASIS' | 'LUXE';
  // Verduurzaming
  replaceWindows: boolean;
  windowType: 'ALTIJD_GLAS' | 'KOZIJN_KUNSTSTOF' | 'KOZIJN_HOUT' | 'KOZIJN_ALUMINIUM';
  glassType: 'HR++' | 'HR+++';
  replaceSlidingDoor: boolean;
  slidingDoorType: 'KUNSTSTOF_HR++' | 'KUNSTSTOF_HR+++';
}

export interface CustomRenovationItem {
  id: string;
  userInput: string;       // originele invoer van de gebruiker
  label: string;           // Gemini-opgeschoond label
  costEstimate: number;    // totaalkosten in €
  unit: 'lumpsum' | 'm2' | 'stuks' | 'm';
  quantity: number;
  unitLabel: string;       // leesbare eenheid, bijv. "15 m²"
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  note?: string;           // korte toelichting van Gemini
}

export interface RoomAnalysis {
  roomName?: string;
  imageType?: 'INTERIEUR' | 'EXTERIEUR' | 'PLATTEGROND' | 'ONDUIDELIJK';
  qualityDescription?: string;
  actions: RoomRenovationActions;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'funda' | 'photo' | 'manual' | 'summary';
  notes?: string;
  links?: GroundingLink[];
  floorType?: 'none' | 'pvc' | 'pvcVisgraat' | 'gietvloer' | 'lamelparket';
  customItems?: CustomRenovationItem[];
}

export interface AnalyzedPhoto {
  id: string;
  url: string;
  analysis?: RoomAnalysis;
}

export interface Room {
  id: string;
  name: string;
  originalName: string;
  poly: Point[];
  labelPoint?: Point; // Manual label coordinates from FML
  metrics: RoomMetrics;
  analysis: RoomAnalysis[];
  color: string;
  openings: (WallOpening & { isExternal: boolean; startPoint?: Point; endPoint?: Point })[];
}

export interface WallOpening {
  t: number;
  width: number;
  z_height: number;
  type: 'window' | 'door';
  z?: number; 
}

export interface Wall {
  id: string;
  a: Point;
  b: Point;
  thickness?: number;
  openings: WallOpening[];
  isExternal: boolean;
  length: number;           // in meters
  isDragend: boolean;       // load-bearing (dragend)
  isMarkedForRemoval: boolean;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  height: number;
  rooms: Room[];
  walls?: Wall[];
}

export interface CostSettings {
  paintWalls: number;
  paintCeiling: number;
  plasterWalls: number;
  plasterCeiling: number;
  floorPVC: number;
  floorPVCVisgraat: number;
  floorGietvloer: number;
  floorLamelparket: number;
  floorRenoveren: number;
  floorRemoval: number;
  levelingPVC: number;
  heatingBase: number;
  heatingPerGroup: number;
  heatingM2Concrete: number;
  heatingM2Wood: number;
  toiletBudget: number;
  toiletBasis: number;
  toiletLuxe: number;
  bathBudget: number;
  bathBasis: number;
  bathLuxe: number;
  kitchenBudget: number;
  kitchenBasis: number;
  kitchenLuxe: number;
  // Verduurzaming - Ramen/Kozijnen
  glassMaterial: number;
  kozijnKunststofMaterial: number;
  kozijnHoutMaterial: number;
  kozijnAluMaterial: number;
  tripleGlassSurcharge: number;
  laborGlassOnly: number;
  laborFullFrame: number;
  windowStartupCost: number;
  windowFinishingCost: number;
  // Verduurzaming - Schuifpui
  slidingMaterialKunststof: number;
  slidingMaterialHoutAlu: number;
  slidingLaborFixed: number;
  // Verduurzaming - Projectbreed
  scaffoldingBase: number;
  heightSurcharge: number;
  wasteContainerCost: number;
  // Muur sloop
  wallNietDragendStartup: number;  // eenmalige opstartkosten niet-dragend
  wallNietDragendPerM: number;     // kosten per m1 niet-dragend
  wallDragendStartup: number;      // eenmalige opstartkosten dragend
  wallDragendPerM: number;         // kosten per m1 dragend
  // Onvoorzien (%)
  onvoorzienNieuw: number;         // % voor woningen gebouwd na 2010
  onvoorzienMiddel: number;        // % voor woningen gebouwd 1945–2010
  onvoorzienOud: number;           // % voor woningen gebouwd voor 1945
  // Bandbreedte raming (%)
  rangeMin: number;                // % onderkant bandbreedte (bijv. 15 → -15%)
  rangeMax: number;                // % bovenkant bandbreedte (bijv. 25 → +25%)
}

export interface HouseMetadata {
  name: string;
  address?: string;
  postcode?: string;
  city?: string;
  askingPrice?: string;
  energyLabel?: string;
  summary?: string;
  yearBuilt?: string;
  houseType?: string;
  globalSubfloor?: 'BETON' | 'HOUT';
}

export interface WallState {
  isDragend: boolean;
  isMarkedForRemoval: boolean;
}

export interface SavedProject {
  id: string;
  user_id: string;
  name: string;
  fml_content: string;
  analysis_state: Record<string, RoomAnalysis[]>;
  wall_state?: Record<string, WallState>;
  cost_settings: CostSettings;
  meta: HouseMetadata;
  created_at: string;
  updated_at: string;
}

export interface FMLProject {
  id: string | number;
  name: string;
  floors: FMLFloor[];
}

export interface FMLFloor {
  id: number | string;
  name: string;
  level: number;
  height: number;
  designs: FMLDesign[];
}

export interface FMLLabel {
  text: string;
  x: number;
  y: number;
}

export interface FMLDesign {
  areas: FMLArea[];
  walls: FMLWall[];
  labels?: FMLLabel[];
  /** Surfaces: extra vlakken zoals Keuken, Tuin, Terras (FloorPlanner-specifiek) */
  surfaces?: FMLArea[];
}

export interface FMLArea {
  name: string;
  color?: string;
  poly: Point[];
  type?: number; 
}

export interface FMLWall {
  a: Point;
  b: Point;
  thickness?: number; 
  openings: FMLWallOpening[];
}

export interface FMLWallOpening {
  t: number;
  width: number;
  z_height: number;
  type: 'window' | 'door';
  z?: number; 
}
