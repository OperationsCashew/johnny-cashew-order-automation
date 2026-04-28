
import React, { useRef, useState, useEffect } from 'react';

interface HeaderProps {
  address?: string;
  isPhotoAnalysisDone: boolean;
  isAnalyzing: boolean;
  fmlStatus: 'idle' | 'loading' | 'success' | 'error';
  rawFml: string | null;
  viewMode: '3d' | 'list';
  totalProjectCost: number;
  rangeMin: number;
  rangeMax: number;
  currentProjectId: string | null;
  hasFloors: boolean;
  onGalleryOpen: () => void;
  onSettingsOpen: () => void;
  onFundaOpen: () => void;
  onSave: () => void;
  onDownloadPdf: () => void;
  onMyProjectsOpen: () => void;
  onLogout: () => void;
  onViewModeChange: (mode: '3d' | 'list') => void;
  onFmlUpload: (content: string) => void;
  onDownloadFml: () => void;
  user: any;
}

const HeaderAction = ({ label, icon, color, onClick, disabled, isActive, id }: { label: string, icon: React.ReactNode, color: 'green' | 'orange' | 'gray', onClick: () => void, disabled?: boolean, isActive?: boolean, id?: string }) => {
  const themes = {
    green: isActive ? "bg-emerald-600 border-emerald-600 text-white" : "bg-[#E9FAF3] border-[#C5F1E1] text-[#00825A] hover:bg-[#D4F7EA]",
    orange: "bg-[#FFF4E5] border-[#FFE4CC] text-[#FF9533] hover:bg-[#FFEBD6] animate-pulse",
    gray: isActive ? "bg-[#0F172A] border-[#0F172A] text-white" : "bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] hover:border-[#CBD5E1]"
  };

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center p-1.5 lg:p-2 rounded-xl lg:rounded-[14px] w-9 h-9 lg:w-[52px] lg:h-[52px] border transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm ${themes[color]}`}
      title={label}
    >
      {icon}
    </button>
  );
};

const Header: React.FC<HeaderProps> = (props) => {
  const [showFmlMenu, setShowFmlMenu] = useState(false);
  const fmlButtonRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fmlButtonRef.current && !fmlButtonRef.current.contains(event.target as Node)) {
        setShowFmlMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFMLUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => props.onFmlUpload(e.target?.result as string);
    reader.readAsText(file);
    event.target.value = '';
    setShowFmlMenu(false);
  };

  const handleFmlButtonClick = () => {
    if (props.fmlStatus === 'success') setShowFmlMenu(!showFmlMenu);
    else fileInputRef.current?.click();
  };

  return (
    <header className="relative bg-white px-3 py-2 lg:px-10 lg:py-5 flex items-center justify-between shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] z-30 sticky top-0 border-b border-gray-100">
      <input type="file" ref={fileInputRef} className="hidden" accept=".fml,.json" onChange={handleFMLUploadChange} />

      {/* LEFT CLUSTER: Input & Config */}
      <div className="flex items-center gap-1 lg:gap-3 flex-1">
        <h1 className="text-base lg:text-xl font-black text-[#0F172A] uppercase tracking-tighter mr-2 lg:mr-6 cursor-default select-none">
          VerbouwScan
        </h1>

        <HeaderAction
          id="tour-photo-btn"
          label="Foto Analyse"
          color={props.isAnalyzing ? 'orange' : (props.isPhotoAnalysisDone ? 'green' : 'gray')}
          onClick={props.onGalleryOpen}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />

        <div id="tour-fml-btn" ref={fmlButtonRef} className="relative">
          <button
            onClick={handleFmlButtonClick}
            className={`flex items-center justify-center w-9 h-9 lg:w-[52px] lg:h-[52px] rounded-xl lg:rounded-[14px] border transition-all duration-200 active:scale-95 shadow-sm ${props.fmlStatus === 'loading' ? 'bg-[#FFF4E5] border-[#FFE4CC] text-[#FF9533] animate-pulse' : props.fmlStatus === 'success' ? 'bg-[#E9FAF3] border-[#C5F1E1] text-[#00825A]' : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'}`}
            title="Plattegrond Menu"
          >
            <svg className="w-4 h-4 lg:w-6 lg:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

          {showFmlMenu && props.fmlStatus === 'success' && (
            <div className="absolute top-full left-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-1.5 flex flex-col gap-1">
                <button onClick={() => { fileInputRef.current?.click(); setShowFmlMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-xl transition-colors group">
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nieuwe FML</span>
                </button>
                <button onClick={() => { props.onDownloadFml(); setShowFmlMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-xl transition-colors group border-t border-slate-50">
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Export FML</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <HeaderAction
          id="tour-settings"
          label="Instellingen"
          color="gray"
          onClick={props.onSettingsOpen} 
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} 
        />
      </div>

      {/* CENTER CLUSTER: absolute centered so badge growth never shifts the toggle */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 lg:gap-6">
        <div id="tour-viewmode" className="flex bg-[#F1F5F9] p-1 rounded-[14px] lg:rounded-[18px] border border-[#E2E8F0]">
          <button
            onClick={() => props.onViewModeChange('3d')}
            className={`p-2 lg:p-3 rounded-xl lg:rounded-[14px] transition-all duration-300 ${props.viewMode === '3d' ? 'bg-white text-[#10B981] shadow-sm' : 'text-[#94A3B8] hover:text-[#64748B]'}`}
            title="3D Overzicht"
          >
            <svg className="w-4 h-4 lg:w-[22px] lg:h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          </button>
          <button
            onClick={() => props.onViewModeChange('list')}
            className={`p-2 lg:p-3 rounded-xl lg:rounded-[14px] transition-all duration-300 ${props.viewMode === 'list' ? 'bg-white text-[#10B981] shadow-sm' : 'text-[#94A3B8] hover:text-[#64748B]'}`}
            title="Lijst Weergave"
          >
            <svg className="w-4 h-4 lg:w-[22px] lg:h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>

        <div id="tour-cost-badge" className="flex flex-col items-center justify-center bg-[#10B981] h-9 lg:h-auto px-4 lg:px-8 py-2 lg:py-3 rounded-[20px] lg:rounded-[26px] shadow-[0_10px_20px_-5px_rgba(16,185,129,0.3)] border border-[#10B981]/20">
          <span className="hidden lg:block text-[9px] font-black text-white/80 uppercase tracking-[0.15em] leading-none mb-1">Indicatieve Raming</span>
          <span className="text-xs lg:text-base font-black text-white tracking-tighter leading-none tabular-nums">
            {props.totalProjectCost > 0
              ? `€ ${Math.round(props.totalProjectCost * (1 - (props.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – € ${Math.round(props.totalProjectCost * (1 + (props.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}`
              : '€ 0'}
          </span>
        </div>
      </div>

      {/* RIGHT CLUSTER: Actions & Projects */}
      <div className="flex items-center gap-1 lg:gap-3 flex-1 justify-end">
        <HeaderAction 
          label="Nieuw Project" 
          color="gray" 
          onClick={props.onFundaOpen} 
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>} 
        />
        
        {/* PDF Download: Level/Doc icon */}
        <HeaderAction
          id="tour-pdf-btn"
          label="Download PDF"
          color="gray"
          disabled={!props.hasFloors}
          onClick={props.onDownloadPdf} 
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} 
        />

        {/* Save/Saven: Document with arrow down */}
        <HeaderAction 
          label={props.currentProjectId ? 'Opslaan' : 'Saven'} 
          color={props.currentProjectId ? 'green' : 'gray'} 
          disabled={!props.rawFml}
          onClick={props.onSave} 
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>} 
        />
        
        {/* Laden/Projects: Folder icon */}
        <HeaderAction 
          label="Projecten Laden" 
          color="gray" 
          onClick={props.onMyProjectsOpen} 
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>} 
        />

        {props.user && (
          <>
            <div className="w-[1px] h-8 bg-slate-200 mx-2" />
            <HeaderAction 
              label="Uitloggen" 
              color="gray" 
              onClick={props.onLogout} 
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>} 
            />
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
