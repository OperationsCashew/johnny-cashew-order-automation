import {
    cfTransactionLines,
    cfUnlockedState, setCfUnlockedState,
    cfChartInstance, setCfChartInstance,
    cfShowBars, setCfShowBars,
    pnlUnlocked,
} from '../shared/state.js';
import { pnlHashPassword, PNL_PASS_HASH } from './pnl.js';

// === CASHFLOW DATA & LOGIC ===

export function cfToggleBars() {
    setCfShowBars(!cfShowBars);
    const btn = document.getElementById('cfToggleBars');
    btn.classList.toggle('active', cfShowBars);
    btn.textContent = cfShowBars ? 'In/Uit verbergen' : 'In/Uit tonen';
    renderCashflowTab();
}

export async function cfUnlock() {
    const input = document.getElementById('cfPassword');
    const hash = await pnlHashPassword(input.value);
    if (hash === PNL_PASS_HASH) {
        setCfUnlockedState(true);
        sessionStorage.setItem('cf_unlocked', '1');
        document.getElementById('cfLock').style.display = 'none';
        document.getElementById('cfContent').style.display = 'block';
        document.getElementById('cfLockError').style.display = 'none';
        renderCashflowTab();
    } else {
        document.getElementById('cfLockError').style.display = 'block';
        input.value = '';
        input.focus();
    }
}

export function cfCheckSession() {
    if (sessionStorage.getItem('cf_unlocked') === '1') {
        setCfUnlockedState(true);
        document.getElementById('cfLock').style.display = 'none';
        document.getElementById('cfContent').style.display = 'block';
    }
}

export const CF_MONTH_NAMES = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

// ISO week number helper
export function cfGetISOWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    // ISO week year can differ from calendar year at year boundaries
    const isoYear = d.getFullYear();
    return { year: isoYear, week: weekNum };
}

// Monday of ISO week
export function cfWeekStart(isoYear, weekNum) {
    const jan4 = new Date(isoYear, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
    return monday;
}

export function cfInitFilters() {
    const years = [...new Set(cfTransactionLines.map(t => t.year))].filter(y => y > 0).sort();
    if (!years.length) return;

    const fromYearEl = document.getElementById('cfFromYear');
    const toYearEl = document.getElementById('cfToYear');
    const fromPeriodEl = document.getElementById('cfFromPeriod');
    const toPeriodEl = document.getElementById('cfToPeriod');

    // Only populate if empty
    if (fromYearEl.options.length > 0) return;

    years.forEach(y => {
        fromYearEl.add(new Option(y, y));
        toYearEl.add(new Option(y, y));
    });

    for (let p = 1; p <= 12; p++) {
        fromPeriodEl.add(new Option(CF_MONTH_NAMES[p-1], p));
        toPeriodEl.add(new Option(CF_MONTH_NAMES[p-1], p));
    }

    // Default: show current year (or last available)
    const lastYear = years[years.length - 1];
    fromYearEl.value = lastYear;
    toYearEl.value = lastYear;
    fromPeriodEl.value = 1;
    toPeriodEl.value = 12;
}

export function cfFormatEur(val) {
    const neg = val < 0;
    const abs = Math.abs(val);
    const formatted = abs.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return (neg ? '-' : '') + '€' + formatted;
}

export function renderCashflowTab() {
    cfInitFilters();

    const fromYear = parseInt(document.getElementById('cfFromYear').value);
    const toYear = parseInt(document.getElementById('cfToYear').value);
    const fromPeriod = parseInt(document.getElementById('cfFromPeriod').value);
    const toPeriod = parseInt(document.getElementById('cfToPeriod').value);
    const viewMode = document.getElementById('cfViewMode').value;

    if (!fromYear || !toYear) return;

    // Calculate opening balance: sum of all transactions BEFORE the from period
    let openingBalance = 0;
    cfTransactionLines.forEach(t => {
        if (t.year < fromYear || (t.year === fromYear && t.period < fromPeriod)) {
            openingBalance += t.amount;
        }
    });

    // Filter transactions in selected range
    const inRange = cfTransactionLines.filter(t => {
        const after = t.year > fromYear || (t.year === fromYear && t.period >= fromPeriod);
        const before = t.year < toYear || (t.year === toYear && t.period <= toPeriod);
        return after && before;
    });

    // Build monthly buckets
    const monthlyData = {};
    inRange.forEach(t => {
        const key = `${t.year}-${String(t.period).padStart(2,'0')}`;
        if (!monthlyData[key]) monthlyData[key] = { year: t.year, period: t.period, inflow: 0, outflow: 0 };
        if (t.amount > 0) monthlyData[key].inflow += t.amount;
        else monthlyData[key].outflow += t.amount;
    });

    // Generate all month keys in range (even empty ones)
    const allKeys = [];
    let y = fromYear, p = fromPeriod;
    while (y < toYear || (y === toYear && p <= toPeriod)) {
        const key = `${y}-${String(p).padStart(2,'0')}`;
        if (!monthlyData[key]) monthlyData[key] = { year: y, period: p, inflow: 0, outflow: 0 };
        allKeys.push(key);
        p++;
        if (p > 12) { p = 1; y++; }
    }

    // Aggregate by view mode
    let periods = [];
    if (viewMode === 'weekly') {
        const wMap = {};
        const wOrder = [];
        inRange.forEach(t => {
            if (!t.date) return; // skip transactions without date
            const iw = cfGetISOWeek(t.date);
            const wKey = `${iw.year}-W${String(iw.week).padStart(2,'0')}`;
            if (!wMap[wKey]) {
                const mon = cfWeekStart(iw.year, iw.week);
                const dd = mon.getDate();
                const mm = CF_MONTH_NAMES[mon.getMonth()];
                wMap[wKey] = {
                    label: `Wk ${iw.week} (${dd} ${mm} ${iw.year})`,
                    shortLabel: `W${iw.week}'${String(iw.year).slice(2)}`,
                    inflow: 0, outflow: 0, sortKey: wKey
                };
                wOrder.push(wKey);
            }
            if (t.amount > 0) wMap[wKey].inflow += t.amount;
            else wMap[wKey].outflow += t.amount;
        });
        wOrder.sort();
        periods = wOrder.map(k => { const p = wMap[k]; p.net = p.inflow + p.outflow; return p; });
    } else if (viewMode === 'monthly') {
        periods = allKeys.map(k => {
            const d = monthlyData[k];
            return {
                label: CF_MONTH_NAMES[d.period - 1] + ' ' + d.year,
                shortLabel: CF_MONTH_NAMES[d.period - 1] + "'" + String(d.year).slice(2),
                inflow: d.inflow,
                outflow: d.outflow,
                net: d.inflow + d.outflow,
            };
        });
    } else if (viewMode === 'quarterly') {
        const qMap = {};
        allKeys.forEach(k => {
            const d = monthlyData[k];
            const q = Math.ceil(d.period / 3);
            const qKey = `${d.year}-Q${q}`;
            if (!qMap[qKey]) qMap[qKey] = { label: `Q${q} ${d.year}`, shortLabel: `Q${q}'${String(d.year).slice(2)}`, inflow: 0, outflow: 0 };
            qMap[qKey].inflow += d.inflow;
            qMap[qKey].outflow += d.outflow;
        });
        periods = Object.values(qMap);
        periods.forEach(p => p.net = p.inflow + p.outflow);
    } else {
        const yMap = {};
        allKeys.forEach(k => {
            const d = monthlyData[k];
            const yKey = `${d.year}`;
            if (!yMap[yKey]) yMap[yKey] = { label: String(d.year), shortLabel: String(d.year), inflow: 0, outflow: 0 };
            yMap[yKey].inflow += d.inflow;
            yMap[yKey].outflow += d.outflow;
        });
        periods = Object.values(yMap);
        periods.forEach(p => p.net = p.inflow + p.outflow);
    }

    // Calculate running balance
    let balance = openingBalance;
    periods.forEach(p => {
        p.openBalance = balance;
        balance += p.net;
        p.closeBalance = balance;
    });

    // Total summary
    const totalInflow = periods.reduce((s, p) => s + p.inflow, 0);
    const totalOutflow = periods.reduce((s, p) => s + p.outflow, 0);
    const totalNet = totalInflow + totalOutflow;

    // Render summary cards
    const summaryEl = document.getElementById('cfSummaryGrid');
    summaryEl.innerHTML = `
        <div class="cf-summary-card">
            <div class="cf-label">Beginsaldo</div>
            <div class="cf-value ${openingBalance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(openingBalance)}</div>
        </div>
        <div class="cf-summary-card">
            <div class="cf-label">Totaal ontvangen</div>
            <div class="cf-value cf-positive">${cfFormatEur(totalInflow)}</div>
        </div>
        <div class="cf-summary-card">
            <div class="cf-label">Totaal uitgegeven</div>
            <div class="cf-value cf-negative">${cfFormatEur(totalOutflow)}</div>
        </div>
        <div class="cf-summary-card">
            <div class="cf-label">Eindsaldo</div>
            <div class="cf-value ${balance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(balance)}</div>
        </div>
    `;

    // Render chart
    renderCashflowChart(periods);

    // Render table
    const thead = document.getElementById('cfTableHead');
    const tbody = document.getElementById('cfTableBody');
    thead.innerHTML = `<tr>
        <th>Periode</th>
        <th class="cf-amount">Beginsaldo</th>
        <th class="cf-amount">Ontvangen</th>
        <th class="cf-amount">Uitgegeven</th>
        <th class="cf-amount">Netto</th>
        <th class="cf-amount">Eindsaldo</th>
    </tr>`;

    tbody.innerHTML = '';
    periods.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.label}</td>
            <td class="cf-amount ${p.openBalance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(p.openBalance)}</td>
            <td class="cf-amount cf-positive">${cfFormatEur(p.inflow)}</td>
            <td class="cf-amount cf-negative">${cfFormatEur(p.outflow)}</td>
            <td class="cf-amount ${p.net >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(p.net)}</td>
            <td class="cf-amount ${p.closeBalance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(p.closeBalance)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Total row
    const totalTr = document.createElement('tr');
    totalTr.className = 'cf-row-total';
    totalTr.innerHTML = `
        <td>Totaal</td>
        <td class="cf-amount ${openingBalance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(openingBalance)}</td>
        <td class="cf-amount cf-positive">${cfFormatEur(totalInflow)}</td>
        <td class="cf-amount cf-negative">${cfFormatEur(totalOutflow)}</td>
        <td class="cf-amount ${totalNet >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(totalNet)}</td>
        <td class="cf-amount ${balance >= 0 ? 'cf-positive' : 'cf-negative'}">${cfFormatEur(balance)}</td>
    `;
    tbody.appendChild(totalTr);
}

export function renderCashflowChart(periods) {
    const canvas = document.getElementById('cfChart');
    if (cfChartInstance) {
        cfChartInstance.destroy();
        setCfChartInstance(null);
    }

    const labels = periods.map(p => p.shortLabel);
    const inflowData = periods.map(p => Math.round(p.inflow));
    const outflowData = periods.map(p => Math.round(Math.abs(p.outflow)));
    const balanceData = periods.map(p => Math.round(p.closeBalance));

    const datasets = [];

    // Saldo line — always shown, on LEFT axis (y)
    datasets.push({
        label: 'Banksaldo',
        data: balanceData,
        type: 'line',
        borderColor: '#0f3460',
        backgroundColor: 'rgba(15, 52, 96, 0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#0f3460',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
        order: 1,
    });

    // In/Uit bars — only when cfShowBars is true, on RIGHT axis (y1)
    if (cfShowBars) {
        datasets.push({
            label: 'Ontvangen',
            data: inflowData,
            backgroundColor: 'rgba(45, 106, 79, 0.7)',
            borderColor: 'rgba(45, 106, 79, 1)',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'y1',
            order: 2,
        });
        datasets.push({
            label: 'Uitgegeven',
            data: outflowData,
            backgroundColor: 'rgba(192, 57, 43, 0.7)',
            borderColor: 'rgba(192, 57, 43, 1)',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'y1',
            order: 3,
        });
    }

    setCfChartInstance(new Chart(canvas, {
        type: cfShowBars ? 'bar' : 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.raw;
                            const isOutflow = ctx.dataset.label === 'Uitgegeven';
                            const sign = isOutflow ? '-' : '';
                            return ctx.dataset.label + ': ' + sign + '€' + Math.abs(val).toLocaleString('nl-NL');
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Banksaldo (€)' },
                    ticks: {
                        callback: v => '€' + (v/1000).toLocaleString('nl-NL') + 'k'
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                ...(cfShowBars ? {
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'In/Uit (€)' },
                        ticks: {
                            callback: v => '€' + (v/1000).toLocaleString('nl-NL') + 'k'
                        },
                        grid: { drawOnChartArea: false }
                    }
                } : {})
            }
        }
    }));
}

// === CASHFLOW DOWNLOAD ===
export function cfShowDownloadMenu() {
    const menu = document.getElementById('cfDownloadMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    // Close on outside click
    if (menu.style.display === 'block') {
        setTimeout(() => {
            document.addEventListener('click', function cfClose(e) {
                if (!menu.contains(e.target) && e.target.id !== 'cfDownloadBtn') {
                    menu.style.display = 'none';
                    document.removeEventListener('click', cfClose);
                }
            });
        }, 10);
    }
}

export function cfDownloadCSV(granularity) {
    document.getElementById('cfDownloadMenu').style.display = 'none';

    const fromYear = parseInt(document.getElementById('cfFromYear').value);
    const toYear = parseInt(document.getElementById('cfToYear').value);
    const fromPeriod = parseInt(document.getElementById('cfFromPeriod').value);
    const toPeriod = parseInt(document.getElementById('cfToPeriod').value);

    // Opening balance
    let openingBalance = 0;
    cfTransactionLines.forEach(t => {
        if (t.year < fromYear || (t.year === fromYear && t.period < fromPeriod)) {
            openingBalance += t.amount;
        }
    });

    // Filter in range
    const inRange = cfTransactionLines.filter(t => {
        const after = t.year > fromYear || (t.year === fromYear && t.period >= fromPeriod);
        const before = t.year < toYear || (t.year === toYear && t.period <= toPeriod);
        return after && before;
    });

    let rows = []; // {label, inflow, outflow, net}

    if (granularity === 'daily') {
        const dayMap = {};
        const dayOrder = [];
        inRange.forEach(t => {
            const key = t.date || `${t.year}-P${t.period}`;
            if (!dayMap[key]) { dayMap[key] = { label: key, inflow: 0, outflow: 0 }; dayOrder.push(key); }
            if (t.amount > 0) dayMap[key].inflow += t.amount;
            else dayMap[key].outflow += t.amount;
        });
        dayOrder.sort();
        rows = dayOrder.map(k => dayMap[k]);
    } else if (granularity === 'weekly') {
        const wMap = {};
        const wOrder = [];
        inRange.forEach(t => {
            if (!t.date) return;
            const iw = cfGetISOWeek(t.date);
            const wKey = `${iw.year}-W${String(iw.week).padStart(2,'0')}`;
            if (!wMap[wKey]) {
                const mon = cfWeekStart(iw.year, iw.week);
                wMap[wKey] = { label: `${wKey} (${mon.toISOString().slice(0,10)})`, inflow: 0, outflow: 0 };
                wOrder.push(wKey);
            }
            if (t.amount > 0) wMap[wKey].inflow += t.amount;
            else wMap[wKey].outflow += t.amount;
        });
        wOrder.sort();
        rows = wOrder.map(k => wMap[k]);
    } else {
        // monthly
        const mMap = {};
        const mOrder = [];
        inRange.forEach(t => {
            const key = `${t.year}-${String(t.period).padStart(2,'0')}`;
            if (!mMap[key]) { mMap[key] = { label: `${CF_MONTH_NAMES[t.period-1]} ${t.year}`, inflow: 0, outflow: 0 }; mOrder.push(key); }
            if (t.amount > 0) mMap[key].inflow += t.amount;
            else mMap[key].outflow += t.amount;
        });
        mOrder.sort();
        rows = mOrder.map(k => mMap[k]);
    }

    // Build CSV with running balance
    let balance = openingBalance;
    const csvLines = ['Periode;Beginsaldo;Ontvangen;Uitgegeven;Netto;Eindsaldo'];
    rows.forEach(r => {
        r.net = r.inflow + r.outflow;
        const open = balance;
        balance += r.net;
        csvLines.push([
            r.label,
            open.toFixed(2).replace('.', ','),
            r.inflow.toFixed(2).replace('.', ','),
            r.outflow.toFixed(2).replace('.', ','),
            r.net.toFixed(2).replace('.', ','),
            balance.toFixed(2).replace('.', ',')
        ].join(';'));
    });

    // Download
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow_${granularity}_${fromYear}P${fromPeriod}-${toYear}P${toPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

