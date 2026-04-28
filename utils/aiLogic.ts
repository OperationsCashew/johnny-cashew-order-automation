
import { Room, Floor, RoomAnalysis, RoomRenovationActions } from '../types';

export type AdviceStatus = 'JA' | 'MISSCHIEN' | 'NEE';

export interface AdviceItem {
  label: string;
  status: AdviceStatus;
  sources: ('text' | 'photo')[];
}

// Uitgebreidere lijst met trigger woorden
const DATED_KEYWORDS = [
  'gedateerd', 'verouderd', 'moderniseren', 'bouwjaar', 'oorspronkelijk', 
  'jaren', 'renovatie', 'opknappen', 'defect', 'slijtage', 'oud', 
  'authentiek', 'standaard', 'eenvoudig', 'tegels', 'jaren 70', 'jaren 80', 'jaren 90'
];

const MODERN_KEYWORDS = [
  'modern', 'recent', 'vernieuwd', 'luxe', 'strak', 'instapklaar', 
  '2020', '2021', '2022', '2023', '2024', 'nieuw', 'design', 'gerenoveerd'
];

export function getRoomSummary(analysis: RoomAnalysis[]): string {
  if (!analysis || analysis.length === 0) return "Geen specifieke gegevens beschikbaar voor deze ruimte.";

  // Prioriteit 1: De door AI gesynthetiseerde eindconclusie
  const summarySource = analysis.find(a => a.source === 'summary');
  if (summarySource?.qualityDescription) return summarySource.qualityDescription;

  // Prioriteit 2: De handmatige notities
  const manualSource = analysis.find(a => a.source === 'manual');
  if (manualSource?.qualityDescription) return manualSource.qualityDescription;

  // Prioriteit 3: Noodscenario - Pak de ALLEREERSTE relevante AI beschrijving (niet meer de hele lijst)
  const descriptions = analysis
    .filter(a => (a.source === 'photo' || a.source === 'funda') && a.qualityDescription)
    .map(a => a.qualityDescription!.trim());

  if (descriptions.length === 0) return "De staat van deze ruimte is nog niet volledig geanalyseerd.";

  // Geef alleen de eerste terug om lange opsommingen te voorkomen
  return descriptions[0];
}

export function getAiAdvice(room: Room, floors: Floor[]): AdviceItem[] {
  const nameLower = room.originalName.toLowerCase();
  
  const houseHasExplicitKitchen = floors.some(f => 
    f.rooms.some(r => r.originalName.toLowerCase().includes('keuken'))
  );
  
  const isToilet = nameLower.includes('toilet') || nameLower.includes('wc');
  const isBathroom = nameLower.includes('badkamer') || nameLower.includes('douche') || nameLower.includes('badk');
  const isKitchen = nameLower.includes('keuken') || nameLower.includes('kitchen') || 
                    (!houseHasExplicitKitchen && (nameLower.includes('woon') || nameLower.includes('living')));

  const getStatusForAction = (
    predicate: (a: RoomAnalysis) => boolean,
    checkDated: boolean = false
  ): { status: AdviceStatus; sources: ('text' | 'photo')[] } => {
    
    const relevantAnalyses = room.analysis.filter(a => a.source !== 'manual');

    // 1. Is er een harde actie (boolean true in de JSON van Gemini)?
    const explicitAction = relevantAnalyses.some(predicate);

    // 2. Analyseer de teksten op trefwoorden
    let isDatedText = false;
    let isModernText = false;

    if (checkDated) {
      const descriptions = relevantAnalyses
        .map(a => a.qualityDescription?.toLowerCase() || "")
        .join(" ");

      isDatedText = DATED_KEYWORDS.some(k => descriptions.includes(k));
      isModernText = MODERN_KEYWORDS.some(k => descriptions.includes(k));
    }

    if (isModernText && !explicitAction) {
       return { status: 'NEE', sources: [] };
    }

    if (explicitAction) {
       const hasHighConfidence = relevantAnalyses.some(a => predicate(a) && a.confidence === 'HIGH');
       return { 
         status: hasHighConfidence ? 'JA' : 'MISSCHIEN', 
         sources: ['photo']
       };
    }

    if (checkDated && isDatedText && !isModernText) {
        return { 
          status: 'MISSCHIEN', 
          sources: ['text', 'photo'] 
        };
    }

    return { status: 'NEE', sources: [] };
  };

  const advice: AdviceItem[] = (isToilet || isBathroom) ? [] : [
    { label: "Muren schilderen", ...getStatusForAction(a => !!a.actions.paintWalls) },
    { label: "Plafond schilderen", ...getStatusForAction(a => !!a.actions.paintCeiling) },
    { label: "Muren stucen", ...getStatusForAction(a => !!a.actions.plasterWalls, true) },
    { label: "Plafond stucen", ...getStatusForAction(a => !!a.actions.plasterCeiling) },
  ];

  if (!isToilet && !isBathroom) {
    advice.push({ 
      label: "Vloer vervangen", 
      ...getStatusForAction(a => a.actions.floorAction === 'NIEUW' || a.actions.floorAction === 'RENOVEREN', true) 
    });
  }

  if (isToilet) {
    advice.push({ label: "Toilet renovatie", ...getStatusForAction(a => a.actions.toiletAction === 'NIEUW', true) });
  }
  if (isBathroom) {
    advice.push({ label: "Badkamer renovatie", ...getStatusForAction(a => a.actions.bathroomAction === 'NIEUW', true) });
  }
  if (isKitchen) {
    advice.push({ label: "Keuken renovatie", ...getStatusForAction(a => a.actions.kitchenAction === 'NIEUW', true) });
  }

  return advice;
}

export function getAcceptedActions(adviceList: AdviceItem[], currentActions: RoomRenovationActions): RoomRenovationActions {
  const newActions = { ...currentActions };
  adviceList.forEach(item => {
    if (item.status === 'NEE') return;

    switch (item.label) {
      case "Muren schilderen": newActions.paintWalls = true; break;
      case "Plafond schilderen": newActions.paintCeiling = true; break;
      case "Muren stucen": newActions.plasterWalls = true; break;
      case "Plafond stucen": newActions.plasterCeiling = true; break;
      case "Vloer vervangen": newActions.floorAction = 'NIEUW'; break;
      case "Toilet renovatie": newActions.toiletAction = 'NIEUW'; break;
      case "Badkamer renovatie": newActions.bathroomAction = 'NIEUW'; break;
      case "Keuken renovatie": newActions.kitchenAction = 'NIEUW'; break;
    }
  });
  return newActions;
}
