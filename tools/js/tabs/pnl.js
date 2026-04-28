import {
    pnlTransactionLines, pnlGLAccounts,
    pnlEditMode, setPnlEditMode,
    pnlExpandedRows, setPnlExpandedRows,
    pnlUnlocked, setPnlUnlocked,
} from '../shared/state.js';

// === P&L DATA & LOGIC ===
export const PNL_PASS_HASH = '84269d258104fbb2c8a12e4d7d734f7f0ad1cc06e77acfb1a1afd9b1796f4c12'; // sha256

export async function pnlHashPassword(pw) {
    const data = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pnlUnlock() {
    const input = document.getElementById('pnlPassword');
    const hash = await pnlHashPassword(input.value);
    if (hash === PNL_PASS_HASH) {
        setPnlUnlocked(true);
        sessionStorage.setItem('pnl_unlocked', '1');
        document.getElementById('pnlLock').style.display = 'none';
        document.getElementById('pnlContent').style.display = 'block';
        document.getElementById('balContent').style.display = 'block';
        document.getElementById('pnlLockError').style.display = 'none';
        renderPnLTab();
    } else {
        document.getElementById('pnlLockError').style.display = 'block';
        input.value = '';
        input.focus();
    }
}

export function pnlCheckSession() {
    if (sessionStorage.getItem('pnl_unlocked') === '1') {
        setPnlUnlocked(true);
        document.getElementById('pnlLock').style.display = 'none';
        document.getElementById('pnlContent').style.display = 'block';
        document.getElementById('balContent').style.display = 'block';
    }
}

// Default bucket mapping: { GLAccountCode: bucketKey }
export const PNL_DEFAULT_BUCKETS = {
    // Revenue
    '8016': 'sales_jc', '8017': 'sales_jc',
    '8000': 'sales_pl', '8010': 'sales_pl', '8014': 'sales_pl', '8015': 'sales_pl', '8018': 'sales_pl',
    '8020': 'sales_other', '8025': 'sales_other', '8050': 'sales_other',
    '8075': 'subsidies',
    // COGS
    '7003': 'cogs_jc',
    '7004': 'cogs_pl',
    '7000': 'cogs_other', '7002': 'cogs_other', '7006': 'cogs_other', '7007': 'cogs_other', '7200': 'cogs_other',
    '7001': 'logistics',
    '7005': 'quality',
    '7021': 'price_diff', '7022': 'price_diff',
    '7900': 'wo_diff',
    // OpEx
    '4000': 'personnel', '400101': 'personnel', '4020': 'personnel', '4045': 'personnel',
    '4050': 'personnel', '4060': 'personnel', '4099': 'personnel', '4200': 'personnel', '4201': 'personnel',
    '4205': 'hiring',
    '4075': 'travel', '4076': 'travel',
    '4100': 'rent', '4140': 'rent',
    '4190': 'office', '4300': 'office', '4310': 'office', '4320': 'office',
    '4350': 'office', '4390': 'office', '4400': 'office', '4435': 'office', '4490': 'office',
    '4305': 'ict', '4375': 'ict',
    '4340': 'subscriptions',
    '4341': 'contributions',
    '4370': 'marketing', '4510': 'marketing', '4530': 'marketing',
    '4535': 'sales_exp', '4590': 'sales_exp', '4591': 'sales_exp', '4731': 'sales_exp', '4970': 'sales_exp',
    '4380': 'insurance',
    '4580': 'other_general',
    '4710': 'admin', '4700': 'admin',
    '4725': 'logistics_opex', '4730': 'logistics_opex',
    '4740': 'advisory',
    '4750': 'other_general', '4790': 'other_general', '9300': 'other_general', '9999': 'other_general',
    // Below EBITDA
    '4805': 'depreciation', '4825': 'depreciation', '4835': 'depreciation', '4860': 'depreciation', '4870': 'depreciation',
    '4900': 'banking',
    '4905': 'interest', '4920': 'interest', '4925': 'interest', '4930': 'interest', '4935': 'interest', '4960': 'interest',
};

// All bucket definitions with labels
export const PNL_BUCKET_DEFS = {
    sales_jc:       { label: 'Omzet Johnny Cashew', group: 'revenue' },
    sales_pl:       { label: 'Omzet Private Label', group: 'revenue' },
    subsidies:      { label: 'Subsidies', group: 'revenue' },
    sales_other:    { label: 'Overige omzet', group: 'revenue' },
    cogs_jc:        { label: 'COGS Johnny Cashew', group: 'cogs' },
    cogs_pl:        { label: 'COGS Private Label', group: 'cogs' },
    cogs_other:     { label: 'COGS overig', group: 'cogs' },
    quality:        { label: 'Kwaliteitscontroles', group: 'cogs' },
    price_diff:     { label: 'Prijsverschillen', group: 'cogs' },
    wo_diff:        { label: 'Werkorderverschillen', group: 'cogs' },
    logistics:      { label: 'Logistiek (direct)', group: 'opex' },
    logistics_opex: { label: 'Logistiek (boetes)', group: 'opex' },
    personnel:      { label: 'Personeel', group: 'opex' },
    hiring:         { label: 'Inhuur derden', group: 'opex' },
    marketing:      { label: 'Marketing', group: 'opex' },
    sales_exp:      { label: 'Verkoopkosten', group: 'opex' },
    subscriptions:  { label: 'Abonnementen & research', group: 'opex' },
    contributions:  { label: 'Contributies & licenties', group: 'opex' },
    travel:         { label: 'Reiskosten', group: 'opex' },
    rent:           { label: 'Huisvestingskosten', group: 'opex' },
    insurance:      { label: 'Verzekeringen', group: 'opex' },
    office:         { label: 'Kantoorkosten', group: 'opex' },
    ict:            { label: 'ICT', group: 'opex' },
    advisory:       { label: 'Advieskosten', group: 'opex' },
    admin:          { label: 'Administratiekosten', group: 'opex' },
    other_general:  { label: 'Overige algemene kosten', group: 'opex' },
    depreciation:   { label: 'Afschrijvingen', group: 'below_ebitda' },
    interest:       { label: 'Rentelasten', group: 'below_ebitda' },
    banking:        { label: 'Bankkosten', group: 'below_ebitda' },
};

export function pnlGetBucketMapping() {
    const saved = localStorage.getItem('pnl_bucket_mapping');
    if (saved) {
        try {
            return Object.assign({}, PNL_DEFAULT_BUCKETS, JSON.parse(saved));
        } catch(e) {}
    }
    return Object.assign({}, PNL_DEFAULT_BUCKETS);
}

export function pnlSaveBucketMapping(mapping) {
    // Only save overrides (differences from default)
    const overrides = {};
    for (const [code, bucket] of Object.entries(mapping)) {
        if (PNL_DEFAULT_BUCKETS[code] !== bucket) {
            overrides[code] = bucket;
        }
    }
    localStorage.setItem('pnl_bucket_mapping', JSON.stringify(overrides));
}

export function pnlToggleEditMode() {
    setPnlEditMode(!pnlEditMode);
    document.getElementById('pnlEditToggle').textContent = pnlEditMode ? 'Bewerken stoppen' : 'Buckets bewerken';
    // In edit mode, expand all rows
    if (pnlEditMode) {
        for (const key of Object.keys(PNL_BUCKET_DEFS)) {
            pnlExpandedRows[key] = true;
        }
    } else {
        setPnlExpandedRows({});
    }
    renderPnLTab();
}

export function pnlFormatAmount(val) {
    const neg = val < 0;
    const abs = Math.abs(val);
    const formatted = abs.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return (neg ? '-' : '') + '€ ' + formatted;
}

export function renderPnLTab() {
    const yearSelect = document.getElementById('pnlYear');
    const periodSelect = document.getElementById('pnlPeriod');
    const tbody = document.getElementById('pnlTableBody');

    // Populate year dropdown
    const years = [...new Set(pnlTransactionLines.map(t => t.year))].filter(y => y > 0).sort();
    const currentYear = yearSelect.value || (years.length ? years[years.length - 1] : '');
    if (yearSelect.options.length <= 1 || !yearSelect.value) {
        yearSelect.innerHTML = '';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (String(y) === String(currentYear)) opt.selected = true;
            yearSelect.appendChild(opt);
        });
    }

    const selYear = parseInt(yearSelect.value);
    const selPeriod = periodSelect.value;

    // Filter transaction lines
    const filtered = pnlTransactionLines.filter(t => {
        if (t.isYearEndClose) return false;
        if (t.year !== selYear) return false;
        if (selPeriod !== 'all' && t.period !== parseInt(selPeriod)) return false;
        return true;
    });

    // Aggregate per GL account
    const glTotals = {}; // { code: { amount, name } }
    filtered.forEach(t => {
        if (!t.accountCode) return;
        if (!glTotals[t.accountCode]) glTotals[t.accountCode] = { amount: 0, name: t.accountName || pnlGLAccounts[t.accountCode] || t.accountCode };
        glTotals[t.accountCode].amount += t.amount;
    });

    // Map to buckets
    const mapping = pnlGetBucketMapping();
    const bucketTotals = {}; // { bucketKey: { amount, accounts: [{code, name, amount}] } }
    const unmapped = []; // accounts not in any bucket

    for (const [code, data] of Object.entries(glTotals)) {
        const bucket = mapping[code];
        // Only include 4xxx, 7xxx, 8xxx, 9xxx accounts
        if (!code.match(/^[4789]/)) continue;
        if (!bucket) {
            unmapped.push({ code, name: data.name, amount: data.amount });
            continue;
        }
        if (!bucketTotals[bucket]) bucketTotals[bucket] = { amount: 0, accounts: [] };
        bucketTotals[bucket].amount += data.amount;
        bucketTotals[bucket].accounts.push({ code, name: data.name, amount: data.amount });
    }

    // Sort accounts within each bucket by absolute amount desc
    for (const bt of Object.values(bucketTotals)) {
        bt.accounts.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    }

    // Calculate P&L structure
    const val = (key) => (bucketTotals[key] || { amount: 0 }).amount;
    // Revenue accounts have negative amounts in Exact (credit), so negate them
    const revenue_jc = -val('sales_jc');
    const revenue_pl = -val('sales_pl');
    const revenue_sub = -val('subsidies');
    const revenue_other = -val('sales_other');
    const revenue_total = revenue_jc + revenue_pl + revenue_sub + revenue_other;

    const cogs_jc = val('cogs_jc');
    const cogs_pl = val('cogs_pl');
    const cogs_other = val('cogs_other');
    const cogs_quality = val('quality');
    const cogs_price = val('price_diff');
    const cogs_wo = val('wo_diff');
    const cogs_total = cogs_jc + cogs_pl + cogs_other + cogs_quality + cogs_price + cogs_wo;

    const gross_margin = revenue_total - cogs_total;

    const logistics_total = val('logistics') + val('logistics_opex');
    const opex_keys = ['logistics','logistics_opex','personnel','hiring','marketing','sales_exp','subscriptions','contributions','travel','rent','insurance','office','ict','advisory','admin','other_general'];
    let opex_total = 0;
    opex_keys.forEach(k => opex_total += val(k));

    const ebitda = gross_margin - opex_total;
    const below_total = val('depreciation') + val('interest') + val('banking');
    const profit = ebitda - below_total;

    const pct = (amount) => revenue_total !== 0 ? (amount / revenue_total * 100).toFixed(1) + '%' : '-';

    // Build table rows
    tbody.innerHTML = '';

    const bucketSelect = (code) => {
        if (!pnlEditMode) return '';
        const current = mapping[code] || '';
        let html = '<select class="pnl-bucket-select" onchange="pnlChangeBucket(\'' + code + '\', this.value)">';
        html += '<option value="">— Niet toegewezen —</option>';
        for (const [key, def] of Object.entries(PNL_BUCKET_DEFS)) {
            html += '<option value="' + key + '"' + (key === current ? ' selected' : '') + '>' + def.label + '</option>';
        }
        html += '</select>';
        return html;
    };

    function addRow(label, amount, opts = {}) {
        const tr = document.createElement('tr');
        if (opts.subtotal) tr.className = 'pnl-row-subtotal';
        if (opts.spacer) { tr.className = 'pnl-row-spacer'; tr.innerHTML = '<td colspan="3"></td>'; tbody.appendChild(tr); return; }
        if (opts.bucketKey && bucketTotals[opts.bucketKey] && bucketTotals[opts.bucketKey].accounts.length > 0) {
            tr.className = 'pnl-row-expandable' + (pnlExpandedRows[opts.bucketKey] ? ' expanded' : '');
            tr.onclick = () => { pnlExpandedRows[opts.bucketKey] = !pnlExpandedRows[opts.bucketKey]; renderPnLTab(); };
        }
        const amtClass = opts.subtotal ? (amount >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
        const isRevenue = opts.negate; // revenue rows show positive
        const displayAmt = isRevenue ? -amount : amount;
        tr.innerHTML = '<td>' + label + '</td>' +
            '<td class="pnl-amount ' + amtClass + '">' + pnlFormatAmount(displayAmt) + '</td>' +
            '<td class="pnl-pct">' + pct(Math.abs(displayAmt)) + '</td>';
        tbody.appendChild(tr);

        // Expanded detail rows
        if (opts.bucketKey && pnlExpandedRows[opts.bucketKey]) {
            const bt = bucketTotals[opts.bucketKey];
            if (bt) {
                bt.accounts.forEach(acc => {
                    const dtr = document.createElement('tr');
                    dtr.className = 'pnl-row-detail';
                    const accAmt = isRevenue ? -acc.amount : acc.amount;
                    dtr.innerHTML = '<td>' + acc.code + ' — ' + acc.name + ' ' + bucketSelect(acc.code) + '</td>' +
                        '<td class="pnl-amount">' + pnlFormatAmount(accAmt) + '</td>' +
                        '<td class="pnl-pct">' + pct(Math.abs(accAmt)) + '</td>';
                    dtr.onclick = (e) => e.stopPropagation();
                    tbody.appendChild(dtr);
                });
            }
        }
    }

    function addCombinedRow(label, bucketKeys, opts = {}) {
        let total = 0;
        const allAccounts = [];
        const combinedKey = bucketKeys.join('+');
        bucketKeys.forEach(k => {
            total += val(k);
            if (bucketTotals[k]) allAccounts.push(...bucketTotals[k].accounts);
        });
        // Create a virtual combined bucket for expansion
        if (!bucketTotals[combinedKey]) {
            bucketTotals[combinedKey] = { amount: total, accounts: allAccounts };
        }
        addRow(label, total, { ...opts, bucketKey: combinedKey });
    }

    // === REVENUE ===
    addRow('Omzet Johnny Cashew', val('sales_jc'), { bucketKey: 'sales_jc', negate: true });
    addRow('Omzet Private Label', val('sales_pl'), { bucketKey: 'sales_pl', negate: true });
    addRow('Subsidies', val('subsidies'), { bucketKey: 'subsidies', negate: true });
    addRow('Overige omzet', val('sales_other'), { bucketKey: 'sales_other', negate: true });
    addRow('Omzet Totaal', -revenue_total, { subtotal: true, negate: true });

    addRow(null, null, { spacer: true });

    // === COGS ===
    addRow('COGS Johnny Cashew', val('cogs_jc'), { bucketKey: 'cogs_jc' });
    addRow('COGS Private Label', val('cogs_pl'), { bucketKey: 'cogs_pl' });
    addRow('COGS overig', val('cogs_other'), { bucketKey: 'cogs_other' });
    addRow('Kwaliteitscontroles', val('quality'), { bucketKey: 'quality' });
    addRow('Prijsverschillen', val('price_diff'), { bucketKey: 'price_diff' });
    addRow('Werkorderverschillen', val('wo_diff'), { bucketKey: 'wo_diff' });
    addRow('COGS Totaal', cogs_total, { subtotal: true });

    addRow(null, null, { spacer: true });

    // === GROSS MARGIN ===
    addRow('Brutomarge', gross_margin, { subtotal: true });

    addRow(null, null, { spacer: true });

    // === OPEX ===
    addCombinedRow('Logistiek', ['logistics', 'logistics_opex']);
    addRow('Personeel', val('personnel'), { bucketKey: 'personnel' });
    addRow('Inhuur derden', val('hiring'), { bucketKey: 'hiring' });
    addRow('Marketing', val('marketing'), { bucketKey: 'marketing' });
    addRow('Verkoopkosten', val('sales_exp'), { bucketKey: 'sales_exp' });
    addRow('Abonnementen & research', val('subscriptions'), { bucketKey: 'subscriptions' });
    addRow('Contributies & licenties', val('contributions'), { bucketKey: 'contributions' });
    addRow('Reiskosten', val('travel'), { bucketKey: 'travel' });
    addRow('Huisvestingskosten', val('rent'), { bucketKey: 'rent' });
    addRow('Verzekeringen', val('insurance'), { bucketKey: 'insurance' });
    addRow('Kantoorkosten', val('office'), { bucketKey: 'office' });
    addRow('ICT', val('ict'), { bucketKey: 'ict' });
    addRow('Advieskosten', val('advisory'), { bucketKey: 'advisory' });
    addRow('Administratiekosten', val('admin'), { bucketKey: 'admin' });
    addRow('Overige algemene kosten', val('other_general'), { bucketKey: 'other_general' });
    addRow('Totaal operationele kosten', opex_total, { subtotal: true });

    addRow(null, null, { spacer: true });

    // === EBITDA ===
    addRow('EBITDA', ebitda, { subtotal: true });

    addRow(null, null, { spacer: true });

    // === BELOW EBITDA ===
    addRow('Afschrijvingen', val('depreciation'), { bucketKey: 'depreciation' });
    addRow('Rentelasten', val('interest'), { bucketKey: 'interest' });
    addRow('Bankkosten', val('banking'), { bucketKey: 'banking' });

    addRow(null, null, { spacer: true });

    // === PROFIT ===
    addRow('Winst voor belasting', profit, { subtotal: true });

    // Check for unmapped accounts
    // Append ongekoppelde grootboekrekeningen onderaan de P&L-tabel
    {
        const sp = document.createElement('tr');
        sp.className = 'pnl-row-spacer'; sp.innerHTML = '<td colspan="3"></td>';
        tbody.appendChild(sp);
        const uh = document.createElement('tr');
        uh.className = 'pnl-row-subtotal';
        const uhLabel = unmapped.length > 0
            ? '⚠ Ongekoppelde grootboekrekeningen (' + unmapped.length + ') — wijs toe aan bucket'
            : '✓ Alle P&L-grootboekrekeningen zijn toegewezen';
        uh.innerHTML = '<td colspan="3" style="background:#fef3c7;color:#92400e;">' + uhLabel + '</td>';
        tbody.appendChild(uh);
        if (unmapped.length > 0) {
            unmapped.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            unmapped.forEach(acc => {
                const tr = document.createElement('tr');
                let selHtml = '<select class="pnl-bucket-select" onchange="pnlChangeBucket(\'' + acc.code + '\', this.value)">';
                selHtml += '<option value="">— Kies bucket —</option>';
                for (const [k, def] of Object.entries(PNL_BUCKET_DEFS)) {
                    selHtml += '<option value="' + k + '">' + def.label + '</option>';
                }
                selHtml += '</select>';
                tr.innerHTML = '<td>' + acc.code + ' — ' + acc.name + ' ' + selHtml + '</td>' +
                    '<td class="pnl-amount">' + pnlFormatAmount(acc.amount) + '</td>' +
                    '<td class="pnl-pct">' + pct(Math.abs(acc.amount)) + '</td>';
                tbody.appendChild(tr);
            });
        }
    }
}

export function pnlChangeBucket(code, newBucket) {
    const mapping = pnlGetBucketMapping();
    if (newBucket) {
        mapping[code] = newBucket;
    } else {
        delete mapping[code];
    }
    pnlSaveBucketMapping(mapping);
    renderPnLTab();
}

export function pnlShowMismatch(unmapped) {
    const body = document.getElementById('pnlMismatchBody');
    body.innerHTML = '';
    unmapped.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    unmapped.forEach(acc => {
        const tr = document.createElement('tr');
        let opts = '<option value="">— Kies bucket —</option>';
        for (const [key, def] of Object.entries(PNL_BUCKET_DEFS)) {
            opts += '<option value="' + key + '">' + def.label + '</option>';
        }
        tr.innerHTML = '<td>' + acc.code + '</td>' +
            '<td>' + acc.name + '</td>' +
            '<td class="pnl-amount">' + pnlFormatAmount(acc.amount) + '</td>' +
            '<td><select class="pnl-bucket-select" data-code="' + acc.code + '">' + opts + '</select></td>';
        body.appendChild(tr);
    });
    document.getElementById('pnlMismatchOverlay').style.display = 'flex';
}

export function pnlSaveMismatchAssignments() {
    const selects = document.querySelectorAll('#pnlMismatchBody select');
    const mapping = pnlGetBucketMapping();
    selects.forEach(sel => {
        const code = sel.getAttribute('data-code');
        if (sel.value) {
            mapping[code] = sel.value;
        }
    });
    pnlSaveBucketMapping(mapping);
    pnlCloseMismatch();
    renderPnLTab();
}

export function pnlCloseMismatch() {
    document.getElementById('pnlMismatchOverlay').style.display = 'none';
}

