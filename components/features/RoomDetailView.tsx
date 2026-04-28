
import React, { useMemo, useState } from 'react';
import { Room, RoomAnalysis, CostSettings, Floor, RoomRenovationActions, HouseMetadata, CustomRenovationItem } from '../../types';
import { getRoomSummary, getAiAdvice, getAcceptedActions } from '../../utils/aiLogic';
import { getRoomCostBreakdown, DEFAULT_ACTIONS } from '../../utils/costEngine';
import { estimateCustomRenovationItem } from '../../services/geminiService';
import EditableText from '../ui/EditableText';
import RenovationSection, { SectionStatus } from '../ui/RenovationSection';
import StatusRow from '../ui/StatusRow';
import SanitaryCard from '../ui/SanitaryCard';

interface RoomDetailViewProps {
  room: Room;
  floors: Floor[];
  costSettings: CostSettings;
  houseMetadata: HouseMetadata;
  onUpdateAction: (roomId: string, updates: Partial<RoomAnalysis>) => void;
  onUpdateRoomName?: (roomId: string, newName: string) => void;
  onUpdateMetadata?: (updates: Partial<HouseMetadata>) => void;
  onQuoteOpen?: () => void;
}

const RoomDetailView: React.FC<RoomDetailViewProps> = ({
  room,
  floors,
  costSettings,
  houseMetadata,
  onUpdateAction,
  onUpdateRoomName,
  onUpdateMetadata,
  onQuoteOpen
}) => {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [showSubfloorPrompt, setShowSubfloorPrompt] = useState(false);
  const [isAddRenovationExpanded, setIsAddRenovationExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const roomSummary = useMemo(() => getRoomSummary(room.analysis), [room]);
  const aiAdvice = useMemo(() => getAiAdvice(room, floors), [room, floors]);
  const activeAdviceCount = useMemo(() => aiAdvice.filter(item => item.status !== 'NEE').length, [aiAdvice]);

  const roomData = useMemo(() => {
    const nameLower = room.originalName.toLowerCase();
    const houseHasKitchen = floors.some(f => f.rooms.some(r => r.originalName.toLowerCase().includes('keuken')));
    const globalSubfloor = houseMetadata.globalSubfloor || 'BETON';

    const manual = room.analysis.find(a => a.source === 'manual');
    const actions = manual?.actions || { ...DEFAULT_ACTIONS, subfloorType: globalSubfloor };
    
    const breakdown = getRoomCostBreakdown(room, costSettings, houseHasKitchen, globalSubfloor);
    
    const showToilet = (nameLower.includes('toilet') || nameLower.includes('wc')) && !nameLower.includes('badkamer') || actions.toiletAction === 'NIEUW';
    const showBathroom = nameLower.includes('badkamer') || nameLower.includes('douche') || nameLower.includes('badk') || actions.bathroomAction === 'NIEUW';
    const showKitchen = nameLower.includes('keuken') || nameLower.includes('kitchen') || (!houseHasKitchen && (nameLower.includes('woon') || nameLower.includes('living'))) || actions.kitchenAction === 'NIEUW';

    const hasSlidingDoor = room.openings.some(o => o.type === 'door' && o.width > 105 && o.isExternal);

    return {
      actions,
      currentFloorType: manual?.floorType || 'none',
      customItems: manual?.customItems || [],
      showToilet,
      showBathroom,
      showKitchen,
      hasSlidingDoor,
      ...breakdown
    };
  }, [room, floors, costSettings, houseMetadata.globalSubfloor]);


  const handleActionUpdate = (updates: Partial<RoomRenovationActions>) => {
    if (updates.glassType === 'HR+++') {
      if (roomData.actions.windowType === 'ALTIJD_GLAS') {
        updates.windowType = 'KOZIJN_KUNSTSTOF';
      }
    }
    onUpdateAction(room.id, { actions: { ...roomData.actions, ...updates } });
  };

  const handleToggleHeating = (active: boolean) => {
    if (active) {
        const anyRoomHasHeating = floors.some(f => f.rooms.some(r => r.analysis.some(a => a.source === 'manual' && a.actions.underfloorHeating)));
        if (!anyRoomHasHeating) setShowSubfloorPrompt(true);

        onUpdateAction(room.id, { 
            floorType: 'pvc',
            actions: { ...roomData.actions, underfloorHeating: true, removeOldFloor: true, floorAction: 'NIEUW' }
        });
    } else {
        handleActionUpdate({ underfloorHeating: false });
    }
  };

  const handleAcceptAllAdvice = () => {
    const newActions = getAcceptedActions(aiAdvice, roomData.actions);
    onUpdateAction(room.id, { actions: newActions });
  };

  const handleAddCustomItem = async () => {
    const trimmed = customInput.trim();
    if (!trimmed || isEstimating) return;
    setIsEstimating(true);
    setEstimateError(null);
    try {
      const manual = room.analysis.find(a => a.source === 'manual');
      const qualityDescription = room.analysis.find(a => a.source === 'summary')?.qualityDescription
        || room.analysis.find(a => a.source === 'photo')?.qualityDescription;
      const result = await estimateCustomRenovationItem(trimmed, {
        roomName: room.name,
        floorArea: room.metrics.floorArea,
        wallArea: room.metrics.wallArea,
        ceilingArea: room.metrics.ceilingArea,
        perimeter: room.metrics.perimeter,
        height: room.metrics.height,
        windowCount: room.metrics.windowCount,
        doorCount: room.metrics.doorCount,
        windowArea: room.metrics.windowArea,
        doorArea: room.metrics.doorArea,
        extWallArea: room.metrics.extWallArea,
        intWallArea: room.metrics.intWallArea,
        extWindowCount: room.metrics.extWindowCount,
        extDoorCount: room.metrics.extDoorCount,
        extWindowArea: room.metrics.extWindowArea,
        extDoorArea: room.metrics.extDoorArea,
        yearBuilt: houseMetadata.yearBuilt,
        qualityDescription,
      });
      const newItem: CustomRenovationItem = {
        id: crypto.randomUUID(),
        userInput: trimmed,
        ...result,
      };
      const existing = manual?.customItems || [];
      onUpdateAction(room.id, { customItems: [...existing, newItem] });
      setCustomInput('');
    } catch (err: any) {
      console.error('estimateCustomRenovationItem error:', err);
      setEstimateError('Kon geen schatting maken. Probeer een concretere omschrijving.');
    } finally {
      setIsEstimating(false);
    }
  };

  const handleRemoveCustomItem = (id: string) => {
    const manual = room.analysis.find(a => a.source === 'manual');
    const existing = manual?.customItems || [];
    onUpdateAction(room.id, { customItems: existing.filter(i => i.id !== id) });
  };

  const getSectionStatus = (labels: string[]): SectionStatus => {
    const relevantAdvice = aiAdvice.filter(a => labels.includes(a.label));
    if (relevantAdvice.some(a => {
        const isChecked = 
            a.label === 'Vloer vervangen' ? roomData.actions.floorAction === 'NIEUW' :
            a.label === 'Muren schilderen' ? roomData.actions.paintWalls :
            a.label === 'Plafond schilderen' ? roomData.actions.paintCeiling :
            a.label === 'Muren stucen' ? roomData.actions.plasterWalls :
            a.label === 'Plafond stucen' ? roomData.actions.plasterCeiling :
            a.label === 'Toilet renovatie' ? roomData.actions.toiletAction === 'NIEUW' :
            a.label === 'Badkamer renovatie' ? roomData.actions.bathroomAction === 'NIEUW' :
            a.label === 'Keuken renovatie' ? roomData.actions.kitchenAction === 'NIEUW' : false;
        return (a.status === 'JA' || a.status === 'MISSCHIEN') && !isChecked;
    })) return 'WARNING';
    if (relevantAdvice.length > 0) return 'OK';
    return 'UNKNOWN';
  };

  const canAddMoreRenovations = !roomData.showKitchen || !roomData.showToilet || !roomData.showBathroom;

  return (
    <div className="w-72 lg:w-96 h-full bg-white border-l border-gray-100 shadow-sm z-20 overflow-y-auto custom-scrollbar">
      <div className="bg-white px-5 pt-6 pb-4 lg:px-8 lg:pt-10 lg:pb-6">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Geselecteerde Ruimte</span>
            <h2 className="text-lg lg:text-2xl font-black text-slate-900 leading-tight mt-1 uppercase truncate tracking-tighter">
              <EditableText 
                value={room.name} 
                onSave={(val) => onUpdateRoomName?.(room.id, val)}
                className="w-full"
              />
            </h2>
          </div>
          <div className="text-right shrink-0 min-w-[80px] lg:min-w-[100px]">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Raming</span>
             <div className="text-lg lg:text-2xl font-black text-emerald-600 tracking-tighter mt-1 tabular-nums">€ {Math.round(roomData.totalCost).toLocaleString('nl-NL')}</div>
          </div>
        </div>
        
        <div className="flex flex-col gap-2 mt-6">
           <div className="flex gap-2">
              <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-600 flex items-center gap-2">
                 {room.metrics.floorArea.toFixed(1)} m²
              </div>
              <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-600 flex items-center gap-2">
                 Ext. Glas: {room.metrics.extWindowArea.toFixed(1)} m²
              </div>
           </div>
           

        </div>
      </div>

      <div className="px-3 py-4 lg:px-6 lg:py-6 space-y-2">
        {roomSummary && (
          <div className={`mb-6 rounded-[1.5rem] transition-all duration-300 overflow-hidden ${isSummaryExpanded ? 'bg-blue-50/80 border border-blue-100' : 'bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 shadow-sm'}`}>
             <button onClick={() => setIsSummaryExpanded(!isSummaryExpanded)} className="w-full flex items-center justify-between p-4 text-left group">
                <div className="flex items-center gap-3">
                   <div className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${isSummaryExpanded ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-blue-50 text-blue-500 border border-blue-100 group-hover:border-blue-200'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      {activeAdviceCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse" />
                      )}
                   </div>
                   <div>
                     <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">AI Observatie</span>
                     {!isSummaryExpanded && <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest leading-none mt-0.5">Klik om te bekijken</p>}
                   </div>
                </div>
                <svg className={`w-4 h-4 text-blue-400 transition-transform ${isSummaryExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
             </button>
             {isSummaryExpanded && (
                <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
                   <p className="text-[11px] text-blue-900/80 font-bold leading-relaxed italic mb-4">"{roomSummary}"</p>
                   {activeAdviceCount > 0 && (
                      <button onClick={handleAcceptAllAdvice} className="w-full py-2.5 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all">
                         Pas AI Advies Toe ({activeAdviceCount})
                      </button>
                   )}
                </div>
             )}
          </div>
        )}

        {/* 1. Grote items (keuken, toilet, badkamer) */}
        {(roomData.showToilet || roomData.showBathroom || roomData.showKitchen) && (
          <RenovationSection title={roomData.showKitchen ? "Sanitair & Keuken" : "Sanitair"} status={getSectionStatus(["Toilet renovatie", "Badkamer renovatie", "Keuken renovatie"])} totalCost={roomData.toiletCost + roomData.bathroomCost + roomData.kitchenCost} 
          defaultOpen={
      roomData.actions.toiletAction === 'NIEUW' || 
      roomData.actions.bathroomAction === 'NIEUW' || 
      roomData.actions.kitchenAction === 'NIEUW'
    }
          
          >
             {roomData.showToilet && <div className="px-1 py-1"><SanitaryCard label="Toilet" cost={roomData.toiletCost} isActive={roomData.actions.toiletAction === 'NIEUW'} quality={roomData.actions.toiletQuality || 'BASIS'} onToggle={(v) => handleActionUpdate({ toiletAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ toiletQuality: q })} /></div>}
             {roomData.showBathroom && <div className="px-1 py-1"><SanitaryCard label="Badkamer" cost={roomData.bathroomCost} isActive={roomData.actions.bathroomAction === 'NIEUW'} quality={roomData.actions.bathroomQuality || 'BASIS'} onToggle={(v) => handleActionUpdate({ bathroomAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ bathroomQuality: q })} /></div>}
             {roomData.showKitchen && <div className="px-1 py-1"><SanitaryCard label="Keuken" cost={roomData.kitchenCost} isActive={roomData.actions.kitchenAction === 'NIEUW'} quality={roomData.actions.kitchenQuality || 'BASIS'} onToggle={(v) => handleActionUpdate({ kitchenAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ kitchenQuality: q })} /></div>}
          </RenovationSection>
        )}

        {/* 2. Schilderen en stucen — niet tonen bij badkamer of toilet */}
        {!(roomData.showToilet || roomData.showBathroom) && (
        <RenovationSection title="Schilderen en stucen" status={getSectionStatus(["Muren schilderen", "Plafond schilderen", "Muren stucen", "Plafond stucen"])} totalCost={roomData.wallPaintCost + roomData.wallPlasterCost + roomData.ceilingPaintCost + roomData.ceilingPlasterCost}>
           <StatusRow label="Plafond Schilderen" aiAdvice={aiAdvice.find(a => a.label === "Plafond schilderen")} price={roomData.ceilingPaintCost} checked={roomData.actions.paintCeiling} onChange={() => handleActionUpdate({ paintCeiling: !roomData.actions.paintCeiling })} />
           <StatusRow label="Muren Schilderen" aiAdvice={aiAdvice.find(a => a.label === "Muren schilderen")} price={roomData.wallPaintCost} checked={roomData.actions.paintWalls} onChange={() => handleActionUpdate({ paintWalls: !roomData.actions.paintWalls })} />
           <StatusRow label="Muren Stucen" aiAdvice={aiAdvice.find(a => a.label === "Muren stucen")} price={roomData.wallPlasterCost} checked={roomData.actions.plasterWalls} onChange={() => handleActionUpdate({ plasterWalls: !roomData.actions.plasterWalls })} />
           <StatusRow label="Plafond Stucen" aiAdvice={aiAdvice.find(a => a.label === "Plafond stucen")} price={roomData.ceilingPlasterCost} checked={roomData.actions.plasterCeiling} onChange={() => handleActionUpdate({ plasterCeiling: !roomData.actions.plasterCeiling })} />
        </RenovationSection>
        )}

        {/* 3. Vloer en verwarming */}
        <RenovationSection 
          title="Vloer & verwarming"
          status={getSectionStatus(["Vloer vervangen"])}
          totalCost={roomData.heatingInstallationCost + roomData.floorCost + roomData.floorRemovalCost + roomData.levelingCost}
          defaultOpen={roomData.actions.floorAction === 'NIEUW'}
        >
           <StatusRow label="Vloerverwarming" aiAdvice={undefined} price={roomData.heatingInstallationCost} checked={roomData.actions.underfloorHeating} onChange={() => handleToggleHeating(!roomData.actions.underfloorHeating)} subText={roomData.actions.underfloorHeating ? `Installatie (${houseMetadata.globalSubfloor === 'HOUT' ? 'Droogbouw' : 'Infrezen'})` : undefined} />

           {showSubfloorPrompt && roomData.actions.underfloorHeating && (
              <div className="mx-3 mt-1 mb-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in zoom-in duration-300 shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Kies Woning Ondervloer</span>
                    <button onClick={() => setShowSubfloorPrompt(false)} className="text-emerald-400 hover:text-emerald-600">
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => { onUpdateMetadata?.({ globalSubfloor: 'BETON' }); setShowSubfloorPrompt(false); }} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${houseMetadata.globalSubfloor === 'BETON' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-600 border border-emerald-200'}`}>Beton (Basis)</button>
                    <button onClick={() => { onUpdateMetadata?.({ globalSubfloor: 'HOUT' }); setShowSubfloorPrompt(false); }} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${houseMetadata.globalSubfloor === 'HOUT' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-600 border border-emerald-200'}`}>Hout (Droog)</button>
                 </div>
              </div>
           )}
           <div className="h-px bg-slate-50 my-1 mx-3" />
           <StatusRow label="Oude vloer verwijderen" aiAdvice={undefined} price={roomData.floorRemovalCost} checked={roomData.actions.removeOldFloor} onChange={() => handleActionUpdate({ removeOldFloor: !roomData.actions.removeOldFloor })} />
           <StatusRow label="Nieuwe vloer leggen" aiAdvice={aiAdvice.find(a => a.label === "Vloer vervangen")} price={roomData.floorCost} checked={roomData.actions.floorAction === 'NIEUW'} onChange={() => {
             const becomingNew = roomData.actions.floorAction !== 'NIEUW';
             handleActionUpdate({ floorAction: becomingNew ? 'NIEUW' : 'BEHOUDEN', ...(becomingNew ? { removeOldFloor: true } : {}) });
           }} />

           <div className={`overflow-hidden transition-all duration-300 ease-in-out ${roomData.actions.floorAction === 'NIEUW' ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <div className="mt-3 space-y-2 px-3 pb-2">
                    <select value={roomData.currentFloorType} onChange={(e) => onUpdateAction(room.id, { floorType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-[11px] font-black text-slate-700 outline-none appearance-none cursor-pointer">
                        <option value="none">Selecteer type...</option>
                        <option value="pvc">PVC (Standaard) — €75/m²</option>
                        <option value="pvcVisgraat">PVC (Visgraat) — €105/m²</option>
                        <option value="gietvloer">Gietvloer (PU) — €120/m²</option>
                        <option value="lamelparket">Lamelparket — €120/m²</option>
                    </select>
                </div>
           </div>
        </RenovationSection>

        {/* 4. Ramen & Kozijnen */}
        <RenovationSection title="Ramen & Kozijnen" status={roomData.actions.replaceWindows || roomData.actions.replaceSlidingDoor ? 'OK' : 'NONE'} totalCost={roomData.windowRenovationCost + roomData.slidingDoorRenovationCost}>
            <StatusRow label="Kozijnen / Glas vervangen" aiAdvice={undefined} price={roomData.windowRenovationCost} checked={roomData.actions.replaceWindows} onChange={() => handleActionUpdate({ replaceWindows: !roomData.actions.replaceWindows })} />
            {roomData.actions.replaceWindows && (
                <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-1">
                   <select value={roomData.actions.windowType} onChange={(e) => handleActionUpdate({ windowType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[10px] font-black uppercase tracking-widest outline-none">
                      <option value="ALTIJD_GLAS">Alleen Glas (HR++)</option>
                      <option value="KOZIJN_KUNSTSTOF">Kunststof Kozijn</option>
                      <option value="KOZIJN_HOUT">Houten Kozijn</option>
                      <option value="KOZIJN_ALUMINIUM">Alu Kozijn</option>
                   </select>
                   <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                      {(['HR++', 'HR+++'] as const).map(type => (
                        <button key={type} onClick={() => handleActionUpdate({ glassType: type })} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all ${roomData.actions.glassType === type ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                           {type}
                        </button>
                      ))}
                   </div>
                </div>
            )}

            {roomData.hasSlidingDoor && (
               <>
                <div className="h-px bg-slate-50 my-1 mx-3" />
                <StatusRow label="Schuifpui vervangen" aiAdvice={undefined} price={roomData.slidingDoorRenovationCost} checked={roomData.actions.replaceSlidingDoor} onChange={() => handleActionUpdate({ replaceSlidingDoor: !roomData.actions.replaceSlidingDoor })} />
                {roomData.actions.replaceSlidingDoor && (
                   <div className="px-3 pb-3 animate-in slide-in-from-top-1">
                      <select value={roomData.actions.slidingDoorType} onChange={(e) => handleActionUpdate({ slidingDoorType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[10px] font-black uppercase tracking-widest outline-none">
                        <option value="KUNSTSTOF_HR++">Kunststof HR++</option>
                        <option value="KUNSTSTOF_HR+++">Kunststof HR+++ (Triple)</option>
                      </select>
                   </div>
                )}
               </>
            )}
        </RenovationSection>

        {/* 5. AI werkzaamheden (vrije invoer) */}
        <RenovationSection
          title="AI werkzaamheden"
          status={roomData.customItems.length > 0 ? 'OK' : 'NONE'}
          totalCost={roomData.customItemsCost}
          defaultOpen={roomData.customItems.length > 0}
        >
          {/* Bestaande items */}
          {roomData.customItems.map(item => (
            <div key={item.id} className="group relative p-3 rounded-xl hover:bg-slate-50 transition-all">
              {/* Regel 1: vinkje + label + prijs */}
              <div className="flex items-center gap-3.5">
                <button
                  onClick={() => handleRemoveCustomItem(item.id)}
                  title="Klik om te verwijderen"
                  className="w-5 h-5 rounded-md border border-emerald-600 bg-emerald-600 flex items-center justify-center flex-shrink-0 hover:bg-rose-500 hover:border-rose-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                </button>
                <div className="flex flex-1 items-baseline justify-between gap-2 min-w-0">
                  <span className="text-sm font-semibold text-slate-900 leading-tight">{item.label}</span>
                  <span className="text-xs font-black text-slate-900 flex-shrink-0 tabular-nums">€ {Math.round(item.costEstimate).toLocaleString('nl-NL')}</span>
                </div>
              </div>
              {/* Regel 2: toelichting (uitgelijnd met label, volledig uitgeschreven) */}
              {(item.note || item.unitLabel) && (
                <p className="mt-1 pl-[34px] text-[9px] font-bold text-slate-400 uppercase leading-relaxed">
                  {item.unitLabel}{item.note ? ` · ${item.note}` : ''}
                </p>
              )}
            </div>
          ))}

          {/* Invoerveld */}
          <div className="px-1 pt-1 pb-0.5">
            <div className="flex gap-2 items-end">
              <textarea
                rows={3}
                value={customInput}
                onChange={e => { setCustomInput(e.target.value); setEstimateError(null); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddCustomItem(); } }}
                placeholder={"Bijv. 'inbouwsauna plaatsen' of 'gevel isoleren, spouwmuur steenwol'"}
                disabled={isEstimating}
                className="flex-1 bg-white border-2 border-emerald-300 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-slate-700 placeholder:text-slate-400 outline-none ring-2 ring-emerald-100 transition-all disabled:opacity-50 resize-none leading-relaxed"
              ></textarea>
              <button
                onClick={handleAddCustomItem}
                disabled={!customInput.trim() || isEstimating}
                className="flex-shrink-0 h-9 px-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isEstimating ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                )}
                {isEstimating ? 'Bezig…' : 'Bereken'}
              </button>
            </div>
            {estimateError && (
              <p className="mt-2 text-[10px] font-semibold text-rose-500 px-1">{estimateError}</p>
            )}
          </div>
        </RenovationSection>

        {/* 6. Renovatie toevoegen */}
        {canAddMoreRenovations && (
          <div className={`mt-8 border border-slate-100 rounded-[1.5rem] transition-all duration-300 overflow-hidden ${isAddRenovationExpanded ? 'bg-slate-50/50' : 'bg-transparent'}`}>
            <button 
              onClick={() => setIsAddRenovationExpanded(!isAddRenovationExpanded)}
              className="w-full flex items-center justify-between p-4 text-left group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${isAddRenovationExpanded ? 'bg-slate-200 text-slate-600 border border-slate-300' : 'bg-white text-slate-400 border border-slate-100 group-hover:border-slate-200'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/>
                  </svg>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Keuken of sanitair toevoegen</span>
              </div>
              <svg className={`w-4 h-4 text-slate-300 transition-transform ${isAddRenovationExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            
            {isAddRenovationExpanded && (
              <div className="px-4 pb-5 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                {!roomData.showKitchen && (
                  <AddRenovationRow 
                    label="Keuken" 
                    onClick={() => handleActionUpdate({ kitchenAction: 'NIEUW' })} 
                  />
                )}
                {!roomData.showToilet && (
                  <AddRenovationRow 
                    label="Toilet" 
                    onClick={() => handleActionUpdate({ toiletAction: 'NIEUW' })} 
                  />
                )}
                {!roomData.showBathroom && (
                  <AddRenovationRow 
                    label="Badkamer" 
                    onClick={() => handleActionUpdate({ bathroomAction: 'NIEUW' })} 
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface AddRenovationRowProps {
  label: string;
  onClick: () => void;
}

const AddRenovationRow: React.FC<AddRenovationRowProps> = ({ label, onClick }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-2xl transition-all group shadow-sm"
  >
    <div className="flex items-center gap-3">
       <div className="w-7 h-7 bg-slate-50 border border-slate-100 group-hover:border-emerald-200 rounded-xl flex items-center justify-center text-slate-300 group-hover:text-emerald-500 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/>
          </svg>
       </div>
       <span className="text-xs font-black text-slate-600 group-hover:text-emerald-900 uppercase tracking-tight">{label}</span>
    </div>
    <span className="text-[9px] font-black text-slate-300 group-hover:text-emerald-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">Toevoegen</span>
  </button>
);

export default RoomDetailView;
