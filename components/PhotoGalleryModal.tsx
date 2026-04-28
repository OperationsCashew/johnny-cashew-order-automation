
import React, { useRef } from 'react';
import { AnalyzedPhoto } from '../types';

interface PhotoGalleryModalProps {
  photos: AnalyzedPhoto[];
  onClose: () => void;
  onUploadPhotos?: (files: FileList) => void;
  isAnalyzing?: boolean;
}

const PhotoGalleryModal: React.FC<PhotoGalleryModalProps> = ({ photos, onClose, onUploadPhotos, isAnalyzing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onUploadPhotos) {
      onUploadPhotos(e.target.files);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-8">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 border-b flex justify-between items-center bg-gray-50">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">AI Foto Analyse</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Visuele inspectie via Gemini Vision</p>
          </div>
          
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            <button 
              onClick={handleUploadClick}
              disabled={isAnalyzing}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-200 bg-white text-emerald-600 font-black text-xs uppercase tracking-widest shadow-sm hover:bg-emerald-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isAnalyzing ? 'animate-pulse' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              {isAnalyzing ? 'Analyseren...' : 'Upload Foto\'s'}
            </button>
            <button 
              onClick={onClose} 
              className="bg-white p-3 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-900 transition-all font-black text-xs uppercase active:scale-95"
            >
              Sluiten
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-10 bg-gray-50/50 custom-scrollbar">
          {photos.length === 0 && !isAnalyzing ? (
            <div className="h-full py-20 flex flex-col items-center justify-center text-gray-300 space-y-4">
              <svg className="w-20 h-20 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <div className="flex flex-col items-center gap-2">
                <span className="font-black uppercase tracking-widest text-sm">Geen foto's geanalyseerd</span>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Upload foto's van de woning voor AI renovatie-advies</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {isAnalyzing && (
                <div className="col-span-full mb-8 flex items-center justify-center p-12 bg-emerald-50 rounded-3xl border-2 border-dashed border-emerald-200 animate-in fade-in zoom-in">
                   <div className="flex flex-col items-center gap-4">
                     <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                     <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">AI Vision analyseert nieuwe foto's...</span>
                   </div>
                </div>
              )}

              {photos.map((photo) => (
                <div key={photo.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 flex flex-col group hover:shadow-xl transition-all duration-500">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img 
                      src={photo.url} 
                      alt={`Analysis ${photo.id}`} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
                    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
                       <span className="text-[10px] font-black text-white uppercase tracking-widest">{photo.analysis?.imageType || 'ONBEKEND'}</span>
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-black text-gray-900 uppercase text-sm tracking-tighter truncate max-w-[150px]">{photo.analysis?.roomName || 'Onbekende Kamer'}</h3>
                      <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${
                        photo.analysis?.confidence === 'HIGH' ? 'bg-emerald-100 text-emerald-700' : 
                        photo.analysis?.confidence === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {photo.analysis?.confidence || 'GEEN'} CONFIDENCE
                      </div>
                    </div>
                    
                    <p className="text-[11px] font-bold text-slate-500 italic mb-6 leading-relaxed line-clamp-2">
                      "{photo.analysis?.qualityDescription || 'AI kon de staat van deze ruimte niet volledig bepalen.'}"
                    </p>
                    
                    <div className="space-y-3 mt-auto">
                       <span className="block text-[10px] font-black text-slate-300 uppercase tracking-widest">AI Observaties</span>
                       <div className="flex flex-wrap gap-1.5">
                          {photo.analysis?.actions.paintWalls && <ActionBadge label="Verven" />}
                          {(photo.analysis?.actions.plasterWalls || photo.analysis?.actions.plasterCeiling) && <ActionBadge label="Stucen" />}
                          {photo.analysis?.actions.floorAction !== 'BEHOUDEN' && photo.analysis?.actions.floorAction !== 'ONBEKEND' && <ActionBadge label="Vloer" color="orange" />}
                          {photo.analysis?.actions.kitchenAction === 'NIEUW' && <ActionBadge label="Keuken" color="blue" />}
                          {photo.analysis?.actions.bathroomAction === 'NIEUW' && <ActionBadge label="Badkamer" color="blue" />}
                          {photo.analysis?.actions.toiletAction === 'NIEUW' && <ActionBadge label="Toilet" color="blue" />}
                          
                          {photo.analysis && (!photo.analysis.actions.paintWalls && !photo.analysis.actions.plasterWalls && !photo.analysis.actions.plasterCeiling && photo.analysis.actions.floorAction === 'BEHOUDEN') && (
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-lg">Geen actie gedetecteerd</span>
                          )}
                       </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ActionBadge = ({ label, color = 'emerald' }: { label: string, color?: 'emerald' | 'orange' | 'blue' }) => {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
  };
  return (
    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest ${styles[color]}`}>
      {label}
    </span>
  );
}

export default PhotoGalleryModal;
