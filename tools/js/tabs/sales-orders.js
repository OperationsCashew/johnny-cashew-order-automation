import {
    soMode, setSoMode,
    soExpanded,
    soInitialized, setSoInitialized,
    cogsItems, cogsRawDataset, cogsSalesInvoices,
} from '../shared/state.js';
import { parseODataDate } from '../shared/utils.js';
import { cfGetISOWeek } from './cashflow.js';
import { getProductGroup } from './cogs.js';
import { salesIsLorca } from './sales.js';

// === SALES ORDERS TAB ===

export function soBuildLines() {
    // Build flat array of {date, customer, itemCode, description, qty, amount, status}
    const out = [];
    if (!cogsRawDataset) return out;
    const headers = cogsRawDataset.salesOrderHeaders || [];
    const lines = cogsRawDataset.salesOrderLines || [];
    const headerMap = {};
    headers.forEach(h => {
        const id = h.OrderID || h.ID || h.OrderNumber;
        if (id != null) headerMap[id] = h;
    });
    lines.forEach(l => {
        const hid = l.OrderID || l.ID;
        const h = headerMap[hid] || {};
        const status = (h.Status != null ? h.Status : l.Status);
        if (status === 25 || status === '25') return;
        const customer = h.OrderedByName || h.DeliverToName || '(onbekend)';
        if (salesIsLorca(customer)) return;
        const dateRaw = l.DeliveryDate || h.DeliveryDate || h.OrderDate;
        const date = parseODataDate(dateRaw);
        if (!date) return;
        out.push({
            date,
            customer,
            itemCode: l.ItemCode || '',
            description: l.Description || '',
            qty: l.Quantity || 0,
            amount: l.AmountFC || 0,
            status,
        });
    });
    return out;
}

export function soGetPeriod(mode) {
    // Returns ordered list of bucket keys + a label fn + start/end date filter
    const today = new Date();
    today.setHours(0,0,0,0);
    if (mode === 'month') {
        const startY = today.getFullYear();
        const startM = today.getMonth();
        const buckets = [];
        for (let i = 0; i < 3; i++) {
            const m = startM + i;
            const y = startY + Math.floor(m / 12);
            const mm = ((m % 12) + 12) % 12;
            buckets.push({ key: y + '-' + String(mm + 1).padStart(2,'0'), year: y, month: mm + 1 });
        }
        const startDate = new Date(startY, startM, 1);
        const endDate = new Date(buckets[buckets.length - 1].year, buckets[buckets.length - 1].month, 1);
        return { buckets, startDate, endDate, mode };
    }
    // week mode: monday of current ISO week, 13 weeks
    const d = new Date(today);
    const dayIdx = (d.getDay() + 6) % 7; // 0=mon
    d.setDate(d.getDate() - dayIdx);
    const buckets = [];
    for (let i = 0; i < 13; i++) {
        const wd = new Date(d);
        wd.setDate(d.getDate() + i * 7);
        const iso = cfGetISOWeek(wd.toISOString().slice(0,10));
        buckets.push({ key: iso.year + '-W' + String(iso.week).padStart(2,'0'), year: iso.year, week: iso.week });
    }
    const startDate = new Date(d);
    const endDate = new Date(d);
    endDate.setDate(d.getDate() + 13 * 7);
    return { buckets, startDate, endDate, mode };
}

export function soBucketLabel(b, mode) {
    if (mode === 'month') {
        const names = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
        return names[b.month - 1] + ' ' + String(b.year).slice(2);
    }
    return 'W' + b.week;
}

export function soBucketKeyForLine(line, mode) {
    if (mode === 'month') {
        const d = new Date(line.date + 'T00:00:00');
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0');
    }
    const iso = cfGetISOWeek(line.date);
    return iso.year + '-W' + String(iso.week).padStart(2,'0');
}

export function initSalesOrdersTab() {
    if (soInitialized) return;
    const custSel = document.getElementById('soCustomer');
    if (!custSel) return;
    const customers = new Set();
    soBuildLines().forEach(l => { if (l.customer) customers.add(l.customer); });
    const custList = [...customers].sort((a,b) => a.localeCompare(b));
    custSel.innerHTML = '<option value="all" selected>Alle</option>' +
        custList.map(c => `<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
    setSoInitialized(true);
}

export function salesOrdersToggleMode() {
    setSoMode(soMode === 'omzet' ? 'qty' : 'omzet');
    document.getElementById('soModeBtn').textContent = soMode === 'omzet' ? 'Omzet (€)' : 'Aantal (HE)';
    renderSalesOrdersTab();
}

export function soToggleRow(name) {
    if (soExpanded.has(name)) soExpanded.delete(name);
    else soExpanded.add(name);
    renderSalesOrdersTab();
}

export function soFmt(v) {
    if (!v) return '';
    if (soMode === 'omzet') return '€' + Math.round(v).toLocaleString('nl-NL');
    return Math.round(v).toLocaleString('nl-NL');
}

export function renderSalesOrdersTab() {
    const groupSel = document.getElementById('soGroup');
    if (!groupSel) return;
    const groupFilter = groupSel.value;
    const custFilter = document.getElementById('soCustomer').value;
    const periodMode = document.getElementById('soPeriod').value;
    const period = soGetPeriod(periodMode);
    const bucketKeys = period.buckets.map(b => b.key);
    const bucketKeySet = new Set(bucketKeys);

    const itemMap = {};
    cogsItems.forEach(i => { itemMap[i.code] = i; });

    const custMap = {};
    soBuildLines().forEach(l => {
        const d = new Date(l.date + 'T00:00:00');
        if (d < period.startDate || d >= period.endDate) return;
        const item = itemMap[l.itemCode] || {};
        const desc = l.description || item.description || '';
        const grp = getProductGroup(l.itemCode, desc);
        if (groupFilter !== 'all' && grp !== groupFilter) return;
        if (custFilter !== 'all' && l.customer !== custFilter) return;
        const bk = soBucketKeyForLine(l, periodMode);
        if (!bucketKeySet.has(bk)) return;
        const value = soMode === 'omzet' ? (l.amount || 0) : (l.qty || 0);
        const cName = l.customer || '(onbekend)';
        if (!custMap[cName]) custMap[cName] = { weekTotals: {}, items: {}, total: 0 };
        const c = custMap[cName];
        c.weekTotals[bk] = (c.weekTotals[bk] || 0) + value;
        c.total += value;
        const iKey = l.itemCode || '(geen code)';
        if (!c.items[iKey]) c.items[iKey] = { desc: desc || iKey, weekTotals: {}, total: 0 };
        c.items[iKey].weekTotals[bk] = (c.items[iKey].weekTotals[bk] || 0) + value;
        c.items[iKey].total += value;
    });

    const sortedCust = Object.entries(custMap).sort((a,b) => b[1].total - a[1].total);

    const head = document.getElementById('soTableHead');
    let h = '<tr><th class="sticky-col">Klant / Artikel</th>';
    period.buckets.forEach(b => h += `<th>${soBucketLabel(b, periodMode)}</th>`);
    h += '<th>Totaal</th></tr>';
    head.innerHTML = h;

    const body = document.getElementById('soTableBody');
    let rows = '';
    const weekTotals = {}; let grand = 0;
    sortedCust.forEach(([name, data]) => {
        const expanded = soExpanded.has(name);
        const caret = expanded ? '▼' : '▶';
        rows += `<tr class="sales-cust-row" onclick="soToggleRow(${JSON.stringify(name).replace(/"/g,'&quot;')})">`;
        rows += `<td class="sticky-col"><span class="sales-caret">${caret}</span> ${name}</td>`;
        bucketKeys.forEach(k => {
            const v = data.weekTotals[k] || 0;
            weekTotals[k] = (weekTotals[k] || 0) + v;
            rows += `<td>${soFmt(v)}</td>`;
        });
        rows += `<td>${soFmt(data.total)}</td>`;
        rows += '</tr>';
        grand += data.total;
        if (expanded) {
            const sortedItems = Object.entries(data.items).sort((a,b) => b[1].total - a[1].total);
            sortedItems.forEach(([code, idata]) => {
                rows += '<tr class="sales-item-row">';
                rows += `<td class="sticky-col">${code} — ${idata.desc}</td>`;
                bucketKeys.forEach(k => {
                    const v = idata.weekTotals[k] || 0;
                    rows += `<td>${soFmt(v)}</td>`;
                });
                rows += `<td>${soFmt(idata.total)}</td>`;
                rows += '</tr>';
            });
        }
    });
    body.innerHTML = rows;

    let f = '<tr><td class="sticky-col">Totaal</td>';
    bucketKeys.forEach(k => f += `<td>${soFmt(weekTotals[k] || 0)}</td>`);
    f += `<td>${soFmt(grand)}</td></tr>`;
    document.getElementById('soTableFoot').innerHTML = f;

    setTimeout(() => {
        const wrap = document.getElementById('soScrollWrap');
        const top = document.getElementById('soScrollTop');
        const inner = document.getElementById('soScrollTopInner');
        const tbl = document.getElementById('soTable');
        if (!wrap || !top || !inner || !tbl) return;
        inner.style.width = tbl.scrollWidth + 'px';
        if (!top.dataset.bound) {
            top.addEventListener('scroll', () => { wrap.scrollLeft = top.scrollLeft; });
            wrap.addEventListener('scroll', () => { top.scrollLeft = wrap.scrollLeft; });
            top.dataset.bound = '1';
        }
    }, 0);
}

export function salesOrdersDownloadCSV() {
    const groupFilter = document.getElementById('soGroup').value;
    const custFilter = document.getElementById('soCustomer').value;
    const periodMode = document.getElementById('soPeriod').value;
    const period = soGetPeriod(periodMode);
    const itemMap = {};
    cogsItems.forEach(i => { itemMap[i.code] = i; });
    const lines = [['Jaar','Week','Maand','Datum','Klant','ItemCode','Omschrijving','Productgroep','Aantal','Omzet'].join(';')];
    soBuildLines().forEach(l => {
        const d = new Date(l.date + 'T00:00:00');
        if (d < period.startDate || d >= period.endDate) return;
        const item = itemMap[l.itemCode] || {};
        const desc = l.description || item.description || '';
        const grp = getProductGroup(l.itemCode, desc);
        if (groupFilter !== 'all' && grp !== groupFilter) return;
        if (custFilter !== 'all' && l.customer !== custFilter) return;
        const iso = cfGetISOWeek(l.date);
        const mo = d.getMonth() + 1;
        const fmt = v => String(v).replace(/"/g,'""');
        const num = v => (v || 0).toString().replace('.', ',');
        lines.push([
            iso.year, iso.week, mo, l.date,
            '"' + fmt(l.customer || '') + '"',
            '"' + fmt(l.itemCode || '') + '"',
            '"' + fmt(desc) + '"',
            grp,
            num(l.qty || 0),
            num(l.amount || 0),
        ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_orders_komende_3_maanden.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

