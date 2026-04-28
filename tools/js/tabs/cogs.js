import {
    shopOrders, materialPlans, stockData,
    cogsItems, setCogsItems,
    cogsSalesInvoices, setCogsSalesInvoices,
    cogsRoutingCosts, setCogsRoutingCosts,
    cogsMaterialIssues, setCogsMaterialIssues,
    cogsActualCosts, setCogsActualCosts,
    cogsMaterialPrices, setCogsMaterialPrices,
    cogsCustomerFilter,
    cogsSortField, setCogsSortField,
    cogsSortAsc, setCogsSortAsc,
    cogsProducts, setCogsProducts,
    selectedCogsProduct, setSelectedCogsProduct,
    cogsRawDataset, setCogsRawDataset,
    cogsBigBagSplit, setCogsBigBagSplit,
    cogsBigBagWarnings, setCogsBigBagWarnings,
    allCustomerNames, setAllCustomerNames,
} from '../shared/state.js';
import { parseODataDate, formatDate, formatNumber } from '../shared/utils.js';
import { getMaterialCategoryByDesc } from './leverancier.js';

// === COGS DATA ===

export function transformCOGSData(raw) {
    setCogsRawDataset(raw);
    // Items master data
    setCogsItems((raw.items || []).map(i => ({
        id: i.ID || i.id || '',
        code: i.Code || i.ItemCode || i.code || '',
        description: i.Description || i.description || '',
        isMake: i.IsMakeItem || 0,
        costPrice: i.CostPriceStandard || 0,
        salesPrice: i.SalesPrice || 0,
    })));

    // Routing step plans — bewerking costs per shop order
    setCogsRoutingCosts({});
    (raw.routingStepPlans || []).forEach(r => {
        const soGuid = r.ShopOrder || '';
        if (!soGuid) return;
        const cost = r.TotalCostDC || 0;
        if (!cogsRoutingCosts[soGuid]) cogsRoutingCosts[soGuid] = { totalCost: 0, items: [] };
        cogsRoutingCosts[soGuid].totalCost += cost;
        cogsRoutingCosts[soGuid].items.push({
            description: r.Description || r.OperationDescription || '',
            cost: cost,
            costPerItem: r.CostPerItem || 0,
            supplier: r.AccountName || '',
        });
    });

    // Big Bag (2002*) cost decomposition: multi-level split into cashew/roosteraar/chocolateren/bewerking
    // For each 2002* item, find its most recent WO and calculate the % split
    // Handles nested Big Bags (e.g. 2002024 contains 2002004)
    setCogsBigBagSplit({});
    const bigBagOrders = {};
    (raw.shopOrders || []).forEach(o => {
        const itemCode = o.ItemCode || o.itemCode || '';
        if (!itemCode.startsWith('2002')) return;
        const id = o.ShopOrderID || o.id || '';
        const date = parseODataDate(o.PlannedDate || o.plannedDate) || '';
        if (!bigBagOrders[itemCode] || date > bigBagOrders[itemCode].date) {
            bigBagOrders[itemCode] = { id, date };
        }
    });
    // Build raw data per Big Bag first
    const bigBagRaw = {};
    for (const [itemCode, info] of Object.entries(bigBagOrders)) {
        const mats = (raw.shopOrderMaterials || []).filter(m => m.ShopOrder === info.id);
        const routes = (raw.routingStepPlans || []).filter(r => r.ShopOrder === info.id);
        bigBagRaw[itemCode] = { mats, routes };
    }
    // Resolve splits with multi-level decomposition (process leaf nodes first)
    function resolveBigBagSplit(itemCode, visited) {
        if (cogsBigBagSplit[itemCode]) return cogsBigBagSplit[itemCode];
        if (!bigBagRaw[itemCode]) return null;
        if (visited.has(itemCode)) return null; // prevent cycles
        visited.add(itemCode);
        const { mats, routes } = bigBagRaw[itemCode];
        const split = { cashew: 0, roosteraar: 0, chocolateren: 0, bewerking: 0 };
        let grand = 0;
        // Decompose materials
        mats.forEach(m => {
            const mc = m.ItemCode || '';
            const amt = m.PlannedAmountFC || 0;
            grand += amt;
            if (mc.startsWith('2002')) {
                // Nested Big Bag — recursively resolve its split
                const innerSplit = resolveBigBagSplit(mc, visited);
                if (innerSplit) {
                    split.cashew += amt * innerSplit.cashewPct;
                    split.roosteraar += amt * innerSplit.roosteraarPct;
                    split.chocolateren += amt * innerSplit.chocolaterenPct;
                    split.bewerking += amt * innerSplit.bewerkingPct;
                } else {
                    split.cashew += amt; // fallback: treat as cashew
                }
            } else {
                split.cashew += amt; // raw materials (2001*, etc.) = cashew
            }
        });
        // Routing costs classified by supplier
        routes.forEach(r => {
            const cost = r.TotalCostDC || 0;
            grand += cost;
            const sup = (r.AccountName || '').toLowerCase();
            if (sup.includes('katjang')) split.roosteraar += cost;
            else if (sup.includes('choconut')) split.chocolateren += cost;
            else split.bewerking += cost;
        });
        if (grand <= 0) return null;
        cogsBigBagSplit[itemCode] = {
            cashewPct: split.cashew / grand,
            roosteraarPct: split.roosteraar / grand,
            chocolaterenPct: split.chocolateren / grand,
            bewerkingPct: split.bewerking / grand,
        };
        return cogsBigBagSplit[itemCode];
    }
    for (const itemCode of Object.keys(bigBagRaw)) {
        resolveBigBagSplit(itemCode, new Set());
    }

    // Track data quality warnings for products with incomplete Big Bag data
    setCogsBigBagWarnings({});
    // Warn for 2002* items without a WO (no fallback — costs go to cashew)
    (raw.items || []).forEach(i => {
        const code = i.Code || i.ItemCode || i.code || '';
        if (!code.startsWith('2002') || cogsBigBagSplit[code]) return;
        cogsBigBagWarnings[code] = 'Geen werkorder gevonden voor ' + code + ' (' + (i.Description || i.description || '') + ') — kostendecompositie onvolledig';
    });
    // Check for routing steps with cost=0 but known supplier
    for (const [itemCode, data] of Object.entries(bigBagRaw)) {
        const { routes } = data;
        routes.forEach(r => {
            if ((r.TotalCostDC || 0) === 0 && r.AccountName) {
                cogsBigBagWarnings[itemCode] = (cogsBigBagWarnings[itemCode] ? cogsBigBagWarnings[itemCode] + '; ' : '') +
                    'Routing ' + r.AccountName + ' heeft €0 kosten in Exact voor ' + itemCode;
            }
        });
    }

    // Werkelijke geboekte WO-kosten uit Exact (financialtransaction/TransactionLines).
    // Dit is de "ground truth" voor afgeronde WOs en is exact gelijk aan
    // wat Exact in het WO-scherm toont.
    setCogsActualCosts(raw.shopOrderActualCosts || {});

    // Material issues (actual quantities) per shop order
    setCogsMaterialIssues({});
    (raw.materialIssues || []).forEach(m => {
        const soGuid = m.ShopOrder || '';
        const ic = m.ItemCode || '';
        if (!soGuid || !ic) return;
        // Dedupe: Exact API levert per uitgifte vaak twee records terug:
        // de originele issue (HasReversibleQuantity=false) en een
        // vervolg-/bevestigingstransactie (HasReversibleQuantity=true).
        // We tellen alleen de originele om dubbeltelling te voorkomen.
        if (m.HasReversibleQuantity === true || m.HasReversibleQuantity === 1) return;
        if (!cogsMaterialIssues[soGuid]) cogsMaterialIssues[soGuid] = {};
        cogsMaterialIssues[soGuid][ic] = (cogsMaterialIssues[soGuid][ic] || 0) + (m.Quantity || 0);
    });

    // Unit prices from material plans (PlannedPriceFC)
    setCogsMaterialPrices({});
    (raw.shopOrderMaterials || []).forEach(m => {
        const soGuid = m.ShopOrder || '';
        const ic = m.ItemCode || '';
        if (!soGuid || !ic) return;
        if (!cogsMaterialPrices[soGuid]) cogsMaterialPrices[soGuid] = {};
        const pq = m.PlannedQuantity || 0;
        const pa = m.PlannedAmountFC || 0;
        cogsMaterialPrices[soGuid][ic] = m.PlannedPriceFC || (pq > 0 ? pa / pq : 0);
    });

    // Build invoice header lookup — include all fields we need for DSO
    const invoiceHeaders = {};
    (raw.salesInvoiceHeaders || []).forEach(h => {
        const id = h.InvoiceID || h.ID || '';
        if (id) {
            invoiceHeaders[id] = {
                customerCode: (h.InvoiceTo || h.OrderedBy || '').trim(),
                customerName: h.InvoiceToName || h.OrderedByName || h.DeliverToName || '',
                invoiceDate: parseODataDate(h.InvoiceDate) || parseODataDate(h.Created) || '',
                dueDate: parseODataDate(h.DueDate) || '',
                paymentCondition: h.PaymentCondition || '',
                paymentConditionDesc: h.PaymentConditionDescription || '',
                status: h.Status || 0,
                amountDC: h.AmountDC || 0,
            };
        }
    });

    // Sales invoice lines — for actual selling prices & DSO
    setCogsSalesInvoices([]);
    (raw.salesInvoiceLines || []).forEach(l => {
        const invId = l.InvoiceID || '';
        const header = invoiceHeaders[invId] || {};
        cogsSalesInvoices.push({
            itemCode: l.ItemCode || '',
            quantity: l.Quantity || 0,
            amount: l.AmountFC || l.Amount || 0,
            amountDC: l.AmountDC || l.AmountFC || 0,
            unitPrice: l.UnitPrice || 0,
            invoiceDate: header.invoiceDate || parseODataDate(l.DeliveryDate) || '',
            dueDate: header.dueDate || '',
            paymentCondition: header.paymentCondition || '',
            paymentConditionDesc: header.paymentConditionDesc || '',
            customerCode: header.customerCode || '',
            customerName: header.customerName || '',
            invoiceId: invId,
        });
    });
}

// Classify a product into a group based on itemCode + description
export function getProductGroup(itemCode, description) {
    const desc = (description || '').toLowerCase();
    if (itemCode.startsWith('1001')) return 'lidl';
    // Coated club: choco/chocolate, cinnamon, caramel, sweet chili
    if (desc.includes('choco') || desc.includes('chocolate') ||
        desc.includes('cinnamon') || desc.includes('caramel')) return 'coated';
    // UDEA / Biologisch
    if (desc.includes('udea') || desc.includes(' bio ') ||
        desc.startsWith('bio ') || desc.includes(' bio')) return 'udea';
    // Regular Johnny Cashew
    if (itemCode.startsWith('1002')) return 'jc';
    return 'other';
}

export const PRODUCT_GROUP_LABELS = {
    lidl: 'Lidl producten',
    jc: 'Johnny Cashew',
    coated: 'JC Coated Club',
    udea: 'UDEA / Biologisch',
};

export function calculateCOGS() {
    const periodMonths = document.getElementById('cogsPeriod')?.value || '3';
    const pricePeriodMonths = document.getElementById('cogsPricePeriod')?.value || 'all';
    const groupBy = document.getElementById('cogsGroupBy')?.value || 'none';
    const costBasis = document.getElementById('cogsCostBasis')?.value || 'actual';

    // Date cutoff for werkorders
    let dateCutoff = null;
    if (periodMonths !== 'all') {
        const d = new Date();
        d.setMonth(d.getMonth() - parseInt(periodMonths));
        dateCutoff = d.toISOString().slice(0, 10);
    }
    // Date cutoff for sales invoices
    let priceDateCutoff = null;
    if (pricePeriodMonths !== 'all') {
        const d = new Date();
        d.setMonth(d.getMonth() - parseInt(pricePeriodMonths));
        priceDateCutoff = d.toISOString().slice(0, 10);
    }

    // Build HE (eindproduct) items — items starting with 1001 (Lidl) or 1002 (Johnny Cashew)
    const heOrders = shopOrders.filter(o => o.itemCode.startsWith('1001') || o.itemCode.startsWith('1002'));

    // Group by itemCode
    const byItem = {};
    heOrders.forEach(o => {
        if (dateCutoff && o.plannedDate < dateCutoff) return;
        if (!byItem[o.itemCode]) byItem[o.itemCode] = [];
        byItem[o.itemCode].push(o);
    });

    // Filter by product group if a specific group is selected
    const groupFilter = ['lidl', 'jc', 'coated', 'udea'].includes(groupBy) ? groupBy : null;

    // Calculate COGS per product
    const results = [];
    for (const [itemCode, orders] of Object.entries(byItem)) {
        // Get description from first order
        const prodDesc = orders[0]?.description || '';
        const prodGroup = getProductGroup(itemCode, prodDesc);

        // Apply group filter
        if (groupFilter && prodGroup !== groupFilter) continue;
        // Sort by date descending, take max 3 most recent
        const sorted = orders.slice().sort((a, b) => (b.plannedDate || '').localeCompare(a.plannedDate || ''));
        const relevantOrders = sorted.slice(0, 3);

        const woDetails = [];
        let totalCogs = 0;
        let totalQty = 0;

        const productWarnings = [];

        relevantOrders.forEach(wo => {
            const mats = materialPlans[wo.id] || [];
            const breakdown = { cashew: 0, roosteraar: 0, chocolateren: 0, bewerking: 0, folie: 0, doos: 0, overig: 0 };
            let woCogs = 0;

            const actualIssues = cogsMaterialIssues[wo.id] || {};
            const unitPrices = cogsMaterialPrices[wo.id] || {};
            const bookedCosts = cogsActualCosts[wo.id] || null;  // werkelijke geboekte €-bedragen
            const hasActuals = Object.keys(actualIssues).length > 0;
            const hasBooked = bookedCosts && Object.keys(bookedCosts).some(k => k !== '_total');

            // Filter: skip WOs without actuals when costBasis = 'actual'
            if (costBasis === 'actual' && !hasActuals && !hasBooked) return;

            // Voorkeursvolgorde:
            //   1. Werkelijk geboekte kosten (TransactionLines)  → 1:1 met Exact
            //   2. Werkelijke uitgiften × planned price            → fallback
            //   3. Planned amount (BOM)                            → laatste fallback
            const useBooked = hasBooked && costBasis !== 'planned';
            const useActual = !useBooked && hasActuals && costBasis !== 'planned';

            // Bouw een unie van itemCodes uit BOM + werkelijke boekingen,
            // zodat we ook items meenemen die wel zijn uitgegeven maar niet in de BOM stonden.
            const allCodes = new Set(mats.map(m => m.itemCode));
            if (useBooked) {
                Object.keys(bookedCosts).forEach(k => { if (k !== '_total') allCodes.add(k); });
            }
            const matsByCode = {};
            mats.forEach(m => { matsByCode[m.itemCode] = m; });

            Array.from(allCodes).forEach(code => {
                const m = matsByCode[code] || { itemCode: code, description: '', amount: 0 };
                const cat = getMaterialCategoryByDesc(m.itemCode, m.description);
                let amt;
                if (useBooked && bookedCosts[m.itemCode] !== undefined) {
                    amt = bookedCosts[m.itemCode];
                } else if (useActual && actualIssues[m.itemCode] !== undefined) {
                    const actualQty = actualIssues[m.itemCode];
                    const price = unitPrices[m.itemCode] || 0;
                    amt = actualQty * price;
                    if (price === 0 && actualQty > 0) {
                        productWarnings.push('Geen kostprijs voor ' + m.itemCode + ' (' + (m.description || '') + ') — ' + actualQty + ' stuks uitgegeven maar PlannedPriceFC = €0');
                    }
                } else {
                    amt = m.amount || 0;
                }

                // Decompose 2002* Big Bags into cashew + roosteraar/chocolateren
                if (m.itemCode.startsWith('2002') && cogsBigBagSplit[m.itemCode]) {
                    const split = cogsBigBagSplit[m.itemCode];
                    breakdown.cashew += amt * split.cashewPct;
                    breakdown.roosteraar += amt * split.roosteraarPct;
                    breakdown.chocolateren += amt * split.chocolaterenPct;
                    breakdown.bewerking += amt * split.bewerkingPct;
                    // Check for warnings on this Big Bag
                    if (cogsBigBagWarnings[m.itemCode]) {
                        productWarnings.push(cogsBigBagWarnings[m.itemCode]);
                    }
                } else if (m.itemCode.startsWith('2002')) {
                    // 2002* without resolved split — treat as cashew + warn
                    breakdown.cashew += amt;
                    const warn = cogsBigBagWarnings[m.itemCode] || 'Geen werkorder voor ' + m.itemCode + ' (' + (m.description || '') + ')';
                    productWarnings.push(warn);
                } else if (m.itemCode.startsWith('3')) {
                    // 3xxx = service-/bewerkingsartikelen (bv. Vullen zakjes)
                    breakdown.bewerking += amt;
                } else if (cat === 'grondstof') {
                    // 2001* raw cashews
                    breakdown.cashew += amt;
                } else if (cat === 'folie') {
                    breakdown.folie += amt;
                } else if (cat === 'doos') {
                    breakdown.doos += amt;
                } else {
                    breakdown.overig += amt;
                }
                woCogs += amt;
            });

            // Routing/bewerking costs from routingStepPlans on the eindproduct itself.
            // Niet optellen wanneer we al de geboekte kosten gebruiken — die zitten
            // er dan al in als 3xxx-serviceregels.
            const routing = cogsRoutingCosts[wo.id];
            if (!useBooked && routing && routing.totalCost > 0) {
                // Classify by supplier
                (routing.items || []).forEach(ri => {
                    const sup = (ri.supplier || '').toLowerCase();
                    if (sup.includes('katjang')) {
                        breakdown.roosteraar += ri.cost;
                    } else if (sup.includes('choconut')) {
                        breakdown.chocolateren += ri.cost;
                    } else {
                        breakdown.bewerking += ri.cost;
                    }
                });
                woCogs += routing.totalCost;
            }

            const qty = wo.quantity || 1;
            totalCogs += woCogs;
            totalQty += qty;

            woDetails.push({
                nr: wo.nr,
                date: wo.plannedDate,
                quantity: qty,
                totalCogs: woCogs,
                cogsPerUnit: woCogs / qty,
                breakdown: breakdown,
                status: wo.status,
                isActual: useActual,
            });
        });

        const avgCogsPerUnit = totalQty > 0 ? totalCogs / totalQty : 0;

        // Actual selling price from invoices — filtered by price period
        let avgPrice = 0;
        let salePriceSource = 'geen data';
        const invoiceLines = cogsSalesInvoices.filter(l => l.itemCode === itemCode);
        const filteredInvoiceLines = priceDateCutoff
            ? invoiceLines.filter(l => (l.invoiceDate || '') >= priceDateCutoff)
            : invoiceLines;
        if (filteredInvoiceLines.length > 0) {
            // Weighted average unit price — exclude credit notes (negative qty)
            // Step 1: calculate median unit price from ALL invoices (not just period) for stable outlier detection
            const allPosLines = invoiceLines.filter(l => l.quantity > 0);
            const posLines = filteredInvoiceLines.filter(l => l.quantity > 0);
            const unitPricesArr = allPosLines.map(l => l.amount / l.quantity).sort((a, b) => a - b);
            const median = unitPricesArr.length > 0
                ? (unitPricesArr.length % 2 === 1
                    ? unitPricesArr[Math.floor(unitPricesArr.length / 2)]
                    : (unitPricesArr[Math.floor(unitPricesArr.length / 2) - 1] + unitPricesArr[Math.floor(unitPricesArr.length / 2)]) / 2)
                : 0;
            // Step 2: filter out outliers (>50% deviation from median) if we have enough lines
            let outlierCount = 0;
            let totalRev = 0, totalSold = 0;
            posLines.forEach(l => {
                const up = l.amount / l.quantity;
                if (median > 0 && unitPricesArr.length >= 2 && Math.abs(up - median) / median > 0.5) {
                    outlierCount++;
                    return; // skip outlier
                }
                totalRev += l.amount;
                totalSold += l.quantity;
            });
            if (outlierCount > 0) {
                productWarnings.push(outlierCount + ' factuurregel(s) uitgesloten (stuksprijs wijkt >50% af van mediaan €' + median.toFixed(2) + ')');
            }
            avgPrice = totalSold > 0 ? totalRev / totalSold : 0;
            salePriceSource = 'facturen';
        } else {
            // Fallback: item master sales price
            const itemMaster = cogsItems.find(i => i.code === itemCode);
            if (itemMaster && itemMaster.salesPrice > 0) {
                avgPrice = itemMaster.salesPrice;
                salePriceSource = 'catalogusprijs';
            }
        }

        const margin = avgPrice > 0 ? ((avgPrice - avgCogsPerUnit) / avgPrice) * 100 : 0;

        // Trend: compare first vs last WO cogs/unit
        let trend = 'stable';
        if (woDetails.length >= 2) {
            const oldest = woDetails[woDetails.length - 1].cogsPerUnit;
            const newest = woDetails[0].cogsPerUnit;
            const change = oldest > 0 ? ((newest - oldest) / oldest) * 100 : 0;
            if (change > 3) trend = 'up';
            else if (change < -3) trend = 'down';
        }

        // Deviation: flag WOs that deviate >5% from average
        let hasDeviation = false;
        woDetails.forEach(wo => {
            wo.deviation = avgCogsPerUnit > 0 ? ((wo.cogsPerUnit - avgCogsPerUnit) / avgCogsPerUnit) * 100 : 0;
            wo.isDeviant = Math.abs(wo.deviation) > 5;
            if (wo.isDeviant) hasDeviation = true;
        });

        // Skip products without any work order data in selected period
        if (woDetails.length === 0) continue;

        // Skip products not sold in the selected price period
        if (filteredInvoiceLines.filter(l => l.quantity > 0).length === 0) continue;

        // Stock info
        const stock = stockData[itemCode];
        const inStock = stock ? stock.inStock > 0 : false;

        // Customer filter: only include product if at least one active customer bought it
        const customers = new Set(filteredInvoiceLines.map(l => l.customerName).filter(Boolean));
        const hasAnyFilterOff = Object.values(cogsCustomerFilter).some(v => v === false);
        if (hasAnyFilterOff) {
            // If any customer is deselected, we're actively filtering
            // Products without invoices for any active customer should be excluded
            if (customers.size === 0) continue; // no invoice data = can't link to customer
            const hasActiveCustomer = [...customers].some(c => cogsCustomerFilter[c] !== false);
            if (!hasActiveCustomer) continue;
        }

        // Recalculate avg price filtered by active customers only (with same outlier filter)
        if (hasAnyFilterOff && filteredInvoiceLines.length > 0) {
            let filtRev = 0, filtQty = 0;
            filteredInvoiceLines.forEach(l => {
                if (l.quantity > 0 && (!l.customerName || cogsCustomerFilter[l.customerName] !== false)) {
                    const up = l.amount / l.quantity;
                    if (median > 0 && unitPricesArr.length >= 2 && Math.abs(up - median) / median > 0.5) return;
                    filtRev += l.amount;
                    filtQty += l.quantity;
                }
            });
            if (filtQty > 0) {
                avgPrice = filtRev / filtQty;
            }
        }

        // Recalculate margin with potentially filtered price
        const filteredMargin = avgPrice > 0 ? ((avgPrice - avgCogsPerUnit) / avgPrice) * 100 : 0;

        results.push({
            itemCode,
            description: relevantOrders[0]?.description || itemCode,
            woCount: relevantOrders.length,
            totalWoCount: orders.length,
            avgCogs: avgCogsPerUnit,
            avgPrice,
            priceSource: salePriceSource,
            margin: filteredMargin,
            trend,
            hasDeviation,
            woDetails,
            inStock,
            stockQty: stock ? stock.inStock : 0,
            customers: [...customers],
            // Aggregate breakdown percentages
            breakdown: aggregateBreakdown(woDetails),
            productGroup: prodGroup,
            warnings: [...new Set(productWarnings)],
        });
    }

    // If "Per productgroep" is selected, aggregate results into group summaries
    if (groupBy === 'group') {
        const grouped = {};
        results.forEach(r => {
            const g = r.productGroup || 'other';
            if (!grouped[g]) grouped[g] = { items: [], totalCogs: 0, totalQty: 0, totalRev: 0, totalSold: 0, allWoDetails: [], stockQty: 0 };
            grouped[g].items.push(r);
            // Weighted sum for aggregation
            r.woDetails.forEach(wo => {
                grouped[g].totalCogs += wo.totalCogs;
                grouped[g].totalQty += wo.quantity;
            });
            grouped[g].allWoDetails.push(...r.woDetails);
            grouped[g].stockQty += r.stockQty || 0;
        });
        const groupResults = [];
        for (const [gKey, gData] of Object.entries(grouped)) {
            const label = PRODUCT_GROUP_LABELS[gKey] || gKey;
            const avgCogs = gData.totalQty > 0 ? gData.totalCogs / gData.totalQty : 0;
            // Weighted avg price from individual products (already filtered by price period + customer)
            let totalRev = 0, totalSold = 0;
            gData.items.forEach(r => {
                if (r.avgPrice > 0) {
                    const qty = r.woDetails.reduce((s, w) => s + w.quantity, 0);
                    totalRev += r.avgPrice * qty;
                    totalSold += qty;
                }
            });
            const avgPrice = totalSold > 0 ? totalRev / totalSold : 0;
            const margin = avgPrice > 0 ? ((avgPrice - avgCogs) / avgPrice) * 100 : 0;
            groupResults.push({
                itemCode: gKey,
                description: label + ' (' + gData.items.length + ' producten)',
                woCount: gData.items.reduce((s, r) => s + r.woCount, 0),
                totalWoCount: gData.items.reduce((s, r) => s + r.totalWoCount, 0),
                avgCogs,
                avgPrice,
                priceSource: 'facturen',
                margin,
                trend: 'stable',
                hasDeviation: false,
                woDetails: gData.allWoDetails,
                inStock: gData.stockQty > 0,
                stockQty: gData.stockQty,
                customers: [...new Set(gData.items.flatMap(r => r.customers))],
                breakdown: aggregateBreakdown(gData.allWoDetails),
                isGroup: true,
                groupItems: gData.items,
            });
        }
        return groupResults;
    }

    return results;
}

export function aggregateBreakdown(woDetails) {
    const totals = { cashew: 0, roosteraar: 0, chocolateren: 0, bewerking: 0, folie: 0, doos: 0, overig: 0 };
    woDetails.forEach(wo => {
        for (const cat of Object.keys(totals)) {
            totals[cat] += wo.breakdown[cat] || 0;
        }
    });
    const sum = Object.values(totals).reduce((a, b) => a + b, 0);
    const pct = {};
    for (const cat of Object.keys(totals)) {
        pct[cat] = sum > 0 ? (totals[cat] / sum) * 100 : 0;
    }
    pct._total = sum;
    return pct;
}


export function buildCustomerDropdown() {
    const allCustomers = new Set();
    cogsSalesInvoices.forEach(l => {
        if (l.customerName) allCustomers.add(l.customerName);
    });
    setAllCustomerNames([...allCustomers].sort());

    // Initialize filter (all on by default)
    allCustomerNames.forEach(name => {
        if (!(name in cogsCustomerFilter)) cogsCustomerFilter[name] = true;
    });

    renderCustomerList();
    updateCustomerLabel();
}

export function renderCustomerList(filter) {
    const container = document.getElementById('cogsCustomerList');
    if (!container) return;
    container.innerHTML = '';

    const search = (filter || '').toLowerCase();
    const filtered = search ? allCustomerNames.filter(n => n.toLowerCase().includes(search)) : allCustomerNames;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:10px;color:#888;font-size:0.82rem;">Geen klanten gevonden</div>';
        return;
    }

    filtered.forEach(name => {
        const item = document.createElement('label');
        item.className = 'cogs-customer-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = cogsCustomerFilter[name] !== false;
        cb.onchange = () => {
            cogsCustomerFilter[name] = cb.checked;
            updateCustomerLabel();
            renderCOGSTab();
        };
        const span = document.createElement('span');
        span.textContent = name;
        item.appendChild(cb);
        item.appendChild(span);
        container.appendChild(item);
    });
}

export function filterCustomerList() {
    const val = document.getElementById('cogsCustomerSearch')?.value || '';
    renderCustomerList(val);
}

export function updateCustomerLabel() {
    const label = document.getElementById('cogsCustomerLabel');
    if (!label) return;
    const total = allCustomerNames.length;
    const active = allCustomerNames.filter(n => cogsCustomerFilter[n] !== false).length;
    if (total === 0) label.textContent = 'Geen klantdata';
    else if (active === total) label.textContent = 'Alle klanten (' + total + ')';
    else if (active === 0) label.textContent = 'Geen klanten geselecteerd';
    else label.textContent = active + ' van ' + total + ' klanten';
}

export function toggleCustomerPanel() {
    const panel = document.getElementById('cogsCustomerPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
        document.getElementById('cogsCustomerSearch').value = '';
        renderCustomerList();
        document.getElementById('cogsCustomerSearch').focus();
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('cogsCustomerDropdown');
    if (dd && !dd.contains(e.target)) {
        document.getElementById('cogsCustomerPanel')?.classList.remove('open');
    }
});

export function toggleAllCustomers(on) {
    allCustomerNames.forEach(name => { cogsCustomerFilter[name] = on; });
    renderCustomerList(document.getElementById('cogsCustomerSearch')?.value || '');
    updateCustomerLabel();
    renderCOGSTab();
}

export function sortCOGS(field) {
    if (cogsSortField === field) {
        setCogsSortAsc(!cogsSortAsc);
    } else {
        setCogsSortField(field);
        setCogsSortAsc(field === 'itemCode' || field === 'description');
    }
    renderCOGSTable();
}

export function renderCOGSTab() {
    setCogsProducts(calculateCOGS());
    buildCustomerDropdown();
    renderCOGSSummary(cogsProducts);
    renderCOGSTable();

    // If a product was selected, check if it's still in the list
    if (selectedCogsProduct) {
        const still = cogsProducts.find(p => p.itemCode === selectedCogsProduct);
        if (still) renderCOGSDetail(still);
        else document.getElementById('cogsDetailSection').classList.add('hidden');
    }
}

export function renderCOGSSummary(products) {
    const container = document.getElementById('cogsSummaryCards');
    if (!container) return;

    // For grouped results, use underlying items for consistent summary
    const items = [];
    products.forEach(p => {
        if (p.isGroup && p.groupItems) items.push(...p.groupItems);
        else items.push(p);
    });

    const count = items.length;
    const deviations = items.filter(p => p.hasDeviation).length;
    // Weighted averages: weight by total WO quantity per product
    let totalCogs = 0, totalQty = 0, totalRev = 0, totalSold = 0;
    items.forEach(p => {
        const qty = p.woDetails.reduce((s, w) => s + w.quantity, 0);
        totalCogs += p.avgCogs * qty;
        totalQty += qty;
        // For margin: use revenue-weighted average
        if (p.avgPrice > 0) {
            const sold = qty; // approximate with WO qty
            totalRev += p.avgPrice * sold;
            totalSold += sold;
        }
    });
    const avgCogs = totalQty > 0 ? totalCogs / totalQty : 0;
    const avgPrice = totalSold > 0 ? totalRev / totalSold : 0;
    const avgMargin = avgPrice > 0 ? ((avgPrice - avgCogs) / avgPrice) * 100 : 0;

    const marginClass = avgMargin >= 30 ? 'cogs-margin-good' : avgMargin >= 15 ? 'cogs-margin-ok' : 'cogs-margin-low';

    container.innerHTML = `
        <div class="cogs-summary-card">
            <div class="label">Producten</div>
            <div class="value">${count}</div>
        </div>
        <div class="cogs-summary-card">
            <div class="label">Gem. COGS/stuk</div>
            <div class="value">&euro; ${avgCogs.toFixed(2)}</div>
        </div>
        <div class="cogs-summary-card">
            <div class="label">Gem. bruto marge</div>
            <div class="value ${marginClass}">${avgMargin.toFixed(1)}%</div>
        </div>
        <div class="cogs-summary-card">
            <div class="label">Afwijkingen (&gt;5%)</div>
            <div class="value" style="color: ${deviations > 0 ? '#e74c3c' : '#2d6a4f'}">${deviations}</div>
        </div>
    `;
}

export function renderCOGSTable() {
    const tbody = document.getElementById('cogsTableBody');
    if (!tbody) return;

    // Sort
    const sorted = cogsProducts.slice().sort((a, b) => {
        let va = a[cogsSortField], vb = b[cogsSortField];
        if (typeof va === 'string') return cogsSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return cogsSortAsc ? (va - vb) : (vb - va);
    });

    tbody.innerHTML = '';
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#888; padding:20px;">Geen producten gevonden voor deze filters</td></tr>';
        return;
    }

    sorted.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'cogs-row' + (selectedCogsProduct === p.itemCode ? ' selected' : '');
        tr.onclick = () => {
            setSelectedCogsProduct(p.itemCode);
            renderCOGSTable();
            renderCOGSDetail(p);
            document.getElementById('cogsDetailSection').scrollIntoView({ behavior: 'smooth' });
        };

        // Build mini bar
        const barHtml = buildMiniBar(p.breakdown);

        // Margin class
        const mClass = p.margin >= 30 ? 'cogs-margin-good' : p.margin >= 15 ? 'cogs-margin-ok' : 'cogs-margin-low';

        // Trend
        const tClass = p.trend === 'up' ? 'cogs-trend-up' : p.trend === 'down' ? 'cogs-trend-down' : 'cogs-trend-stable';

        // Price display
        const priceHtml = p.avgPrice > 0
            ? `&euro; ${p.avgPrice.toFixed(2)} <span style="font-size:0.7rem;color:#aaa;">(${p.priceSource})</span>`
            : '<span style="color:#aaa;">-</span>';

        const warnIcon = p.warnings && p.warnings.length > 0
            ? ' <span style="color:#e67e22;cursor:help;" title="' + p.warnings.join('\n').replace(/"/g, '&quot;') + '">⚠</span>' : '';

        const deviationHtml = p.hasDeviation
            ? '<span class="cogs-deviation-flag" title="Werkorder wijkt >5% af">⚠</span>'
            : warnIcon
                ? '<span style="color:#e67e22;cursor:help;" title="' + p.warnings.join('\n').replace(/"/g, '&quot;') + '">⚠</span>'
                : '<span style="color:#2d6a4f;">✓</span>';

        tr.innerHTML = `
            <td><strong>${p.itemCode}</strong></td>
            <td>${p.description}</td>
            <td>${p.woCount}${p.totalWoCount > p.woCount ? ' <span style="color:#aaa;">/ ' + p.totalWoCount + '</span>' : ''}</td>
            <td>&euro; ${p.avgCogs.toFixed(2)}</td>
            <td>${barHtml}</td>
            <td>${priceHtml}</td>
            <td class="${mClass}">${p.avgPrice > 0 ? p.margin.toFixed(1) + '%' : '-'}</td>
            <td><span class="${tClass}">${p.trend === 'up' ? '+' : p.trend === 'down' ? '-' : '='}</span></td>
            <td>${deviationHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

export const COGS_CATS = [
    { key: 'cashew', cls: 'cogs-bar-cashew', color: '#e67e22', label: 'Cashew' },
    { key: 'roosteraar', cls: 'cogs-bar-roosteraar', color: '#d35400', label: 'Roosteraar' },
    { key: 'chocolateren', cls: 'cogs-bar-chocolateren', color: '#6c3483', label: 'Chocolateren' },
    { key: 'bewerking', cls: 'cogs-bar-bewerking', color: '#8e44ad', label: 'Bewerking' },
    { key: 'folie', cls: 'cogs-bar-folie', color: '#3498db', label: 'Folie' },
    { key: 'doos', cls: 'cogs-bar-doos', color: '#2ecc71', label: 'Doos' },
    { key: 'overig', cls: 'cogs-bar-overig', color: '#95a5a6', label: 'Overig' },
];

export function buildMiniBar(breakdown) {
    const cats = COGS_CATS;
    let html = '<div class="cogs-bar" style="height:18px;">';
    cats.forEach(c => {
        const pct = breakdown[c.key] || 0;
        if (pct > 1) {
            html += `<div class="cogs-bar-segment ${c.cls}" style="width:${pct}%" title="${c.key}: ${pct.toFixed(1)}%">${pct >= 10 ? Math.round(pct) + '%' : ''}</div>`;
        }
    });
    html += '</div>';
    return html;
}

export function renderCOGSDetail(product) {
    const section = document.getElementById('cogsDetailSection');
    section.classList.remove('hidden');

    document.getElementById('cogsDetailTitle').textContent = `${product.itemCode} — ${product.description}`;

    // Info grid
    const info = document.getElementById('cogsDetailInfo');
    const mClass = product.margin >= 30 ? 'cogs-margin-good' : product.margin >= 15 ? 'cogs-margin-ok' : 'cogs-margin-low';
    info.innerHTML = `
        <div class="info-item">
            <div class="label">Gem. COGS/stuk</div>
            <div class="value">&euro; ${product.avgCogs.toFixed(2)}</div>
        </div>
        <div class="info-item">
            <div class="label">Verkoopprijs</div>
            <div class="value">${product.avgPrice > 0 ? '€ ' + product.avgPrice.toFixed(2) : '-'}</div>
        </div>
        <div class="info-item">
            <div class="label">Bruto marge</div>
            <div class="value ${mClass}">${product.avgPrice > 0 ? product.margin.toFixed(1) + '%' : '-'}</div>
        </div>
        <div class="info-item">
            <div class="label">Werkorders (gebruikt / totaal)</div>
            <div class="value">${product.woCount} / ${product.totalWoCount}</div>
        </div>
        <div class="info-item">
            <div class="label">Voorraad</div>
            <div class="value">${product.inStock ? '<span class="stock-ok">' + formatNumber(product.stockQty) + '</span>' : '<span class="stock-out">0</span>'}</div>
        </div>
        <div class="info-item">
            <div class="label">Prijsbron</div>
            <div class="value">${product.priceSource}</div>
        </div>
    `;

    // Cost breakdown bar (large)
    const barContainer = document.getElementById('cogsDetailBar');
    barContainer.innerHTML = buildMiniBar(product.breakdown).replace('height:18px', 'height:28px');

    // Breakdown details
    const bdContainer = document.getElementById('cogsDetailBreakdown');
    const cats = COGS_CATS.map(c => c.key);
    const colors = {};
    COGS_CATS.forEach(c => { colors[c.key] = c.color; });
    const totalCost = product.breakdown._total || 0;
    const totalQty = product.woDetails.reduce((s,w) => s + w.quantity, 0) || 1;
    bdContainer.innerHTML = '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:8px;">' +
        COGS_CATS.filter(c => (product.breakdown[c.key] || 0) > 0.5).map(c => {
            const pct = product.breakdown[c.key] || 0;
            const abs = totalCost > 0 ? (totalCost * pct / 100) : 0;
            return `<div style="min-width:100px;">
                <div style="font-size:0.75rem;color:#888;text-transform:uppercase;">${c.label}</div>
                <div style="font-weight:600;color:${c.color}">${pct.toFixed(1)}%</div>
                <div style="font-size:0.8rem;color:#666;">&euro; ${(abs / totalQty).toFixed(2)}/stuk</div>
            </div>`;
        }).join('') + '</div>';

    // Data quality warnings
    const warnContainer = document.getElementById('cogsDetailWarnings');
    if (warnContainer) {
        if (product.warnings && product.warnings.length > 0) {
            warnContainer.innerHTML = '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-top:12px;font-size:0.82rem;color:#856404;">' +
                '<strong>⚠ Data onvolledig in Exact:</strong><ul style="margin:6px 0 0 16px;padding:0;">' +
                product.warnings.map(w => '<li>' + w + '</li>').join('') + '</ul></div>';
            warnContainer.classList.remove('hidden');
        } else {
            warnContainer.innerHTML = '';
            warnContainer.classList.add('hidden');
        }
    }

    // Werkorder comparison table
    const woTbody = document.getElementById('cogsWOTableBody');
    woTbody.innerHTML = '';
    product.woDetails.forEach(wo => {
        const tr = document.createElement('tr');
        if (wo.isDeviant) tr.className = 'cogs-wo-deviant';
        const bd = wo.breakdown;
        const woTotal = bd.cashew + bd.roosteraar + bd.chocolateren + bd.bewerking + bd.folie + bd.doos + bd.overig;
        const costLabel = wo.isActual
            ? '<span style="color:#2d6a4f;font-size:0.7rem;" title="Gebaseerd op werkelijke materiaaluitgifte">● werkelijk</span>'
            : '<span style="color:#e67e22;font-size:0.7rem;" title="Gebaseerd op geplande hoeveelheden">○ gepland</span>';
        const pct = (key) => woTotal > 0 && bd[key] > 0 ? (bd[key]/woTotal*100).toFixed(0) + '%' : '-';
        tr.innerHTML = `
            <td><strong>${wo.nr}</strong> ${costLabel}</td>
            <td>${formatDate(wo.date)}</td>
            <td>${formatNumber(wo.quantity)}</td>
            <td>&euro; ${formatNumber(wo.totalCogs)}</td>
            <td>&euro; ${wo.cogsPerUnit.toFixed(2)}</td>
            <td>${pct('cashew')}</td>
            <td>${pct('roosteraar')}</td>
            <td>${pct('chocolateren')}</td>
            <td>${pct('bewerking')}</td>
            <td>${pct('folie')}</td>
            <td>${pct('doos')}</td>
            <td>${pct('overig')}</td>
            <td>${wo.isDeviant ? '<span class="cogs-deviation-flag">' + (wo.deviation > 0 ? '+' : '') + wo.deviation.toFixed(1) + '%</span>' : '<span style="color:#2d6a4f;">OK</span>'}</td>
        `;
        woTbody.appendChild(tr);
    });
}

