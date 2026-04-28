
import React, { useState } from 'react';
import InfoContact from './InfoContact';
import InfoFAQ from './InfoFAQ';
import InfoPrivacy from './InfoPrivacy';
import InfoTerms from './InfoTerms';

type TabType = 'contact' | 'faq' | 'privacy' | 'terms';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('contact');

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { 
      id: 'contact', 
      label: 'Contact', 
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> 
    },
    { 
      id: 'faq', 
      label: 'FAQ', 
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> 
    },
    { 
      id: 'privacy', 
      label: 'Privacy', 
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> 
    },
    { 
      id: 'terms', 
      label: 'Voorwaarden', 
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> 
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'contact': return <InfoContact />;
      case 'faq': return <InfoFAQ />;
      case 'privacy': return <InfoPrivacy />;
      case 'terms': return <InfoTerms />;
      default: return <InfoContact />;
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[80vh] flex overflow-hidden animate-in zoom-in fade-in duration-300">
        
        {/* Sidebar Nav */}
        <div className="w-72 bg-slate-50 border-r border-slate-100 p-8 flex flex-col">
          <div className="mb-10">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Support & Info</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">VerbouwScan Documentatie</p>
          </div>
          
          <nav className="flex-1 space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 group ${
                  activeTab === tab.id 
                    ? 'bg-white text-emerald-600 shadow-md shadow-emerald-500/5 border border-emerald-100' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                }`}
              >
                <span className={`${activeTab === tab.id ? 'text-emerald-500' : 'text-slate-300 group-hover:text-slate-400'}`}>
                  {tab.icon}
                </span>
                <span className="text-xs font-black uppercase tracking-widest">{tab.label}</span>
              </button>
            ))}
          </nav>

          <button 
            onClick={onClose}
            className="mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95"
          >
            Sluiten
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
