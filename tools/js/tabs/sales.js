import {
    salesMode, setSalesMode,
    salesExpanded,
    salesInitialized, setSalesInitialized,
    cogsSalesInvoices, cogsItems,
} from '../shared/state.js';
import { cfGetISOWeek } from './cashflow.js';
import { getProductGroup } from './cogs.js';

// === SALES TAB ===
export function initSalesTab() {
    if (salesInitialized) return;
    const yearSel = document.getElementById('salesYear');
    const custSel = document.getElementById('salesCustomer');
    if (!yearSel || !custSel) return;
    const years = new Set();
    const customers = new Set();
    cogsSalesInvoices.forEach(l => {
        if (salesIsLorca(l.customerName)) return;
        if (l.invoiceDate) years.add(new Date(l.invoiceDate).getFullYear());
        if (l.customerName) customers.add(l.customerName);
    });
    const yearList = [...years].filter(y => y > 2000).sort((a,b) => b-a);
    yearSel.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join('');
    if (yearList.length) yearSel.value = yearList[0];
    const custList = [...customers].sort((a,b) => a.localeCompare(b));
    custSel.innerHTML = '<option value="all" selected>Alle</option>' +
        custList.map(c => `<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
    setSalesInitialized(true);
}
export function salesToggleMode() {
    setSalesMode(salesMode === 'omzet' ? 'qty' : 'omzet');
    document.getElementById('salesModeBtn').textContent = salesMode === 'omzet' ? 'Omzet (€)' : 'Aantal (HE)';
    renderSalesTab();
}
export function salesToggleRow(name) {
    if (salesExpanded.has(name)) salesExpanded.delete(name);
    else salesExpanded.add(name);
    renderSalesTab();
}
export function salesFmt(v) {
    if (!v) return '';
    if (salesMode === 'omzet') return '€' + Math.round(v).toLocaleString('nl-NL');
    return Math.round(v).toLocaleString('nl-NL');
}
export function salesIsLorca(name) {
    return /lorca/i.test(name || '');
}
export function salesGetBucket(dateStr, mode) {
    if (mode === 'month') {
        const d = new Date(dateStr);
        return (d.getMonth() + 1); // 1..12
    }
    return cfGetISOWeek(dateStr).week;
}
export function salesBucketLabel(b, mode) {
    if (mode === 'month') {
        const names = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
        return names[b - 1] || ('M' + b);
    }
    return 'W' + b;
}
export function renderSalesTab() {
    const yearSel = document.getElementById('salesYear');
    if (!yearSel) return;
    const year = parseInt(yearSel.value, 10);
    const groupFilter = document.getElementById('salesGroup').value;
    const custFilter = document.getElementById('salesCustomer').value;
    const periodMode = document.getElementById('salesPeriod').value;
    // item lookup for product group
    const itemMap = {};
    cogsItems.forEach(i => { itemMap[i.code] = i; });
    // aggregate
    const custMap = {};
    const bucketSet = new Set();
    cogsSalesInvoices.forEach(l => {
        if (!l.invoiceDate) return;
        if (salesIsLorca(l.customerName)) return;
        const d = new Date(l.invoiceDate);
        if (d.getFullYear() !== year) return;
        const item = itemMap[l.itemCode] || {};
        const grp = getProductGroup(l.itemCode, item.description || '');
        if (groupFilter !== 'all' && grp !== groupFilter) return;
        if (custFilter !== 'all' && l.customerName !== custFilter) return;
        const bucket = salesGetBucket(l.invoiceDate, periodMode);
        bucketSet.add(bucket);
        const value = salesMode === 'omzet' ? (l.amount || 0) : (l.quantity || 0);
        const cName = l.customerName || '(onbekend)';
        if (!custMap[cName]) custMap[cName] = { weekTotals: {}, items: {}, total: 0 };
        const c = custMap[cName];
        c.weekTotals[bucket] = (c.weekTotals[bucket] || 0) + value;
        c.total += value;
        const iKey = l.itemCode || '(geen code)';
        if (!c.items[iKey]) c.items[iKey] = { desc: item.description || iKey, weekTotals: {}, total: 0 };
        c.items[iKey].weekTotals[bucket] = (c.items[iKey].weekTotals[bucket] || 0) + value;
        c.items[iKey].total += value;
    });
    const weeks = [...bucketSet].sort((a,b) => a-b);
    const sortedCust = Object.entries(custMap).sort((a,b) => b[1].total - a[1].total);
    // header
    const head = document.getElementById('salesTableHead');
    let h = '<tr><th class="sticky-col">Klant / Artikel</th>';
    weeks.forEach(w => h += `<th>${salesBucketLabel(w, periodMode)}</th>`);
    h += '<th>Totaal</th></tr>';
    head.innerHTML = h;
    // body
    const body = document.getElementById('salesTableBody');
    let rows = '';
    const weekTotals = {}; let grand = 0;
    sortedCust.forEach(([name, data]) => {
        const expanded = salesExpanded.has(name);
        const caret = expanded ? '▼' : '▶';
        rows += `<tr class="sales-cust-row" onclick="salesToggleRow(${JSON.stringify(name).replace(/"/g,'&quot;')})">`;
        rows += `<td class="sticky-col"><span class="sales-caret">${caret}</span> ${name}</td>`;
        weeks.forEach(w => {
            const v = data.weekTotals[w] || 0;
            weekTotals[w] = (weekTotals[w] || 0) + v;
            rows += `<td>${salesFmt(v)}</td>`;
        });
        rows += `<td>${salesFmt(data.total)}</td>`;
        rows += '</tr>';
        grand += data.total;
        if (expanded) {
            const sortedItems = Object.entries(data.items).sort((a,b) => b[1].total - a[1].total);
            sortedItems.forEach(([code, idata]) => {
                rows += '<tr class="sales-item-row">';
                rows += `<td class="sticky-col">${code} — ${idata.desc}</td>`;
                weeks.forEach(w => {
                    const v = idata.weekTotals[w] || 0;
                    rows += `<td>${salesFmt(v)}</td>`;
                });
                rows += `<td>${salesFmt(idata.total)}</td>`;
                rows += '</tr>';
            });
        }
    });
    body.innerHTML = rows;
    // foot
    let f = '<tr><td class="sticky-col">Totaal</td>';
    weeks.forEach(w => f += `<td>${salesFmt(weekTotals[w] || 0)}</td>`);
    f += `<td>${salesFmt(grand)}</td></tr>`;
    document.getElementById('salesTableFoot').innerHTML = f;
    // sync top scrollbar with bottom
    setTimeout(() => {
        const wrap = document.getElementById('salesScrollWrap');
        const top = document.getElementById('salesScrollTop');
        const inner = document.getElementById('salesScrollTopInner');
        const tbl = document.getElementById('salesTable');
        if (!wrap || !top || !inner || !tbl) return;
        inner.style.width = tbl.scrollWidth + 'px';
        if (!top.dataset.bound) {
            top.addEventListener('scroll', () => { wrap.scrollLeft = top.scrollLeft; });
            wrap.addEventListener('scroll', () => { top.scrollLeft = wrap.scrollLeft; });
            top.dataset.bound = '1';
        }
    }, 0);
}
export function salesDownloadCSV() {
    const yearSel = document.getElementById('salesYear');
    if (!yearSel) return;
    const year = parseInt(yearSel.value, 10);
    const groupFilter = document.getElementById('salesGroup').value;
    const custFilter = document.getElementById('salesCustomer').value;
    const itemMap = {};
    cogsItems.forEach(i => { itemMap[i.code] = i; });
    const lines = [['Jaar','Week','Maand','Datum','Klant','ItemCode','Omschrijving','Productgroep','Aantal','Omzet'].join(';')];
    cogsSalesInvoices.forEach(l => {
        if (!l.invoiceDate) return;
        if (salesIsLorca(l.customerName)) return;
        const d = new Date(l.invoiceDate);
        if (d.getFullYear() !== year) return;
        const item = itemMap[l.itemCode] || {};
        const grp = getProductGroup(l.itemCode, item.description || '');
        if (groupFilter !== 'all' && grp !== groupFilter) return;
        if (custFilter !== 'all' && l.customerName !== custFilter) return;
        const wk = cfGetISOWeek(l.invoiceDate).week;
        const mo = d.getMonth() + 1;
        const fmt = v => String(v).replace(/"/g,'""');
        const num = v => (v || 0).toString().replace('.', ',');
        lines.push([
            year, wk, mo, l.invoiceDate,
            '"' + fmt(l.customerName || '') + '"',
            '"' + fmt(l.itemCode || '') + '"',
            '"' + fmt(item.description || '') + '"',
            grp,
            num(l.quantity || 0),
            num(l.amount || 0),
        ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omzet_per_klant_${year}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

