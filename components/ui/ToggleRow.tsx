
import React from 'react';

interface ToggleRowProps {
  label: string;
  price: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  subLabel?: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, price, checked, onChange, subLabel }) => {
  return (
    <label className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group">
       <div className="flex items-center gap-3">
          <input 
            type="checkbox" 
            className="sr-only" 
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          {/* Checkbox Design */}
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${checked ? 'bg-emerald-600 border-emerald-600 shadow-sm' : 'border-gray-300 bg-white group-hover:border-emerald-400'}`}>
             {checked && (
               <svg className="w-3 h-3 text-white animate-in zoom-in duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7"/>
               </svg>
             )}
          </div>
          <div>
             <div className="text-sm font-bold text-gray-700 leading-none group-hover:text-gray-900 transition-colors">{label}</div>
             {subLabel && <div className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{subLabel}</div>}
          </div>
       </div>
       <div className={`text-sm font-bold transition-colors ${price > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
          {price > 0 ? `€ ${Math.round(price).toLocaleString('nl-NL')}` : '€ 0'}
       </div>
    </label>
  );
};

export default ToggleRow;
