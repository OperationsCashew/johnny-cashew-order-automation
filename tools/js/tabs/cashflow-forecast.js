import {
    pnlTransactionLines, pnlUnlocked, setPnlUnlocked,
    cogsSalesInvoices, cogsItems,
    cffReceivablesData,
    _cffChartInstance, set_cffChartInstance,
} from '../shared/state.js';
import { pnlHashPassword, PNL_PASS_HASH, pnlGetBucketMapping } from './pnl.js';

// === CASHFLOW FORECAST TAB (fase 1: upload & opslag) ===
export async function cffUnlock() {
    const input = document.getElementById('cffPassword');
    const hash = await pnlHashPassword(input.value);
    if (hash === PNL_PASS_HASH) {
        setPnlUnlocked(true);
        sessionStorage.setItem('pnl_unlocked', '1');
        document.getElementById('cffLock').style.display = 'none';
        document.getElementById('cffContent').style.display = 'block';
        cffRender();
    } else {
        document.getElementById('cffLockError').style.display = 'block';
        input.value = ''; input.focus();
    }
}
export function cffCheckSession() {
    if (sessionStorage.getItem('pnl_unlocked') === '1') {
        setPnlUnlocked(true);
        document.getElementById('cffLock').style.display = 'none';
        document.getElementById('cffContent').style.display = 'block';
    }
}

// --- Accordion toggle ---
export function cffAccToggle(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

// --- Status dot + hint updater ---
// Call after each render to reflect current state
export function cffUpdateAccordionStatus() {
    const dot = (id, cls, hint) => {
        const d = document.getElementById('cffDot' + id);
        const h = document.getElementById('cffHint' + id);
        if (d) { d.className = 'cff-acc-dot ' + cls; }
        if (h) { h.textContent = hint || ''; }
    };

    // Sales
    const salData = cffGetSales();
    if (salData) {
        const arts = Object.keys(salData.articles || {}).length;
        dot('Sales', 'green', arts + ' artikelen · ' + cffFmt(Object.values(salData.articles||{}).reduce((s,a)=>s+Object.values(a.weeks).reduce((ss,v)=>ss+v,0)*a.price,0)));
    } else {
        dot('Sales', 'red', 'niet geladen');
    }

    // Inkoop
    const inkData = cffGetData();
    if (inkData && inkData.weeks && inkData.weeks.some(w => w.inkoopWO != null)) {
        const cnt = inkData.weeks.filter(w => w.inkoopWO != null).length;
        dot('Inkoop', 'green', cnt + ' weken');
    } else {
        // Check of inkoop via COGS-ratio wordt geëxtrapoleerd
        const hasExtrap = (typeof pnlTransactionLines !== 'undefined') && pnlTransactionLines && pnlTransactionLines.length > 0;
        dot('Inkoop', hasExtrap ? 'grey' : 'red', hasExtrap ? 'geëxtrapoleerd via COGS-ratio' : 'niet ingevuld');
    }

    // DSO — always computed from invoices
    const dsoResult = (typeof cffDsoApplied === 'function') ? cffDsoApplied() : null;
    if (dsoResult && dsoResult.aggregate != null) {
        dot('Dso', 'green', Math.round(dsoResult.aggregate) + ' dagen (gewogen)');
    } else {
        dot('Dso', 'red', 'geen data');
    }

    // DPO — optional, default 0
    const dpo = (typeof cffDpoGet === 'function') ? cffDpoGet() : 0;
    dot('Dpo', dpo > 0 ? 'green' : 'grey', dpo + ' dagen');

    // OPEX
    const opex = (typeof cffOpexGet === 'function') ? cffOpexGet() : [];
    if (opex.length > 0) {
        const yr = opex.reduce((s,e) => s + (e.amount||0) * 12, 0);
        dot('Opex', 'green', opex.length + ' posten · ' + cffFmt(yr) + '/jaar');
    } else {
        dot('Opex', 'red', 'niet ingevuld');
    }

    // BTW — always has defaults
    dot('Btw', 'green', 'geconfigureerd');

    // Werkkapitaal — groen als er balansdata is (AR/AP/BTW/LH)
    const wcBal = (typeof cffWcComputeBalances === 'function') ? cffWcComputeBalances() : null;
    if (wcBal && ((wcBal.ar || 0) !== 0 || (wcBal.ap || 0) !== 0 || (wcBal.btwNet || 0) !== 0 || (wcBal.loonheffingen || 0) !== 0)) {
        dot('Wc', 'green', cffFmt(wcBal.ar || 0) + ' AR · ' + cffFmt(-(wcBal.ap || 0)) + ' AP');
    } else {
        dot('Wc', 'red', 'geen openstaande posities');
    }

    // Events — optional
    const events = (typeof cffEventsGet === 'function') ? cffEventsGet() : [];
    if (events.length > 0) {
        dot('Events', 'green', events.length + ' event(s)');
    } else {
        dot('Events', 'grey', 'geen events');
    }

    // Loans — groen als geseed/ingevuld, rood als leeg
    const loans = (typeof cffLoansGet === 'function') ? cffLoansGet() : [];
    const realLoans = loans.filter(l => (l.aflossing||0) > 0 || (l.rente||0) > 0);
    if (realLoans.length > 0) {
        const mnd = realLoans.reduce((s,l) => s + (l.aflossing||0) + (l.rente||0), 0);
        dot('Loans', 'green', realLoans.length + ' lening(en) · ' + cffFmt(mnd) + '/mnd');
    } else {
        dot('Loans', 'red', 'geen leningen');
    }

    // Cash
    const cashCfg = (typeof cffCashGet === 'function') ? cffCashGet() : {};
    if (cashCfg.startBalance && cashCfg.startBalance !== 0) {
        dot('Cash', 'green', 'startsaldo ' + cffFmt(cashCfg.startBalance));
    } else {
        dot('Cash', 'red', 'startsaldo ontbreekt');
    }

    // Voorraad — groen als er voorraaddata is uit Exact
    const stockCfg = (typeof cffStockGet === 'function') ? cffStockGet() : {};
    const hasStockData = typeof cffStockComputeBalance === 'function' && (() => { try { const b = cffStockComputeBalance(); return b && b.balanceByMonth && Object.keys(b.balanceByMonth).length > 0; } catch(e) { return false; } })();
    if (hasStockData) {
        dot('Stock', 'green', (stockCfg.leadDays || 0) + ' dagen lead time · voorraaddata geladen');
    } else {
        dot('Stock', 'grey', (stockCfg.leadDays || 0) + ' dagen lead time');
    }
}

export function cffGetData() {
    try { return JSON.parse(localStorage.getItem('cashflow_workbook') || 'null'); } catch(e) { return null; }
}
export function cffSaveData(d) { localStorage.setItem('cashflow_workbook', JSON.stringify(d)); }
export function cffClearData() {
    if (!confirm('Cashflow werkbestand verwijderen?')) return;
    localStorage.removeItem('cashflow_workbook');
    cffRender();
}

export function cffFmt(val) {
    if (val == null || isNaN(val)) return '—';
    const neg = val < 0;
    const abs = Math.abs(Math.round(val));
    return (neg ? '-' : '') + '€ ' + abs.toLocaleString('nl-NL');
}

export async function cffLoadFile(file) {
    if (!file) return;
    const errEl = document.getElementById('cffLoadError');
    errEl.style.display = 'none';
    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('cashflow updated')) || 'cashflow updated';
        const ws = wb.Sheets[sheetName];
        if (!ws) throw new Error("Tabblad 'cashflow updated' niet gevonden");

        // XLSX cell addressing: row 15 = "15", col index 1-based → use sheet_to_json approach with header
        // Lees rijen 15 (jaar), 16 (datum), 17 (week), 19 (Lidl), 20 (JC), 21 (bijprod), 78 (Freek)
        const get = (r, c) => {
            const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
            const cell = ws[addr];
            return cell ? cell.v : null;
        };

        const range = XLSX.utils.decode_range(ws['!ref']);
        const maxCol = range.e.c + 1;
        const weeks = [];
        for (let c = 2; c <= maxCol; c++) { // start col B (2)
            const year = get(15, c);
            const week = get(17, c);
            if (!year || !week) continue;
            const date = get(16, c);
            const salesLidl = Number(get(19, c)) || 0;
            const salesJC = Number(get(20, c)) || 0;
            const salesOverig = Number(get(21, c)) || 0;
            // R78 staat in k€ → ×1000, negatief = outflow
            // Fallback: als R78 leeg is (formule zonder cached value), som dan R66 + R68..R77 in €
            let inkoopWO = null;
            let inkoopSource = null;
            const rawInkoop = get(78, c);
            if (rawInkoop != null && rawInkoop !== '') {
                inkoopWO = Number(rawInkoop) * 1000;
                inkoopSource = 'R78';
            } else {
                let sum = 0, any = false;
                for (const rr of [66,68,69,70,71,72,73,74,75,76,77]) {
                    const v = get(rr, c);
                    if (v != null && v !== '' && !isNaN(Number(v))) { sum += Number(v); any = true; }
                }
                if (any) { inkoopWO = -sum; inkoopSource = 'R66+R68-77'; }
            }
            weeks.push({
                year: Number(year),
                week: Number(week),
                date: date instanceof Date ? date.toISOString().slice(0,10) : (date || null),
                salesLidl, salesJC, salesOverig,
                inkoopWO, // euros (of null als leeg)
                inkoopSource,
            });
        }
        if (weeks.length === 0) throw new Error('Geen weken met jaar+weeknummer gevonden in rijen 15/17');

        // Default: betrouwbaar t/m laatste week waarin R78 gevuld is
        const lastFilled = [...weeks].reverse().find(w => w.inkoopWO != null);
        const defaultLabel = lastFilled ? `W${lastFilled.week}-${lastFilled.year}` : '';
        const input = prompt(
            `Bestand geladen: ${weeks.length} weken (W${weeks[0].week}-${weeks[0].year} t/m W${weeks[weeks.length-1].week}-${weeks[weeks.length-1].year}).\n\n` +
            `Tot en met welke week is de inkoop/WO forecast betrouwbaar geüpdatet?\n` +
            `Formaat: W<week>-<jaar>  (bijv. W28-2026)`,
            defaultLabel
        );
        if (input === null) return; // user cancelled
        let reliableUntil = null;
        const m = /^W?(\d{1,2})-(\d{4})$/i.exec(input.trim());
        if (m) reliableUntil = { week: parseInt(m[1]), year: parseInt(m[2]) };
        else reliableUntil = lastFilled ? { week: lastFilled.week, year: lastFilled.year } : null;

        cffSaveData({
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            reliableUntil,
            weeks,
        });
        cffRender();
    } catch (e) {
        errEl.textContent = 'Fout bij inladen: ' + (e.message || e);
        errEl.style.display = 'block';
    }
}

export function cffRender() {
    const data = cffGetData();
    const statusEl = document.getElementById('cffStatus');
    const clearBtn = document.getElementById('cffClearBtn');
    const prev = document.getElementById('cffPreview');
    if (!data) {
        statusEl.textContent = '';
        clearBtn.style.display = 'none';
        prev.innerHTML = '';
        return;
    }
    clearBtn.style.display = '';
    const first = data.weeks[0], last = data.weeks[data.weeks.length - 1];
    const ru = data.reliableUntil ? `W${data.reliableUntil.week}-${data.reliableUntil.year}` : '(onbekend)';
    const d = new Date(data.uploadedAt);
    const pad = n => String(n).padStart(2,'0');
    const ts = `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    statusEl.innerHTML = `<b>${data.fileName}</b> · ${data.weeks.length} weken (W${first.week}-${first.year} → W${last.week}-${last.year}) · betrouwbaar t/m <b>${ru}</b> · geüpload ${ts}`;

    // Preview: tabel met eerste/laatste 5 weken
    let html = '<div style="overflow-x:auto;"><table class="pnl-table" style="min-width:800px;"><thead><tr>';
    html += '<th>Week</th><th class="pnl-amount">Lidl</th><th class="pnl-amount">JC</th><th class="pnl-amount">Bijproducten</th><th class="pnl-amount">Totaal sales</th><th class="pnl-amount">Inkoop + WO</th><th class="pnl-amount">Netto</th></tr></thead><tbody>';
    const show = [...data.weeks.slice(0,6), null, ...data.weeks.slice(-6)];
    const reliableNum = data.reliableUntil ? data.reliableUntil.year * 100 + data.reliableUntil.week : 999999;
    for (const w of show) {
        if (w === null) { html += '<tr><td colspan="7" style="text-align:center;color:#999;">…</td></tr>'; continue; }
        const totalSales = w.salesLidl + w.salesJC + w.salesOverig;
        const net = totalSales + (w.inkoopWO || 0);
        const wNum = w.year * 100 + w.week;
        const unreliable = wNum > reliableNum;
        const cls = unreliable ? ' style="color:#bbb;"' : '';
        html += `<tr${cls}><td>W${w.week}-${w.year}${unreliable?' ⚠':''}</td>` +
            `<td class="pnl-amount">${cffFmt(w.salesLidl)}</td>` +
            `<td class="pnl-amount">${cffFmt(w.salesJC)}</td>` +
            `<td class="pnl-amount">${cffFmt(w.salesOverig)}</td>` +
            `<td class="pnl-amount">${cffFmt(totalSales)}</td>` +
            `<td class="pnl-amount">${w.inkoopWO != null ? cffFmt(w.inkoopWO) : '—'}</td>` +
            `<td class="pnl-amount">${cffFmt(net)}</td></tr>`;
    }
    html += '</tbody></table></div>';
    html += '<p style="color:#666;font-size:13px;margin-top:12px;">Eerste en laatste 6 weken getoond. Weken na ' + ru + ' zijn gemarkeerd als onbetrouwbaar en worden later afgekapt in de forecast-engine.</p>';
    prev.innerHTML = html;
}

// ISO week helper for paste/sales
export function cffIsoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week, year: d.getUTCFullYear() };
}

// Default the paste-week inputs to current ISO week on tab open
export function cffInitPasteDefaults() {
    const wEl = document.getElementById('cffPasteWeek');
    const yEl = document.getElementById('cffPasteYear');
    if (wEl && !wEl.value) {
        const { week, year } = cffIsoWeek(new Date());
        wEl.value = week; yEl.value = year;
    }
}

// Paste inkoop+WO weekly values starting at given week
export function cffPasteInkoop() {
    const errEl = document.getElementById('cffPasteError');
    const okEl = document.getElementById('cffPasteOk');
    errEl.style.display = 'none'; okEl.style.display = 'none';
    try {
        const startWeek = parseInt(document.getElementById('cffPasteWeek').value);
        const startYear = parseInt(document.getElementById('cffPasteYear').value);
        const unit = document.getElementById('cffPasteUnit').value; // 'k' or 'e'
        const flip = document.getElementById('cffPasteFlip').checked;
        if (!startWeek || !startYear) throw new Error('Vul startweek + jaar in');
        const raw = document.getElementById('cffPasteArea').value.trim();
        if (!raw) throw new Error('Leeg plakvak');
        // split on tabs, newlines, or multiple spaces; normalise NL decimals
        const tokens = raw.split(/[\t\n\r;,]+|\s{2,}/).map(s => s.trim()).filter(Boolean);
        const values = tokens.map(t => {
            const cleaned = t.replace(/€/g,'').replace(/\./g,'').replace(',','.').replace(/[^\d.\-]/g,'');
            const n = Number(cleaned);
            if (isNaN(n)) throw new Error('Kan waarde niet lezen: "' + t + '"');
            return n;
        });

        // Build week list starting at startWeek/startYear, ISO weeks
        // Use Thursday-of-week trick: jump 7 days each step.
        function isoWeekDate(year, week) {
            // Monday of given ISO week
            const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
            const dow = simple.getUTCDay();
            const ISOweekStart = simple;
            if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
            else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
            return ISOweekStart;
        }
        let cursor = isoWeekDate(startYear, startWeek);

        const data = cffGetData() || { uploadedAt: new Date().toISOString(), fileName:'(handmatig geplakt)', reliableUntil:null, weeks:[] };
        // index existing weeks for quick merge
        const idx = new Map(data.weeks.map((w,i) => [w.year*100+w.week, i]));

        for (const v of values) {
            const iso = cffIsoWeek(cursor);
            const eur = (unit === 'k' ? v * 1000 : v) * (flip ? -1 : 1);
            const key = iso.year*100 + iso.week;
            if (idx.has(key)) {
                const w = data.weeks[idx.get(key)];
                w.inkoopWO = eur;
                w.inkoopSource = 'paste';
            } else {
                data.weeks.push({
                    year: iso.year, week: iso.week,
                    date: cursor.toISOString().slice(0,10),
                    salesLidl:0, salesJC:0, salesOverig:0,
                    inkoopWO: eur, inkoopSource:'paste',
                });
            }
            cursor = new Date(cursor.getTime() + 7*86400000);
        }
        // sort weeks chronologically
        data.weeks.sort((a,b) => (a.year*100+a.week) - (b.year*100+b.week));
        // bump reliableUntil to last pasted week if it now extends further
        const lastPasted = cffIsoWeek(new Date(cursor.getTime() - 7*86400000));
        const ru = data.reliableUntil;
        if (!ru || (lastPasted.year*100+lastPasted.week) > (ru.year*100+ru.week)) {
            data.reliableUntil = lastPasted;
        }
        data.uploadedAt = new Date().toISOString();
        cffSaveData(data);
        cffRender();
        okEl.textContent = `${values.length} weken toegevoegd/bijgewerkt (W${startWeek}-${startYear} → W${lastPasted.week}-${lastPasted.year}).`;
        okEl.style.display = 'block';
        document.getElementById('cffPasteArea').value = '';
    } catch (e) {
        errEl.textContent = 'Fout: ' + (e.message || e);
        errEl.style.display = 'block';
    }
}

// ============ SALES FORECAST per artikel ============
export function cffGetSales() {
    try { return JSON.parse(localStorage.getItem('cashflow_sales_forecast') || 'null'); } catch(e) { return null; }
}
export function cffSaveSales(d) { localStorage.setItem('cashflow_sales_forecast', JSON.stringify(d)); }
export function cffGetManualPrices() {
    try { return JSON.parse(localStorage.getItem('cashflow_manual_prices') || '{}'); } catch(e) { return {}; }
}
export function cffSetManualPrice(code, price) {
    const m = cffGetManualPrices();
    const p = parseFloat(String(price).replace(',','.'));
    if (isNaN(p) || p <= 0) delete m[code];
    else m[code] = p;
    localStorage.setItem('cashflow_manual_prices', JSON.stringify(m));
    // Re-apply to current dataset and re-render
    const data = cffGetSales();
    if (data && data.articles && data.articles[code]) {
        if (m[code]) {
            // Only override if there's no invoice/he/master price already
            const a = data.articles[code];
            if (a.priceSource === 'none' || a.priceSource === 'manual') {
                a.price = m[code]; a.priceSource = 'manual';
                cffSaveSales(data);
            }
        } else {
            if (data.articles[code].priceSource === 'manual') {
                data.articles[code].price = 0;
                data.articles[code].priceSource = 'none';
                cffSaveSales(data);
            }
        }
    }
    cffRenderSales();
}
export function cffClearSales() {
    localStorage.removeItem('cashflow_sales_forecast');
    cffRenderSales();
}

// Fixed article-sum blocks per sheet (1-based row numbers, as per user)
export const SALES_FORECAST_BLOCKS = [
    { sheet: 'JC - dozen',    startRow: 199, label: 'JC',      unit: 'dozen' },
    { sheet: 'PL - dozen',    startRow: 189, label: 'PL',      unit: 'dozen' },
    { sheet: 'Upcycle - all', startRow: 77,  label: 'Upcycle', unit: 'units' },
];

// Build avg sales price per article from the last N invoice lines per article (most recent first)
export function cffBuildPriceLookup(lastN = 10) {
    // Group invoice lines by article
    const byArt = {};
    (typeof cogsSalesInvoices !== 'undefined' ? cogsSalesInvoices : []).forEach(l => {
        if (!l.itemCode || !l.quantity || l.quantity <= 0) return;
        const k = String(l.itemCode).trim();
        if (!byArt[k]) byArt[k] = [];
        byArt[k].push(l);
    });
    const out = {};
    for (const [k, lines] of Object.entries(byArt)) {
        // Sort by invoiceDate descending (most recent first); undated last
        lines.sort((a,b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));
        const recent = lines.slice(0, lastN);
        const qty = recent.reduce((s,l) => s + l.quantity, 0);
        const amt = recent.reduce((s,l) => s + l.amount, 0);
        const oldest = recent[recent.length-1]?.invoiceDate || '';
        const newest = recent[0]?.invoiceDate || '';
        out[k] = {
            price: qty > 0 ? amt / qty : 0,
            qty, lines: recent.length, source: 'invoices',
            oldest, newest,
        };
    }
    // Fallback: master sales price
    (typeof cogsItems !== 'undefined' ? cogsItems : []).forEach(i => {
        const k = String(i.code || '').trim();
        if (!k) return;
        if (!out[k] && i.salesPrice > 0) {
            out[k] = { price: i.salesPrice, qty: 0, lines: 0, source: 'master', oldest:'', newest:'' };
        }
    });
    return out;
}

export async function cffLoadSalesFile(file) {
    if (!file) return;
    const errEl = document.getElementById('cffSalesError');
    errEl.style.display = 'none';
    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

        // Build description lookup from cogsItems
        const itemDescDb = {};
        (typeof cogsItems !== 'undefined' ? cogsItems : []).forEach(i => {
            if (i.code) itemDescDb[String(i.code).trim()] = i.description || '';
        });
        const priceDb = cffBuildPriceLookup(10);
        const manualPrices = cffGetManualPrices();

        const isArticleCode = (v) => {
            if (v == null || v === '') return false;
            const s = String(v).trim().replace(/\.0+$/,'');
            return /^\d{7}$/.test(s);
        };
        const normCode = v => String(v).trim().replace(/\.0+$/,'');

        const articles = {}; // code → { code, desc, label, unit, weeks:{wkKey:units}, price, priceSource }
        const sheetReports = [];

        // ── HE-prijs lookup uit omzet-tabbladen (col D, "HE prijs") ──
        // Scan JC - omzet en PL - omzet voor elke rij met artikelcode in col B,
        // pak col D als HE prijs. Eerste non-zero waarde wint.
        const hePriceDb = {};
        for (const omSheet of ['JC - omzet','PL - omzet']) {
            const ws = wb.Sheets[omSheet];
            if (!ws || !ws['!ref']) continue;
            const r2 = XLSX.utils.decode_range(ws['!ref']);
            const g = (r,c) => { const cell = ws[XLSX.utils.encode_cell({r,c})]; return cell ? cell.v : null; };
            for (let r = 4; r <= r2.e.r; r++) {
                const code = g(r, 1);
                if (!isArticleCode(code)) continue;
                const k = normCode(code);
                const p = Number(g(r, 3));
                if (p > 0 && !hePriceDb[k]) hePriceDb[k] = p;
            }
        }

        for (const block of SALES_FORECAST_BLOCKS) {
            const ws = wb.Sheets[block.sheet];
            if (!ws || !ws['!ref']) {
                sheetReports.push({ sheet: block.sheet, status: 'TABBLAD NIET GEVONDEN', articles: 0, units: 0, revenue: 0 });
                continue;
            }
            const range = XLSX.utils.decode_range(ws['!ref']);
            const get = (r, c) => {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                return cell ? cell.v : null;
            };

            // Row 2 (index 1) = year per col, row 3 (index 2) = "week N" headers
            // Determine valid week columns (col where row3 begins with "week" and row2 is a year)
            const weekCols = [];
            for (let c = 4; c <= range.e.c; c++) { // start col E (index 4)
                const yr = get(1, c);
                const hd = get(2, c);
                if (typeof yr === 'number' && yr >= 2024 && yr <= 2030 &&
                    typeof hd === 'string' && /^week\s*\d+/i.test(hd.trim())) {
                    const wkMatch = /^week\s*(\d+)/i.exec(hd.trim());
                    if (wkMatch) weekCols.push({ col: c, year: yr, week: parseInt(wkMatch[1]) });
                }
            }
            if (weekCols.length === 0) {
                sheetReports.push({ sheet: block.sheet, status: 'GEEN WEEK-KOLOMMEN', articles: 0, units: 0, revenue: 0 });
                continue;
            }

            // Walk rows from startRow (1-based) downward; col B (index 1) = article code
            let nArt = 0, totUnits = 0, totRev = 0;
            for (let r = block.startRow - 1; r <= range.e.r; r++) {
                const code = get(r, 1);
                if (!isArticleCode(code)) continue;
                const codeStr = normCode(code);
                const desc = itemDescDb[codeStr] || (get(r, 2) || '');
                // Price fallback chain: 1) last 10 invoices  2) HE prijs col D omzet tab  3) master  4) manual
                let resolved;
                const inv = priceDb[codeStr];
                if (inv && inv.source === 'invoices' && inv.price > 0) {
                    resolved = { price: inv.price, source: 'invoices', lines: inv.lines };
                } else if (hePriceDb[codeStr] > 0) {
                    resolved = { price: hePriceDb[codeStr], source: 'he-prijs', lines: 0 };
                } else if (inv && inv.source === 'master' && inv.price > 0) {
                    resolved = { price: inv.price, source: 'master', lines: 0 };
                } else if (manualPrices[codeStr] > 0) {
                    resolved = { price: manualPrices[codeStr], source: 'manual', lines: 0 };
                } else {
                    resolved = { price: 0, source: 'none', lines: 0 };
                }
                if (!articles[codeStr]) {
                    articles[codeStr] = {
                        code: codeStr, desc: String(desc),
                        label: block.label, unit: block.unit,
                        weeks: {},
                        price: resolved.price, priceSource: resolved.source, priceLines: resolved.lines,
                    };
                }
                const a = articles[codeStr];
                let rowUnits = 0;
                for (const wc of weekCols) {
                    const v = get(r, wc.col);
                    if (v == null || v === '' || isNaN(Number(v))) continue;
                    const num = Number(v);
                    const key = wc.year * 100 + wc.week;
                    a.weeks[key] = (a.weeks[key] || 0) + num;
                    rowUnits += num;
                }
                if (rowUnits !== 0) {
                    nArt++;
                    totUnits += rowUnits;
                    totRev += rowUnits * a.price;
                }
            }
            sheetReports.push({
                sheet: block.sheet, label: block.label, unit: block.unit,
                startRow: block.startRow, weekCols: weekCols.length,
                articles: nArt, units: totUnits, revenue: totRev,
                status: 'OK',
            });
        }

        if (Object.keys(articles).length === 0) {
            throw new Error('Geen artikelen herkend in de fixed blocks.');
        }

        cffSaveSales({
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            articles,
            sheetReports,
        });
        cffRenderSales();
    } catch (e) {
        errEl.textContent = 'Fout bij inladen: ' + (e.message || e);
        errEl.style.display = 'block';
    }
}

// === OBSOLETE generic parser (kept for reference) ===
export async function cffLoadSalesFile_OLD(file) {
    if (!file) return;
    const errEl = document.getElementById('cffSalesError');
    errEl.style.display = 'none';
    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
        const articles = {};
        const sheetReports = [];

        for (const sName of wb.SheetNames) {
            const ws = wb.Sheets[sName];
            if (!ws || !ws['!ref']) continue;
            const range = XLSX.utils.decode_range(ws['!ref']);
            const get = (r, c) => {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                return cell ? cell.v : null;
            };

            // Find header row with week numbers
            let headerRow = -1, headerYear = null;
            let weekCols = []; // [{col, week, year}]
            for (let r = 0; r <= Math.min(range.e.r, 30); r++) {
                const candidates = [];
                for (let c = 0; c <= range.e.c; c++) {
                    const v = get(r, c);
                    if (v == null) continue;
                    // numeric week 1..53
                    if (typeof v === 'number' && v >= 1 && v <= 53 && Number.isInteger(v)) {
                        candidates.push({ col: c, week: v });
                    } else if (typeof v === 'string') {
                        const m = /^W?\s*(\d{1,2})\b/i.exec(v.trim());
                        if (m) {
                            const wn = parseInt(m[1]);
                            if (wn >= 1 && wn <= 53) candidates.push({ col: c, week: wn });
                        }
                    }
                }
                if (candidates.length >= 10) {
                    headerRow = r;
                    weekCols = candidates;
                    // try to find year on a row above (look 1-3 rows up for a year)
                    for (let rr = Math.max(0, r-3); rr < r; rr++) {
                        for (let c = 0; c <= range.e.c; c++) {
                            const v = get(rr, c);
                            if (typeof v === 'number' && v >= 2024 && v <= 2030) { headerYear = v; break; }
                            if (typeof v === 'string') {
                                const m = /(20\d{2})/.exec(v); if (m) { headerYear = parseInt(m[1]); break; }
                            }
                        }
                        if (headerYear) break;
                    }
                    break;
                }
            }
            if (headerRow < 0) continue;

            // Build description lookup from cogsItems (Exact items database)
            const itemDescDb = {};
            (typeof cogsItems !== 'undefined' ? cogsItems : []).forEach(i => {
                if (i.code) itemDescDb[String(i.code).trim()] = i.description || '';
            });

            // Article number = 7-digit numeric code (1XXXXXX, 2XXXXXX, etc.)
            // Detect article-code column: pick column with most valid 7-digit codes below header
            const isArticleCode = (v) => {
                if (v == null || v === '') return false;
                const s = String(v).trim();
                return /^\d{7}$/.test(s);
            };
            let codeCol = -1, bestCount = 0;
            for (let c = 0; c <= Math.min(range.e.c, 12); c++) {
                let cnt = 0;
                for (let r = headerRow + 1; r <= range.e.r; r++) {
                    if (isArticleCode(get(r, c))) cnt++;
                }
                if (cnt > bestCount) { bestCount = cnt; codeCol = c; }
            }
            if (codeCol < 0 || bestCount === 0) {
                sheetReports.push({ sheet: sName, metric:'?', headerRow: headerRow+1, headerYear, weekCount: weekCols.length, articleRows: 0, total: 0, note:'geen 7-cijferige artikelcodes gevonden' });
                continue;
            }

            // Decide metric type from sheet name
            const lower = sName.toLowerCase();
            let metric = 'volume';
            if (/(omzet|revenue|sales|€|eur|turnover|waarde)/.test(lower)) metric = 'revenue';
            if (/(volume|kg|stuks|aantal|qty|units)/.test(lower)) metric = 'volume';

            let rowsRead = 0, totalSum = 0;
            for (let r = headerRow + 1; r <= range.e.r; r++) {
                const code = get(r, codeCol);
                if (!isArticleCode(code)) continue;
                const codeStr = String(code).trim();
                const desc = itemDescDb[codeStr] || '';
                if (!articles[codeStr]) articles[codeStr] = { code: codeStr, desc: String(desc), volumeWeeks: {}, revenueWeeks: {} };
                else if (!articles[codeStr].desc && desc) articles[codeStr].desc = desc;
                const bucket = metric === 'revenue' ? articles[codeStr].revenueWeeks : articles[codeStr].volumeWeeks;
                let rowSum = 0, rowAny = false;
                for (const wc of weekCols) {
                    const v = get(r, wc.col);
                    if (v == null || v === '' || isNaN(Number(v))) continue;
                    const num = Number(v);
                    const key = (headerYear || 0) * 100 + wc.week;
                    bucket[key] = (bucket[key] || 0) + num;
                    rowSum += num; rowAny = true;
                }
                if (rowAny) { rowsRead++; totalSum += rowSum; }
            }
            sheetReports.push({ sheet: sName, metric, headerRow: headerRow+1, headerYear, weekCount: weekCols.length, articleRows: rowsRead, total: totalSum });
        }

        if (Object.keys(articles).length === 0) {
            throw new Error('Geen artikelregels herkend. Controleer of het bestand een week-header rij bevat.');
        }

        cffSaveSales({
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            articles,
            sheetReports,
        });
        cffRenderSales();
    } catch (e) {
        errEl.textContent = 'Fout bij inladen: ' + (e.message || e);
        errEl.style.display = 'block';
    }
}

export function cffRenderSales() {
    const data = cffGetSales();
    const statusEl = document.getElementById('cffSalesStatus');
    const clearBtn = document.getElementById('cffSalesClearBtn');
    const prev = document.getElementById('cffSalesPreview');
    if (!data) {
        statusEl.textContent = 'Geen sales forecast geladen.';
        clearBtn.style.display = 'none';
        prev.innerHTML = '';
        return;
    }
    clearBtn.style.display = '';
    const arts = Object.values(data.articles);
    const d = new Date(data.uploadedAt);
    const pad = n => String(n).padStart(2,'0');
    statusEl.innerHTML = `<b>${data.fileName}</b> · ${arts.length} artikelen · geüpload ${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // Compact validation: per sheet block — summary
    let html = '';
    let totalRev = 0;
    const reports = data.sheetReports || [];
    for (const r of reports) totalRev += r.revenue || 0;
    html += '<table class="pnl-table" style="font-size:12px;"><thead><tr><th>Tabblad</th><th class="pnl-amount">Artikelen</th><th class="pnl-amount">Eenheden</th><th class="pnl-amount">Omzet</th><th>Status</th></tr></thead><tbody>';
    for (const r of reports) {
        html += `<tr><td>${r.label||r.sheet}</td><td class="pnl-amount">${r.articles||0}</td><td class="pnl-amount">${Math.round(r.units||0).toLocaleString('nl-NL')}</td><td class="pnl-amount">${cffFmt(r.revenue||0)}</td><td>${r.status}</td></tr>`;
    }
    html += `<tr style="font-weight:bold;background:#f5f5f5;"><td>Totaal</td><td class="pnl-amount">${arts.length}</td><td></td><td class="pnl-amount">${cffFmt(totalRev)}</td><td></td></tr>`;
    html += '</tbody></table>';

    // Articles without resolved price → manual override input
    const noPrice = arts.filter(a => !a.price && Object.values(a.weeks).reduce((s,v)=>s+v,0) > 0);
    if (noPrice.length > 0) {
        const manual = cffGetManualPrices();
        html += `<h4 style="margin:16px 0 4px;color:#c53030;">⚠ ${noPrice.length} artikelen zonder prijs — handmatig invoeren</h4>`;
        html += '<p style="color:#666;font-size:12px;">Geen factuur, geen HE-prijs in omzet-tab, geen master sales price. Vul hieronder een prijs per eenheid in (€/doos of €/unit). Wordt opgeslagen en automatisch toegepast.</p>';
        html += '<table class="pnl-table"><thead><tr><th>Artikel</th><th>Omschrijving</th><th>Bron</th><th class="pnl-amount">Eenheden</th><th>Prijs (€)</th></tr></thead><tbody>';
        for (const a of noPrice) {
            const units = Object.values(a.weeks).reduce((s,v)=>s+v,0);
            const cur = manual[a.code] || '';
            html += `<tr><td>${a.code}</td><td>${a.desc}</td><td>${a.label}</td><td class="pnl-amount">${cffFmt(units)}</td>` +
                `<td><input type="number" step="0.01" min="0" value="${cur}" style="width:90px;" onchange="cffSetManualPrice('${a.code}', this.value)"></td></tr>`;
        }
        html += '</tbody></table>';
    }

    prev.innerHTML = html;
}

// ============================================================
//  STAP 2: OPEX configuratie & verdeling naar weken
// ============================================================
export const CFF_OPEX_CATEGORIES = [
    'Personeel','Inhuur derden','Logistiek','Marketing','Verkoopkosten',
    'Huisvesting','Verzekeringen','Kantoor','ICT','Advies','Administratie',
    'Abonnementen','Reiskosten','Contributies','Overig'
];
// Map P&L bucket key → OPEX category for seed
export const CFF_PNL_TO_OPEX = {
    personnel:'Personeel', hiring:'Inhuur derden',
    logistics:'Logistiek', logistics_opex:'Logistiek',
    marketing:'Marketing', sales_exp:'Verkoopkosten',
    rent:'Huisvesting', insurance:'Verzekeringen',
    office:'Kantoor', ict:'ICT',
    advisory:'Advies', admin:'Administratie',
    subscriptions:'Abonnementen', travel:'Reiskosten',
    contributions:'Contributies', other_general:'Overig',
};

export function cffOpexGet() {
    try { return JSON.parse(localStorage.getItem('cashflow_opex') || '[]'); } catch(e) { return []; }
}
export function cffOpexSave(arr) { localStorage.setItem('cashflow_opex', JSON.stringify(arr)); }
export function cffOpexAdd() {
    const arr = cffOpexGet();
    arr.push({ id: 'op'+Date.now(), label: 'Nieuwe post', category: 'Overig', amount: 0, frequency: 'monthly', startDate: new Date().toISOString().slice(0,10) });
    cffOpexSave(arr); cffRenderOpex(); cffRenderModel();
}
export function cffOpexUpdate(id, field, value) {
    const arr = cffOpexGet();
    const e = arr.find(x => x.id === id); if (!e) return;
    if (field === 'amount') e[field] = parseFloat(String(value).replace(',','.')) || 0;
    else e[field] = value;
    cffOpexSave(arr); cffRenderModel();
}
export function cffOpexDelete(id) {
    cffOpexSave(cffOpexGet().filter(x => x.id !== id));
    cffRenderOpex(); cffRenderModel();
}
export function cffOpexClearAll() {
    if (!confirm('Alle OPEX-posten wissen?')) return;
    cffOpexSave([]); cffRenderOpex(); cffRenderModel();
}
export function cffOpexSeedFromPnl(silent) {
    if (!pnlTransactionLines || pnlTransactionLines.length === 0) {
        if (!silent) alert('Geen P&L data geladen — open eerst de P&L tab.'); return;
    }
    // Gebruik de LAATSTE 12 MAANDEN als basis (stabieler dan 3 mnd; bovendien de
    // laatste paar weken zijn vaak incompleet waardoor een korte window onderschat)
    // Anker op vandaag — toekomstige pre-boekingen mogen geen window-anker zijn
    const todayStrOpex = new Date().toISOString().slice(0,10);
    const dates = pnlTransactionLines.filter(t => !t.isYearEndClose && t.date && t.date <= todayStrOpex).map(t => t.date).sort();
    if (dates.length === 0) { alert('Geen datums in P&L'); return; }
    const lastDate = new Date(dates[dates.length-1]);
    const cutoff = new Date(lastDate); cutoff.setFullYear(cutoff.getFullYear()-1);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const lastStr = lastDate.toISOString().slice(0,10);

    const mapping = pnlGetBucketMapping();
    const catSum = {};
    pnlTransactionLines.forEach(t => {
        if (t.isYearEndClose || !t.accountCode || !t.date) return;
        if (t.date < cutoffStr || t.date > lastStr) return;
        const bucket = mapping[t.accountCode];
        if (!bucket) return;
        const cat = CFF_PNL_TO_OPEX[bucket];
        if (!cat) return;
        catSum[cat] = (catSum[cat] || 0) + t.amount;
    });

    const arr = cffOpexGet().filter(e => !e._seeded); // vervang bestaande seeds
    for (const [cat, total] of Object.entries(catSum)) {
        const monthly = total / 12;
        if (Math.abs(monthly) < 50) continue;
        arr.push({
            id: 'op'+Date.now()+Math.random().toString(36).slice(2,6),
            label: cat + ' (P&L gem. 12 mnd)',
            category: cat,
            amount: Math.round(monthly * 100) / 100,
            frequency: 'monthly',
            startDate: '',
            _seeded: true,
        });
    }
    cffOpexSave(arr); cffRenderOpex(); cffRenderModel();
}

// Verdeel één OPEX entry over een lijst weekkeys
// weekKeys = sorted [{year, week, date(ma)}], date is Monday-of-week
export function cffOpexDistribute(entry, weekKeys) {
    const out = {}; // weekKey → amount (positive = outflow)
    const start = entry.startDate || '';
    // Compare on week granularity: if startDate falls within a week, include that week
    const startWeekDate = start ? (() => {
        const d = new Date(start); const dow = d.getUTCDay()||7;
        const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow + 1);
        return mon.toISOString().slice(0,10);
    })() : '';
    for (const wk of weekKeys) {
        if (startWeekDate && wk.date < startWeekDate) continue;
        const key = wk.year * 100 + wk.week;
        let amt = 0;
        if (entry.frequency === 'weekly') amt = entry.amount;
        else if (entry.frequency === 'monthly') amt = entry.amount / (52/12);  // ~4.333
        else if (entry.frequency === 'quarterly') amt = entry.amount / 13;
        else if (entry.frequency === 'yearly') amt = entry.amount / 52;
        out[key] = amt;
    }
    return out;
}

// ============================================================
//  STAP 1: Consolidatie naar weeklyForecast model
// ============================================================
export function cffMondayOf(year, week) {
    // ISO week Monday
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else simple.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    return simple;
}
export function cffBuildModel() { return cffBuildModelInternal({}); }
export function cffBuildModelInternal(opts) {
    opts = opts || {};
    const inkData = cffGetData();   // weeks: [{year,week,date,salesLidl,salesJC,salesOverig,inkoopWO,...}]
    const salData = cffGetSales();  // articles: {code:{weeks:{key:units}, price}}
    const opexArr = cffOpexGet();

    // 1. Bepaal horizon: vandaag → +52 weken
    const today = new Date();
    const todayIso = (() => { const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())); const dow = d.getUTCDay()||7; d.setUTCDate(d.getUTCDate() + 4 - dow); const ys = new Date(Date.UTC(d.getUTCFullYear(),0,1)); return { week: Math.ceil((((d-ys)/86400000)+1)/7), year: d.getUTCFullYear() }; })();
    const weekKeys = [];
    let cur = cffMondayOf(todayIso.year, todayIso.week);
    for (let i = 0; i < 52; i++) {
        // ISO week of cur
        const d = new Date(cur); const dow = d.getUTCDay()||7;
        const tmp = new Date(d); tmp.setUTCDate(d.getUTCDate()+4-dow);
        const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
        const wk = Math.ceil((((tmp-ys)/86400000)+1)/7);
        weekKeys.push({ year: tmp.getUTCFullYear(), week: wk, date: cur.toISOString().slice(0,10) });
        cur = new Date(cur.getTime() + 7*86400000);
    }

    // 2. Sales per week — uit forecast articles, verschoven door DSO per artikel
    // DSO per artikel komt uit cffDsoApplied() (manueel override + berekend)
    const dsoResult = cffDsoApplied();
    const dsoByArticle = dsoResult.byArticle || {};
    const dsoDefault = dsoResult.aggregate || 0;

    const salesByWeek = {};   // cash-in na DSO shift
    const salesBrutoByWeek = {}; // voor sanity: zonder shift
    let salesTotalFromArticles = 0;
    if (salData && salData.articles) {
        for (const a of Object.values(salData.articles)) {
            const aDso = (dsoByArticle[a.code]?.dsoDays != null ? dsoByArticle[a.code].dsoDays : dsoDefault) || 0;
            const weekShift = Math.round(aDso / 7);
            for (const [k, units] of Object.entries(a.weeks || {})) {
                const key = parseInt(k);
                const rev = units * (a.price || 0);
                salesBrutoByWeek[key] = (salesBrutoByWeek[key] || 0) + rev;
                salesTotalFromArticles += rev;

                // Bepaal shifted weekKey: converteer naar date, voeg DSO dagen toe, terug naar ISO year-week
                const origY = Math.floor(key / 100), origW = key % 100;
                const origMon = cffMondayOf(origY, origW);
                const shifted = new Date(origMon.getTime() + aDso * 86400000);
                // ISO week of shifted
                const d = new Date(shifted); const dow = d.getUTCDay()||7;
                const tmp = new Date(d); tmp.setUTCDate(d.getUTCDate()+4-dow);
                const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
                const sWk = Math.ceil((((tmp-ys)/86400000)+1)/7);
                const sKey = tmp.getUTCFullYear()*100 + sWk;
                salesByWeek[sKey] = (salesByWeek[sKey] || 0) + rev;
            }
        }
    }

    // 3. Inkoop per week — uit cffGetData inkoopWO veld, verschoven door DPO
    const dpoDays = cffDpoGet();
    const inkByWeek = {};        // totaal (bron + extrap) — DPO-shifted (cash timing)
    const inkByWeekSource = {};  // alleen bron-data — DPO-shifted
    const inkByWeekExtrap = {};  // alleen extrapolatie — DPO-shifted
    const stockInByWeek = {};    // inkoop op ORIGINEEL moment (goederenstroom, voor voorraadprojectie)
    let inkTotalFromData = 0;
    let lastInkoopKey = null;
    if (inkData && inkData.weeks) {
        for (const w of inkData.weeks) {
            if (w.inkoopWO == null) continue;
            inkTotalFromData += w.inkoopWO;
            const k = w.year*100 + w.week;
            if (lastInkoopKey == null || k > lastInkoopKey) lastInkoopKey = k;
            // Originele timing = wanneer goederen binnenkomen (voor voorraad)
            stockInByWeek[k] = (stockInByWeek[k] || 0) + w.inkoopWO;
            // DPO-shifted = wanneer je betaalt (voor cashflow)
            const origMon = cffMondayOf(w.year, w.week);
            const shifted = new Date(origMon.getTime() + dpoDays * 86400000);
            const d = new Date(shifted); const dow = d.getUTCDay()||7;
            const tmp = new Date(d); tmp.setUTCDate(d.getUTCDate()+4-dow);
            const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
            const sWk = Math.ceil((((tmp-ys)/86400000)+1)/7);
            const sKey = tmp.getUTCFullYear()*100 + sWk;
            inkByWeek[sKey] = (inkByWeek[sKey] || 0) + w.inkoopWO;
            inkByWeekSource[sKey] = (inkByWeekSource[sKey] || 0) + w.inkoopWO;
        }
    }

    // 3b. Extrapoleer ontbrekende inkoopweken op basis van COGS-ratio uit P&L
    // ratio = |COGS 12m| / |Sales 12m|, toegepast op forecast bruto sales
    // Als er helemaal geen inkoopdata is: extrapoleer ALLE weken
    let inkoopRatio = 0;
    if (pnlTransactionLines && pnlTransactionLines.length > 0) {
        const todayStr2 = new Date().toISOString().slice(0,10);
        const dts = pnlTransactionLines
            .filter(t => t.date && !t.isYearEndClose && t.date <= todayStr2).map(t=>t.date).sort();
        if (dts.length > 0) {
            const lastD = new Date(dts[dts.length-1]);
            const cutD = new Date(lastD); cutD.setFullYear(cutD.getFullYear()-1);
            const cutS = cutD.toISOString().slice(0,10);
            const SALES_ACCT = ['8000','8010','8014','8015','8016','8017','8018'];
            const COGS_ACCT  = ['7000','7002','7003','7004','7006','7007','7200'];
            let salesAbs = 0, cogsAbs = 0;
            for (const t of pnlTransactionLines) {
                if (t.isYearEndClose || !t.date || t.date < cutS || t.date > todayStr2) continue;
                if (SALES_ACCT.includes(t.accountCode)) salesAbs += -t.amount;
                if (COGS_ACCT.includes(t.accountCode))  cogsAbs += t.amount;
            }
            if (salesAbs > 0) inkoopRatio = cogsAbs / salesAbs;
        }
        // Vul ontbrekende weken met ratio × bruto sales
        if (inkoopRatio > 0) {
            const leadDays = (cffStockGet().leadDays || 0);
            const netShiftDays = dpoDays - leadDays;
            for (const wk of weekKeys) {
                const origKey = wk.year*100 + wk.week;
                if (lastInkoopKey != null && origKey <= lastInkoopKey) continue;
                const bruto = salesBrutoByWeek[origKey] || 0;
                if (bruto <= 0) continue;
                const inkoopAmt = -inkoopRatio * bruto;
                // Cash timing: salesWeek + (dpoDays - leadDays)
                const origMon = cffMondayOf(wk.year, wk.week);
                const shifted = new Date(origMon.getTime() + netShiftDays * 86400000);
                const d = new Date(shifted); const dow = d.getUTCDay()||7;
                const tmp = new Date(d); tmp.setUTCDate(d.getUTCDate()+4-dow);
                const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
                const sWk = Math.ceil((((tmp-ys)/86400000)+1)/7);
                const sKey = tmp.getUTCFullYear()*100 + sWk;
                inkByWeek[sKey] = (inkByWeek[sKey] || 0) + inkoopAmt;
                inkByWeekExtrap[sKey] = (inkByWeekExtrap[sKey] || 0) + inkoopAmt;
                // Voorraad timing: goederen arriveren leadDays vóór verkoop
                const arrivalDate = new Date(origMon.getTime() - leadDays * 86400000);
                const da = new Date(arrivalDate); const dowa = da.getUTCDay()||7;
                const tmpa = new Date(da); tmpa.setUTCDate(da.getUTCDate()+4-dowa);
                const ysa = new Date(Date.UTC(tmpa.getUTCFullYear(),0,1));
                const aWk = Math.ceil((((tmpa-ysa)/86400000)+1)/7);
                const aKey = tmpa.getUTCFullYear()*100 + aWk;
                stockInByWeek[aKey] = (stockInByWeek[aKey] || 0) + inkoopAmt;
            }
        }
    }

    // 4. OPEX per week
    const opexByWeek = {};
    let opexTotalFromConfig = 0;
    for (const e of opexArr) {
        const dist = cffOpexDistribute(e, weekKeys);
        for (const [k, v] of Object.entries(dist)) {
            const key = parseInt(k);
            opexByWeek[key] = (opexByWeek[key] || 0) + v;
            opexTotalFromConfig += v;
        }
    }

    // 4b. Loans per week
    const loanByWeek = {};
    let loanTotalFromConfig = 0;
    const loansArr = cffLoansGet();
    for (const ln of loansArr) {
        const dist = cffLoansDistribute(ln, weekKeys);
        for (const [k, v] of Object.entries(dist)) {
            const key = parseInt(k);
            loanByWeek[key] = (loanByWeek[key] || 0) + v;
            loanTotalFromConfig += v;
        }
    }

    // 5. Bouw weeklyForecast
    const weeks = weekKeys.map(wk => {
        const key = wk.year*100+wk.week;
        return {
            ...wk, key,
            salesIn: salesByWeek[key] || 0,
            inkoopOut: inkByWeek[key] || 0, // already negative
            inkoopExtrapolated: !!(inkByWeekExtrap[key]),
            opexOut: -(opexByWeek[key] || 0), // make negative
            loanOut: -(loanByWeek[key] || 0), // make negative
            btwOut: 0,
            net: 0,
        };
    });
    // 5b. BTW per kwartaal → cash op afdrachtweek
    let btwQuarters = null;
    if (!opts.skipBtw) {
        btwQuarters = cffBtwComputeQuarterly(weeks);
        const wkIndex = {}; weeks.forEach((w,i) => { wkIndex[w.key] = i; });
        for (const it of Object.values(btwQuarters)) {
            const idx = wkIndex[it.payWeekKey];
            if (idx != null) weeks[idx].btwOut += it.payAmount;
        }
    }
    // 5b2. Werkkapitaal openings (debiteuren/crediteuren/btw/loonheffingen)
    const wcResult = cffWcDistributeOpenings(weekKeys, dsoDefault, cffDpoGet());
    weeks.forEach(w => { w.wcOpen = wcResult.byWeek[w.key] || 0; });

    // 5b3. Eenmalige cash events (CAPEX, equity, etc.) — split by type
    const eventsResult = cffEventsDistribute(weekKeys);
    const eventsByWeek = eventsResult.all;
    weeks.forEach(w => {
        w.eventOut = eventsByWeek[w.key] || 0;
        w.capexOut = (eventsResult.byType.capex || {})[w.key] || 0;
        w.equityOut = ((eventsResult.byType.equity || {})[w.key] || 0) + ((eventsResult.byType.other || {})[w.key] || 0);
    });

    weeks.forEach(w => { w.net = w.salesIn + w.inkoopOut + w.opexOut + (w.loanOut || 0) + (w.btwOut || 0) + (w.wcOpen || 0) + (w.eventOut || 0); });

    // 5c. Cumulatieve cashpositie
    const cashCfg = cffCashGet();
    let running = cashCfg.startBalance || 0;
    let lowest = { week: null, value: Infinity };
    weeks.forEach(w => {
        running += w.net;
        w.cumCash = running;
        if (running < lowest.value) lowest = { week: w, value: running };
    });

    // 5d. Voorraadprojectie (goederenstroom, niet cashflow)
    // Start bij huidige voorraadwaarde uit boekhouding
    // Elke week: +inkoop (origineel moment, negatief bedrag = uitstroom geld = instroom goederen)
    //            -verkoop (COGS = bruto sales × inkoopRatio)
    const stockData = (typeof cffStockComputeBalance === 'function') ? cffStockComputeBalance() : null;
    let stockRunning = stockData ? stockData.balance : 0;
    const cogsRatio = inkoopRatio || 0;
    weeks.forEach(w => {
        // Inkoop = goederen IN (stockInByWeek is negatief = cash uit, dus ABS = goederen in)
        const goodsIn = Math.abs(stockInByWeek[w.key] || 0);
        // Verkoop = goederen UIT (kostprijs van verkochte goederen)
        const goodsOut = (salesBrutoByWeek[w.key] || 0) * cogsRatio;
        stockRunning += goodsIn - goodsOut;
        w.stockLevel = stockRunning;
        w.stockIn = goodsIn;
        w.stockOut = goodsOut;
    });

    // 6. Sanity checks
    const checks = [];
    // Check 1: sales totaal in horizon vs articles totaal in horizon
    const horizonKeys = new Set(weeks.map(w => w.key));
    let salesInHorizon = 0;
    if (salData && salData.articles) {
        for (const a of Object.values(salData.articles)) {
            for (const [k, units] of Object.entries(a.weeks || {})) {
                if (horizonKeys.has(parseInt(k))) salesInHorizon += units * (a.price || 0);
            }
        }
    }
    const modelSales = weeks.reduce((s,w)=>s+w.salesIn, 0);
    // Door DSO-shift kunnen sales van/naar buiten de horizon verplaatsen — dit is geen fout.
    // We checken dat het verschil binnen redelijke marges blijft (< 10% van horizon).
    const salesDiffPct = salesInHorizon > 0 ? Math.abs((modelSales - salesInHorizon) / salesInHorizon) * 100 : 0;
    checks.push({
        label: 'Sales: forecast in horizon ↔ model (na DSO shift)',
        ok: salesDiffPct < 10,
        detail: `forecast in-horizon: ${cffFmt(salesInHorizon)} · model na shift: ${cffFmt(modelSales)} · netto shift in/uit horizon: ${cffFmt(modelSales-salesInHorizon)} (${salesDiffPct.toFixed(1)}%)`
    });

    // Check 2: gaten in tijdreeks (alle 52 weken aaneengesloten)
    let gaps = 0;
    for (let i = 1; i < weeks.length; i++) {
        const d1 = new Date(weeks[i-1].date), d2 = new Date(weeks[i].date);
        if (Math.round((d2-d1)/86400000) !== 7) gaps++;
    }
    checks.push({ label: 'Tijdreeks: 52 aaneengesloten weken', ok: gaps === 0, detail: gaps === 0 ? 'geen gaten' : `${gaps} gaten` });

    // Check 3: OPEX maandbedrag × 12 ≈ jaar
    const opexMonthlyTotal = opexArr.filter(e => e.frequency==='monthly').reduce((s,e)=>s+e.amount,0);
    const opexYearlyEquiv = opexMonthlyTotal * 12;
    const opexInModelYear = weeks.reduce((s,w)=>s + (-w.opexOut), 0); // 52 weken
    const opexDiffPct = opexYearlyEquiv > 0 ? Math.abs((opexInModelYear - opexYearlyEquiv) / opexYearlyEquiv) * 100 : 0;
    checks.push({
        label: 'OPEX: maandelijkse posten × 12 ↔ 52 wk model',
        ok: opexDiffPct < 2,
        detail: `maand×12: ${cffFmt(opexYearlyEquiv)} · 52wk model: ${cffFmt(opexInModelYear)} · afwijking: ${opexDiffPct.toFixed(1)}%`
    });

    // Check 4: P&L cross-check OPEX laatste 12m vs jaarlijkse opex uit model
    let pnlOpex12m = 0;
    if (pnlTransactionLines && pnlTransactionLines.length > 0) {
        const todayS = new Date().toISOString().slice(0,10);
        const dates = pnlTransactionLines.filter(t=>t.date && !t.isYearEndClose && t.date<=todayS).map(t=>t.date).sort();
        if (dates.length > 0) {
            const lastDate = new Date(dates[dates.length-1]);
            const cutoff = new Date(lastDate); cutoff.setFullYear(cutoff.getFullYear()-1);
            const cutoffStr = cutoff.toISOString().slice(0,10);
            const lastStr = lastDate.toISOString().slice(0,10);
            const mapping = pnlGetBucketMapping();
            pnlTransactionLines.forEach(t => {
                if (t.isYearEndClose || !t.date || t.date < cutoffStr || t.date > lastStr) return;
                const b = mapping[t.accountCode];
                if (b && CFF_PNL_TO_OPEX[b]) pnlOpex12m += t.amount;
            });
        }
    }
    const opexDiffP = pnlOpex12m > 0 ? Math.abs((opexInModelYear - pnlOpex12m) / pnlOpex12m) * 100 : 0;
    checks.push({
        label: 'OPEX: model jaarbedrag ↔ P&L laatste 12 mnd',
        ok: pnlOpex12m === 0 ? null : opexDiffP < 10,
        detail: pnlOpex12m === 0 ? 'P&L niet geladen' : `model: ${cffFmt(opexInModelYear)} · P&L 12m: ${cffFmt(pnlOpex12m)} · afwijking: ${opexDiffP.toFixed(1)}%`
    });

    // Check 5: Inkoop totaal in horizon
    let inkInHorizon = 0;
    if (inkData && inkData.weeks) {
        for (const w of inkData.weeks) {
            if (w.inkoopWO != null && horizonKeys.has(w.year*100+w.week)) inkInHorizon += w.inkoopWO;
        }
    }
    const modelInk = weeks.reduce((s,w)=>s+w.inkoopOut, 0);
    const modelInkSource = weeks.reduce((s,w)=>s + (inkByWeekSource[w.key] || 0), 0);
    const modelInkExtrap = weeks.reduce((s,w)=>s + (inkByWeekExtrap[w.key] || 0), 0);
    checks.push({
        label: 'Inkoop/WO: bron totaal in horizon ↔ model (excl. extrapolatie)',
        ok: Math.abs(modelInkSource - inkInHorizon) < 1,
        detail: `bron: ${cffFmt(inkInHorizon)} · model uit bron: ${cffFmt(modelInkSource)}${modelInkExtrap?` · extrapolatie: ${cffFmt(modelInkExtrap)}`:''}`
    });

    // Check 6: ontbrekende OPEX categorieën uit P&L top
    const missingCats = [];
    if (pnlTransactionLines && pnlTransactionLines.length > 0) {
        const presentCats = new Set(opexArr.map(e => e.category));
        const mapping = pnlGetBucketMapping();
        const todayS2 = new Date().toISOString().slice(0,10);
        const dates = pnlTransactionLines.filter(t=>t.date && !t.isYearEndClose && t.date<=todayS2).map(t=>t.date).sort();
        const lastDate = dates.length ? new Date(dates[dates.length-1]) : null;
        if (lastDate) {
            const cutoff = new Date(lastDate); cutoff.setMonth(cutoff.getMonth()-3);
            const cutoffStr = cutoff.toISOString().slice(0,10);
            const lastStr2 = lastDate.toISOString().slice(0,10);
            const catTotals = {};
            pnlTransactionLines.forEach(t => {
                if (t.isYearEndClose || !t.date || t.date < cutoffStr || t.date > lastStr2) return;
                const b = mapping[t.accountCode];
                if (!b || !CFF_PNL_TO_OPEX[b]) return;
                const c = CFF_PNL_TO_OPEX[b];
                catTotals[c] = (catTotals[c]||0) + t.amount;
            });
            for (const [c, v] of Object.entries(catTotals)) {
                if (Math.abs(v) > 500 && !presentCats.has(c)) missingCats.push(`${c} (€${cffFmt(v/3)}/mnd)`);
            }
        }
    }
    checks.push({
        label: 'OPEX dekking: alle relevante P&L categorieën',
        ok: missingCats.length === 0,
        detail: missingCats.length === 0 ? 'volledig' : 'ontbreekt: ' + missingCats.join(', ')
    });

    // Check 7: DSO shift neemt geen euro's weg (alleen verschuiving in de tijd)
    const bruto52 = Object.values(salesBrutoByWeek).reduce((s,v)=>s+v,0);
    const net52Shifted = Object.values(salesByWeek).reduce((s,v)=>s+v,0);
    checks.push({
        label: 'DSO shift: bruto sales totaal blijft gelijk (geen € verlies)',
        ok: Math.abs(bruto52 - net52Shifted) < 1,
        detail: `bruto: ${cffFmt(bruto52)} · na shift: ${cffFmt(net52Shifted)} · diff: ${cffFmt(net52Shifted-bruto52)}`
    });

    // Check 8: BTW — alleen kwartalen waarvan de afdrachtweek BINNEN de horizon valt mogen meetellen
    if (btwQuarters) {
        const btwInModel = weeks.reduce((s,w)=>s + (w.btwOut||0), 0);
        const inHorizonTotal = Object.values(btwQuarters)
            .filter(it => horizonKeys.has(it.payWeekKey))
            .reduce((s,it)=>s + it.payAmount, 0);
        const allTotal = Object.values(btwQuarters).reduce((s,it)=>s + it.payAmount, 0);
        const skipped = Object.values(btwQuarters).filter(it => !horizonKeys.has(it.payWeekKey)).length;
        checks.push({
            label: 'BTW: kwartaalafdrachten in horizon ↔ model',
            ok: Math.abs(btwInModel - inHorizonTotal) < 1,
            detail: `model: ${cffFmt(btwInModel)} · in horizon: ${cffFmt(inHorizonTotal)} · totaal alle kwartalen: ${cffFmt(allTotal)}${skipped?` · ${skipped} kwartaal(en) buiten horizon`:''}`
        });
    }

    // Check 9: Loans — model totaal ↔ verwachte maandlast × maanden in horizon
    const modelLoan = weeks.reduce((s,w)=>s + (w.loanOut||0), 0);
    if (loansArr.length > 0) {
        checks.push({
            label: 'Loans: maandlasten geplaatst in horizon',
            ok: Math.abs(Math.abs(modelLoan) - loanTotalFromConfig) < 1,
            detail: `${loansArr.length} lening(en) · model: ${cffFmt(modelLoan)} · som maandlasten in horizon: ${cffFmt(-loanTotalFromConfig)}`
        });
    }

    // Check 10: Voorraadprojectie — negatieve voorraad = onvoldoende stock
    const negStockWeeks = weeks.filter(w => w.stockLevel < 0);
    const lowestStock = weeks.reduce((min, w) => w.stockLevel < min.value ? { week: w, value: w.stockLevel } : min, { week: null, value: Infinity });
    if (stockData && stockData.balance > 0) {
        checks.push({
            label: 'Voorraad: projectie blijft positief',
            ok: negStockWeeks.length === 0,
            detail: negStockWeeks.length === 0
                ? `start: ${cffFmt(stockData.balance)} · laagste: ${cffFmt(lowestStock.value)} (W${lowestStock.week?.week||'?'})`
                : `⚠ Negatieve voorraad in ${negStockWeeks.length} weken · laagste: ${cffFmt(lowestStock.value)} (W${lowestStock.week?.week||'?'}) · start: ${cffFmt(stockData.balance)}`
        });
    }

    const modelBtw = weeks.reduce((s,w)=>s + (w.btwOut||0), 0);
    const modelEvents = weeks.reduce((s,w)=>s + (w.eventOut||0), 0);

    // Check 10: Cashpositie waarschuwing — laagste punt onder 0?
    if (cashCfg.startBalance !== 0 || running !== 0) {
        checks.push({
            label: 'Cash: laagste punt in horizon',
            ok: lowest.value >= 0,
            detail: lowest.week
                ? `laagste: ${cffFmt(lowest.value)} in W${lowest.week.week}-${lowest.week.year} · eindstand: ${cffFmt(running)}`
                : 'geen weken'
        });
    }

    // Check: Inkoop dekking + extrapolatie
    const extrapWeeks = weeks.filter(w => w.inkoopExtrapolated).length;
    if (lastInkoopKey != null) {
        const lastY = Math.floor(lastInkoopKey/100), lastW = lastInkoopKey%100;
        if (extrapWeeks === 0) {
            checks.push({ label: 'Inkoop/WO data dekt horizon', ok: true, detail: `volledig — laatste data W${lastW}-${lastY}` });
        } else if (inkoopRatio > 0) {
            checks.push({
                label: 'Inkoop/WO geëxtrapoleerd voor missing weken',
                ok: null,
                detail: `${extrapWeeks} wk na W${lastW}-${lastY} ingevuld via COGS-ratio ${(inkoopRatio*100).toFixed(1)}% × forecast sales (P&L 12m)`
            });
        } else {
            checks.push({
                label: 'Inkoop/WO data dekt horizon',
                ok: false,
                detail: `⚠ ${extrapWeeks} wk zonder data en geen COGS-ratio uit P&L → inkoop = 0`
            });
        }
    } else {
        checks.push({ label: 'Inkoop/WO data dekt horizon', ok: false, detail: 'geen inkoopdata geladen' });
    }

    // Check 11: WC openings — som model = som verwacht
    const modelWc = weeks.reduce((s,w)=>s + (w.wcOpen||0), 0);
    if (wcResult && wcResult.summary) {
        const expected = (wcResult.summary.ar||0) + (wcResult.summary.ap||0) + (wcResult.summary.btw||0) + (wcResult.summary.lh||0);
        checks.push({
            label: 'Werkkapitaal openings: in model ↔ verwacht',
            ok: Math.abs(modelWc - expected) < 1,
            detail: `model: ${cffFmt(modelWc)} · verwacht: ${cffFmt(expected)} (AR ${cffFmt(wcResult.summary.ar)} · AP ${cffFmt(wcResult.summary.ap)} · BTW ${cffFmt(wcResult.summary.btw)} · LH ${cffFmt(wcResult.summary.lh)})`
        });
    }

    return {
        weeks, checks,
        totals: { sales: modelSales, inkoop: modelInk, opex: opexInModelYear, loan: modelLoan, btw: modelBtw, wc: modelWc, events: modelEvents },
        cash: { start: cashCfg.startBalance, end: running, lowest },
        wc: wcResult,
        dso: { aggregate: dsoResult.aggregate, articles: Object.keys(dsoByArticle).length },
        stock: stockData ? { startBalance: stockData.balance, hasData: true } : { startBalance: 0, hasData: false }
    };
}

export function cffRenderOpex() {
    const el = document.getElementById('cffOpexTable');
    if (!el) return;
    const arr = cffOpexGet();
    if (arr.length === 0) {
        el.innerHTML = '<p style="color:#999;font-style:italic;">Geen OPEX-posten. Klik "Seed uit P&amp;L" om automatisch te vullen, of "Voeg post toe".</p>';
        return;
    }
    let html = '<table class="pnl-table"><thead><tr><th>Label</th><th>Categorie</th><th>Frequentie</th><th class="pnl-amount">Bedrag (€)</th><th>Vanaf</th><th></th></tr></thead><tbody>';
    for (const e of arr) {
        html += '<tr>';
        html += `<td><input type="text" value="${(e.label||'').replace(/"/g,'&quot;')}" onchange="cffOpexUpdate('${e.id}','label',this.value)" style="width:200px;"></td>`;
        html += `<td><select onchange="cffOpexUpdate('${e.id}','category',this.value)">${CFF_OPEX_CATEGORIES.map(c=>`<option value="${c}"${c===e.category?' selected':''}>${c}</option>`).join('')}</select></td>`;
        html += `<td><select onchange="cffOpexUpdate('${e.id}','frequency',this.value)">` +
            ['weekly','monthly','quarterly','yearly'].map(f=>`<option value="${f}"${f===e.frequency?' selected':''}>${f}</option>`).join('') +
            '</select></td>';
        html += `<td class="pnl-amount"><input type="number" step="1" value="${e.amount}" onchange="cffOpexUpdate('${e.id}','amount',this.value)" style="width:100px;text-align:right;"></td>`;
        html += `<td><input type="date" value="${e.startDate||''}" onchange="cffOpexUpdate('${e.id}','startDate',this.value)"></td>`;
        html += `<td><button class="btn btn-outline" onclick="cffOpexDelete('${e.id}')" style="color:#c53030;padding:4px 8px;">×</button></td>`;
        html += '</tr>';
    }
    // Totals
    const monthly = arr.filter(e=>e.frequency==='monthly').reduce((s,e)=>s+e.amount,0);
    const yearly = arr.filter(e=>e.frequency==='yearly').reduce((s,e)=>s+e.amount,0);
    const quarterly = arr.filter(e=>e.frequency==='quarterly').reduce((s,e)=>s+e.amount,0);
    const weekly = arr.filter(e=>e.frequency==='weekly').reduce((s,e)=>s+e.amount,0);
    const yearTotal = monthly*12 + yearly + quarterly*4 + weekly*52;
    html += `</tbody><tfoot><tr style="font-weight:bold;"><td colspan="3">Totaal jaarlijks equivalent</td><td class="pnl-amount">${cffFmt(yearTotal)}</td><td colspan="2"></td></tr></tfoot></table>`;
    el.innerHTML = html;
}

// Auto-seed: vul OPEX, Leningen, Cash uit brondata als ze nog leeg zijn
export function cffAutoSeed() {
    if (!pnlTransactionLines || pnlTransactionLines.length === 0) return;
    // OPEX: seed als er nog geen items zijn
    if (cffOpexGet().length === 0) {
        cffOpexSeedFromPnl(true);
    }
    // Leningen: seed als er nog geen items zijn
    if (cffLoansGet().length === 0) {
        cffLoansSeedFromPnl(true);
    }
    // Cash: seed als startsaldo nog op 0 staat
    const cashCfg = cffCashGet();
    if (!cashCfg.startBalance || cashCfg.startBalance === 0) {
        cffCashSeedFromBank(true);
    }
}

export function cffRenderModel() {
    const sanityEl = document.getElementById('cffSanity');
    const tableEl = document.getElementById('cffModelTable');
    const totalsEl = document.getElementById('cffModelTotals');
    if (!tableEl) return;
    const m = cffBuildModel();

    // Sanity bar — collapsed summary with only failures visible
    const sanityBar = document.getElementById('cffSanityBar');
    const sanitySummary = document.getElementById('cffSanitySummary');
    const sanityDetails = document.getElementById('cffSanityDetails');
    if (sanitySummary && sanityDetails) {
        const fails = m.checks.filter(c => c.ok === false);
        const warns = m.checks.filter(c => c.ok === null);
        const allOk = fails.length === 0;

        // Summary line
        if (allOk && warns.length === 0) {
            sanitySummary.innerHTML = '<span style="color:#38a169;">&#10003;</span><span style="color:#38a169;">Alle checks OK</span><span style="color:#999;font-weight:400;font-size:12px;">(' + m.checks.length + ' checks)</span>';
        } else {
            const parts = [];
            if (fails.length > 0) parts.push('<span style="color:#e53e3e;">' + fails.length + ' waarschuwing' + (fails.length>1?'en':'') + '</span>');
            if (warns.length > 0) parts.push('<span style="color:#999;">' + warns.length + ' info</span>');
            sanitySummary.innerHTML = '<span style="color:#e53e3e;">&#9888;</span>' + parts.join(' · ') + '<span style="color:#999;font-weight:400;font-size:12px;margin-left:4px;">klik voor details</span>';
            // Auto-open if there are failures
            if (sanityBar && fails.length > 0) sanityBar.classList.add('open');
        }

        // Details: show all non-OK checks, plus all checks in collapsed section
        let dh = '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">';
        for (const c of m.checks) {
            const icon = c.ok === true ? '&#10003;' : (c.ok === false ? '&#9888;' : '&#8212;');
            const color = c.ok === true ? '#38a169' : (c.ok === false ? '#e53e3e' : '#a0aec0');
            dh += `<div style="display:flex;gap:8px;font-size:12px;align-items:baseline;"><span style="color:${color};font-weight:700;">${icon}</span><span style="color:${color};font-weight:600;">${c.label}</span><span style="color:#718096;">${c.detail}</span></div>`;
        }
        dh += '</div>';
        sanityDetails.innerHTML = dh;
    }

    // Hidden sanity div (for backwards compat)
    if (sanityEl) sanityEl.innerHTML = '';

    // Totals line above table
    if (totalsEl) {
        let th = `Sales: <b>${cffFmt(m.totals.sales)}</b> · Inkoop: <b>${cffFmt(m.totals.inkoop)}</b> · OPEX: <b>${cffFmt(-m.totals.opex)}</b> · Leningen: <b>${cffFmt(m.totals.loan||0)}</b> · BTW: <b>${cffFmt(m.totals.btw||0)}</b> · WC: <b>${cffFmt(m.totals.wc||0)}</b> · Events: <b>${cffFmt(m.totals.events||0)}</b>`;
        if (m.cash) {
            const lowCls = m.cash.lowest && m.cash.lowest.value < 0 ? 'pnl-negative' : 'pnl-positive';
            th += `<br>Cash — start: <b>${cffFmt(m.cash.start)}</b> · eind: <b>${cffFmt(m.cash.end)}</b> · laagste: <b class="${lowCls}">${cffFmt(m.cash.lowest.value)}</b>${m.cash.lowest.week?` in W${m.cash.lowest.week.week}-${m.cash.lowest.week.year}`:''}`;
        }
        totalsEl.innerHTML = th;
    }

    // Table: standaard cashflow statement — tijd horizontaal, rijen = items
    const horizonWk = (cffCashGet().horizonWeeks) || 52;
    const show = m.weeks.slice(0, horizonWk);
    const lowKey = m.cash && m.cash.lowest && m.cash.lowest.week ? m.cash.lowest.week.key : null;



    // Determine year boundaries for subtotal columns
    const yearBreaks = []; // indices where year changes (insert subtotal BEFORE this index)
    const yearGroups = {}; // year → [indices]
    for (let i = 0; i < show.length; i++) {
        const yr = show[i].year;
        if (!yearGroups[yr]) yearGroups[yr] = [];
        yearGroups[yr].push(i);
        if (i > 0 && show[i].year !== show[i-1].year) yearBreaks.push(i);
    }
    const years = Object.keys(yearGroups).map(Number).sort();
    const hasMultipleYears = years.length > 1;

    // Header row with week labels + year subtotal columns
    const yrSubStyle = 'border-left:2px solid #4a5568;background:#edf2f7;font-weight:700;';
    let th = `<div style="overflow-x:auto;"><table class="pnl-table" style="font-size:12px;"><thead><tr><th style="min-width:200px;position:sticky;left:0;background:#fff;z-index:1;"></th>`;
    for (let i = 0; i < show.length; i++) {
        const w = show[i];
        // Insert year subtotal header before year break
        if (hasMultipleYears && yearBreaks.includes(i)) {
            th += `<th class="pnl-amount" style="${yrSubStyle}">${show[i-1].year}</th>`;
        }
        const colStyle = w.key === lowKey ? 'background:#fffbe6;' : '';
        th += `<th class="pnl-amount" style="white-space:nowrap;${colStyle}">W${w.week}</th>`;
    }
    // Last year subtotal + grand total
    if (hasMultipleYears) th += `<th class="pnl-amount" style="${yrSubStyle}">${years[years.length-1]}</th>`;
    th += `<th class="pnl-amount" style="border-left:2px solid #cbd5e0;">Totaal</th></tr></thead><tbody>`;

    // Enhanced cfRow: inserts year subtotals
    function cfRowYr(label, getter, opts) {
        const isBold = opts && opts.bold;
        const isSep = opts && opts.separator;
        const indent = opts && opts.indent ? 'padding-left:20px;' : '';
        const borderTop = isSep ? 'border-top:2px solid #1a365d;' : '';
        const bg = isSep ? 'background:#f7fafc;' : '';
        const isCum = opts && opts.cumulative; // don't sum for cumulative rows — show last value
        const rowBg = isSep ? '#f7fafc' : '#fff';
        let row = `<tr style="${borderTop}${bg}"><td style="white-space:nowrap;${indent}${isBold?'font-weight:700;':''}font-size:12px;position:sticky;left:0;background:${rowBg};z-index:1;">${label}</td>`;
        let total = 0;
        const yearTotals = {};
        for (let i = 0; i < show.length; i++) {
            const w = show[i];
            const v = getter(w);
            total += v;
            const yr = w.year;
            if (!yearTotals[yr]) yearTotals[yr] = { sum: 0, last: 0 };
            yearTotals[yr].sum += v;
            yearTotals[yr].last = isCum ? v : yearTotals[yr].sum;

            // Insert year subtotal before year break
            if (hasMultipleYears && yearBreaks.includes(i)) {
                const prevYr = show[i-1].year;
                const yt = isCum ? yearTotals[prevYr].last : yearTotals[prevYr].sum;
                const ytCls = yt > 0.5 ? 'pnl-positive' : (yt < -0.5 ? 'pnl-negative' : '');
                row += `<td class="pnl-amount ${ytCls}" style="${yrSubStyle}${isBold?'font-weight:700;':''}">${Math.abs(yt) < 0.5 ? '—' : cffFmt(yt)}</td>`;
            }

            const colStyle = w.key === lowKey ? 'background:#fffbe6;' : '';
            const cls = v > 0.5 ? 'pnl-positive' : (v < -0.5 ? 'pnl-negative' : '');
            const extrap = opts && opts.extrapKey && w[opts.extrapKey] ? ' style="color:#b7791f;font-style:italic;"' : '';
            row += `<td class="pnl-amount ${cls}" style="${colStyle}${isBold?'font-weight:700;':''}"${extrap}>${Math.abs(v) < 0.5 ? '—' : cffFmt(v) + (opts && opts.extrapKey && w[opts.extrapKey] ? ' ~' : '')}</td>`;
        }
        // Last year subtotal
        if (hasMultipleYears) {
            const lastYr = years[years.length-1];
            const yt = isCum ? yearTotals[lastYr].last : yearTotals[lastYr].sum;
            const ytCls = yt > 0.5 ? 'pnl-positive' : (yt < -0.5 ? 'pnl-negative' : '');
            row += `<td class="pnl-amount ${ytCls}" style="${yrSubStyle}${isBold?'font-weight:700;':''}">${Math.abs(yt) < 0.5 ? '—' : cffFmt(yt)}</td>`;
        }
        // Grand total
        const tCls = total > 0.5 ? 'pnl-positive' : (total < -0.5 ? 'pnl-negative' : '');
        const tVal = isCum ? getter(show[show.length-1]) : total;
        const tCls2 = tVal > 0.5 ? 'pnl-positive' : (tVal < -0.5 ? 'pnl-negative' : '');
        row += `<td class="pnl-amount ${tCls2}" style="border-left:2px solid #cbd5e0;${isBold?'font-weight:700;':''}"><b>${Math.abs(tVal) < 0.5 ? '—' : cffFmt(tVal)}</b></td>`;
        row += '</tr>';
        return row;
    }

    const colSpan = show.length + (hasMultipleYears ? years.length : 0) + 2;

    // === 1. OPERATIONELE KASSTROOM ===
    th += `<tr><td colspan="${colSpan}" style="font-weight:700;font-size:13px;color:#1a365d;padding-top:12px;">1. Operationele kasstroom</td></tr>`;
    th += cfRowYr('Ontvangsten klanten', w => w.salesIn, { indent: true });
    th += cfRowYr('Inkoop + werkorders', w => w.inkoopOut, { indent: true, extrapKey: 'inkoopExtrapolated' });
    th += cfRowYr('Bedrijfskosten (OPEX)', w => w.opexOut, { indent: true });
    th += cfRowYr('BTW-saldo', w => w.btwOut || 0, { indent: true });
    th += cfRowYr('Werkkapitaal mutaties', w => w.wcOpen || 0, { indent: true });
    th += cfRowYr('Operationele kasstroom', w => w.salesIn + w.inkoopOut + w.opexOut + (w.btwOut||0) + (w.wcOpen||0), { bold: true, separator: true });

    // === 2. INVESTERINGSKASSTROOM ===
    th += `<tr><td colspan="${colSpan}" style="font-weight:700;font-size:13px;color:#1a365d;padding-top:12px;">2. Investeringskasstroom</td></tr>`;
    th += cfRowYr('CAPEX', w => w.capexOut || 0, { indent: true });
    th += cfRowYr('Investeringskasstroom', w => w.capexOut || 0, { bold: true, separator: true });

    // === 3. FINANCIERINGSKASSTROOM ===
    th += `<tr><td colspan="${colSpan}" style="font-weight:700;font-size:13px;color:#1a365d;padding-top:12px;">3. Financieringskasstroom</td></tr>`;
    th += cfRowYr('Leningen (aflossing + rente)', w => w.loanOut || 0, { indent: true });
    th += cfRowYr('Aandelenuitgifte / overig', w => w.equityOut || 0, { indent: true });
    th += cfRowYr('Financieringskasstroom', w => (w.loanOut||0) + (w.equityOut||0), { bold: true, separator: true });

    // === NETTO + CUMULATIEF ===
    th += `<tr><td colspan="${colSpan}" style="padding-top:8px;"></td></tr>`;
    th += cfRowYr('Netto kasstroom', w => w.net, { bold: true, separator: true });
    th += cfRowYr('Cumulatieve cashpositie', w => w.cumCash || 0, { bold: true, cumulative: true });

    th += '</tbody></table></div>';
    tableEl.innerHTML = th;

    // === CASHFLOW CHART ===
    cffRenderChart(show);

    // Update accordion status dots after model rebuild
    try { cffUpdateAccordionStatus(); } catch(e) { /* ignore */ }
}

export function cffRenderChart(weeks) {
    const canvas = document.getElementById('cffCashChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_cffChartInstance) { _cffChartInstance.destroy(); set_cffChartInstance(null); }

    const labels = weeks.map(w => 'W' + w.week);
    const cumCash = weeks.map(w => Math.round(w.cumCash || 0));
    const netWeekly = weeks.map(w => Math.round(w.net || 0));

    // Find lowest point
    const minVal = Math.min(...cumCash);
    const minIdx = cumCash.indexOf(minVal);

    // Point colors: red for lowest, transparent for rest
    const pointBg = cumCash.map((v, i) => i === minIdx ? '#c53030' : 'transparent');
    const pointRadius = cumCash.map((v, i) => i === minIdx ? 6 : 0);

    set_cffChartInstance(new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Cumulatieve cashpositie',
                    data: cumCash,
                    borderColor: '#2b6cb0',
                    backgroundColor: 'rgba(43,108,176,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: pointBg,
                    pointRadius: pointRadius,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                    order: 1
                },
                {
                    label: 'Netto kasstroom per week',
                    data: netWeekly,
                    type: 'bar',
                    backgroundColor: netWeekly.map(v => v >= 0 ? 'rgba(47,133,90,0.35)' : 'rgba(197,48,48,0.35)'),
                    borderWidth: 0,
                    barPercentage: 0.6,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const v = ctx.parsed.y;
                            const sign = v < 0 ? '-' : '';
                            return ctx.dataset.label + ': ' + sign + '€ ' + Math.abs(v).toLocaleString('nl-NL');
                        }
                    }
                },
                annotation: undefined
            },
            scales: {
                y: {
                    ticks: {
                        callback: function(v) {
                            const sign = v < 0 ? '-' : '';
                            return sign + '€' + (Math.abs(v)/1000).toLocaleString('nl-NL', {maximumFractionDigits:0}) + 'K';
                        },
                        font: { size: 11 }
                    },
                    grid: { color: '#e2e8f0' }
                },
                x: {
                    ticks: { font: { size: 11 }, maxRotation: 0 },
                    grid: { display: false }
                }
            }
        },
        plugins: [{
            // Zero-line plugin: draw red dashed line at y=0
            id: 'zeroLine',
            afterDraw(chart) {
                const yScale = chart.scales.y;
                const yPos = yScale.getPixelForValue(0);
                if (yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = '#c53030';
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(chart.chartArea.left, yPos);
                    ctx.lineTo(chart.chartArea.right, yPos);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }]
    }));
}

// ============================================================
//  STAP 5: DSO — Days Sales Outstanding
//  Bron: cogsSalesInvoices (elke regel heeft invoiceDate, dueDate,
//  customerCode, amountDC, itemCode). We gebruiken DueDate − InvoiceDate
//  als EXPECTED payment term (contractueel). Werkelijk realised DSO
//  (via matching met creditor payment lines) kan later toegevoegd worden.
// ============================================================
export function cffDaysBetween(a, b) {
    if (!a || !b) return null;
    const d1 = new Date(a), d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
}

// Compute DSO per customer, per article, and aggregate
export function cffComputeDSO(monthsBack = 12) {
    if (!cogsSalesInvoices || cogsSalesInvoices.length === 0) {
        return { byCustomer: {}, byArticle: {}, aggregate: null, totalAmt: 0, totalLines: 0 };
    }
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const cutoffStr = cutoff.toISOString().slice(0,10);

    // Weight per customer: Σ(days × amount), Σ amount
    const cust = {}; // code → { name, sumDaysAmt, sumAmt, invoices:Set, lines }
    // Weight per article: need (article, customer) sales mix, plus customer DSO
    const artCust = {}; // articleCode → { customerCode → amount }

    for (const l of cogsSalesInvoices) {
        if (!l.invoiceDate || l.invoiceDate < cutoffStr) continue;
        if (!l.dueDate) continue;
        const days = cffDaysBetween(l.invoiceDate, l.dueDate);
        if (days == null || days < 0 || days > 365) continue; // sanity
        const amt = Math.abs(l.amountDC || 0);
        if (amt <= 0) continue;

        const ccode = l.customerCode || '(onbekend)';
        if (!cust[ccode]) cust[ccode] = { name: l.customerName || ccode, sumDaysAmt: 0, sumAmt: 0, invoices: new Set(), lines: 0 };
        cust[ccode].sumDaysAmt += days * amt;
        cust[ccode].sumAmt += amt;
        cust[ccode].invoices.add(l.invoiceId);
        cust[ccode].lines++;

        const aCode = String(l.itemCode || '').trim();
        if (aCode) {
            if (!artCust[aCode]) artCust[aCode] = {};
            artCust[aCode][ccode] = (artCust[aCode][ccode] || 0) + amt;
        }
    }

    // Finalize per-customer
    const byCustomer = {};
    let totalAmt = 0, totalDaysAmt = 0, totalLines = 0;
    for (const [code, v] of Object.entries(cust)) {
        if (v.sumAmt <= 0) continue;
        const dso = v.sumDaysAmt / v.sumAmt;
        byCustomer[code] = {
            code, name: v.name,
            dsoDays: dso,
            amountDC: v.sumAmt,
            invoices: v.invoices.size,
            lines: v.lines,
        };
        totalAmt += v.sumAmt;
        totalDaysAmt += v.sumDaysAmt;
        totalLines += v.lines;
    }
    const aggregate = totalAmt > 0 ? totalDaysAmt / totalAmt : null;

    // Per artikel: gewogen gemiddelde via customer DSO × customer sales-mix
    const byArticle = {};
    for (const [aCode, custMap] of Object.entries(artCust)) {
        let sumD = 0, sumA = 0;
        for (const [ccode, amt] of Object.entries(custMap)) {
            const cDso = byCustomer[ccode]?.dsoDays;
            if (cDso == null) continue;
            sumD += cDso * amt;
            sumA += amt;
        }
        if (sumA > 0) byArticle[aCode] = { dsoDays: sumD / sumA, amountDC: sumA };
    }

    return { byCustomer, byArticle, aggregate, totalAmt, totalLines };
}

// Manual override: per customer or per article DSO in days
export function cffDsoGetOverrides() {
    try { return JSON.parse(localStorage.getItem('cashflow_dso_overrides') || '{"customers":{},"articles":{}}'); }
    catch(e) { return { customers:{}, articles:{} }; }
}
export function cffDsoSaveOverrides(o) { localStorage.setItem('cashflow_dso_overrides', JSON.stringify(o)); }
export function cffDsoSetCustomer(code, days) {
    const o = cffDsoGetOverrides();
    const d = parseFloat(String(days).replace(',','.'));
    if (isNaN(d) || d < 0) delete o.customers[code]; else o.customers[code] = d;
    cffDsoSaveOverrides(o); cffRenderDso(); cffRenderModel();
}

// Apply override to computed DSO result
export function cffDsoApplied() {
    const raw = cffComputeDSO(12);
    const ov = cffDsoGetOverrides();
    const byCustomer = { ...raw.byCustomer };
    for (const [code, days] of Object.entries(ov.customers || {})) {
        if (!byCustomer[code]) byCustomer[code] = { code, name: code, dsoDays: 0, amountDC: 0, invoices: 0, lines: 0, override: true };
        byCustomer[code].dsoDays = days;
        byCustomer[code].override = true;
    }
    // Recompute per-article
    const artCust = {};
    for (const l of (cogsSalesInvoices || [])) {
        const aCode = String(l.itemCode || '').trim();
        const ccode = l.customerCode || '(onbekend)';
        const amt = Math.abs(l.amountDC || 0);
        if (!aCode || !amt) continue;
        if (!artCust[aCode]) artCust[aCode] = {};
        artCust[aCode][ccode] = (artCust[aCode][ccode] || 0) + amt;
    }
    const byArticle = {};
    for (const [aCode, custMap] of Object.entries(artCust)) {
        let sumD = 0, sumA = 0;
        for (const [ccode, amt] of Object.entries(custMap)) {
            const c = byCustomer[ccode];
            if (c && c.dsoDays != null) { sumD += c.dsoDays * amt; sumA += amt; }
        }
        if (sumA > 0) byArticle[aCode] = { dsoDays: sumD / sumA, amountDC: sumA };
    }
    // Aggregate (weighted by amountDC from raw computation)
    let totA=0, totD=0;
    for (const c of Object.values(byCustomer)) {
        if (!c.amountDC || c.dsoDays == null) continue;
        totA += c.amountDC; totD += c.dsoDays * c.amountDC;
    }
    return { byCustomer, byArticle, aggregate: totA > 0 ? totD/totA : null };
}

export function cffRenderDso() {
    const el = document.getElementById('cffDsoPanel');
    if (!el) return;
    const data = cffDsoApplied();
    if (!data.byCustomer || Object.keys(data.byCustomer).length === 0) {
        el.innerHTML = '<p style="color:#999;">Geen sales facturen met DueDate in de laatste 12 mnd.</p>';
        return;
    }
    let html = `<div style="font-size:14px;margin-bottom:8px;">Aggregate DSO (gewogen, laatste 12 mnd): <b>${data.aggregate != null ? data.aggregate.toFixed(1) + ' dagen' : '—'}</b></div>`;
    html += '<h4 style="margin:12px 0 4px;">Per klant</h4>';
    html += '<table class="pnl-table"><thead><tr><th>Klant</th><th class="pnl-amount">Facturen</th><th class="pnl-amount">Omzet (DC)</th><th class="pnl-amount">Berekende DSO</th><th>Override (dagen)</th></tr></thead><tbody>';
    const ov = cffDsoGetOverrides();
    const custs = Object.values(data.byCustomer).sort((a,b) => (b.amountDC||0) - (a.amountDC||0));
    for (const c of custs) {
        const curOv = ov.customers[c.code] != null ? ov.customers[c.code] : '';
        html += `<tr>` +
            `<td>${c.name} <span style="color:#999;font-size:11px;">(${c.code})</span></td>` +
            `<td class="pnl-amount">${c.invoices||0}</td>` +
            `<td class="pnl-amount">${cffFmt(c.amountDC||0)}</td>` +
            `<td class="pnl-amount">${c.dsoDays != null ? c.dsoDays.toFixed(1) : '—'}${c.override?' <span style="color:#c53030;">*</span>':''}</td>` +
            `<td><input type="number" step="1" value="${curOv}" style="width:70px;" onchange="cffDsoSetCustomer('${c.code}', this.value)"></td>` +
            `</tr>`;
    }
    html += '</tbody></table>';

    // Per artikel top 20
    html += '<h4 style="margin:12px 0 4px;">Per artikel (top 20, gewogen via klant-mix)</h4>';
    const arts = Object.entries(data.byArticle).map(([code,v]) => ({ code, ...v })).sort((a,b)=>b.amountDC-a.amountDC).slice(0,20);
    html += '<table class="pnl-table"><thead><tr><th>Artikel</th><th>Omschrijving</th><th class="pnl-amount">Omzet (DC)</th><th class="pnl-amount">DSO (dagen)</th></tr></thead><tbody>';
    const itemDesc = {};
    (cogsItems || []).forEach(i => { itemDesc[i.code] = i.description || ''; });
    for (const a of arts) {
        html += `<tr><td>${a.code}</td><td>${itemDesc[a.code]||''}</td><td class="pnl-amount">${cffFmt(a.amountDC)}</td><td class="pnl-amount">${a.dsoDays.toFixed(1)}</td></tr>`;
    }
    html += '</tbody></table>';
    html += '<p style="color:#666;font-size:12px;margin-top:6px;">Bron: salesInvoiceHeaders DueDate − InvoiceDate (expected term), gewogen met AmountDC per regel. Per artikel gewogen via de sales-mix over klanten.</p>';
    el.innerHTML = html;
}

// ============================================================
//  STAP 6: DPO — Days Payable Outstanding (stub tot sync gefikst)
// ============================================================
export function cffDpoGet() {
    const v = parseFloat(localStorage.getItem('cashflow_dpo_days'));
    return Number.isFinite(v) && v >= 0 ? v : 0;
}
export function cffDpoSet(v) {
    const n = Math.max(0, parseFloat(v) || 0);
    localStorage.setItem('cashflow_dpo_days', String(n));
    cffRenderModel && cffRenderModel();
}

export function cffRenderDpo() {
    const el = document.getElementById('cffDpoPanel');
    if (!el) return;
    const cur = cffDpoGet();
    el.innerHTML = `
        <div style="padding:12px;background:#f7fafc;border:1px solid #cbd5e0;border-radius:4px;">
            <b>DPO — betaaltermijn inkoopfacturen</b><br>
            <span style="font-size:13px;color:#666;">Standaard <b>0 dagen</b> (cash bij ontvangst). Aanpasbaar hieronder — wordt toegepast op alle inkoop in het cashflowmodel.</span>
            <div style="margin-top:10px;">
                <label style="font-size:13px;">DPO (dagen):
                    <input type="number" min="0" step="1" value="${cur}"
                        onchange="cffDpoSet(this.value)"
                        style="width:80px;padding:4px;margin-left:6px;">
                </label>
            </div>
            <p style="color:#999;font-size:12px;margin-top:8px;">Later automatisch te berekenen uit purchaseEntries zodra die in dataset.json staan.</p>
        </div>`;
}

// ============================================================
//  STAP 4: Loans / financiering
//  Per lening: vaste maandlast (aflossing + rente), tussen start en einddatum
//  Geplaatst op de week die de betaaldag in die maand bevat
// ============================================================
export function cffLoansGet() {
    try { return JSON.parse(localStorage.getItem('cashflow_loans') || '[]'); }
    catch(e) { return []; }
}
export function cffLoansSave(arr) {
    localStorage.setItem('cashflow_loans', JSON.stringify(arr));
}
export function cffLoansAdd() {
    const arr = cffLoansGet();
    const today = new Date();
    const start = today.toISOString().slice(0,10);
    const endDt = new Date(today); endDt.setFullYear(endDt.getFullYear()+5);
    arr.push({
        id: 'ln_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        label: 'Nieuwe lening',
        principal: 0,
        aflossing: 0,
        rente: 0,
        startDate: start,
        endDate: endDt.toISOString().slice(0,10),
        paymentDay: 1,
    });
    cffLoansSave(arr);
    cffRenderLoans();
    cffRenderModel && cffRenderModel();
}
// Loan GL accounts (passiva). label is what gets shown if no name in pnlGLAccounts.
export const CFF_LOAN_ACCOUNTS = {
    '0900': 'Rabo lening A',
    '0925': 'Rabo lening B',
    '0928': 'Rabo lening C',
    '0950': 'Invest International A',
    '0955': 'Invest International B',
};
export const CFF_INTEREST_ACCOUNTS = ['4905','4920','4925','4930','4935','4960'];

export function cffLoansSeedFromPnl(silent) {
    if (!pnlTransactionLines || pnlTransactionLines.length === 0) {
        if (!silent) alert('Geen P&L data geladen. Upload eerst transactionLines.');
        return;
    }
    // Per loan account: outstanding = -sum(amount), recent monthly aflossing avg
    const months = 6;
    // Anker op vandaag (niet op laatste boeking — die kan in de toekomst liggen door pre-boekingen)
    const todayStr = new Date().toISOString().slice(0,10);
    const dates = pnlTransactionLines
        .filter(t => t.date && !t.isYearEndClose && t.date <= todayStr)
        .map(t => t.date).sort();
    if (dates.length === 0) { alert('Geen datums in P&L data.'); return; }
    const lastDate = new Date(dates[dates.length-1]);
    const cutoff = new Date(lastDate); cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const lastDateStr = lastDate.toISOString().slice(0,10);

    // Gather per loan account
    const seeds = [];
    let totalOutstanding = 0;
    for (const [code, defaultLabel] of Object.entries(CFF_LOAN_ACCOUNTS)) {
        const lines = pnlTransactionLines.filter(t => t.accountCode === code && !t.isYearEndClose);
        if (lines.length === 0) continue;
        const sum = lines.reduce((s,t)=>s+t.amount, 0);
        const outstanding = -sum; // passiva → flip sign to positive
        if (outstanding < 100) continue; // afgelost / leeg
        // Maandelijkse aflossing: bekijk laatste 6 mnd. Per maand sommeer; positieve som = aflossing.
        const monthly = {};
        for (const l of lines) {
            if (!l.date || l.date < cutoffStr || l.date > lastDateStr) continue;
            const ym = l.date.slice(0,7);
            monthly[ym] = (monthly[ym] || 0) + l.amount;
        }
        const monthVals = Object.values(monthly);
        // Op passiva-rekening: positieve mutatie = aflossing. Neem alleen maanden met positieve mutatie.
        const aflMonths = monthVals.filter(v => v > 0);
        const avgAflossing = aflMonths.length > 0
            ? aflMonths.reduce((s,v)=>s+v,0) / aflMonths.length
            : 0;
        const label = (pnlGLAccounts[code] || defaultLabel);
        seeds.push({ code, label, outstanding, avgAflossing });
        totalOutstanding += outstanding;
    }
    if (seeds.length === 0) {
        if (!silent) alert('Geen actieve leningen gevonden op rekeningen ' + Object.keys(CFF_LOAN_ACCOUNTS).join(', '));
        return;
    }

    // Totale rente per maand = som van interest accounts laatste 6 mnd / 6
    let totalInterestRecent = 0, interestMonthsCovered = 0;
    const interestMonthly = {};
    for (const t of pnlTransactionLines) {
        if (t.isYearEndClose || !t.date || t.date < cutoffStr || t.date > lastDateStr) continue;
        if (!CFF_INTEREST_ACCOUNTS.includes(t.accountCode)) continue;
        const ym = t.date.slice(0,7);
        interestMonthly[ym] = (interestMonthly[ym] || 0) + t.amount;
        totalInterestRecent += t.amount;
    }
    interestMonthsCovered = Object.keys(interestMonthly).length || 1;
    const avgInterestPerMonth = totalInterestRecent / interestMonthsCovered;

    // Bestaande loans niet vervangen, alleen aanvullen op basis van code (in label opnemen)
    const arr = cffLoansGet();
    const today = new Date().toISOString().slice(0,10);
    let added = 0, updated = 0;
    for (const s of seeds) {
        // Eindraming: outstanding / aflossing = aantal maanden te gaan
        let endIso = '';
        if (s.avgAflossing > 0) {
            const monthsLeft = Math.max(1, Math.round(s.outstanding / s.avgAflossing));
            const ed = new Date();
            ed.setMonth(ed.getMonth() + monthsLeft);
            endIso = ed.toISOString().slice(0,10);
        }
        // Rente proportioneel aan outstanding
        const renteShare = totalOutstanding > 0 ? avgInterestPerMonth * (s.outstanding / totalOutstanding) : 0;
        const exists = arr.find(x => (x.glCode || '') === s.code);
        if (exists) {
            exists.label = `${s.label} (${s.code})`;
            exists.principal = Math.round(s.outstanding);
            exists.aflossing = Math.round(s.avgAflossing);
            exists.rente = Math.round(renteShare);
            if (!exists.endDate && endIso) exists.endDate = endIso;
            updated++;
        } else {
            arr.push({
                id: 'ln_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
                label: `${s.label} (${s.code})`,
                glCode: s.code,
                principal: Math.round(s.outstanding),
                aflossing: Math.round(s.avgAflossing),
                rente: Math.round(renteShare),
                startDate: today,
                endDate: endIso,
                paymentDay: 1,
            });
            added++;
        }
    }
    cffLoansSave(arr);
    cffRenderLoans();
    cffRenderModel && cffRenderModel();
    if (!silent) alert(`Seed klaar: ${added} toegevoegd, ${updated} bijgewerkt.\n\n` +
          seeds.map(s => `• ${s.label} (${s.code}): saldo €${cffFmt(s.outstanding)}, gem. aflossing €${cffFmt(s.avgAflossing)}/mnd`).join('\n') +
          `\n\nGem. totale rente laatste ${interestMonthsCovered} mnd: €${cffFmt(avgInterestPerMonth)}/mnd (verdeeld pro rata over openstaande hoofdsommen).`);
}

export function cffLoansUpdate(id, field, val) {
    const arr = cffLoansGet();
    const e = arr.find(x => x.id === id);
    if (!e) return;
    if (['principal','aflossing','rente','paymentDay'].includes(field)) val = parseFloat(val) || 0;
    e[field] = val;
    cffLoansSave(arr);
    cffRenderModel && cffRenderModel();
}
export function cffLoansDelete(id) {
    if (!confirm('Lening verwijderen?')) return;
    cffLoansSave(cffLoansGet().filter(x => x.id !== id));
    cffRenderLoans();
    cffRenderModel && cffRenderModel();
}
// Distribute loan over weeks: returns {weekKey: amount} (POSITIVE — caller negates)
export function cffLoansDistribute(loan, weekKeys) {
    const out = {};
    if (!loan.startDate) return out;
    const total = (loan.aflossing || 0) + (loan.rente || 0);
    if (total <= 0) return out;
    const start = new Date(loan.startDate);
    const end = loan.endDate ? new Date(loan.endDate) : null;
    // For each month in horizon, find pay date
    const horizonStart = new Date(weekKeys[0].date);
    const horizonEnd = new Date(weekKeys[weekKeys.length-1].date); horizonEnd.setUTCDate(horizonEnd.getUTCDate()+6);
    // Iterate months from max(start, horizonStart's month) to min(end, horizonEnd's month)
    let cursor = new Date(Date.UTC(
        Math.max(start.getUTCFullYear(), horizonStart.getUTCFullYear()),
        0, 1
    ));
    // Easier: just iterate every month from start to min(end, horizonEnd)
    let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const stop = end && end < horizonEnd ? end : horizonEnd;
    const payDay = Math.max(1, Math.min(28, parseInt(loan.paymentDay) || 1));
    while (m <= stop) {
        const payDate = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), payDay));
        if (payDate >= horizonStart && payDate <= horizonEnd && payDate >= start) {
            const wk = cffDateToWeekKey(payDate);
            out[wk] = (out[wk] || 0) + total;
        }
        m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth()+1, 1));
    }
    return out;
}
export function cffRenderLoans() {
    const el = document.getElementById('cffLoansTable');
    if (!el) return;
    const arr = cffLoansGet();
    if (arr.length === 0) {
        el.innerHTML = '<p style="color:#999;font-style:italic;">Geen leningen. Klik "+ Lening toevoegen".</p>';
        return;
    }
    let html = '<table class="pnl-table"><thead><tr>'
        + '<th>Label</th><th class="pnl-amount">Hoofdsom</th>'
        + '<th class="pnl-amount">Aflossing/mnd</th><th class="pnl-amount">Rente/mnd</th>'
        + '<th class="pnl-amount">Totaal/mnd</th>'
        + '<th>Startdatum</th><th>Einddatum</th><th>Betaaldag</th><th></th></tr></thead><tbody>';
    let totMonthly = 0;
    for (const e of arr) {
        const m = (e.aflossing||0) + (e.rente||0);
        totMonthly += m;
        html += '<tr>';
        html += `<td><input type="text" value="${(e.label||'').replace(/"/g,'&quot;')}" onchange="cffLoansUpdate('${e.id}','label',this.value)" style="width:160px;"></td>`;
        html += `<td class="pnl-amount"><input type="number" step="100" value="${e.principal||0}" onchange="cffLoansUpdate('${e.id}','principal',this.value)" style="width:100px;text-align:right;"></td>`;
        html += `<td class="pnl-amount"><input type="number" step="10" value="${e.aflossing||0}" onchange="cffLoansUpdate('${e.id}','aflossing',this.value)" style="width:90px;text-align:right;"></td>`;
        html += `<td class="pnl-amount"><input type="number" step="10" value="${e.rente||0}" onchange="cffLoansUpdate('${e.id}','rente',this.value)" style="width:90px;text-align:right;"></td>`;
        html += `<td class="pnl-amount">${cffFmt(m)}</td>`;
        html += `<td><input type="date" value="${e.startDate||''}" onchange="cffLoansUpdate('${e.id}','startDate',this.value)"></td>`;
        html += `<td><input type="date" value="${e.endDate||''}" onchange="cffLoansUpdate('${e.id}','endDate',this.value)"></td>`;
        html += `<td><input type="number" min="1" max="28" step="1" value="${e.paymentDay||1}" onchange="cffLoansUpdate('${e.id}','paymentDay',this.value)" style="width:50px;"></td>`;
        html += `<td><button class="btn btn-outline" onclick="cffLoansDelete('${e.id}')" style="color:#c53030;padding:4px 8px;">×</button></td>`;
        html += '</tr>';
    }
    html += `</tbody><tfoot><tr style="font-weight:bold;"><td colspan="4">Totaal maandlast</td><td class="pnl-amount">${cffFmt(totMonthly)}</td><td colspan="4"></td></tr></tfoot></table>`;
    html += '<p style="color:#666;font-size:12px;margin-top:6px;">Maandlast = aflossing + rente. Wordt geplaatst op de week die de betaaldag van die maand bevat. Hoofdsom is alleen ter info.</p>';
    el.innerHTML = html;
}

// ============================================================
//  Voorraad — lead time + historische mutaties (info)
//  Verschuift COGS-extrapolatie inkoop met N dagen NAAR VOREN
//  zodat cash uit eerder valt dan de verkoop (typisch voor cashew)
// ============================================================
export const CFF_STOCK_ACCOUNTS = ['3000','3001','3002','3003','3005','3006','3007','3900'];

export function cffStockGet() {
    try {
        const o = JSON.parse(localStorage.getItem('cashflow_stock') || '{}');
        return { leadDays: o.leadDays != null ? o.leadDays : 60 };
    } catch(e) { return { leadDays: 60 }; }
}
export function cffStockSet(patch) {
    const cur = cffStockGet();
    const next = { ...cur, ...patch };
    if (next.leadDays != null) next.leadDays = parseInt(next.leadDays) || 0;
    localStorage.setItem('cashflow_stock', JSON.stringify(next));
    cffRenderStock();
    cffRenderModel && cffRenderModel();
}
export function cffStockComputeBalance() {
    if (!pnlTransactionLines) return null;
    const todayStr = new Date().toISOString().slice(0,10);
    let bal = 0;
    const monthly = {}; // ym → mutatie
    const allMonthly = {}; // ym → mutatie (alle maanden, niet alleen laatste 12)
    for (const t of pnlTransactionLines) {
        if (!t.date || t.date > todayStr || t.isYearEndClose) continue;
        if (!CFF_STOCK_ACCOUNTS.includes(t.accountCode)) continue;
        bal += t.amount;
        const ym = t.date.slice(0,7);
        monthly[ym] = (monthly[ym] || 0) + t.amount;
        allMonthly[ym] = (allMonthly[ym] || 0) + t.amount;
    }
    // Bereken running balance per maand
    const allMonths = Object.keys(allMonthly).sort();
    let running = 0;
    const balanceByMonth = {};
    for (const m of allMonths) {
        running += allMonthly[m];
        balanceByMonth[m] = running;
    }
    return { balance: bal, monthly, balanceByMonth };
}
export function cffRenderStock() {
    const el = document.getElementById('cffStockPanel');
    if (!el) return;
    const cfg = cffStockGet();
    const data = cffStockComputeBalance();
    let html = `
        <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
            <label style="font-size:13px;">Inkoop lead time (dagen vóór verkoop)
                <input type="number" min="0" step="7" value="${cfg.leadDays}"
                    onchange="cffStockSet({leadDays: this.value})"
                    style="width:80px;padding:4px;display:block;"></label>
            <div style="font-size:13px;color:#666;">
                Wordt toegepast op de <b>geëxtrapoleerde</b> inkoop (COGS-ratio).<br>
                Netto offset = DPO − lead time. Voor cashew typisch 30-90 dagen.
            </div>
        </div>`;
    if (data) {
        html += `<div style="font-size:13px;margin-bottom:8px;">Huidige voorraadwaarde (${CFF_STOCK_ACCOUNTS.join(', ')}): <b>${cffFmt(data.balance)}</b></div>`;
        // Laatste 12 mnd mutaties met voorraadstand
        const months = Object.keys(data.monthly).sort().slice(-12);
        if (months.length > 0) {
            html += '<table class="pnl-table" style="margin-top:6px;"><thead><tr><th>Maand</th><th class="pnl-amount">Voorraadstand</th><th class="pnl-amount">Mutatie</th></tr></thead><tbody>';
            let tot = 0;
            for (const m of months) {
                const v = data.monthly[m];
                tot += v;
                const stand = data.balanceByMonth[m] || 0;
                const cls = v >= 0 ? 'pnl-negative' : 'pnl-positive'; // toename = cash uit (negatief voor cash)
                html += `<tr><td>${m}</td><td class="pnl-amount">${cffFmt(stand)}</td><td class="pnl-amount ${cls}">${cffFmt(v)}</td></tr>`;
            }
            const totCls = tot >= 0 ? 'pnl-negative' : 'pnl-positive';
            html += `</tbody><tfoot><tr style="font-weight:bold;"><td>Totaal 12m</td><td class="pnl-amount"></td><td class="pnl-amount ${totCls}">${cffFmt(tot)}</td></tr></tfoot></table>`;
            html += '<p style="color:#666;font-size:12px;margin-top:6px;">Toename voorraad = cash uit (rood). Afbouw = cash in (groen). Info — niet automatisch geboekt; gebruik events voor handmatige seizoens-opbouw.</p>';
        }
    }

    // Forward-looking voorraadprojectie uit cashflow model
    try {
        const m = cffBuildModel();
        if (m && m.stock && m.stock.hasData && m.weeks && m.weeks.length > 0) {
            const hasMovement = m.weeks.some(w => (w.stockIn || 0) > 0 || (w.stockOut || 0) > 0);
            html += '<h4 style="margin-top:18px;margin-bottom:6px;font-size:14px;color:#1a365d;">Voorraadprojectie (52 weken)</h4>';
            if (!hasMovement) {
                html += '<p style="color:#999;font-style:italic;font-size:13px;">Geen beweging — laad een sales forecast en/of inkoopdata om de projectie te activeren.</p>';
            } else {
                // Maandelijkse samenvatting
                const byMonth = {};
                for (const w of m.weeks) {
                    const ym = w.date.slice(0, 7);
                    if (!byMonth[ym]) byMonth[ym] = { in: 0, out: 0, lastStock: 0 };
                    byMonth[ym].in += (w.stockIn || 0);
                    byMonth[ym].out += (w.stockOut || 0);
                    byMonth[ym].lastStock = w.stockLevel || 0;
                }
                const months = Object.keys(byMonth).sort();
                html += '<table class="pnl-table" style="margin-top:6px;"><thead><tr><th>Maand</th><th class="pnl-amount">Inkoop in</th><th class="pnl-amount">Verkoop uit (COGS)</th><th class="pnl-amount">Netto mutatie</th><th class="pnl-amount">Voorraadstand</th></tr></thead><tbody>';
                for (const ym of months) {
                    const r = byMonth[ym];
                    const net = r.in - r.out;
                    const netCls = net >= 0 ? 'pnl-positive' : 'pnl-negative';
                    const stockCls = r.lastStock < 0 ? 'pnl-negative' : '';
                    html += `<tr><td>${ym}</td><td class="pnl-amount">${cffFmt(r.in)}</td><td class="pnl-amount">${cffFmt(-r.out)}</td><td class="pnl-amount ${netCls}">${cffFmt(net)}</td><td class="pnl-amount ${stockCls}" style="font-weight:600;">${cffFmt(r.lastStock)}</td></tr>`;
                }
                html += '</tbody></table>';
                // Waarschuwing bij negatieve voorraad
                const negWeeks = m.weeks.filter(w => (w.stockLevel || 0) < 0);
                if (negWeeks.length > 0) {
                    const lowest = m.weeks.reduce((min, w) => (w.stockLevel || 0) < min.v ? { v: w.stockLevel, w } : min, { v: Infinity, w: null });
                    html += `<p style="color:#e53e3e;font-size:13px;font-weight:600;margin-top:8px;">⚠ Voorraad wordt negatief in ${negWeeks.length} weken — laagste: ${cffFmt(lowest.v)} in W${lowest.w.week}-${lowest.w.year}. Controleer inkoop planning.</p>`;
                }
            }
        }
    } catch(e) { console.error('Stock projection render error:', e); }

    el.innerHTML = html;
}

// ============================================================
//  Eenmalige cash events — CAPEX, equity, etc.
// ============================================================
export function cffEventsGet() {
    try { return JSON.parse(localStorage.getItem('cashflow_events') || '[]'); } catch(e) { return []; }
}
export function cffEventsSave(arr) { localStorage.setItem('cashflow_events', JSON.stringify(arr)); }
export function cffEventsAdd(type) {
    const arr = cffEventsGet();
    const today = new Date().toISOString().slice(0,10);
    const defaults = {
        capex:  { label: 'Nieuwe CAPEX',          amount: -10000, type: 'capex' },
        equity: { label: 'Aandelenuitgifte',      amount: 100000, type: 'equity' },
        other:  { label: 'Eenmalig event',        amount: 0,      type: 'other' },
    };
    arr.push({
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        date: today,
        ...(defaults[type] || defaults.other),
    });
    cffEventsSave(arr);
    cffRenderEvents();
    cffRenderModel && cffRenderModel();
}
export function cffEventsUpdate(id, field, val) {
    const arr = cffEventsGet();
    const e = arr.find(x => x.id === id);
    if (!e) return;
    if (field === 'amount') val = parseFloat(val) || 0;
    e[field] = val;
    cffEventsSave(arr);
    cffRenderModel && cffRenderModel();
}
export function cffEventsDelete(id) {
    if (!confirm('Event verwijderen?')) return;
    cffEventsSave(cffEventsGet().filter(x => x.id !== id));
    cffRenderEvents();
    cffRenderModel && cffRenderModel();
}
// Distribute events into weekKeys; returns {key: amount}
export function cffEventsDistribute(weekKeys) {
    const out = {};
    const byType = { capex: {}, equity: {}, other: {} };
    const arr = cffEventsGet();
    if (arr.length === 0) return { all: out, byType };
    const horizonStart = new Date(weekKeys[0].date);
    const horizonEnd = new Date(weekKeys[weekKeys.length-1].date); horizonEnd.setUTCDate(horizonEnd.getUTCDate()+6);
    for (const e of arr) {
        if (!e.date) continue;
        const d = new Date(e.date);
        if (d < horizonStart || d > horizonEnd) continue;
        const k = cffDateToWeekKey(d);
        out[k] = (out[k] || 0) + (e.amount || 0);
        const t = e.type || 'other';
        if (!byType[t]) byType[t] = {};
        byType[t][k] = (byType[t][k] || 0) + (e.amount || 0);
    }
    return { all: out, byType };
}
export function cffRenderEvents() {
    const el = document.getElementById('cffEventsTable');
    if (!el) return;
    const arr = cffEventsGet();
    if (arr.length === 0) {
        el.innerHTML = '<p style="color:#999;font-style:italic;">Geen events. Klik een knop om er één toe te voegen.</p>';
        return;
    }
    let html = '<table class="pnl-table"><thead><tr><th>Type</th><th>Label</th><th>Datum</th><th class="pnl-amount">Bedrag (€)</th><th></th></tr></thead><tbody>';
    let total = 0;
    for (const e of arr) {
        total += e.amount || 0;
        const cls = (e.amount||0) >= 0 ? 'pnl-positive' : 'pnl-negative';
        html += '<tr>';
        html += `<td><select onchange="cffEventsUpdate('${e.id}','type',this.value)">`
            + ['capex','equity','other'].map(t=>`<option value="${t}"${t===e.type?' selected':''}>${t}</option>`).join('')
            + '</select></td>';
        html += `<td><input type="text" value="${(e.label||'').replace(/"/g,'&quot;')}" onchange="cffEventsUpdate('${e.id}','label',this.value)" style="width:200px;"></td>`;
        html += `<td><input type="date" value="${e.date||''}" onchange="cffEventsUpdate('${e.id}','date',this.value)"></td>`;
        html += `<td class="pnl-amount"><input type="number" step="100" value="${e.amount||0}" onchange="cffEventsUpdate('${e.id}','amount',this.value)" style="width:130px;text-align:right;" class="${cls}"></td>`;
        html += `<td><button class="btn btn-outline" onclick="cffEventsDelete('${e.id}')" style="color:#c53030;padding:4px 8px;">×</button></td>`;
        html += '</tr>';
    }
    const totCls = total >= 0 ? 'pnl-positive' : 'pnl-negative';
    html += `</tbody><tfoot><tr style="font-weight:bold;"><td colspan="3">Netto totaal</td><td class="pnl-amount ${totCls}">${cffFmt(total)}</td><td></td></tr></tfoot></table>`;
    html += '<p style="color:#666;font-size:12px;margin-top:6px;">Bedrag negatief = cash uit (CAPEX, betaling). Positief = cash in (equity, subsidie). Wordt op de week van de datum geboekt.</p>';
    el.innerHTML = html;
}

// ============================================================
//  STAP 7: Cash engine — startsaldo + cumulatieve positie
// ============================================================
export const CFF_BANK_ACCOUNTS = ['1100','1101','1103'];

export function cffCashGet() {
    try {
        const o = JSON.parse(localStorage.getItem('cashflow_cash') || '{}');
        return {
            startBalance: o.startBalance != null ? o.startBalance : 0,
            horizonWeeks: o.horizonWeeks || 52,
        };
    } catch(e) { return { startBalance: 0, horizonWeeks: 52 }; }
}
export function cffCashSet(patch) {
    const cur = cffCashGet();
    const next = { ...cur, ...patch };
    if (next.startBalance != null) next.startBalance = parseFloat(next.startBalance) || 0;
    if (next.horizonWeeks != null) next.horizonWeeks = parseInt(next.horizonWeeks) || 52;
    localStorage.setItem('cashflow_cash', JSON.stringify(next));
    cffRenderCash();
    cffRenderModel && cffRenderModel();
}
export function cffCashSeedFromBank(silent) {
    if (!pnlTransactionLines || pnlTransactionLines.length === 0) {
        if (!silent) alert('Geen P&L data geladen.'); return;
    }
    const todayStr = new Date().toISOString().slice(0,10);
    let bal = 0;
    for (const t of pnlTransactionLines) {
        if (!t.date || t.date > todayStr || t.isYearEndClose) continue;
        if (CFF_BANK_ACCOUNTS.includes(t.accountCode)) bal += t.amount;
    }
    cffCashSet({ startBalance: Math.round(bal) });
    if (!silent) alert(`Banksaldo gezet: ${cffFmt(bal)} (som rekeningen ${CFF_BANK_ACCOUNTS.join(', ')} t/m vandaag).`);
}
export function cffRenderCash() {
    const el = document.getElementById('cffCashPanel');
    if (!el) return;
    const cfg = cffCashGet();
    el.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
            <label style="font-size:13px;">Startsaldo bank (€)
                <input type="number" step="100" value="${cfg.startBalance}"
                    onchange="cffCashSet({startBalance: this.value})"
                    style="width:140px;padding:4px;display:block;"></label>
            <button class="btn btn-outline" onclick="cffCashSeedFromBank()">Seed uit bankrekeningen</button>
            <label style="font-size:13px;">Horizon (weken)
                <select onchange="cffCashSet({horizonWeeks: this.value})" style="display:block;padding:4px;">
                    <option value="13"${cfg.horizonWeeks==13?' selected':''}>13 weken</option>
                    <option value="26"${cfg.horizonWeeks==26?' selected':''}>26 weken</option>
                    <option value="52"${cfg.horizonWeeks==52?' selected':''}>52 weken</option>
                </select></label>
        </div>
        <p style="color:#666;font-size:12px;margin-top:8px;">Startsaldo wordt elke week bijgewerkt met netto cashflow. Laagste punt verschijnt in de weektabel hieronder.</p>`;
}

// ============================================================
//  STAP 7b: Werkkapitaal openings — debiteuren, crediteuren,
//  open BTW saldo, loonheffingen
// ============================================================
export const CFF_WC_ACCOUNTS = {
    ar:           ['1300','1301'],
    ap:           ['1600','1601'],
    btw_passiva:  ['1500','1510','1511','1512'],
    btw_activa:   ['1520','1550'],
    loonheffingen:['1800','1820','1825'],
};

export function cffWcGet() {
    try {
        const o = JSON.parse(localStorage.getItem('cashflow_wc') || '{}');
        return {
            enableAr: o.enableAr !== false,
            enableAp: o.enableAp !== false,
            enableBtw: o.enableBtw !== false,
            enableLh: o.enableLh !== false,
            spreadArDays: o.spreadArDays != null ? o.spreadArDays : null,  // null = use DSO
            spreadApDays: o.spreadApDays != null ? o.spreadApDays : null,  // null = use DPO
            excludedDebtors: o.excludedDebtors || [],                      // AccountCode[] uitgesloten van AR
        };
    } catch(e) { return { enableAr:true,enableAp:true,enableBtw:true,enableLh:true,spreadArDays:null,spreadApDays:null }; }
}
export function cffWcSet(patch) {
    const cur = cffWcGet();
    const next = { ...cur, ...patch };
    localStorage.setItem('cashflow_wc', JSON.stringify(next));
    cffRenderWcOpenings();
    cffRenderModel && cffRenderModel();
}
export function cffWcToggleDebtor(accountCode, exclude) {
    const cfg = cffWcGet();
    const set = new Set(cfg.excludedDebtors || []);
    if (exclude) set.add(accountCode); else set.delete(accountCode);
    cffWcSet({ excludedDebtors: [...set] });
}

// Groepeer receivables per klant
export function cffReceivablesByAccount() {
    const map = {}; // accountCode → { name, total, invoices: [{amount, dueDate, invoiceNr}], overdue }
    const todayStr = new Date().toISOString().slice(0,10);
    for (const r of cffReceivablesData) {
        const code = r.AccountCode || 'unknown';
        if (!map[code]) map[code] = { name: r.AccountName || code, total: 0, invoices: [], overdue: false };
        const amt = -(r.AmountDC || 0); // Exact: negative = te ontvangen, flip to positive
        const due = (r.DueDate || '').slice(0,10);
        map[code].total += amt;
        map[code].invoices.push({ amount: amt, dueDate: due, invoiceNr: r.InvoiceNumber || '' });
        if (due && due < todayStr) map[code].overdue = true;
    }
    // Sort by total descending
    return Object.entries(map)
        .map(([code, v]) => ({ code, ...v }))
        .sort((a, b) => b.total - a.total);
}

// Compute current open balances per category, anchored on today
export function cffWcComputeBalances() {
    if (!pnlTransactionLines || pnlTransactionLines.length === 0) return null;
    const todayStr = new Date().toISOString().slice(0,10);
    const cfg = cffWcGet();
    const excluded = new Set(cfg.excludedDebtors || []);

    const sums = {}; // accountCode → sum
    for (const t of pnlTransactionLines) {
        if (!t.date || t.date > todayStr || t.isYearEndClose) continue;
        sums[t.accountCode] = (sums[t.accountCode] || 0) + t.amount;
    }
    const sumOf = arr => arr.reduce((s,c)=>s + (sums[c]||0), 0);
    const arRaw = sumOf(CFF_WC_ACCOUNTS.ar);          // activa: positief = debiteur

    // Bereken excluded bedrag uit receivables data
    let arExcluded = 0;
    if (excluded.size > 0 && cffReceivablesData.length > 0) {
        for (const r of cffReceivablesData) {
            if (excluded.has(r.AccountCode || '')) {
                arExcluded += -(r.AmountDC || 0); // flip sign
            }
        }
    }

    const apRaw = sumOf(CFF_WC_ACCOUNTS.ap);          // passiva: negatief = crediteur
    const btwPas = sumOf(CFF_WC_ACCOUNTS.btw_passiva);// negatief = af te dragen
    const btwAct = sumOf(CFF_WC_ACCOUNTS.btw_activa); // positief = te vorderen
    const lhRaw = sumOf(CFF_WC_ACCOUNTS.loonheffingen);// negatief = af te dragen
    return {
        ar: arRaw,                  // + = nog te ontvangen (cash in) — totaal
        arExcluded,                 // bedrag uitgesloten debiteuren
        arNet: arRaw - arExcluded,  // na uitsluiting
        ap: -apRaw,                 // + = nog te betalen (cash out)
        btwNet: -btwPas - btwAct,   // + = afdracht (cash out), − = teruggave (cash in)
        loonheffingen: -lhRaw,      // + = afdracht (cash out)
    };
}

// Distribute openings into weekKeys; returns {key: amount} (signed)
export function cffWcDistributeOpenings(weekKeys, dsoDays, dpoDays) {
    const cfg = cffWcGet();
    const bal = cffWcComputeBalances();
    if (!bal) return { byWeek: {}, summary: null };
    const out = {};
    const add = (key, amt) => { out[key] = (out[key] || 0) + amt; };
    const horizonStart = new Date(weekKeys[0].date);
    const horizonEnd = new Date(weekKeys[weekKeys.length-1].date); horizonEnd.setUTCDate(horizonEnd.getUTCDate()+6);

    // Helper: spread amount uniformly over first N weeks
    const spreadOver = (amt, nWeeks) => {
        const n = Math.max(1, Math.min(nWeeks, weekKeys.length));
        const per = amt / n;
        for (let i = 0; i < n; i++) add(weekKeys[i].year*100+weekKeys[i].week, per);
    };

    const summary = { ar:0, ap:0, btw:0, lh:0 };

    // AR: spread over ceil(DSO/7) weken (of override) — gebruik arNet (excl. uitgesloten debiteuren)
    const arAmount = bal.arNet != null ? bal.arNet : bal.ar;
    if (cfg.enableAr && arAmount > 0) {
        const days = cfg.spreadArDays != null ? cfg.spreadArDays : (dsoDays || 30);
        const nWk = Math.max(1, Math.ceil(days / 7));
        spreadOver(arAmount, nWk);
        summary.ar = arAmount;
    }
    // AP: spread over ceil(DPO/7) weken (of override) — negatief
    if (cfg.enableAp && bal.ap > 0) {
        const days = cfg.spreadApDays != null ? cfg.spreadApDays : (dpoDays || 0);
        const nWk = Math.max(1, Math.ceil(Math.max(days,7) / 7)); // minimaal 1 week
        spreadOver(-bal.ap, nWk);
        summary.ap = -bal.ap;
    }
    // BTW open saldo: op eerstvolgende kwartaal-afdrachtweek
    if (cfg.enableBtw && Math.abs(bal.btwNet) > 1) {
        const btwCfg = cffBtwGet();
        // Vind eerstvolgende kwartaaleinde + offset binnen horizon
        const today = new Date();
        let candidate = null;
        for (let q = 0; q < 4; q++) {
            const m = today.getUTCMonth() + q*3;
            const yr = today.getUTCFullYear() + Math.floor(m/12);
            const qn = Math.floor((m % 12) / 3) + 1;
            const qEnd = cffQuarterEndDate(yr, qn);
            const payDate = new Date(qEnd.getTime() + (btwCfg.offsetDays||30)*86400000);
            if (payDate >= today && payDate >= horizonStart && payDate <= horizonEnd) {
                candidate = payDate; break;
            }
        }
        if (candidate) {
            add(cffDateToWeekKey(candidate), -bal.btwNet); // bal.btwNet positief = afdracht → cash uit
            summary.btw = -bal.btwNet;
        }
    }
    // Loonheffingen: op de 1e van volgende maand
    if (cfg.enableLh && bal.loonheffingen > 1) {
        const today = new Date();
        const next1 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth()+1, 1));
        if (next1 >= horizonStart && next1 <= horizonEnd) {
            add(cffDateToWeekKey(next1), -bal.loonheffingen);
            summary.lh = -bal.loonheffingen;
        }
    }
    return { byWeek: out, summary, balances: bal };
}

export function cffRenderWcOpenings() {
    const el = document.getElementById('cffWcPanel');
    if (!el) return;
    const bal = cffWcComputeBalances();
    const cfg = cffWcGet();
    if (!bal) { el.innerHTML = '<p style="color:#999;">Geen P&L data geladen.</p>'; return; }
    const dsoR = (typeof cffDsoApplied === 'function') ? cffDsoApplied() : { aggregate: 30 };
    const dsoDays = (dsoR && dsoR.aggregate) || 30;
    const dpoDays = (typeof cffDpoGet === 'function') ? cffDpoGet() : 0;
    const arDays = cfg.spreadArDays != null ? cfg.spreadArDays : dsoDays;
    const apDays = cfg.spreadApDays != null ? cfg.spreadApDays : dpoDays;

    const arNetAmount = bal.arNet != null ? bal.arNet : bal.ar;
    const arExcl = bal.arExcluded || 0;
    const excluded = new Set(cfg.excludedDebtors || []);

    let html = '<table class="pnl-table"><thead><tr><th></th><th>Categorie</th><th class="pnl-amount">Saldo</th><th class="pnl-amount">Cash-impact</th><th>Plaatsing</th></tr></thead><tbody>';
    // AR row — show net amount (after exclusions)
    const arEnabled = cfg.enableAr !== false;
    const arCash = arEnabled ? arNetAmount : 0;
    const arCls = arEnabled ? (arCash >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
    const arExclNote = arExcl > 0 ? ` <span style="color:#c53030;font-size:11px;">(−${cffFmt(arExcl)} uitgesloten)</span>` : '';
    html += `<tr>`
        + `<td><input type="checkbox" ${arEnabled?'checked':''} onchange="cffWcSet({enableAr: this.checked})"></td>`
        + `<td>Debiteuren (${CFF_WC_ACCOUNTS.ar.join(', ')})${arExclNote}</td>`
        + `<td class="pnl-amount">${cffFmt(arNetAmount)}</td>`
        + `<td class="pnl-amount ${arCls}">${arEnabled ? cffFmt(arCash) : '—'}</td>`
        + `<td style="font-size:12px;color:#666;">Spreid over ${Math.ceil(arDays/7)} wk (${arDays} dgn) `
        + `<input type="number" placeholder="${dsoDays} (DSO)" value="${cfg.spreadArDays!=null?cfg.spreadArDays:''}" onchange="cffWcSet({spreadArDays: this.value===''?null:parseInt(this.value)})" style="width:60px;font-size:11px;"></td>`
        + `</tr>`;

    // Per-klant debiteuren detail (in/uitklapbaar)
    const debtors = cffReceivablesByAccount();
    if (debtors.length > 0) {
        const exclCount = debtors.filter(d => Math.abs(d.total) >= 1 && excluded.has(d.code)).length;
        const debtorCount = debtors.filter(d => Math.abs(d.total) >= 1).length;
        const toggleLabel = exclCount > 0
            ? `${debtorCount} debiteuren (${exclCount} uitgesloten)`
            : `${debtorCount} debiteuren`;
        html += `<tr><td></td><td colspan="4" style="padding:4px 0;">`
            + `<span onclick="document.getElementById('cffDebtorDetail').style.display=document.getElementById('cffDebtorDetail').style.display==='none'?'':'none';this.querySelector('svg').classList.toggle('cff-chevron-open')" `
            + `style="cursor:pointer;user-select:none;font-size:12px;color:#4a5568;font-weight:600;display:inline-flex;align-items:center;gap:4px;">`
            + `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform .2s;transform:rotate(-90deg);"><path d="M6 9l6 6 6-6"/></svg>`
            + `${toggleLabel}</span></td></tr>`;
        html += `<tr id="cffDebtorDetail" style="display:none;"><td></td><td colspan="4" style="padding:0;">`;
        html += `<table class="pnl-table" style="margin:0;font-size:11px;"><tbody>`;
        for (const d of debtors) {
            if (Math.abs(d.total) < 1) continue;
            const isExcluded = excluded.has(d.code);
            const isOverdue = d.overdue;
            const overdueLabel = isOverdue ? ' <span style="color:#c53030;font-weight:600;">VERLOPEN</span>' : '';
            const rowStyle = isExcluded ? 'opacity:0.5;text-decoration:line-through;' : '';
            const oldestDue = d.invoices.map(i=>i.dueDate).filter(Boolean).sort()[0] || '';
            const dueStr = oldestDue ? oldestDue.slice(5) : '';
            html += `<tr style="${rowStyle}">`
                + `<td style="padding-left:4px;"><input type="checkbox" ${!isExcluded?'checked':''} onchange="cffWcToggleDebtor('${d.code}', !this.checked)"></td>`
                + `<td style="color:#555;">${d.name}${overdueLabel}</td>`
                + `<td class="pnl-amount" style="color:#555;">${cffFmt(d.total)}</td>`
                + `<td class="pnl-amount" style="color:#888;">${d.invoices.length} fact.</td>`
                + `<td style="color:#888;">vervalt: ${dueStr}</td>`
                + `</tr>`;
        }
        html += `</tbody></table></td></tr>`;
    }

    const otherRows = [
        { k:'enableAp', label:`Crediteuren (${CFF_WC_ACCOUNTS.ap.join(', ')})`, raw: bal.ap, cash: -bal.ap, sign:'−', plc: `Spreid over ${Math.ceil(Math.max(apDays,7)/7)} wk (${apDays} dgn)`, override: `<input type="number" placeholder="${dpoDays} (DPO)" value="${cfg.spreadApDays!=null?cfg.spreadApDays:''}" onchange="cffWcSet({spreadApDays: this.value===''?null:parseInt(this.value)})" style="width:60px;font-size:11px;">` },
        { k:'enableBtw', label:`BTW open saldo (${[...CFF_WC_ACCOUNTS.btw_passiva,...CFF_WC_ACCOUNTS.btw_activa].join(', ')})`, raw: bal.btwNet, cash: -bal.btwNet, sign: bal.btwNet>=0?'−':'+', plc: 'Eerstvolgende kwartaal-afdracht', override: '' },
        { k:'enableLh', label:`Loonheffingen (${CFF_WC_ACCOUNTS.loonheffingen.join(', ')})`, raw: bal.loonheffingen, cash: -bal.loonheffingen, sign:'−', plc: '1e van volgende maand', override: '' },
    ];
    for (const r of otherRows) {
        const enabled = cfg[r.k] !== false;
        const cashStr = enabled ? cffFmt(r.cash) : '—';
        const cls = enabled ? (r.cash >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
        html += `<tr>`
            + `<td><input type="checkbox" ${enabled?'checked':''} onchange="cffWcSet({${r.k}: this.checked})"></td>`
            + `<td>${r.label}</td>`
            + `<td class="pnl-amount">${cffFmt(r.raw)}</td>`
            + `<td class="pnl-amount ${cls}">${cashStr}</td>`
            + `<td style="font-size:12px;color:#666;">${r.plc} ${r.override}</td>`
            + `</tr>`;
    }
    html += '</tbody></table>';
    html += '<p style="color:#666;font-size:12px;margin-top:6px;">Saldo = som van alle boekingen op de rekening t/m vandaag. Cash-impact wordt verdeeld over de weken in het model. Vink uit als je deze post elders dekt. Per debiteur kan je verlopen facturen uitsluiten.</p>';
    el.innerHTML = html;
}

// ============================================================
//  STAP 3: BTW cadans (kwartaalafdracht)
//  Schat per kwartaal: salesVAT − inputVAT(inkoop) − inputVAT(opex)
//  Plaats afdracht (negatief) of teruggaaf (positief) op kwartaal-einde + offset
// ============================================================
export function cffBtwGet() {
    try {
        const o = JSON.parse(localStorage.getItem('cashflow_btw') || '{}');
        return {
            salesVatPct: o.salesVatPct != null ? o.salesVatPct : 9,    // % over omzet (food = 9%)
            inkoopVatPct: o.inkoopVatPct != null ? o.inkoopVatPct : 9, // % over inkoop (grondstof = 9%)
            opexVatPct: o.opexVatPct != null ? o.opexVatPct : 21,      // % over OPEX (diensten = 21%)
            offsetDays: o.offsetDays != null ? o.offsetDays : 30,      // dagen na kwartaaleinde
            overrides: o.overrides || {},                              // 'YYYY-Qn' → bedrag (negatief = afdracht)
        };
    } catch(e) { return { salesVatPct:9, inkoopVatPct:9, opexVatPct:21, offsetDays:30, overrides:{} }; }
}
export function cffBtwSet(patch) {
    const cur = cffBtwGet();
    const next = { ...cur, ...patch };
    localStorage.setItem('cashflow_btw', JSON.stringify(next));
    cffRenderBtw();
    cffRenderModel && cffRenderModel();
}
export function cffBtwSetOverride(qkey, val) {
    const cur = cffBtwGet();
    const o = { ...(cur.overrides||{}) };
    if (val === '' || val == null || isNaN(parseFloat(val))) delete o[qkey];
    else o[qkey] = parseFloat(val);
    cffBtwSet({ overrides: o });
}
// Quarter helpers
export function cffQuarterOfDate(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    const q = Math.floor(dt.getUTCMonth() / 3) + 1;
    return { year: dt.getUTCFullYear(), q };
}
export function cffQuarterEndDate(year, q) {
    // q1=mar 31, q2=jun 30, q3=sep 30, q4=dec 31
    const m = q * 3 - 1; // 0-based month
    const lastDay = new Date(Date.UTC(year, m + 1, 0));
    return lastDay;
}
export function cffDateToWeekKey(d) {
    const dt = new Date(d); const dow = dt.getUTCDay()||7;
    const tmp = new Date(dt); tmp.setUTCDate(dt.getUTCDate()+4-dow);
    const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    const wk = Math.ceil((((tmp-ys)/86400000)+1)/7);
    return tmp.getUTCFullYear()*100 + wk;
}
// Compute BTW per quarter from weekly forecast (weeks already contain salesIn/inkoopOut/opexOut excl BTW)
export function cffBtwComputeQuarterly(weeks) {
    const cfg = cffBtwGet();
    // Bucket gross excl BTW per quarter
    const q = {}; // 'YYYY-Qn' → { sales, inkoop, opex }
    for (const w of weeks) {
        const monday = cffMondayOf(w.year, w.week);
        const { year, q: qn } = cffQuarterOfDate(monday);
        const key = `${year}-Q${qn}`;
        if (!q[key]) q[key] = { year, qn, sales: 0, inkoop: 0, opex: 0, payAmount: 0, payWeekKey: null };
        q[key].sales  += w.salesIn || 0;
        q[key].inkoop += -(w.inkoopOut || 0); // back to positive
        q[key].opex   += -(w.opexOut || 0);
    }
    for (const key of Object.keys(q)) {
        const item = q[key];
        const salesVat  = item.sales  * (cfg.salesVatPct  / 100);
        const inkoopVat = item.inkoop * (cfg.inkoopVatPct / 100);
        const opexVat   = item.opex   * (cfg.opexVatPct   / 100);
        const liability = salesVat - inkoopVat - opexVat; // + = afdracht, − = teruggaaf
        item.salesVat = salesVat;
        item.inkoopVat = inkoopVat;
        item.opexVat = opexVat;
        item.computed = liability;
        item.payAmount = (cfg.overrides && cfg.overrides[key] != null) ? cfg.overrides[key] : -liability; // cash sign: − = uit
        // payment week
        const qEnd = cffQuarterEndDate(item.year, item.qn);
        const payDate = new Date(qEnd.getTime() + cfg.offsetDays * 86400000);
        item.payWeekKey = cffDateToWeekKey(payDate);
    }
    return q;
}
export function cffRenderBtw() {
    const el = document.getElementById('cffBtwPanel');
    if (!el) return;
    const cfg = cffBtwGet();
    // Need weeks to show preview — use cffBuildModelLite (just call cffBuildModel and re-use weeks; ok if recursive guarded)
    let preview = null;
    try {
        const m = cffBuildModelInternal({ skipBtw: true });
        preview = cffBtwComputeQuarterly(m.weeks);
    } catch(e) { preview = null; }

    let html = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <label style="font-size:13px;">Sales BTW %
                <input type="number" min="0" step="0.5" value="${cfg.salesVatPct}"
                    onchange="cffBtwSet({salesVatPct: parseFloat(this.value)||0})"
                    style="width:70px;padding:4px;display:block;"></label>
            <label style="font-size:13px;">Inkoop BTW %
                <input type="number" min="0" step="0.5" value="${cfg.inkoopVatPct}"
                    onchange="cffBtwSet({inkoopVatPct: parseFloat(this.value)||0})"
                    style="width:70px;padding:4px;display:block;"></label>
            <label style="font-size:13px;">OPEX BTW %
                <input type="number" min="0" step="0.5" value="${cfg.opexVatPct}"
                    onchange="cffBtwSet({opexVatPct: parseFloat(this.value)||0})"
                    style="width:70px;padding:4px;display:block;"></label>
            <label style="font-size:13px;">Afdracht-offset (dagen na kwartaal)
                <input type="number" min="0" step="1" value="${cfg.offsetDays}"
                    onchange="cffBtwSet({offsetDays: parseInt(this.value)||0})"
                    style="width:70px;padding:4px;display:block;"></label>
        </div>`;
    if (preview && Object.keys(preview).length) {
        html += '<table class="pnl-table"><thead><tr>'
            + '<th>Kwartaal</th>'
            + '<th class="pnl-amount">Sales excl</th>'
            + '<th class="pnl-amount">Sales BTW</th>'
            + '<th class="pnl-amount">Inkoop BTW</th>'
            + '<th class="pnl-amount">OPEX BTW</th>'
            + '<th class="pnl-amount">Saldo</th>'
            + '<th class="pnl-amount">Cash (override)</th>'
            + '</tr></thead><tbody>';
        const keys = Object.keys(preview).sort();
        for (const k of keys) {
            const it = preview[k];
            const overrideVal = (cfg.overrides && cfg.overrides[k] != null) ? cfg.overrides[k] : '';
            const sign = it.payAmount < 0 ? 'pnl-negative' : 'pnl-positive';
            html += `<tr><td>${k}</td>`
                + `<td class="pnl-amount">${cffFmt(it.sales)}</td>`
                + `<td class="pnl-amount">${cffFmt(it.salesVat)}</td>`
                + `<td class="pnl-amount">${cffFmt(it.inkoopVat)}</td>`
                + `<td class="pnl-amount">${cffFmt(it.opexVat)}</td>`
                + `<td class="pnl-amount ${it.computed>=0?'pnl-negative':'pnl-positive'}">${cffFmt(-it.computed)}</td>`
                + `<td class="pnl-amount ${sign}">${cffFmt(it.payAmount)}<br>`
                + `<input type="number" step="1" placeholder="override" value="${overrideVal}" `
                + `onchange="cffBtwSetOverride('${k}', this.value)" style="width:100px;font-size:11px;text-align:right;"></td>`
                + '</tr>';
        }
        html += '</tbody></table>';
        html += '<p style="color:#666;font-size:12px;margin-top:6px;">Saldo positief = afdracht (cash uit). Override leeg = bereken automatisch. Cash valt op de week ~offset dagen na kwartaaleinde.</p>';
    } else {
        html += '<p style="color:#999;">Nog geen forecast geladen.</p>';
    }
    el.innerHTML = html;
}

