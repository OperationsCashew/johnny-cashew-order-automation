import { currentCategory, setCurrentCategory, pnlUnlocked, cfUnlockedState } from '../shared/state.js';
import { renderCOGSTab } from './cogs.js';
import { renderPnLTab, pnlCheckSession } from './pnl.js';
import { renderBalanceTab, balCheckSession } from './balance.js';
import { renderCashflowTab, cfCheckSession } from './cashflow.js';
import {
    cffCheckSession, cffAutoSeed, cffRender, cffRenderSales,
    cffInitPasteDefaults, cffRenderOpex, cffRenderLoans, cffRenderEvents,
    cffRenderStock, cffRenderDso, cffRenderDpo, cffRenderBtw,
    cffRenderCash, cffRenderWcOpenings, cffRenderModel, cffUpdateAccordionStatus,
} from './cashflow-forecast.js';
import { initSalesTab, renderSalesTab } from './sales.js';
import { initSalesOrdersTab, renderSalesOrdersTab } from './sales-orders.js';
import { initForecastTab, renderForecastTab } from './forecast-accuracy.js';
import { renderOrdersInboxTab } from './orders-inbox.js';

// === OAUTH CALLBACK — verwerk Exact Online redirect op page load ===
(async function handleOAuthOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return;
    history.replaceState({}, '', window.location.pathname);
    try {
        const res = await fetch('/.netlify/functions/exact-proxy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exchange_token', code }),
        });
        const d = await res.json();
        if (d.access_token) {
            sessionStorage.setItem('exact_access_token', d.access_token);
            sessionStorage.setItem('exact_refresh_token', d.refresh_token);
        }
    } catch (e) { console.error('OAuth callback fout:', e); }
})();

// === CATEGORY / TAB SWITCHING ===
export const CATEGORY_TABS = {
    sales: ['sales', 'salesorders', 'forecast'],
    supply: ['cogs', 'leverancier', 'stockcheck', 'ordersinbox'],
    finance: ['pnl', 'balance', 'cashflow', 'cfforecast'],
};
export function switchCategory(cat) {
    setCurrentCategory(cat);
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
    const sb = document.getElementById('cat-' + cat);
    if (sb) sb.classList.add('active');
    const allowed = CATEGORY_TABS[cat] || [];
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.display = allowed.includes(btn.dataset.tab) ? '' : 'none';
    });
    if (allowed.length > 0) switchTab(allowed[0]);
    else {
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    }
}
export function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    const el = document.getElementById('tab-' + tabName);
    if (el) el.classList.add('active');
    if (tabName === 'cogs') renderCOGSTab();
    if (tabName === 'pnl') { pnlCheckSession(); if (pnlUnlocked) renderPnLTab(); }
    if (tabName === 'balance') { balCheckSession(); if (pnlUnlocked) renderBalanceTab(); }
    if (tabName === 'cfforecast') { cffCheckSession(); if (pnlUnlocked) { const _cffSafe = fn => { try { fn(); } catch(e) { console.error('cff init error in ' + fn.name + ':', e); } }; [cffAutoSeed,cffRender,cffRenderSales,cffInitPasteDefaults,cffRenderOpex,cffRenderLoans,cffRenderEvents,cffRenderStock,cffRenderDso,cffRenderDpo,cffRenderBtw,cffRenderCash,cffRenderWcOpenings,cffRenderModel,cffUpdateAccordionStatus].forEach(_cffSafe); } }
    if (tabName === 'cashflow') { cfCheckSession(); if (cfUnlockedState) renderCashflowTab(); }
    if (tabName === 'sales') { initSalesTab(); renderSalesTab(); }
    if (tabName === 'salesorders') { initSalesOrdersTab(); renderSalesOrdersTab(); }
    if (tabName === 'forecast') { initForecastTab(); renderForecastTab(); }
    if (tabName === 'ordersinbox') renderOrdersInboxTab();
}

