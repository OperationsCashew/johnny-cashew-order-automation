
import React from 'react';

type QualityTier = 'BUDGET' | 'BASIS' | 'LUXE';

interface SanitaryCardProps {
  label: string;
  cost: number;
  isActive: boolean;
  quality: QualityTier;
  onToggle: (active: boolean) => void;
  onChangeQuality: (quality: QualityTier) => void;
}

const SanitaryCard: React.FC<SanitaryCardProps> = ({ label, cost, isActive, quality, onToggle, onChangeQuality }) => {
  const isBathroom = label.toLowerCase().includes('badkamer');
  const isKitchen = label.toLowerCase().includes('keuken');

  return (
    <div 
      className={`border rounded-2xl p-4 shadow-sm transition-all duration-300 ${
        isActive ? 'border-emerald-200 bg-emerald-50/20 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
    >
      <div 
        className="flex justify-between items-center mb-3 cursor-pointer"
        onClick={() => onToggle(!isActive)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center shadow-sm transition-colors ${isActive ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
            {isBathroom ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9"/></svg>
            ) : isKitchen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3h18v18H3zM9 9h6v6H9z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            )}
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">{label} Renovatie</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
              {isActive ? 'Geselecteerd' : 'Niet geselecteerd'}
            </p>
          </div>
        </div>

        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(!isActive); }}
          className={`relative w-10 h-6 rounded-full transition-colors duration-300 outline-none focus:ring-4 focus:ring-emerald-500/10 ${isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className={`pt-1 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
          {(['BUDGET', 'BASIS', 'LUXE'] as QualityTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChangeQuality(tier); }}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                quality === tier ? 'bg-white text-slate-900 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SanitaryCard;
