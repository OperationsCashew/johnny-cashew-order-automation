// === Data loading and transformation ===
import {
    shopOrders, setShopOrders,
    materialPlans, setMaterialPlans,
    shopOrderSubcontractor, setShopOrderSubcontractor,
    purchaseOrders, setPurchaseOrders,
    purchaseOrderLines, setPurchaseOrderLines,
    stockData, setStockData,
    supplierNames, setSupplierNames,
    stockBatchData, setStockBatchData,
    cffReceivablesData, setCffReceivablesData,
    pnlTransactionLines, setPnlTransactionLines,
    pnlGLAccounts, setPnlGLAccounts,
    cfTransactionLines, setCfTransactionLines,
} from './state.js';
import { parseODataDate } from './utils.js';
import { transformCOGSData, renderCOGSTab } from '../tabs/cogs.js';
import { initDropdown } from '../tabs/leverancier.js';
import { switchCategory } from '../tabs/navigation.js';

export function transformDataset(raw) {
    // 1. Shop orders — al in juiste formaat of direct mappen
    setShopOrders((raw.shopOrders || []).map(o => ({
        nr: String(o.nr || o.ShopOrderNumber || ''),
        id: o.id || o.ShopOrderID || '',
        status: o.status || o.Status || 0,
        statusText: o.statusText || '',
        itemCode: o.itemCode || o.ItemCode || '',
        description: o.description || o.ItemDescription || '',
        quantity: o.quantity || o.PlannedQuantity || 0,
        delivered: o.delivered || o.DeliveredQuantity || 0,
        plannedDate: parseODataDate(o.plannedDate) || parseODataDate(o.PlannedDate) || '',
    })));

    // 2. Material plans: {shopOrderId: [{itemCode, description, quantity, amount}]}
    setMaterialPlans({});
    (raw.shopOrderMaterials || []).forEach(r => {
        const soId = r.ShopOrder || '';
        if (!soId) return;
        if (!materialPlans[soId]) materialPlans[soId] = [];
        materialPlans[soId].push({
            itemCode: r.ItemCode || '',
            description: r.ItemDescription || r.Description || '',
            quantity: r.PlannedQuantity || 0,
            amount: r.PlannedAmountFC || 0,
        });
    });

    // 3. Supplier names: {code: name}
    setSupplierNames({});
    (raw.accounts || []).forEach(a => {
        const code = (a.Code || '').trim();
        const name = a.Name || '';
        if (code && name) supplierNames[code] = name;
    });

    // 4. Purchase orders — groepeer lines per PurchaseOrderID
    const poMap = {};
    (raw.purchaseOrders || []).forEach(r => {
        const pid = r.PurchaseOrderID || '';
        if (!pid) return;
        if (!poMap[pid]) {
            poMap[pid] = {
                nr: String(r.OrderNumber || ''),
                supplierCode: (r.SupplierCode || '').trim(),
                orderDate: parseODataDate(r.OrderDate),
                receiptDate: parseODataDate(r.ReceiptDate),
                status: 10,
            };
        }
        // Update receiptDate to latest
        const lineDate = parseODataDate(r.ReceiptDate);
        if (lineDate && (!poMap[pid].receiptDate || lineDate > poMap[pid].receiptDate)) {
            poMap[pid].receiptDate = lineDate;
        }
        // Status: als alles ontvangen → 30
        const qty = r.Quantity || 0;
        const recv = r.ReceivedQuantity || 0;
        if (qty > 0 && recv >= qty) {
            poMap[pid].status = Math.max(poMap[pid].status, 30);
        }
    });
    setPurchaseOrders(Object.values(poMap));

    // 5. Purchase order lines
    setPurchaseOrderLines((raw.purchaseOrders || []).map(r => {
        const pid = r.PurchaseOrderID || '';
        const header = poMap[pid] || {};
        return {
            orderNr: header.nr || '',
            itemCode: r.ItemCode || '',
            description: r.ItemDescription || r.Description || '',
            quantity: r.Quantity || 0,
            received: r.ReceivedQuantity || 0,
            receiptDate: parseODataDate(r.ReceiptDate),
            shopOrderNr: null,
        };
    }));

    // 6. Stock data: {itemCode: {inStock, planningIn, planningOut}}
    setStockData({});
    (raw.stockPositions || []).forEach(r => {
        const code = r.ItemCode || '';
        if (code) {
            const whDesc = r.WarehouseDescription || '';
            if (!stockData[code]) stockData[code] = { inStock: 0, planningIn: 0, planningOut: 0, description: r.ItemDescription || '', warehouses: {} };
            stockData[code].inStock += r.CurrentStock || 0;
            stockData[code].planningIn += r.PlannedStockIn || 0;
            stockData[code].planningOut += r.PlannedStockOut || 0;
            if (!stockData[code].description) stockData[code].description = r.ItemDescription || '';
            if (whDesc) {
                if (!stockData[code].warehouses[whDesc]) stockData[code].warehouses[whDesc] = { inStock: 0 };
                stockData[code].warehouses[whDesc].inStock += r.CurrentStock || 0;
            }
        }
    });

    // 6b. StockBatchNumbers (batch-level stock transactions)
    setStockBatchData(raw.stockBatchNumbers || []);

    // 6c. Receivables (openstaande debiteuren)
    setCffReceivablesData(raw.receivables || []);

    // 7. shopOrderSubcontractor: {orderNr: supplierCode}
    //    Via ShopOrderRoutingStepPlans — koppelt shop order aan uitbestedende leverancier
    //    Routing step plans bevatten ShopOrder als GUID, niet als nummer.
    //    We bouwen eerst een lookup GUID → ordernummer via shopOrders.
    setShopOrderSubcontractor({});
    const guidToOrderNr = {};
    (raw.shopOrders || []).forEach(o => {
        const guid = o.ShopOrderID || o.id || '';
        const nr = String(o.ShopOrderNumber || o.nr || '');
        if (guid && nr) guidToOrderNr[guid] = nr;
    });
    (raw.routingStepPlans || []).forEach(r => {
        // ShopOrder is een GUID — vertaal naar ordernummer
        const soGuid = r.ShopOrder || '';
        const soNr = guidToOrderNr[soGuid] || '';
        const accNumber = (r.AccountNumber || '').trim();
        if (soNr && accNumber) {
            shopOrderSubcontractor[soNr] = accNumber;
        }
    });

    // 8. Transaction lines for P&L
    // Filter out year-end closing entries (Journal 90 "Memoriaal" with description starting with "Resultaat")
    setPnlTransactionLines((raw.transactionLines || []).map(t => ({
        accountCode: t.GLAccountCode || '',
        accountName: t.GLAccountDescription || '',
        amount: t.AmountFC || 0,
        year: t.FinancialYear || 0,
        period: t.FinancialPeriod || 0,
        date: parseODataDate(t.Date) || '',
        journalCode: t.JournalCode || '',
        description: t.Description || '',
        isYearEndClose: (t.JournalCode === '90' && /^(Resultaat|Saldi ex-)/.test(t.Description || '')),
    })));
    // GL account names lookup
    setPnlGLAccounts({});
    (raw.glAccounts || []).forEach(g => {
        pnlGLAccounts[g.Code || ''] = g.Description || '';
    });

    // 9. Bank transaction lines for Cashflow (accounts 1100, 1101)
    setCfTransactionLines((raw.transactionLines || [])
        .filter(t => {
            const code = t.GLAccountCode || '';
            return code === '1100' || code === '1101';
        })
        .map(t => ({
            accountCode: t.GLAccountCode || '',
            accountName: t.GLAccountDescription || '',
            description: t.Description || '',
            amount: t.AmountFC || 0,
            year: t.FinancialYear || 0,
            period: t.FinancialPeriod || 0,
            journalCode: t.JournalCode || '',
            date: parseODataDate(t.Date) || '',
        })));
}

// === DATA LOADING ===

export async function loadData() {
    const loadingEl = document.getElementById('loadingIndicator');
    const errorEl = document.getElementById('errorMessage');
    const mainEl = document.getElementById('mainContent');
    const updatedEl = document.getElementById('lastUpdated');

    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    mainEl.classList.add('hidden');
    updatedEl.classList.add('hidden');

    try {
        // Probeer eerst dataset.json (volledige Exact Online data)
        // Fallback naar data.json (legacy formaat)
        let data;
        let source;
        try {
            const resp = await fetch('dataset.json?t=' + Date.now());
            if (resp.ok) {
                data = await resp.json();
                source = 'dataset.json';
            }
        } catch(e) {}

        if (!data) {
            const resp = await fetch('data.json?t=' + Date.now());
            if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
            data = await resp.json();
            source = 'data.json';
        }

        // Transform raw API data naar tool-formaat
        if (source === 'dataset.json') {
            transformDataset(data);
            transformCOGSData(data);
        } else {
            // Legacy data.json — gebruik direct
            setShopOrders(data.shopOrders || []);
            setMaterialPlans(data.materialPlans || {});
            setShopOrderSubcontractor(data.shopOrderSubcontractor || {});
            setPurchaseOrders(data.purchaseOrders || []);
            setPurchaseOrderLines(data.purchaseOrderLines || []);
            setStockData(data.stockData || {});
            setSupplierNames(data.supplierNames || {});
        }

        // Show last updated timestamp
        if (data.lastUpdated) {
            const d = new Date(data.lastUpdated);
            const formatted = d.toLocaleDateString('nl-NL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            updatedEl.textContent = 'Laatste update: ' + formatted + ' (' + source + ')';
            updatedEl.classList.remove('hidden');
        }

        // Hide loading, show main content
        loadingEl.classList.add('hidden');
        mainEl.classList.remove('hidden');
        switchCategory('supply');

        // Initialize UI
        initDropdown();
        renderCOGSTab();

    } catch (err) {
        loadingEl.classList.add('hidden');
        errorEl.innerHTML = '<div class="error-title">Fout bij laden van data</div>' +
            '<div>' + err.message + '</div>' +
            '<div style="margin-top:12px;"><button class="btn btn-primary" onclick="loadData()">Opnieuw proberen</button></div>';
        errorEl.classList.remove('hidden');
    }
}

