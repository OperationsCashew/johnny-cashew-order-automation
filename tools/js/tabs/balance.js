import {
    pnlTransactionLines,
    pnlUnlocked, setPnlUnlocked,
    balEditMode, setBalEditMode,
    balExpandedRows, setBalExpandedRows,
} from '../shared/state.js';
import { pnlHashPassword, PNL_PASS_HASH, pnlGetBucketMapping, PNL_BUCKET_DEFS } from './pnl.js';

// === BALANCE SHEET TAB ===
export async function balUnlock() {
    const input = document.getElementById('balPassword');
    const hash = await pnlHashPassword(input.value);
    if (hash === PNL_PASS_HASH) {
        setPnlUnlocked(true);
        sessionStorage.setItem('pnl_unlocked', '1');
        document.getElementById('pnlLock').style.display = 'none';
        document.getElementById('pnlContent').style.display = 'block';
        document.getElementById('balLock').style.display = 'none';
        document.getElementById('balContent').style.display = 'block';
        document.getElementById('balLockError').style.display = 'none';
        renderBalanceTab();
    } else {
        document.getElementById('balLockError').style.display = 'block';
        input.value = ''; input.focus();
    }
}
export function balCheckSession() {
    if (sessionStorage.getItem('pnl_unlocked') === '1') {
        setPnlUnlocked(true);
        document.getElementById('balLock').style.display = 'none';
        document.getElementById('balContent').style.display = 'block';
    }
}

// Default bucket mapping based on "Balans consolidated 08-01" sheet
// Pattern-based fallback: GL code prefix → bucket
// Bucket mapping aligned to Excel "Balans consolidated 08-01" JC NL BV layout.
// Each GL code from the Excel detail is mapped to the same bucket label Excel uses in the summary.
export const BAL_DEFAULT_BUCKETS = {
    // ACTIVA — Vaste activa (Excel "Activa")
    '0050':'vaste_activa','0055':'vaste_activa','0060':'vaste_activa','0065':'vaste_activa',
    '0070':'vaste_activa','0075':'vaste_activa','0099':'vaste_activa',
    '0220':'vaste_activa','0225':'vaste_activa','0230':'vaste_activa','0235':'vaste_activa',
    // Debiteuren
    '1300':'debiteuren',
    // Voorraad
    '3000':'voorraad','3001':'voorraad','3002':'voorraad','3003':'voorraad',
    '3005':'voorraad','3006':'voorraad','3007':'voorraad','3900':'voorraad',
    // Nog te ontvangen goederen
    '1610':'ntog',
    // Vooruitbetaalde cashew
    '1871':'vooruitbetaalde_cashew',
    // Vorderingen (1700)
    '1700':'vorderingen',
    // Niet toegewezen
    '1950':'niet_toegewezen',
    // BTW te vorderen (activa)
    '1520':'btw_activa','1550':'btw_activa',
    // Vooruitbetalingen (1720, 1721, 1730, 1775)
    '1720':'vooruitbetalingen','1721':'vooruitbetalingen','1730':'vooruitbetalingen','1775':'vooruitbetalingen',
    // Kruisposten
    '1250':'kruisposten','1251':'kruisposten',
    // Bank (net: 1100 + 1101 + 1103)
    '1100':'bank','1101':'bank','1103':'bank',

    // PASSIVA — Eigen vermogen
    '0650':'eigen_vermogen','0700':'eigen_vermogen',
    // Crediteuren
    '1600':'crediteuren',
    // Repurchase commitments
    '1611':'repurchase_commitments',
    // Diverse schulden
    '1870':'diverse_schulden','1876':'diverse_schulden',
    // BTW af te dragen (passiva)
    '1500':'btw_passiva','1510':'btw_passiva','1511':'btw_passiva','1512':'btw_passiva',
    // Rabo-leningen
    '0900':'rabo_a','0925':'rabo_b','0928':'rabo_c',
    // Invest International (subsidieleningen)
    '0950':'invest_international','0955':'invest_international',
    // Loonheffingen en afdrachten
    '1800':'loonheffingen','1820':'loonheffingen','1825':'loonheffingen',
    // Overige schulden
    '1872':'overige_schulden','2000':'overige_schulden','2200':'overige_schulden',
    // R/C NJANC
    '1885':'rc_njanc',
};

// Bucket definitions. `side` = 'activa' of 'passiva' (passiva values worden met omgedraaid teken getoond).
// `auto` bank: placement afhankelijk van teken.
export const BAL_BUCKET_DEFS = {
    // Activa (in Excel-volgorde)
    vaste_activa:          { label: 'Activa',                       side: 'activa' },
    debiteuren:            { label: 'Debiteuren',                   side: 'activa' },
    voorraad:              { label: 'Voorraad',                     side: 'activa' },
    ntog:                  { label: 'Nog te ontvangen goederen',    side: 'activa' },
    vooruitbetaalde_cashew:{ label: 'Vooruitbetaalde cashew',       side: 'activa' },
    vorderingen:           { label: 'Vorderingen',                  side: 'activa' },
    niet_toegewezen:       { label: 'Niet toegewezen',              side: 'activa' },
    btw_activa:            { label: 'BTW (te vorderen)',            side: 'activa' },
    vooruitbetalingen:     { label: 'Vooruitbetalingen',            side: 'activa' },
    kruisposten:           { label: 'Kruisposten',                  side: 'activa' },
    bank:                  { label: 'Bank',                         side: 'auto' },

    // Passiva (in Excel-volgorde)
    eigen_vermogen:        { label: 'Eigen vermogen',               side: 'passiva' },
    onverdeeld_resultaat:  { label: 'Onverdeeld resultaat v.j.',    side: 'passiva' },
    resultaat_boekjaar:    { label: 'Resultaat boekjaar',           side: 'passiva' },
    crediteuren:           { label: 'Crediteuren',                  side: 'passiva' },
    repurchase_commitments:{ label: 'Repurchase commitments',       side: 'passiva' },
    diverse_schulden:      { label: 'Diverse schulden',             side: 'passiva' },
    btw_passiva:           { label: 'BTW (af te dragen)',           side: 'passiva' },
    rabo_a:                { label: 'Rabo 1',                       side: 'passiva' },
    rabo_b:                { label: 'Rabo 2',                       side: 'passiva' },
    rabo_c:                { label: 'Rabo lening',                  side: 'passiva' },
    invest_international:  { label: 'Invest International',         side: 'passiva' },
    loonheffingen:         { label: 'Loonheffingen en afdrachten',  side: 'passiva' },
    overige_schulden:      { label: 'Overige schulden',             side: 'passiva' },
    rc_njanc:              { label: 'RC',                           side: 'passiva' },
};

// NJANC buckets uit Excel "Balans NJANC" — vereenvoudigde presentatie
export const NJANC_BUCKET_DEFS = {
    // Activa
    njanc_activa:         { label: 'Activa',          side: 'activa' },
    njanc_bank:           { label: 'Bank',            side: 'activa' },
    njanc_vorderingen:    { label: 'Vorderingen',     side: 'activa' },
    njanc_rc:             { label: 'RC',              side: 'activa' },
    njanc_btw:            { label: 'BTW',             side: 'activa' },
    njanc_deelneming:     { label: 'Deelneming',      side: 'activa' },
    // Passiva
    njanc_eigen_vermogen: { label: 'Eigen vermogen',  side: 'passiva' },
    njanc_crediteuren:    { label: 'Crediteuren',     side: 'passiva' },
    njanc_overige_schulden:{ label: 'Overige schulden', side: 'passiva' },
};

// Referentie 08-01-2026 NJANC (financial sign)
export const NJANC_REFERENCE_080126 = {
    njanc_activa: 30321,
    njanc_bank: 2707,
    njanc_vorderingen: 14973,
    njanc_rc: 2777135,
    njanc_btw: 2118,
    njanc_deelneming: 12,
    njanc_eigen_vermogen: 2766782,
    njanc_crediteuren: 4134,
    njanc_overige_schulden: 56350,
    _total: 2827266,
};

// Reference per 08-01-2026 uit Excel sheet "Balans consolidated 08-01".
// Waarden in financiële presentatie: activa positief, passiva positief (behalve negatief EV).
// Dit matcht exact de "Totaal 2.967.668" van JC NL BV in de Excel.
export const BAL_REFERENCE_080126 = {
    jc: {
        // Activa
        vaste_activa: 735118,
        debiteuren: 316957,
        voorraad: 1256787,
        ntog: 308346,
        vooruitbetaalde_cashew: 75132,
        vorderingen: 0,
        niet_toegewezen: 3333,
        btw_activa: 199129,
        vooruitbetalingen: 47443,
        kruisposten: 25424,
        bank: -89638, // overdraft → toont aan passiva-kant
        // Passiva
        eigen_vermogen: -2029383, // plug/balancing figuur uit Excel
        onverdeeld_resultaat: 0,
        resultaat_boekjaar: 0,
        crediteuren: 164424,
        repurchase_commitments: 370744,
        diverse_schulden: 17710,
        btw_passiva: 221036,
        rabo_a: 75000,
        rabo_b: 30000,
        rabo_c: 250000,
        invest_international: 949168,
        loonheffingen: 52196,
        overige_schulden: 0,
        rc_njanc: 2777135,
        _total: 2967668,
    },
    njanc: {
        vaste_activa: 12,      // Deelneming
        debiteuren: 0,
        voorraad: 0,
        vorderingen: 14973,
        btw_activa: 2117,
        rc_njanc: -2777135,    // NJANC perspective: receivable op JC (in financiële sign voor passiva-kant nvt)
        bank: 2707,
        eigen_vermogen: -2784144, // agioreserve 2794940 + aandelenkap 34 - overige -10838 - resultaat 17353
        crediteuren: 4134,
        diverse_schulden: 56350,
        _total: 2827266,
    },
    consol: {
        vaste_activa: 735130,
        debiteuren: 316957,
        voorraad: 1256787,
        ntog: 308346,
        vooruitbetaalde_cashew: 75132,
        vorderingen: 14973,
        niet_toegewezen: 3333,
        btw_activa: 201246,
        vooruitbetalingen: 47443,
        kruisposten: 25424,
        bank: -86931,
        eigen_vermogen: -4813527,
        crediteuren: 168558,
        repurchase_commitments: 370744,
        diverse_schulden: 74060,
        btw_passiva: 221036,
        rabo_a: 75000,
        rabo_b: 30000,
        rabo_c: 250000,
        invest_international: 949168,
        loonheffingen: 52196,
        overige_schulden: 0,
        _total: 2897840,
    },
};


export function balGetBucketMapping() {
    const saved = localStorage.getItem('bal_bucket_mapping');
    if (saved) {
        try { return Object.assign({}, BAL_DEFAULT_BUCKETS, JSON.parse(saved)); } catch(e) {}
    }
    return Object.assign({}, BAL_DEFAULT_BUCKETS);
}

export function balSaveBucketMapping(mapping) {
    const overrides = {};
    for (const [code, bucket] of Object.entries(mapping)) {
        if (BAL_DEFAULT_BUCKETS[code] !== bucket) overrides[code] = bucket;
    }
    localStorage.setItem('bal_bucket_mapping', JSON.stringify(overrides));
}

export function balGetNjancManual() {
    try { return JSON.parse(localStorage.getItem('bal_njanc_manual') || '{}'); } catch(e) { return {}; }
}

export function balSaveNjancManual(data) {
    localStorage.setItem('bal_njanc_manual', JSON.stringify(data));
}

export function balToggleEditMode() {
    setBalEditMode(!balEditMode);
    document.getElementById('balEditToggle').textContent = balEditMode ? 'Bewerken stoppen' : 'Buckets bewerken';
    if (balEditMode) {
        for (const key of Object.keys(BAL_BUCKET_DEFS)) balExpandedRows[key] = true;
    } else {
        setBalExpandedRows({});
    }
    renderBalanceTab();
}

// Fallback classifier: alleen voor codes die (nog) niet in de default mapping staan.
export function balClassifyByCode(code) {
    if (!code || code.length === 0) return null;
    const c = code.padEnd(4, '0');
    const n = parseInt(c.substring(0, 4), 10);
    if (isNaN(n)) return null;
    if (n >= 0 && n < 500) return 'vaste_activa';
    if (n >= 500 && n < 900) return 'eigen_vermogen';
    if (n === 1885) return 'rc_njanc';
    if (n >= 3000 && n < 4000) return 'voorraad';
    return null;
}

export function balFormatAmount(val) {
    const neg = val < 0;
    const abs = Math.abs(Math.round(val));
    const formatted = abs.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return (neg ? '-' : '') + '€ ' + formatted;
}

export function balComputeJC(cutoffYear, cutoffPeriod) {
    // Cumulative sum of transactionLines for balance accounts (0-3xxx)
    // through cutoffYear/cutoffPeriod inclusive.
    // Also add current-year P&L result (4-9xxx) into eigen_vermogen.
    const mapping = balGetBucketMapping();
    const buckets = {};
    const glDetails = {}; // code → { amount, name }
    const unmapped = [];

    for (const t of pnlTransactionLines) {
        if (!t.accountCode) continue;
        // Include only entries up to cutoff
        if (t.year > cutoffYear) continue;
        if (t.year === cutoffYear && t.period > cutoffPeriod) continue;
        const code = t.accountCode;
        const firstChar = code.charAt(0);
        const isBalance = /^[0-3]/.test(firstChar);
        const isPL = /^[4-9]/.test(firstChar);
        if (!isBalance && !isPL) continue;

        // INCLUDE closing entries on both sides: each closing journal has matching legs
        // (PL leg zeros the PL account, 0700 leg posts net result to equity). Including both
        // keeps sum(prior-year balance tx) + sum(prior-year PL tx) = 0 per double-entry,
        // so only current-year PL remains as "Resultaat boekjaar".

        let bucket;
        if (isBalance) {
            bucket = mapping[code] || balClassifyByCode(code);
            if (!glDetails[code]) glDetails[code] = { amount: 0, name: t.accountName || code, bucket: bucket || null };
            glDetails[code].amount += t.amount;
            if (!bucket) continue;
        } else {
            // PL: current year → "resultaat_boekjaar". Prior years may still have open PL
            // balances (unclosed) → roll into "onverdeeld_resultaat" so balance still ties.
            // Skip current-year closing entries (shouldn't exist yet but defensive).
            if (t.year === cutoffYear) {
                if (t.isYearEndClose) continue;
                bucket = 'resultaat_boekjaar';
            } else {
                bucket = 'onverdeeld_resultaat';
            }
        }
        if (!buckets[bucket]) buckets[bucket] = 0;
        buckets[bucket] += t.amount;
    }
    // Build unmapped list from glDetails (include alle codes zonder bucket, ongeacht saldo)
    for (const [code, d] of Object.entries(glDetails)) {
        if (!d.bucket) unmapped.push({ code, name: d.name, amount: d.amount });
    }
    return { buckets, glDetails, unmapped };
}

export function renderBalanceTab() {
    const yearSelect = document.getElementById('balYear');
    const periodSelect = document.getElementById('balPeriod');
    const entitySelect = document.getElementById('balEntity');
    const tbody = document.getElementById('balTableBody');
    const showRef = document.getElementById('balShowReference').checked;

    const years = [...new Set(pnlTransactionLines.map(t => t.year))].filter(y => y > 0).sort();
    if (yearSelect.options.length === 0 && years.length) {
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            yearSelect.appendChild(opt);
        });
        yearSelect.value = years[years.length - 1];
    }

    const selYear = parseInt(yearSelect.value) || (years[years.length - 1]);
    const selPeriod = parseInt(periodSelect.value);
    const entity = entitySelect.value;

    document.getElementById('balRefHeader').style.display = showRef ? '' : 'none';
    document.getElementById('balDiffHeader').style.display = showRef ? '' : 'none';

    const jc = balComputeJC(selYear, selPeriod);
    const njancManual = balGetNjancManual();
    const mapping = balGetBucketMapping();

    // Determine values per bucket for selected entity
    // Mapping NJANC bucket → JC bucket voor consolidatie. `passiva` = of de NJANC waarde
    // financial-sign positief is opgeslagen voor een credit-saldo (moet geflipt worden naar Exact).
    const NJANC_TO_JC = {
        njanc_activa:         { jc: 'vaste_activa', passiva: false },
        njanc_deelneming:     { jc: 'vaste_activa', passiva: false },
        njanc_bank:           { jc: 'bank',         passiva: false },
        njanc_vorderingen:    { jc: 'vorderingen',  passiva: false },
        njanc_btw:            { jc: 'btw_activa',   passiva: false },
        njanc_eigen_vermogen: { jc: 'eigen_vermogen', passiva: true },
        njanc_crediteuren:    { jc: 'crediteuren',  passiva: true },
        njanc_overige_schulden:{ jc: 'diverse_schulden', passiva: true },
        // njanc_rc: geëlimineerd in consol
    };
    const bucketVal = (key) => {
        if (entity === 'jc') return jc.buckets[key] || 0;
        if (entity === 'njanc') return parseFloat(njancManual[key] || 0);
        // consol: JC (raw Exact-sign) + NJANC (financial → Exact) met rc_njanc geëlimineerd
        if (key === 'rc_njanc') return 0;
        let sum = jc.buckets[key] || 0;
        for (const [nj, m] of Object.entries(NJANC_TO_JC)) {
            if (m.jc !== key) continue;
            const nv = parseFloat(njancManual[nj] || 0);
            sum += m.passiva ? -nv : nv;
        }
        return sum;
    };

    tbody.innerHTML = '';

    function addRow(label, bucketKey, opts = {}) {
        const raw = bucketVal(bucketKey);
        // Passiva-buckets: display in financiële sign (flip teken).
        const def = BAL_BUCKET_DEFS[bucketKey] || NJANC_BUCKET_DEFS[bucketKey] || {};
        const flip = opts.flipSign !== undefined ? opts.flipSign : (def.side === 'passiva');
        const amount = flip ? -raw : raw;
        const tr = document.createElement('tr');
        if (opts.subtotal) tr.className = 'pnl-row-subtotal';
        if (opts.spacer) { tr.className = 'pnl-row-spacer'; tr.innerHTML = '<td colspan="4"></td>'; tbody.appendChild(tr); return; }

        // Expandable only for JC view (real GL details)
        const hasDetails = entity === 'jc' && Object.entries(jc.glDetails).some(([code]) => (mapping[code] || balClassifyByCode(code)) === bucketKey);
        if (hasDetails && !opts.subtotal) {
            tr.className = 'pnl-row-expandable' + (balExpandedRows[bucketKey] ? ' expanded' : '');
            tr.onclick = () => { balExpandedRows[bucketKey] = !balExpandedRows[bucketKey]; renderBalanceTab(); };
        }

        let amtCell;
        if (entity === 'njanc' && !opts.subtotal) {
            // Editable input
            amtCell = '<td class="pnl-amount"><input type="number" step="1" style="width:140px;text-align:right;" value="' + (njancManual[bucketKey] || 0) + '" onchange="balUpdateNjanc(\'' + bucketKey + '\', this.value)" onclick="event.stopPropagation()"></td>';
        } else {
            const amtClass = opts.subtotal ? (amount >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
            amtCell = '<td class="pnl-amount ' + amtClass + '">' + balFormatAmount(amount) + '</td>';
        }

        let refCell = '';
        let diffCell = '';
        if (showRef) {
            const ref = (BAL_REFERENCE_080126[entity] || {})[bucketKey] || 0;
            const diff = amount - ref;
            refCell = '<td class="pnl-amount" style="color:#888;">' + balFormatAmount(ref) + '</td>';
            diffCell = '<td class="pnl-amount" style="color:' + (Math.abs(diff) < 1 ? '#888' : (diff > 0 ? '#2f855a' : '#c53030')) + ';">' + balFormatAmount(diff) + '</td>';
        }

        tr.innerHTML = '<td>' + label + '</td>' + amtCell + refCell + diffCell;
        tbody.appendChild(tr);

        // Expanded detail rows (JC only)
        if (hasDetails && balExpandedRows[bucketKey]) {
            const details = Object.entries(jc.glDetails)
                .filter(([code, d]) => (mapping[code] || balClassifyByCode(code)) === bucketKey)
                .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount));
            details.forEach(([code, d]) => {
                const dtr = document.createElement('tr');
                dtr.className = 'pnl-row-detail';
                let selHtml = '';
                if (balEditMode) {
                    selHtml = ' <select class="pnl-bucket-select" onchange="balChangeBucket(\'' + code + '\', this.value)" onclick="event.stopPropagation()">';
                    selHtml += '<option value="">— Niet toegewezen —</option>';
                    for (const [k, def] of Object.entries(BAL_BUCKET_DEFS)) {
                        selHtml += '<option value="' + k + '"' + (k === bucketKey ? ' selected' : '') + '>' + def.label + '</option>';
                    }
                    selHtml += '</select>';
                }
                const refBlank = showRef ? '<td></td><td></td>' : '';
                dtr.innerHTML = '<td style="padding-left:24px;">' + code + ' — ' + d.name + selHtml + '</td>' +
                    '<td class="pnl-amount">' + balFormatAmount(d.amount) + '</td>' + refBlank;
                dtr.onclick = (e) => e.stopPropagation();
                tbody.appendChild(dtr);
            });
        }
    }

    // === ASSETS ===
    const assetsHeader = document.createElement('tr');
    assetsHeader.className = 'pnl-row-subtotal';
    assetsHeader.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '" style="background:#f3f4f6;">ACTIVA</td>';
    tbody.appendChild(assetsHeader);

    // NJANC-specifieke layout met eigen buckets uit Excel "Balans NJANC"
    if (entity === 'njanc') {
        const njancActivaKeys = ['njanc_activa','njanc_bank','njanc_vorderingen','njanc_rc','njanc_btw','njanc_deelneming'];
        const njancPassivaKeys = ['njanc_eigen_vermogen','njanc_crediteuren','njanc_overige_schulden'];

        for (const k of njancActivaKeys) addRow(NJANC_BUCKET_DEFS[k].label, k, { flipSign: false });
        const njTotalA = njancActivaKeys.reduce((s,k) => s + bucketVal(k), 0);
        const subA = document.createElement('tr');
        subA.className = 'pnl-row-subtotal';
        const refAv = showRef ? '<td class="pnl-amount" style="color:#888;">' + balFormatAmount(njancActivaKeys.reduce((s,k)=>s+(NJANC_REFERENCE_080126[k]||0),0)) + '</td><td></td>' : '';
        subA.innerHTML = '<td>Totaal activa</td><td class="pnl-amount pnl-positive">' + balFormatAmount(njTotalA) + '</td>' + refAv;
        tbody.appendChild(subA);

        const spN = document.createElement('tr');
        spN.className = 'pnl-row-spacer'; spN.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '"></td>';
        tbody.appendChild(spN);

        const passivaHeaderN = document.createElement('tr');
        passivaHeaderN.className = 'pnl-row-subtotal';
        passivaHeaderN.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '" style="background:#f3f4f6;">PASSIVA</td>';
        tbody.appendChild(passivaHeaderN);

        for (const k of njancPassivaKeys) addRow(NJANC_BUCKET_DEFS[k].label, k, { flipSign: false });
        const njTotalP = njancPassivaKeys.reduce((s,k) => s + bucketVal(k), 0);
        const subPn = document.createElement('tr');
        subPn.className = 'pnl-row-subtotal';
        const refPv = showRef ? '<td class="pnl-amount" style="color:#888;">' + balFormatAmount(njancPassivaKeys.reduce((s,k)=>s+(NJANC_REFERENCE_080126[k]||0),0)) + '</td><td></td>' : '';
        subPn.innerHTML = '<td>Totaal passiva</td><td class="pnl-amount pnl-positive">' + balFormatAmount(njTotalP) + '</td>' + refPv;
        tbody.appendChild(subPn);

        // Balance check NJANC
        const diffN = njTotalA - njTotalP;
        const checkEl = document.getElementById('balCheckInfo');
        let msg = 'Balans check NJANC: activa ' + balFormatAmount(njTotalA) + ' vs passiva ' + balFormatAmount(njTotalP);
        if (Math.abs(diffN) < 1) msg += '  ✓ in balans';
        else msg += '  ⚠ niet in balans (verschil ' + balFormatAmount(diffN) + ')';
        msg += '  •  laatst bijgewerkt: ' + balFormatUpdatedAt(njancManual.__updatedAt);
        checkEl.textContent = msg;
        return;
    }

    // Bank: Excel toont 'm op de kant waar het saldo natuurlijk staat.
    const bankRaw = bucketVal('bank');
    const bankOnActiva = bankRaw >= 0;

    addRow('Activa', 'vaste_activa');           // Excel noemt vaste activa gewoon "Activa"
    addRow('Debiteuren', 'debiteuren');
    addRow('Voorraad', 'voorraad');
    addRow('Nog te ontvangen goederen', 'ntog');
    addRow('Vooruitbetaalde cashew', 'vooruitbetaalde_cashew');
    addRow('Vorderingen', 'vorderingen');
    addRow('Niet toegewezen', 'niet_toegewezen');
    addRow('BTW', 'btw_activa');
    addRow('Vooruitbetalingen', 'vooruitbetalingen');
    addRow('Kruisposten', 'kruisposten');
    if (bankOnActiva) addRow('Bank', 'bank', { flipSign: false });

    const assetKeys = ['vaste_activa','debiteuren','voorraad','ntog','vooruitbetaalde_cashew',
        'vorderingen','niet_toegewezen','btw_activa','vooruitbetalingen','kruisposten'];
    if (bankOnActiva) assetKeys.push('bank');
    // Activa display = raw (geen flip).
    const totalAssets = assetKeys.reduce((s,k) => s + bucketVal(k), 0);

    const subAssets = document.createElement('tr');
    subAssets.className = 'pnl-row-subtotal';
    const refATotal = assetKeys.reduce((s,k)=>s+((BAL_REFERENCE_080126[entity]||{})[k]||0),0);
    const refA = showRef ? '<td class="pnl-amount" style="color:#888;">' + balFormatAmount(refATotal) + '</td><td></td>' : '';
    subAssets.innerHTML = '<td>Totaal activa</td><td class="pnl-amount ' + (totalAssets >= 0 ? 'pnl-positive' : 'pnl-negative') + '">' + balFormatAmount(totalAssets) + '</td>' + refA;
    tbody.appendChild(subAssets);

    // spacer
    const sp = document.createElement('tr');
    sp.className = 'pnl-row-spacer'; sp.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '"></td>';
    tbody.appendChild(sp);

    // === EQUITY & LIABILITIES ===
    const passivaHeader = document.createElement('tr');
    passivaHeader.className = 'pnl-row-subtotal';
    passivaHeader.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '" style="background:#f3f4f6;">PASSIVA</td>';
    tbody.appendChild(passivaHeader);

    addRow('Eigen vermogen', 'eigen_vermogen');
    addRow('Onverdeeld resultaat v.j.', 'onverdeeld_resultaat');
    addRow('Resultaat boekjaar', 'resultaat_boekjaar');
    addRow('Crediteuren', 'crediteuren');
    addRow('Repurchase commitments', 'repurchase_commitments');
    addRow('Diverse schulden', 'diverse_schulden');
    addRow('BTW', 'btw_passiva');
    addRow('Rabo 1', 'rabo_a');
    addRow('Rabo 2', 'rabo_b');
    addRow('Rabo lening', 'rabo_c');
    addRow('Invest International', 'invest_international');
    addRow('Loonheffingen en afdrachten', 'loonheffingen');
    addRow('Overige schulden', 'overige_schulden');
    if (!bankOnActiva) addRow('Bank', 'bank', { flipSign: true });
    addRow('RC', 'rc_njanc');

    const liabKeysBase = ['eigen_vermogen','onverdeeld_resultaat','resultaat_boekjaar',
        'crediteuren','repurchase_commitments','diverse_schulden','btw_passiva',
        'rabo_a','rabo_b','rabo_c','invest_international','loonheffingen','overige_schulden','rc_njanc'];
    const liabKeys = bankOnActiva ? liabKeysBase : [...liabKeysBase, 'bank'];
    // Passiva display = -raw (flipped). Bank on passiva side ook -raw.
    const totalPassiva = liabKeys.reduce((s,k) => s + (-bucketVal(k)), 0);

    const subP = document.createElement('tr');
    subP.className = 'pnl-row-subtotal';
    const refPTotal = liabKeys.reduce((s,k)=>{
        const v = (BAL_REFERENCE_080126[entity]||{})[k] || 0;
        // Reference is al in financial sign; flip voor bank alleen bij passiva-kant
        return s + (k === 'bank' ? -v : v);
    }, 0);
    const refP = showRef ? '<td class="pnl-amount" style="color:#888;">' + balFormatAmount(refPTotal) + '</td><td></td>' : '';
    subP.innerHTML = '<td>Totaal passiva</td><td class="pnl-amount ' + (totalPassiva >= 0 ? 'pnl-positive' : 'pnl-negative') + '">' + balFormatAmount(totalPassiva) + '</td>' + refP;
    tbody.appendChild(subP);

    // === UNMAPPED (JC only) — altijd tonen ===
    if (entity === 'jc') {
        const sp2 = document.createElement('tr');
        sp2.className = 'pnl-row-spacer'; sp2.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '"></td>';
        tbody.appendChild(sp2);
        const uh = document.createElement('tr');
        uh.className = 'pnl-row-subtotal';
        const uhLabel = jc.unmapped.length > 0
            ? '⚠ Ongekoppelde grootboekrekeningen (' + jc.unmapped.length + ') — wijs toe aan bucket'
            : '✓ Alle grootboekrekeningen zijn toegewezen';
        uh.innerHTML = '<td colspan="' + (showRef ? 4 : 2) + '" style="background:#fef3c7;color:#92400e;">' + uhLabel + '</td>';
        tbody.appendChild(uh);
        if (jc.unmapped.length === 0) {
            // skip the rest of the rendering below
        } else {
        jc.unmapped.sort((a,b) => Math.abs(b.amount) - Math.abs(a.amount));
        jc.unmapped.forEach(u => {
            const tr = document.createElement('tr');
            let selHtml = '<select class="pnl-bucket-select" onchange="balChangeBucket(\'' + u.code + '\', this.value)">';
            selHtml += '<option value="">— Kies bucket —</option>';
            for (const [k, def] of Object.entries(BAL_BUCKET_DEFS)) {
                selHtml += '<option value="' + k + '">' + def.label + '</option>';
            }
            selHtml += '</select>';
            const blank = showRef ? '<td></td><td></td>' : '';
            tr.innerHTML = '<td>' + u.code + ' — ' + u.name + ' ' + selHtml + '</td>' +
                '<td class="pnl-amount">' + balFormatAmount(u.amount) + '</td>' + blank;
            tbody.appendChild(tr);
        });
        } // end else (unmapped > 0)
    } // end if entity === 'jc'

    // Balance check — beide in financial sign: moeten gelijk zijn.
    const diff = totalAssets - totalPassiva;
    const checkEl = document.getElementById('balCheckInfo');
    let msg = 'Balans check: activa ' + balFormatAmount(totalAssets) + ' + passiva ' + balFormatAmount(totalPassiva) + ' = ' + balFormatAmount(diff);
    if (Math.abs(diff) < 1) msg += '  ✓ in balans';
    else msg += '  ⚠ niet in balans (verschil ' + balFormatAmount(diff) + ')';
    if (jc.unmapped.length > 0 && entity !== 'njanc') {
        msg += ' — ' + jc.unmapped.length + ' niet-gekoppelde rekening(en): ' + jc.unmapped.slice(0,5).map(u=>u.code).join(', ');
    }
    if (entity === 'njanc' || entity === 'consol') {
        msg += '  •  NJANC laatst bijgewerkt: ' + balFormatUpdatedAt(njancManual.__updatedAt);
    }
    checkEl.textContent = msg;
}

export function balChangeBucket(code, newBucket) {
    const mapping = balGetBucketMapping();
    if (newBucket) mapping[code] = newBucket;
    else delete mapping[code];
    balSaveBucketMapping(mapping);
    renderBalanceTab();
}

export function balUpdateNjanc(bucketKey, value) {
    const data = balGetNjancManual();
    data[bucketKey] = parseFloat(value) || 0;
    data.__updatedAt = new Date().toISOString();
    balSaveNjancManual(data);
    renderBalanceTab();
}

export function balFormatUpdatedAt(iso) {
    if (!iso) return 'nog niet bijgewerkt';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getDate()) + '-' + pad(d.getMonth()+1) + '-' + d.getFullYear() +
           ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

