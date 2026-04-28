import { stockData, stockBatchData, scDeVriesData, setScDeVriesData, scComparisonData, setScComparisonData } from '../shared/state.js';

// === VOORRAAD CHECK DE VRIES TAB ===

export function scParseDateFromFilename(filename) {
    const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    const m2 = filename.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (m2) return m2[3] + '-' + m2[2] + '-' + m2[1];
    return null;
}

export function scParseODataDate(val) {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/\/Date\((-?\d+)\)\//);
    if (m) return new Date(parseInt(m[1]));
    return new Date(val);
}

export function scBuildExactBatches() {
    // Bouw per itemCode+batch de voorraadstand uit stockBatchData
    // Fallback: als stockBatchData leeg is, gebruik stockData (item-niveau per warehouse)
    const SC_WAREHOUSE = 'De Vries';

    if (stockBatchData.length > 0) {
        // Batch-level data beschikbaar
        const SC_TRANSFER_TYPE = 134;
        const map = {};
        for (const r of stockBatchData) {
            if ((r.WarehouseDescription || '') !== SC_WAREHOUSE) continue;
            const ic = r.ItemCode || '';
            const bn = r.BatchNumber || '';
            if (!ic) continue;
            const key = ic + '|' + bn;
            if (!map[key]) map[key] = { itemCode: ic, batch: bn, qty: 0, transferQty: null, transferDate: null, description: r.ItemDescription || '' };
            map[key].qty += r.Quantity || 0;
            if (r.StockTransactionType === SC_TRANSFER_TYPE && (r.Quantity || 0) > 0) {
                const mod = scParseODataDate(r.Modified || r.Created);
                if (mod && (!map[key].transferDate || mod > map[key].transferDate)) {
                    map[key].transferDate = mod;
                    map[key].transferQty = r.Quantity;
                }
            }
        }
        return { map, level: 'batch' };
    }

    // Fallback: stockPositions (item-niveau, via stockData)
    const map = {};
    for (const code of Object.keys(stockData)) {
        const item = stockData[code];
        const wh = (item.warehouses || {})[SC_WAREHOUSE];
        if (!wh || Math.abs(wh.inStock) < 0.01) continue;
        const key = code + '|'; // lege batch
        map[key] = { itemCode: code, batch: '', qty: wh.inStock, transferQty: null, transferDate: null, description: item.description || '' };
    }
    return { map, level: 'item' };
}

export function scLoadDeVriesFile(file) {
    if (!file) return;
    const statusEl = document.getElementById('scStatus');
    statusEl.textContent = 'Bestand laden...';
    const snapshotDate = scParseDateFromFilename(file.name);

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            // Detecteer kolomnamen (varianten in De Vries exports)
            const firstRow = rows[0] || {};
            const colKeys = Object.keys(firstRow);
            const artCol = colKeys.find(k => /artikel.?id/i.test(k)) || colKeys.find(k => /artikel/i.test(k) && !/omsch/i.test(k)) || 'Artikel Id';
            const qtyCol = colKeys.find(k => /aantal/i.test(k)) || 'Aantal';
            const descCol = colKeys.find(k => /omsch/i.test(k) || /omch/i.test(k)) || 'Artikel/Omchrijving';
            const batchCol = colKeys.find(k => /^partij$/i.test(k)) || colKeys.find(k => /batch/i.test(k)) || 'Partij';

            // Aggregeer per Artikel Id + Partij (batch)
            const batches = {}; // key "itemCode|batch"
            const items = {};   // key "itemCode" (totaal)
            for (const row of rows) {
                const artId = String(row[artCol] || '').trim();
                if (!artId) continue;
                const qty = parseFloat(row[qtyCol]) || 0;
                const desc = String(row[descCol] || '').trim();
                const batch = String(row[batchCol] || '').trim();
                // Per item totaal
                if (!items[artId]) items[artId] = { description: desc, qty: 0 };
                items[artId].qty += qty;
                // Per item+batch
                const bkey = artId + '|' + batch;
                if (!batches[bkey]) batches[bkey] = { itemCode: artId, batch, description: desc, qty: 0 };
                batches[bkey].qty += qty;
            }

            setScDeVriesData({ date: snapshotDate, batches, items, rowCount: rows.length });
            const batchCount = Object.keys(batches).length;
            statusEl.textContent = 'Geladen: ' + file.name + ' — ' + Object.keys(items).length + ' artikelen, ' + batchCount + ' batches, ' + rows.length + ' palletregels' +
                (snapshotDate ? ' — datum: ' + snapshotDate : '');
            scRenderComparison();
        } catch(err) {
            statusEl.textContent = 'Fout bij inlezen: ' + err.message;
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

export function scRenderComparison() {
    if (!scDeVriesData) return;
    const resultsEl = document.getElementById('scResults');
    resultsEl.style.display = '';

    const SC_WAREHOUSE = 'De Vries';

    // Check warehouse data
    let hasWarehouseData = false;
    for (const code of Object.keys(stockData)) {
        if (Object.keys(stockData[code].warehouses || {}).length > 0) { hasWarehouseData = true; break; }
    }
    if (!hasWarehouseData) {
        document.getElementById('scSummary').innerHTML = '<div style="background:#fff3e0;padding:16px;border-radius:8px;border-left:4px solid #e65100;"><strong>Warehouse-data ontbreekt in dataset.json</strong><br>Draai eerst een nieuwe sync zodat het veld <code>WarehouseDescription</code> wordt meegenomen.</div>';
        return;
    }

    // Exact data (batch of item-level)
    const exResult = scBuildExactBatches();
    const exBatches = exResult.map;
    const compareLevel = exResult.level; // 'batch' of 'item'

    // De Vries data — bij item-level: aggregeer batches per artikel
    let dvBatches;
    if (compareLevel === 'item') {
        dvBatches = {};
        for (const key of Object.keys(scDeVriesData.batches)) {
            const b = scDeVriesData.batches[key];
            const itemKey = b.itemCode + '|';
            if (!dvBatches[itemKey]) dvBatches[itemKey] = { itemCode: b.itemCode, batch: '', qty: 0, description: b.description || '' };
            dvBatches[itemKey].qty += b.qty;
        }
    } else {
        dvBatches = scDeVriesData.batches;
    }
    const dvKeys = new Set(Object.keys(dvBatches));

    // Exact batches met voorraad > 0
    const exKeys = new Set();
    for (const key of Object.keys(exBatches)) {
        if (Math.abs(exBatches[key].qty) > 0.01) exKeys.add(key);
    }

    // Categoriseer per batch
    const bothKeys = [];
    const onlyDVKeys = [];
    const onlyExKeys = [];
    for (const key of dvKeys) {
        if (exKeys.has(key)) bothKeys.push(key);
        else onlyDVKeys.push(key);
    }
    for (const key of exKeys) {
        if (!dvKeys.has(key)) onlyExKeys.push(key);
    }

    // Verschillen
    const diffs = [];
    let matchCount = 0;
    for (const key of bothKeys) {
        const dvQty = dvBatches[key].qty;
        const exQty = exBatches[key].qty;
        if (Math.abs(dvQty - exQty) < 0.5) { matchCount++; continue; }
        const ex = exBatches[key];
        diffs.push({
            key, itemCode: dvBatches[key].itemCode, batch: dvBatches[key].batch,
            description: dvBatches[key].description || ex.description || '',
            dvQty, exQty, diff: dvQty - exQty,
            transferQty: ex.transferQty, transferDate: ex.transferDate
        });
    }
    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // Cache for download
    setScComparisonData({ diffs, matchCount, bothKeys, onlyDVKeys, onlyExKeys, dvBatches, exBatches, compareLevel });

    // Samenvatting
    const summaryEl = document.getElementById('scSummary');
    const dateStr = scDeVriesData.date || 'onbekend';
    document.getElementById('scSummaryTitle').textContent = 'Samenvatting — snapshot ' + dateStr;
    const unit = compareLevel === 'item' ? 'Artikelen' : 'Batches';
    const levelNote = compareLevel === 'item'
        ? '<div style="background:#e3f2fd;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px;color:#1565c0;">Vergelijking op artikelniveau (batch-data niet beschikbaar in Exact). De Vries batches zijn geaggregeerd per artikel.</div>'
        : '';
    summaryEl.innerHTML = levelNote +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
        '<div style="background:#f0f7ff;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;">' + dvKeys.size + '</div><div style="color:#666;font-size:12px;">' + unit + ' De Vries</div></div>' +
        '<div style="background:#f0f7ff;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;">' + exKeys.size + '</div><div style="color:#666;font-size:12px;">' + unit + ' Exact — De Vries</div></div>' +
        '<div style="background:#e8f5e9;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#2e7d32;">' + matchCount + '</div><div style="color:#666;font-size:12px;">Exact gelijk</div></div>' +
        '<div style="background:#fff3e0;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#e65100;">' + diffs.length + '</div><div style="color:#666;font-size:12px;">Afwijkingen</div></div>' +
        '<div style="background:#fce4ec;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#c62828;">' + onlyDVKeys.length + '</div><div style="color:#666;font-size:12px;">Alleen De Vries</div></div>' +
        '<div style="background:#fce4ec;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#c62828;">' + onlyExKeys.length + '</div><div style="color:#666;font-size:12px;">Alleen Exact</div></div>' +
        '</div>';

    function fmtDate(d) { if (!d) return ''; return d.toLocaleDateString('nl-NL', {day:'2-digit',month:'2-digit',year:'numeric'}); }

    // Diff tabel
    const diffTable = document.getElementById('scDiffTable');
    let h = '<thead><tr><th>Artikel</th><th>Batch</th><th>Omschrijving</th><th style="text-align:right;">De Vries</th><th style="text-align:right;">Exact</th><th style="text-align:right;">Verschil</th><th style="text-align:right;">Laatste verplaatsing naar DV</th><th>Datum verplaatsing</th></tr></thead><tbody>';
    if (diffs.length === 0) {
        h += '<tr><td colspan="8" style="text-align:center;color:#888;">Geen afwijkingen gevonden</td></tr>';
    } else {
        for (const d of diffs) {
            const color = d.diff > 0 ? '#2e7d32' : '#c62828';
            const sign = d.diff > 0 ? '+' : '';
            h += '<tr><td>' + d.itemCode + '</td><td>' + d.batch + '</td><td>' + d.description + '</td>' +
                 '<td style="text-align:right;">' + Math.round(d.dvQty).toLocaleString('nl-NL') + '</td>' +
                 '<td style="text-align:right;">' + Math.round(d.exQty).toLocaleString('nl-NL') + '</td>' +
                 '<td style="text-align:right;color:' + color + ';font-weight:600;">' + sign + Math.round(d.diff).toLocaleString('nl-NL') + '</td>' +
                 '<td style="text-align:right;">' + (d.transferQty != null ? Math.round(d.transferQty).toLocaleString('nl-NL') : '') + '</td>' +
                 '<td>' + fmtDate(d.transferDate) + '</td></tr>';
        }
    }
    h += '</tbody>';
    diffTable.innerHTML = h;

    // Alleen De Vries
    const dvTable = document.getElementById('scOnlyDV');
    let h2 = '<thead><tr><th>Artikel</th><th>Batch</th><th>Omschrijving</th><th style="text-align:right;">Aantal De Vries</th></tr></thead><tbody>';
    if (onlyDVKeys.length === 0) {
        h2 += '<tr><td colspan="4" style="text-align:center;color:#888;">Geen batches gevonden</td></tr>';
    } else {
        onlyDVKeys.sort((a, b) => dvBatches[b].qty - dvBatches[a].qty);
        for (const key of onlyDVKeys) {
            const d = dvBatches[key];
            h2 += '<tr><td>' + d.itemCode + '</td><td>' + d.batch + '</td><td>' + (d.description || '') + '</td>' +
                  '<td style="text-align:right;">' + Math.round(d.qty).toLocaleString('nl-NL') + '</td></tr>';
        }
    }
    h2 += '</tbody>';
    dvTable.innerHTML = h2;

    // Alleen Exact
    const exTable = document.getElementById('scOnlyExact');
    let h3 = '<thead><tr><th>Artikel</th><th>Batch</th><th>Omschrijving</th><th style="text-align:right;">Voorraad Exact</th><th style="text-align:right;">Laatste verplaatsing naar DV</th><th>Datum verplaatsing</th></tr></thead><tbody>';
    if (onlyExKeys.length === 0) {
        h3 += '<tr><td colspan="6" style="text-align:center;color:#888;">Geen batches gevonden</td></tr>';
    } else {
        onlyExKeys.sort((a, b) => Math.abs(exBatches[b].qty) - Math.abs(exBatches[a].qty));
        for (const key of onlyExKeys) {
            const ex = exBatches[key];
            h3 += '<tr><td>' + ex.itemCode + '</td><td>' + ex.batch + '</td><td>' + (ex.description || '') + '</td>' +
                  '<td style="text-align:right;">' + Math.round(ex.qty).toLocaleString('nl-NL') + '</td>' +
                  '<td style="text-align:right;">' + (ex.transferQty != null ? Math.round(ex.transferQty).toLocaleString('nl-NL') : '') + '</td>' +
                  '<td>' + fmtDate(ex.transferDate) + '</td></tr>';
        }
    }
    h3 += '</tbody>';
    exTable.innerHTML = h3;
}

export function scDownloadExcel() {
    if (!scDeVriesData || !scComparisonData) return;
    const wb = XLSX.utils.book_new();
    const c = scComparisonData;

    // Sheet 1: Verschillen
    const diffRows = [['Artikel', 'Batch', 'Omschrijving', 'De Vries', 'Exact', 'Verschil', 'Laatste verplaatsing naar DV', 'Datum verplaatsing']];
    for (const d of c.diffs) {
        diffRows.push([d.itemCode, d.batch, d.description, d.dvQty, d.exQty, d.diff, d.transferQty || '', d.transferDate ? d.transferDate.toISOString().slice(0,10) : '']);
    }
    // Also add matches
    for (const key of c.bothKeys) {
        const dvQty = c.dvBatches[key].qty;
        const exQty = c.exBatches[key].qty;
        if (Math.abs(dvQty - exQty) >= 0.5) continue;
        const ex = c.exBatches[key];
        diffRows.push([c.dvBatches[key].itemCode, c.dvBatches[key].batch, c.dvBatches[key].description, dvQty, exQty, 0, ex.transferQty || '', ex.transferDate ? ex.transferDate.toISOString().slice(0,10) : '']);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(diffRows);
    ws1['!cols'] = [{wch:12},{wch:12},{wch:50},{wch:12},{wch:12},{wch:12},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Verschillen');

    // Sheet 2: Alleen De Vries
    const dvOnlyRows = [['Artikel', 'Batch', 'Omschrijving', 'Aantal De Vries']];
    for (const key of c.onlyDVKeys) {
        const d = c.dvBatches[key];
        dvOnlyRows.push([d.itemCode, d.batch, d.description || '', d.qty]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(dvOnlyRows);
    ws2['!cols'] = [{wch:12},{wch:12},{wch:50},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Alleen De Vries');

    // Sheet 3: Alleen Exact
    const exOnlyRows = [['Artikel', 'Batch', 'Omschrijving', 'Voorraad Exact', 'Laatste verplaatsing naar DV', 'Datum verplaatsing']];
    for (const key of c.onlyExKeys) {
        const ex = c.exBatches[key];
        exOnlyRows.push([ex.itemCode, ex.batch, ex.description || '', ex.qty, ex.transferQty || '', ex.transferDate ? ex.transferDate.toISOString().slice(0,10) : '']);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(exOnlyRows);
    ws3['!cols'] = [{wch:12},{wch:12},{wch:50},{wch:16},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Alleen Exact');

    const dateStr = scDeVriesData.date || new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Voorraad_Check_De_Vries_' + dateStr + '.xlsx');
}

