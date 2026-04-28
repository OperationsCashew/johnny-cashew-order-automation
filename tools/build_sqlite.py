#!/usr/bin/env python3
"""
Bouw SQLite database vanuit Exact Online dataset.json
- Converteert OData dates naar ISO 8601
- Verwijdert __metadata overhead
- Labelt GL-rekeningen en leveranciers
- Maakt indexen voor snelle queries
"""

import json
import re
import sqlite3
import os
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATASET_FILE = SCRIPT_DIR / "dataset.json"
DB_FILE = SCRIPT_DIR / "exact.db"


def parse_odata_date(val):
    """Converteer /Date(1605484800000)/ naar ISO 8601 string."""
    if not val or not isinstance(val, str):
        return val
    m = re.match(r"/Date\((-?\d+)\)/", val)
    if m:
        ts = int(m.group(1)) / 1000
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        except (OSError, ValueError):
            return val
    return val


def clean_record(record: dict) -> dict:
    """Verwijder __metadata, converteer dates."""
    cleaned = {}
    for k, v in record.items():
        if k == "__metadata":
            continue
        if isinstance(v, str) and "/Date(" in v:
            v = parse_odata_date(v)
        cleaned[k] = v
    return cleaned


def create_tables(cur):
    """Maak alle tabellen aan."""

    # GL-rekeningen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gl_accounts (
            code TEXT PRIMARY KEY,
            description TEXT,
            balance_side TEXT,
            type_description TEXT,
            -- Labels
            category TEXT,        -- 'balans' / 'wv' (winst & verlies)
            subcategory TEXT      -- bijv. 'marketing', 'productie', 'overhead'
        )
    """)

    # Transactieregels — de kern van de dataset
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transaction_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_number INTEGER,
            financial_year INTEGER,
            financial_period INTEGER,
            date TEXT,
            gl_account_guid TEXT,
            gl_account_code TEXT,
            gl_account_description TEXT,
            description TEXT,
            amount_fc REAL,
            account_code TEXT,
            account_name TEXT,
            journal_code TEXT,
            journal_description TEXT,
            invoice_number TEXT,
            document TEXT
        )
    """)

    # Shop orders
    cur.execute("""
        CREATE TABLE IF NOT EXISTS shop_orders (
            nr TEXT PRIMARY KEY,
            id TEXT,
            status INTEGER,
            status_text TEXT,
            item_code TEXT,
            description TEXT,
            quantity REAL,
            delivered REAL,
            planned_date TEXT
        )
    """)

    # Shop order materialen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS shop_order_materials (
            id TEXT PRIMARY KEY,
            shop_order TEXT,
            item TEXT,
            item_code TEXT,
            item_description TEXT,
            line_number INTEGER,
            planned_amount_fc REAL,
            planned_quantity REAL,
            planned_price_fc REAL,
            planned_quantity_factor REAL,
            remaining_quantity REAL,
            status INTEGER,
            status_description TEXT,
            unit TEXT,
            unit_description TEXT,
            planned_date TEXT,
            type INTEGER,
            backflush INTEGER,
            waste_percentage REAL
        )
    """)

    # Relaties (leveranciers/klanten) — wordt gevuld zodra sync die ophaalt
    cur.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT,
            status TEXT,
            city TEXT,
            country TEXT,
            is_supplier INTEGER,
            is_reseller INTEGER,
            is_sales INTEGER,
            email TEXT,
            phone TEXT,
            -- Labels
            supplier_type TEXT    -- bijv. 'grondstof', 'verpakking', 'diensten', 'marketing'
        )
    """)

    # Artikelen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS items (
            code TEXT PRIMARY KEY,
            description TEXT,
            cost_price_standard REAL,
            is_make_item INTEGER,
            is_purchase_item INTEGER,
            is_sales_item INTEGER,
            item_group TEXT,
            item_group_description TEXT,
            stock REAL
        )
    """)

    # Inkooporders
    cur.execute("""
        CREATE TABLE IF NOT EXISTS purchase_order_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_order_id TEXT,
            order_number INTEGER,
            order_date TEXT,
            line_number INTEGER,
            item_code TEXT,
            item_description TEXT,
            supplier_code TEXT,
            supplier_name TEXT,
            quantity REAL,
            received_quantity REAL,
            amount_fc REAL,
            unit_price REAL,
            receipt_date TEXT,
            description TEXT,
            project TEXT,
            project_description TEXT
        )
    """)

    # Voorraad
    cur.execute("""
        CREATE TABLE IF NOT EXISTS stock_positions (
            item_code TEXT PRIMARY KEY,
            item_description TEXT,
            current_stock REAL,
            planned_stock_in REAL,
            planned_stock_out REAL
        )
    """)

    # Routing step plans (uitbesteed werk)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS routing_step_plans (
            id TEXT PRIMARY KEY,
            shop_order TEXT,
            account TEXT,
            account_number TEXT,
            account_name TEXT,
            operation_code TEXT,
            operation_description TEXT,
            planned_start_date TEXT,
            planned_end_date TEXT,
            status INTEGER,
            status_description TEXT,
            total_cost_dc REAL,
            workcenter TEXT,
            workcenter_code TEXT,
            workcenter_description TEXT
        )
    """)

    # Verkooporders — headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sales_order_headers (
            id TEXT PRIMARY KEY,
            order_number INTEGER,
            order_date TEXT,
            deliver_to TEXT,
            deliver_to_name TEXT,
            delivery_date TEXT,
            description TEXT,
            status INTEGER,
            status_description TEXT,
            amount_fc REAL,
            currency TEXT,
            order_to TEXT,
            order_to_name TEXT,
            your_ref TEXT
        )
    """)

    # Verkooporders — regels
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sales_order_lines (
            id TEXT PRIMARY KEY,
            order_id TEXT,
            order_number INTEGER,
            item_code TEXT,
            item_description TEXT,
            quantity REAL,
            delivered REAL,
            amount_fc REAL,
            unit_price REAL,
            delivery_date TEXT,
            description TEXT,
            line_number INTEGER,
            net_price REAL,
            discount REAL
        )
    """)

    # Verkoopfacturen — headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sales_invoice_headers (
            id TEXT PRIMARY KEY,
            invoice_number INTEGER,
            invoice_date TEXT,
            invoice_to TEXT,
            invoice_to_name TEXT,
            order_date TEXT,
            status INTEGER,
            status_description TEXT,
            amount_fc REAL,
            amount_dc REAL,
            vat_amount_fc REAL,
            currency TEXT,
            payment_condition TEXT,
            payment_condition_description TEXT,
            journal TEXT,
            description TEXT,
            your_ref TEXT
        )
    """)

    # Verkoopfacturen — regels
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sales_invoice_lines (
            id TEXT PRIMARY KEY,
            invoice_id TEXT,
            invoice_number INTEGER,
            item_code TEXT,
            item_description TEXT,
            quantity REAL,
            amount_fc REAL,
            unit_price REAL,
            net_price REAL,
            vat_amount_fc REAL,
            discount REAL,
            description TEXT,
            line_number INTEGER
        )
    """)

    # Goederenleveringen — headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_delivery_headers (
            id TEXT PRIMARY KEY,
            delivery_number INTEGER,
            delivery_date TEXT,
            deliver_to TEXT,
            deliver_to_name TEXT,
            description TEXT,
            entry_number INTEGER
        )
    """)

    # Goederenleveringen — regels
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_delivery_lines (
            id TEXT PRIMARY KEY,
            delivery_id TEXT,
            item_code TEXT,
            item_description TEXT,
            quantity_delivered REAL,
            quantity_ordered REAL,
            sales_order_number INTEGER,
            sales_order_line_number INTEGER
        )
    """)

    # Inkoopfacturen — headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS purchase_invoice_headers (
            id TEXT PRIMARY KEY,
            invoice_number INTEGER,
            invoice_date TEXT,
            supplier TEXT,
            supplier_name TEXT,
            amount_fc REAL,
            vat_amount_fc REAL,
            status INTEGER,
            status_description TEXT,
            currency TEXT,
            journal TEXT,
            payment_condition TEXT,
            description TEXT,
            your_ref TEXT,
            due_date TEXT
        )
    """)

    # Inkoopfacturen — regels
    cur.execute("""
        CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
            id TEXT PRIMARY KEY,
            invoice_id TEXT,
            item_code TEXT,
            item_description TEXT,
            quantity REAL,
            amount_fc REAL,
            unit_price REAL,
            net_price REAL,
            vat_amount_fc REAL,
            description TEXT,
            line_number INTEGER,
            project TEXT,
            project_description TEXT
        )
    """)

    # Goederenontvangsten — headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_receipt_headers (
            id TEXT PRIMARY KEY,
            receipt_number INTEGER,
            receipt_date TEXT,
            supplier TEXT,
            supplier_name TEXT,
            description TEXT
        )
    """)

    # Goederenontvangsten — regels
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_receipt_lines (
            id TEXT PRIMARY KEY,
            receipt_id TEXT,
            item_code TEXT,
            item_description TEXT,
            quantity_ordered REAL,
            quantity_received REAL,
            purchase_order_number INTEGER,
            purchase_order_line_number INTEGER
        )
    """)

    # Leverancier-artikel koppelingen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS supplier_items (
            id TEXT PRIMARY KEY,
            supplier TEXT,
            supplier_code TEXT,
            supplier_name TEXT,
            item TEXT,
            item_code TEXT,
            item_description TEXT,
            purchase_price REAL,
            purchase_unit TEXT,
            purchase_lead_time INTEGER,
            minimum_quantity REAL
        )
    """)

    # Stuklijst-materialen (BOM / recepturen)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bom_materials (
            id TEXT PRIMARY KEY,
            item TEXT,
            item_code TEXT,
            item_description TEXT,
            sub_item TEXT,
            sub_item_code TEXT,
            sub_item_description TEXT,
            quantity REAL,
            quantity_batch REAL,
            cost_price REAL,
            net_weight REAL,
            net_weight_unit TEXT,
            waste_percentage REAL,
            backflush INTEGER,
            type INTEGER,
            line_number INTEGER,
            calculator_type INTEGER
        )
    """)

    # Stuklijst-versies
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bom_versions (
            id TEXT PRIMARY KEY,
            item TEXT,
            item_code TEXT,
            item_description TEXT,
            version_number INTEGER,
            description TEXT,
            is_default INTEGER,
            status INTEGER,
            status_description TEXT,
            quantity_batch REAL
        )
    """)

    # Productie-gereedmeldingen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS shop_order_receipts (
            id TEXT PRIMARY KEY,
            shop_order TEXT,
            shop_order_number INTEGER,
            item_code TEXT,
            item_description TEXT,
            quantity REAL,
            transaction_date TEXT,
            unit TEXT,
            unit_description TEXT,
            warehouse TEXT,
            warehouse_code TEXT
        )
    """)

    # Materiaaluitgiften
    cur.execute("""
        CREATE TABLE IF NOT EXISTS material_issues (
            id TEXT PRIMARY KEY,
            shop_order TEXT,
            shop_order_number INTEGER,
            item_code TEXT,
            item_description TEXT,
            quantity REAL,
            transaction_date TEXT,
            unit TEXT,
            unit_description TEXT,
            warehouse TEXT,
            warehouse_code TEXT
        )
    """)

    # Bewerkingen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS operations (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT,
            type INTEGER,
            status INTEGER
        )
    """)

    # Werkplaatsen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS workcenters (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT,
            production_area TEXT,
            type INTEGER,
            status INTEGER
        )
    """)

    # Batchnummers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS batch_numbers (
            id TEXT PRIMARY KEY,
            batch_number TEXT,
            item TEXT,
            item_code TEXT,
            item_description TEXT,
            expiry_date TEXT,
            is_blocked INTEGER,
            quantity REAL
        )
    """)

    # Voorraad per batch
    cur.execute("""
        CREATE TABLE IF NOT EXISTS stock_batch_numbers (
            id TEXT PRIMARY KEY,
            batch_number TEXT,
            item_code TEXT,
            item_description TEXT,
            warehouse TEXT,
            warehouse_code TEXT,
            warehouse_description TEXT,
            stock REAL
        )
    """)

    # Artikelgroepen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS item_groups (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT
        )
    """)

    # Magazijnen
    cur.execute("""
        CREATE TABLE IF NOT EXISTS warehouses (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT,
            main INTEGER
        )
    """)

    # Eenheden
    cur.execute("""
        CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT,
            type TEXT,
            active INTEGER
        )
    """)

    # Dagboeken
    cur.execute("""
        CREATE TABLE IF NOT EXISTS journals (
            id TEXT PRIMARY KEY,
            code TEXT,
            description TEXT,
            type INTEGER,
            type_description TEXT
        )
    """)

    # Sync metadata
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)


def create_indexes(cur):
    """Maak indexen voor snelle queries."""
    indexes = [
        # Transacties
        "CREATE INDEX IF NOT EXISTS idx_tl_entry ON transaction_lines(entry_number)",
        "CREATE INDEX IF NOT EXISTS idx_tl_year ON transaction_lines(financial_year)",
        "CREATE INDEX IF NOT EXISTS idx_tl_gl_code ON transaction_lines(gl_account_code)",
        "CREATE INDEX IF NOT EXISTS idx_tl_account_code ON transaction_lines(account_code)",
        "CREATE INDEX IF NOT EXISTS idx_tl_date ON transaction_lines(date)",
        "CREATE INDEX IF NOT EXISTS idx_tl_year_gl ON transaction_lines(financial_year, gl_account_code)",
        "CREATE INDEX IF NOT EXISTS idx_tl_journal ON transaction_lines(journal_code)",
        "CREATE INDEX IF NOT EXISTS idx_tl_invoice ON transaction_lines(invoice_number)",
        # Shop orders
        "CREATE INDEX IF NOT EXISTS idx_so_status ON shop_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_so_item ON shop_orders(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_som_shop_order ON shop_order_materials(shop_order)",
        "CREATE INDEX IF NOT EXISTS idx_som_item ON shop_order_materials(item_code)",
        # Relaties
        "CREATE INDEX IF NOT EXISTS idx_acc_code ON accounts(code)",
        "CREATE INDEX IF NOT EXISTS idx_acc_supplier ON accounts(is_supplier)",
        # Routing step plans
        "CREATE INDEX IF NOT EXISTS idx_rsp_shop_order ON routing_step_plans(shop_order)",
        "CREATE INDEX IF NOT EXISTS idx_rsp_account ON routing_step_plans(account_number)",
        # Verkoop
        "CREATE INDEX IF NOT EXISTS idx_soh_order_date ON sales_order_headers(order_date)",
        "CREATE INDEX IF NOT EXISTS idx_soh_status ON sales_order_headers(status)",
        "CREATE INDEX IF NOT EXISTS idx_soh_order_to ON sales_order_headers(order_to)",
        "CREATE INDEX IF NOT EXISTS idx_sol_order_id ON sales_order_lines(order_id)",
        "CREATE INDEX IF NOT EXISTS idx_sol_item ON sales_order_lines(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_sih_invoice_date ON sales_invoice_headers(invoice_date)",
        "CREATE INDEX IF NOT EXISTS idx_sih_invoice_to ON sales_invoice_headers(invoice_to)",
        "CREATE INDEX IF NOT EXISTS idx_sil_invoice_id ON sales_invoice_lines(invoice_id)",
        "CREATE INDEX IF NOT EXISTS idx_sil_item ON sales_invoice_lines(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_gdh_date ON goods_delivery_headers(delivery_date)",
        "CREATE INDEX IF NOT EXISTS idx_gdl_delivery ON goods_delivery_lines(delivery_id)",
        "CREATE INDEX IF NOT EXISTS idx_gdl_item ON goods_delivery_lines(item_code)",
        # Inkoop extra
        "CREATE INDEX IF NOT EXISTS idx_pih_date ON purchase_invoice_headers(invoice_date)",
        "CREATE INDEX IF NOT EXISTS idx_pih_supplier ON purchase_invoice_headers(supplier)",
        "CREATE INDEX IF NOT EXISTS idx_pil_invoice ON purchase_invoice_lines(invoice_id)",
        "CREATE INDEX IF NOT EXISTS idx_pil_item ON purchase_invoice_lines(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_grh_date ON goods_receipt_headers(receipt_date)",
        "CREATE INDEX IF NOT EXISTS idx_grl_receipt ON goods_receipt_lines(receipt_id)",
        "CREATE INDEX IF NOT EXISTS idx_grl_item ON goods_receipt_lines(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_si_supplier ON supplier_items(supplier_code)",
        "CREATE INDEX IF NOT EXISTS idx_si_item ON supplier_items(item_code)",
        # Productie
        "CREATE INDEX IF NOT EXISTS idx_bom_item ON bom_materials(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_bom_sub ON bom_materials(sub_item_code)",
        "CREATE INDEX IF NOT EXISTS idx_bomv_item ON bom_versions(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_sor_shop_order ON shop_order_receipts(shop_order)",
        "CREATE INDEX IF NOT EXISTS idx_sor_item ON shop_order_receipts(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_mi_shop_order ON material_issues(shop_order)",
        "CREATE INDEX IF NOT EXISTS idx_mi_item ON material_issues(item_code)",
        # Batch/voorraad
        "CREATE INDEX IF NOT EXISTS idx_bn_item ON batch_numbers(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_sbn_item ON stock_batch_numbers(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_sbn_batch ON stock_batch_numbers(batch_number)",
        # Inkoop regels
        "CREATE INDEX IF NOT EXISTS idx_pol_supplier ON purchase_order_lines(supplier_code)",
        "CREATE INDEX IF NOT EXISTS idx_pol_item ON purchase_order_lines(item_code)",
    ]
    for idx in indexes:
        cur.execute(idx)


def label_gl_accounts(cur):
    """Label GL-rekeningen met categorie en subcategorie."""
    # Balansrekeningen (0xxx, 1xxx, 2xxx)
    # W&V rekeningen (4xxx, 8xxx, 9xxx)
    labels = {
        # Balans — Vaste activa
        "0050": ("balans", "immaterieel", "Ontwikkelingskosten JCN"),
        "0055": ("balans", "immaterieel", "Afschrijving ontwikkelingskosten"),
        "0060": ("balans", "immaterieel", "Keten verduurzaming"),
        "0065": ("balans", "immaterieel", "Afschrijving keten verduurzaming"),
        "0070": ("balans", "immaterieel", "Governance"),
        "0075": ("balans", "immaterieel", "Afschrijving governance"),
        # W&V — Kosten
        "4530": ("wv", "marketing", "Reclamekosten"),
        "4535": ("wv", "marketing", "Verpakkingskosten"),
        "4590": ("wv", "verkoop", "Verkoopkosten"),
        "4740": ("wv", "overhead", "Advieskosten"),
        "4750": ("wv", "overhead", "Opstartkosten JCN"),
        "4341": ("wv", "productie", "Certificeringen - Premiums"),
    }

    for code, (cat, subcat, _desc) in labels.items():
        cur.execute("""
            UPDATE gl_accounts SET category = ?, subcategory = ?
            WHERE code = ?
        """, (cat, subcat, code))

    # Bulk labeling op basis van code-ranges
    cur.execute("UPDATE gl_accounts SET category = 'balans' WHERE CAST(code AS INTEGER) < 4000 AND category IS NULL")
    cur.execute("UPDATE gl_accounts SET category = 'wv' WHERE CAST(code AS INTEGER) >= 4000 AND category IS NULL")

    # Subcategorieën op basis van bekende ranges
    subcategory_rules = [
        ("CAST(code AS INTEGER) BETWEEN 0 AND 99", "immaterieel"),
        ("CAST(code AS INTEGER) BETWEEN 100 AND 199", "materiele_activa"),
        ("CAST(code AS INTEGER) BETWEEN 200 AND 299", "financiele_activa"),
        ("CAST(code AS INTEGER) BETWEEN 300 AND 399", "voorraden"),
        ("CAST(code AS INTEGER) BETWEEN 400 AND 499", "debiteuren"),  # 04xx in Exact
        ("CAST(code AS INTEGER) BETWEEN 1000 AND 1999", "liquide_middelen"),
        ("CAST(code AS INTEGER) BETWEEN 2000 AND 2999", "passiva"),
        ("CAST(code AS INTEGER) BETWEEN 4000 AND 4299", "omzet"),
        ("CAST(code AS INTEGER) BETWEEN 4300 AND 4399", "productiekosten"),
        ("CAST(code AS INTEGER) BETWEEN 4400 AND 4499", "personeelskosten"),
        ("CAST(code AS INTEGER) BETWEEN 4500 AND 4599", "verkoopkosten"),
        ("CAST(code AS INTEGER) BETWEEN 4600 AND 4699", "huisvestingskosten"),
        ("CAST(code AS INTEGER) BETWEEN 4700 AND 4799", "algemene_kosten"),
        ("CAST(code AS INTEGER) BETWEEN 4800 AND 4899", "afschrijvingen_wv"),
        ("CAST(code AS INTEGER) BETWEEN 8000 AND 8999", "financieel"),
        ("CAST(code AS INTEGER) BETWEEN 9000 AND 9999", "belastingen"),
    ]
    for condition, subcat in subcategory_rules:
        cur.execute(f"UPDATE gl_accounts SET subcategory = ? WHERE {condition} AND subcategory IS NULL", (subcat,))


def insert_data(cur, data: dict):
    """Insert alle data in de database."""

    # GL Accounts
    for r in data.get("glAccounts", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO gl_accounts (code, description, balance_side, type_description)
            VALUES (?, ?, ?, ?)
        """, (r.get("Code"), r.get("Description"), r.get("BalanceSide"), r.get("TypeDescription")))

    print(f"  gl_accounts: {cur.execute('SELECT COUNT(*) FROM gl_accounts').fetchone()[0]} records")

    # Transaction Lines
    batch = []
    for r in data.get("transactionLines", []):
        r = clean_record(r)
        batch.append((
            r.get("EntryNumber"), r.get("FinancialYear"), r.get("FinancialPeriod"),
            r.get("Date"), r.get("GLAccount"), r.get("GLAccountCode"),
            r.get("GLAccountDescription"), r.get("Description"), r.get("AmountFC"),
            r.get("AccountCode"), r.get("AccountName"), r.get("JournalCode"),
            r.get("JournalDescription"), r.get("InvoiceNumber"), r.get("Document"),
        ))

    cur.executemany("""
        INSERT INTO transaction_lines
        (entry_number, financial_year, financial_period, date, gl_account_guid,
         gl_account_code, gl_account_description, description, amount_fc,
         account_code, account_name, journal_code, journal_description,
         invoice_number, document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, batch)
    print(f"  transaction_lines: {len(batch)} records")

    # Shop Orders
    for r in data.get("shopOrders", []):
        # shopOrders zijn al schoon geformatteerd door sync script
        cur.execute("""
            INSERT OR REPLACE INTO shop_orders
            (nr, id, status, status_text, item_code, description, quantity, delivered, planned_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("nr"), r.get("id"), r.get("status"), r.get("statusText"),
            r.get("itemCode"), r.get("description"), r.get("quantity"),
            r.get("delivered"), parse_odata_date(r.get("plannedDate", "")),
        ))
    print(f"  shop_orders: {len(data.get('shopOrders', []))} records")

    # Shop Order Materials
    for r in data.get("shopOrderMaterials", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO shop_order_materials
            (id, shop_order, item, item_code, item_description, line_number,
             planned_amount_fc, planned_quantity, planned_price_fc, planned_quantity_factor,
             remaining_quantity, status, status_description, unit, unit_description,
             planned_date, type, backflush, waste_percentage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("ID"), r.get("ShopOrder"), r.get("Item"), r.get("ItemCode"),
            r.get("ItemDescription") or r.get("Description"), r.get("LineNumber"),
            r.get("PlannedAmountFC"), r.get("PlannedQuantity"), r.get("PlannedPriceFC"),
            r.get("PlannedQuantityFactor"), r.get("RemainingQuantity"),
            r.get("Status"), r.get("StatusDescription"), r.get("Unit"),
            r.get("UnitDescription"), r.get("PlannedDate"), r.get("Type"),
            r.get("Backflush"), r.get("WastePercentage"),
        ))
    print(f"  shop_order_materials: {len(data.get('shopOrderMaterials', []))} records")

    # Accounts (leveranciers/klanten)
    for r in data.get("accounts", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO accounts
            (id, code, name, status, city, country, is_supplier, is_reseller, is_sales, email, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("ID"), r.get("Code"), r.get("Name"), r.get("Status"),
            r.get("City"), r.get("Country"), r.get("IsSupplier"), r.get("IsReseller"),
            r.get("IsSales"), r.get("Email"), r.get("Phone"),
        ))
    print(f"  accounts: {len(data.get('accounts', []))} records")

    # Items
    for r in data.get("items", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO items
            (code, description, cost_price_standard, is_make_item, is_purchase_item,
             is_sales_item, item_group, item_group_description, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("Code"), r.get("Description"), r.get("CostPriceStandard"),
            r.get("IsMakeItem"), r.get("IsPurchaseItem"), r.get("IsSalesItem"),
            r.get("ItemGroup"), r.get("ItemGroupDescription"), r.get("Stock"),
        ))
    print(f"  items: {len(data.get('items', []))} records")

    # Purchase Orders
    for r in data.get("purchaseOrders", []):
        r = clean_record(r)
        cur.execute("""
            INSERT INTO purchase_order_lines
            (purchase_order_id, order_number, order_date, line_number,
             item_code, item_description, supplier_code, supplier_name,
             quantity, received_quantity, amount_fc, unit_price,
             receipt_date, description, project, project_description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("PurchaseOrderID"), r.get("OrderNumber"), r.get("OrderDate"),
            r.get("LineNumber"), r.get("ItemCode"), r.get("ItemDescription"),
            r.get("SupplierCode"), r.get("SupplierName"),
            r.get("Quantity"), r.get("ReceivedQuantity"), r.get("AmountFC"),
            r.get("UnitPrice"), r.get("ReceiptDate"), r.get("Description"),
            r.get("Project"), r.get("ProjectDescription"),
        ))
    print(f"  purchase_order_lines: {len(data.get('purchaseOrders', []))} records")

    # Stock Positions
    for r in data.get("stockPositions", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO stock_positions
            (item_code, item_description, current_stock, planned_stock_in, planned_stock_out)
            VALUES (?, ?, ?, ?, ?)
        """, (
            r.get("ItemCode"), r.get("ItemDescription"),
            r.get("CurrentStock"), r.get("PlannedStockIn"), r.get("PlannedStockOut"),
        ))
    print(f"  stock_positions: {len(data.get('stockPositions', []))} records")

    # Routing step plans
    for r in data.get("routingStepPlans", []):
        r = clean_record(r)
        cur.execute("""
            INSERT OR REPLACE INTO routing_step_plans
            (id, shop_order, account, account_number, account_name,
             operation_code, operation_description, planned_start_date, planned_end_date,
             status, status_description, total_cost_dc, workcenter, workcenter_code, workcenter_description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r.get("ID"), r.get("ShopOrder"), r.get("Account"), r.get("AccountNumber"),
            r.get("AccountName"), r.get("OperationCode"), r.get("OperationDescription"),
            r.get("PlannedStartDate"), r.get("PlannedEndDate"),
            r.get("Status"), r.get("StatusDescription"), r.get("TotalCostDC"),
            r.get("Workcenter"), r.get("WorkcenterCode"), r.get("WorkcenterDescription"),
        ))
    print(f"  routing_step_plans: {len(data.get('routingStepPlans', []))} records")

    # === Generieke insert voor nieuwe tabellen ===
    def insert_generic(table_name, json_key, field_map):
        """Insert data met een veldnaam-mapping {db_col: json_key}."""
        records = data.get(json_key, [])
        if not records:
            print(f"  {table_name}: 0 records (niet in dataset)")
            return
        cols = list(field_map.keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        for r in records:
            r = clean_record(r)
            vals = tuple(r.get(field_map[c]) for c in cols)
            cur.execute(f"INSERT OR REPLACE INTO {table_name} ({col_str}) VALUES ({placeholders})", vals)
        print(f"  {table_name}: {len(records)} records")

    # Sales order headers
    insert_generic("sales_order_headers", "salesOrderHeaders", {
        "id": "OrderID", "order_number": "OrderNumber", "order_date": "OrderDate",
        "deliver_to": "DeliverTo", "deliver_to_name": "DeliverToName",
        "delivery_date": "DeliveryDate", "description": "Description",
        "status": "Status", "status_description": "StatusDescription",
        "amount_fc": "AmountFC", "currency": "Currency",
        "order_to": "OrderedBy", "order_to_name": "OrderedByName", "your_ref": "YourRef",
    })

    # Sales order lines
    insert_generic("sales_order_lines", "salesOrderLines", {
        "id": "ID", "order_id": "OrderID", "order_number": "OrderNumber",
        "item_code": "ItemCode", "item_description": "ItemDescription",
        "quantity": "Quantity", "delivered": "DeliveredQuantity",
        "amount_fc": "AmountFC", "unit_price": "UnitPrice",
        "delivery_date": "DeliveryDate", "description": "Description",
        "line_number": "LineNumber", "net_price": "NetPrice", "discount": "Discount",
    })

    # Sales invoice headers
    insert_generic("sales_invoice_headers", "salesInvoiceHeaders", {
        "id": "InvoiceID", "invoice_number": "InvoiceNumber", "invoice_date": "InvoiceDate",
        "invoice_to": "InvoiceTo", "invoice_to_name": "InvoiceToName",
        "order_date": "OrderDate", "status": "Status", "status_description": "StatusDescription",
        "amount_fc": "AmountFC", "amount_dc": "AmountDC", "vat_amount_fc": "VATAmountFC",
        "currency": "Currency", "payment_condition": "PaymentCondition",
        "payment_condition_description": "PaymentConditionDescription",
        "journal": "Journal", "description": "Description", "your_ref": "YourRef",
    })

    # Sales invoice lines
    insert_generic("sales_invoice_lines", "salesInvoiceLines", {
        "id": "ID", "invoice_id": "InvoiceID", "invoice_number": "InvoiceNumber",
        "item_code": "ItemCode", "item_description": "ItemDescription",
        "quantity": "Quantity", "amount_fc": "AmountFC", "unit_price": "UnitPrice",
        "net_price": "NetPrice", "vat_amount_fc": "VATAmountFC",
        "discount": "Discount", "description": "Description", "line_number": "LineNumber",
    })

    # Goods delivery headers
    insert_generic("goods_delivery_headers", "goodsDeliveryHeaders", {
        "id": "EntryID", "delivery_number": "DeliveryNumber", "delivery_date": "DeliveryDate",
        "deliver_to": "DeliverTo", "deliver_to_name": "DeliverToName",
        "description": "Description", "entry_number": "EntryNumber",
    })

    # Goods delivery lines
    insert_generic("goods_delivery_lines", "goodsDeliveryLines", {
        "id": "ID", "delivery_id": "EntryID", "item_code": "ItemCode",
        "item_description": "ItemDescription", "quantity_delivered": "QuantityDelivered",
        "quantity_ordered": "QuantityOrdered", "sales_order_number": "SalesOrderNumber",
        "sales_order_line_number": "SalesOrderLineNumber",
    })

    # Purchase invoice headers
    insert_generic("purchase_invoice_headers", "purchaseInvoiceHeaders", {
        "id": "PurchaseInvoiceID", "invoice_number": "InvoiceNumber",
        "invoice_date": "InvoiceDate", "supplier": "Supplier",
        "supplier_name": "SupplierName", "amount_fc": "AmountFC",
        "vat_amount_fc": "VATAmountFC", "status": "Status",
        "status_description": "StatusDescription", "currency": "Currency",
        "journal": "Journal", "payment_condition": "PaymentCondition",
        "description": "Description", "your_ref": "YourRef", "due_date": "DueDate",
    })

    # Purchase invoice lines
    insert_generic("purchase_invoice_lines", "purchaseInvoiceLines", {
        "id": "ID", "invoice_id": "PurchaseInvoiceID", "item_code": "ItemCode",
        "item_description": "ItemDescription", "quantity": "Quantity",
        "amount_fc": "AmountFC", "unit_price": "UnitPrice", "net_price": "NetPrice",
        "vat_amount_fc": "VATAmountFC", "description": "Description",
        "line_number": "LineNumber", "project": "Project",
        "project_description": "ProjectDescription",
    })

    # Goods receipt headers
    insert_generic("goods_receipt_headers", "goodsReceiptHeaders", {
        "id": "ID", "receipt_number": "ReceiptNumber",
        "receipt_date": "ReceiptDate", "supplier": "Supplier",
        "supplier_name": "SupplierName", "description": "Description",
    })

    # Goods receipt lines
    insert_generic("goods_receipt_lines", "goodsReceiptLines", {
        "id": "ID", "receipt_id": "GoodsReceiptID", "item_code": "ItemCode",
        "item_description": "ItemDescription", "quantity_ordered": "QuantityOrdered",
        "quantity_received": "QuantityReceived",
        "purchase_order_number": "PurchaseOrderNumber",
        "purchase_order_line_number": "PurchaseOrderLineNumber",
    })

    # Supplier items
    insert_generic("supplier_items", "supplierItems", {
        "id": "ID", "supplier": "Supplier", "supplier_code": "SupplierCode",
        "supplier_name": "SupplierName", "item": "Item", "item_code": "ItemCode",
        "item_description": "ItemDescription", "purchase_price": "PurchasePrice",
        "purchase_unit": "PurchaseUnit", "purchase_lead_time": "PurchaseLeadTime",
        "minimum_quantity": "MinimumQuantity",
    })

    # BOM materials
    insert_generic("bom_materials", "bomMaterials", {
        "id": "ID", "item": "Item", "item_code": "ItemCode",
        "item_description": "ItemDescription", "sub_item": "SubItem",
        "sub_item_code": "SubItemCode", "sub_item_description": "SubItemDescription",
        "quantity": "Quantity", "quantity_batch": "QuantityBatch",
        "cost_price": "CostPrice", "net_weight": "NetWeight",
        "net_weight_unit": "NetWeightUnit", "waste_percentage": "WastePercentage",
        "backflush": "Backflush", "type": "Type", "line_number": "LineNumber",
        "calculator_type": "CalculatorType",
    })

    # BOM versions
    insert_generic("bom_versions", "bomVersions", {
        "id": "ID", "item": "Item", "item_code": "ItemCode",
        "item_description": "ItemDescription", "version_number": "VersionNumber",
        "description": "Description", "is_default": "IsDefault",
        "status": "Status", "status_description": "StatusDescription",
        "quantity_batch": "QuantityBatch",
    })

    # Shop order receipts
    insert_generic("shop_order_receipts", "shopOrderReceipts", {
        "id": "StockTransactionId", "shop_order": "ShopOrder",
        "shop_order_number": "ShopOrderNumber", "item_code": "ItemCode",
        "item_description": "ItemDescription", "quantity": "Quantity",
        "transaction_date": "TransactionDate", "unit": "Unit",
        "unit_description": "UnitDescription", "warehouse": "Warehouse",
        "warehouse_code": "WarehouseCode",
    })

    # Material issues
    insert_generic("material_issues", "materialIssues", {
        "id": "StockTransactionId", "shop_order": "ShopOrder",
        "shop_order_number": "ShopOrderNumber", "item_code": "ItemCode",
        "item_description": "ItemDescription", "quantity": "Quantity",
        "transaction_date": "TransactionDate", "unit": "Unit",
        "unit_description": "UnitDescription", "warehouse": "Warehouse",
        "warehouse_code": "WarehouseCode",
    })

    # Operations
    insert_generic("operations", "operations", {
        "id": "ID", "code": "Code", "description": "Description",
        "type": "Type", "status": "Status",
    })

    # Workcenters
    insert_generic("workcenters", "workcenters", {
        "id": "ID", "code": "Code", "description": "Description",
        "production_area": "ProductionArea", "type": "Type", "status": "Status",
    })

    # Batch numbers
    insert_generic("batch_numbers", "batchNumbers", {
        "id": "ID", "batch_number": "BatchNumber", "item": "Item",
        "item_code": "ItemCode", "item_description": "ItemDescription",
        "expiry_date": "ExpiryDate", "is_blocked": "IsBlocked", "quantity": "Quantity",
    })

    # Stock batch numbers
    insert_generic("stock_batch_numbers", "stockBatchNumbers", {
        "id": "ID", "batch_number": "BatchNumber", "item_code": "ItemCode",
        "item_description": "ItemDescription", "warehouse": "Warehouse",
        "warehouse_code": "WarehouseCode", "warehouse_description": "WarehouseDescription",
        "stock": "Stock",
    })

    # Item groups
    insert_generic("item_groups", "itemGroups", {
        "id": "ID", "code": "Code", "description": "Description",
    })

    # Warehouses
    insert_generic("warehouses", "warehouses", {
        "id": "ID", "code": "Code", "description": "Description", "main": "Main",
    })

    # Units
    insert_generic("units", "units", {
        "id": "ID", "code": "Code", "description": "Description",
        "type": "Type", "active": "Active",
    })

    # Journals
    insert_generic("journals", "journals", {
        "id": "ID", "code": "Code", "description": "Description",
        "type": "Type", "type_description": "TypeDescription",
    })

    # Sync metadata
    cur.execute("INSERT OR REPLACE INTO sync_meta VALUES ('last_updated', ?)", (data.get("lastUpdated", ""),))
    cur.execute("INSERT OR REPLACE INTO sync_meta VALUES ('division', ?)", (data.get("division", ""),))
    cur.execute("INSERT OR REPLACE INTO sync_meta VALUES ('built_at', ?)",
                (datetime.now(timezone.utc).isoformat(),))


def create_views(cur):
    """Handige views voor veelgebruikte queries."""

    # View: Alle overboekingen van W&V naar balans
    cur.execute("""
        CREATE VIEW IF NOT EXISTS v_wv_naar_balans AS
        SELECT
            t.entry_number,
            t.date,
            t.financial_year,
            t.gl_account_code,
            t.gl_account_description,
            t.description,
            t.amount_fc,
            t.account_code,
            t.account_name,
            t.journal_code,
            g.category,
            g.subcategory
        FROM transaction_lines t
        LEFT JOIN gl_accounts g ON t.gl_account_code = g.code
        WHERE t.gl_account_code IN ('0050', '0055', '0060', '0065', '0070', '0075')
        ORDER BY t.date
    """)

    # View: Kosten per GL-rekening per jaar
    cur.execute("""
        CREATE VIEW IF NOT EXISTS v_kosten_per_rekening_jaar AS
        SELECT
            t.gl_account_code,
            t.gl_account_description,
            t.financial_year,
            g.category,
            g.subcategory,
            COUNT(*) as aantal_regels,
            SUM(t.amount_fc) as totaal,
            SUM(CASE WHEN t.amount_fc > 0 THEN t.amount_fc ELSE 0 END) as debet,
            SUM(CASE WHEN t.amount_fc < 0 THEN t.amount_fc ELSE 0 END) as credit
        FROM transaction_lines t
        LEFT JOIN gl_accounts g ON t.gl_account_code = g.code
        GROUP BY t.gl_account_code, t.financial_year
        ORDER BY t.gl_account_code, t.financial_year
    """)

    # View: Leveranciers top-spend op 0050
    cur.execute("""
        CREATE VIEW IF NOT EXISTS v_leveranciers_0050 AS
        SELECT
            t.account_code,
            t.account_name,
            COUNT(*) as aantal_facturen,
            SUM(t.amount_fc) as totaal_bedrag,
            MIN(t.date) as eerste_boeking,
            MAX(t.date) as laatste_boeking
        FROM transaction_lines t
        WHERE t.gl_account_code = '0050'
          AND t.account_code IS NOT NULL
        GROUP BY t.account_code, t.account_name
        ORDER BY totaal_bedrag DESC
    """)

    # View: Shop orders met materiaalkosten
    cur.execute("""
        CREATE VIEW IF NOT EXISTS v_shop_orders_met_materialen AS
        SELECT
            so.nr,
            so.status_text,
            so.item_code,
            so.description as order_description,
            so.quantity,
            so.delivered,
            so.planned_date,
            COUNT(som.id) as aantal_materialen,
            SUM(som.planned_amount_fc) as totaal_materiaalkosten
        FROM shop_orders so
        LEFT JOIN shop_order_materials som ON so.id = som.shop_order
        GROUP BY so.nr
        ORDER BY so.nr DESC
    """)


def verify_data(cur, original_data: dict):
    """Verifieer dat de SQLite data overeenkomt met de bron."""
    print("\n=== VERIFICATIE ===")
    issues = []

    checks = [
        ("gl_accounts", "glAccounts"),
        ("transaction_lines", "transactionLines"),
        ("shop_orders", "shopOrders"),
        ("shop_order_materials", "shopOrderMaterials"),
        ("accounts", "accounts"),
        ("items", "items"),
    ]

    for table, json_key in checks:
        db_count = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        json_count = len(original_data.get(json_key, []))
        status = "✅" if db_count == json_count else "❌"
        if db_count != json_count:
            issues.append(f"{table}: DB={db_count}, JSON={json_count}")
        print(f"  {status} {table}: {db_count} (bron: {json_count})")

    # Steekproef: check bedragen
    tl_sum_db = cur.execute("SELECT SUM(amount_fc) FROM transaction_lines").fetchone()[0] or 0
    tl_sum_json = sum(r.get("AmountFC", 0) for r in original_data.get("transactionLines", []))
    amount_match = abs(tl_sum_db - tl_sum_json) < 0.01
    status = "✅" if amount_match else "❌"
    print(f"  {status} Totaal bedragen: DB={tl_sum_db:.2f}, JSON={tl_sum_json:.2f}")
    if not amount_match:
        issues.append(f"Bedrag mismatch: {tl_sum_db:.2f} vs {tl_sum_json:.2f}")

    # Check dates geconverteerd
    sample_date = cur.execute(
        "SELECT date FROM transaction_lines WHERE date IS NOT NULL LIMIT 1"
    ).fetchone()
    if sample_date:
        print(f"  Datumformaat voorbeeld: {sample_date[0]}")

    if issues:
        print(f"\n  ⚠️  {len(issues)} problemen gevonden:")
        for issue in issues:
            print(f"     - {issue}")
    else:
        print("\n  ✅ Alle verificaties geslaagd — geen dataverlies")

    return len(issues) == 0


def main():
    print("Exact Online dataset → SQLite conversie")
    print("=" * 50)

    if not DATASET_FILE.exists():
        print(f"❌ {DATASET_FILE} niet gevonden. Draai eerst exact_sync.py")
        return

    # Load JSON
    print(f"Dataset laden: {DATASET_FILE}")
    with open(DATASET_FILE) as f:
        data = json.load(f)

    # Remove existing DB for clean rebuild
    if DB_FILE.exists():
        os.remove(DB_FILE)
        print(f"Bestaande database verwijderd: {DB_FILE}")

    # Build SQLite
    conn = sqlite3.connect(str(DB_FILE))
    cur = conn.cursor()

    # Performance settings
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")

    print("\nTabellen aanmaken...")
    create_tables(cur)

    print("Data invoegen...")
    insert_data(cur, data)

    print("\nIndexen aanmaken...")
    create_indexes(cur)

    print("GL-rekeningen labelen...")
    label_gl_accounts(cur)

    print("Views aanmaken...")
    create_views(cur)

    conn.commit()

    # Verify
    verify_data(cur, data)

    # Stats
    db_size = DB_FILE.stat().st_size / 1024 / 1024
    json_size = DATASET_FILE.stat().st_size / 1024 / 1024
    print(f"\n=== RESULTAAT ===")
    print(f"  SQLite: {DB_FILE}")
    print(f"  Grootte: {db_size:.1f} MB (was {json_size:.1f} MB JSON)")
    print(f"  Compressie: {(1 - db_size/json_size)*100:.0f}% kleiner")

    # Quick demo queries
    print(f"\n=== DEMO QUERIES ===")
    print("  Top 5 GL-rekeningen op 0050:")
    for row in cur.execute("SELECT * FROM v_leveranciers_0050 LIMIT 5"):
        print(f"    {row}")

    print("\n  Transacties per jaar:")
    for row in cur.execute("""
        SELECT financial_year, COUNT(*), SUM(amount_fc)
        FROM transaction_lines GROUP BY financial_year ORDER BY financial_year
    """):
        print(f"    {row[0]}: {row[1]} regels, totaal €{row[2]:,.2f}")

    conn.close()
    print("\n✅ Database klaar voor gebruik!")


if __name__ == "__main__":
    main()
