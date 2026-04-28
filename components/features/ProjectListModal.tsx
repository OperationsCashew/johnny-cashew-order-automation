
import React, { useEffect, useState } from 'react';
import { projectService } from '../../services/projectService';
import { SavedProject } from '../../types';

interface ProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (id: string) => void;
}

const ProjectListModal: React.FC<ProjectListModalProps> = ({ isOpen, onClose, onLoadProject }) => {
  const [projects, setProjects] = useState<Partial<SavedProject>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await projectService.getProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchProjects();
  }, [isOpen]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen?')) return;
    try {
      await projectService.deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
        <div className="p-8 bg-gray-50 border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Mijn Projecten</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Selecteer een eerder opgeslagen project</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
               <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Laden...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-300">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Je hebt nog geen projecten opgeslagen.</p>
            </div>
          ) : (
            projects.map(project => (
              <button 
                key={project.id} 
                onClick={() => { onLoadProject(project.id!); onClose(); }}
                className="w-full flex items-center justify-between p-5 rounded-2xl bg-white border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all group"
              >
                <div className="flex flex-col items-start">
                  <span className="text-sm font-black text-gray-900 group-hover:text-emerald-700 uppercase">{project.name}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    Gewijzigd op {new Date(project.updated_at!).toLocaleDateString('nl-NL')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Laden</span>
                  <div 
                    onClick={(e) => handleDelete(e, project.id!)}
                    className="p-2 text-gray-300 hover:text-rose-500 transition-colors"
                    title="Verwijderen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectListModal;
