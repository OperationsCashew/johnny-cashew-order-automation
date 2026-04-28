
import React from 'react';
import { Floor, CostSettings, HouseMetadata } from '../../types';
import FloorPlan3D from '../FloorPlan3D';
import ListView from '../features/ListView';

interface MainContentProps {
  floors: Floor[];
  viewMode: '3d' | 'list';
  activeFloorIdx: number;
  selectedRoomId: string | null;
  selectedWallId?: string | null;
  costSettings: CostSettings;
  totalProjectCost: number;
  isLoading: boolean;
  fmlStatus: string;
  isAnalyzing: boolean;
  analyzedPhotosCount: number;
  scrapedPhotoIdsCount: number;
  onRoomClick: (roomId: string) => void;
  onWallClick?: (wallId: string) => void;
  onFloorSwitch: (idx: number) => void;
  houseMetadata: HouseMetadata;
  onManualFmlUpload: () => void;
  onResetStatus: () => void;
  onFundaOpen: () => void;
  analysisLogs?: string[];
}

const MainContent: React.FC<MainContentProps> = (props) => {
  const [showLogs, setShowLogs] = React.useState(false);
  if (props.floors.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center bg-white/40 backdrop-blur-md rounded-[3rem] border-4 border-dashed border-gray-200 shadow-2xl relative overflow-y-auto">
        {props.isLoading ? (
          <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500 my-auto py-8">
            <div className="relative">
              <div className="w-24 h-24 border-8 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <svg className="w-9 h-9 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 21V13h6v8" />
                </svg>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                {props.fmlStatus === 'error' && (props.analyzedPhotosCount > 0 || props.scrapedPhotoIdsCount > 0) 
                  ? "Plattegrond ontbreekt" 
                  : "Woning zoeken..."}
              </h2>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                {props.fmlStatus === 'error' && (props.analyzedPhotosCount > 0 || props.scrapedPhotoIdsCount > 0)
                  ? "De foto's worden verwerkt - upload een plattegrond om alsnog te bewerken"
                  : "Postcode en huisnummer worden geverifieerd"}
              </p>
              {props.fmlStatus === 'error' && (props.analyzedPhotosCount > 0 || props.scrapedPhotoIdsCount > 0) && (
                <button 
                  onClick={props.onManualFmlUpload}
                  className="mt-6 bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
                >
                  Upload FML Plattegrond
                </button>
              )}
            </div>
          </div>
        ) : props.fmlStatus === 'error' && props.analyzedPhotosCount === 0 ? (
          <div className="flex flex-col items-center gap-8 text-center max-w-lg px-8 py-8 my-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-4 shadow-sm border border-rose-100">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="2.5" />
                <path d="M12 18v4" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 22h4" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M7 11h10" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <path d="M7 14h6" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-tight">Geen koopwoning gevonden.</h2>
            <p className="text-gray-500 font-medium leading-relaxed">
              We konden geen actieve verkoopdata vinden voor dit adres. VerbouwScan werkt op dit moment alleen voor woningen die te koop staan. 
              Je kunt echter handmatig een <strong className="text-gray-900">plattegrond (FML formaat)</strong> uploaden en <strong className="text-gray-900">foto's</strong> toevoegen voor een volwaardig renovatieadvies.
            </p>
            <div className="flex gap-4">
              <button onClick={props.onResetStatus} className="bg-[#111827] text-white px-12 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-black transition-all active:scale-95 uppercase tracking-widest">Sluiten</button>
            </div>
            {props.analysisLogs && props.analysisLogs.length > 0 && (
              <div className="w-full text-left mt-2">
                <button
                  onClick={() => setShowLogs(v => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                >
                  {showLogs ? 'Verberg diagnose-log' : 'Toon diagnose-log'}
                </button>
                {showLogs && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                    {props.analysisLogs.map((log, i) => (
                      <p key={i} className="text-[10px] font-mono text-gray-500 leading-5">{log}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:gap-8 text-center max-w-lg px-8 py-6 my-auto">
            <div className="w-16 h-16 lg:w-24 lg:h-24 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
              <svg className="w-8 h-8 lg:w-12 lg:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <h2 className="text-xl lg:text-3xl font-black text-gray-900 uppercase tracking-tighter leading-tight">Check de verbouwkosten van elke woning die nu te koop staat.</h2>
            <p className="text-sm lg:text-base text-gray-500 font-medium leading-relaxed">Voer een adres in van een koopwoning om direct een kostenindicatie te genereren op basis van AI foto-analyse en interactieve plattegronden.</p>
            <button onClick={props.onFundaOpen} className="bg-emerald-600 text-white px-8 lg:px-12 py-3 lg:py-5 rounded-[2rem] font-black text-sm lg:text-lg shadow-xl hover:bg-emerald-700 active:scale-95 uppercase tracking-widest transition-all hover:scale-105">Start Project</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative">
      {props.viewMode === '3d' ? (
         <>
           {props.floors.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="flex bg-white/60 backdrop-blur-xl p-1 rounded-full border border-white/30 shadow-lg pointer-events-auto">
                {props.floors.map((floor, idx) => (
                  <button 
                    key={floor.id} 
                    onClick={() => props.onFloorSwitch(idx)} 
                    className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${props.activeFloorIdx === idx ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-900/60 hover:text-emerald-900'}`}
                  >
                    {floor.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FloorPlan3D
            floor={props.floors[props.activeFloorIdx]}
            totalProjectCost={props.totalProjectCost}
            costSettings={props.costSettings}
            selectedRoomId={props.selectedRoomId}
            onRoomClick={props.onRoomClick}
            selectedWallId={props.selectedWallId}
            onWallClick={props.onWallClick}
          />
         </>
      ) : (
        <ListView
          floors={props.floors}
          costSettings={props.costSettings}
          houseMetadata={props.houseMetadata}
          totalProjectCost={props.totalProjectCost}
          selectedRoomId={props.selectedRoomId}
          onRoomClick={props.onRoomClick}
        />
      )}
    </div>
  );
};

export default MainContent;
