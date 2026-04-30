// === ORDERS INBOX TAB — Email-to-Order Portal ===
//
// Toont alle inkomende orders die via CloudMailin zijn binnengekomen.
// Status flow: nieuw → review → geboekt / afgewezen
// Klant-matching via Exact Online API, daarna 1-klik boeken.

const PROXY_URL = '/.netlify/functions/exact-proxy';
const DHL_THRESHOLD = 15;

// ── State ─────────────────────────────────────────────────────────────────────
let allOrders = [];
let selectedOrder = null;
let statusFilter = 'alle';
let accessToken = null;
let refreshTokenVal = null;

// ── Entry point ───────────────────────────────────────────────────────────────
export function renderOrdersInboxTab() {
    const container = document.getElementById('ordersInboxContent');
    if (!container) return;

    accessToken = sessionStorage.getItem('exact_access_token');
    refreshTokenVal = sessionStorage.getItem('exact_refresh_token');

    container.innerHTML = buildUI();
    attachListeners();
    loadOrders();
}

// ── Load orders from Netlify Blobs via proxy ──────────────────────────────────
async function loadOrders() {
    setLoading(true);
    try {
        const res = await fetch('/.netlify/functions/orders-list');
        if (res.ok) {
            allOrders = await res.json();
        } else {
            // Fallback: load demo orders for testing
            allOrders = getDemoOrders();
        }
    } catch {
        allOrders = getDemoOrders();
    }
    setLoading(false);
    renderOrderList();
}

function getDemoOrders() {
    return [
        {
            id: 'A1B2C3D4',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            status: 'nieuw',
            email: { from: 'operations@johnnycashew.com', subject: 'Order bevestiging #0088' },
            parsed: {
                customer: { company: 'AI Test', contact: 'Claude Test', email: 'operations@johnnycashew.com', phone: '+31612345678', address: 'Johan Huizingalaan 763 Amsterdam 1066VH NL' },
                lines: [
                    { code: '1002036', description: 'Johnny Cashew Roasted & Salted 25g (12 x 25 gr)', quantity: 1 },
                    { code: '1002053', description: 'Johnny Cashew Milk Chocolate Honey Sea Salt 100g (8 x 100 gr)', quantity: 1 },
                    { code: '1002060', description: 'Johnny Cashew Thai Sweet Chilli 100g (8 x 100 gr)', quantity: 1 },
                    { code: '1002061', description: 'Johnny Cashew Cinnamon Bun 100g (8 x 100 gr)', quantity: 1 },
                ],
                confidence: 0.95, orderReference: '#0088', deliveryDate: null, notes: '',
            },
            exactAccountId: null, exactOrderId: null,
        },
        {
            id: 'E5F6G7H8',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            status: 'review',
            email: { from: 'inkoop@supermarkt.nl', subject: 'Bestelling cashew producten' },
            parsed: {
                customer: { company: 'Supermarkt BV', contact: null, email: 'inkoop@supermarkt.nl', phone: null, address: null },
                lines: [
                    { code: '1002036', description: 'Roasted & Salted 25g', quantity: 12 },
                    { code: '1002060', description: 'Thai Sweet Chilli 100g', quantity: 8 },
                ],
                confidence: 0.72, orderReference: null, deliveryDate: '2026-04-28', notes: 'Adres onduidelijk in mail',
            },
            exactAccountId: null, exactOrderId: null,
        },
        {
            id: 'I9J0K1L2',
            timestamp: new Date(Date.now() - 172800000).toISOString(),
            status: 'geboekt',
            email: { from: 'order@klant.nl', subject: 'Order #501' },
            parsed: {
                customer: { company: 'Klant Retail', contact: 'Jan de Vries', email: 'order@klant.nl', phone: '+31612000000', address: 'Hoofdstraat 1 1234AB Amsterdam NL' },
                lines: [{ code: '1002053', description: 'Milk Chocolate Honey Sea Salt 100g', quantity: 5 }],
                confidence: 0.98, orderReference: '#501', deliveryDate: null, notes: '',
            },
            exactAccountId: 'acc-guid-001', exactOrderId: 'SO-20260419-501',
        },
    ];
}

// ── UI Builder ────────────────────────────────────────────────────────────────
function buildUI() {
    return `
    <style>
        .oi-layout{display:grid;grid-template-columns:380px 1fr;gap:16px;min-height:500px}
        .oi-panel{background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden}

        .oi-toolbar{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;
            border-bottom:1px solid #f1f5f9}
        .oi-toolbar-title{font-size:0.8rem;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:.5px}
        .oi-refresh-btn{font-size:0.75rem;font-weight:600;padding:4px 10px;border:1.5px solid #e2e8f0;
            border-radius:6px;background:#fff;color:#555;cursor:pointer}
        .oi-refresh-btn:hover{background:#f8fafc}

        .oi-filters{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap}
        .oi-filter-btn{font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:20px;
            border:1.5px solid #e2e8f0;background:#fff;color:#666;cursor:pointer;transition:all .15s}
        .oi-filter-btn.active{background:#0f3460;color:#fff;border-color:#0f3460}

        .oi-order-list{overflow-y:auto;max-height:600px}
        .oi-order-row{padding:12px 16px;border-bottom:1px solid #f8fafc;cursor:pointer;transition:background .15s}
        .oi-order-row:hover{background:#f8fafc}
        .oi-order-row.selected{background:#eff6ff;border-left:3px solid #3b82f6}
        .oi-order-row-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .oi-order-company{font-size:0.87rem;font-weight:700;color:#1a1a2e}
        .oi-order-time{font-size:0.7rem;color:#aaa}
        .oi-order-subject{font-size:0.75rem;color:#666;margin-bottom:5px;white-space:nowrap;
            overflow:hidden;text-overflow:ellipsis}
        .oi-order-meta{display:flex;align-items:center;gap:6px}

        .oi-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;
            font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
        .oi-badge.nieuw{background:#dbeafe;color:#1d4ed8}
        .oi-badge.review{background:#fef3c7;color:#b45309}
        .oi-badge.geboekt{background:#dcfce7;color:#166534}
        .oi-badge.afgewezen{background:#fee2e2;color:#dc2626}
        .oi-badge.fout{background:#fee2e2;color:#dc2626}

        .oi-conf{font-size:0.68rem;color:#aaa;font-weight:600}
        .oi-conf.low{color:#ef4444}
        .oi-conf.med{color:#f59e0b}
        .oi-conf.high{color:#10b981}

        .oi-empty{padding:40px 20px;text-align:center;color:#aaa;font-size:0.85rem}
        .oi-loading{padding:30px;text-align:center}
        .oi-spinner{display:inline-block;width:20px;height:20px;border:2.5px solid #e2e8f0;
            border-top-color:#0f3460;border-radius:50%;animation:oispin .7s linear infinite}
        @keyframes oispin{to{transform:rotate(360deg)}}

        /* Detail panel */
        .oi-detail-empty{display:flex;align-items:center;justify-content:center;height:100%;
            color:#aaa;font-size:0.9rem;flex-direction:column;gap:12px}
        .oi-detail-empty-icon{font-size:2.5rem}

        .oi-detail-header{padding:16px 20px;border-bottom:1px solid #f1f5f9;
            display:flex;align-items:center;justify-content:space-between}
        .oi-detail-title{font-size:1rem;font-weight:700;color:#1a1a2e}
        .oi-detail-body{padding:20px;overflow-y:auto;max-height:650px}

        .oi-section-label{font-size:0.68rem;font-weight:700;text-transform:uppercase;
            letter-spacing:.8px;color:#999;margin:0 0 10px}
        .oi-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        .oi-info-item{background:#f8fafc;border-radius:8px;padding:10px 14px}
        .oi-info-label{font-size:0.68rem;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:3px}
        .oi-info-value{font-size:0.87rem;font-weight:600;color:#1a1a2e}
        .oi-info-input{width:100%;border:none;background:transparent;font-size:0.87rem;
            font-weight:600;color:#1a1a2e;outline:none;font-family:inherit}
        .oi-info-input:focus{border-bottom:1.5px solid #0f3460}

        .oi-items-table{width:100%;border-collapse:collapse;font-size:0.83rem;margin-bottom:10px}
        .oi-items-table th{text-align:left;padding:6px 10px;background:#f1f5f9;
            font-size:0.67rem;text-transform:uppercase;letter-spacing:.4px;color:#666;font-weight:700}
        .oi-items-table td{padding:8px 10px;border-bottom:1px solid #f8fafc;color:#333}
        .oi-items-table tr:last-child td{border-bottom:none}
        .oi-code{font-family:monospace;font-size:0.78rem;color:#0f3460;font-weight:700}
        .oi-qty-input{width:52px;border:1.5px solid #e2e8f0;border-radius:6px;padding:2px 6px;
            text-align:center;font-size:0.83rem;font-weight:700;font-family:inherit}

        .oi-total-row{display:flex;align-items:center;justify-content:space-between;
            padding:8px 12px;background:#f8fafc;border-radius:8px;margin-bottom:10px}
        .oi-total-label{font-size:0.75rem;font-weight:700;color:#555;text-transform:uppercase}
        .oi-total-val{font-size:0.95rem;font-weight:800;color:#0f3460}
        .oi-ship-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
            border-radius:20px;font-size:0.78rem;font-weight:700}
        .oi-ship-badge.dhl{background:#ffecb3;color:#b45309}
        .oi-ship-badge.pallet{background:#e0f2fe;color:#0369a1}

        .oi-customer-match{border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:0.83rem}
        .oi-customer-match.found{background:#f0fff4;border:1.5px solid #9ae6b4;color:#276749}
        .oi-customer-match.notfound{background:#fff5f5;border:1.5px solid #feb2b2;color:#c53030}
        .oi-customer-match.checking{background:#eff6ff;border:1.5px solid #bfdbfe;color:#1d4ed8}
        .oi-match-title{font-weight:700;margin-bottom:4px}

        .oi-btn{padding:9px 22px;border:none;border-radius:8px;font-size:0.87rem;
            font-weight:700;cursor:pointer;transition:all .15s}
        .oi-btn-primary{background:#0f3460;color:#fff}
        .oi-btn-primary:hover:not(:disabled){background:#1a4a8a}
        .oi-btn-primary:disabled{opacity:.4;cursor:not-allowed}
        .oi-btn-success{background:#38a169;color:#fff}
        .oi-btn-success:hover:not(:disabled){background:#2f855a}
        .oi-btn-danger{background:#fff;color:#e53e3e;border:1.5px solid #e53e3e}
        .oi-btn-danger:hover{background:#fff5f5}
        .oi-btn-sm{padding:5px 12px;font-size:0.75rem}

        .oi-action-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}

        .oi-conf-warn{background:#fffbeb;border:1.5px solid #f6e05e;border-radius:8px;
            padding:10px 14px;font-size:0.8rem;color:#744210;margin-bottom:12px}

        .oi-booked-banner{background:#f0fff4;border:1.5px solid #9ae6b4;border-radius:10px;
            padding:14px 18px;text-align:center;font-weight:700;color:#276749;font-size:0.9rem}
        .oi-booked-link{color:#276749;text-decoration:underline;cursor:pointer}

        .oi-steps{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        .oi-step{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;
            border-radius:8px;border:1.5px solid #e2e8f0;background:#fafbfc;transition:all .3s}
        .oi-step.running{border-color:#3b82f6;background:#eff6ff}
        .oi-step.success{border-color:#38a169;background:#f0fff4}
        .oi-step.error{border-color:#e53e3e;background:#fff5f5}
        .oi-step.pending{opacity:.4}
        .oi-step-icon{font-size:1rem;width:20px;text-align:center;flex-shrink:0}
        .oi-step-text{font-size:0.82rem;font-weight:600;color:#1a1a2e}
        .oi-step-sub{font-size:0.72rem;color:#888;margin-top:1px}
        .oi-mini-spinner{display:inline-block;width:12px;height:12px;border:2px solid #ccc;
            border-top-color:#3b82f6;border-radius:50%;animation:oispin .7s linear infinite}
    </style>

    <!-- Conn badge -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:1.1rem;font-weight:700;color:#1a1a2e">📬 Orders Inbox</span>
        <button class="oi-refresh-btn" id="oiConnBtn" onclick="oiConnectExact()">
            <span id="oiConnLabel">● Verbind met Exact Online</span>
        </button>
    </div>

    <div class="oi-layout">
        <!-- Left: order list -->
        <div class="oi-panel">
            <div class="oi-toolbar">
                <span class="oi-toolbar-title">Inkomende orders</span>
                <button class="oi-refresh-btn" onclick="oiRefresh()">↻ Vernieuwen</button>
            </div>
            <div class="oi-filters">
                <button class="oi-filter-btn active" data-filter="alle" onclick="oiSetFilter(this,'alle')">Alle</button>
                <button class="oi-filter-btn" data-filter="nieuw" onclick="oiSetFilter(this,'nieuw')">🔵 Nieuw</button>
                <button class="oi-filter-btn" data-filter="review" onclick="oiSetFilter(this,'review')">🟡 Review</button>
                <button class="oi-filter-btn" data-filter="geboekt" onclick="oiSetFilter(this,'geboekt')">🟢 Geboekt</button>
                <button class="oi-filter-btn" data-filter="afgewezen" onclick="oiSetFilter(this,'afgewezen')">🔴 Afgewezen</button>
            </div>
            <div id="oiOrderList" class="oi-order-list">
                <div class="oi-loading"><div class="oi-spinner"></div></div>
            </div>
        </div>

        <!-- Right: detail panel -->
        <div class="oi-panel" id="oiDetailPanel">
            <div class="oi-detail-empty">
                <span class="oi-detail-empty-icon">📋</span>
                <span>Selecteer een order om te bekijken</span>
            </div>
        </div>
    </div>`;
}

// ── Attach event listeners ────────────────────────────────────────────────────
function attachListeners() {
    window.oiConnectExact = oiConnectExact;
    window.oiRefresh = oiRefresh;
    window.oiSetFilter = oiSetFilter;
    window.oiSelectOrder = oiSelectOrder;
    window.oiMatchCustomer = oiMatchCustomer;
    window.oiBookInExact = oiBookInExact;
    window.oiRejectOrder = oiRejectOrder;
    window.oiUpdateQty = oiUpdateQty;
    window.oiRetryMatch = oiRetryMatch;
    updateConnStatus();
}

// ── Render order list ─────────────────────────────────────────────────────────
function renderOrderList() {
    const el = document.getElementById('oiOrderList');
    if (!el) return;
    const filtered = statusFilter === 'alle'
        ? allOrders
        : allOrders.filter(o => o.status === statusFilter);

    if (filtered.length === 0) {
        el.innerHTML = `<div class="oi-empty">Geen orders gevonden</div>`;
        return;
    }

    el.innerHTML = filtered
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(order => {
            const conf = order.parsed?.confidence || 0;
            const confClass = conf >= 0.9 ? 'high' : conf >= 0.7 ? 'med' : 'low';
            const timeAgo = formatTimeAgo(order.timestamp);
            const isSelected = selectedOrder?.id === order.id;
            return `
            <div class="oi-order-row${isSelected ? ' selected' : ''}" onclick="oiSelectOrder('${order.id}')">
                <div class="oi-order-row-top">
                    <span class="oi-order-company">${order.parsed?.customer?.company || order.email?.from || 'Onbekend'}</span>
                    <span class="oi-order-time">${timeAgo}</span>
                </div>
                <div class="oi-order-subject">${order.email?.subject || '(geen onderwerp)'}</div>
                <div class="oi-order-meta">
                    <span class="oi-badge ${order.status}">${order.status}</span>
                    <span class="oi-conf ${confClass}">${Math.round(conf * 100)}% zeker</span>
                    <span style="font-size:.7rem;color:#aaa">${order.parsed?.lines?.length || 0} regels</span>
                </div>
            </div>`;
        }).join('');
}

// ── Select and show order detail ──────────────────────────────────────────────
function oiSelectOrder(id) {
    selectedOrder = allOrders.find(o => o.id === id) || null;
    renderOrderList();
    renderDetail();
}

function renderDetail() {
    const panel = document.getElementById('oiDetailPanel');
    if (!panel || !selectedOrder) return;

    const o = selectedOrder;
    const p = o.parsed;
    const totalBoxes = (p?.lines || []).reduce((s, l) => s + l.quantity, 0);
    const useDHL = totalBoxes <= DHL_THRESHOLD;
    const isBooked = o.status === 'geboekt';
    const isRejected = o.status === 'afgewezen';
    const lowConf = (p?.confidence || 0) < 0.9;

    panel.innerHTML = `
        <div class="oi-detail-header">
            <span class="oi-detail-title">${p?.customer?.company || 'Onbekende klant'}</span>
            <span class="oi-badge ${o.status}">${o.status}</span>
        </div>
        <div class="oi-detail-body">

            ${lowConf && !isBooked ? `
            <div class="oi-conf-warn">
                ⚠️ <strong>Lage zekerheid (${Math.round((p?.confidence||0)*100)}%)</strong> — controleer alle velden zorgvuldig voor het boeken.
                ${p?.notes ? `<br><em>${p.notes}</em>` : ''}
            </div>` : ''}

            ${isBooked ? `
            <div class="oi-booked-banner">
                ✅ Order geboekt in Exact Online<br>
                <span style="font-weight:400;font-size:.82rem">Order ID: ${o.exactOrderId || '—'}</span>
            </div>` : ''}

            <!-- Customer -->
            <p class="oi-section-label" style="margin-top:${isBooked?'14px':'0'}">Klantgegevens</p>
            <div class="oi-info-grid">
                <div class="oi-info-item">
                    <div class="oi-info-label">Bedrijfsnaam</div>
                    <input class="oi-info-input" id="oiFieldCompany" value="${p?.customer?.company||''}" ${isBooked?'disabled':''}>
                </div>
                <div class="oi-info-item">
                    <div class="oi-info-label">Contactpersoon</div>
                    <input class="oi-info-input" id="oiFieldContact" value="${p?.customer?.contact||''}" ${isBooked?'disabled':''}>
                </div>
                <div class="oi-info-item">
                    <div class="oi-info-label">E-mail</div>
                    <input class="oi-info-input" id="oiFieldEmail" value="${p?.customer?.email||''}" ${isBooked?'disabled':''}>
                </div>
                <div class="oi-info-item">
                    <div class="oi-info-label">Telefoon</div>
                    <input class="oi-info-input" id="oiFieldPhone" value="${p?.customer?.phone||''}" ${isBooked?'disabled':''}>
                </div>
                <div class="oi-info-item" style="grid-column:1/-1">
                    <div class="oi-info-label">Afleveradres</div>
                    <input class="oi-info-input" id="oiFieldAddress" value="${p?.customer?.address||''}" ${isBooked?'disabled':''}>
                </div>
            </div>

            <!-- Customer match -->
            <div id="oiMatchResult">${renderMatchResult(o)}</div>

            <!-- Order lines -->
            <p class="oi-section-label">Orderregels</p>
            <table class="oi-items-table">
                <thead><tr>
                    <th>Artikelcode</th><th>Omschrijving</th><th style="text-align:center">Dozen</th>
                </tr></thead>
                <tbody>
                    ${(p?.lines||[]).map((line, i) => `
                    <tr>
                        <td><span class="oi-code">${line.code||'?'}</span></td>
                        <td>${line.description||''}</td>
                        <td style="text-align:center">
                            ${isBooked
                                ? `<strong>${line.quantity}</strong>`
                                : `<input class="oi-qty-input" type="number" min="1" value="${line.quantity}" onchange="oiUpdateQty(${i},this.value)">`
                            }
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="oi-total-row">
                <span class="oi-total-label">Totaal dozen</span>
                <span class="oi-total-val" id="oiTotalBoxes">${totalBoxes}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                <span style="font-size:.72rem;font-weight:700;color:#999;text-transform:uppercase">Verzendmethode:</span>
                <span class="oi-ship-badge ${useDHL?'dhl':'pallet'}">${useDHL?'📦 DHL':'🚛 Pallet (De Vries)'}</span>
            </div>

            <!-- Processing steps (shown while booking) -->
            <div id="oiStepsSection" style="display:none;margin-top:14px">
                <p class="oi-section-label">Verwerking</p>
                <div class="oi-steps">
                    ${['customer','order','shipping','confirm'].map(id => `
                    <div class="oi-step pending" id="oi-step-${id}">
                        <span class="oi-step-icon">⏳</span>
                        <div>
                            <div class="oi-step-text">${stepLabel(id)}</div>
                            <div class="oi-step-sub" id="oi-step-${id}-sub">Wacht op start...</div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- Action buttons -->
            ${!isBooked && !isRejected ? `
            <div class="oi-action-row">
                <button class="oi-btn oi-btn-success" id="oiBookBtn" onclick="oiBookInExact()">
                    Boek in Exact Online →
                </button>
                <button class="oi-btn oi-btn-danger oi-btn-sm" onclick="oiRejectOrder()">
                    Afwijzen
                </button>
            </div>` : ''}

        </div>`;
}

function stepLabel(id) {
    return { customer: 'Klant opzoeken', order: 'Order aanmaken', shipping: 'Verzendmethode', confirm: 'BEVESTIGD — EDI naar De Vries' }[id];
}

function renderMatchResult(order) {
    if (order.exactAccountId) {
        return `<div class="oi-customer-match found">
            <div class="oi-match-title">✅ Klant gevonden in Exact Online</div>
            <div style="font-size:.78rem">Account ID: ${order.exactAccountId}</div>
        </div>`;
    }
    if (order.status === 'geboekt') return '';
    return `<div class="oi-customer-match notfound" id="oiMatchBox">
        <div class="oi-match-title">⚠️ Klant nog niet gematched</div>
        <div style="font-size:.78rem;margin-bottom:8px">Klik om klant op te zoeken in Exact Online. Bestaat de klant nog niet? Maak hem eerst handmatig aan in Exact, dan opnieuw proberen.</div>
        <button class="oi-btn oi-btn-primary oi-btn-sm" onclick="oiMatchCustomer()">Klant opzoeken in Exact</button>
    </div>`;
}

// ── Customer matching ─────────────────────────────────────────────────────────
async function oiMatchCustomer() {
    if (!accessToken) { alert('Verbind eerst met Exact Online.'); return; }
    const email = document.getElementById('oiFieldEmail')?.value;
    const company = document.getElementById('oiFieldCompany')?.value;
    const box = document.getElementById('oiMatchBox');
    if (box) box.innerHTML = `<div class="oi-match-title"><div class="oi-mini-spinner"></div> Klant zoeken...</div>`;

    try {
        let accountId = null;

        // Try by email first
        if (email) {
            const enc = encodeURIComponent(`Email eq '${email}'`);
            const d = await exactAPI('GET', `crm/Accounts?$filter=${enc}&$select=ID,Name,Email`);
            accountId = d?.d?.results?.[0]?.ID || null;
        }
        // Fallback: name search
        if (!accountId && company) {
            const enc = encodeURIComponent(`substringof('${company.replace(/'/g,"''")}',Name)`);
            const d = await exactAPI('GET', `crm/Accounts?$filter=${enc}&$select=ID,Name`);
            accountId = d?.d?.results?.[0]?.ID || null;
        }

        if (accountId) {
            selectedOrder.exactAccountId = accountId;
            document.getElementById('oiMatchResult').innerHTML = renderMatchResult(selectedOrder);
        } else {
            if (box) box.innerHTML = `
                <div class="oi-customer-match notfound">
                    <div class="oi-match-title">❌ Klant niet gevonden in Exact Online</div>
                    <div style="font-size:.78rem;margin-bottom:8px">Maak de klant eerst handmatig aan in Exact Online, dan opnieuw proberen.</div>
                    <button class="oi-btn oi-btn-primary oi-btn-sm" onclick="oiRetryMatch()">↻ Opnieuw proberen</button>
                </div>`;
        }
    } catch (err) {
        if (box) box.innerHTML = `
            <div class="oi-customer-match notfound">
                <div class="oi-match-title">❌ Fout bij opzoeken: ${err.message}</div>
                <button class="oi-btn oi-btn-primary oi-btn-sm" onclick="oiRetryMatch()" style="margin-top:8px">↻ Opnieuw proberen</button>
            </div>`;
    }
}

function oiRetryMatch() { oiMatchCustomer(); }

// ── Book in Exact ─────────────────────────────────────────────────────────────
async function oiBookInExact() {
    if (!accessToken) { alert('Verbind eerst met Exact Online (knop rechtsboven).'); return; }
    if (!selectedOrder?.exactAccountId) {
        alert('Zoek eerst de klant op in Exact Online (zie hierboven).'); return; }

    const lines = selectedOrder.parsed?.lines || [];
    if (!lines.length) { alert('Geen orderregels gevonden.'); return; }

    const totalBoxes = lines.reduce((s, l) => s + l.quantity, 0);
    const useDHL = totalBoxes <= DHL_THRESHOLD;

    document.getElementById('oiBookBtn')?.setAttribute('disabled', 'true');
    document.getElementById('oiStepsSection').style.display = '';

    try {
        // Step 1 – Customer (already matched)
        oiSetStep('customer', 'success', `Klant gevonden (ID: ${selectedOrder.exactAccountId})`);

        // Step 2 – Create order
        oiSetStep('order', 'running', 'Order aanmaken...');
        const orderId = await createSalesOrder(selectedOrder.exactAccountId, lines, selectedOrder.parsed);
        oiSetStep('order', 'success', `Order aangemaakt`);

        // Step 3 – Shipping
        oiSetStep('shipping', 'running', useDHL ? 'DHL instellen...' : 'Pallet — methode leeg laten...');
        await setShippingMethod(orderId, useDHL);
        oiSetStep('shipping', 'success', useDHL ? '📦 DHL ingesteld' : '🚛 Pallet via De Vries');

        // Step 4 – Confirm
        oiSetStep('confirm', 'running', 'BEVESTIGD instellen...');
        await confirmOrder(orderId);
        oiSetStep('confirm', 'success', 'BEVESTIGD — EDI naar De Vries verzonden');

        // Update order status
        selectedOrder.status = 'geboekt';
        selectedOrder.exactOrderId = orderId;
        const idx = allOrders.findIndex(o => o.id === selectedOrder.id);
        if (idx !== -1) allOrders[idx] = selectedOrder;
        renderOrderList();
        setTimeout(() => renderDetail(), 600);

    } catch (err) {
        ['customer','order','shipping','confirm'].forEach(id => {
            if (document.getElementById(`oi-step-${id}`)?.classList.contains('running'))
                oiSetStep(id, 'error', err.message);
        });
        document.getElementById('oiBookBtn')?.removeAttribute('disabled');
    }
}

function oiSetStep(id, status, sub) {
    const el = document.getElementById(`oi-step-${id}`);
    const subEl = document.getElementById(`oi-step-${id}-sub`);
    if (!el) return;
    el.className = `oi-step ${status}`;
    const icon = el.querySelector('.oi-step-icon');
    if (icon) {
        if (status === 'running') icon.innerHTML = '<div class="oi-mini-spinner"></div>';
        else if (status === 'success') icon.textContent = '✅';
        else if (status === 'error') icon.textContent = '❌';
        else icon.textContent = '⏳';
    }
    if (subEl) subEl.textContent = sub;
}

// ── Reject order ──────────────────────────────────────────────────────────────
function oiRejectOrder() {
    if (!confirm('Weet je zeker dat je deze order wilt afwijzen?')) return;
    selectedOrder.status = 'afgewezen';
    const idx = allOrders.findIndex(o => o.id === selectedOrder.id);
    if (idx !== -1) allOrders[idx] = selectedOrder;
    renderOrderList();
    renderDetail();
}

// ── Update quantity ───────────────────────────────────────────────────────────
function oiUpdateQty(i, val) {
    if (!selectedOrder?.parsed?.lines) return;
    selectedOrder.parsed.lines[i].quantity = parseInt(val) || 1;
    const total = selectedOrder.parsed.lines.reduce((s, l) => s + l.quantity, 0);
    const el = document.getElementById('oiTotalBoxes');
    if (el) el.textContent = total;
}

// ── Filter ────────────────────────────────────────────────────────────────────
function oiSetFilter(btn, filter) {
    document.querySelectorAll('.oi-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statusFilter = filter;
    renderOrderList();
}

function oiRefresh() { loadOrders(); }

// ── Exact Online API ──────────────────────────────────────────────────────────
function updateConnStatus() {
    const btn = document.getElementById('oiConnBtn');
    const lbl = document.getElementById('oiConnLabel');
    if (!btn) return;
    if (accessToken) {
        btn.style.color = '#38a169'; btn.style.borderColor = '#9ae6b4';
        lbl.textContent = '✓ Verbonden met Exact';
    } else {
        btn.style.color = '#e53e3e';
        lbl.textContent = '● Verbind met Exact Online';
    }
}

function oiConnectExact() {
    // Reuse token from order verwerking tab if set
    accessToken = sessionStorage.getItem('exact_access_token');
    refreshTokenVal = sessionStorage.getItem('exact_refresh_token');
    if (accessToken) { updateConnStatus(); return; }
    alert('Verbind eerst via de "📦 Order Verwerking" tab met Exact Online. De verbinding wordt automatisch gedeeld.');
}

async function exactAPI(method, endpoint, payload) {
    const r = await fetch(PROXY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'api', method, endpoint, payload, access_token: accessToken }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`Exact API (${r.status}): ${JSON.stringify(data)}`);
    return data;
}

async function createSalesOrder(accountId, lines, parsed) {
    const orderLines = [];
    for (const line of lines) {
        if (!line.code) continue;
        const enc = encodeURIComponent(`Code eq '${line.code}'`);
        const d = await exactAPI('GET', `logistics/Items?$filter=${enc}&$select=ID,Code`);
        const item = d?.d?.results?.[0];
        if (!item) throw new Error(`Artikel ${line.code} niet gevonden`);
        orderLines.push({ Item: item.ID, Quantity: line.quantity });
    }
    const payload = {
        OrderedBy: accountId,
        DeliverTo: accountId,
        SalesOrderLines: orderLines,
    };
    if (parsed?.deliveryDate) payload.DeliveryDate = parsed.deliveryDate;
    if (parsed?.orderReference) payload.YourRef = parsed.orderReference;
    const d = await exactAPI('POST', 'salesorder/SalesOrders', payload);
    return d?.d?.OrderID;
}

async function setShippingMethod(orderId, useDHL) {
    if (!useDHL) return;
    try {
        const enc = encodeURIComponent(`substringof('DHL',Description)`);
        const d = await exactAPI('GET', `logistics/DeliveryMethods?$filter=${enc}&$select=ID`);
        const dhl = d?.d?.results?.[0];
        if (dhl) await exactAPI('PUT', `salesorder/SalesOrders(guid'${orderId}')`, { DeliveryMethod: dhl.ID });
    } catch {
        // Niet-kritiek: order is aangemaakt, leveringswijze handmatig instellen in Exact
        console.warn('DHL leveringswijze kon niet worden ingesteld — sla over');
    }
}

async function confirmOrder(orderId) {
    try {
        await exactAPI('PUT', `salesorder/SalesOrders(guid'${orderId}')`, { Status: 20 });
    } catch {
        // Niet-kritiek: order staat al in Exact, status handmatig vrijgeven indien nodig
        console.warn('Status 20 kon niet worden ingesteld — sla over');
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setLoading(on) {
    const el = document.getElementById('oiOrderList');
    if (on && el) el.innerHTML = `<div class="oi-loading"><div class="oi-spinner"></div></div>`;
}

function formatTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'zojuist';
    if (m < 60) return `${m}m geleden`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}u geleden`;
    return `${Math.floor(h / 24)}d geleden`;
}
