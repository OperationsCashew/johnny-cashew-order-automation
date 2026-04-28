
import React, { useMemo, useState } from 'react';
import { Room, RoomAnalysis, CostSettings, Floor, RoomRenovationActions, HouseMetadata } from '../types';
import { getRoomSummary, getAiAdvice, getAcceptedActions, AdviceItem } from '../utils/aiLogic';
import { getRoomCostBreakdown } from '../utils/costEngine';
import ToggleRow from './ui/ToggleRow';
import StatCard from './ui/StatCard';
import SanitaryCard from './ui/SanitaryCard';

interface SidebarProps {
  room: Room | null;
  floors: Floor[];
  totalProjectCost: number;
  houseMetadata: HouseMetadata;
  costSettings: CostSettings;
  isProcessing?: boolean;
  onUpdateRoomAnalysis: (roomId: string, updates: Partial<RoomAnalysis>) => void;
}

type FloorType = 'none' | 'pvc' | 'laminaat' | 'hout';

const Sidebar: React.FC<SidebarProps> = ({ room, floors, totalProjectCost, houseMetadata, costSettings, onUpdateRoomAnalysis }) => {
  const [isAdviceExpanded, setIsAdviceExpanded] = useState(false);
  const [isSummaryFullExpanded, setIsSummaryFullExpanded] = useState(false);

  // 1. Bereken statistieken voor het hele huis
  const houseStats = useMemo(() => {
    let totalArea = 0, numSlaapkamers = 0, numToilets = 0, numBadkamers = 0;
    floors.forEach(f => {
      f.rooms.forEach(r => {
        totalArea += r.metrics.floorArea;
        const name = r.originalName.toLowerCase();
        if (name.includes('slaapkamer') || name.includes('bedroom')) numSlaapkamers++;
        if (name.includes('toilet') || name.includes('wc')) numToilets++;
        if (name.includes('badkamer') || name.includes('douche') || name.includes('bathroom')) numBadkamers++;
      });
    });
    return { totalArea, numSlaapkamers, numToilets, numBadkamers, numVerdiepingen: floors.length };
  }, [floors]);

  // AI Verwerking via Utilities
  const roomSummary = useMemo(() => room ? getRoomSummary(room.analysis) : "", [room]);
  const aiAdvice = useMemo(() => room ? getAiAdvice(room, floors) : [], [room, floors]);
  const activeAdviceCount = useMemo(() => aiAdvice.filter(item => item.status !== 'NEE').length, [aiAdvice]);
  const hasAdvice = activeAdviceCount > 0;

  // Gebruik de centrale costEngine voor alle data
  const roomData = useMemo(() => {
    if (!room) return null;
    const nameLower = room.originalName.toLowerCase();
    const houseHasKitchen = floors.some(f => f.rooms.some(r => r.originalName.toLowerCase().includes('keuken')));
    
    const manual = room.analysis.find(a => a.source === 'manual');
    // FIX: Add missing required properties to satisfy RoomRenovationActions type and ensure explicit typing.
    const actions: RoomRenovationActions = manual?.actions || {
      paintCeiling: false, paintWalls: false, plasterWalls: false, plasterCeiling: false, 
      floorAction: 'BEHOUDEN', toiletAction: 'NVT', bathroomAction: 'NVT', kitchenAction: 'NVT',
      toiletQuality: 'BUDGET', bathroomQuality: 'BUDGET', kitchenQuality: 'BUDGET',
      underfloorHeating: false, removeOldFloor: false, subfloorType: 'BETON',
      replaceWindows: false, windowType: 'ALTIJD_GLAS', glassType: 'HR++',
      replaceSlidingDoor: false, slidingDoorType: 'KUNSTSTOF_HR++'
    };

    const breakdown = getRoomCostBreakdown(room, costSettings, houseHasKitchen);

    return {
      actions,
      currentFloorType: manual?.floorType || 'none',
      isToilet: nameLower.includes('toilet') || nameLower.includes('wc'),
      isBathroom: nameLower.includes('badkamer') || nameLower.includes('douche') || nameLower.includes('badk'),
      isKitchen: nameLower.includes('keuken') || nameLower.includes('kitchen') || (!houseHasKitchen && (nameLower.includes('woon') || nameLower.includes('living'))),
      ...breakdown
    };
  }, [room, floors, costSettings]);

  const handleActionUpdate = (updates: Partial<RoomRenovationActions>) => {
    if (!room || !roomData) return;
    onUpdateRoomAnalysis(room.id, { actions: { ...roomData.actions, ...updates } });
  };

  const handleAcceptAllAdvice = () => {
    if (!room || !roomData) return;
    const newActions = getAcceptedActions(aiAdvice, roomData.actions);
    const aiAnalysis = room.analysis.find(a => a.source !== 'manual');
    const suggestedFloorType = aiAnalysis?.floorType || 'laminaat';

    onUpdateRoomAnalysis(room.id, { 
      floorType: newActions.floorAction === 'NIEUW' && roomData.currentFloorType === 'none' 
        ? suggestedFloorType 
        : (newActions.floorAction === 'NIEUW' ? roomData.currentFloorType : 'none'),
      actions: newActions 
    });
  };

  if (!room || !roomData) {
    return (
      <div className="w-96 h-full flex flex-col bg-gray-50 border-l border-gray-200 shadow-2xl">
        <div className="p-8 bg-white border-b border-gray-100 shadow-sm space-y-6">
           <div className="space-y-1">
              <h2 className="text-2xl font-black text-gray-900 tracking-tighter leading-none uppercase">{houseMetadata.address || houseMetadata.name}</h2>
              {(houseMetadata.postcode || houseMetadata.city) && (
                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{houseMetadata.postcode} {houseMetadata.city}</p>
              )}
           </div>
           <div className="flex gap-4">
             {houseMetadata.askingPrice && (
               <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                 <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vraagprijs</span>
                 <span className="text-xl font-black text-gray-900">{houseMetadata.askingPrice}</span>
               </div>
             )}
             {houseMetadata.energyLabel && (
               <div className="bg-emerald-50 px-6 py-4 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center">
                  <span className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Label</span>
                  <span className="text-2xl font-black text-emerald-700">{houseMetadata.energyLabel}</span>
               </div>
             )}
           </div>
           {houseMetadata.summary && (
             <div className="relative">
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Omschrijving</span>
                <p className="text-xs font-medium text-gray-600 italic leading-relaxed line-clamp-3">"{houseMetadata.summary}"</p>
             </div>
           )}
           <div className="pt-6 border-t border-gray-100">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Geraamde Renovatie</span>
              <span className="text-4xl font-black text-gray-900 tracking-tighter">€{Math.round(totalProjectCost).toLocaleString('nl-NL')}</span>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-4">
           <div className="grid grid-cols-2 gap-4">
              <StatCard label="Oppervlakte" value={`${Math.round(houseStats.totalArea)} m²`} />
              <StatCard label="Verdiepingen" value={String(houseStats.numVerdiepingen)} />
              <StatCard label="Slaapkamers" value={String(houseStats.numSlaapkamers)} />
              <StatCard label="Badkamers" value={String(houseStats.numBadkamers)} />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 h-full flex flex-col bg-white border-l border-gray-200 shadow-lg z-20">
      <div className="p-6 bg-white border-b border-gray-100">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-tight">{room.name}</h2>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">Specificaties</p>
          </div>
          <div className="text-right">
             <div className="text-xl font-bold text-gray-900">€ {Math.round(roomData.totalCost).toLocaleString('nl-NL')}</div>
             <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Totaal Kamer</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 pt-4 border-t border-gray-100 text-sm">
           <div><p className="text-[10px] text-gray-400 uppercase font-bold">Vloer</p>{room.metrics.floorArea.toFixed(1)} m²</div>
           <div><p className="text-[10px] text-gray-400 uppercase font-bold">Muur</p>{room.metrics.wallArea.toFixed(1)} m²</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* AI ADVICE ACCORDION */}
        <div className="border-b border-gray-100">
          <button 
            onClick={() => hasAdvice && setIsAdviceExpanded(!isAdviceExpanded)}
            disabled={!hasAdvice}
            className={`w-full flex items-center justify-between p-6 transition-colors group ${hasAdvice ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default opacity-60'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg ${hasAdvice ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-bold text-gray-800">AI Advies</span>
                <span className="text-[10px] font-medium text-gray-500">
                  {hasAdvice ? `${activeAdviceCount} suggesties` : 'Geen suggesties'}
                </span>
              </div>
            </div>
            {hasAdvice && (
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isAdviceExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
            )}
          </button>
          
          {hasAdvice && isAdviceExpanded && (
            <div className="px-6 pb-6 space-y-4 bg-gray-50/50">
              {roomSummary && (
                <div 
                  onClick={() => setIsSummaryFullExpanded(!isSummaryFullExpanded)}
                  className="p-3 bg-white/60 border border-emerald-100 rounded-xl shadow-sm flex gap-2.5 items-start cursor-pointer hover:bg-emerald-50/50 transition-colors group"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className={`text-[11px] font-medium text-gray-700 italic leading-snug ${isSummaryFullExpanded ? '' : 'line-clamp-2'}`}>
                    "{roomSummary}"
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {aiAdvice.filter(i => i.status !== 'NEE').map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600 font-medium">{item.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.status === 'JA' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={handleAcceptAllAdvice} className="w-full mt-2 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors shadow-sm">
                Neem suggesties over
              </button>
            </div>
          )}
        </div>

        <div className="p-6 space-y-8">
          {(roomData.isToilet || roomData.isBathroom || roomData.isKitchen) && (
            <div className="space-y-6">
              {roomData.isToilet && <SanitaryCard label="Toilet" cost={roomData.toiletCost} isActive={roomData.actions.toiletAction === 'NIEUW'} quality={roomData.actions.toiletQuality || 'BUDGET'} onToggle={(v) => handleActionUpdate({ toiletAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ toiletQuality: q })} />}
              {roomData.isBathroom && <SanitaryCard label="Badkamer" cost={roomData.bathroomCost} isActive={roomData.actions.bathroomAction === 'NIEUW'} quality={roomData.actions.bathroomQuality || 'BUDGET'} onToggle={(v) => handleActionUpdate({ bathroomAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ bathroomQuality: q })} />}
              {roomData.isKitchen && <SanitaryCard label="Keuken" cost={roomData.kitchenCost} isActive={roomData.actions.kitchenAction === 'NIEUW'} quality={roomData.actions.kitchenQuality || 'BUDGET'} onToggle={(v) => handleActionUpdate({ kitchenAction: v ? 'NIEUW' : 'NVT' })} onChangeQuality={(q) => handleActionUpdate({ kitchenQuality: q })} />}
            </div>
          )}

          <div className="space-y-2 border-t border-gray-50 pt-4">
            <ToggleRow label="Muren schilderen" subLabel={`${room.metrics.wallArea.toFixed(1)} m²`} price={roomData.wallPaintCost} checked={roomData.actions.paintWalls} onChange={(v) => handleActionUpdate({ paintWalls: v })} />
            <ToggleRow label="Plafond schilderen" subLabel={`${room.metrics.ceilingArea.toFixed(1)} m²`} price={roomData.ceilingPaintCost} checked={roomData.actions.paintCeiling} onChange={(v) => handleActionUpdate({ paintCeiling: v })} />
            <ToggleRow label="Muren stucen" subLabel={`${room.metrics.wallArea.toFixed(1)} m²`} price={roomData.wallPlasterCost} checked={roomData.actions.plasterWalls} onChange={(v) => handleActionUpdate({ plasterWalls: v })} />
            <ToggleRow label="Plafond stucen" subLabel={`${room.metrics.ceilingArea.toFixed(1)} m²`} price={roomData.ceilingPlasterCost} checked={roomData.actions.plasterCeiling} onChange={(v) => handleActionUpdate({ plasterCeiling: v })} />
          </div>

          {!roomData.isToilet && !roomData.isBathroom && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-900">Vloer vervangen</span>
                <span className="text-sm font-semibold text-gray-900">€ {Math.round(roomData.floorCost)}</span>
              </div>
              <select value={roomData.currentFloorType} onChange={(e) => {
                const val = e.target.value as FloorType;
                // FIX: Use explicit cast to RoomRenovationActions to handle the extended properties added in roomData useMemo.
                onUpdateRoomAnalysis(room.id, { 
                  floorType: val, 
                  actions: { ...roomData.actions, floorAction: val === 'none' ? 'BEHOUDEN' : 'NIEUW' } as RoomRenovationActions 
                });
              }} className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none appearance-none cursor-pointer">
                <option value="none">Geen (Behouden)</option>
                <option value="pvc">PVC Vloer</option>
                <option value="laminaat">Laminaat</option>
                <option value="hout">Houten Vloer</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
