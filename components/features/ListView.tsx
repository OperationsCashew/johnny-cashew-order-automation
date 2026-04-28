import React, { useMemo, useState } from 'react';
import { Floor, CostSettings, HouseMetadata } from '../../types';
import { calculateRoomCost, getOnvoorzienPct } from '../../utils/costEngine';

interface ListViewProps {
  floors: Floor[];
  costSettings: CostSettings;
  houseMetadata: HouseMetadata;
  totalProjectCost: number;
  selectedRoomId: string | null;
  onRoomClick: (roomId: string) => void;
}

const ListView: React.FC<ListViewProps> = ({ floors, costSettings, houseMetadata, totalProjectCost, selectedRoomId, onRoomClick }) => {
  // All floors start collapsed; clicking the header expands/collapses the floor's rooms
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(() => new Set(floors.map(f => f.id)));

  const houseHasKitchen = useMemo(() =>
    floors.some(f => f.rooms?.some(r => r.originalName?.toLowerCase().includes('keuken'))),
  [floors]);

  const onvoorzienPct = getOnvoorzienPct(houseMetadata.yearBuilt, costSettings);
  const subtotal = Math.round(totalProjectCost / (1 + onvoorzienPct / 100));
  const onvoorzienAmount = Math.round(totalProjectCost) - subtotal;

  const yearLabel = (() => {
    if (!houseMetadata.yearBuilt) return 'Bouwjaar onbekend';
    const y = parseInt(houseMetadata.yearBuilt, 10);
    if (y > 2010) return `Na 2010 (nieuwbouw)`;
    if (y >= 1945) return `${houseMetadata.yearBuilt} (1945–2010)`;
    return `${houseMetadata.yearBuilt} (voor 1945)`;
  })();

  const toggleFloor = (floorId: string) => {
    setCollapsedFloors(prev => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-12 pb-20 custom-scrollbar animate-in fade-in duration-500">
      <div className="max-w-4xl mx-auto space-y-8">
        {floors.map((floor) => {
          const floorTotalCost = floor.rooms.reduce((sum, room) =>
            sum + calculateRoomCost(room, costSettings, houseHasKitchen), 0
          );
          const isCollapsed = collapsedFloors.has(floor.id);

          return (
            <div key={floor.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Verdieping header — klik = kamers in/uitklappen */}
              <button
                onClick={() => toggleFloor(floor.id)}
                className="w-full px-8 py-6 bg-gray-50/50 border-b flex justify-between items-center text-left transition-colors hover:bg-gray-100/50 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">{floor.name}</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{floor.rooms.length} ruimtes</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest block leading-none mb-1">Verdieping Totaal</span>
                    <span className="text-lg font-black text-emerald-700 tracking-tighter">€ {Math.round(floorTotalCost).toLocaleString('nl-NL')}</span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </button>

              {/* Kamers — verborgen als verdieping ingeklapt */}
              {!isCollapsed && (
                <div className="divide-y divide-gray-50 animate-in fade-in slide-in-from-top-1 duration-200">
                  {floor.rooms.map((room) => {
                    const roomCost = calculateRoomCost(room, costSettings, houseHasKitchen);
                    const isSelected = selectedRoomId === room.id;

                    return (
                      <button
                        key={room.id}
                        onClick={() => onRoomClick(room.id)}
                        className={`w-full px-8 py-5 flex items-center justify-between text-left transition-all duration-300 group ${isSelected ? 'bg-emerald-50' : 'hover:bg-gray-50/80'}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isSelected ? 'bg-emerald-500 scale-125' : 'bg-gray-200 group-hover:bg-emerald-300'}`} />
                          <div>
                            <h3 className={`text-sm font-black uppercase tracking-tight transition-colors ${isSelected ? 'text-emerald-700' : 'text-gray-800'}`}>{room.name}</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{room.metrics.floorArea.toFixed(1)} m²</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <span className={`text-sm font-black tracking-tight transition-colors ${isSelected ? 'text-emerald-600' : 'text-gray-900'}`}>
                              € {Math.round(roomCost).toLocaleString('nl-NL')}
                            </span>
                          </div>
                          <svg className={`w-4 h-4 transition-transform duration-300 ${isSelected ? 'text-emerald-400 translate-x-1' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/>
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── KOSTENSAMENVATTING ── */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-tighter">Kostensamenvatting</h2>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="flex items-center justify-between px-8 py-4">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-tight">Subtotaal</span>
              <span className="text-sm font-black text-gray-800">€ {subtotal.toLocaleString('nl-NL')}</span>
            </div>
            <div className="flex items-center justify-between px-8 py-4">
              <div>
                <span className="text-sm font-medium text-gray-500 uppercase tracking-tight">
                  Onvoorziene kosten ({onvoorzienPct}%)
                </span>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">
                  {yearLabel}
                </p>
              </div>
              <span className="text-sm font-black text-gray-800">+ € {onvoorzienAmount.toLocaleString('nl-NL')}</span>
            </div>
            <div className="flex items-center justify-between px-8 py-5 border-t-2 border-gray-100">
              <div>
                <span className="text-base font-black text-gray-900 uppercase tracking-tight">Totaal Project</span>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">Indicatieve raming</p>
              </div>
              <span className="text-xl font-black text-emerald-600 tracking-tighter tabular-nums">
                € {Math.round(totalProjectCost * (1 - (costSettings.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – € {Math.round(totalProjectCost * (1 + (costSettings.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ListView;
