
import React from 'react';
import { AdviceItem } from '../../utils/aiLogic';

interface StatusRowProps {
  label: string;
  aiAdvice: AdviceItem | undefined;
  price: number;
  checked: boolean;
  onChange: () => void;
  subText?: string;
}

const StatusRow: React.FC<StatusRowProps> = ({ 
  label, 
  aiAdvice, 
  price, 
  checked, 
  onChange,
  subText
}) => {
  const needsAction = (aiAdvice?.status === 'JA' || aiAdvice?.status === 'MISSCHIEN') && !checked;
  const isResolved = checked || aiAdvice?.status === 'NEE';
  const isUnknown = !aiAdvice;

  return (
    <div 
      className="group relative flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer select-none" 
      onClick={(e) => { e.stopPropagation(); onChange(); }}
    >
       <div className="flex items-center gap-3.5">
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 ${checked ? 'bg-emerald-600 border-emerald-600 shadow-sm' : 'border-slate-200 bg-white group-hover:border-slate-300'}`}>
             {checked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>}
          </div>
          <div className="flex flex-col">
             <div className={`text-sm font-semibold transition-colors ${checked ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{label}</div>
             {subText && <div className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1">{subText}</div>}
          </div>
       </div>
       <div className="flex items-center gap-3">
          <div className="text-right">
             {price > 0 ? (
                <div className="text-xs font-black text-slate-900">€ {Math.round(price).toLocaleString('nl-NL')}</div>
             ) : (
                <div className="text-[10px] font-bold text-slate-300">€ 0</div>
             )}
          </div>
          <div className="flex items-center justify-center w-6">
            {needsAction ? (
              <div title="AI raadt actie aan" className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            ) : isResolved ? (
              <div title="In orde" className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-40 group-hover:opacity-100 transition-opacity" />
            ) : isUnknown ? (
              <div title="Geen AI data beschikbaar" className="w-1.5 h-1.5 rounded-full bg-slate-200" />
            ) : null}
          </div>
       </div>
    </div>
  );
};

export default StatusRow;
