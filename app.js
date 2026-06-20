const SETTINGS_KEY = 'inv-backend-settings-v7';
const PRICE_CACHE_KEY = 'inv-price-cache-v7';
const MONEY_HIDDEN_KEY = 'inv-money-hidden-v7';
const REQUEST_TIMEOUT_MS = 15000;

const DEFAULT_SETTINGS = {
  backendUrl: 'https://investment-forecast-backen.onrender.com',
  portfolioId: 'portfolio-boris-main'
};

const dashboardView = document.getElementById('dashboardView');
const contentView = document.getElementById('contentView');
const statusBar = document.getElementById('statusBar');
const reloadBtn = document.getElementById('reloadBtn');
const toggleMoneyBtn = document.getElementById('toggleMoneyBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const backendUrlInput = document.getElementById('backendUrlInput');
const portfolioIdInput = document.getElementById('portfolioIdInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const navDashboard = document.getElementById('navDashboard');
const navHoldings = document.getElementById('navHoldings');
const navHorizons = document.getElementById('navHorizons');

let selectedScenario = 'base';
let selectedHorizon = 'y4';
let activeScreen = 'dashboard';
let moneyHidden = localStorage.getItem(MONEY_HIDDEN_KEY) === '1';
let isRefreshing = false;

const fmtEuro = (v) =>
  new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(v || 0)) + ' €';

const fmtNum = (v, d = 2) =>
  new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }).format(Number(v || 0));

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(data) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
}

function setStatus(text) {
  if (statusBar) statusBar.textContent = text;
}

function showModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove('hidden');
  settingsModal.style.display = 'flex';
  settingsModal.setAttribute('aria-hidden', 'false');
}

function hideModal() {
  if (!settingsModal) return;
  settingsModal.classList.add('hidden');
  settingsModal.style.display = 'none';
  settingsModal.setAttribute('aria-hidden', 'true');
}

function setActiveNav(key) {
  [navDashboard, navHoldings, navHorizons]
    .filter(Boolean)
    .forEach((x) => x.classList.remove('active'));

  if (key === 'dashboard' && navDashboard) navDashboard.classList.add('active');
  if (key === 'holdings' && navHoldings) navHoldings.classList.add('active');
  if (key === 'horizons' && navHorizons) navHorizons.classList.add('active');

  activeScreen = key;
}

function applyMoneyHidden() {
  document.body.classList.toggle('money-hidden', moneyHidden);
  if (toggleMoneyBtn) {
    toggleMoneyBtn.textContent = moneyHidden ? 'Покажи суми' : 'Скрий суми';
  }
}

function getPriceCache() {
  try {
    return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setPriceCache(data) {
  localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(data));
}

function sourceBadge(item) {
  if (!item) return '';

  const source = String(item?.source || '').toLowerCase();
  const itemId = String(item?.id || '').toLowerCase();

  if (source === 'manual') {
    return '<span class="source-badge manual">manual</span>';
  }

  if (
    source === 'live' ||
    source === 'live-fallback' ||
    itemId.startsWith('onemarket_')
  ) {
    return '<span class="source-badge live">live</span>';
  }

  return '<span class="source-badge fallback">fallback</span>';
}

function fundBadge(item) {
  const direction = String(item?.direction || 'flat').toLowerCase();
  const value = Number(item?.changePercent);

  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
    if (direction === 'up') return '<span class="pill up">▲</span>';
    if (direction === 'down') return '<span class="pill down">▼</span>';
    return '<span class="pill flat">• 0.00%</span>';
  }

  const pct = fmtNum(Math.abs(value), 2);

  if (direction === 'up') return `<span class="pill up">▲ +${pct}%</span>`;
  if (direction === 'down') return `<span class="pill down">▼ -${pct}%</span>`;
  return `<span class="pill flat">• ${pct}%</span>`;
}

function diffBadge(current, previous) {
  if (previous === undefined || previous === null || Number.isNaN(previous) || previous === 0) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  const diffPct = ((current - previous) / previous) * 100;
  if (Math.abs(diffPct) < 0.0001) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  if (diffPct > 0) return `<span class="pill up">▲ ${fmtNum(diffPct, 2)}%</span>`;
  return `<span class="pill down">▼ ${fmtNum(Math.abs(diffPct), 2)}%</span>`;
}

function findOnemarketMatch(row, items) {
  const productId = String(row?.product_id || '').trim();

  const exactMap = {
    'product-om-jpm': 'onemarket_jpm_us_equities',
    'product-om-blackrock': 'onemarket_blackrock_global_equity_dynamic_opportunities'
  };

  const mappedId = exactMap[productId];
  if (mappedId) {
    return items.find((item) => item.id === mappedId) || null;
  }

  const hay = normalizeText(`${row.product_id} ${row.product_name}`);

  return (
    items.find((item) => {
      const itemId = normalizeText(item.id);
      const itemName = normalizeText(item.name);
      const itemIsin = normalizeText(item.isin);
      const itemWkn = normalizeText(item.wkn);

      if (itemIsin && hay.includes(itemIsin)) return true;
      if (itemWkn && hay.includes(itemWkn)) return true;
      if (itemId && hay.includes(itemId)) return true;
      if (itemName && (hay.includes(itemName) || itemName.includes(hay))) return true;

      if (hay.includes('jpmorgan') && item.id === 'onemarket_jpm_us_equities') return true;
      if (
        hay.includes('blackrock') &&
        item.id === 'onemarket_blackrock_global_equity_dynamic_opportunities'
      ) return true;

      return false;
    }) || null
  );
}

function findAmundiMatch(row, items) {
  const productId = String(row?.product_id || '').trim().toLowerCase();

