
import React, { useState } from 'react';
import { CostSettings } from '../../types';
import { DEFAULT_COSTS } from '../../utils/constants';
import { settingsService, isAdminEmail } from '../../services/settingsService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CostSettings;
  onUpdate: (newSettings: CostSettings) => void;
  user?: any;
  onLoginRequest?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdate, user, onLoginRequest }) => {
  const [cloudStatus, setCloudStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);

  const isAdmin = isAdminEmail(user?.email);

  if (!isOpen) return null;

  const handleChange = (key: keyof CostSettings, value: number) => {
    onUpdate({ ...settings, [key]: value });
  };

  const handleReset = () => {
    if (window.confirm('Alle instellingen terugzetten naar de standaardwaarden?')) {
      onUpdate({ ...DEFAULT_COSTS });
    }
  };

  const showStatus = (type: 'success' | 'error', message: string) => {
    setCloudStatus({ type, message });
    setTimeout(() => setCloudStatus(null), type === 'success' ? 3000 : 6000);
  };

  const handleSaveToCloud = async () => {
    if (!user) { onLoginRequest?.(); return; }
    setIsSaving(true);
    try {
      await settingsService.save(settings);
      showStatus('success', 'Instellingen opgeslagen in cloud ✓');
    } catch (err: any) {
      showStatus('error', `Opslaan mislukt: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFromCloud = async () => {
    if (!user) { onLoginRequest?.(); return; }
    setIsLoading(true);
    try {
      const saved = await settingsService.load();
      if (saved) {
        onUpdate({ ...DEFAULT_COSTS, ...saved });
        showStatus('success', 'Instellingen geladen uit cloud ✓');
      } else {
        showStatus('error', 'Geen opgeslagen instellingen gevonden.');
      }
    } catch (err: any) {
      showStatus('error', `Laden mislukt: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAsGlobalDefault = async () => {
    if (!window.confirm('Dit overschrijft de standaardwaarden voor ALLE nieuwe gebruikers van VerbouwScan. Doorgaan?')) return;
    setIsSavingGlobal(true);
    try {
      await settingsService.saveGlobalDefaults(settings);
      showStatus('success', '✓ Globale standaard bijgewerkt — alle nieuwe gebruikers krijgen deze waarden');
    } catch (err: any) {
      showStatus('error', `Opslaan mislukt: ${err.message}`);
    } finally {
      setIsSavingGlobal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 md:p-8">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Instellingen</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Beheer eenheidsprijzen voor calculaties</p>
          </div>
          <button onClick={onClose} className="bg-white p-3 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-900 transition-all font-black text-xs uppercase shadow-sm active:scale-95">Sluiten</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-10 space-y-12 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-12">

            {/* Verduurzaming - Materialen */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-2">Materialen Ramen</h3>
              <div className="space-y-4">
                <CostInput label="Glas (HR++)" unit="m²" value={settings.glassMaterial} onChange={(v) => handleChange('glassMaterial', v)} />
                <CostInput label="Kozijn (Kunststof)" unit="m²" value={settings.kozijnKunststofMaterial} onChange={(v) => handleChange('kozijnKunststofMaterial', v)} />
                <CostInput label="Kozijn (Hout)" unit="m²" value={settings.kozijnHoutMaterial} onChange={(v) => handleChange('kozijnHoutMaterial', v)} />
                <CostInput label="Kozijn (Alu)" unit="m²" value={settings.kozijnAluMaterial} onChange={(v) => handleChange('kozijnAluMaterial', v)} />
                <CostInput label="Triple Toeslag" unit="m²" value={settings.tripleGlassSurcharge} onChange={(v) => handleChange('tripleGlassSurcharge', v)} />
              </div>
            </div>

            {/* Verduurzaming - Arbeid */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-2">Montage & Logistiek</h3>
              <div className="space-y-4">
                <CostInput label="Arbeid: Alleen glas" unit="m²" value={settings.laborGlassOnly} onChange={(v) => handleChange('laborGlassOnly', v)} />
                <CostInput label="Arbeid: Volledig kozijn" unit="m²" value={settings.laborFullFrame} onChange={(v) => handleChange('laborFullFrame', v)} />
                <CostInput label="Opstartkosten" unit="proj" value={settings.windowStartupCost} onChange={(v) => handleChange('windowStartupCost', v)} />
                <CostInput label="Binnenafwerking" unit="raam" value={settings.windowFinishingCost} onChange={(v) => handleChange('windowFinishingCost', v)} />
                <CostInput label="Afvalcontainer" unit="proj" value={settings.wasteContainerCost} onChange={(v) => handleChange('wasteContainerCost', v)} />
              </div>
            </div>

            {/* Verduurzaming - Schuifpui & Hoogte */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-2">Schuifpui & Hoogte</h3>
              <div className="space-y-4">
                <CostInput label="Schuifpui Kunststof" unit="m¹" value={settings.slidingMaterialKunststof} onChange={(v) => handleChange('slidingMaterialKunststof', v)} />
                <CostInput label="Schuifpui Hout/Alu" unit="m¹" value={settings.slidingMaterialHoutAlu} onChange={(v) => handleChange('slidingMaterialHoutAlu', v)} />
                <CostInput label="Montage Schuifpui" unit="stk" value={settings.slidingLaborFixed} onChange={(v) => handleChange('slidingLaborFixed', v)} />
                <CostInput label="Basis Steiger" unit="proj" value={settings.scaffoldingBase} onChange={(v) => handleChange('scaffoldingBase', v)} />
                <CostInput label="Hoogte toeslag" unit="etg" value={settings.heightSurcharge} onChange={(v) => handleChange('heightSurcharge', v)} />
              </div>
            </div>

            {/* Vloerverwarming */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2">Vloerverwarming</h3>
              <div className="space-y-4">
                <CostInput label="Basis Installatie" unit="proj" value={settings.heatingBase} onChange={(v) => handleChange('heatingBase', v)} />
                <CostInput label="Prijs per Groep" unit="stk" value={settings.heatingPerGroup} onChange={(v) => handleChange('heatingPerGroup', v)} />
                <CostInput label="Infrezen (Beton)" unit="m²" value={settings.heatingM2Concrete} onChange={(v) => handleChange('heatingM2Concrete', v)} />
                <CostInput label="Droogbouw (Hout)" unit="m²" value={settings.heatingM2Wood} onChange={(v) => handleChange('heatingM2Wood', v)} />
              </div>
            </div>

            {/* Afwerking */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest border-b border-orange-100 pb-2">Wand & Plafond</h3>
              <div className="space-y-4">
                <CostInput label="Schilderen Muren" unit="m²" value={settings.paintWalls} onChange={(v) => handleChange('paintWalls', v)} />
                <CostInput label="Schilderen Plafond" unit="m²" value={settings.paintCeiling} onChange={(v) => handleChange('paintCeiling', v)} />
                <CostInput label="Stucen Muren" unit="m²" value={settings.plasterWalls} onChange={(v) => handleChange('plasterWalls', v)} />
                <CostInput label="Stucen Plafond" unit="m²" value={settings.plasterCeiling} onChange={(v) => handleChange('plasterCeiling', v)} />
              </div>
            </div>

            {/* Vloeren */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest border-b border-orange-100 pb-2">Vloeren</h3>
              <div className="space-y-4">
                <CostInput label="PVC (Standaard)" unit="m²" value={settings.floorPVC} onChange={(v) => handleChange('floorPVC', v)} />
                <CostInput label="PVC (Visgraat)" unit="m²" value={settings.floorPVCVisgraat} onChange={(v) => handleChange('floorPVCVisgraat', v)} />
                <CostInput label="Gietvloer (PU)" unit="m²" value={settings.floorGietvloer} onChange={(v) => handleChange('floorGietvloer', v)} />
                <CostInput label="Lamelparket" unit="m²" value={settings.floorLamelparket} onChange={(v) => handleChange('floorLamelparket', v)} />
                <CostInput label="Sloop & Afvoer" unit="m²" value={settings.floorRemoval} onChange={(v) => handleChange('floorRemoval', v)} />
              </div>
            </div>

            {/* Toilet */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-2">Toilet</h3>
              <div className="space-y-4">
                <CostInput label="Budget" unit="stk" value={settings.toiletBudget} onChange={(v) => handleChange('toiletBudget', v)} />
                <CostInput label="Basis" unit="stk" value={settings.toiletBasis} onChange={(v) => handleChange('toiletBasis', v)} />
                <CostInput label="Luxe" unit="stk" value={settings.toiletLuxe} onChange={(v) => handleChange('toiletLuxe', v)} />
              </div>
            </div>

            {/* Badkamer */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-2">Badkamer</h3>
              <div className="space-y-4">
                <CostInput label="Budget" unit="stk" value={settings.bathBudget} onChange={(v) => handleChange('bathBudget', v)} />
                <CostInput label="Basis" unit="stk" value={settings.bathBasis} onChange={(v) => handleChange('bathBasis', v)} />
                <CostInput label="Luxe" unit="stk" value={settings.bathLuxe} onChange={(v) => handleChange('bathLuxe', v)} />
              </div>
            </div>

            {/* Keuken */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-2">Keuken</h3>
              <div className="space-y-4">
                <CostInput label="Budget" unit="stk" value={settings.kitchenBudget} onChange={(v) => handleChange('kitchenBudget', v)} />
                <CostInput label="Basis" unit="stk" value={settings.kitchenBasis} onChange={(v) => handleChange('kitchenBasis', v)} />
                <CostInput label="Luxe" unit="stk" value={settings.kitchenLuxe} onChange={(v) => handleChange('kitchenLuxe', v)} />
              </div>
            </div>

            {/* Muur Sloop */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-red-600 uppercase tracking-widest border-b border-red-100 pb-2">Muur Sloop</h3>
              <div className="space-y-4">
                <CostInput label="Opstartkosten Niet-dragend" unit="muur" value={settings.wallNietDragendStartup} onChange={(v) => handleChange('wallNietDragendStartup', v)} />
                <CostInput label="Kosten per m¹ Niet-dragend" unit="m¹" value={settings.wallNietDragendPerM} onChange={(v) => handleChange('wallNietDragendPerM', v)} />
                <CostInput label="Opstartkosten Dragend" unit="muur" value={settings.wallDragendStartup} onChange={(v) => handleChange('wallDragendStartup', v)} />
                <CostInput label="Kosten per m¹ Dragend" unit="m¹" value={settings.wallDragendPerM} onChange={(v) => handleChange('wallDragendPerM', v)} />
              </div>
            </div>

            {/* Onvoorzien */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-amber-600 uppercase tracking-widest border-b border-amber-100 pb-2">Onvoorzien</h3>
              <p className="text-[10px] text-gray-400 font-semibold leading-relaxed -mt-2">
                Opslag op het subtotaal, afhankelijk van het bouwjaar van de woning.
              </p>
              <div className="space-y-4">
                <PercentInput label="Na 2010 (Nieuw)" value={settings.onvoorzienNieuw} onChange={(v) => handleChange('onvoorzienNieuw', v)} />
                <PercentInput label="1945 – 2010" value={settings.onvoorzienMiddel} onChange={(v) => handleChange('onvoorzienMiddel', v)} />
                <PercentInput label="Vóór 1945 (Oud)" value={settings.onvoorzienOud} onChange={(v) => handleChange('onvoorzienOud', v)} />
              </div>
            </div>

            {/* Bandbreedte Raming */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-600 uppercase tracking-widest border-b border-slate-100 pb-2">Bandbreedte Raming</h3>
              <p className="text-[10px] text-gray-400 font-semibold leading-relaxed -mt-2">
                Indicatieve marge onder- en bovenkant op het totaalbedrag (fase 1 scan).
              </p>
              <div className="space-y-4">
                <PercentInput label="Onderkant (–%)" value={settings.rangeMin} onChange={(v) => handleChange('rangeMin', v)} />
                <PercentInput label="Bovenkant (+%)" value={settings.rangeMax} onChange={(v) => handleChange('rangeMax', v)} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex flex-col gap-3">
          {/* Feedback */}
          {cloudStatus && (
            <div className={`text-xs font-bold rounded-xl px-4 py-2 ${
              cloudStatus.type === 'success'
                ? 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                : 'text-red-600 bg-red-50 border border-red-100'
            }`}>
              {cloudStatus.type === 'success' ? '✓' : '⚠'} {cloudStatus.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Links: beheerknoppen */}
            <div className="flex flex-wrap gap-2">
              {/* Reset */}
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-200 bg-white text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                title="Alle instellingen terugzetten naar fabriekswaarden"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Standaardwaarden
              </button>

              {/* Opslaan in cloud */}
              <button
                onClick={handleSaveToCloud}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-200 bg-white text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Sla huidige instellingen op in de cloud"
              >
                {isSaving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
                {isSaving ? 'Opslaan...' : 'Opslaan'}
              </button>

              {/* Laden uit cloud */}
              <button
                onClick={handleLoadFromCloud}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-200 bg-white text-gray-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Laad eerder opgeslagen instellingen uit de cloud"
              >
                {isLoading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                )}
                {isLoading ? 'Laden...' : 'Laden'}
              </button>
            </div>

            {/* Rechts: admin + sluiten */}
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={handleSaveAsGlobalDefault}
                  disabled={isSavingGlobal}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-900 bg-gray-900 text-white hover:bg-gray-700 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sla huidige waarden op als standaard voor alle gebruikers"
                >
                  {isSavingGlobal ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {isSavingGlobal ? 'Opslaan...' : 'Standaard voor alle gebruikers'}
                </button>
              )}
              <button
                onClick={onClose}
                className="bg-emerald-600 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all active:scale-95 text-xs"
              >
                Opslaan & Sluiten
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CostInputProps {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}

interface PercentInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

const PercentInput: React.FC<PercentInputProps> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between group">
    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight group-hover:text-gray-900 transition-colors shrink-0 mr-4">{label}</span>
    <div className="flex items-center gap-2">
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 bg-gray-50 border border-gray-100 rounded-xl pl-2 pr-6 py-1.5 text-right font-black text-xs focus:bg-white focus:ring-4 focus:ring-amber-100 outline-none transition-all"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[10px] pointer-events-none">%</span>
      </div>
      <span className="text-[8px] font-black text-gray-300 uppercase w-8 text-left truncate">/ proj</span>
    </div>
  </div>
);

const CostInput: React.FC<CostInputProps> = ({ label, value, unit, onChange }) => (
  <div className="flex items-center justify-between group">
    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight group-hover:text-gray-900 transition-colors shrink-0 mr-4">{label}</span>
    <div className="flex items-center gap-2">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[10px] pointer-events-none">€</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 bg-gray-50 border border-gray-100 rounded-xl pl-6 pr-1.5 py-1.5 text-right font-black text-xs focus:bg-white focus:ring-4 focus:ring-emerald-100 outline-none transition-all"
        />
      </div>
      <span className="text-[8px] font-black text-gray-300 uppercase w-8 text-left truncate">/ {unit}</span>
    </div>
  </div>
);

export default SettingsModal;
