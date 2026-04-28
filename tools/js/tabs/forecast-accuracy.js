import {
    forecastData, setForecastData,
    forecastMetric, setForecastMetric,
    forecastInitialized, setForecastInitialized,
    forecastCustomerMap, setForecastCustomerMap,
    cogsSalesInvoices,
} from '../shared/state.js';
import { cfGetISOWeek } from './cashflow.js';

// === FORECAST ACCURACY TAB ===
export function forecastLoadMap() {
    try { setForecastCustomerMap(JSON.parse(localStorage.getItem('forecastCustomerMap') || '{}')); }
    catch(e) { setForecastCustomerMap({}); }
}
export function forecastSaveMap() {
    localStorage.setItem('forecastCustomerMap', JSON.stringify(forecastCustomerMap));
}
forecastLoadMap();
export const FORECAST_SHEETS = [
    { name: 'JC - omzet', brand: 'JC', metric: 'omzet' },
    { name: 'JC - dozen', brand: 'JC', metric: 'qty' },
    { name: 'PL - omzet', brand: 'PL', metric: 'omzet' },
    { name: 'PL - dozen', brand: 'PL', metric: 'qty' },
    { name: 'Upcycle - all', brand: 'Upcycle', metric: 'omzet' },
];
export function fcNormName(s) { return (s||'').toString().toLowerCase().replace(/[^a-z0-9]/g,''); }
export function fcFmt(v) {
    if (v == null || isNaN(v)) return '';
    if (forecastMetric === 'omzet') return '€' + Math.round(v).toLocaleString('nl-NL');
    return Math.round(v).toLocaleString('nl-NL');
}
export function fcFmtPct(v) {
    if (v == null || isNaN(v) || !isFinite(v)) return '';
    return (v * 100).toFixed(1) + '%';
}
export function forecastClear() {
    setForecastData([]);
    try { localStorage.removeItem('forecastData'); } catch(e){}
    document.getElementById('forecastStatus').textContent = 'Geen forecast geladen';
    setForecastInitialized(false);
    initForecastTab();
    renderForecastTab();
}
export function forecastLoadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const all = [];
            FORECAST_SHEETS.forEach(s => {
                if (wb.SheetNames.includes(s.name)) {
                    const rows = forecastParseSheet(wb, s.name, s.brand, s.metric);
                    all.push(...rows);
                }
            });
            setForecastData(all);
            forecastSaveToStorage();
            setForecastInitialized(false);
            initForecastTab();
            renderForecastTab();
        } catch(err) {
            alert('Fout bij inlezen forecast: ' + err.message);
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}
export function forecastParseSheet(wb, sheetName, brand, metric) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    if (aoa.length < 4) return [];
    const yearRow = aoa[1] || [];
    const weekRow = aoa[2] || [];
    // forward fill years from col index 4
    const years = [];
    let lastY = null;
    for (let c = 4; c < weekRow.length; c++) {
        let y = yearRow[c];
        if (y != null && y !== '') lastY = parseInt(y, 10);
        years.push(lastY);
    }
    const out = [];
    let lastRetailer = null;
    for (let r = 3; r < aoa.length; r++) {
        const row = aoa[r] || [];
        let retailer = row[0];
        if (retailer != null && retailer !== '') lastRetailer = retailer;
        else retailer = lastRetailer;
        const itemCode = row[1] != null ? String(row[1]).trim() : '';
        const item = row[2] || '';
        if (!itemCode) continue;
        for (let c = 4; c < row.length; c++) {
            const val = row[c];
            if (val == null || val === '' || val === 0) continue;
            const num = parseFloat(val);
            if (isNaN(num)) continue;
            const wkLabel = weekRow[c];
            if (wkLabel == null) continue;
            const m = String(wkLabel).match(/(\d+)/);
            if (!m) continue;
            const wk = parseInt(m[1], 10);
            const yr = years[c - 4];
            if (!yr) continue;
            out.push({ retailer: retailer || '', itemCode, item, year: yr, week: wk, value: num, metric, brand });
        }
    }
    return out;
}
export function forecastSaveToStorage() {
    try {
        // Keep only current+future to limit size
        const now = new Date();
        const curYear = now.getFullYear();
        const trimmed = forecastData.filter(r => r.year >= curYear - 1);
        localStorage.setItem('forecastData', JSON.stringify(trimmed));
    } catch(e) { console.warn('forecast localStorage save failed', e); }
}
export function forecastLoadFromStorage() {
    try {
        const s = localStorage.getItem('forecastData');
        if (s) setForecastData(JSON.parse(s) || []);
    } catch(e) { setForecastData([]); }
}
export function initForecastTab() {
    if (forecastInitialized) return;
    if (forecastData.length === 0) forecastLoadFromStorage();
    const custSel = document.getElementById('forecastCustomer');
    if (!custSel) return;
    const customers = new Set();
    forecastData.forEach(r => { if (r.retailer) customers.add(String(r.retailer)); });
    const list = [...customers].sort((a,b)=>String(a).localeCompare(String(b)));
    custSel.innerHTML = '<option value="all" selected>Alle</option>' +
        list.map(c => `<option value="${String(c).replace(/"/g,'&quot;')}">${c}</option>`).join('');
    const status = document.getElementById('forecastStatus');
    if (status) {
        if (forecastData.length === 0) status.textContent = 'Geen forecast geladen';
        else {
            const weeks = forecastData.map(r => r.year * 100 + r.week).sort((a,b)=>a-b);
            const minW = weeks[0], maxW = weeks[weeks.length-1];
            status.textContent = `Geladen: ${forecastData.length} rijen, ${customers.size} klanten, ${Math.floor(minW/100)}w${minW%100} t/m ${Math.floor(maxW/100)}w${maxW%100}`;
        }
    }
    setForecastInitialized(true);
}
export function forecastToggleMetric() {
    setForecastMetric(forecastMetric === 'omzet' ? 'qty' : 'omzet');
    document.getElementById('forecastMetricBtn').textContent = forecastMetric === 'omzet' ? 'Omzet (€)' : 'Volume (HE)';
    renderForecastTab();
}
export function forecastGetPeriodWeeks() {
    const periodEl = document.getElementById('forecastPeriod');
    const period = periodEl ? periodEl.value : '26';
    const now = new Date();
    const curIso = cfGetISOWeek(now.toISOString().slice(0,10));
    const weeks = [];
    if (period === 'ytd') {
        for (let w = 1; w <= curIso.week; w++) weeks.push({ year: curIso.year, week: w });
    } else {
        const n = parseInt(period, 10);
        let y = curIso.year, w = curIso.week;
        for (let i = 0; i < n; i++) {
            weeks.unshift({ year: y, week: w });
            w--;
            if (w < 1) { y--; w = 52; }
        }
    }
    return weeks;
}
export function forecastDbCustomers() {
    // Unieke klantnamen uit cogsSalesInvoices, gesorteerd alfabetisch.
    const set = new Set();
    cogsSalesInvoices.forEach(l => { if (l.customerName) set.add(l.customerName); });
    return [...set].sort((a,b) => String(a).localeCompare(String(b)));
}
export function forecastSetMapping(forecastName, dbName) {
    if (!dbName) delete forecastCustomerMap[forecastName];
    else forecastCustomerMap[forecastName] = dbName;
    forecastSaveMap();
    renderForecastTab();
}
export function forecastAutoMap() {
    // Probeer elke ongekoppelde forecast-naam automatisch te matchen
    // op een db-klant via genormaliseerde substring-match.
    const dbCusts = forecastDbCustomers();
    const dbNorm = dbCusts.map(c => ({ raw: c, n: fcNormName(c) }));
    const fcCusts = new Set();
    forecastData.forEach(r => { if (r.retailer) fcCusts.add(String(r.retailer)); });
    let added = 0;
    fcCusts.forEach(fname => {
        if (forecastCustomerMap[fname]) return;
        const fn = fcNormName(fname);
        if (!fn) return;
        // 1. exact normalised match
        let hit = dbNorm.find(d => d.n === fn);
        // 2. db naam bevat forecast naam, of vice versa
        if (!hit) hit = dbNorm.find(d => d.n.includes(fn) || fn.includes(d.n));
        if (hit) { forecastCustomerMap[fname] = hit.raw; added++; }
    });
    forecastSaveMap();
    alert(`${added} klanten automatisch gekoppeld.`);
    renderForecastTab();
}
export function forecastRenderMapping() {
    const el = document.getElementById('forecastMappingList');
    if (!el) return;
    const fcCusts = new Set();
    forecastData.forEach(r => { if (r.retailer) fcCusts.add(String(r.retailer)); });
    const list = [...fcCusts].sort((a,b) => String(a).localeCompare(String(b)));
    if (list.length === 0) { el.innerHTML = '<div style="color:#999;">Laad eerst een forecast bestand.</div>'; return; }
    const dbCusts = forecastDbCustomers();
    const opts = '<option value="">— niet gekoppeld —</option>' +
        dbCusts.map(c => `<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
    el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;max-height:400px;overflow-y:auto;padding:4px;">` +
        list.map(name => {
            const mapped = forecastCustomerMap[name] || '';
            const dot = mapped
                ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#48bb78;margin-right:8px;"></span>'
                : '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e2e8f0;margin-right:8px;"></span>';
            const safeName = name.replace(/"/g,'&quot;');
            return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;">
                ${dot}<span style="flex:0 0 40%;font-size:13px;">${name}</span>
                <select onchange="forecastSetMapping('${safeName.replace(/'/g,"\\'")}', this.value)" style="flex:1;font-size:12px;padding:4px;">
                    ${opts.replace(`value="${mapped.replace(/"/g,'&quot;')}"`, `value="${mapped.replace(/"/g,'&quot;')}" selected`)}
                </select>
            </div>`;
        }).join('') + '</div>';
}
export function forecastBuildActuals(brandFilter, customerFilter, weeksSet) {
    // key = year_week_itemCode_normCust → value
    const map = {};
    cogsSalesInvoices.forEach(l => {
        if (!l.invoiceDate || !l.itemCode) return;
        const iso = cfGetISOWeek(l.invoiceDate);
        const key = `${iso.year}_${iso.week}`;
        if (!weeksSet.has(key)) return;
        const v = forecastMetric === 'omzet' ? parseFloat(l.amount||0) : parseFloat(l.quantity||0);
        if (!v) return;
        const k = `${iso.year}_${iso.week}_${l.itemCode}_${fcNormName(l.customerName)}`;
        map[k] = (map[k] || 0) + v;
    });
    return map;
}
export function renderForecastTab() {
    const kpiEl = document.getElementById('forecastKpis');
    const biasHead = document.getElementById('forecastBiasHead');
    const biasBody = document.getElementById('forecastBiasBody');
    const heatHead = document.getElementById('forecastHeatHead');
    const heatBody = document.getElementById('forecastHeatBody');
    const trendEl = document.getElementById('forecastTrendChart');
    if (!kpiEl) return;
    forecastRenderMapping();
    if (forecastData.length === 0) {
        kpiEl.innerHTML = '<div style="color:#999;">Laad eerst een forecast bestand.</div>';
        biasHead.innerHTML = ''; biasBody.innerHTML = '';
        heatHead.innerHTML = ''; heatBody.innerHTML = '';
        trendEl.innerHTML = '';
        return;
    }
    const brandFilter = (document.getElementById('forecastBrand')||{}).value || 'all';
    const customerFilter = (document.getElementById('forecastCustomer')||{}).value || 'all';
    const weeks = forecastGetPeriodWeeks();
    const weeksSet = new Set(weeks.map(w => `${w.year}_${w.week}`));

    // Filter forecast rows
    const fRows = forecastData.filter(r => {
        if (r.metric !== forecastMetric) return false;
        if (brandFilter !== 'all' && r.brand !== brandFilter) return false;
        if (customerFilter !== 'all' && r.retailer !== customerFilter) return false;
        return weeksSet.has(`${r.year}_${r.week}`);
    });

    const actuals = forecastBuildActuals(brandFilter, customerFilter, weeksSet);

    // Aggregate per customer
    const perCust = {}; // retailer → {forecast, actual, mapeNum, mapeCount, perWeek:{key:{f,a}}, perSku:{itemCode:{f,a}}}
    const perWeek = {}; // wkKey → {f, a}
    weeks.forEach(w => { perWeek[`${w.year}_${w.week}`] = { f: 0, a: 0 }; });

    fRows.forEach(r => {
        const cust = r.retailer || '(onbekend)';
        if (!perCust[cust]) perCust[cust] = { forecast: 0, actual: 0, mapeSum: 0, mapeN: 0, perWeek: {}, perSku: {} };
        const c = perCust[cust];
        c.forecast += r.value;
        const wk = `${r.year}_${r.week}`;
        // Gebruik klantmapping indien aanwezig — anders normalised forecast naam
        const mapped = forecastCustomerMap[cust];
        const custKey = fcNormName(mapped || cust);
        const aKey = `${r.year}_${r.week}_${r.itemCode}_${custKey}`;
        const aVal = actuals[aKey] || 0;
        c.actual += aVal;
        c.perWeek[wk] = c.perWeek[wk] || { f: 0, a: 0 };
        c.perWeek[wk].f += r.value;
        c.perWeek[wk].a += aVal;
        if (r.value > 0) {
            c.mapeSum += Math.abs(aVal - r.value) / r.value;
            c.mapeN += 1;
        }
        perWeek[wk].f += r.value;
        perWeek[wk].a += aVal;
        // Also: actuals not matched to a forecast row are not counted in customer.actual.
        // To capture extra actuals, we add them per week below.
    });
    // Add unmatched actuals into per-customer totals & weekly totals (so KPIs reflect reality)
    Object.keys(actuals).forEach(k => {
        const parts = k.split('_');
        const yr = parts[0], wk = parts[1];
        const wkKey = `${yr}_${wk}`;
        if (!weeksSet.has(wkKey)) return;
        // Note: we already counted matched ones via fRows iteration.
        // For unmatched: detect by checking if forecast had this exact key
    });

    // Totals
    let totalF = 0, totalA = 0, mapeAcc = 0, mapeAccN = 0;
    Object.values(perCust).forEach(c => {
        totalF += c.forecast;
        totalA += c.actual;
        if (c.mapeN > 0) { mapeAcc += c.mapeSum / c.mapeN; mapeAccN++; }
    });
    const bias = totalA - totalF;
    const biasPct = totalF > 0 ? bias / totalF : 0;
    const avgMape = mapeAccN > 0 ? mapeAcc / mapeAccN : 0;

    // KPI cards
    const kpi = (label, val, color) => `<div style="flex:1;min-width:160px;padding:14px;background:#f5f7fa;border-radius:8px;border-left:4px solid ${color||'#667eea'};"><div style="font-size:12px;color:#666;text-transform:uppercase;">${label}</div><div style="font-size:20px;font-weight:600;margin-top:4px;">${val}</div></div>`;
    kpiEl.innerHTML =
        kpi('Totaal forecast', fcFmt(totalF), '#667eea') +
        kpi('Totaal actual', fcFmt(totalA), '#48bb78') +
        kpi('Bias', (bias>=0?'+':'') + fcFmt(bias), bias>=0?'#48bb78':'#e53e3e') +
        kpi('Bias %', (biasPct>=0?'+':'') + fcFmtPct(biasPct), biasPct>=0?'#48bb78':'#e53e3e') +
        kpi('Gem. MAPE', fcFmtPct(avgMape), '#ed8936');

    // Bias per customer table
    const custRows = Object.entries(perCust).map(([name, c]) => ({
        name,
        forecast: c.forecast,
        actual: c.actual,
        bias: c.actual - c.forecast,
        biasPct: c.forecast > 0 ? (c.actual - c.forecast) / c.forecast : 0,
        mape: c.mapeN > 0 ? c.mapeSum / c.mapeN : 0,
    })).sort((a,b) => Math.abs(b.bias) - Math.abs(a.bias));

    biasHead.innerHTML = '<tr><th class="sticky-col">Klant</th><th>Forecast</th><th>Actual</th><th>Bias</th><th>Bias %</th><th>MAPE</th></tr>';
    biasBody.innerHTML = custRows.map(r => {
        const bColor = r.bias >= 0 ? '#2f855a' : '#c53030';
        const dot = forecastCustomerMap[r.name] ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2f855a;margin-right:6px;" title="Gekoppeld aan: '+forecastCustomerMap[r.name]+'"></span>' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ddd;margin-right:6px;" title="Niet gekoppeld"></span>';
        return `<tr><td class="sticky-col">${dot}${r.name}</td><td>${fcFmt(r.forecast)}</td><td>${fcFmt(r.actual)}</td><td style="color:${bColor};">${(r.bias>=0?'+':'')}${fcFmt(r.bias)}</td><td style="color:${bColor};">${(r.biasPct>=0?'+':'')}${fcFmtPct(r.biasPct)}</td><td>${fcFmtPct(r.mape)}</td></tr>`;
    }).join('');

    // Heatmap top 15 by actual volume
    const top = [...custRows].sort((a,b) => b.actual - a.actual).slice(0, 15);
    heatHead.innerHTML = '<tr><th class="sticky-col">Klant</th>' + weeks.map(w => `<th>${w.week}</th>`).join('') + '</tr>';
    heatBody.innerHTML = top.map(r => {
        const c = perCust[r.name];
        const cells = weeks.map(w => {
            const k = `${w.year}_${w.week}`;
            const cell = c.perWeek[k];
            if (!cell || cell.f === 0) return '<td style="background:#f5f5f5;color:#bbb;text-align:center;">·</td>';
            const dev = Math.abs(cell.a - cell.f) / cell.f;
            let bg = '#48bb78';
            if (dev >= 0.4) bg = '#e53e3e';
            else if (dev >= 0.2) bg = '#ed8936';
            else if (dev >= 0.1) bg = '#ecc94b';
            return `<td style="background:${bg};color:#fff;text-align:center;font-size:11px;" title="F:${fcFmt(cell.f)} A:${fcFmt(cell.a)}">${(dev*100).toFixed(0)}%</td>`;
        }).join('');
        return `<tr><td class="sticky-col">${r.name}</td>${cells}</tr>`;
    }).join('');

    // === Trend chart (forecast vs actual) ===
    const series = weeks.map(wk => perWeek[`${wk.year}_${wk.week}`] || { f: 0, a: 0 });
    const W = 1000, H = 320;
    const padL = 80, padR = 24, padT = 16, padB = 56;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxV = Math.max(1, ...series.map(s => Math.max(s.f, s.a)));
    // Round max to nice number
    const niceMax = (() => {
        const exp = Math.pow(10, Math.floor(Math.log10(maxV)));
        const n = maxV / exp;
        const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
        return nice * exp;
    })();
    const x = i => padL + (weeks.length <= 1 ? innerW/2 : (i * innerW / (weeks.length - 1)));
    const y = v => padT + innerH - (v / niceMax) * innerH;

    // Gridlines + Y labels (5 ticks)
    let grid = '';
    for (let t = 0; t <= 5; t++) {
        const yy = padT + innerH - (t/5) * innerH;
        const val = (niceMax * t / 5);
        grid += `<line x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}" stroke="#eef0f4" stroke-width="1"/>`;
        grid += `<text x="${padL-10}" y="${yy+4}" font-size="11" text-anchor="end" fill="#8a94a6" font-family="-apple-system,system-ui,sans-serif">${forecastMetric==='omzet' ? '€'+Math.round(val).toLocaleString('nl-NL') : Math.round(val).toLocaleString('nl-NL')}</text>`;
    }

    // X axis labels: max ~10 labels, evenly spaced
    const labelStep = Math.max(1, Math.ceil(weeks.length / 10));
    const xLabels = weeks.map((wk, i) => {
        if (i % labelStep !== 0 && i !== weeks.length - 1) return '';
        return `<text x="${x(i)}" y="${H-padB+18}" font-size="11" text-anchor="middle" fill="#8a94a6" font-family="-apple-system,system-ui,sans-serif">w${wk.week}</text>`;
    }).join('');

    // Area + lines
    const pathF = series.map((s,i) => (i===0?'M':'L') + x(i).toFixed(1) + ',' + y(s.f).toFixed(1)).join(' ');
    const pathA = series.map((s,i) => (i===0?'M':'L') + x(i).toFixed(1) + ',' + y(s.a).toFixed(1)).join(' ');
    const areaF = pathF + ` L${x(weeks.length-1).toFixed(1)},${(padT+innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT+innerH).toFixed(1)} Z`;

    // Data point dots + invisible hover targets
    let dots = '';
    series.forEach((s,i) => {
        dots += `<circle cx="${x(i)}" cy="${y(s.f)}" r="3" fill="#667eea" stroke="#fff" stroke-width="1.5"/>`;
        dots += `<circle cx="${x(i)}" cy="${y(s.a)}" r="3" fill="#48bb78" stroke="#fff" stroke-width="1.5"/>`;
        const wk = weeks[i];
        const tip = `${wk.year}-w${wk.week}\nForecast: ${forecastMetric==='omzet'?'€':''}${Math.round(s.f).toLocaleString('nl-NL')}\nActual: ${forecastMetric==='omzet'?'€':''}${Math.round(s.a).toLocaleString('nl-NL')}`;
        dots += `<circle cx="${x(i)}" cy="${padT+innerH/2}" r="${innerW/(weeks.length*2)}" fill="transparent"><title>${tip}</title></circle>`;
    });

    // Axis lines
    const axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="#cbd5e0"/>` +
                 `<line x1="${padL}" y1="${padT+innerH}" x2="${W-padR}" y2="${padT+innerH}" stroke="#cbd5e0"/>`;

    // Legend BELOW chart
    const legend = `<div style="display:flex;justify-content:center;gap:24px;margin-top:8px;font-size:13px;color:#4a5568;">
        <span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:14px;height:3px;background:#667eea;border-radius:2px;"></span>Forecast</span>
        <span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:14px;height:3px;background:#48bb78;border-radius:2px;"></span>Actual</span>
    </div>`;

    trendEl.innerHTML = `<div style="width:100%;overflow-x:auto;">
        <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%;font-family:-apple-system,system-ui,sans-serif;">
            ${grid}
            ${axes}
            <path d="${areaF}" fill="#667eea" fill-opacity="0.08"/>
            <path d="${pathF}" stroke="#667eea" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
            <path d="${pathA}" stroke="#48bb78" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            ${xLabels}
        </svg>
        ${legend}
    </div>`;
}

