import {
    shopOrders, materialPlans, shopOrderSubcontractor,
    purchaseOrders, purchaseOrderLines, stockData, supplierNames,
    currentFilter, setCurrentFilter,
    currentSupplier, setCurrentSupplier,
    selectedOrderId, setSelectedOrderId,
} from '../shared/state.js';
import { formatDate, formatNumber } from '../shared/utils.js';

// === LOGIC ===

export function getWorkOrdersForSupplier(supplierCode) {
    // Koppeling via uitbesteed werk (routing step plans)
    return shopOrders.filter(order => shopOrderSubcontractor[order.nr] === supplierCode);
}

export function getPOsForSupplier(supplierCode) {
    return purchaseOrders.filter(po => po.supplierCode === supplierCode);
}

export function getPOLinesForPO(orderNr) {
    return purchaseOrderLines.filter(l => l.orderNr === orderNr);
}

export function getPOLinesForSupplier(supplierCode) {
    const poNrs = new Set(getPOsForSupplier(supplierCode).map(po => po.nr));
    return purchaseOrderLines.filter(l => poNrs.has(l.orderNr));
}

export function matchesFilter(status) {
    if (currentFilter === "all") return true;
    return status === parseInt(currentFilter);
}

export function getRelevantSuppliers() {
    // Only show suppliers that have POs or work orders after cutoff date
    const DATE_CUTOFF = '2026-01-01';
    const relevant = new Set();
    // Suppliers with POs after cutoff
    purchaseOrders.forEach(po => {
        if (po.orderDate >= DATE_CUTOFF || po.receiptDate >= DATE_CUTOFF) {
            relevant.add(po.supplierCode);
        }
    });
    // Suppliers with matching work orders after cutoff
    for (const code of Object.keys(supplierNames)) {
        const orders = getWorkOrdersForSupplier(code);
        if (orders.some(o => o.plannedDate >= DATE_CUTOFF)) relevant.add(code);
    }
    return [...relevant].sort((a, b) => {
        const nameA = supplierNames[a] || a;
        const nameB = supplierNames[b] || b;
        return nameA.localeCompare(nameB);
    });
}

// === UI ===

export function initDropdown() {
    const sel = document.getElementById('supplierSelect');
    const codes = getRelevantSuppliers();
    codes.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = supplierNames[code] || code;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
        setCurrentSupplier(sel.value || null);
        setSelectedOrderId(null);
        render();
    });
}

export function setFilter(btn) {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentFilter(btn.dataset.status);
    selectedOrderId = null;
    render();
}


export function shopOrderStatusBadge(status) {
    switch (status) {
        case 10: return '<span class="badge badge-planned">Gepland</span>';
        case 20: return '<span class="badge badge-released">Vrijgegeven</span>';
        case 30: return '<span class="badge badge-progress">In uitvoering</span>';
        case 40: return '<span class="badge badge-complete">Gereed</span>';
        default: return '<span class="badge">' + status + '</span>';
    }
}

export function poStatusBadge(status) {
    switch (status) {
        case 10: return '<span class="badge badge-open">Open</span>';
        case 20: return '<span class="badge badge-approved">Goedgekeurd</span>';
        case 30: return '<span class="badge badge-received">Ontvangen</span>';
        case 40: return '<span class="badge badge-complete">Afgehandeld</span>';
        default: return '<span class="badge">' + status + '</span>';
    }
}

export function getMaterialCategory(itemCode) {
    if (itemCode.startsWith('2001') || itemCode.startsWith('2002')) return 'grondstof';
    if (itemCode.startsWith('1003')) return 'overig';
    // Distinguish folie from dozen by description or code patterns
    const desc = (stockData[itemCode] || {}).description || '';
    // 2003 items: check if it's a doos
    if (itemCode.startsWith('2003')) {
        return 'folie'; // will be refined by description in material card rendering
    }
    return 'overig';
}

export function getMaterialCategoryByDesc(itemCode, description) {
    if (itemCode.startsWith('2001') || itemCode.startsWith('2002')) return 'grondstof';
    if (itemCode.startsWith('2003')) {
        const d = description.toLowerCase();
        if (d.includes('doos') || d.includes('deksel') || d.includes('onderkant')) return 'doos';
        if (d.includes('folie') || d.includes('mt') || d.includes('pc')) return 'folie';
        return 'folie';
    }
    if (itemCode.startsWith('1003')) return 'overig';
    return 'overig';
}

export function getStockClass(stock, needed) {
    if (stock <= 0) return 'stock-out';
    if (stock < needed) return 'stock-low';
    return 'stock-ok';
}

export function render() {
    const filtersSection = document.getElementById('filtersSection');
    const poSection = document.getElementById('poSection');
    const ordersSection = document.getElementById('ordersSection');
    const detailSection = document.getElementById('detailSection');
    const emailSection = document.getElementById('emailSection');

    if (!currentSupplier) {
        filtersSection.classList.add('hidden');
        poSection.classList.add('hidden');
        ordersSection.classList.add('hidden');
        detailSection.classList.add('hidden');
        emailSection.classList.add('hidden');
        return;
    }

    filtersSection.classList.remove('hidden');

    const DATE_CUTOFF = '2026-01-01';

    // Work Orders (eerst)
    const allWorkOrders = getWorkOrdersForSupplier(currentSupplier);
    const filteredWorkOrders = allWorkOrders.filter(o =>
        matchesFilter(o.status) && o.plannedDate >= DATE_CUTOFF
    );

    if (filteredWorkOrders.length > 0) {
        ordersSection.classList.remove('hidden');
        renderOrdersTable(filteredWorkOrders);
    } else {
        ordersSection.classList.add('hidden');
    }

    // Purchase Orders (daarna)
    const allPOs = getPOsForSupplier(currentSupplier);
    const allPOLines = getPOLinesForSupplier(currentSupplier);
    const filteredPOs = allPOs.filter(po =>
        matchesFilter(po.status) && (po.orderDate >= DATE_CUTOFF || po.receiptDate >= DATE_CUTOFF)
    );

    if (filteredPOs.length > 0) {
        poSection.classList.remove('hidden');
        renderPOTable(filteredPOs, allPOLines);
    } else {
        poSection.classList.add('hidden');
    }

    // Detail
    if (selectedOrderId) {
        detailSection.classList.remove('hidden');
        emailSection.classList.remove('hidden');
        renderDetail(selectedOrderId);
    } else {
        detailSection.classList.add('hidden');
        emailSection.classList.add('hidden');
    }
}

export function renderPOTable(pos, allLines) {
    const tbody = document.querySelector('#poTable tbody');
    tbody.innerHTML = '';
    document.getElementById('poCount').textContent = '(' + pos.length + ')';

    // Group PO lines by PO nr, then show lines
    const filteredPoNrs = new Set(pos.map(p => p.nr));
    const linesToShow = allLines.filter(l => filteredPoNrs.has(l.orderNr));

    // Group by PO
    const byPO = {};
    linesToShow.forEach(l => {
        if (!byPO[l.orderNr]) byPO[l.orderNr] = [];
        byPO[l.orderNr].push(l);
    });

    // If no lines, show PO-level rows
    if (linesToShow.length === 0) {
        pos.forEach(po => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${po.nr}</td>
                <td>${formatDate(po.orderDate)}</td>
                <td>${formatDate(po.receiptDate)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${poStatusBadge(po.status)}</td>
                <td>-</td>
            `;
            tbody.appendChild(tr);
        });
        return;
    }

    // Show lines grouped by PO
    const sortedPOs = pos.slice().sort((a, b) => b.nr - a.nr);
    sortedPOs.forEach(po => {
        const lines = byPO[po.nr] || [];
        if (lines.length === 0) {
            // PO without lines
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${po.nr}</td>
                <td>${formatDate(po.orderDate)}</td>
                <td>${formatDate(po.receiptDate)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${poStatusBadge(po.status)}</td>
                <td>-</td>
            `;
            tbody.appendChild(tr);
        } else {
            lines.forEach((line, idx) => {
                const tr = document.createElement('tr');
                if (line.shopOrderNr) {
                    tr.style.cursor = 'pointer';
                    tr.onclick = () => selectWorkOrder(line.shopOrderNr);
                }
                tr.innerHTML = `
                    <td>${idx === 0 ? po.nr : ''}</td>
                    <td>${idx === 0 ? formatDate(po.orderDate) : ''}</td>
                    <td>${formatDate(line.receiptDate)}</td>
                    <td><strong>${line.itemCode}</strong> ${line.description}</td>
                    <td>${formatNumber(line.quantity)}</td>
                    <td>${formatNumber(line.received)}</td>
                    <td>${poStatusBadge(po.status)}</td>
                    <td>${line.shopOrderNr ? '<a href="#" onclick="event.preventDefault(); selectWorkOrder(' + line.shopOrderNr + ')">#' + line.shopOrderNr + '</a>' : '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    });
}

export function selectWorkOrder(orderNr) {
    const order = shopOrders.find(o => o.nr === orderNr);
    if (order) {
        setSelectedOrderId(order.id);
        // Highlight row in orders table
        document.querySelectorAll('#ordersTable tbody tr').forEach(tr => {
            tr.classList.toggle('selected', tr.dataset.orderId === order.id);
        });
        render();
        document.getElementById('detailSection').scrollIntoView({ behavior: 'smooth' });
    }
}

export function renderOrdersTable(orders) {
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = '';
    document.getElementById('orderCount').textContent = '(' + orders.length + ')';

    const sorted = orders.slice().sort((a, b) => {
        if (a.plannedDate < b.plannedDate) return -1;
        if (a.plannedDate > b.plannedDate) return 1;
        return a.nr - b.nr;
    });

    sorted.forEach(order => {
        const tr = document.createElement('tr');
        tr.dataset.orderId = order.id;
        if (order.id === selectedOrderId) tr.classList.add('selected');
        tr.onclick = () => {
            setSelectedOrderId(order.id);
            render();
            document.getElementById('detailSection').scrollIntoView({ behavior: 'smooth' });
        };
        tr.innerHTML = `
            <td>${order.nr}</td>
            <td>${order.itemCode}</td>
            <td>${order.description}</td>
            <td>${formatNumber(order.quantity)}</td>
            <td>${formatDate(order.plannedDate)}</td>
            <td>${shopOrderStatusBadge(order.status)}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function renderDetail(orderId) {
    const order = shopOrders.find(o => o.id === orderId);
    if (!order) return;

    // Order info
    const infoGrid = document.getElementById('orderInfo');
    infoGrid.innerHTML = `
        <div class="info-item">
            <div class="label">Werkorder</div>
            <div class="value">#${order.nr}</div>
        </div>
        <div class="info-item">
            <div class="label">Product</div>
            <div class="value">${order.itemCode}</div>
        </div>
        <div class="info-item">
            <div class="label">Omschrijving</div>
            <div class="value">${order.description}</div>
        </div>
        <div class="info-item">
            <div class="label">Aantal</div>
            <div class="value">${formatNumber(order.quantity)}</div>
        </div>
        <div class="info-item">
            <div class="label">Plandatum</div>
            <div class="value">${formatDate(order.plannedDate)}</div>
        </div>
        <div class="info-item">
            <div class="label">Status</div>
            <div class="value">${shopOrderStatusBadge(order.status)}</div>
        </div>
    `;

    // Materials
    const materials = materialPlans[orderId] || [];
    const grondstoffen = materials.filter(m => m.itemCode.startsWith('2001') || m.itemCode.startsWith('2002'));
    const folies = materials.filter(m => {
        if (!m.itemCode.startsWith('2003') && !m.itemCode.startsWith('1003')) return false;
        const d = m.description.toLowerCase();
        return d.includes('folie') || m.itemCode.startsWith('1003');
    });
    const dozen = materials.filter(m => {
        if (!m.itemCode.startsWith('2003')) return false;
        const d = m.description.toLowerCase();
        return d.includes('doos') || d.includes('deksel') || d.includes('onderkant');
    });
    const overig = materials.filter(m => {
        if (grondstoffen.includes(m) || folies.includes(m) || dozen.includes(m)) return false;
        return true;
    });

    renderMaterialCards('grondstofGrid', grondstoffen, 'grondstof');
    renderMaterialCards('folieGrid', folies, 'folie');
    renderMaterialCards('doosGrid', dozen, 'doos');

    const overigSection = document.getElementById('overigSection');
    if (overig.length > 0) {
        overigSection.classList.remove('hidden');
        renderMaterialCards('overigGrid', overig, 'overig');
    } else {
        overigSection.classList.add('hidden');
    }

    // Email
    generateEmail(order, materials);
}

export function renderMaterialCards(gridId, materials, category) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';

    if (materials.length === 0) {
        grid.innerHTML = '<div style="color:#aaa; font-size:0.85rem; padding:8px;">Geen items</div>';
        return;
    }

    materials.forEach(m => {
        const s = stockData[m.itemCode];
        const stock = s ? s.stock : 0;
        const unit = s ? s.unit : m.unit;

        let stockHtml;
        if (category === 'grondstof') {
            // Grondstoffen worden altijd later geleverd
            stockHtml = '<span style="color:#888; font-style:italic;">Wordt later geleverd</span>';
        } else {
            // Folie en dozen: alleen op voorraad ja/nee
            if (stock >= m.quantity) {
                stockHtml = '<span class="stock-ok">&#10003; Op voorraad</span>';
            } else if (stock > 0) {
                stockHtml = '<span class="stock-out">&#10007; Onvoldoende op voorraad</span>';
            } else {
                stockHtml = '<span class="stock-out">&#10007; Niet op voorraad</span>';
            }
        }

        const card = document.createElement('div');
        card.className = `material-card ${category}`;
        card.innerHTML = `
            <div class="label">${m.itemCode}</div>
            <div class="value">${m.description}</div>
            <div class="detail">
                Nodig: <strong>${formatNumber(m.quantity)} ${unit}</strong><br>
                ${stockHtml}
            </div>
        `;
        grid.appendChild(card);
    });
}

export function generateEmail(order, materials) {
    const supplierName = supplierNames[currentSupplier] || currentSupplier;
    const subject = `Materialen werkorder #${order.nr} - ${order.description}`;
    document.getElementById('emailSubject').value = subject;

    let body = `Beste ${supplierName},\n\n`;
    body += `Betreft werkorder #${order.nr}: ${order.description}\n`;
    body += `Plandatum: ${formatDate(order.plannedDate)}\n`;
    body += `Aantal: ${formatNumber(order.quantity)}\n\n`;

    // Grondstoffen
    const grondstoffen = materials.filter(m => getMaterialCategoryByDesc(m.itemCode, m.description) === 'grondstof');
    const folie = materials.filter(m => getMaterialCategoryByDesc(m.itemCode, m.description) === 'folie');
    const dozen = materials.filter(m => getMaterialCategoryByDesc(m.itemCode, m.description) === 'doos');

    if (grondstoffen.length > 0) {
        body += `GRONDSTOFFEN (worden later geleverd):\n`;
        grondstoffen.forEach(m => {
            const unit = (stockData[m.itemCode] || {}).unit || m.unit;
            body += `- ${m.itemCode} ${m.description}: ${formatNumber(m.quantity)} ${unit}\n`;
        });
        body += `\n`;
    }

    if (folie.length > 0) {
        body += `FOLIE:\n`;
        folie.forEach(m => {
            const s = stockData[m.itemCode];
            const stock = s ? s.stock : 0;
            const unit = s ? s.unit : m.unit;
            const status = stock >= m.quantity ? 'Op voorraad' : 'Niet op voorraad';
            body += `- ${m.itemCode} ${m.description}: ${formatNumber(m.quantity)} ${unit} \u2192 ${status}\n`;
        });
        body += `\n`;
    }

    if (dozen.length > 0) {
        body += `DOZEN / VERPAKKING:\n`;
        dozen.forEach(m => {
            const s = stockData[m.itemCode];
            const stock = s ? s.stock : 0;
            const unit = s ? s.unit : m.unit;
            const status = stock >= m.quantity ? 'Op voorraad' : 'Niet op voorraad';
            body += `- ${m.itemCode} ${m.description}: ${formatNumber(m.quantity)} ${unit} \u2192 ${status}\n`;
        });
        body += `\n`;
    }

    body += `Graag ontvangen wij een bevestiging van de levering.\n\n`;
    body += `Met vriendelijke groet,\nJohnny Cashew`;

    document.getElementById('emailBody').textContent = body;
}

export function copyEmail() {
    const subject = document.getElementById('emailSubject').value;
    const body = document.getElementById('emailBody').textContent;
    const text = `Onderwerp: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(() => {
        alert('E-mail gekopieerd naar klembord!');
    });
}

export function openMailClient() {
    const to = document.getElementById('emailTo').value;
    const subject = encodeURIComponent(document.getElementById('emailSubject').value);
    const body = encodeURIComponent(document.getElementById('emailBody').textContent);
    const mailtoUrl = `mailto:${to}?subject=${subject}&body=${body}`;

    // mailto URLs have a max length (~2000 chars). If too long, copy to clipboard instead.
    if (mailtoUrl.length > 2000) {
        // Try opening with truncated body, and copy full text to clipboard
        const maxBody = 1500 - subject.length - to.length;
        const truncBody = encodeURIComponent(document.getElementById('emailBody').textContent.substring(0, maxBody) + '\n\n[Volledige tekst gekopieerd naar klembord - plak in email]');
        const shortUrl = `mailto:${to}?subject=${subject}&body=${truncBody}`;

        // Copy full email to clipboard
        const fullText = document.getElementById('emailBody').textContent;
        navigator.clipboard.writeText(fullText).then(() => {
            alert('E-mail is te lang voor mailto. De volledige tekst is naar je klembord gekopieerd — plak het in de geopende email.');
            window.open(shortUrl, '_blank');
        });
    } else {
        window.open(mailtoUrl, '_blank');
    }
}

