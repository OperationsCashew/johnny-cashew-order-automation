// === Shared state ===
// Global variables with setter functions for ES module compatibility.

// --- Data (from dataset.json) ---
export let shopOrders = [];
export function setShopOrders(v) { shopOrders = v; }

export let materialPlans = {};
export function setMaterialPlans(v) { materialPlans = v; }

export let shopOrderSubcontractor = {};
export function setShopOrderSubcontractor(v) { shopOrderSubcontractor = v; }

export let purchaseOrders = [];
export function setPurchaseOrders(v) { purchaseOrders = v; }

export let purchaseOrderLines = [];
export function setPurchaseOrderLines(v) { purchaseOrderLines = v; }

export let stockData = {};
export function setStockData(v) { stockData = v; }

export let supplierNames = {};
export function setSupplierNames(v) { supplierNames = v; }

export let stockBatchData = [];
export function setStockBatchData(v) { stockBatchData = v; }

export let cffReceivablesData = [];
export function setCffReceivablesData(v) { cffReceivablesData = v; }

// --- Leverancier UI state ---
export let currentFilter = "all";
export function setCurrentFilter(v) { currentFilter = v; }

export let currentSupplier = null;
export function setCurrentSupplier(v) { currentSupplier = v; }

export let selectedOrderId = null;
export function setSelectedOrderId(v) { selectedOrderId = v; }

// --- Navigation state ---
export let currentCategory = 'supply';
export function setCurrentCategory(v) { currentCategory = v; }

// --- Stockcheck state ---
export let scDeVriesData = null;
export function setScDeVriesData(v) { scDeVriesData = v; }

export let scComparisonData = null;
export function setScComparisonData(v) { scComparisonData = v; }

// --- Forecast Accuracy state ---
export let forecastData = [];
export function setForecastData(v) { forecastData = v; }

export let forecastMetric = 'omzet';
export function setForecastMetric(v) { forecastMetric = v; }

export let forecastInitialized = false;
export function setForecastInitialized(v) { forecastInitialized = v; }

export let forecastCustomerMap = {};
export function setForecastCustomerMap(v) { forecastCustomerMap = v; }

// --- Sales state ---
export let salesMode = 'omzet';
export function setSalesMode(v) { salesMode = v; }

export let salesExpanded = new Set();
export function setSalesExpanded(v) { salesExpanded = v; }

export let salesInitialized = false;
export function setSalesInitialized(v) { salesInitialized = v; }

// --- Sales Orders state ---
export let soMode = 'omzet';
export function setSoMode(v) { soMode = v; }

export let soExpanded = new Set();
export function setSoExpanded(v) { soExpanded = v; }

export let soInitialized = false;
export function setSoInitialized(v) { soInitialized = v; }

// --- COGS state ---
export let cogsItems = [];
export function setCogsItems(v) { cogsItems = v; }

export let cogsSalesInvoices = [];
export function setCogsSalesInvoices(v) { cogsSalesInvoices = v; }

export let cogsRoutingCosts = {};
export function setCogsRoutingCosts(v) { cogsRoutingCosts = v; }

export let cogsMaterialIssues = {};
export function setCogsMaterialIssues(v) { cogsMaterialIssues = v; }

export let cogsActualCosts = {};
export function setCogsActualCosts(v) { cogsActualCosts = v; }

export let cogsMaterialPrices = {};
export function setCogsMaterialPrices(v) { cogsMaterialPrices = v; }

export let cogsCustomerFilter = {};
export function setCogsCustomerFilter(v) { cogsCustomerFilter = v; }

export let cogsSortField = 'margin';
export function setCogsSortField(v) { cogsSortField = v; }

export let cogsSortAsc = true;
export function setCogsSortAsc(v) { cogsSortAsc = v; }

export let cogsProducts = [];
export function setCogsProducts(v) { cogsProducts = v; }

export let selectedCogsProduct = null;
export function setSelectedCogsProduct(v) { selectedCogsProduct = v; }

export let cogsRawDataset = null;
export function setCogsRawDataset(v) { cogsRawDataset = v; }

export let cogsBigBagSplit = {};
export function setCogsBigBagSplit(v) { cogsBigBagSplit = v; }

export let cogsBigBagWarnings = {};
export function setCogsBigBagWarnings(v) { cogsBigBagWarnings = v; }

export let allCustomerNames = [];
export function setAllCustomerNames(v) { allCustomerNames = v; }

// --- P&L state ---
export let pnlTransactionLines = [];
export function setPnlTransactionLines(v) { pnlTransactionLines = v; }

export let pnlGLAccounts = {};
export function setPnlGLAccounts(v) { pnlGLAccounts = v; }

export let pnlEditMode = false;
export function setPnlEditMode(v) { pnlEditMode = v; }

export let pnlExpandedRows = {};
export function setPnlExpandedRows(v) { pnlExpandedRows = v; }

export let pnlUnlocked = false;
export function setPnlUnlocked(v) { pnlUnlocked = v; }

// --- Balance state ---
export let balEditMode = false;
export function setBalEditMode(v) { balEditMode = v; }

export let balExpandedRows = {};
export function setBalExpandedRows(v) { balExpandedRows = v; }

// --- Cashflow state ---
export let cfTransactionLines = [];
export function setCfTransactionLines(v) { cfTransactionLines = v; }

export let cfUnlockedState = false;
export function setCfUnlockedState(v) { cfUnlockedState = v; }

export let cfChartInstance = null;
export function setCfChartInstance(v) { cfChartInstance = v; }

export let cfShowBars = false;
export function setCfShowBars(v) { cfShowBars = v; }

// --- Cashflow Forecast state ---
export let _cffChartInstance = null;
export function set_cffChartInstance(v) { _cffChartInstance = v; }
