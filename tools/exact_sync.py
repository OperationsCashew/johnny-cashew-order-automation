#!/usr/bin/env python3
"""
Exact Online REST API Data Sync
Haalt productieorders, financiele transacties, leveranciers en artikelen op.
Draait 's nachts via cron job.

Gebruik:
  1. Eerste keer:  python3 exact_sync.py --auth    (opent browser voor OAuth2 login)
  2. Daarna:       python3 exact_sync.py            (gebruikt opgeslagen refresh token)
  3. Enkel orders: python3 exact_sync.py --orders-only
"""

import argparse
import json
import logging
import os
import sys
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Paths ──
SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPT_DIR / ".env"
TOKENS_FILE = SCRIPT_DIR / ".tokens.json"
DATA_FILE = SCRIPT_DIR / "data.json"
FULL_DATA_FILE = SCRIPT_DIR / "dataset.json"
STATE_FILE = SCRIPT_DIR / ".sync_state.json"
LOG_FILE = SCRIPT_DIR / "sync.log"

# ── Incremental sync config ──
# table_key (zoals in dataset.json) → (timestamp_field_in_exact, id_field_in_exact)
# Tabellen die hier NIET in staan worden altijd full opgehaald (master data, klein).
INCREMENTAL_TABLES = {
    "shopOrders":            ("Modified", "ID"),
    "shopOrderMaterials":    ("Modified", "ID"),
    "transactionLines":      ("Modified", "ID"),
    "purchaseOrders":        ("Modified", "PurchaseOrderID"),
    "salesOrderHeaders":     ("Modified", "OrderID"),
    "salesOrderLines":       ("Modified", "ID"),
    "salesInvoiceHeaders":   ("Modified", "InvoiceID"),
    "salesInvoiceLines":     ("Modified", "ID"),
    "goodsDeliveryHeaders":  ("Modified", "EntryID"),
    "goodsDeliveryLines":    ("Modified", "ID"),
    "purchaseInvoiceHeaders":("Modified", "ID"),
    "purchaseInvoiceLines":  ("Modified", "ID"),
    "goodsReceiptHeaders":   ("Modified", "ID"),
    "goodsReceiptLines":     ("Modified", "ID"),
    "shopOrderReceipts":     ("CreatedDate", "ID"),
    "materialIssues":        ("CreatedDate", "StockTransactionId"),
    "routingStepPlans":      ("Modified", "ID"),
}

# Globale state voor incremental fetcher (lees in fetch_all)
_active_table = None
_sync_state = {}
_incremental_mode = False
_state_overlap_minutes = 60  # safety overlap tegen klok-skew


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _odata_date_to_iso(val):
    """/Date(1605484800000)/ → ISO datetime."""
    if not val or not isinstance(val, str):
        return None
    import re
    m = re.match(r"/Date\((-?\d+)\)/", val)
    if m:
        return datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc).isoformat()
    return val


def _max_timestamp(records: list, field: str) -> str | None:
    """Hoogste timestamp uit een batch records."""
    best = None
    for r in records:
        v = _odata_date_to_iso(r.get(field))
        if v and (best is None or v > best):
            best = v
    return best


def merge_records(old: list, new: list, id_field: str) -> list:
    """Merge nieuwe records in oude lijst, dedupliceerd op id_field."""
    if not new:
        return old or []
    by_id = {}
    for r in (old or []):
        k = r.get(id_field)
        if k:
            by_id[k] = r
    for r in new:
        k = r.get(id_field)
        if k:
            by_id[k] = r  # nieuwe overschrijft oude
    return list(by_id.values())

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("exact_sync")

# ── Exact Online endpoints ──
AUTH_URL = "https://start.exactonline.nl/api/oauth2/auth"
TOKEN_URL = "https://start.exactonline.nl/api/oauth2/token"
API_BASE = "https://start.exactonline.nl/api/v1"
REDIRECT_PORT = 8765
REDIRECT_URI = "https://leverancier-order-tool.netlify.app/"


# ── Config ──
def load_env():
    """Load .env file into a dict."""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip("'\"")
    return env


def get_config():
    """Get configuration from .env file."""
    env = load_env()
    client_id = env.get("EXACT_CLIENT_ID", "")
    client_secret = env.get("EXACT_CLIENT_SECRET", "")
    division = env.get("EXACT_DIVISION", "")

    if not client_id or not client_secret:
        log.error("EXACT_CLIENT_ID en EXACT_CLIENT_SECRET moeten in .env staan")
        sys.exit(1)

    return client_id, client_secret, division


# ── Token Management ──
def save_tokens(tokens: dict):
    """Save OAuth tokens to disk."""
    tokens["saved_at"] = datetime.now(timezone.utc).isoformat()
    TOKENS_FILE.write_text(json.dumps(tokens, indent=2))
    # Restrict permissions
    os.chmod(TOKENS_FILE, 0o600)
    log.info("Tokens opgeslagen")


def load_tokens() -> dict | None:
    """Load stored tokens."""
    if not TOKENS_FILE.exists():
        return None
    try:
        return json.loads(TOKENS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def exchange_code(code: str, client_id: str, client_secret: str) -> dict:
    """Exchange authorization code for tokens."""
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "client_secret": client_secret,
    })
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str, client_id: str, client_secret: str) -> dict:
    """Use refresh token to get a new access token."""
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    })
    resp.raise_for_status()
    return resp.json()


def get_valid_token(client_id: str, client_secret: str) -> str:
    """Get a valid access token, refreshing if needed."""
    tokens = load_tokens()
    if not tokens or "refresh_token" not in tokens:
        log.error("Geen opgeslagen tokens. Draai eerst: python3 exact_sync.py --auth")
        sys.exit(1)

    # Always refresh — tokens are short-lived (10 min)
    log.info("Access token vernieuwen via refresh token...")
    try:
        new_tokens = refresh_access_token(tokens["refresh_token"], client_id, client_secret)
        save_tokens(new_tokens)
        return new_tokens["access_token"]
    except requests.HTTPError as e:
        log.error(f"Token refresh mislukt: {e.response.status_code} — {e.response.text}")
        log.error("Draai opnieuw: python3 exact_sync.py --auth")
        sys.exit(1)


# ── OAuth2 Authorization Flow ──
def run_auth_flow(client_id: str, client_secret: str, callback_url: str = None):
    """OAuth2 authorization.

    Gebruik:
      --auth                Open browser, plak daarna URL via --auth-callback
      --auth-callback URL   Verwerk de callback URL met ?code=...
    """
    if not callback_url:
        # Stap 1: open browser
        auth_params = urllib.parse.urlencode({
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "force_login": 0,
        })
        full_auth_url = f"{AUTH_URL}?{auth_params}"

        log.info("Opening browser voor Exact Online login...")
        webbrowser.open(full_auth_url)

        print("\n" + "=" * 60)
        print("Na inloggen word je doorgestuurd naar:")
        print(f"  {REDIRECT_URI}?code=XXXX")
        print()
        print("Kopieer de VOLLEDIGE URL uit je browser-adresbalk")
        print("en draai daarna:")
        print()
        print('  python3 exact_sync.py --auth-callback "PLAK_URL_HIER"')
        print("=" * 60)
        return None

    # Stap 2: verwerk callback URL
    parsed = urllib.parse.urlparse(callback_url)
    params = urllib.parse.parse_qs(parsed.query)

    if "code" not in params:
        log.error("Geen autorisatiecode gevonden in de URL")
        log.error(f"Ontvangen URL: {callback_url}")
        sys.exit(1)

    auth_code = params["code"][0]
    log.info("Autorisatiecode ontvangen, tokens ophalen...")
    tokens = exchange_code(auth_code, client_id, client_secret)
    save_tokens(tokens)
    log.info("OAuth2 autorisatie compleet!")

    return tokens["access_token"]


# ── API Helpers ──
def get_division(access_token: str) -> str:
    """Get the current division code."""
    resp = requests.get(
        f"{API_BASE}/current/Me?$select=CurrentDivision",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    results = data.get("d", {}).get("results", [])
    if results:
        return str(results[0]["CurrentDivision"])
    raise ValueError("Kan division niet ophalen")


# Global token state — shared across all fetch calls
_current_token = None
_token_obtained_at = 0.0
TOKEN_REFRESH_INTERVAL = 540  # Vernieuw elke 9 minuten (tokens verlopen na 10 min)


def ensure_fresh_token(access_token: str, client_id: str = None, client_secret: str = None) -> str:
    """Proactief token vernieuwen als het bijna verloopt."""
    global _current_token, _token_obtained_at

    if _current_token is None:
        _current_token = access_token
        _token_obtained_at = time.time()

    elapsed = time.time() - _token_obtained_at
    if elapsed < TOKEN_REFRESH_INTERVAL:
        return _current_token

    # Token bijna verlopen — proactief vernieuwen
    if client_id and client_secret:
        log.info(f"Token proactief vernieuwen (na {elapsed:.0f}s)...")
        tokens = load_tokens()
        if tokens and "refresh_token" in tokens:
            try:
                new_tokens = refresh_access_token(tokens["refresh_token"], client_id, client_secret)
                save_tokens(new_tokens)
                _current_token = new_tokens["access_token"]
                _token_obtained_at = time.time()
                return _current_token
            except requests.HTTPError as e:
                log.warning(f"Proactieve refresh mislukt: {e}, ga door met huidig token")

    return _current_token


def fetch_all(access_token: str, url: str, params: dict = None,
              client_id: str = None, client_secret: str = None) -> list:
    """Fetch all pages from an OData endpoint with proactive token refresh.

    Als incrementele sync actief is en _active_table in INCREMENTAL_TABLES staat,
    wordt automatisch een $filter=<ts_field> gt datetime'…' toegevoegd.
    """
    # Inject incremental filter
    if _incremental_mode and _active_table and _active_table in INCREMENTAL_TABLES:
        ts_field, _ = INCREMENTAL_TABLES[_active_table]
        since = _sync_state.get(_active_table)
        if since:
            # Pas overlap toe (klok-skew safety)
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
                from datetime import timedelta
                since_dt = since_dt - timedelta(minutes=_state_overlap_minutes)
                since_str = since_dt.strftime("%Y-%m-%dT%H:%M:%S")
            except (ValueError, AttributeError):
                since_str = since[:19]
            inc_filter = f"{ts_field} gt datetime'{since_str}'"
            params = dict(params or {})
            existing = params.get("$filter")
            params["$filter"] = f"({existing}) and {inc_filter}" if existing else inc_filter
            log.info(f"  [incremental] {_active_table}: alleen records {ts_field} > {since_str}")

    results = []
    current_url = url
    page = 0

    while current_url:
        page += 1

        # Proactief vernieuwen voor elke request
        token = ensure_fresh_token(access_token, client_id, client_secret)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        resp = requests.get(current_url, headers=headers, params=params if page == 1 else None)

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", 60))
            log.warning(f"Rate limited, wacht {retry_after}s...")
            time.sleep(retry_after)
            continue

        if resp.status_code == 401 and client_id and client_secret:
            # Token toch verlopen — forceer refresh
            log.info("Token verlopen (401), forceer refresh...")
            global _token_obtained_at
            _token_obtained_at = 0  # Forceer refresh
            token = ensure_fresh_token(access_token, client_id, client_secret)
            if token:
                continue  # Retry met nieuw token
            resp.raise_for_status()

        resp.raise_for_status()
        data = resp.json().get("d", {})
        batch = data.get("results", [])
        results.extend(batch)

        # Next page
        current_url = data.get("__next")
        params = None  # __next URL includes params already

        if page % 5 == 0:
            log.info(f"  ... {len(results)} records opgehaald (pagina {page})")

        # Rate limit protection: small delay between pages
        if current_url:
            time.sleep(0.3)

    return results


# ── Data Fetchers ──
# Alle fetchers accepteren creds tuple (client_id, client_secret) voor auto-refresh

def fetch_shop_orders(token: str, division: str, creds: tuple = None) -> list:
    """Fetch manufacturing shop orders."""
    log.info("Shop orders ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/ShopOrders"
    # Geen $select — laat Exact alle velden teruggeven om 400 te voorkomen
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)

    orders = []
    status_map = {10: "Gepland", 20: "Vrijgegeven", 30: "In uitvoering", 40: "Gereed", 50: "Afgehandeld"}

    for r in raw:
        orders.append({
            "nr": str(r.get("ShopOrderNumber", "")),
            "id": r.get("ID", ""),
            "status": r.get("Status", 0),
            "statusText": status_map.get(r.get("Status", 0), "Onbekend"),
            "itemCode": r.get("ItemCode", ""),
            "description": r.get("ItemDescription", ""),
            "quantity": r.get("PlannedQuantity", 0),
            "delivered": r.get("DeliveredQuantity", 0),
            "plannedDate": r.get("PlannedDate", ""),
        })

    log.info(f"  {len(orders)} shop orders opgehaald")
    return orders


def fetch_shop_order_materials(token: str, division: str, creds: tuple = None) -> list:
    """Fetch materials linked to shop orders."""
    log.info("Shop order materialen ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/ShopOrderMaterialPlans"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} materiaalregels opgehaald")
    return raw


def fetch_gl_accounts(token: str, division: str, creds: tuple = None) -> list:
    """Fetch GL accounts."""
    log.info("Grootboekrekeningen ophalen...")
    url = f"{API_BASE}/{division}/financial/GLAccounts"
    params = {
        "$select": "Code,Description,BalanceSide,TypeDescription",
        "$orderby": "Code",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} rekeningen opgehaald")
    return raw


def fetch_transaction_lines(token: str, division: str, year: int = None, creds: tuple = None) -> list:
    """Fetch financial transaction lines, optionally filtered by year."""
    label = f"boekjaar {year}" if year else "alle jaren"
    log.info(f"Transactieregels ophalen ({label})...")
    url = f"{API_BASE}/{division}/financialtransaction/TransactionLines"
    params = {
        "$select": "EntryNumber,FinancialYear,FinancialPeriod,Date,GLAccount,"
                   "GLAccountCode,GLAccountDescription,Description,AmountFC,"
                   "AccountCode,AccountName,JournalCode,JournalDescription,"
                   "InvoiceNumber,Document",
        "$orderby": "EntryNumber",
    }
    if year:
        params["$filter"] = f"FinancialYear eq {year}"

    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} transactieregels opgehaald")
    return raw


def fetch_accounts(token: str, division: str, creds: tuple = None) -> list:
    """Fetch CRM accounts (suppliers/customers)."""
    log.info("Relaties (leveranciers/klanten) ophalen...")
    url = f"{API_BASE}/{division}/crm/Accounts"
    params = {
        "$select": "ID,Code,Name,Status,City,Country,IsSupplier,IsReseller,"
                   "IsSales,Email,Phone",
        "$orderby": "Code",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} relaties opgehaald")
    return raw


def fetch_items(token: str, division: str, creds: tuple = None) -> list:
    """Fetch product items."""
    log.info("Artikelen ophalen...")
    url = f"{API_BASE}/{division}/logistics/Items"
    params = {
        "$select": "Code,Description,CostPriceStandard,IsMakeItem,"
                   "IsPurchaseItem,IsSalesItem,ItemGroup,ItemGroupDescription,"
                   "Stock",
        "$orderby": "Code",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} artikelen opgehaald")
    return raw


def fetch_purchase_orders(token: str, division: str, creds: tuple = None) -> list:
    """Fetch purchase order lines."""
    log.info("Inkooporderregels ophalen...")
    url = f"{API_BASE}/{division}/purchaseorder/PurchaseOrderLines"
    params = {
        "$select": "PurchaseOrderID,LineNumber,ItemCode,ItemDescription,"
                   "Quantity,ReceivedQuantity,AmountFC,ReceiptDate,Description,"
                   "UnitPrice,Project,ProjectDescription",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} inkooporderregels opgehaald")

    # Haal ook PurchaseOrders op voor SupplierCode/SupplierName
    log.info("Inkooporder-headers ophalen (leverancierinfo)...")
    url_headers = f"{API_BASE}/{division}/purchaseorder/PurchaseOrders"
    params_headers = {
        "$select": "PurchaseOrderID,SupplierCode,SupplierName,OrderNumber,OrderDate",
    }
    headers_raw = fetch_all(token, url_headers, params_headers, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} inkooporder-headers opgehaald")

    # Join: voeg leverancierinfo toe aan regels
    supplier_map = {}
    for h in headers_raw:
        pid = h.get("PurchaseOrderID", "")
        supplier_map[pid] = {
            "SupplierCode": h.get("SupplierCode"),
            "SupplierName": h.get("SupplierName"),
            "OrderNumber": h.get("OrderNumber"),
            "OrderDate": h.get("OrderDate"),
        }

    for r in raw:
        pid = r.get("PurchaseOrderID", "")
        info = supplier_map.get(pid, {})
        r["SupplierCode"] = info.get("SupplierCode")
        r["SupplierName"] = info.get("SupplierName")
        r["OrderNumber"] = info.get("OrderNumber")
        r["OrderDate"] = info.get("OrderDate")

    return raw


def fetch_routing_step_plans(token: str, division: str, creds: tuple = None) -> list:
    """Fetch shop order routing step plans (uitbesteed werk → leverancierkoppeling)."""
    log.info("Routing step plans ophalen (uitbesteed werk)...")
    url = f"{API_BASE}/{division}/manufacturing/ShopOrderRoutingStepPlans"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} routing step plans opgehaald")
    return raw


def fetch_stock_positions(token: str, division: str, creds: tuple = None) -> list:
    """Fetch current stock positions via ItemWarehouses."""
    log.info("Voorraadposities ophalen...")
    url = f"{API_BASE}/{division}/inventory/ItemWarehouses"
    params = {
        "$select": "ItemCode,ItemDescription,CurrentStock,PlannedStockIn,PlannedStockOut,Warehouse,WarehouseDescription",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} voorraadposities opgehaald")
    return raw


# ── VERKOOP ──

def fetch_sales_orders(token: str, division: str, creds: tuple = None) -> list:
    """Fetch sales order headers + lines."""
    log.info("Verkooporders ophalen...")
    cid, csec = creds or (None, None)

    # Headers (endpoint heet "SalesOrders", niet "SalesOrderHeaders")
    url_h = f"{API_BASE}/{division}/salesorder/SalesOrders"
    headers_raw = fetch_all(token, url_h, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} verkooporder-headers opgehaald")

    # Lines
    url_l = f"{API_BASE}/{division}/salesorder/SalesOrderLines"
    lines_raw = fetch_all(token, url_l, client_id=cid, client_secret=csec)
    log.info(f"  {len(lines_raw)} verkooporderregels opgehaald")

    return {"headers": headers_raw, "lines": lines_raw}


def fetch_sales_invoices(token: str, division: str, creds: tuple = None) -> list:
    """Fetch sales invoices + lines."""
    log.info("Verkoopfacturen ophalen...")
    cid, csec = creds or (None, None)

    url_h = f"{API_BASE}/{division}/salesinvoice/SalesInvoices"
    headers_raw = fetch_all(token, url_h, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} verkoopfacturen opgehaald")

    url_l = f"{API_BASE}/{division}/salesinvoice/SalesInvoiceLines"
    lines_raw = fetch_all(token, url_l, client_id=cid, client_secret=csec)
    log.info(f"  {len(lines_raw)} verkoopfactuurregels opgehaald")

    return {"headers": headers_raw, "lines": lines_raw}


def fetch_goods_deliveries(token: str, division: str, creds: tuple = None) -> list:
    """Fetch goods delivery headers + lines (uitleveringen)."""
    log.info("Goederenleveringen ophalen...")
    cid, csec = creds or (None, None)

    url_h = f"{API_BASE}/{division}/salesorder/GoodsDeliveries"
    headers_raw = fetch_all(token, url_h, params={"$select": "EntryID,DeliveryNumber,DeliveryDate,DeliveryAccount,DeliveryAccountName,Description,Created,Modified"}, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} leveringsheaders opgehaald")

    url_l = f"{API_BASE}/{division}/salesorder/GoodsDeliveryLines"
    lines_raw = fetch_all(token, url_l, params={"$select": "ID,EntryID,Item,ItemCode,ItemDescription,QuantityDelivered,SalesOrder,SalesOrderLine,Created,Modified"}, client_id=cid, client_secret=csec)
    log.info(f"  {len(lines_raw)} leveringsregels opgehaald")

    return {"headers": headers_raw, "lines": lines_raw}


# ── INKOOP EXTRA ──

def fetch_purchase_invoices(token: str, division: str, creds: tuple = None) -> list:
    """Fetch purchase invoices + lines (inkoopfacturen).

    Exact Online heeft geen /purchase/PurchaseInvoices endpoint — de correcte
    endpoints zijn /purchaseentry/PurchaseEntries (headers) en
    /purchaseentry/PurchaseEntryLines (regels).
    """
    log.info("Inkoopfacturen ophalen...")
    cid, csec = creds or (None, None)

    url_h = f"{API_BASE}/{division}/purchaseentry/PurchaseEntries"
    headers_raw = fetch_all(token, url_h, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} inkoopfacturen opgehaald")

    url_l = f"{API_BASE}/{division}/purchaseentry/PurchaseEntryLines"
    lines_raw = fetch_all(token, url_l, client_id=cid, client_secret=csec)
    log.info(f"  {len(lines_raw)} inkoopfactuurregels opgehaald")

    return {"headers": headers_raw, "lines": lines_raw}


def fetch_goods_receipts(token: str, division: str, creds: tuple = None) -> list:
    """Fetch goods receipt headers + lines (goederenontvangsten)."""
    log.info("Goederenontvangsten ophalen...")
    cid, csec = creds or (None, None)

    url_h = f"{API_BASE}/{division}/purchaseorder/GoodsReceipts"
    headers_raw = fetch_all(token, url_h, client_id=cid, client_secret=csec)
    log.info(f"  {len(headers_raw)} ontvangst-headers opgehaald")

    url_l = f"{API_BASE}/{division}/purchaseorder/GoodsReceiptLines"
    lines_raw = fetch_all(token, url_l, client_id=cid, client_secret=csec)
    log.info(f"  {len(lines_raw)} ontvangstregels opgehaald")

    return {"headers": headers_raw, "lines": lines_raw}


def fetch_supplier_items(token: str, division: str, creds: tuple = None) -> list:
    """Fetch supplier-item relationships (leverancier-artikel koppeling)."""
    log.info("Leverancier-artikel koppelingen ophalen...")
    url = f"{API_BASE}/{division}/logistics/SupplierItem"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} leverancier-artikel koppelingen opgehaald")
    return raw


# ── PRODUCTIE EXTRA ──

def fetch_bom_materials(token: str, division: str, creds: tuple = None) -> list:
    """Fetch bill of material materials (stuklijst/receptuur-ingrediënten)."""
    log.info("Stuklijst-materialen ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/BillOfMaterialMaterials"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} stuklijst-materialen opgehaald")
    return raw


def fetch_bom_versions(token: str, division: str, creds: tuple = None) -> list:
    """Fetch bill of material versions (stuklijstversies)."""
    log.info("Stuklijst-versies ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/BillOfMaterialVersions"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} stuklijst-versies opgehaald")
    return raw


def fetch_shop_order_receipts(token: str, division: str, creds: tuple = None) -> list:
    """Fetch shop order receipts (gereedmeldingen productie)."""
    log.info("Productie-gereedmeldingen ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/ShopOrderReceipts"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} gereedmeldingen opgehaald")
    return raw


def fetch_material_issues(token: str, division: str, creds: tuple = None) -> list:
    """Fetch material issues (materiaaluitgiften in productie)."""
    log.info("Materiaaluitgiften ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/MaterialIssues"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} materiaaluitgiften opgehaald")
    return raw


def fetch_shop_order_actual_costs(token: str, division: str, shop_orders: list, creds: tuple = None) -> dict:
    """Per afgeronde WO (status >= 40) de werkelijk geboekte kosten ophalen
    via financialtransaction/TransactionLines (gefilterd op ShopOrder GUID).

    Retourneert: { soGuid: { itemCode: amountDC, "_total": sumAmountDC } }
    Het totaal en de per-item bedragen zijn de NETTO geboekte materiaal- /
    arbeidskosten, exact gelijk aan wat Exact in het WO-scherm toont.
    """
    log.info("Werkelijke WO-kosten ophalen (TransactionLines per afgeronde WO)...")
    base = f"{API_BASE}/{division}/financialtransaction/TransactionLines"
    cid, csec = creds or (None, None)

    # Alleen AFGEHANDELDE WOs (status 50). Status 40 (Gereed) is wel klaar
    # met productie, maar nog niet financieel afgesloten — kosten kunnen
    # daar nog wijzigen.
    # Status 40 = "Gereed" (afgehandeld) in deze division; sommige divisions gebruiken 50
    completed = [so for so in shop_orders if (so.get("status") or 0) >= 40 and so.get("id")]
    log.info(f"  {len(completed)} afgehandelde WOs te verwerken")

    out = {}
    for i, so in enumerate(completed, 1):
        guid = so["id"]
        params = {
            "$filter": f"ShopOrder eq guid'{guid}'",
            "$select": "ItemCode,AmountDC,GLAccountCode,LineType",
        }
        try:
            rows = fetch_all(token, base, params, client_id=cid, client_secret=csec)
        except Exception as e:
            log.warning(f"  WO {so.get('nr')} kosten faalde: {e}")
            continue

        per_item = {}
        total = 0.0
        for r in rows:
            ic = r.get("ItemCode") or ""
            amt = r.get("AmountDC") or 0
            if not ic:
                continue
            # Skip het ontvangst-item zelf (output van de WO) — dat is de
            # tegenboeking van de materiaaluitgiftes en zou de som op 0 brengen.
            if ic == so.get("itemCode"):
                continue
            per_item[ic] = per_item.get(ic, 0) + amt
            total += amt

        if per_item:
            per_item["_total"] = total
            out[guid] = per_item

        if i % 25 == 0:
            log.info(f"  ... {i}/{len(completed)} WOs verwerkt")
        time.sleep(0.15)  # rate limit

    log.info(f"  Werkelijke kosten voor {len(out)} WOs opgehaald")
    return out


def fetch_operations(token: str, division: str, creds: tuple = None) -> list:
    """Fetch manufacturing operations (bewerkingen)."""
    log.info("Bewerkingen ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/Operations"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} bewerkingen opgehaald")
    return raw


def fetch_workcenters(token: str, division: str, creds: tuple = None) -> list:
    """Fetch workcenters (werkplaatsen)."""
    log.info("Werkplaatsen ophalen...")
    url = f"{API_BASE}/{division}/manufacturing/Workcenters"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} werkplaatsen opgehaald")
    return raw


# ── LOGISTIEK EXTRA ──

def fetch_batch_numbers(token: str, division: str, creds: tuple = None) -> list:
    """Fetch batch numbers (batchnummers — traceerbaarheid)."""
    log.info("Batchnummers ophalen...")
    url = f"{API_BASE}/{division}/inventory/BatchNumbers"
    params = {"$select": "ID,BatchNumber,Item,ItemCode,ItemDescription,Created,Creator,Division,IsBlocked,Modified"}
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params=params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} batchnummers opgehaald")
    return raw


def fetch_stock_batch_numbers(token: str, division: str, creds: tuple = None) -> list:
    """Fetch stock per batch number (voorraad per batch)."""
    log.info("Voorraad per batch ophalen...")
    url = f"{API_BASE}/{division}/inventory/StockBatchNumbers"
    params = {"$select": "ID,BatchNumber,BatchNumberID,Created,Division,DraftStockTransactionID,"
                         "EndDate,IsBlocked,IsDraft,Item,ItemCode,ItemDescription,Modified,"
                         "Quantity,StockTransactionID,StockTransactionType,"
                         "Warehouse,WarehouseCode,WarehouseDescription"}
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params=params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} batch-voorraadposities opgehaald")
    return raw


def fetch_item_groups(token: str, division: str, creds: tuple = None) -> list:
    """Fetch item groups (artikelgroepen)."""
    log.info("Artikelgroepen ophalen...")
    url = f"{API_BASE}/{division}/logistics/ItemGroups"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} artikelgroepen opgehaald")
    return raw


def fetch_warehouses(token: str, division: str, creds: tuple = None) -> list:
    """Fetch warehouses (magazijnen)."""
    log.info("Magazijnen ophalen...")
    url = f"{API_BASE}/{division}/inventory/Warehouses"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} magazijnen opgehaald")
    return raw


def fetch_units(token: str, division: str, creds: tuple = None) -> list:
    """Fetch units (eenheden — kg, stuks, liter)."""
    log.info("Eenheden ophalen...")
    url = f"{API_BASE}/{division}/logistics/Units"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} eenheden opgehaald")
    return raw


# ── FINANCIEEL EXTRA ──

def fetch_journals(token: str, division: str, creds: tuple = None) -> list:
    """Fetch journals (dagboeken)."""
    log.info("Dagboeken ophalen...")
    url = f"{API_BASE}/{division}/financial/Journals"
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} dagboeken opgehaald")
    return raw


def fetch_receivables(token: str, division: str, creds: tuple = None) -> list:
    """Fetch open receivables (openstaande debiteuren)."""
    log.info("Openstaande debiteuren ophalen...")
    url = f"{API_BASE}/{division}/cashflow/Receivables"
    params = {
        "$select": "AccountName,AccountCode,AmountDC,DueDate,InvoiceDate,InvoiceNumber,Description,IsFullyPaid",
        "$filter": "IsFullyPaid eq false",
    }
    cid, csec = creds or (None, None)
    raw = fetch_all(token, url, params, client_id=cid, client_secret=csec)
    log.info(f"  {len(raw)} openstaande debiteuren-regels opgehaald")
    return raw


# ── Data transformatie voor leverancier-order-tool ──
def parse_odata_date(val):
    """Converteer /Date(1605484800000)/ naar YYYY-MM-DD."""
    if not val or not isinstance(val, str):
        return None
    import re
    m = re.match(r"/Date\((-?\d+)\)/", val)
    if m:
        from datetime import timezone as tz
        ts = int(m.group(1)) / 1000
        try:
            return datetime.fromtimestamp(ts, tz=tz.utc).strftime("%Y-%m-%d")
        except (OSError, ValueError):
            return None
    # Already ISO format?
    if "T" in val or len(val) == 10:
        return val[:10]
    return None


def build_tool_data(dataset: dict):
    """Bouw data.json op in het formaat dat leverancier-order-tool.html verwacht."""

    raw_materials = dataset.get("shopOrderMaterials", [])
    raw_po = dataset.get("purchaseOrders", [])
    raw_accounts = dataset.get("accounts", [])
    raw_stock = dataset.get("stockPositions", [])
    raw_orders = dataset.get("shopOrders", [])

    # 1. supplierNames: {code: name}
    supplier_names = {}
    for acc in raw_accounts:
        code = acc.get("Code") or acc.get("code")
        name = acc.get("Name") or acc.get("name")
        is_supplier = acc.get("IsSupplier") or acc.get("is_supplier")
        if code and name:
            # Strip leading spaces from Exact codes
            code = str(code).strip()
            supplier_names[code] = name

    # 2. purchaseOrders: [{nr, supplierCode, orderDate, receiptDate, status}]
    #    Groepeer PO lines per PurchaseOrderID om PO-level info te maken
    po_map = {}  # PurchaseOrderID -> PO header info
    for r in raw_po:
        pid = r.get("PurchaseOrderID", "")
        if pid and pid not in po_map:
            order_nr = r.get("OrderNumber")
            po_map[pid] = {
                "nr": str(order_nr) if order_nr else "",
                "supplierCode": str(r.get("SupplierCode", "")).strip(),
                "orderDate": parse_odata_date(r.get("OrderDate")),
                "receiptDate": parse_odata_date(r.get("ReceiptDate")),
                "status": 10,  # default open
            }
        # Update receiptDate to latest line's date
        if pid in po_map:
            line_date = parse_odata_date(r.get("ReceiptDate"))
            if line_date and (not po_map[pid]["receiptDate"] or line_date > po_map[pid]["receiptDate"]):
                po_map[pid]["receiptDate"] = line_date
            # Determine status: if all received → 30, else 10
            qty = r.get("Quantity") or 0
            recv = r.get("ReceivedQuantity") or 0
            if qty > 0 and recv >= qty:
                po_map[pid]["status"] = max(po_map[pid].get("status", 10), 30)

    purchase_orders = list(po_map.values())

    # 3. purchaseOrderLines: [{orderNr, itemCode, description, quantity, received, receiptDate, shopOrderNr}]
    purchase_order_lines = []
    for r in raw_po:
        pid = r.get("PurchaseOrderID", "")
        po_header = po_map.get(pid, {})
        purchase_order_lines.append({
            "orderNr": po_header.get("nr", ""),
            "itemCode": r.get("ItemCode", ""),
            "description": r.get("ItemDescription") or r.get("Description", ""),
            "quantity": r.get("Quantity", 0),
            "received": r.get("ReceivedQuantity", 0),
            "receiptDate": parse_odata_date(r.get("ReceiptDate")),
            "shopOrderNr": None,  # Niet direct beschikbaar via API
        })

    # 4. materialPlans: {shopOrderId: [{itemCode, description, quantity, ...}]}
    material_plans = {}
    for r in raw_materials:
        so_id = r.get("ShopOrder", "")
        if so_id:
            if so_id not in material_plans:
                material_plans[so_id] = []
            material_plans[so_id].append({
                "itemCode": r.get("ItemCode", ""),
                "description": r.get("ItemDescription") or r.get("Description", ""),
                "quantity": r.get("PlannedQuantity", 0),
                "amount": r.get("PlannedAmountFC", 0),
            })

    # 5. shopOrderSubcontractor: {orderNr: supplierCode}
    #    Dit vereist ShopOrderRoutingStepPlans (uitbesteed werk) — die halen we nu niet op.
    #    Laat leeg, wordt later aangevuld als die endpoint beschikbaar is.
    shop_order_subcontractor = {}

    # 6. stockData: {itemCode: {inStock, planningIn, planningOut}}
    stock_data = {}
    for r in raw_stock:
        code = r.get("ItemCode", "")
        if code:
            stock_data[code] = {
                "inStock": r.get("CurrentStock", 0),
                "planningIn": r.get("PlannedStockIn", 0),
                "planningOut": r.get("PlannedStockOut", 0),
            }

    # Build output
    tool_data = {
        "lastUpdated": dataset.get("lastUpdated", datetime.now(timezone.utc).isoformat()),
        "shopOrders": raw_orders,
        "materialPlans": material_plans,
        "shopOrderSubcontractor": shop_order_subcontractor,
        "purchaseOrders": purchase_orders,
        "purchaseOrderLines": purchase_order_lines,
        "stockData": stock_data,
        "supplierNames": supplier_names,
    }

    DATA_FILE.write_text(json.dumps(tool_data, indent=2, ensure_ascii=False))
    log.info(f"data.json bijgewerkt: {len(purchase_orders)} POs, "
             f"{len(purchase_order_lines)} PO-regels, "
             f"{len(supplier_names)} leveranciers, "
             f"{len(stock_data)} voorraadposities")


# ── Main Sync ──
def sync_orders_only(token: str, division: str, creds: tuple = None):
    """Sync only shop orders — lightweight update for data.json."""
    orders = fetch_shop_orders(token, division, creds=creds)

    output = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "shopOrders": orders,
    }

    DATA_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    log.info(f"data.json bijgewerkt: {len(orders)} orders")


def sync_full(token: str, division: str, creds: tuple = None, incremental: bool = False):
    """Dataset sync — all entities. Met `incremental=True` worden grote tabellen
    incrementeel opgehaald en gemerged in de bestaande dataset.json."""
    global _incremental_mode, _sync_state, _active_table
    _incremental_mode = incremental
    _sync_state = load_state() if incremental else {}

    mode_label = "INCREMENTEEL" if incremental else "VOLLEDIG"
    log.info("=" * 60)
    log.info(f"{mode_label}E DATA SYNC GESTART")
    log.info("=" * 60)

    # Bij incrementeel: laad bestaande dataset als basis
    if incremental and FULL_DATA_FILE.exists():
        try:
            dataset = json.loads(FULL_DATA_FILE.read_text())
            log.info(f"Bestaande dataset geladen ({len(dataset)} keys)")
        except (json.JSONDecodeError, OSError) as e:
            log.warning(f"Kon bestaande dataset niet laden: {e} — full refresh")
            dataset = {}
            _incremental_mode = False
    else:
        dataset = {}

    dataset["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    dataset["division"] = division

    # Track de hoogste gezien timestamp per tabel voor de volgende run
    new_state = dict(_sync_state)

    def safe_fetch(name, fetch_fn, *args, **kwargs):
        """Fetch met error handling — stopt niet de hele sync."""
        try:
            return fetch_fn(*args, **kwargs)
        except (requests.HTTPError, requests.ConnectionError) as e:
            log.warning(f"  {name} mislukt: {e}")
            return []

    def fetch_table(table_key, name, fetch_fn, *args, **kwargs):
        """Wrapper die _active_table zet, fetcht, en bij incremental in
        de bestaande dataset mergt op de id_field uit INCREMENTAL_TABLES."""
        global _active_table
        _active_table = table_key
        try:
            new_records = safe_fetch(name, fetch_fn, *args, **kwargs)
        finally:
            _active_table = None

        if not isinstance(new_records, list):
            return new_records  # dict-resultaten (sales/purchase invoices) afhandelt caller

        if _incremental_mode and table_key in INCREMENTAL_TABLES:
            ts_field, id_field = INCREMENTAL_TABLES[table_key]
            old = dataset.get(table_key, []) or []
            merged = merge_records(old, new_records, id_field)
            log.info(f"  [merge] {table_key}: {len(old)} oud + {len(new_records)} nieuw → {len(merged)} totaal")
            # Update state met hoogste timestamp uit de nieuwe batch
            top_ts = _max_timestamp(new_records, ts_field)
            if top_ts:
                new_state[table_key] = top_ts
            return merged

        return new_records

    # 1. Shop orders + materials  (incrementeel)
    dataset["shopOrders"] = fetch_table("shopOrders", "ShopOrders", fetch_shop_orders, token, division, creds=creds)
    dataset["shopOrderMaterials"] = fetch_table("shopOrderMaterials", "ShopOrderMaterials", fetch_shop_order_materials, token, division, creds=creds)

    # 3. Financial data
    dataset["glAccounts"] = safe_fetch("GLAccounts", fetch_gl_accounts, token, division, creds=creds)

    # TransactionLines — verreweg de grootste tabel, hier wint incrementeel het meeste
    if _incremental_mode:
        _active_table = "transactionLines"
        try:
            new_lines = safe_fetch("Transacties (incremental)", fetch_transaction_lines, token, division, None, creds=creds)
        finally:
            _active_table = None
        ts_field, id_field = INCREMENTAL_TABLES["transactionLines"]
        old = dataset.get("transactionLines", []) or []
        dataset["transactionLines"] = merge_records(old, new_lines, id_field)
        log.info(f"  [merge] transactionLines: {len(old)} oud + {len(new_lines)} nieuw → {len(dataset['transactionLines'])} totaal")
        top = _max_timestamp(new_lines, ts_field)
        if top:
            new_state["transactionLines"] = top
    else:
        # Fetch transaction lines per year to avoid timeouts
        current_year = datetime.now().year
        all_transactions = []
        for year in range(2020, current_year + 1):
            lines = safe_fetch(f"Transacties {year}", fetch_transaction_lines, token, division, year, creds=creds)
            all_transactions.extend(lines)
        dataset["transactionLines"] = all_transactions

    # 4. Master data
    dataset["accounts"] = safe_fetch("Accounts", fetch_accounts, token, division, creds=creds)
    dataset["items"] = safe_fetch("Items", fetch_items, token, division, creds=creds)

    # 5. Purchase orders (incrementeel)
    dataset["purchaseOrders"] = fetch_table("purchaseOrders", "PurchaseOrders", fetch_purchase_orders, token, division, creds=creds)

    # 6. Stock positions
    dataset["stockPositions"] = safe_fetch("StockPositions", fetch_stock_positions, token, division, creds=creds)

    # 7. Routing step plans (uitbesteed werk → leverancierkoppeling) — incrementeel
    dataset["routingStepPlans"] = fetch_table("routingStepPlans", "RoutingStepPlans", fetch_routing_step_plans, token, division, creds=creds)

    # 8. Sales (verkoop)
    sales_orders = safe_fetch("SalesOrders", fetch_sales_orders, token, division, creds=creds)
    if isinstance(sales_orders, dict):
        dataset["salesOrderHeaders"] = sales_orders.get("headers", [])
        dataset["salesOrderLines"] = sales_orders.get("lines", [])
    else:
        dataset["salesOrderHeaders"] = []
        dataset["salesOrderLines"] = []

    sales_invoices = safe_fetch("SalesInvoices", fetch_sales_invoices, token, division, creds=creds)
    if isinstance(sales_invoices, dict):
        dataset["salesInvoiceHeaders"] = sales_invoices.get("headers", [])
        dataset["salesInvoiceLines"] = sales_invoices.get("lines", [])
    else:
        dataset["salesInvoiceHeaders"] = []
        dataset["salesInvoiceLines"] = []

    goods_deliveries = safe_fetch("GoodsDeliveries", fetch_goods_deliveries, token, division, creds=creds)
    if isinstance(goods_deliveries, dict):
        dataset["goodsDeliveryHeaders"] = goods_deliveries.get("headers", [])
        dataset["goodsDeliveryLines"] = goods_deliveries.get("lines", [])
    else:
        dataset["goodsDeliveryHeaders"] = []
        dataset["goodsDeliveryLines"] = []

    # 9. Purchase invoices + goods receipts
    purchase_invoices = safe_fetch("PurchaseInvoices", fetch_purchase_invoices, token, division, creds=creds)
    if isinstance(purchase_invoices, dict):
        dataset["purchaseInvoiceHeaders"] = purchase_invoices.get("headers", [])
        dataset["purchaseInvoiceLines"] = purchase_invoices.get("lines", [])
    else:
        dataset["purchaseInvoiceHeaders"] = []
        dataset["purchaseInvoiceLines"] = []

    goods_receipts = safe_fetch("GoodsReceipts", fetch_goods_receipts, token, division, creds=creds)
    if isinstance(goods_receipts, dict):
        dataset["goodsReceiptHeaders"] = goods_receipts.get("headers", [])
        dataset["goodsReceiptLines"] = goods_receipts.get("lines", [])
    else:
        dataset["goodsReceiptHeaders"] = []
        dataset["goodsReceiptLines"] = []

    dataset["supplierItems"] = safe_fetch("SupplierItems", fetch_supplier_items, token, division, creds=creds)

    # 10. Manufacturing extra (productie)
    dataset["bomMaterials"] = safe_fetch("BOM Materials", fetch_bom_materials, token, division, creds=creds)
    dataset["bomVersions"] = safe_fetch("BOM Versions", fetch_bom_versions, token, division, creds=creds)
    dataset["shopOrderReceipts"] = fetch_table("shopOrderReceipts", "ShopOrderReceipts", fetch_shop_order_receipts, token, division, creds=creds)
    dataset["materialIssues"] = fetch_table("materialIssues", "MaterialIssues", fetch_material_issues, token, division, creds=creds)
    # Werkelijke WO-kosten uit het grootboek (alleen afgeronde WOs)
    try:
        dataset["shopOrderActualCosts"] = fetch_shop_order_actual_costs(
            token, division, dataset.get("shopOrders", []), creds=creds)
    except Exception as e:
        log.warning(f"shopOrderActualCosts faalde: {e}")
        dataset["shopOrderActualCosts"] = {}
    dataset["operations"] = safe_fetch("Operations", fetch_operations, token, division, creds=creds)
    dataset["workcenters"] = safe_fetch("Workcenters", fetch_workcenters, token, division, creds=creds)

    # 11. Logistics extra
    dataset["batchNumbers"] = safe_fetch("BatchNumbers", fetch_batch_numbers, token, division, creds=creds)
    dataset["stockBatchNumbers"] = safe_fetch("StockBatchNumbers", fetch_stock_batch_numbers, token, division, creds=creds)
    dataset["itemGroups"] = safe_fetch("ItemGroups", fetch_item_groups, token, division, creds=creds)
    dataset["warehouses"] = safe_fetch("Warehouses", fetch_warehouses, token, division, creds=creds)
    dataset["units"] = safe_fetch("Units", fetch_units, token, division, creds=creds)

    # 12. Financial extra
    dataset["journals"] = safe_fetch("Journals", fetch_journals, token, division, creds=creds)
    dataset["receivables"] = safe_fetch("Receivables", fetch_receivables, token, division, creds=creds)

    # Kwaliteitscheck: vergelijk met bestaande dataset
    # Overschrijf alleen als nieuwe data minstens zo compleet is
    core_keys = ["shopOrders", "accounts", "items", "purchaseOrders", "stockPositions"]
    if FULL_DATA_FILE.exists():
        try:
            old = json.loads(FULL_DATA_FILE.read_text())
            empty_core = [k for k in core_keys if len(dataset.get(k, [])) == 0 and len(old.get(k, [])) > 0]
            if empty_core:
                log.warning(f"⚠️  Kerntabellen leeg door netwerkfout: {', '.join(empty_core)}")
                log.warning("Bestaande dataset.json wordt NIET overschreven!")
                log.warning("Los het netwerkprobleem op en draai de sync opnieuw.")
                return
        except (json.JSONDecodeError, OSError):
            pass  # Oude file onleesbaar, overschrijf gewoon

    # Write full dataset
    FULL_DATA_FILE.write_text(json.dumps(dataset, indent=2, ensure_ascii=False))

    # Save incremental sync state
    if _incremental_mode:
        save_state(new_state)
        log.info(f"Sync state opgeslagen ({len(new_state)} tabellen)")

    # data.json lightweight update (shop orders voor snelle toegang)
    if dataset["shopOrders"]:
        DATA_FILE.write_text(json.dumps({
            "lastUpdated": dataset["lastUpdated"],
            "shopOrders": dataset["shopOrders"],
        }, indent=2, ensure_ascii=False))
        log.info("data.json bijgewerkt (fallback)")

    # Summary
    log.info("=" * 60)
    log.info("SYNC COMPLEET — Samenvatting:")
    for key, val in dataset.items():
        if isinstance(val, list):
            log.info(f"  {key}: {len(val)} records")
    log.info(f"Dataset opgeslagen: {FULL_DATA_FILE}")
    log.info(f"Bestandsgrootte: {FULL_DATA_FILE.stat().st_size / 1024 / 1024:.1f} MB")
    log.info("=" * 60)

    # Rebuild SQLite database
    build_sqlite = SCRIPT_DIR / "build_sqlite.py"
    if build_sqlite.exists():
        log.info("SQLite database rebuilden...")
        import subprocess
        result = subprocess.run(
            [sys.executable, str(build_sqlite)],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            log.info("SQLite rebuild geslaagd")
            for line in result.stdout.strip().splitlines():
                log.info(f"  {line}")
        else:
            log.error(f"SQLite rebuild mislukt: {result.stderr}")
    else:
        log.warning(f"build_sqlite.py niet gevonden op {build_sqlite}")

    # Deploy naar Netlify
    deploy_to_netlify()


def deploy_to_netlify():
    """Deploy leverancier-order-tool + dataset.json naar Netlify."""
    env = load_env()
    netlify_token = env.get("NETLIFY_TOKEN", "")
    netlify_site = env.get("NETLIFY_SITE_ID", "")
    if not netlify_token or not netlify_site:
        log.info("Netlify deploy overgeslagen (geen NETLIFY_TOKEN/NETLIFY_SITE_ID in .env)")
        return

    import hashlib
    api = "https://api.netlify.com/api/v1"
    headers = {"Authorization": f"Bearer {netlify_token}"}

    files_to_deploy = {
        "leverancier-order-tool.html": SCRIPT_DIR / "leverancier-order-tool.html",
        "dataset.json": FULL_DATA_FILE,
        "data.json": DATA_FILE,
        "exact.db": SCRIPT_DIR / "exact.db",
    }

    file_hashes = {}
    for name, path in files_to_deploy.items():
        if path.exists():
            sha1 = hashlib.sha1(path.read_bytes()).hexdigest()
            file_hashes[f"/{name}"] = sha1
            if name == "leverancier-order-tool.html":
                file_hashes["/index.html"] = sha1

    if not file_hashes:
        log.warning("Geen bestanden gevonden voor Netlify deploy")
        return

    log.info(f"Netlify deploy starten ({len(file_hashes)} bestanden)...")
    try:
        resp = requests.post(f"{api}/sites/{netlify_site}/deploys", headers=headers,
                             json={"files": file_hashes})
        resp.raise_for_status()
        deploy = resp.json()
        deploy_id = deploy["id"]
        required = deploy.get("required", [])

        uploaded = set()
        for name, path in files_to_deploy.items():
            if not path.exists():
                continue
            sha1 = hashlib.sha1(path.read_bytes()).hexdigest()
            if sha1 in required and sha1 not in uploaded:
                size = path.stat().st_size
                log.info(f"  Uploaden: {name} ({size / 1e6:.1f} MB)...")
                # Lees bytes volledig in (geen streaming) — op GitHub Actions
                # droppen sommige proxies de Authorization header bij chunked
                # uploads. Content-Length niet handmatig zetten.
                payload = path.read_bytes()
                upload_resp = requests.put(
                    f"{api}/deploys/{deploy_id}/files/{name}",
                    headers={"Authorization": f"Bearer {netlify_token}",
                             "Content-Type": "application/octet-stream"},
                    data=payload,
                    timeout=600
                )
                upload_resp.raise_for_status()
                uploaded.add(sha1)

        log.info("✅ Netlify deploy compleet: https://leverancier-order-tool.netlify.app/")
    except Exception as e:
        log.error(f"Netlify deploy mislukt: {e}")


def main():
    parser = argparse.ArgumentParser(description="Exact Online data sync")
    parser.add_argument("--auth", action="store_true", help="Open browser voor OAuth2 login")
    parser.add_argument("--auth-callback", type=str, help="Verwerk callback URL met ?code=...")
    parser.add_argument("--orders-only", action="store_true", help="Alleen shop orders ophalen")
    parser.add_argument("--full", action="store_true", help="Forceer volledige refresh (default: incrementeel als state bestaat)")
    parser.add_argument("--division", type=str, help="Override division code")
    args = parser.parse_args()

    client_id, client_secret, saved_division = get_config()

    if args.auth:
        run_auth_flow(client_id, client_secret)
        return
    elif args.auth_callback:
        token = run_auth_flow(client_id, client_secret, callback_url=args.auth_callback)
    else:
        token = get_valid_token(client_id, client_secret)

    # Get division
    division = args.division or saved_division
    if not division:
        log.info("Division ophalen...")
        division = get_division(token)
        log.info(f"Division: {division}")
        # Save for future use
        env_text = ENV_FILE.read_text() if ENV_FILE.exists() else ""
        if "EXACT_DIVISION" not in env_text:
            with open(ENV_FILE, "a") as f:
                f.write(f"\nEXACT_DIVISION={division}\n")

    creds = (client_id, client_secret)

    if args.orders_only:
        sync_orders_only(token, division, creds=creds)
    else:
        # Default: incrementeel als state bestaat én dataset bestaat én niet --full
        use_incremental = (not args.full) and STATE_FILE.exists() and FULL_DATA_FILE.exists()
        sync_full(token, division, creds=creds, incremental=use_incremental)


if __name__ == "__main__":
    main()
