
import React, { useState, useEffect } from 'react';

export type SectionStatus = 'NONE' | 'WARNING' | 'OK' | 'UNKNOWN';

interface RenovationSectionProps {
  title: string;
  status: SectionStatus;
  totalCost: number;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  badge?: string;
}

const RenovationSection: React.FC<RenovationSectionProps> = ({ 
  title, 
  status,
  totalCost, 
  defaultOpen = false, 
  children,
  badge
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (status === 'WARNING') setIsOpen(true);
  }, [status]);

  let statusIcon = null;
  if (status === 'WARNING') {
    statusIcon = <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" />;
  } else if (status === 'OK') {
    statusIcon = <div className="w-2 h-2 rounded-full bg-emerald-500" />;
  } else if (status === 'UNKNOWN') {
    statusIcon = <div className="w-2 h-2 rounded-full bg-slate-300" />;
  }

  return (
    <div className="border border-gray-100 rounded-2xl bg-white shadow-sm overflow-hidden mb-3 transition-all hover:shadow-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
           {statusIcon}
           <div>
              <h3 className="text-sm font-bold text-gray-800 tracking-tight leading-none">{title}</h3>
              {badge && <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1 block">{badge}</span>}
           </div>
        </div>

        <div className="flex items-center gap-3">
           <span className={`text-xs font-black px-2 py-1 rounded-lg tabular-nums transition-all duration-200 min-w-[72px] text-right ${totalCost > 0 ? 'text-gray-900 bg-gray-100' : 'opacity-0 pointer-events-none'}`}>
             € {Math.round(totalCost).toLocaleString('nl-NL')}
           </span>
           <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/>
           </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-50 px-2 py-3 bg-white space-y-0.5 animate-in slide-in-from-top-2 duration-300">
           {children}
        </div>
      )}
    </div>
  );
};

export default RenovationSection;
