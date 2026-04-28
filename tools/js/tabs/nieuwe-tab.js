// === NIEUWE TAB — Order Verwerking via Exact Online ===
//
// Stap 1: Upload order bevestiging (PDF)
// Stap 2: PDF wordt automatisch verwerkt — klant + artikelen worden uitgelezen
// Stap 3: Verwerk automatisch in Exact Online:
//         - Klant opzoeken / aanmaken
//         - Order aanmaken met artikelcodes + aantallen
//         - Verzendmethode: DHL (≤15 dozen) of Pallet (>15 dozen)
//         - Status: BEVESTIGD → EDI naar De Vries gaat automatisch

// ── Config ───────────────────────────────────────────────────────────────────
const PROXY_URL = '/.netlify/functions/exact-proxy';
const EXACT_CLIENT_ID = '8e38bdaf-052a-4d2d-bd0a-10b8d9f47e90'; // Test app — productie via env vars
const EXACT_REDIRECT_URI = window.location.origin + window.location.pathname;
const DHL_THRESHOLD = 15;       // ≤ deze waarde = DHL, anders Pallet
const DEFAULT_GLN = '8713700000000'; // Standaard GLN voor kleine klanten (De Vries EDI)

// ── State ─────────────────────────────────────────────────────────────────────
let parsedOrder = null;
let accessToken = null;
let refreshTokenVal = null;
let demoMode = false;

// ── Demo Mode — simulates Exact Online API without real credentials ───────────
const DEMO_DELAY = ms => new Promise(r => setTimeout(r, ms));
const DEMO_ORDER = {
    company: 'AI Test',
    contact: 'Claude Test',
    email: 'operations@johnnycashew.com',
    phone: '+31612345678',
    address: 'Johan Huizingalaan 763 Amsterdam 1066VH NL',
    lines: [
        { code: '1002036', description: 'Johnny Cashew Roasted & Salted 25g (12 x 25 gr)', quantity: 1 },
        { code: '1002053', description: 'Johnny Cashew Milk Chocolate Honey Sea Salt 100g (8 x 100 gr)', quantity: 1 },
        { code: '1002060', description: 'Johnny Cashew Thai Sweet Chilli 100g (8 x 100 gr)', quantity: 1 },
        { code: '1002061', description: 'Johnny Cashew Cinnamon Bun 100g (8 x 100 gr)', quantity: 1 },
    ],
};
async function demoProcessOrder(order) {
    const totalBoxes = order.lines.reduce((s, l) => s + l.quantity, 0);
    const useDHL = totalBoxes <= DHL_THRESHOLD;

    // Step 1 – customer lookup (not found → create)
    setStep('customer', 'running', 'Klant opzoeken in Exact Online...');
    await DEMO_DELAY(1200);
    setStep('customer', 'running', 'Niet gevonden — nieuwe klant aanmaken...');
    await DEMO_DELAY(1000);
    setStep('customer', 'success', `Nieuwe klant aangemaakt (DEMO-ID: ACC-00421)`);

    // Step 2 – create order
    setStep('order', 'running', 'Order aanmaken met artikelen...');
    await DEMO_DELAY(1400);
    setStep('order', 'success', `Order aangemaakt (DEMO-ID: SO-20260420-088)`);

    // Step 3 – shipping
    setStep('shipping', 'running', useDHL ? 'DHL instellen...' : 'Pallet — verzendmethode leeg laten...');
    await DEMO_DELAY(900);
    setStep('shipping', 'success', useDHL ? '📦 DHL ingesteld' : '🚛 Pallet via De Vries (methode blanco)');

    // Step 4 – confirm
    setStep('confirm', 'running', 'Status BEVESTIGD instellen...');
    await DEMO_DELAY(1100);
    setStep('confirm', 'success', 'BEVESTIGD — EDI wordt verzonden naar De Vries');

    showResult(true, '✅ [DEMO] Order succesvol verwerkt — geen echte data gewijzigd!');
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function renderNieuweTab() {
    const container = document.getElementById('nieuweTabContent');
    if (!container) return;

    // Handle OAuth redirect (code in URL after Exact Online login)
    const urlParams = new URLSearchParams(window.location.search);
    const oauthCode = urlParams.get('code');
    if (oauthCode) {
        history.replaceState({}, '', window.location.pathname);
        handleOAuthCallback(oauthCode);
    }

    // Restore saved token from session
    accessToken = sessionStorage.getItem('exact_access_token');
    refreshTokenVal = sessionStorage.getItem('exact_refresh_token');

    container.innerHTML = buildUI();
    attachEventListeners();
    updateConnectionStatus();
}

// ── UI ────────────────────────────────────────────────────────────────────────
function buildUI() {
    return `
    <style>
        .ot-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .ot-title{font-size:1.25rem;font-weight:700;color:#1a1a2e}
        .ot-conn-badge{display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:600;
            padding:5px 14px;border-radius:20px;border:1.5px solid #e2e8f0;background:#f8fafc;cursor:pointer;transition:all .2s}
        .ot-conn-badge.connected{border-color:#38a169;color:#38a169;background:#f0fff4}
        .ot-conn-badge.disconnected{border-color:#e53e3e;color:#e53e3e;background:#fff5f5}
        .ot-conn-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex-shrink:0}

        .ot-cred-info{background:#fffbeb;border:1.5px solid #f6e05e;border-radius:10px;
            padding:14px 18px;font-size:0.82rem;color:#744210;margin-bottom:16px}
        .ot-cred-info strong{display:block;margin-bottom:6px;font-size:0.88rem}
        .ot-cred-info ol{margin:0;padding-left:18px;line-height:1.9}
        .ot-cred-info code{background:#fef08a;padding:1px 5px;border-radius:4px;font-size:0.8rem}

        .ot-upload-area{border:2.5px dashed #cbd5e0;border-radius:12px;padding:40px 20px;
            text-align:center;cursor:pointer;transition:all .2s;background:#fafbff}
        .ot-upload-area:hover,.ot-upload-area.drag-over{border-color:#0f3460;background:#eef2ff}
        .ot-upload-icon{font-size:2.5rem;margin-bottom:10px}
        .ot-upload-title{font-weight:700;color:#1a1a2e;margin-bottom:4px}
        .ot-upload-sub{font-size:0.82rem;color:#888}

        .ot-section-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;
            letter-spacing:0.8px;color:#999;margin:0 0 10px}
        .ot-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px}
        .ot-info-item{background:#f8fafc;border-radius:8px;padding:10px 14px}
        .ot-info-label{font-size:0.68rem;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:3px}
        .ot-info-input{width:100%;border:none;background:transparent;font-size:0.9rem;
            font-weight:600;color:#1a1a2e;outline:none;font-family:inherit}
        .ot-info-input:focus{border-bottom:1.5px solid #0f3460}

        .ot-items-table{width:100%;border-collapse:collapse;font-size:0.85rem}
        .ot-items-table th{text-align:left;padding:7px 10px;background:#f1f5f9;
            font-size:0.68rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;font-weight:700}
        .ot-items-table td{padding:9px 10px;border-bottom:1px solid #f1f5f9;color:#333}
        .ot-items-table tr:last-child td{border-bottom:none}
        .ot-code{font-family:monospace;font-size:0.8rem;color:#0f3460;font-weight:700}
        .ot-qty-input{width:58px;border:1.5px solid #e2e8f0;border-radius:6px;padding:3px 6px;
            text-align:center;font-size:0.85rem;font-weight:700;font-family:inherit}

        .ot-total-row{display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;background:#f8fafc;border-radius:8px;margin-top:10px}
        .ot-total-label{font-size:0.78rem;font-weight:700;color:#555;text-transform:uppercase}
        .ot-total-val{font-size:1rem;font-weight:800;color:#0f3460}

        .ot-ship-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
            border-radius:20px;font-size:0.82rem;font-weight:700}
        .ot-ship-badge.dhl{background:#ffecb3;color:#b45309}
        .ot-ship-badge.pallet{background:#e0f2fe;color:#0369a1}

        .ot-btn{padding:10px 26px;border:none;border-radius:8px;font-size:0.9rem;
            font-weight:700;cursor:pointer;transition:all .15s}
        .ot-btn-primary{background:#0f3460;color:#fff}
        .ot-btn-primary:hover:not(:disabled){background:#1a4a8a}
        .ot-btn-primary:disabled{opacity:0.4;cursor:not-allowed}

        .ot-steps{display:flex;flex-direction:column;gap:8px}
        .ot-step{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;
            border-radius:10px;border:1.5px solid #e2e8f0;background:#fafbfc;transition:all .3s}
        .ot-step.pending{opacity:0.45}
        .ot-step.running{border-color:#3b82f6;background:#eff6ff}
        .ot-step.success{border-color:#38a169;background:#f0fff4}
        .ot-step.error{border-color:#e53e3e;background:#fff5f5}
        .ot-step-icon{font-size:1.1rem;width:22px;text-align:center;flex-shrink:0;margin-top:1px}
        .ot-step-text{font-size:0.87rem;font-weight:600;color:#1a1a2e}
        .ot-step-sub{font-size:0.75rem;color:#888;margin-top:2px}

        .ot-spinner{display:inline-block;width:14px;height:14px;border:2px solid #ccc;
            border-top-color:#3b82f6;border-radius:50%;animation:otspin .7s linear infinite}
        @keyframes otspin{to{transform:rotate(360deg)}}

        .ot-result{padding:16px 20px;border-radius:10px;font-weight:700;font-size:0.95rem;
            text-align:center;margin-top:16px}
        .ot-result.success{background:#f0fff4;color:#276749;border:1.5px solid #9ae6b4}
        .ot-result.error{background:#fff5f5;color:#c53030;border:1.5px solid #feb2b2}

        .ot-fade{animation:otfade .35s ease}
        @keyframes otfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    </style>

    <!-- Demo Mode banner -->
    <div id="otDemoBanner" style="display:none;background:#ede9fe;border:1.5px solid #a78bfa;border-radius:10px;
        padding:10px 16px;margin-bottom:14px;align-items:center;justify-content:space-between;gap:12px">
        <span style="font-size:0.82rem;font-weight:700;color:#5b21b6">
            🧪 DEMO MODUS — Geen echte Exact Online koppeling. Alles is nep, je kunt veilig klikken!
        </span>
        <button onclick="otToggleDemo()" style="font-size:0.75rem;font-weight:700;padding:4px 10px;
            border:1.5px solid #7c3aed;border-radius:6px;background:#fff;color:#7c3aed;cursor:pointer">
            Demo uitzetten
        </button>
    </div>

    <!-- Header -->
    <div class="ot-header">
        <span class="ot-title">📦 Order Verwerking — Exact Online</span>
        <div style="display:flex;gap:8px;align-items:center">
            <button onclick="otToggleDemo()" id="otDemoBtn"
                style="font-size:0.78rem;font-weight:700;padding:5px 12px;border-radius:20px;
                border:1.5px solid #a78bfa;background:#ede9fe;color:#5b21b6;cursor:pointer">
                🧪 Demo modus
            </button>
            <button class="ot-conn-badge disconnected" id="otConnBtn" onclick="otConnectExact()">
                <span class="ot-conn-dot"></span>
                <span id="otConnLabel">Verbind met Exact Online</span>
            </button>
        </div>
    </div>

    <!-- Setup instructions (hidden once connected or in demo mode) -->
    <div id="otCredInfo" class="ot-cred-info">
        <strong>⚙️ Eenmalige instelling — Exact Online koppeling</strong>
        <ol>
            <li>Ga naar <strong>apps.exactonline.com</strong> → jouw app → kopieer <em>Client ID</em> &amp; <em>Client Secret</em></li>
            <li>Open <strong>Netlify Dashboard → Site settings → Environment variables</strong> en voeg toe:<br>
                <code>EXACT_CLIENT_ID</code> &nbsp;·&nbsp; <code>EXACT_CLIENT_SECRET</code> &nbsp;·&nbsp; <code>EXACT_DIVISION</code> &nbsp;·&nbsp; <code>EXACT_REDIRECT_URI</code></li>
            <li>Plak jouw <em>Client ID</em> ook in de code: <code>nieuwe-tab.js</code> regel 12 (<code>EXACT_CLIENT_ID = '...'</code>)</li>
            <li>Klik op <strong>"Verbind met Exact Online"</strong> hierboven → log in → klaar!</li>
        </ol>
    </div>

    <!-- Step 1: Upload -->
    <div class="card">
        <p class="ot-section-label">Stap 1 — Upload order bevestiging (PDF)</p>
        <div class="ot-upload-area" id="otUploadArea" onclick="document.getElementById('otFileInput').click()">
            <div class="ot-upload-icon">📄</div>
            <div class="ot-upload-title">Sleep PDF hiernaartoe of klik om te selecteren</div>
            <div class="ot-upload-sub">Order bevestiging van het Johnny Cashew portaal</div>
        </div>
        <input type="file" id="otFileInput" accept=".pdf" style="display:none">
    </div>

    <!-- Step 2 + 3: Preview + Process (hidden until PDF loaded) -->
    <div id="otPreviewSection" style="display:none" class="ot-fade">

        <!-- Customer -->
        <div class="card">
            <p class="ot-section-label">Stap 2 — Controleer klantgegevens</p>
            <div class="ot-info-grid">
                <div class="ot-info-item">
                    <div class="ot-info-label">Bedrijfsnaam</div>
                    <input class="ot-info-input" id="otFieldCompany" type="text" placeholder="Bedrijfsnaam">
                </div>
                <div class="ot-info-item">
                    <div class="ot-info-label">Contactpersoon</div>
                    <input class="ot-info-input" id="otFieldContact" type="text" placeholder="Naam">
                </div>
                <div class="ot-info-item">
                    <div class="ot-info-label">E-mail</div>
                    <input class="ot-info-input" id="otFieldEmail" type="text" placeholder="email@voorbeeld.nl">
                </div>
                <div class="ot-info-item">
                    <div class="ot-info-label">Telefoon</div>
                    <input class="ot-info-input" id="otFieldPhone" type="text" placeholder="+31...">
                </div>
                <div class="ot-info-item" style="grid-column:1/-1">
                    <div class="ot-info-label">Afleveradres</div>
                    <input class="ot-info-input" id="otFieldAddress" type="text" placeholder="Straat 1, 1234AB Stad, NL">
                </div>
            </div>
        </div>

        <!-- Order lines -->
        <div class="card">
            <p class="ot-section-label">Orderregels</p>
            <table class="ot-items-table">
                <thead>
                    <tr>
                        <th>Artikelcode</th>
                        <th>Omschrijving</th>
                        <th style="text-align:center">Dozen</th>
                    </tr>
                </thead>
                <tbody id="otItemsBody"></tbody>
            </table>
            <div class="ot-total-row">
                <span class="ot-total-label">Totaal dozen</span>
                <span class="ot-total-val" id="otTotalBoxes">0</span>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
                <span class="ot-section-label" style="margin:0">Verzendmethode:</span>
                <span class="ot-ship-badge dhl" id="otShipBadge">📦 DHL</span>
            </div>
        </div>

        <!-- Process button -->
        <div class="card" style="text-align:center;padding:24px">
            <button class="ot-btn ot-btn-primary" id="otProcessBtn" onclick="otProcessOrder()">
                Verwerk in Exact Online →
            </button>
            <div style="margin-top:8px;font-size:0.75rem;color:#aaa">
                Controleer de gegevens hierboven voor het verwerken
            </div>
        </div>

        <!-- Processing steps (shown after clicking process) -->
        <div id="otStepsSection" style="display:none" class="card ot-fade">
            <p class="ot-section-label">Verwerking</p>
            <div class="ot-steps">
                <div class="ot-step pending" id="step-customer">
                    <span class="ot-step-icon">👤</span>
                    <div><div class="ot-step-text">Klant opzoeken / aanmaken</div>
                    <div class="ot-step-sub" id="step-customer-sub">Wacht op start...</div></div>
                </div>
                <div class="ot-step pending" id="step-order">
                    <span class="ot-step-icon">🧾</span>
                    <div><div class="ot-step-text">Order aanmaken in Exact Online</div>
                    <div class="ot-step-sub" id="step-order-sub">Wacht op start...</div></div>
                </div>
                <div class="ot-step pending" id="step-shipping">
                    <span class="ot-step-icon">🚚</span>
                    <div><div class="ot-step-text">Verzendmethode instellen</div>
                    <div class="ot-step-sub" id="step-shipping-sub">Wacht op start...</div></div>
                </div>
                <div class="ot-step pending" id="step-confirm">
                    <span class="ot-step-icon">✅</span>
                    <div><div class="ot-step-text">BEVESTIGD — EDI naar De Vries</div>
                    <div class="ot-step-sub" id="step-confirm-sub">Wacht op start...</div></div>
                </div>
            </div>
            <div id="otResultBanner" style="display:none"></div>
        </div>

    </div>`;
}

// ── Event listeners ───────────────────────────────────────────────────────────
function attachEventListeners() {
    const fileInput = document.getElementById('otFileInput');
    const uploadArea = document.getElementById('otUploadArea');

    fileInput?.addEventListener('change', e => {
        if (e.target.files[0]) parsePDF(e.target.files[0]);
    });
    uploadArea?.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea?.addEventListener('drop', e => {
        e.preventDefault(); uploadArea.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f?.type === 'application/pdf') parsePDF(f);
    });

    window.otConnectExact = otConnectExact;
    window.otProcessOrder = otProcessOrder;
    window.otToggleDemo = otToggleDemo;
}

// ── Connection ────────────────────────────────────────────────────────────────
function otToggleDemo() {
    demoMode = !demoMode;
    const banner = document.getElementById('otDemoBanner');
    const btn = document.getElementById('otDemoBtn');
    const credInfo = document.getElementById('otCredInfo');
    const connBtn = document.getElementById('otConnBtn');

    if (demoMode) {
        if (banner) banner.style.display = 'flex';
        if (btn) { btn.style.background = '#7c3aed'; btn.style.color = '#fff'; btn.textContent = '🧪 Demo aan'; }
        if (credInfo) credInfo.style.display = 'none';
        if (connBtn) connBtn.style.opacity = '0.4';
        // Auto-fill with test order
        parsedOrder = JSON.parse(JSON.stringify(DEMO_ORDER));
        displayOrder(parsedOrder);
        // Reset steps/result
        document.getElementById('otStepsSection').style.display = 'none';
        document.getElementById('otResultBanner').style.display = 'none';
        document.getElementById('otProcessBtn').disabled = false;
        ['customer','order','shipping','confirm'].forEach(id => setStep(id, 'pending', 'Wacht op start...'));
    } else {
        if (banner) banner.style.display = 'none';
        if (btn) { btn.style.background = '#ede9fe'; btn.style.color = '#5b21b6'; btn.textContent = '🧪 Demo modus'; }
        if (connBtn) connBtn.style.opacity = '1';
        updateConnectionStatus();
        document.getElementById('otPreviewSection').style.display = 'none';
        parsedOrder = null;
    }
}

function updateConnectionStatus() {
    const btn = document.getElementById('otConnBtn');
    const lbl = document.getElementById('otConnLabel');
    const cred = document.getElementById('otCredInfo');
    if (!btn) return;
    if (accessToken) {
        btn.className = 'ot-conn-badge connected';
        lbl.textContent = 'Verbonden ✓';
        if (cred) cred.style.display = 'none';
    } else {
        btn.className = 'ot-conn-badge disconnected';
        lbl.textContent = 'Verbind met Exact Online';
        if (cred) cred.style.display = '';
    }
}

function otConnectExact() {
    if (accessToken) {
        sessionStorage.removeItem('exact_access_token');
        sessionStorage.removeItem('exact_refresh_token');
        accessToken = null; refreshTokenVal = null;
        updateConnectionStatus(); return;
    }
    if (!EXACT_CLIENT_ID) {
        alert('Vul eerst EXACT_CLIENT_ID in bij regel 12 van nieuwe-tab.js.\nZie de instructies op het scherm.'); return;
    }
    window.location.href =
        `https://start.exactonline.nl/api/oauth2/auth?client_id=${encodeURIComponent(EXACT_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(EXACT_REDIRECT_URI)}&response_type=code&force_login=0`;
}

async function handleOAuthCallback(code) {
    try {
        const res = await fetch(PROXY_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exchange_token', code }),
        });
        const d = await res.json();
        if (d.access_token) {
            accessToken = d.access_token; refreshTokenVal = d.refresh_token;
            sessionStorage.setItem('exact_access_token', accessToken);
            sessionStorage.setItem('exact_refresh_token', refreshTokenVal);
            updateConnectionStatus();
        } else { alert('Authenticatie mislukt: ' + JSON.stringify(d)); }
    } catch (e) { alert('Verbindingsfout: ' + e.message); }
}

// ── PDF Parsing ───────────────────────────────────────────────────────────────
async function parsePDF(file) {
    const area = document.getElementById('otUploadArea');
    area.innerHTML = `<div class="ot-spinner" style="margin:0 auto"></div><div style="margin-top:12px;font-size:0.85rem;color:#666">PDF verwerken...</div>`;

    try {
        const pdfjsLib = await loadPdfJs();
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(' ') + '\n';
        }
        parsedOrder = extractOrderData(text);
        displayOrder(parsedOrder);
        area.innerHTML = `<div style="color:#38a169;font-weight:700">✓ PDF geladen: ${file.name}</div>
            <div style="font-size:0.75rem;color:#888;margin-top:4px">Klik om een andere PDF te selecteren</div>`;
    } catch (err) {
        area.innerHTML = `<div class="ot-upload-icon">📄</div>
            <div style="color:#e53e3e;font-weight:700">Fout: ${err.message}</div>
            <div class="ot-upload-sub">Probeer opnieuw</div>`;
    }
}

async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            resolve(window.pdfjsLib);
        };
        s.onerror = () => reject(new Error('Kon PDF.js niet laden'));
        document.head.appendChild(s);
    });
}

function extractOrderData(text) {
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : '';

    const phoneMatch = text.match(/\+[\d\s\-()]{9,}/);
    const phone = phoneMatch ? phoneMatch[0].trim() : '';

    const addrMatch = text.match(/([A-Za-z][\w\s.]+\s+\d+[A-Za-z]?\s+[A-Za-z\s]+\s+\d{4}\s*[A-Z]{2}\s*(?:NL|BE|DE)?)/);
    const address = addrMatch ? addrMatch[0].replace(/\s+/g, ' ').trim() : '';

    let company = '', contact = '';
    const skip = ['johnny cashew', 'kvk', 'order', 'terms', 'quantity', 'bevestig', 'johan huizinga', 'bestellingen', '@', 'verkopen', 'www.'];
    for (const l of lines) {
        if (skip.some(s => l.toLowerCase().includes(s))) continue;
        if (l.match(/^\+?\d/) || l.match(/\d{4}\s*[A-Z]{2}/)) continue;
        if (l.length < 2 || l.length > 70) continue;
        if (!company) { company = l; continue; }
        if (!contact) { contact = l.replace(/\s{2,}/g, ' ').trim(); break; }
    }

    // Parse order lines: 7-digit code, description, quantity
    const orderLines = [];
    const re = /\b(\d{7})\b\s+(?:\d{7}\s+)?([^:]{5,80}?):\s*(\d+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const code = m[1], desc = m[2].trim().replace(/\s+/g, ' '), qty = parseInt(m[3], 10);
        if (!orderLines.find(o => o.code === code)) orderLines.push({ code, description: desc, quantity: qty });
    }

    return { company, contact, email, phone, address, lines: orderLines };
}

// ── Display order ─────────────────────────────────────────────────────────────
function displayOrder(order) {
    document.getElementById('otFieldCompany').value = order.company;
    document.getElementById('otFieldContact').value = order.contact;
    document.getElementById('otFieldEmail').value = order.email;
    document.getElementById('otFieldPhone').value = order.phone;
    document.getElementById('otFieldAddress').value = order.address;

    const tbody = document.getElementById('otItemsBody');
    tbody.innerHTML = order.lines.map((line, i) => `
        <tr>
            <td><span class="ot-code">${line.code}</span></td>
            <td>${line.description}</td>
            <td style="text-align:center">
                <input class="ot-qty-input" type="number" min="1" value="${line.quantity}"
                    onchange="otUpdateQty(${i},this.value)">
            </td>
        </tr>`).join('');

    window.otUpdateQty = (i, v) => { parsedOrder.lines[i].quantity = parseInt(v) || 1; refreshTotals(); };

    refreshTotals();
    document.getElementById('otPreviewSection').style.display = '';
    document.getElementById('otPreviewSection').classList.add('ot-fade');
}

function refreshTotals() {
    const total = (parsedOrder?.lines || []).reduce((s, l) => s + l.quantity, 0);
    const el = document.getElementById('otTotalBoxes');
    const badge = document.getElementById('otShipBadge');
    if (el) el.textContent = total;
    if (badge) {
        if (total <= DHL_THRESHOLD) { badge.className = 'ot-ship-badge dhl'; badge.textContent = '📦 DHL'; }
        else { badge.className = 'ot-ship-badge pallet'; badge.textContent = '🚛 Pallet (De Vries)'; }
    }
}

// ── Process order ─────────────────────────────────────────────────────────────
async function otProcessOrder() {
    if (!demoMode && !accessToken) { alert('Verbind eerst met Exact Online (knop rechtsboven).\n\nOf zet Demo modus aan om het proces te testen zonder echte koppeling.'); return; }
    if (!parsedOrder?.lines?.length) { alert('Geen orderregels gevonden.'); return; }

    const order = {
        company:  document.getElementById('otFieldCompany').value.trim(),
        contact:  document.getElementById('otFieldContact').value.trim(),
        email:    document.getElementById('otFieldEmail').value.trim(),
        phone:    document.getElementById('otFieldPhone').value.trim(),
        address:  document.getElementById('otFieldAddress').value.trim(),
        lines:    parsedOrder.lines,
    };
    const totalBoxes = order.lines.reduce((s, l) => s + l.quantity, 0);
    const useDHL = totalBoxes <= DHL_THRESHOLD;

    document.getElementById('otProcessBtn').disabled = true;
    document.getElementById('otStepsSection').style.display = '';

    // ── Demo mode: simulate everything ───────────────────────────────────────
    if (demoMode) { await demoProcessOrder(order); return; }

    try {
        // Step 1 – Customer
        setStep('customer', 'running', 'Klant opzoeken in Exact Online...');
        let accountId = await findAccount(order.company, order.email);
        if (!accountId) {
            setStep('customer', 'running', 'Niet gevonden — nieuwe klant aanmaken...');
            accountId = await createAccount(order);
            setStep('customer', 'success', 'Nieuwe klant aangemaakt');
        } else {
            setStep('customer', 'success', 'Klant gevonden in Exact Online');
        }

        // Step 2 – Sales order
        setStep('order', 'running', 'Order aanmaken...');
        const orderId = await createSalesOrder(accountId, order.lines);
        setStep('order', 'success', `Order aangemaakt`);

        // Step 3 – Shipping method
        setStep('shipping', 'running', useDHL ? 'DHL instellen...' : 'Pallet — verzendmethode leeg laten...');
        await setShippingMethod(orderId, useDHL);
        setStep('shipping', 'success', useDHL ? '📦 DHL ingesteld' : '🚛 Pallet via De Vries (methode blanco)');

        // Step 4 – Confirm
        setStep('confirm', 'running', 'Status BEVESTIGD instellen...');
        await confirmOrder(orderId);
        setStep('confirm', 'success', 'BEVESTIGD — EDI wordt verzonden naar De Vries');

        showResult(true, '✅ Order succesvol verwerkt in Exact Online!');
    } catch (err) {
        // Find which step was running and mark it as error
        ['customer','order','shipping','confirm'].forEach(id => {
            if (document.getElementById(`step-${id}`)?.classList.contains('running'))
                setStep(id, 'error', err.message);
        });
        showResult(false, `❌ Fout: ${err.message}`);
        document.getElementById('otProcessBtn').disabled = false;
    }
}

// ── Step helpers ──────────────────────────────────────────────────────────────
function setStep(id, status, sub) {
    const el = document.getElementById(`step-${id}`);
    const subEl = document.getElementById(`step-${id}-sub`);
    if (!el) return;
    el.className = `ot-step ${status}`;
    const icon = el.querySelector('.ot-step-icon');
    if (icon) {
        if (status === 'running') icon.innerHTML = '<div class="ot-spinner"></div>';
        else if (status === 'success') icon.textContent = '✅';
        else if (status === 'error') icon.textContent = '❌';
        else icon.textContent = '⏳';
    }
    if (subEl) subEl.textContent = sub;
}

function showResult(ok, msg) {
    const el = document.getElementById('otResultBanner');
    if (!el) return;
    el.className = `ot-result ${ok ? 'success' : 'error'}`;
    el.textContent = msg;
    el.style.display = '';
    el.scrollIntoView({ behavior: 'smooth' });
}

// ── Exact Online API ──────────────────────────────────────────────────────────
async function exactAPI(method, endpoint, payload) {
    let res = await callProxy(method, endpoint, payload);
    if (res.status === 401 && refreshTokenVal) {
        await doRefresh();
        res = await callProxy(method, endpoint, payload);
    }
    if (!res.ok) throw new Error(`Exact API (${res.status}): ${JSON.stringify(res.data)}`);
    return res.data;
}

async function callProxy(method, endpoint, payload) {
    const r = await fetch(PROXY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'api', method, endpoint, payload, access_token: accessToken }),
    });
    const data = await r.json();
    return { status: r.status, ok: r.ok, data };
}

async function doRefresh() {
    const r = await fetch(PROXY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh_token', refresh_token: refreshTokenVal }),
    });
    const d = await r.json();
    if (d.access_token) {
        accessToken = d.access_token; refreshTokenVal = d.refresh_token;
        sessionStorage.setItem('exact_access_token', accessToken);
        sessionStorage.setItem('exact_refresh_token', refreshTokenVal);
    }
}

async function findAccount(name, email) {
    const f = encodeURIComponent(`Name eq '${name.replace(/'/g, "''")}'`);
    const d = await exactAPI('GET', `crm/Accounts?$filter=${f}&$select=ID,Name`);
    if (d?.d?.results?.[0]) return d.d.results[0].ID;
    if (email) {
        const f2 = encodeURIComponent(`Email eq '${email}'`);
        const d2 = await exactAPI('GET', `crm/Accounts?$filter=${f2}&$select=ID,Email`);
        if (d2?.d?.results?.[0]) return d2.d.results[0].ID;
    }
    return null;
}

async function createAccount(order) {
    const addr = parseAddressStr(order.address);
    const d = await exactAPI('POST', 'crm/Accounts', {
        Name: order.company, Email: order.email, Phone: order.phone,
        AddressLine1: addr.street, City: addr.city, Postcode: addr.postcode,
        Country: addr.country || 'NL', GLN: DEFAULT_GLN,
    });
    return d?.d?.ID;
}

function parseAddressStr(s) {
    const pc = (s.match(/(\d{4}\s*[A-Z]{2})/) || [])[1]?.replace(/\s+/g, '') || '';
    const country = (s.match(/\b([A-Z]{2})\s*$/) || [])[1] || 'NL';
    const city = (s.match(/\d{4}\s*[A-Z]{2}\s+([A-Za-z\s]+?)(?:\s+[A-Z]{2})?$/) || [])[1]?.trim() || '';
    const street = s.split(/\d{4}/)[0].trim();
    return { street, city, postcode: pc, country };
}

async function createSalesOrder(accountId, lines) {
    const orderLines = [];
    for (const line of lines) {
        const enc = encodeURIComponent(`Code eq '${line.code}'`);
        const d = await exactAPI('GET', `logistics/Items?$filter=${enc}&$select=ID,Code`);
        const item = d?.d?.results?.[0];
        if (!item) throw new Error(`Artikel ${line.code} niet gevonden in Exact Online`);
        orderLines.push({ Item: item.ID, Quantity: line.quantity });
    }
    const d = await exactAPI('POST', 'salesorder/SalesOrders', {
        OrderedBy: accountId, DeliverTo: accountId,
        SalesOrderLines: { results: orderLines },
    });
    return d?.d?.OrderID;
}

async function setShippingMethod(orderId, useDHL) {
    if (!useDHL) return; // Pallet = blank, nothing to set
    const d = await exactAPI('GET', `logistics/DeliveryMethods?$filter=substringof('DHL',Description)&$select=ID`);
    const dhl = d?.d?.results?.[0];
    if (dhl) await exactAPI('PUT', `salesorder/SalesOrders(guid'${orderId}')`, { DeliveryMethod: dhl.ID });
}

async function confirmOrder(orderId) {
    await exactAPI('PUT', `salesorder/SalesOrders(guid'${orderId}')`, { Status: 20 });
}
