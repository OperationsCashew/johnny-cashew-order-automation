
import React from 'react';

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value }) => {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-3">
      {icon && <div className="text-emerald-500 mt-0.5 shrink-0">{icon}</div>}
      <div className="flex flex-col min-w-0">
        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 truncate">{label}</span>
        <span className="text-lg font-black text-gray-900 tracking-tight leading-none">{value}</span>
      </div>
    </div>
  );
};

export default StatCard;
