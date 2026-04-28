
import React from 'react';
import { Wall, CostSettings } from '../../types';
import { getWallDemolitionBreakdown } from '../../utils/costEngine';

interface WallDetailPanelProps {
  wall: Wall;
  floorId: string;
  costSettings: CostSettings;
  yearBuilt?: string;
  onUpdate: (floorId: string, wallId: string, updates: Partial<Wall>) => void;
}

const fmt = (n: number) =>
  `€ ${Math.round(n).toLocaleString('nl-NL')}`;

const WallDetailPanel: React.FC<WallDetailPanelProps> = ({
  wall, floorId, costSettings, yearBuilt, onUpdate,
}) => {
  const { startupCost, perMCost } = getWallDemolitionBreakdown(wall, costSettings);

  const toggleDragend = () =>
    onUpdate(floorId, wall.id, { isDragend: !wall.isDragend });

  const toggleRemoval = () =>
    onUpdate(floorId, wall.id, { isMarkedForRemoval: !wall.isMarkedForRemoval });

  const isPreWar = yearBuilt ? parseInt(yearBuilt, 10) < 1945 : false;
  const ratePerM = wall.isDragend ? costSettings.wallDragendPerM : costSettings.wallNietDragendPerM;

  return (
    <div className="w-72 lg:w-96 h-full flex flex-col bg-white border-l border-gray-100 shadow-sm z-20 overflow-hidden">
      {/* Header */}
      <div className="bg-white px-8 pt-10 pb-6 shrink-0 border-b border-gray-50">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Geselecteerde Muur
        </span>
        <h2 className="text-2xl font-black text-slate-900 leading-tight mt-1 uppercase tracking-tighter">
          Binnenmuur
        </h2>
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-600">
            {wall.length.toFixed(2)} m¹
          </div>
          {wall.thickness && (
            <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-600">
              {wall.thickness} cm
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar">

        {/* CONSTRUCTIE */}
        <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">
            Constructie
          </span>
          {isPreWar && (
            <span className="block text-[10px] font-bold text-slate-500 mb-3">
              Gebouwd voor 1945 — aanname: alle muren standaard dragend
            </span>
          )}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => !wall.isDragend && toggleDragend()}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                wall.isDragend
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}
            >
              Dragend
            </button>
            <button
              type="button"
              onClick={() => wall.isDragend && toggleDragend()}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                !wall.isDragend
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}
            >
              Niet-dragend
            </button>
          </div>
          <p className={`text-[10px] font-bold leading-relaxed px-3 py-2 rounded-xl ${
            wall.isDragend ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
          }`}>
            {wall.isDragend
              ? 'Draagt de constructie. Vereist bouwkundige berekening, vergunning en staalconstructie.'
              : 'Niet-constructief. Kan relatief eenvoudig gesloopt worden.'}
          </p>
        </div>

        {/* SLOPEN toggle + kosten */}
        <div className={`rounded-[1.5rem] border p-5 transition-colors duration-300 ${
          wall.isMarkedForRemoval ? 'border-red-200 bg-red-50/30' : 'border-slate-100 bg-slate-50/50'
        }`}>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={toggleRemoval}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full border flex items-center justify-center shadow-sm transition-colors ${
                wall.isMarkedForRemoval
                  ? 'bg-red-100 border-red-200 text-red-600'
                  : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-tight">Muur Slopen</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleRemoval(); }}
              className={`relative w-10 h-6 rounded-full transition-colors duration-300 outline-none focus:ring-4 focus:ring-red-500/10 ${
                wall.isMarkedForRemoval ? 'bg-red-500' : 'bg-slate-200'
              }`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                wall.isMarkedForRemoval ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {wall.isMarkedForRemoval && (
            <div className="mt-4 pt-4 border-t border-red-100 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* Sloopkosten per m¹ */}
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-black text-slate-700">Sloopkosten</span>
                  <span className="block text-[10px] text-slate-400 font-bold">
                    {wall.length.toFixed(2)} m¹ × {fmt(ratePerM)}/m¹
                  </span>
                </div>
                <span className="text-sm font-black text-red-600">{fmt(perMCost)}</span>
              </div>

              {/* Opstartkosten */}
              <div className="flex justify-between items-start pt-1">
                <div>
                  <span className="text-xs font-black text-slate-500">Opstartkosten</span>
                  <span className="block text-[10px] text-slate-400 font-bold">
                    {wall.isDragend
                      ? 'Berekening, vergunning, stempels'
                      : 'Container, afdekken, transport'
                    } · éénmalig per type
                  </span>
                </div>
                <span className="text-sm font-black text-slate-400">{fmt(startupCost)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WallDetailPanel;
