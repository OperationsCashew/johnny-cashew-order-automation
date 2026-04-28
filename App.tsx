
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useRenovationProject } from './hooks/useRenovationProject';
import Sidebar from './components/features/Sidebar';
import PhotoGalleryModal from './components/PhotoGalleryModal';
import SettingsModal from './components/features/SettingsModal';
import AuthModal from './components/features/AuthModal';
import ProjectListModal from './components/features/ProjectListModal';
import Header from './components/layout/Header';
import MainContent from './components/layout/MainContent';
import AddressModal from './components/features/AddressModal';
import InfoModal from './components/features/InfoModal';
import QuoteRequestModal from './components/features/QuoteRequestModal';
import { generatePDFReport, generateReportHTML } from './utils/reportGenerator';
import { calculateRoomCost, calculateFloorManifoldCost } from './utils/costEngine';
import { useTour } from './hooks/useTour';

const App: React.FC = () => {
  const { state, actions, totals } = useRenovationProject();
  const { 
    floors, settings: costSettings, loading: isLoading,
    meta: houseMetadata, fmlStatus,
    rawFml, fundaUrl, analyzedPhotos, scrapedPhotoIds,
    zipcode, houseNumber, isAnalyzing, user, currentProjectId,
    logs: analysisLogs
  } = state;

  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'list'>('3d');
  
  const [isFundaModalOpen, setIsFundaModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);

  // Lazy Auth states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'list' | null>(null);

  // Save feedback toast
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // SEARCH ALL FLOORS for the selected room
  const selectedRoom = useMemo(() => {
    if (!selectedRoomId) return null;
    for (const floor of floors) {
      const found = floor.rooms.find(r => r.id === selectedRoomId);
      if (found) return found;
    }
    return null;
  }, [selectedRoomId, floors]);

  // SEARCH ALL FLOORS for the selected wall (+ its floor id)
  const selectedWall = useMemo(() => {
    if (!selectedWallId) return null;
    for (const floor of floors) {
      const found = (floor.walls || []).find(w => w.id === selectedWallId);
      if (found) return { wall: found, floorId: floor.id };
    }
    return null;
  }, [selectedWallId, floors]);

  const showSaveResult = (success: boolean, message: string) => {
    setSaveStatus({ type: success ? 'success' : 'error', message });
    setTimeout(() => setSaveStatus(null), success ? 3000 : 6000);
  };

  // Handle post-login actions
  useEffect(() => {
    if (user && pendingAction) {
      if (pendingAction === 'save') {
        actions.saveProject()
          .then(() => showSaveResult(true, 'Project opgeslagen ✓'))
          .catch((err: any) => showSaveResult(false, `Opslaan mislukt: ${err.message}`));
      } else if (pendingAction === 'list') {
        setIsProjectListOpen(true);
      }
      setPendingAction(null);
    }
  }, [user, pendingAction, actions]);

  const handleSaveClick = async () => {
    if (!user) {
      actions.persistDraftForAuth(); // bewaar state vóór mogelijke OAuth page-reload
      setPendingAction('save');
      setIsAuthModalOpen(true);
      return;
    }
    try {
      await actions.saveProject();
      showSaveResult(true, 'Project opgeslagen ✓');
    } catch (err: any) {
      showSaveResult(false, `Opslaan mislukt: ${err.message}`);
    }
  };

  const handleMyProjectsClick = () => {
    if (!user) {
      setPendingAction('list');
      setIsAuthModalOpen(true);
      return;
    }
    setIsProjectListOpen(true);
  };

  const buildFloorCosts = () => {
    const houseHasKitchen = floors.some(f => f.rooms?.some(r => r.originalName?.toLowerCase().includes('keuken')));
    const globalSubfloor = (houseMetadata.globalSubfloor || 'BETON') as 'BETON' | 'HOUT';
    return { houseHasKitchen, floorCosts: floors.map(f => {
      let roomTotal = 0;
      let heatingArea = 0;
      (f.rooms || []).forEach(r => {
        roomTotal += calculateRoomCost(r, costSettings, houseHasKitchen, globalSubfloor);
        if (r.analysis?.find(a => a.source === 'manual')?.actions.underfloorHeating) heatingArea += r.metrics.floorArea;
      });
      const manifoldCost = heatingArea > 0 ? calculateFloorManifoldCost(heatingArea, costSettings) : 0;
      const wallPerMCost = (f.walls || []).filter(w => !w.isExternal && w.isMarkedForRemoval).reduce((acc, w) => acc + (w.isDragend ? costSettings.wallDragendPerM : costSettings.wallNietDragendPerM) * w.length, 0);
      return { id: f.id, total: roomTotal + manifoldCost + wallPerMCost };
    })};
  };

  const quoteReportHtml = floors.length > 0 ? (() => {
    const { houseHasKitchen, floorCosts } = buildFloorCosts();
    return generateReportHTML(floors, costSettings, houseMetadata, houseHasKitchen, floorCosts, totals.projectCost);
  })() : null;

  const handleDownloadPdf = () => {
    if (floors.length === 0) return;
    const { houseHasKitchen, floorCosts } = buildFloorCosts();
    generatePDFReport(floors, costSettings, houseMetadata, houseHasKitchen, floorCosts, totals.projectCost);
  };

  const handleDownloadFml = () => {
    if (!rawFml) return;
    const blob = new Blob([rawFml], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${houseMetadata.name || houseMetadata.address || 'project'}.fml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRoomClick = (roomId: string) => {
    setSelectedWallId(null);
    if (roomId === selectedRoomId) {
      setSelectedRoomId(null);
    } else {
      setSelectedRoomId(roomId);
      const floorIdx = floors.findIndex(f => f.rooms.some(r => r.id === roomId));
      if (floorIdx !== -1 && floorIdx !== activeFloorIdx) {
        setActiveFloorIdx(floorIdx);
      }
    }
  };

  const handleWallClick = (wallId: string) => {
    setSelectedRoomId(null);
    setSelectedWallId(prev => (prev === wallId ? null : wallId));
  };

  const handleFloorSwitch = (idx: number) => {
    setActiveFloorIdx(idx);
    setSelectedRoomId(null);
    setSelectedWallId(null);
  };

  const isPhotoAnalysisDone = (analyzedPhotos.length > 0 || scrapedPhotoIds.length > 0) && !isAnalyzing;

  useTour(floors.length > 0, !!user);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 font-sans text-slate-900">
      <Header 
        address={houseMetadata.address}
        isPhotoAnalysisDone={isPhotoAnalysisDone}
        isAnalyzing={isAnalyzing}
        fmlStatus={fmlStatus}
        rawFml={rawFml}
        viewMode={viewMode}
        totalProjectCost={totals.projectCost}
        rangeMin={costSettings.rangeMin}
        rangeMax={costSettings.rangeMax}
        currentProjectId={currentProjectId}
        hasFloors={floors.length > 0}
        onGalleryOpen={() => setIsGalleryOpen(true)}
        onSettingsOpen={() => setIsSettingsModalOpen(true)}
        onFundaOpen={() => setIsFundaModalOpen(true)}
        onSave={handleSaveClick}
        onDownloadPdf={handleDownloadPdf}
        onMyProjectsOpen={handleMyProjectsClick}
        onLogout={actions.logout}
        onViewModeChange={setViewMode}
        onFmlUpload={actions.setFmlUpload}
        onDownloadFml={handleDownloadFml}
        user={user}
      />

      <div className="flex flex-1 overflow-hidden">
        <main id="tour-floorplan" className="flex-1 p-3 lg:p-8 flex flex-col overflow-hidden relative bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px]">
          <MainContent
            floors={floors}
            viewMode={viewMode}
            activeFloorIdx={activeFloorIdx}
            selectedRoomId={selectedRoomId}
            selectedWallId={selectedWallId}
            costSettings={costSettings}
            totalProjectCost={totals.projectCost}
            isLoading={isLoading}
            fmlStatus={fmlStatus}
            houseMetadata={houseMetadata}
            isAnalyzing={isAnalyzing}
            analyzedPhotosCount={analyzedPhotos.length}
            scrapedPhotoIdsCount={scrapedPhotoIds.length}
            onRoomClick={handleRoomClick}
            onWallClick={handleWallClick}
            onFloorSwitch={handleFloorSwitch}
            onManualFmlUpload={() => actions.resetStatus()}
            onResetStatus={() => actions.resetStatus()}
            onFundaOpen={() => setIsFundaModalOpen(true)}
            analysisLogs={analysisLogs}
          />

          {/* BOTTOM-LEFT HELP BUTTON */}
          <button
            id="tour-help-btn"
            onClick={() => setIsInfoModalOpen(true)}
            className="absolute bottom-3 left-3 lg:bottom-8 lg:left-8 flex items-center gap-3 bg-white border border-slate-200 px-4 lg:px-6 py-2.5 lg:py-3.5 rounded-2xl shadow-xl hover:bg-slate-50 transition-all duration-300 active:scale-95 group z-20"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center transition-transform group-hover:rotate-12">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Help & Info</span>
          </button>
        </main>

        {floors.length > 0 && (
          <div id="tour-sidebar" className="h-full flex-shrink-0">
            <Sidebar
              room={selectedRoom}
              selectedWall={selectedWall}
              floors={floors}
              totalProjectCost={totals.projectCost}
              houseMetadata={houseMetadata}
              costSettings={costSettings}
              onUpdateAction={actions.updateRoom}
              onUpdateRoomName={actions.updateRoomName}
              onUpdateMetadata={actions.updateMetadata}
              onUpdateWall={actions.updateWall}
              onQuoteOpen={() => setIsQuoteModalOpen(true)}
            />
          </div>
        )}
      </div>

      <AddressModal 
        isOpen={isFundaModalOpen}
        zipcode={zipcode}
        houseNumber={houseNumber}
        onZipcodeChange={actions.setZipcode}
        onHouseNumberChange={actions.setHouseNumber}
        onClose={() => setIsFundaModalOpen(false)}
        onConfirm={() => { setIsFundaModalOpen(false); actions.runAnalysis(); }}
      />

      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          settings={costSettings}
          onUpdate={actions.setSettings}
          user={user}
          onLoginRequest={() => setIsAuthModalOpen(true)}
        />
      )}

      {isGalleryOpen && (
        <PhotoGalleryModal 
          photos={analyzedPhotos} 
          onClose={() => setIsGalleryOpen(false)} 
          onUploadPhotos={actions.uploadPhotos} 
          isAnalyzing={isAnalyzing} 
        />
      )}
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onSuccess={() => {}} />
      <ProjectListModal isOpen={isProjectListOpen} onClose={() => setIsProjectListOpen(false)} onLoadProject={actions.loadProject} />
      <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
      <QuoteRequestModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        houseMetadata={houseMetadata}
        totalCost={totals.projectCost}
        rawFml={rawFml}
        fundaUrl={fundaUrl}
        projectId={currentProjectId}
        reportHtml={quoteReportHtml}
      />

      {/* Save feedback toast */}
      {saveStatus && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold pointer-events-none
          ${saveStatus.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {saveStatus.message}
        </div>
      )}
    </div>
  );
};

export default App;

