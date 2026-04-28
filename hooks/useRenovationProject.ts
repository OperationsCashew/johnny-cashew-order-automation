
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Floor, RoomAnalysis, CostSettings, AnalyzedPhoto, HouseMetadata, SavedProject, Wall, WallState } from '../types';
import { parseFML } from '../services/fmlParser';
import { analyzeFundaText, analyzeRoomPhotos, synthesizeRoomStatus } from '../services/geminiService';
import { identifyFundaListing, downloadFML, downloadPhotoBase64, findFundaUrl } from '../services/fundaScraper';
import { calculateTotalProjectCost, DEFAULT_ACTIONS } from '../utils/costEngine';
import { roomNamesMatch } from '../utils/roomMatcher';
import { DEFAULT_COSTS } from '../utils/constants';
import { supabase } from '../services/supabaseClient';
import { projectService } from '../services/projectService';
import { settingsService } from '../services/settingsService';

export function useRenovationProject() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [zipcode, setZipcode] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [costSettings, setCostSettings] = useState<CostSettings>(DEFAULT_COSTS);
  const [houseMetadata, setHouseMetadata] = useState<HouseMetadata>({ name: 'Nieuw Project', globalSubfloor: 'BETON' });
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [fmlStatus, setFmlStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [rawFml, setRawFml] = useState<string | null>(null);
  const [analyzedPhotos, setAnalyzedPhotos] = useState<AnalyzedPhoto[]>([]);
  const [scrapedPhotoIds, setScrapedPhotoIds] = useState<string[]>([]);
  
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [fundaUrl, setFundaUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [pendingDraftSave, setPendingDraftSave] = useState(false);

  const DRAFT_KEY = 'verbouwscan_pending_draft';

  // Sla de huidige projectstate op in localStorage vóór een OAuth-redirect
  const persistDraftForAuth = useCallback(() => {
    if (!rawFml || floors.length === 0) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        rawFml, floors, houseMetadata, costSettings, currentProjectId
      }));
    } catch (e) {
      console.warn('[VerbouwScan] Draft opslaan mislukt:', e);
    }
  }, [rawFml, floors, houseMetadata, costSettings, currentProjectId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      // Na OAuth-redirect: herstel eventuele opgeslagen draft
      if (sessionUser) {
        const draftStr = localStorage.getItem(DRAFT_KEY);
        if (draftStr) {
          try {
            const d = JSON.parse(draftStr);
            if (d.rawFml)           setRawFml(d.rawFml);
            if (d.floors)           setFloors(d.floors);
            if (d.houseMetadata)    setHouseMetadata(d.houseMetadata);
            if (d.costSettings)     setCostSettings(d.costSettings);
            if (d.currentProjectId) setCurrentProjectId(d.currentProjectId);
            if (d.rawFml)           setFmlStatus('success');
            setPendingDraftSave(true);
          } catch (e) {
            console.warn('[VerbouwScan] Draft herstellen mislukt:', e);
          } finally {
            localStorage.removeItem(DRAFT_KEY);
          }
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Laad globale standaardwaarden (admin) bij opstarten — voor alle gebruikers
  useEffect(() => {
    settingsService.loadGlobalDefaults().then(globals => {
      if (globals) setCostSettings(prev => ({ ...prev, ...globals }));
    }).catch(() => {/* stil falen — valt terug op DEFAULT_COSTS */});
  }, []);

  // Auto-laad gebruikersinstellingen bij inloggen — overschrijft globale standaard
  useEffect(() => {
    if (!user) return;
    settingsService.load().then(saved => {
      if (saved) setCostSettings({ ...DEFAULT_COSTS, ...saved });
    }).catch(() => {/* stil falen */});
  }, [user]);

  const addLog = useCallback((msg: string) => {
    console.log(`[VerbouwScan] ${msg}`);
    setAnalysisLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  }, []);

  const processFMLContent = useCallback((
    content: string,
    analysisState?: Record<string, RoomAnalysis[]>,
    yearBuilt?: string,
    wallState?: Record<string, WallState>
  ) => {
    const parsedFloors = parseFML(content, yearBuilt, addLog, wallState);
    if (parsedFloors.length > 0) {
      if (analysisState) {
        parsedFloors.forEach(f => {
          f.rooms.forEach(r => {
            if (analysisState[r.id]) {
              r.analysis = analysisState[r.id];
            }
          });
        });
      }
      setRawFml(content);
      setFloors(parsedFloors);
      return parsedFloors;
    }
    return null;
  }, [addLog]);

  /** Update a single wall's properties (isDragend, isMarkedForRemoval) */
  const updateWall = useCallback((floorId: string, wallId: string, updates: Partial<Wall>) => {
    setFloors(prev => prev.map(floor => {
      if (floor.id !== floorId) return floor;
      return {
        ...floor,
        walls: (floor.walls || []).map(wall =>
          wall.id === wallId ? { ...wall, ...updates } : wall
        ),
      };
    }));
  }, []);

  const handleFMLUpload = useCallback((content: string) => {
    addLog("📁 Handmatige upload gestart...");
    setCurrentProjectId(null); 
    const result = processFMLContent(content);
    if (result) setFmlStatus('success');
    else setFmlStatus('error');
  }, [addLog, processFMLContent]);

  const handleManualPhotoUpload = useCallback(async (files: FileList) => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    addLog(`📸 Handmatige upload van ${files.length} foto's gestart...`);
    
    const roomNames = floors.flatMap(f => f.rooms.map(r => r.name));
    const pendingPhotos: AnalyzedPhoto[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        pendingPhotos.push({ id: `manual-${Date.now()}-${i}`, url: base64 });
      }

      const batchSize = 2;
      for (let i = 0; i < pendingPhotos.length; i += batchSize) {
        const batch = pendingPhotos.slice(i, i + batchSize);
        addLog(`🧠 Analyseren van batch ${Math.floor(i/batchSize) + 1}...`);
        
        const analysisResults = await analyzeRoomPhotos(batch.map(p => p.url), roomNames);
        const analyzedBatch = batch.map((p, idx) => ({ ...p, analysis: analysisResults[idx] }));
        
        setAnalyzedPhotos(prev => [...prev, ...analyzedBatch]);
        
        setFloors(prev => prev.map(f => ({ 
          ...f, 
          rooms: f.rooms.map(r => {
            const matches = analyzedBatch.filter(p => p.analysis?.roomName ? roomNamesMatch(p.analysis.roomName, r.name) : false);
            return matches.length > 0 ? { ...r, analysis: [...r.analysis, ...matches.map(m => m.analysis!)] } : r;
          })
        })));
      }
      addLog(`✅ Foto-analyse succesvol afgerond.`);
    } catch (err) {
      addLog(`❌ Fout bij foto analyse: ${err}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [floors, addLog]);

  const saveProject = async () => {
    if (!rawFml || floors.length === 0) throw new Error('Geen project geladen om op te slaan');

    const analysisState: Record<string, RoomAnalysis[]> = {};
    floors.forEach(f => {
      f.rooms.forEach(r => {
        analysisState[r.id] = r.analysis;
      });
    });

    // Persist wall overrides (isDragend + isMarkedForRemoval per wall)
    const wallState: Record<string, WallState> = {};
    floors.forEach(f => {
      (f.walls || []).forEach(w => {
        wallState[w.id] = { isDragend: w.isDragend, isMarkedForRemoval: w.isMarkedForRemoval };
      });
    });

    try {
      const saved = await projectService.upsertProject({
        id: currentProjectId || undefined,
        name: houseMetadata.name || houseMetadata.address || "Nieuw Project",
        fml_content: rawFml,
        analysis_state: analysisState,
        wall_state: wallState,
        cost_settings: costSettings,
        meta: houseMetadata
      });
      
      setCurrentProjectId(saved.id);
      addLog("✅ Project opgeslagen in cloud.");
      return saved;
    } catch (err: any) {
      addLog(`❌ Fout bij opslaan: ${err.message}`);
      throw err;
    }
  };

  // Auto-sla op als er een draft was hersteld na OAuth-redirect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pendingDraftSave || !user || !rawFml || floors.length === 0) return;
    setPendingDraftSave(false);
    saveProject()
      .then(() => addLog('✅ Project automatisch opgeslagen na inloggen.'))
      .catch((err: any) => addLog(`❌ Opslaan na inloggen mislukt: ${err.message}`));
  }, [pendingDraftSave, user, rawFml, floors.length]);

  const loadProject = async (id: string) => {
    addLog(`📂 Laden van project uit cloud...`);
    setIsLoading(true);
    try {
      const project = await projectService.getProjectById(id);
      setCostSettings({ ...DEFAULT_COSTS, ...project.cost_settings });
      setHouseMetadata(project.meta);
      setCurrentProjectId(project.id);
      processFMLContent(project.fml_content, project.analysis_state, project.meta?.yearBuilt, project.wall_state);
      setFmlStatus('success');
      addLog(`✅ Project "${project.name}" succesvol geladen.`);
    } catch (err: any) {
      addLog(`❌ Fout bij laden: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateMetadata = useCallback((updates: Partial<HouseMetadata>) => {
    setHouseMetadata(prev => ({ ...prev, ...updates }));
  }, []);

  const updateRoomName = useCallback((roomId: string, newName: string) => {
    setFloors(prev => prev.map(floor => ({
      ...floor,
      rooms: floor.rooms.map(room => room.id === roomId ? { ...room, name: newName } : room)
    })));
  }, []);

  const runFundaAutomation = async () => {
    if (!zipcode || !houseNumber) {
      addLog("⚠️ Vul a.u.b. zowel de postcode als het huisnummer in.");
      return;
    }
    
    setIsLoading(true);
    setAnalysisLogs(["🚀 Automatisering gestart..."]);
    setFmlStatus('loading');
    setCurrentProjectId(null); 
    setFloors([]);
    setRawFml(null);
    setAnalyzedPhotos([]);
    
    try {
      const searchResult = await findFundaUrl(zipcode, houseNumber, addLog);
      
      if (!searchResult.found || !searchResult.url) {
        addLog(`❌ ${searchResult.message}`);
        setIsLoading(false);
        setFmlStatus('error');
        return;
      }

      addLog(`✅ Woning gevonden: ${searchResult.title}`);
      setFundaUrl(searchResult.url);
      
      const id = await identifyFundaListing(searchResult.url, addLog);
      setScrapedPhotoIds(id.photoIds);
      
      setHouseMetadata({
        name: [id.metadata.address, id.metadata.city].filter(Boolean).join(', ') || "Nieuw Project",
        address: id.metadata.address,
        postcode: id.metadata.zipcode,
        city: id.metadata.city,
        askingPrice: id.metadata.price,
        energyLabel: id.metadata.energyLabel,
        yearBuilt: id.metadata.yearBuilt,
        houseType: id.metadata.houseType,
        summary: id.description ? id.description.substring(0, 300) + '...' : undefined,
        globalSubfloor: 'BETON'
      });

      let currentFloors: Floor[] = [];
      let fmlFound = false;

      if (id.projectId) {
        const fml = await downloadFML(id.projectId, addLog);
        if (fml) {
          const parsed = processFMLContent(fml, undefined, id.metadata.yearBuilt);
          if (parsed) {
            currentFloors = parsed;
            setFmlStatus('success');
            addLog("🎉 Plattegrond succesvol geladen.");
            fmlFound = true;
          }
        }
      }

      if (!fmlFound) {
        setFmlStatus('error');
        addLog("⚠️ Geen plattegrond gevonden op Funda. Foto's worden wel verwerkt.");
      }

      setIsBackgroundProcessing(true);
      const roomNames = currentFloors.flatMap(f => f.rooms.map(r => r.name));
      
      analyzeFundaText(id.description, roomNames).then(results => {
        addLog(`✅ Tekst-analyse voltooid.`);
        if (fmlFound) {
          setFloors(prev => prev.map(f => ({ ...f, rooms: f.rooms.map(r => {
            const match = results.find((res: any) => res.roomName ? roomNamesMatch(res.roomName, r.name) : false);
            return match ? { ...r, analysis: [...r.analysis.filter(a => a.source !== 'funda'), match] } : r;
          }) })));
        }
      });

      setIsAnalyzing(true);
      const photosToProcess = id.photoIds.slice(0, 50);
      addLog(`📷 ${photosToProcess.length} foto-ID's gevonden, downloaden...`);
      const batchSize = 2;

      try {
        for (let i = 0; i < photosToProcess.length; i += batchSize) {
          const batch = photosToProcess.slice(i, i + batchSize);
          const downloaded: AnalyzedPhoto[] = [];
          for (const pid of batch) {
            const base64 = await downloadPhotoBase64(pid);
            if (base64) downloaded.push({ id: pid, url: base64 });
            else addLog(`⚠️ Foto download mislukt: ${pid}`);
          }

          if (downloaded.length > 0) {
            addLog(`🧠 Gemini analyseert batch ${Math.floor(i/batchSize) + 1} (${downloaded.length} foto's)...`);
            const analysisResults = await analyzeRoomPhotos(downloaded.map(p => p.url), roomNames);
            const analyzedBatch = downloaded.map((p, idx) => ({ ...p, analysis: analysisResults[idx] }));
            setAnalyzedPhotos(prev => [...prev, ...analyzedBatch]);

            if (fmlFound) {
              setFloors(prev => prev.map(f => ({
                ...f,
                rooms: f.rooms.map(r => {
                  const matches = analyzedBatch.filter(p => p.analysis?.roomName ? roomNamesMatch(p.analysis.roomName, r.name) : false);
                  return matches.length > 0 ? { ...r, analysis: [...r.analysis, ...matches.map(m => m.analysis!)] } : r;
                })
              })));
            }
          }
        }
      } catch (photoErr: any) {
        let detail = photoErr?.message ?? String(photoErr);
        try {
          if (photoErr?.context?.text) {
            const body = await photoErr.context.text();
            const parsed = JSON.parse(body);
            detail = parsed?.error ?? body;
          }
        } catch { /* gebruik fallback */ }
        addLog(`❌ Foto-analyse mislukt: ${detail}`);
      } finally {
        setIsAnalyzing(false);
      }

      if (fmlFound) {
        addLog("🧠 Bezig met eindconclusies formuleren per kamer...");
        setFloors(prevFloors => {
          const updatedFloors = [...prevFloors];
          (async () => {
            for (const floor of updatedFloors) {
              for (const room of floor.rooms) {
                const descriptions = room.analysis
                  .filter(a => a.source !== 'manual' && a.qualityDescription)
                  .map(a => a.qualityDescription!);
                
                if (descriptions.length > 1) {
                  const summary = await synthesizeRoomStatus(descriptions);
                  if (summary) {
                    const synthesisEntry: RoomAnalysis = {
                      source: 'summary',
                      qualityDescription: summary,
                      confidence: 'HIGH',
                      actions: room.analysis.find(a => a.source === 'photo' || a.source === 'funda')?.actions || room.analysis[0].actions
                    };
                    
                    setFloors(fPrev => fPrev.map(f => f.id === floor.id ? {
                      ...f,
                      rooms: f.rooms.map(r => r.id === room.id ? {
                        ...r,
                        analysis: [...r.analysis.filter(a => a.source !== 'summary'), synthesisEntry]
                      } : r)
                    } : f));
                  }
                }
              }
            }
            addLog("✨ Analyse volledig afgerond.");
          })();
          return updatedFloors;
        });
      } else {
        addLog("✨ Foto-analyse afgerond. Upload een plattegrond om deze te koppelen.");
      }

      setIsAnalyzing(false);
      setIsBackgroundProcessing(false);
      setIsLoading(false);

    } catch (e) {
      setIsLoading(false);
      setIsAnalyzing(false);
      setFmlStatus('error');
      addLog(`❌ Kritieke fout: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const updateRoomAction = useCallback((roomId: string, updates: Partial<RoomAnalysis>) => {
    setFloors(prevFloors => prevFloors.map(floor => {
      const roomIdx = floor.rooms.findIndex(r => r.id === roomId);
      if (roomIdx === -1) return floor;

      const newRooms = [...floor.rooms];
      const targetRoom = newRooms[roomIdx];
      const currentAnalysis = [...(targetRoom.analysis || [])];
      const manualIdx = currentAnalysis.findIndex(a => a.source === 'manual');
      
      let updatedAnalysis: RoomAnalysis;

      if (manualIdx > -1) {
        const existingManual = currentAnalysis[manualIdx];
        updatedAnalysis = {
          ...existingManual,
          ...updates,
          actions: {
            ...(existingManual.actions || DEFAULT_ACTIONS),
            ...(updates.actions || {})
          }
        };
        currentAnalysis[manualIdx] = updatedAnalysis;
      } else {
        updatedAnalysis = {
          source: 'manual',
          confidence: 'HIGH',
          actions: { ...DEFAULT_ACTIONS, ...(updates.actions || {}) },
          ...updates
        };
        currentAnalysis.push(updatedAnalysis);
      }

      newRooms[roomIdx] = { ...targetRoom, analysis: currentAnalysis };
      return { ...floor, rooms: newRooms };
    }));
  }, []);

  return {
    state: {
      floors,
      settings: costSettings,
      loading: isLoading,
      isAnalyzing,
      isBackgroundProcessing,
      logs: analysisLogs,
      meta: houseMetadata,
      fmlStatus,
      rawFml,
      fundaUrl,
      analyzedPhotos,
      scrapedPhotoIds,
      zipcode,
      houseNumber,
      user,
      currentProjectId
    },
    actions: {
      setZipcode,
      setHouseNumber,
      runAnalysis: runFundaAutomation,
      updateRoom: updateRoomAction,
      updateRoomName,
      updateMetadata,
      updateWall,
      setSettings: setCostSettings,
      setFmlUpload: handleFMLUpload,
      resetStatus: () => setFmlStatus('idle'),
      saveProject,
      loadProject,
      persistDraftForAuth,
      logout: () => supabase.auth.signOut(),
      uploadPhotos: handleManualPhotoUpload
    },
    totals: {
      projectCost: calculateTotalProjectCost(floors, costSettings, houseMetadata)
    }
  };
}
