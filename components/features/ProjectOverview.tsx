
import React, { useMemo } from 'react';
import { Floor, HouseMetadata, CostSettings } from '../../types';
import { getOnvoorzienPct } from '../../utils/costEngine';
import StatCard from '../ui/StatCard';
import EditableText from '../ui/EditableText';

interface ProjectOverviewProps {
  houseMetadata: HouseMetadata;
  floors: Floor[];
  totalProjectCost: number;
  costSettings: CostSettings;
  onUpdateMetadata?: (updates: Partial<HouseMetadata>) => void;
  onQuoteOpen?: () => void;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  houseMetadata,
  floors,
  totalProjectCost,
  costSettings,
  onUpdateMetadata,
  onQuoteOpen
}) => {
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

  // Onvoorzien berekening
  const onvoorzienPct = getOnvoorzienPct(houseMetadata.yearBuilt, costSettings);
  const baseCost = totalProjectCost / (1 + onvoorzienPct / 100);
  const onvoorzienAmount = totalProjectCost - baseCost;

  return (
    <div className="w-72 lg:w-96 h-full flex flex-col bg-white border-l border-gray-100 shadow-sm overflow-y-auto custom-scrollbar">
      <div className="p-8 space-y-8">
         <div className="space-y-1">
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project</span>
            </div>
            <EditableText
              value={houseMetadata.name || "Nieuw Project"}
              onSave={(val) => onUpdateMetadata?.({ name: val })}
              className="text-lg font-black text-slate-800 tracking-tighter uppercase w-full"
            />
         </div>
         <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter leading-tight uppercase">
              <EditableText
                value={houseMetadata.address || "Adres opgeven"}
                onSave={(val) => onUpdateMetadata?.({ address: val })}
                className="w-full"
              />
            </h2>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-widest">
              {houseMetadata.postcode} {houseMetadata.city}
            </div>
         </div>

         <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block leading-none">Vraagprijs</span>
                <span className="text-base font-black text-slate-900 tracking-tighter leading-none whitespace-nowrap overflow-hidden text-ellipsis block">{houseMetadata.askingPrice || 'N/A'}</span>
            </div>
            <div className="p-4 bg-emerald-600 border border-emerald-500 rounded-3xl shadow-lg shadow-emerald-600/20">
                <span className="text-[10px] font-black text-emerald-100/60 uppercase tracking-widest mb-2 block leading-none">Raming</span>
                <span className="text-sm font-black text-white tracking-tighter leading-tight tabular-nums block">
                  {totalProjectCost > 0
                    ? `€${Math.round(totalProjectCost * (1 - (costSettings.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – €${Math.round(totalProjectCost * (1 + (costSettings.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}`
                    : '€0'}
                </span>
            </div>
         </div>

         {/* Kostenraming uitsplitsing */}
         {totalProjectCost > 0 && (
           <div className="space-y-3">
             <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
               <div className="w-1 h-3 bg-emerald-500 rounded-full" />
               Kostenraming
             </h3>
             <div className="bg-slate-50 rounded-2xl px-5 py-4 space-y-2.5">
               <div className="flex justify-between items-center">
                 <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Subtotaal</span>
                 <span className="text-[13px] font-black text-slate-700 tabular-nums">€{Math.round(baseCost).toLocaleString('nl-NL')}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Onvoorzien ({onvoorzienPct}%)</span>
                 <span className="text-[13px] font-black text-slate-700 tabular-nums">+€{Math.round(onvoorzienAmount).toLocaleString('nl-NL')}</span>
               </div>
               <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center">
                 <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Bandbreedte</span>
                 <span className="text-[13px] font-black text-emerald-600 tabular-nums">
                   €{Math.round(totalProjectCost * (1 - (costSettings.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – €{Math.round(totalProjectCost * (1 + (costSettings.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}
                 </span>
               </div>
             </div>
           </div>
         )}

         {/* CTA VOOR OFFERTE */}
         <button
           id="tour-quote-btn"
           onClick={onQuoteOpen}
           className="w-full group relative flex items-center justify-between bg-slate-900 p-1 rounded-[2rem] overflow-hidden transition-all hover:scale-[1.02] active:scale-95 shadow-2xl shadow-slate-900/20"
         >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-4 pl-8 py-5">
               <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
               </div>
               <div className="text-left">
                  <span className="block text-[11px] font-black text-white uppercase tracking-widest">Vraag Offerte aan</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Vergelijk 3 aannemers</span>
               </div>
            </div>
            <div className="pr-8 text-white/30 group-hover:text-emerald-400 transition-colors">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </div>
         </button>

         <div className="space-y-6 pt-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
               <div className="w-1 h-3 bg-emerald-500 rounded-full" />
               Huisgegevens
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <StatCard label="Oppervlakte" value={`${Math.round(houseStats.totalArea)} m²`} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>} />
                <StatCard label="Lagen" value={String(houseStats.numVerdiepingen)} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>} />
                <StatCard label="Kamers" value={String(houseStats.numSlaapkamers)} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>} />
                <StatCard label="Sanitair" value={String(houseStats.numBadkamers)} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9"/></svg>} />
            </div>
         </div>
      </div>
    </div>
  );
};

export default ProjectOverview;
