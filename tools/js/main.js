// === Entry point — imports all modules and exposes functions to window ===
import { loadData } from './shared/data-loader.js';
import { switchCategory, switchTab } from './tabs/navigation.js';
import { setFilter, copyEmail, openMailClient, selectWorkOrder } from './tabs/leverancier.js';
import {
    renderCOGSTab, toggleCustomerPanel, toggleAllCustomers, filterCustomerList, sortCOGS,
} from './tabs/cogs.js';
import { scDownloadExcel, scLoadDeVriesFile } from './tabs/stockcheck.js';
import {
    pnlUnlock, pnlToggleEditMode, pnlSaveMismatchAssignments, pnlCloseMismatch, pnlChangeBucket,
    renderPnLTab,
} from './tabs/pnl.js';
import {
    balUnlock, balToggleEditMode, renderBalanceTab, balChangeBucket, balUpdateNjanc,
} from './tabs/balance.js';
import {
    salesToggleMode as salesToggleMode_, salesDownloadCSV, salesToggleRow, renderSalesTab,
} from './tabs/sales.js';
import {
    salesOrdersToggleMode, salesOrdersDownloadCSV, soToggleRow, renderSalesOrdersTab,
} from './tabs/sales-orders.js';
import {
    forecastClear, forecastToggleMetric, forecastAutoMap, forecastLoadFile,
    forecastSetMapping, renderForecastTab,
} from './tabs/forecast-accuracy.js';
import {
    cfUnlock, cfToggleBars, cfShowDownloadMenu, cfDownloadCSV, renderCashflowTab,
} from './tabs/cashflow.js';
import {
    cffUnlock, cffAccToggle, cffClearSales, cffPasteInkoop, cffClearData,
    cffOpexSeedFromPnl, cffOpexAdd, cffOpexClearAll,
    cffEventsAdd, cffLoansAdd, cffLoansSeedFromPnl,
    cffLoadFile, cffLoadSalesFile,
    cffCashSeedFromBank, cffEventsDelete, cffLoansDelete,
    cffOpexDelete, cffOpexUpdate, cffEventsUpdate, cffLoansUpdate,
    cffBtwSet, cffBtwSetOverride, cffCashSet, cffDpoSet,
    cffDsoSetCustomer, cffSetManualPrice, cffStockSet, cffWcSet, cffWcToggleDebtor,
} from './tabs/cashflow-forecast.js';
import { renderNieuweTab } from './tabs/nieuwe-tab.js';

// Expose to window for onclick handlers in HTML
window.switchCategory = switchCategory;
window.switchTab = switchTab;
window.loadData = loadData;

// Leverancier
window.setFilter = setFilter;
window.copyEmail = copyEmail;
window.openMailClient = openMailClient;
window.selectWorkOrder = selectWorkOrder;

// COGS
window.renderCOGSTab = renderCOGSTab;
window.toggleCustomerPanel = toggleCustomerPanel;
window.toggleAllCustomers = toggleAllCustomers;
window.filterCustomerList = filterCustomerList;
window.sortCOGS = sortCOGS;

// Stockcheck
window.scDownloadExcel = scDownloadExcel;
window.scLoadDeVriesFile = scLoadDeVriesFile;

// P&L
window.pnlUnlock = pnlUnlock;
window.pnlToggleEditMode = pnlToggleEditMode;
window.pnlSaveMismatchAssignments = pnlSaveMismatchAssignments;
window.pnlCloseMismatch = pnlCloseMismatch;
window.pnlChangeBucket = pnlChangeBucket;
window.renderPnLTab = renderPnLTab;

// Balance
window.balUnlock = balUnlock;
window.balToggleEditMode = balToggleEditMode;
window.renderBalanceTab = renderBalanceTab;
window.balChangeBucket = balChangeBucket;
window.balUpdateNjanc = balUpdateNjanc;

// Sales
window.salesToggleMode = salesToggleMode_;
window.salesDownloadCSV = salesDownloadCSV;
window.salesToggleRow = salesToggleRow;
window.renderSalesTab = renderSalesTab;

// Sales Orders
window.salesOrdersToggleMode = salesOrdersToggleMode;
window.salesOrdersDownloadCSV = salesOrdersDownloadCSV;
window.soToggleRow = soToggleRow;
window.renderSalesOrdersTab = renderSalesOrdersTab;

// Forecast Accuracy
window.forecastClear = forecastClear;
window.forecastToggleMetric = forecastToggleMetric;
window.forecastAutoMap = forecastAutoMap;
window.forecastLoadFile = forecastLoadFile;
window.forecastSetMapping = forecastSetMapping;
window.renderForecastTab = renderForecastTab;

// Cashflow
window.cfUnlock = cfUnlock;
window.cfToggleBars = cfToggleBars;
window.cfShowDownloadMenu = cfShowDownloadMenu;
window.cfDownloadCSV = cfDownloadCSV;
window.renderCashflowTab = renderCashflowTab;

// Cashflow Forecast
window.cffUnlock = cffUnlock;
window.cffAccToggle = cffAccToggle;
window.cffClearSales = cffClearSales;
window.cffPasteInkoop = cffPasteInkoop;
window.cffClearData = cffClearData;
window.cffOpexSeedFromPnl = cffOpexSeedFromPnl;
window.cffOpexAdd = cffOpexAdd;
window.cffOpexClearAll = cffOpexClearAll;
window.cffEventsAdd = cffEventsAdd;
window.cffLoansAdd = cffLoansAdd;
window.cffLoansSeedFromPnl = cffLoansSeedFromPnl;
window.cffLoadFile = cffLoadFile;
window.cffLoadSalesFile = cffLoadSalesFile;
window.cffCashSeedFromBank = cffCashSeedFromBank;
window.cffEventsDelete = cffEventsDelete;
window.cffLoansDelete = cffLoansDelete;
window.cffOpexDelete = cffOpexDelete;
window.cffOpexUpdate = cffOpexUpdate;
window.cffEventsUpdate = cffEventsUpdate;
window.cffLoansUpdate = cffLoansUpdate;
window.cffBtwSet = cffBtwSet;
window.cffBtwSetOverride = cffBtwSetOverride;
window.cffCashSet = cffCashSet;
window.cffDpoSet = cffDpoSet;
window.cffDsoSetCustomer = cffDsoSetCustomer;
window.cffSetManualPrice = cffSetManualPrice;
window.cffStockSet = cffStockSet;
window.cffWcSet = cffWcSet;
window.cffWcToggleDebtor = cffWcToggleDebtor;

// Nieuwe Tab (collega)
window.renderNieuweTab = renderNieuweTab;

// Init
loadData();
