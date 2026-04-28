
import { Floor, CostSettings, HouseMetadata } from '../types';
import { getRoomCostBreakdown, calculateFloorManifoldCost, getOnvoorzienPct } from './costEngine';

/**
 * Generates a high-fidelity PDF report by creating a hidden print window
 * with professional styling and detailed cost breakdowns.
 */
export const generatePDFReport = (
  floors: Floor[],
  costSettings: CostSettings,
  houseMetadata: HouseMetadata,
  houseHasKitchen: boolean,
  floorCosts: { id: string; total: number }[],
  totalProjectCost: number
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const today = new Date().toLocaleDateString('nl-NL');
  const totalM2 = Math.round(floors.reduce((acc, f) => acc + (f.rooms || []).reduce((ra, r) => ra + (r.metrics?.floorArea || 0), 0), 0));
  const globalSubfloor = houseMetadata.globalSubfloor || 'BETON';
  
  // Projectbrede checks (voor de overzichtspagina)
  let scaffoldingNeeded = false;
  let totalWindowArea = 0;
  let maxLevel = 0;
  let hasWindowReplacement = false; // voor éénmalige opstartkosten kozijnen
  let hasSliding = false;           // voor puincontainer bij schuifpui

  floors.forEach((f, idx) => {
    maxLevel = Math.max(maxLevel, idx);
    f.rooms.forEach(r => {
      const manual = r.analysis?.find(a => a.source === 'manual');
      const actions = manual?.actions;
      if (actions?.replaceWindows) {
        hasWindowReplacement = true;
        totalWindowArea += r.metrics.extWindowArea;
        if (idx > 0) scaffoldingNeeded = true;
      }
      if (actions?.replaceSlidingDoor) {
        hasSliding = true;
        if (idx > 0) scaffoldingNeeded = true;
      }
    });
  });

  let html = `
    <html>
      <head>
        <title>Renovatie Rapportage - ${houseMetadata.address || 'Project'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
          .header { border-bottom: 4px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
          .project-info h1 { margin: 0; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.05em; }
          .project-info p { margin: 5px 0 0; font-weight: 700; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; }
          .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 40px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .summary-item label { display: block; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
          .summary-item span { font-size: 16px; font-weight: 900; color: #0f172a; }
          .floor-section { margin-bottom: 40px; page-break-inside: avoid; }
          .floor-header { background: #111827; color: white; padding: 12px 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
          .floor-header h2 { margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase; }
          .room-box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 15px; page-break-inside: avoid; }
          .room-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
          .room-name h3 { margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase; color: #0f172a; }
          .room-metrics { display: flex; gap: 15px; margin-top: 4px; font-size: 11px; font-weight: 700; color: #94a3b8; }
          .room-total { font-weight: 900; color: #10b981; font-size: 16px; }
          .calculation-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .calculation-table th { text-align: left; padding: 8px; color: #94a3b8; font-weight: 900; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #f1f5f9; }
          .calculation-table td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
          .calculation-table .cost { text-align: right; font-weight: 900; }
          .calculation-table .calc { color: #64748b; font-size: 11px; }
          .floor-overhead { background: #f1f5f9; border-radius: 12px; padding: 15px 20px; margin-top: 10px; border: 1px dashed #cbd5e1; }
          .warning-container { margin-top: 50px; page-break-inside: avoid; border: 2px solid #ef4444; border-radius: 16px; background-color: #fef2f2; padding: 24px; }
          .warning-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: #b91c1c; }
          .warning-header svg { width: 24px; height: 24px; }
          .warning-header h2 { margin: 0; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
          .warning-content { font-size: 11px; color: #7f1d1d; line-height: 1.6; }
          .warning-item { margin-bottom: 12px; }
          .warning-item strong { display: block; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
          .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          .sub-detail { font-size: 10px; color: #64748b; padding-left: 10px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="project-info">
            <h1>${houseMetadata.address || houseMetadata.name}</h1>
            <p>${houseMetadata.postcode || ''} ${houseMetadata.city || ''}</p>
          </div>
          <div style="text-align: right">
            <p style="margin:0; font-size:10px; font-weight:900; color:#94a3b8; text-transform:uppercase;">Datum Rapport</p>
            <div style="font-size:14px; font-weight:900;">${today}</div>
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-item">
            <label>Ondervloer</label>
            <span>${globalSubfloor === 'HOUT' ? 'Hout (Droogbouw)' : 'Beton (Infrezen)'}</span>
          </div>
          <div class="summary-item">
            <label>Energielabel</label>
            <span>${houseMetadata.energyLabel || 'N/A'}</span>
          </div>
          <div class="summary-item">
            <label>Totaal M²</label>
            <span>${totalM2} m²</span>
          </div>
          <div class="summary-item">
            <label>Indicatieve Raming</label>
            <span style="color:#10b981; font-size:14px;">€ ${Math.round(totalProjectCost * (1 - (costSettings.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – € ${Math.round(totalProjectCost * (1 + (costSettings.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}</span>
            <span style="display:block; font-size:10px; font-weight:700; color:#94a3b8; margin-top:3px;">
              Puntschatting: € ${Math.round(totalProjectCost).toLocaleString('nl-NL')}
            </span>
          </div>
        </div>
  `;

  floors.forEach(floor => {
    const fCost = floorCosts.find(c => c.id === floor.id)?.total || 0;
    let floorHeatingArea = 0;

    html += `
      <div class="floor-section">
        <div class="floor-header">
          <h2>${floor.name}</h2>
          <span>€ ${Math.round(fCost).toLocaleString('nl-NL')}</span>
        </div>
    `;

    (floor.rooms || []).forEach(room => {
      let breakdown;
      try {
        breakdown = getRoomCostBreakdown(room, costSettings, houseHasKitchen, globalSubfloor);
      } catch (e) {
        return;
      }
      
      if (breakdown.totalCost === 0) return;

      const manual = room.analysis?.find(a => a.source === 'manual');
      if (manual?.actions.underfloorHeating) {
        floorHeatingArea += room.metrics.floorArea;
      }

      html += `
        <div class="room-box">
          <div class="room-header">
            <div class="room-name">
              <h3>${room.name}</h3>
              <div class="room-metrics">
                <span>Vloer: ${(room.metrics?.floorArea || 0).toFixed(1)} m²</span>
                <span>Wand: ${(room.metrics?.wallArea || 0).toFixed(1)} m²</span>
                <span>Plafond: ${(room.metrics?.ceilingArea || 0).toFixed(1)} m²</span>
              </div>
            </div>
            <div class="room-total">€ ${Math.round(breakdown.totalCost).toLocaleString('nl-NL')}</div>
          </div>
          <table class="calculation-table">
            <thead>
              <tr>
                <th>Activiteit</th>
                <th>Berekening</th>
                <th class="cost">Kosten</th>
              </tr>
            </thead>
            <tbody>
      `;

      // 1. Wand & Plafond
      if (breakdown.wallPaintCost > 0) {
        html += `<tr><td>Wanden schilderen</td><td class="calc">${(room.metrics?.wallArea || 0).toFixed(1)}m² x €${costSettings.paintWalls}</td><td class="cost">€ ${Math.round(breakdown.wallPaintCost)}</td></tr>`;
      }
      if (breakdown.ceilingPaintCost > 0) {
        html += `<tr><td>Plafond schilderen</td><td class="calc">${(room.metrics?.ceilingArea || 0).toFixed(1)}m² x €${costSettings.paintCeiling}</td><td class="cost">€ ${Math.round(breakdown.ceilingPaintCost)}</td></tr>`;
      }
      if (breakdown.wallPlasterCost > 0) {
        html += `<tr><td>Wanden stucen</td><td class="calc">${(room.metrics?.wallArea || 0).toFixed(1)}m² x €${costSettings.plasterWalls}</td><td class="cost">€ ${Math.round(breakdown.wallPlasterCost)}</td></tr>`;
      }
      if (breakdown.ceilingPlasterCost > 0) {
        html += `<tr><td>Plafond stucen</td><td class="calc">${(room.metrics?.ceilingArea || 0).toFixed(1)}m² x €${costSettings.plasterCeiling}</td><td class="cost">€ ${Math.round(breakdown.ceilingPlasterCost)}</td></tr>`;
      }
      
      // 2. Vloeren & Verwarming
      if (breakdown.floorRemovalCost > 0) {
        html += `<tr><td>Oude vloer verwijderen</td><td class="calc">${(room.metrics?.floorArea || 0).toFixed(1)}m² x €${costSettings.floorRemoval}</td><td class="cost">€ ${Math.round(breakdown.floorRemovalCost)}</td></tr>`;
      }
      if (breakdown.heatingInstallationCost > 0) {
        const hPrice = globalSubfloor === 'HOUT' ? costSettings.heatingM2Wood : costSettings.heatingM2Concrete;
        html += `<tr><td>Vloerw. installatie (${globalSubfloor === 'HOUT' ? 'Droogbouw' : 'Infrezen'})</td><td class="calc">${(room.metrics?.floorArea || 0).toFixed(1)}m² x €${hPrice}</td><td class="cost">€ ${Math.round(breakdown.heatingInstallationCost)}</td></tr>`;
      }
      if (breakdown.levelingCost > 0) {
        html += `<tr><td>Egaliseren vloer</td><td class="calc">${(room.metrics?.floorArea || 0).toFixed(1)}m² x €${costSettings.levelingPVC}</td><td class="cost">€ ${Math.round(breakdown.levelingCost)}</td></tr>`;
      }
      if (breakdown.floorCost > 0) {
        const floorAction = manual?.actions.floorAction || 'NIEUW';
        if (floorAction === 'RENOVEREN') {
          html += `<tr><td>Vloer renoveren</td><td class="calc">${(room.metrics?.floorArea || 0).toFixed(1)}m² x €${costSettings.floorRenoveren}</td><td class="cost">€ ${Math.round(breakdown.floorCost)}</td></tr>`;
        } else {
          const floorType = manual?.floorType || 'pvc';
          const floorLabels: Record<string, string> = {
            pvc: 'PVC (Standaard)',
            pvcVisgraat: 'PVC (Visgraat)',
            gietvloer: 'Gietvloer (PU)',
            lamelparket: 'Lamelparket',
          };
          const unitPrice =
            floorType === 'pvc'         ? costSettings.floorPVC :
            floorType === 'pvcVisgraat' ? costSettings.floorPVCVisgraat :
            floorType === 'gietvloer'   ? costSettings.floorGietvloer :
            floorType === 'lamelparket' ? costSettings.floorLamelparket :
            costSettings.floorPVC;
          const floorLabel = floorLabels[floorType] || floorType.toUpperCase();
          html += `<tr><td>Vloer vernieuwen (${floorLabel})</td><td class="calc">${(room.metrics?.floorArea || 0).toFixed(1)}m² x €${unitPrice}</td><td class="cost">€ ${Math.round(breakdown.floorCost)}</td></tr>`;
        }
      }

      // 3. Verduurzaming (Ramen/Kozijnen) - UITGEBREID
      if (breakdown.windowRenovationCost > 0 && manual?.actions.replaceWindows) {
        const actions = manual.actions;
        let matPrice = costSettings.glassMaterial;
        let labPrice = costSettings.laborGlassOnly;
        
        if (actions.windowType === 'KOZIJN_KUNSTSTOF') { matPrice = costSettings.kozijnKunststofMaterial; labPrice = costSettings.laborFullFrame; }
        else if (actions.windowType === 'KOZIJN_HOUT') { matPrice = costSettings.kozijnHoutMaterial; labPrice = costSettings.laborFullFrame; }
        else if (actions.windowType === 'KOZIJN_ALUMINIUM') { matPrice = costSettings.kozijnAluMaterial; labPrice = costSettings.laborFullFrame; }
        
        const tripleSurcharge = actions.glassType === 'HR+++' ? costSettings.tripleGlassSurcharge : 0;
        
        const matTotal = room.metrics.extWindowArea * matPrice;
        const labTotal = room.metrics.extWindowArea * labPrice;
        const tripleTotal = room.metrics.extWindowArea * tripleSurcharge;
        const finishingTotal = room.metrics.extWindowCount * costSettings.windowFinishingCost;

        html += `
          <tr>
            <td colspan="2" style="font-weight:700; background: #fcfcfc;">Ramen/Kozijnen: ${actions.windowType.replace('KOZIJN_', '').toLowerCase()} (${actions.glassType})</td>
            <td class="cost" style="background: #fcfcfc;">€ ${Math.round(breakdown.windowRenovationCost)}</td>
          </tr>
          <tr><td class="sub-detail">Materiaal kozijn & glas</td><td class="calc">${room.metrics.extWindowArea.toFixed(1)}m² x €${matPrice}</td><td class="cost">€ ${Math.round(matTotal)}</td></tr>
          <tr><td class="sub-detail">Montage & Arbeid</td><td class="calc">${room.metrics.extWindowArea.toFixed(1)}m² x €${labPrice}</td><td class="cost">€ ${Math.round(labTotal)}</td></tr>
        `;

        if (tripleTotal > 0) {
          html += `<tr><td class="sub-detail">Toeslag Triple Glas (HR+++)</td><td class="calc">${room.metrics.extWindowArea.toFixed(1)}m² x €${tripleSurcharge}</td><td class="cost">€ ${Math.round(tripleTotal)}</td></tr>`;
        }

        html += `
          <tr><td class="sub-detail">Binnenafwerking dagkanten/vensterbanken</td><td class="calc">${room.metrics.extWindowCount} stuks x €${costSettings.windowFinishingCost}</td><td class="cost">€ ${Math.round(finishingTotal)}</td></tr>
        `;
      }

      // 4. Verduurzaming (Schuifpui) - UITGEBREID
      if (breakdown.slidingDoorRenovationCost > 0 && manual?.actions.replaceSlidingDoor) {
        const slidingOpenings = room.openings.filter(o => o.type === 'door' && o.width > 105 && o.isExternal);
        const totalWidthM = slidingOpenings.reduce((sum, o) => sum + (o.width / 100), 0);
        const numDoors = slidingOpenings.length;
        
        let matPerM = costSettings.slidingMaterialKunststof;
        if (manual.actions.slidingDoorType.includes('HOUT') || manual.actions.slidingDoorType.includes('ALU')) {
            matPerM = costSettings.slidingMaterialHoutAlu;
        }
        
        const matTotal = totalWidthM * matPerM;
        const laborTotal = numDoors * costSettings.slidingLaborFixed;

        html += `
          <tr>
            <td colspan="2" style="font-weight:700; background: #fcfcfc;">Schuifpui: ${manual.actions.slidingDoorType.toLowerCase()}</td>
            <td class="cost" style="background: #fcfcfc;">€ ${Math.round(breakdown.slidingDoorRenovationCost)}</td>
          </tr>
          <tr><td class="sub-detail">Materiaalkosten schuifpui</td><td class="calc">${totalWidthM.toFixed(1)}m¹ x €${matPerM}</td><td class="cost">€ ${Math.round(matTotal)}</td></tr>
          <tr><td class="sub-detail">Montage (kraan/extra personeel)</td><td class="calc">${numDoors} stuks x €${costSettings.slidingLaborFixed}</td><td class="cost">€ ${Math.round(laborTotal)}</td></tr>
        `;
      }
      
      // 5. Sanitair & Keuken
      if (breakdown.toiletCost > 0) {
        html += `<tr><td>Toilet renovatie</td><td class="calc">Standaard post (${manual?.actions.toiletQuality || 'BASIS'})</td><td class="cost">€ ${Math.round(breakdown.toiletCost)}</td></tr>`;
      }
      if (breakdown.bathroomCost > 0) {
        html += `<tr><td>Badkamer renovatie</td><td class="calc">Standaard post (${manual?.actions.bathroomQuality || 'BASIS'})</td><td class="cost">€ ${Math.round(breakdown.bathroomCost)}</td></tr>`;
      }
      if (breakdown.kitchenCost > 0) {
        html += `<tr><td>Keuken renovatie</td><td class="calc">Standaard post (${manual?.actions.kitchenQuality || 'BASIS'})</td><td class="cost">€ ${Math.round(breakdown.kitchenCost)}</td></tr>`;
      }

      // 6. Overige werkzaamheden (vrije invoer)
      (manual?.customItems || []).forEach(item => {
        html += `<tr><td>${item.label}</td><td class="calc">${item.unitLabel}${item.note ? ' · ' + item.note : ''}</td><td class="cost">€ ${Math.round(item.costEstimate)}</td></tr>`;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    });

    // MUUR SLOOP — per muur een eigen box binnen de verdieping
    const demolWallsOnFloor = (floor.walls || []).filter(w => !w.isExternal && w.isMarkedForRemoval);
    demolWallsOnFloor.forEach(wall => {
      const perM = wall.isDragend ? costSettings.wallDragendPerM : costSettings.wallNietDragendPerM;
      const perMCost = perM * wall.length;
      html += `
        <div class="room-box" style="border-color:#fecaca;">
          <div class="room-header">
            <div class="room-name">
              <h3 style="color:#dc2626;">
                Muur Slopen ${wall.thickness ? `${wall.thickness} cm` : ''}
              </h3>
              <div class="room-metrics">
                <span>${wall.length.toFixed(2)} m¹</span>
                <span style="color:${wall.isDragend ? '#1d4ed8' : '#15803d'}; font-weight:900;">
                  ${wall.isDragend ? '● Dragend' : '● Niet-dragend'}
                </span>
              </div>
            </div>
            <div class="room-total" style="color:#dc2626;">€ ${Math.round(perMCost).toLocaleString('nl-NL')}</div>
          </div>
          <table class="calculation-table">
            <thead>
              <tr>
                <th>Activiteit</th>
                <th>Berekening</th>
                <th class="cost">Kosten</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sloopkosten${wall.isDragend ? ' + staalconstructie + afwerking' : ' + afvoer + afwerking'}</td>
                <td class="calc">${wall.length.toFixed(2)} m¹ × €${perM}/m¹</td>
                <td class="cost">€ ${Math.round(perMCost).toLocaleString('nl-NL')}</td>
              </tr>
              <tr>
                <td class="sub-detail">Opstartkosten <em>(éénmalig per type — zie Projectbreed)</em></td>
                <td class="calc">${wall.isDragend ? 'Berekening, vergunning, stempels' : 'Container, afdekken, transport'}</td>
                <td class="cost" style="color:#94a3b8;">p.m.</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    });

    // VERDIEPING OVERHEAD (VERDELER)
    if (floorHeatingArea > 0) {
      const manifoldCost = calculateFloorManifoldCost(floorHeatingArea, costSettings);
      const numGroups = Math.ceil(floorHeatingArea / 11);
      html += `
        <div class="floor-overhead">
          <table class="calculation-table">
            <tbody>
              <tr>
                <td style="font-weight:900; border:none; padding:0;">Vloerverwarming Verdeler & Groepen</td>
                <td class="calc" style="border:none; padding:0;">Basis (€${costSettings.heatingBase}) + ${numGroups} groepen x €${costSettings.heatingPerGroup}</td>
                <td class="cost" style="border:none; padding:0;">€ ${Math.round(manifoldCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    html += `</div>`;
  });

  // PROJECTBREDE KOSTEN (STEIGER, CONTAINER + MUUR SLOOP OPSTARTKOSTEN)
  let generalOverhead = 0;
  let overheadRows = "";

  // Muur sloop opstartkosten — éénmalig per type, ongeacht aantal muren
  const allDemolWalls = floors.flatMap(f => (f.walls || []).filter(w => !w.isExternal && w.isMarkedForRemoval));
  const demolHasNiet = allDemolWalls.some(w => !w.isDragend);
  const demolHasDrag = allDemolWalls.some(w =>  w.isDragend);
  if (demolHasNiet) {
    generalOverhead += costSettings.wallNietDragendStartup;
    overheadRows += `<tr><td>Opstartkosten sloop niet-dragende muren <span style="color:#15803d;">(éénmalig)</span></td><td class="calc">Container, afdekken, transport</td><td class="cost">€ ${Math.round(costSettings.wallNietDragendStartup).toLocaleString('nl-NL')}</td></tr>`;
  }
  if (demolHasDrag) {
    generalOverhead += costSettings.wallDragendStartup;
    overheadRows += `<tr><td>Opstartkosten sloop dragende muren <span style="color:#1d4ed8;">(éénmalig)</span></td><td class="calc">Berekening, vergunning, stempels/steunconstructie</td><td class="cost">€ ${Math.round(costSettings.wallDragendStartup).toLocaleString('nl-NL')}</td></tr>`;
  }

  // Éénmalige opstartkosten ramen/kozijnen
  if (hasWindowReplacement) {
    generalOverhead += costSettings.windowStartupCost;
    overheadRows += `<tr><td>Opstartkosten Ramen & Kozijnen <span style="color:#0369a1;">(éénmalig per project)</span></td><td class="calc">Logistiek, steiger, aansturing</td><td class="cost">€ ${costSettings.windowStartupCost}</td></tr>`;
  }

  if (scaffoldingNeeded) {
    generalOverhead += costSettings.scaffoldingBase;
    overheadRows += `<tr><td>Steigerwerk & Klimmateriaal (1e etage+)</td><td class="calc">Vast basistarief</td><td class="cost">€ ${costSettings.scaffoldingBase}</td></tr>`;
    if (maxLevel > 1) {
      const surcharge = (maxLevel - 1) * costSettings.heightSurcharge;
      generalOverhead += surcharge;
      overheadRows += `<tr><td>Hoogte-toeslag (${maxLevel} verdiepingen)</td><td class="calc">${maxLevel - 1}x extra etages</td><td class="cost">€ ${surcharge}</td></tr>`;
    }
  }

  // Puincontainer: groot glasoppervlak OF schuifpui vervanging
  if (totalWindowArea > 10 || hasSliding) {
    generalOverhead += costSettings.wasteContainerCost;
    const containerReason = hasSliding && totalWindowArea <= 10
      ? 'Schuifpui vervanging (kozijn + glas)'
      : `Volume > 10m² glasoppervlak (${totalWindowArea.toFixed(1)}m²)`;
    overheadRows += `<tr><td>Puincontainer (Glas/Kozijnafval)</td><td class="calc">${containerReason}</td><td class="cost">€ ${costSettings.wasteContainerCost}</td></tr>`;
  }

  if (generalOverhead > 0) {
    html += `
      <div class="floor-section" style="page-break-before: auto;">
        <div class="floor-header" style="background:#475569">
          <h2>Projectbreed & Logistiek</h2>
          <span>€ ${Math.round(generalOverhead).toLocaleString('nl-NL')}</span>
        </div>
        <div class="room-box">
          <table class="calculation-table">
             <thead>
              <tr>
                <th>Item</th>
                <th>Voorwaarde</th>
                <th class="cost">Kosten</th>
              </tr>
            </thead>
            <tbody>
              ${overheadRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ONVOORZIENE KOSTEN SECTIE
  const onvoorzienPct = getOnvoorzienPct(houseMetadata.yearBuilt, costSettings);
  const subtotalBeforeOnvoorzien = Math.round(totalProjectCost / (1 + onvoorzienPct / 100));
  const onvoorzienAmount = Math.round(totalProjectCost) - subtotalBeforeOnvoorzien;
  const onvoorzienYearLabel = (() => {
    if (!houseMetadata.yearBuilt) return 'Bouwjaar onbekend — middentarief gehanteerd';
    const y = parseInt(houseMetadata.yearBuilt, 10);
    if (y > 2010) return `Bouwjaar ${houseMetadata.yearBuilt} — nieuwbouw (na 2010)`;
    if (y >= 1945) return `Bouwjaar ${houseMetadata.yearBuilt} — bestaande bouw (1945–2010)`;
    return `Bouwjaar ${houseMetadata.yearBuilt} — oudbouw (voor 1945)`;
  })();

  html += `
    <div class="floor-section" style="page-break-before: auto;">
      <div class="floor-header" style="background:#475569;">
        <h2>Kostensamenvatting</h2>
        <span>€ ${Math.round(totalProjectCost).toLocaleString('nl-NL')}</span>
      </div>
      <div class="room-box">
        <table class="calculation-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Toelichting</th>
              <th class="cost">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Subtotaal renovatiekosten</td>
              <td class="calc">Alle ruimtes, verdiepingen, muren &amp; projectbrede kosten</td>
              <td class="cost">€ ${subtotalBeforeOnvoorzien.toLocaleString('nl-NL')}</td>
            </tr>
            <tr>
              <td>Onvoorziene kosten (${onvoorzienPct}%)</td>
              <td class="calc">${onvoorzienYearLabel} · Risicoreserve voor verborgen gebreken en meerwerk</td>
              <td class="cost">+ € ${onvoorzienAmount.toLocaleString('nl-NL')}</td>
            </tr>
            <tr style="border-top: 2px solid #e2e8f0;">
              <td style="font-weight:900; padding-top:14px;">Puntschatting</td>
              <td style="padding-top:14px; color:#64748b; font-size:12px;">Inclusief onvoorzien</td>
              <td class="cost" style="font-size:14px; color:#475569; padding-top:14px;">€ ${Math.round(totalProjectCost).toLocaleString('nl-NL')}</td>
            </tr>
            <tr style="border-top: 2px solid #d1fae5; background:#f0fdf4;">
              <td style="font-weight:900; padding-top:12px; padding-bottom:12px; color:#065f46;">INDICATIEVE RAMING (–${costSettings.rangeMin ?? 15}% / +${costSettings.rangeMax ?? 25}%)</td>
              <td style="padding-top:12px; color:#064e3b; font-size:11px;">Fase 1 scan — definitief na inspectie door aannemer</td>
              <td class="cost" style="font-size:15px; color:#10b981; font-weight:900; padding-top:12px; padding-bottom:12px;">€ ${Math.round(totalProjectCost * (1 - (costSettings.rangeMin ?? 15) / 100)).toLocaleString('nl-NL')} – € ${Math.round(totalProjectCost * (1 + (costSettings.rangeMax ?? 25) / 100)).toLocaleString('nl-NL')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // DISLAIMER & WAARSCHUWING
  html += `
    <div class="warning-container">
      <div class="warning-header">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <h2>Belangrijke Informatie & Disclaimer</h2>
      </div>
      <div class="warning-content">
        <div class="warning-item">
          <strong>1. Indicatief karakter</strong>
          Deze kostenberekening is uitsluitend bedoeld als globale indicatie en is gebaseerd op een digitale analyse. Er kunnen op geen enkele wijze rechten worden ontleend aan de genoemde bedragen, berekeningen, dimensies of hoeveelheden.
        </div>
        <div class="warning-item">
          <strong>2. Verplichte controle</strong>
          De feitelijke situatie moet op locatie door een erkend aannemer of vakspecialist worden gecontroleerd en definitief worden ingemeten. Afwijkingen in de praktijk kunnen leiden tot aanzienlijke prijsverschillen.
        </div>
        <div class="warning-item">
          <strong>3. Onvoorziene kosten inbegrepen</strong>
          Deze raming bevat een risicoreserve van ${onvoorzienPct}% voor onvoorziene kosten, gebaseerd op het bouwjaar van de woning. Deze post dekt risico's zoals verborgen gebreken (houtrot, constructieve fouten), asbestinventarisatie of meerwerk dat pas bij uitvoering aan het licht komt. De reservering vervangt geen professioneel bouwkundig onderzoek.
        </div>
            <div class="warning-item">
          <strong>4. GEBRUIKSVOORWAARDEN</strong>
          Op het gebruik van deze tool en de totstandkoming van deze rapportage zijn onze algemene gebruiksvoorwaarden van toepassing. Door gebruik te maken van deze dienst gaat u akkoord met deze voorwaarden, waarin tevens bepalingen omtrent de beperking van onze aansprakelijkheid zijn opgenomen. Raadpleeg de volledige voorwaarden op onze website of in de app.
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Gegenereerd door VerbouwScan &copy; ${new Date().getFullYear()} - Vertrouwelijk renovatieadvies op basis van marktconforme eenheidsprijzen.</p>
    </div>
    <script>
      window.onload = () => { window.print(); };
    </script>
  </body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Returns the report as an HTML string (without auto-print script).
 * Used to attach the report to emails.
 */
export const generateReportHTML = (
  floors: Floor[],
  costSettings: CostSettings,
  houseMetadata: HouseMetadata,
  houseHasKitchen: boolean,
  floorCosts: { id: string; total: number }[],
  totalProjectCost: number
): string => {
  // Reuse generatePDFReport logic by temporarily intercepting window.open
  // Instead, we rebuild the HTML inline here without the print script.
  const dummy = { document: { write: (_h: string) => {}, close: () => {} } };
  let captured = '';
  const origOpen = window.open;
  (window as any).open = () => {
    return {
      document: {
        write: (h: string) => { captured = h; },
        close: () => {},
      }
    };
  };
  generatePDFReport(floors, costSettings, houseMetadata, houseHasKitchen, floorCosts, totalProjectCost);
  (window as any).open = origOpen;
  // Remove auto-print script
  return captured.replace(/<script>[\s\S]*?window\.onload[\s\S]*?<\/script>/, '');
};
