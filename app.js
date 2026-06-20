const SETTINGS_KEY = 'inv-backend-settings-v7';
const PRICE_CACHE_KEY = 'inv-price-cache-v7';
const MONEY_HIDDEN_KEY = 'inv-money-hidden-v7';

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
let activeScreen = 'dashboard';
let selectedHorizon = 'y4';
let lastHoldings = [];
let moneyHidden = localStorage.getItem(MONEY_HIDDEN_KEY) === '1';

const fmtEuro = (v) =>
  new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v) + ' €';

const fmtNum = (v, d = 2) =>
  new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }).format(v);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function fundBadge(item) {
  const direction = String(item?.direction || 'flat').toLowerCase();
  const value = Number(item?.changePercent);

  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  const pct = fmtNum(Math.abs(value), 2);

  if (direction === 'up') {
    return `<span class="pill up">▲ +${pct}%</span>`;
  }

  if (direction === 'down') {
    return `<span class="pill down">▼ -${pct}%</span>`;
  }

  return `<span class="pill flat">• ${pct}%</span>`;
}

function findOnemarketMatch(row, items) {
  const productId = String(row?.product_id || '').trim();

  const exactMap = {
    'product-om-jpm': 'onemarket_jpm_us_equities',
    'product-om-blackrock':
      'onemarket_blackrock_global_equity_dynamic_opportunities'
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
      ) {
        return true;
      }

      return false;
    }) || null
  );
}

function findAmundiMatch(row, items) {
  const productId = String(row?.product_id || '').trim().toLowerCase();

  const exactMap = {
    'product-amundi-asia': 'amundi_asia_equity_focus_nav_eur',
    'product-amundi-china': 'amundi_china_equity_nav_eur',
    'product-amundi-us-pioneer': 'amundi_us_pioneer_nav_eur'
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

      if (itemId && hay.includes(itemId)) return true;
      if (itemName && (hay.includes(itemName) || itemName.includes(hay))) return true;

      if (hay.includes('amundiasia') && item.id === 'amundi_asia_equity_focus_nav_eur') return true;
      if (hay.includes('amundichina') && item.id === 'amundi_china_equity_nav_eur') return true;
      if (hay.includes('amundiuspioneer') && item.id === 'amundi_us_pioneer_nav_eur') return true;

      return false;
    }) || null
  );
}

function getDisplayPrice(row, extItem) {
  const price = Number(extItem?.price);
  return Number.isFinite(price) ? price : row.current_price;
}

function getDisplayValue(row, extItem) {
  const price = Number(extItem?.price);
  const qty = Number(row.quantity_input);

  if (Number.isFinite(price) && Number.isFinite(qty)) {
    return qty * price;
  }

  return row.current_value;
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
  statusBar.textContent = text;
}

function showModal() {
  settingsModal.classList.remove('hidden');
  settingsModal.style.display = 'flex';
  settingsModal.setAttribute('aria-hidden', 'false');
}

function hideModal() {
  settingsModal.classList.add('hidden');
  settingsModal.style.display = 'none';
  settingsModal.setAttribute('aria-hidden', 'true');
}

function setActiveNav(key) {
  [navDashboard, navHoldings, navHorizons].forEach((x) => x.classList.remove('active'));
  if (key === 'dashboard') navDashboard.classList.add('active');
  if (key === 'holdings') navHoldings.classList.add('active');
  if (key === 'horizons') navHorizons.classList.add('active');
  activeScreen = key;
}

function applyMoneyHidden() {
  document.body.classList.toggle('money-hidden', moneyHidden);
  toggleMoneyBtn.textContent = moneyHidden ? 'Покажи суми' : 'Скрий суми';
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

function diffBadge(current, previous) {
  if (previous === undefined || previous === null || Number.isNaN(previous)) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  if (previous === 0) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  const diffPct = ((current - previous) / previous) * 100;

  if (Math.abs(diffPct) < 0.0001) {
    return '<span class="pill flat">• 0.00%</span>';
  }

  if (diffPct > 0) {
    return `<span class="pill up">▲ ${fmtNum(diffPct, 2)}%</span>`;
  }

  return `<span class="pill down">▼ ${fmtNum(Math.abs(diffPct), 2)}%</span>`;
}

async function api(path, options = {}) {
  const s = getSettings();
  const base = (s.backendUrl || '').replace(/\/$/, '');

  if (!base) {
    throw new Error('Липсва Backend URL');
  }

  const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
  const url = isGet
    ? `${base}${path}${path.includes('?') ? '&' : '?'}_ts=${Date.now()}`
    : `${base}${path}`;

  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...options
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? ' - ' + text.slice(0, 160) : ''}`
    );
  }

  return res.json();
}

async function healthCheck() {
  const s = getSettings();
  const base = (s.backendUrl || '').replace(/\/$/, '');

  if (!base) return false;

  try {
    const res = await fetch(`${base}/health?_ts=${Date.now()}`, {
      cache: 'no-store'
    });
    return res.ok;
  } catch {
    return false;
  }
}

function updateDashboardQuickActions() {
  const qh = document.getElementById('quickHoldings');
  if (qh) qh.addEventListener('click', loadHoldings);

  const qz = document.getElementById('quickHorizons');
  if (qz) qz.addEventListener('click', loadHorizons);

  const qs = document.getElementById('quickSettings');
  if (qs) qs.addEventListener('click', openSettings);
}

async function loadDashboard() {
  setActiveNav('dashboard');
  dashboardView.classList.remove('hidden');
  contentView.classList.add('hidden');
  setStatus('Зареждане на dashboard...');

  try {
    const s = getSettings();
    const data = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/dashboard`);

    dashboardView.innerHTML = `
      <section class="card">
