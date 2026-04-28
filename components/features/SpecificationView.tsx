
import React, { useState, useMemo, useCallback } from 'react';
import { Floor, Room, CostSettings, RoomAnalysis, RoomRenovationActions, HouseMetadata } from '../../types';
import { calculateRoomCost, getRoomCostBreakdown, DEFAULT_ACTIONS, calculateFloorManifoldCost, calculateTotalProjectCost } from '../../utils/costEngine';
import { generatePDFReport } from '../../utils/reportGenerator';
import ToggleRow from '../ui/ToggleRow';
import SanitaryCard from '../ui/SanitaryCard';

interface SpecificationViewProps {
  floors: Floor[];
  costSettings: CostSettings;
  onUpdateAction: (roomId: string, updates: Partial<RoomAnalysis>) => void;
  houseMetadata: HouseMetadata;
}

// Separate component for Room to ensure stability and localized re-renders
const RoomSpecSection = React.memo(({ 
  room, 
  costSettings, 
  houseHasKitchen, 
  onUpdateAction 
}: { 
  room: Room; 
  costSettings: CostSettings; 
  houseHasKitchen: boolean; 
  onUpdateAction: (roomId: string, updates: Partial<RoomAnalysis>) => void; 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const manual = room.analysis?.find(a => a.source === 'manual');
  const actions = useMemo(() => ({ ...DEFAULT_ACTIONS, ...(manual?.actions || {}) }), [manual]);
  const nameLower = (room.originalName || "").toLowerCase();

  // Smart type detection
  const isToilet = nameLower.includes('toilet') || nameLower.includes('wc') || actions.toiletAction === 'NIEUW';
  const isBathroom = nameLower.includes('badkamer') || nameLower.includes('douche') || nameLower.includes('badk') || actions.bathroomAction === 'NIEUW';
  const isKitchen = nameLower.includes('keuken') || nameLower.includes('kitchen') || (!houseHasKitchen && (nameLower.includes('woon') || nameLower.includes('living'))) || actions.kitchenAction === 'NIEUW';

  const handleUpdate = (updates: Partial<RoomRenovationActions>) => {
    onUpdateAction(room.id, { actions: { ...actions, ...updates } });
  };

  const breakdown = useMemo(() => 
    getRoomCostBreakdown(room, costSettings, houseHasKitchen),
    [room, costSettings, houseHasKitchen]
  );

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex justify-between items-center py-4 px-4 hover:bg-slate-50 rounded-2xl transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : '-rotate-90'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div className="flex flex-col items-start">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{room.name}</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
              {Math.round(room.metrics.floorArea)} m²
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
            € {Math.round(breakdown.totalCost).toLocaleString('nl-NL')}
          </span>
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-6 pb-6 pt-2 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          
          {(isToilet || isBathroom || isKitchen) && (
            <div className="md:col-span-2 space-y-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-0.5 flex-1 bg-slate-50" />
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest shrink-0">Sanitair & Keuken</span>
                <div className="h-0.5 flex-1 bg-slate-50" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isToilet && (
                  <SanitaryCard 
                    label="Toilet" 
                    cost={breakdown.toiletCost} 
                    isActive={actions.toiletAction === 'NIEUW'} 
                    quality={actions.toiletQuality || 'BUDGET'} 
                    onToggle={(v) => handleUpdate({ toiletAction: v ? 'NIEUW' : 'NVT' })} 
                    onChangeQuality={(q) => handleUpdate({ toiletQuality: q })} 
                  />
                )}
                {isBathroom && (
                  <SanitaryCard 
                    label="Badkamer" 
                    cost={breakdown.bathroomCost} 
                    isActive={actions.bathroomAction === 'NIEUW'} 
                    quality={actions.bathroomQuality || 'BUDGET'} 
                    onToggle={(v) => handleUpdate({ bathroomAction: v ? 'NIEUW' : 'NVT' })} 
                    onChangeQuality={(q) => handleUpdate({ bathroomQuality: q })} 
                  />
                )}
                {isKitchen && (
                  <SanitaryCard 
                    label="Keuken" 
                    cost={breakdown.kitchenCost} 
                    isActive={actions.kitchenAction === 'NIEUW'} 
                    quality={actions.kitchenQuality || 'BUDGET'} 
                    onToggle={(v) => handleUpdate({ kitchenAction: v ? 'NIEUW' : 'NVT' })} 
                    onChangeQuality={(q) => handleUpdate({ kitchenQuality: q })} 
                  />
                )}
              </div>
            </div>
          )}

          {!isToilet && !isBathroom && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-0.5 w-4 bg-slate-50" />
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest shrink-0">Afwerking Wanden</span>
              <div className="h-0.5 flex-1 bg-slate-50" />
            </div>
            <ToggleRow
              label="Muren verven"
              subLabel={`${room.metrics.wallArea.toFixed(1)} m²`}
              price={breakdown.wallPaintCost}
              checked={actions.paintWalls}
              onChange={(v) => handleUpdate({ paintWalls: v })}
            />
            <ToggleRow
              label="Muren stucen"
              subLabel={`${room.metrics.wallArea.toFixed(1)} m²`}
              price={breakdown.wallPlasterCost}
              checked={actions.plasterWalls}
              onChange={(v) => handleUpdate({ plasterWalls: v })}
            />
          </div>
          )}

          {!isToilet && !isBathroom && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-0.5 w-4 bg-slate-50" />
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest shrink-0">Afwerking Plafond</span>
              <div className="h-0.5 flex-1 bg-slate-50" />
            </div>
            <ToggleRow
              label="Plafond verven"
              subLabel={`${room.metrics.ceilingArea.toFixed(1)} m²`}
              price={breakdown.ceilingPaintCost}
              checked={actions.paintCeiling}
              onChange={(v) => handleUpdate({ paintCeiling: v })}
            />
            <ToggleRow
              label="Plafond stucen"
              subLabel={`${room.metrics.ceilingArea.toFixed(1)} m²`}
              price={breakdown.ceilingPlasterCost}
              checked={actions.plasterCeiling}
              onChange={(v) => handleUpdate({ plasterCeiling: v })}
            />
          </div>
          )}
          
          {!isToilet && !isBathroom && (
            <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-50">
               <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vloer Afwerking</span>
                  <span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                    € {Math.round(breakdown.floorCost).toLocaleString('nl-NL')}
                  </span>
               </div>
               <div className="relative group/select">
                  <select 
                    value={manual?.floorType || 'none'} 
                    onChange={(e) => {
                      const val = e.target.value as any;
                      onUpdateAction(room.id, { floorType: val, actions: { ...actions, floorAction: val === 'none' ? 'BEHOUDEN' : 'NIEUW' }});
                    }} 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-5 text-xs font-black text-slate-700 outline-none appearance-none cursor-pointer focus:ring-4 focus:ring-emerald-500/10 transition-all hover:bg-white hover:border-emerald-200"
                  >
                    <option value="none">GEEN RENOVATIE (BEHOUDEN)</option>
                    <option value="pvc">NIEUWE PVC VLOER</option>
                    <option value="laminaat">NIEUW LAMINAAT</option>
                    <option value="hout">NIEUWE HOUTEN VLOER</option>
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-hover/select:text-emerald-500 transition-colors">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const SpecificationView: React.FC<SpecificationViewProps> = ({ floors, costSettings, onUpdateAction, houseMetadata }) => {
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>(
    floors.reduce((acc, f) => ({ ...acc, [f.id]: true }), {})
  );

  const toggleFloor = useCallback((id: string) => {
    setExpandedFloors(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const houseHasKitchen = useMemo(() => 
    floors.some(f => f.rooms?.some(r => r.originalName?.toLowerCase().includes('keuken'))),
  [floors]);

  const { floorCosts, totalProjectCost } = useMemo(() => {
    const globalSubfloor = (houseMetadata.globalSubfloor || 'BETON') as 'BETON' | 'HOUT';
    const costs = floors.map(f => {
      let roomTotal = 0;
      let heatingArea = 0;
      (f.rooms || []).forEach(r => {
        roomTotal += calculateRoomCost(r, costSettings, houseHasKitchen, globalSubfloor);
        if (r.analysis?.find(a => a.source === 'manual')?.actions.underfloorHeating) {
          heatingArea += r.metrics.floorArea;
        }
      });
      const manifoldCost = heatingArea > 0 ? calculateFloorManifoldCost(heatingArea, costSettings) : 0;
      // Per-m wall demolition costs on this floor (startup is shared project-level)
      const wallPerMCost = (f.walls || [])
        .filter(w => !w.isExternal && w.isMarkedForRemoval)
        .reduce((acc, w) => {
          const perM = w.isDragend ? costSettings.wallDragendPerM : costSettings.wallNietDragendPerM;
          return acc + perM * w.length;
        }, 0);
      return { id: f.id, total: roomTotal + manifoldCost + wallPerMCost };
    });
    return {
      floorCosts: costs,
      totalProjectCost: calculateTotalProjectCost(floors, costSettings, houseMetadata),
    };
  }, [floors, costSettings, houseHasKitchen, houseMetadata]);

  const handleDownloadClick = () => {
    generatePDFReport(floors, costSettings, houseMetadata, houseHasKitchen, floorCosts, totalProjectCost);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-12 pb-24 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-10 mt-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-slate-200/50 animate-in fade-in slide-in-from-top-4 duration-500 gap-6">
           <div className="flex flex-col text-center md:text-left">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Volledige Calculatie</span>
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Specificaties</h2>
              <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">
                Totaal project: <span className="text-slate-900">€ {Math.round(totalProjectCost).toLocaleString('nl-NL')}</span>
              </p>
           </div>
           <button 
              onClick={handleDownloadClick}
              className="flex items-center gap-3 bg-slate-900 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black hover:scale-105 transition-all active:scale-95 shadow-2xl shadow-slate-900/20"
           >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Download PDF Rapport
           </button>
        </div>

        <div className="space-y-6">
          {floors.map((floor) => {
            const isExpanded = expandedFloors[floor.id];
            const floorCost = floorCosts.find(c => c.id === floor.id)?.total || 0;

            return (
              <div key={floor.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden transition-all duration-500 hover:shadow-lg">
                <button 
                  onClick={() => toggleFloor(floor.id)}
                  className="w-full px-10 py-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-8">
                    <div className="bg-emerald-600 w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{floor.name}</h2>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{(floor.rooms || []).length} Ruimtes geanalyseerd</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-10">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Verdieping Totaal</span>
                      <span className="text-xl font-black text-slate-900 tracking-tighter leading-none">€ {Math.round(floorCost).toLocaleString('nl-NL')}</span>
                    </div>
                    <div className={`text-slate-300 transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-10 pb-10 space-y-4 animate-in slide-in-from-top-4 duration-500">
                    <div className="bg-slate-50/30 rounded-[2rem] p-2">
                      {(floor.rooms || []).map((room) => (
                        <RoomSpecSection
                          key={room.id}
                          room={room}
                          costSettings={costSettings}
                          houseHasKitchen={houseHasKitchen}
                          onUpdateAction={onUpdateAction}
                        />
                      ))}
                    </div>

                    {/* Wall demolition entries for this floor */}
                    {(floor.walls || []).filter(w => !w.isExternal && w.isMarkedForRemoval).length > 0 && (
                      <div className="bg-red-50/30 rounded-[2rem] border border-red-100 p-4 space-y-1">
                        <div className="flex items-center gap-2 mb-1 px-2">
                          <div className="h-0.5 w-4 bg-red-100" />
                          <span className="text-[9px] font-black text-red-400 uppercase tracking-widest shrink-0">Muur Sloop</span>
                          <div className="h-0.5 flex-1 bg-red-100" />
                        </div>
                        {(floor.walls || [])
                          .filter(w => !w.isExternal && w.isMarkedForRemoval)
                          .map((wall) => {
                            const perM = wall.isDragend ? costSettings.wallDragendPerM : costSettings.wallNietDragendPerM;
                            const perMCost = perM * wall.length;
                            return (
                              <div key={wall.id} className="flex justify-between items-center p-3 rounded-xl bg-white/60 border border-red-100">
                                <div className="flex items-center gap-3">
                                  <div className="w-5 h-5 rounded-md bg-red-100 border border-red-200 flex items-center justify-center">
                                    <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-slate-700 leading-none">
                                      Binnenmuur {wall.thickness ? `${wall.thickness} cm` : ''}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{wall.length.toFixed(2)} m¹</span>
                                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                        wall.isDragend ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                                      }`}>
                                        {wall.isDragend ? 'Dragend' : 'Niet-dragend'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <span className="text-sm font-bold text-slate-900">
                                  € {Math.round(perMCost).toLocaleString('nl-NL')}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SpecificationView;
