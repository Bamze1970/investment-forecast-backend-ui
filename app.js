const SETTINGS_KEY = 'inv-backend-settings-v7';
const PRICE_CACHE_KEY = 'inv-price-cache-v7';
const MONEY_HIDDEN_KEY = 'inv-money-hidden-v7';
const REQUEST_TIMEOUT_MS = 20000;
const TROY_OUNCE_IN_GRAMS = 31.1034768;

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
    source === 'fallback' ||
    itemId.startsWith('onemarket_') ||
    itemId.startsWith('market_') ||
    itemId.startsWith('amundi_')
  ) {
    return `<span class="source-badge ${source === 'fallback' ? 'fallback' : 'live'}">${source === 'fallback' ? 'fallback' : 'live'}</span>`;
  }

  return '<span class="source-badge fallback">fallback</span>';
}

function fundBadge(item) {
  const direction = String(item?.direction || 'flat').toLowerCase();
  const value = Number(item?.changePercent);

  if (direction === 'up') {
    if (Number.isFinite(value) && Math.abs(value) >= 0.0001) {
      return `<span class="pill up">▲ +${fmtNum(Math.abs(value), 2)}%</span>`;
    }
    return '<span class="pill up">▲</span>';
  }

  if (direction === 'down') {
    if (Number.isFinite(value) && Math.abs(value) >= 0.0001) {
      return `<span class="pill down">▼ -${fmtNum(Math.abs(value), 2)}%</span>`;
    }
    return '<span class="pill down">▼</span>';
  }

  if (Number.isFinite(value) && Math.abs(value) >= 0.0001) {
    return `<span class="pill flat">• ${fmtNum(Math.abs(value), 2)}%</span>`;
  }

  return '<span class="pill flat">• 0.00%</span>';
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
  if (mappedId) return items.find((item) => item.id === mappedId) || null;

  const hay = normalizeText(`${row.product_id} ${row.product_name}`);
  return (
    items.find((item) => {
      const itemId = normalizeText(item.id);
      const itemName = normalizeText(item.name);
      const itemIsin = normalizeText(item.isin);
      const itemWkn = normalizeText(item.wkn);
      return (
        (itemIsin && hay.includes(itemIsin)) ||
        (itemWkn && hay.includes(itemWkn)) ||
        (itemId && hay.includes(itemId)) ||
        (itemName && (hay.includes(itemName) || itemName.includes(hay)))
      );
    }) || null
  );
}

function findAmundiMatch(row, items) {
  const productId = String(row?.product_id || '').trim().toLowerCase();
  const exactMap = {
    'product-amundi-asia': 'amundi_asia_equity_focus_nav_eur',
    'product-amundi-china': 'amundi_china_equity_nav_eur',
    'product-amundi-us': 'amundi_us_pioneer_nav_eur',
    'product-amundi-us-pioneer': 'amundi_us_pioneer_nav_eur'
  };
  const mappedId = exactMap[productId];
  if (mappedId) return items.find((item) => item.id === mappedId) || null;
  return null;
}

function findMarketAssetMatch(row, items) {
  const productId = String(row?.product_id || '').trim().toLowerCase();
  const exactMap = {
    'product-gold': 'market_gold_spot_eur_oz',
    'product-silver': 'market_silver_spot_eur_oz',
    'product-solana': 'market_solana_spot_eur'
  };
  const mappedId = exactMap[productId];
  if (mappedId) return items.find((item) => item.id === mappedId) || null;
  return null;
}

function preferAmundi(liveItem, manualItem) {
  const livePrice = Number(liveItem?.price);
  if (liveItem && Number.isFinite(livePrice) && livePrice > 0) {
    return liveItem;
  }
  return manualItem || liveItem || null;
}

function getDisplayPrice(row, extItem) {
  const price = Number(extItem?.price);
  return Number.isFinite(price) ? price : Number(row.current_price || 0);
}

function getDisplayValue(row, extItem) {
  const price = Number(extItem?.price);
  const qty = Number(row.quantity_input);
  const priceUnit = String(extItem?.unit || row.current_price_unit || '').toUpperCase();
  const qtyUnit = String(row.quantity_input_unit || '').toLowerCase();

  if (Number.isFinite(price) && Number.isFinite(qty)) {
    if (priceUnit.includes('TROY_OUNCE') && qtyUnit.includes('gram')) {
      return (qty / TROY_OUNCE_IN_GRAMS) * price;
    }
    return qty * price;
  }

  return Number(row.current_value || 0);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timeout при връзка с backend-а');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function api(path, options = {}) {
  const s = getSettings();
  const base = (s.backendUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('Липсва Backend URL');

  const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
  const url = isGet
    ? `${base}${path}${path.includes('?') ? '&' : '?'}_ts=${Date.now()}`
    : `${base}${path}`;

  const res = await fetchWithTimeout(
    url,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...options
    },
    REQUEST_TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ' - ' + text.slice(0, 160) : ''}`);
  }

  return res.json();
}

async function loadAmundiManual() {
  const res = await fetchWithTimeout(
    `./amundi_manual.json?_ts=${Date.now()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    },
    8000
  );

  if (!res.ok) {
    throw new Error(`Не успях да заредя amundi_manual.json (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function updateDashboardQuickActions() {
  const qh = document.getElementById('quickHoldings');
  if (qh) qh.addEventListener('click', () => loadHoldings().catch(() => {}));

  const qz = document.getElementById('quickHorizons');
  if (qz) qz.addEventListener('click', () => loadHorizons().catch(() => {}));

  const qs = document.getElementById('quickSettings');
  if (qs) qs.addEventListener('click', openSettings);
}

function renderInitialDashboard() {
  setActiveNav('dashboard');
  if (dashboardView) dashboardView.classList.remove('hidden');
  if (contentView) contentView.classList.add('hidden');

  if (dashboardView) {
    dashboardView.innerHTML = `
      <section class="card">
        <h2>Готово</h2>
        <p class="note">Този екран е локален и не зарежда нищо автоматично.</p>
        <div class="quick-grid">
          <button class="quick-btn" id="quickHoldings"><strong>Активи</strong>Отвори списъка с активи</button>
          <button class="quick-btn" id="quickHorizons"><strong>Хоризонти</strong>Отвори прогнозите</button>
          <button class="quick-btn" id="quickSettings"><strong>Настройки</strong>Провери backend URL и portfolio ID</button>
        </div>
      </section>`;
  }

  updateDashboardQuickActions();
  applyMoneyHidden();
  setStatus('Готово. Избери екран отдолу или натисни Опресни.');
}

async function loadDashboard() {
  setActiveNav('dashboard');
  if (dashboardView) dashboardView.classList.remove('hidden');
  if (contentView) contentView.classList.add('hidden');
  setStatus('Зареждане на dashboard...');

  try {
    const s = getSettings();

    const [dashboardData, rows, onemarketData, amundiData, amundiManualItems, marketAssetsData] = await Promise.all([
      api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/dashboard`),
      api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings`),
      api('/api/onemarket').catch(() => ({ items: [] })),
      api('/api/amundi').catch(() => ({ items: [] })),
      loadAmundiManual().catch(() => []),
      api('/api/market-assets').catch(() => ({ items: [] }))
    ]);

    const onemarketItems = Array.isArray(onemarketData?.items) ? onemarketData.items : [];
    const amundiLiveItems = Array.isArray(amundiData?.items) ? amundiData.items : [];
    const amundiManual = Array.isArray(amundiManualItems) ? amundiManualItems : [];
    const marketItems = Array.isArray(marketAssetsData?.items) ? marketAssetsData.items : [];

    const currentPortfolioTotal = rows.reduce((total, r) => {
      const om = findOnemarketMatch(r, onemarketItems);
      const amLive = findAmundiMatch(r, amundiLiveItems);
      const amManual = findAmundiMatch(r, amundiManual);
      const am = preferAmundi(amLive, amManual);
      const ma = findMarketAssetMatch(r, marketItems);
      const ext = om || am || ma;

      return total + getDisplayValue(r, ext);
    }, 0);

    if (dashboardView) {
      dashboardView.innerHTML = `
        <section class="card">
          <h2>Dashboard</h2>
          <p class="note">Портфейл: <strong>${s.portfolioId}</strong></p>
          <div class="grid grid-4">
            <div class="metric"><span>Текущ портфейл</span><strong class="money">${fmtEuro(currentPortfolioTotal)}</strong></div>
            <div class="metric"><span>4Y Low</span><strong class="money">${fmtEuro(dashboardData.low_4y)}</strong></div>
            <div class="metric"><span>4Y Base</span><strong class="money">${fmtEuro(dashboardData.base_4y)}</strong></div>
            <div class="metric"><span>4Y High</span><strong class="money">${fmtEuro(dashboardData.high_4y)}</strong></div>
          </div>
        </section>
        <section class="card">
          <h2>Бързи действия</h2>
          <div class="quick-grid">
            <button class="quick-btn" id="quickHoldings"><strong>Активи</strong>Редактирай количества</button>
            <button class="quick-btn" id="quickHorizons"><strong>Хоризонти</strong>Преглед на прогнози low/base/high</button>
            <button class="quick-btn" id="quickSettings"><strong>Настройки</strong>Backend URL, Portfolio ID, визуализация</button>
          </div>
        </section>`;
    }

    updateDashboardQuickActions();
    applyMoneyHidden();
    setStatus('Dashboard е зареден успешно.');
  } catch (e) {
    if (dashboardView) {
      dashboardView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    }
    setStatus('Dashboard не се зареди. Можеш да ползваш Активи или Опресни.');
    throw e;
  }
}

async function patchQuantity(holdingId, quantity) {
  const s = getSettings();
  return api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings/${encodeURIComponent(holdingId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_input: Number(quantity) })
  });
}

function bindHoldingActions(rows) {
  rows.forEach((row) => {
    const btn = document.getElementById(`save-${row.id}`);
    const input = document.getElementById(`qty-${row.id}`);
    if (!btn || !input) return;

    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        setStatus(`Записване на количество за ${row.product_name}...`);
        await patchQuantity(row.id, input.value);
        await loadHoldings();
        setStatus(`Количеството за ${row.product_name} е записано успешно.`);
      } catch (e) {
        setStatus(`Грешка при запис за ${row.product_name}: ${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadHoldings() {
  setActiveNav('holdings');
  if (dashboardView) dashboardView.classList.add('hidden');
  if (contentView) contentView.classList.remove('hidden');
  setStatus('Зареждане на активи...');

  try {
    const s = getSettings();
    const [rows, onemarketData, amundiData, amundiManualItems, marketAssetsData] = await Promise.all([
      api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings`),
      api('/api/onemarket').catch(() => ({ items: [] })),
      api('/api/amundi').catch(() => ({ items: [] })),
      loadAmundiManual().catch(() => []),
      api('/api/market-assets').catch(() => ({ items: [] }))
    ]);

    const onemarketItems = Array.isArray(onemarketData?.items) ? onemarketData.items : [];
    const amundiLiveItems = Array.isArray(amundiData?.items) ? amundiData.items : [];
    const amundiManual = Array.isArray(amundiManualItems) ? amundiManualItems : [];
    const marketItems = Array.isArray(marketAssetsData?.items) ? marketAssetsData.items : [];
    const prevCache = getPriceCache();

    if (contentView) {
      contentView.innerHTML = `
        <section class="card">
          <h2>Активи</h2>
          <p class="note">Onemarkets, Gold, Silver и Solana идват live от backend-а. Amundi е live с автоматичен fallback към <strong>amundi_manual.json</strong>, ако live цената е 0 или липсва.</p>
          <div class="table-wrap">
            <div class="row head-row">
              <div>Продукт</div>
              <div>Количество</div>
              <div>Цена</div>
              <div>Промяна</div>
              <div>Стойност</div>
            </div>
            ${rows
              .map((r) => {
                const prev = prevCache[r.product_id];
                const om = findOnemarketMatch(r, onemarketItems);
                const amLive = findAmundiMatch(r, amundiLiveItems);
                const amManual = findAmundiMatch(r, amundiManual);
                const am = preferAmundi(amLive, amManual);
                const ma = findMarketAssetMatch(r, marketItems);
                const ext = om || am || ma;

                const displayPrice = getDisplayPrice(r, ext);
                const displayValue = getDisplayValue(r, ext);
                const displayUnit = ext?.unit || ext?.currency || r.current_price_unit;
                const changeHtml = ext ? fundBadge(ext) : diffBadge(displayPrice, prev);
                const sourceHtml = sourceBadge(ext);
                const sourceDate = ext?.lastUpdated
                  ? `<span class="unit-muted">Updated: ${ext.lastUpdated}</span>`
                  : '';

                return `
                  <div class="row fund-row">
                    <div>
                      <div class="product-head">
                        <strong>${r.product_name}</strong>
                        ${sourceHtml}
                      </div>
                      <span class="unit-muted mono">${r.product_id}</span>
                    </div>
                    <div>
                      <input id="qty-${r.id}" class="qty-inline" type="number" step="0.00000001" value="${r.quantity_input}" />
                      <span class="unit-muted">${r.quantity_input_unit}</span>
                      <div class="inline-actions">
                        <button id="save-${r.id}" class="secondary-btn small-btn">Запази</button>
                      </div>
                    </div>
                    <div>
                      <strong>${fmtNum(displayPrice, 2)}</strong>
                      <span class="unit-muted">${displayUnit}</span>
                      ${sourceDate}
                    </div>
                    <div>${changeHtml}</div>
                    <div>
                      <strong class="money">${fmtEuro(displayValue)}</strong>
                      <span class="unit-muted">${r.currency}</span>
                    </div>
                  </div>`;
              })
              .join('')}
          </div>
        </section>`;
    }

    const newCache = { ...prevCache };
    rows.forEach((r) => {
      const om = findOnemarketMatch(r, onemarketItems);
      const amLive = findAmundiMatch(r, amundiLiveItems);
      const amManual = findAmundiMatch(r, amundiManual);
      const am = preferAmundi(amLive, amManual);
      const ma = findMarketAssetMatch(r, marketItems);
      const ext = om || am || ma;
      newCache[r.product_id] = getDisplayPrice(r, ext);
    });

    setPriceCache(newCache);
    bindHoldingActions(rows);
    applyMoneyHidden();
    setStatus('Активите са заредени успешно.');
  } catch (e) {
    if (contentView) {
      contentView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    }
    setStatus(`Грешка при holdings: ${e.message}`);
    throw e;
  }
}

async function loadHorizons() {
  setActiveNav('horizons');
  if (dashboardView) dashboardView.classList.add('hidden');
  if (contentView) contentView.classList.remove('hidden');
  setStatus('Зареждане на прогноза...');

  try {
    const s = getSettings();
    const data = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/forecasts?horizon=${encodeURIComponent(selectedHorizon)}&scenario=${encodeURIComponent(selectedScenario)}`);

    const horizons = [['week', '1 седмица'], ['month', '1 месец'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4'], ['y1', '1Y'], ['y2', '2Y'], ['y3', '3Y'], ['y4', '4Y']];
    const scenarios = [['low', 'Песимистичен'], ['base', 'Основен'], ['high', 'Оптимистичен']];

    if (contentView) {
      contentView.innerHTML = `
        <section class="card">
          <h2>Хоризонти</h2>
          <p class="note">След смяна на количества натисни <strong>Опресни</strong> или мини пак през Хоризонти.</p>
          <div class="tabs">${horizons.map(([k, l]) => `<button class="tab ${k === selectedHorizon ? 'active' : ''}" data-h="${k}">${l}</button>`).join('')}</div>
          <div class="tabs">${scenarios.map(([k, l]) => `<button class="tab ${k === selectedScenario ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
          <div class="grid grid-2">
            <div class="metric"><span>Хоризонт</span><strong>${data.horizon}</strong></div>
            <div class="metric"><span>Сценарий</span><strong>${data.scenario}</strong></div>
          </div>
          <div class="metric" style="margin-top:12px"><span>Обща стойност</span><strong class="money">${fmtEuro(data.total_value)}</strong></div>
          <div class="table-wrap" style="margin-top:12px">
            <div class="row head-row"><div>Продукт</div><div></div><div></div><div></div><div>Projected Value</div></div>
            ${data.lines.map((line) => `<div class="row"><div><strong>${line.product_name}</strong></div><div></div><div></div><div></div><div><strong class="money">${fmtEuro(line.projected_value)}</strong></div></div>`).join('')}
          </div>
        </section>`;
    }

    if (contentView) {
      contentView.querySelectorAll('[data-h]').forEach((btn) =>
        btn.addEventListener('click', () => {
          selectedHorizon = btn.dataset.h;
          loadHorizons();
        })
      );
      contentView.querySelectorAll('[data-s]').forEach((btn) =>
        btn.addEventListener('click', () => {
          selectedScenario = btn.dataset.s;
          loadHorizons();
        })
      );
    }

    applyMoneyHidden();
    setStatus('Прогнозата е заредена успешно.');
  } catch (e) {
    if (contentView) {
      contentView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    }
    setStatus(`Грешка при forecasts: ${e.message}`);
    throw e;
  }
}

function openSettings() {
  const s = getSettings();
  if (backendUrlInput) backendUrlInput.value = s.backendUrl || '';
  if (portfolioIdInput) portfolioIdInput.value = s.portfolioId || '';
  showModal();
}

async function refreshCurrentScreen() {
  if (isRefreshing) {
    setStatus('Опресняване вече е в процес...');
    return;
  }

  isRefreshing = true;
  const originalText = reloadBtn ? reloadBtn.textContent : 'Опресни';

  if (reloadBtn) {
    reloadBtn.disabled = true;
    reloadBtn.textContent = 'Опресняване...';
    reloadBtn.classList.add('loading');
  }

  try {
    if (activeScreen === 'holdings') await loadHoldings();
    else if (activeScreen === 'horizons') await loadHorizons();
    else await loadDashboard();
  } catch (e) {
    setStatus(`Грешка при опресняване: ${e.message}`);
  } finally {
    isRefreshing = false;
    if (reloadBtn) {
      reloadBtn.disabled = false;
      reloadBtn.textContent = originalText;
      reloadBtn.classList.remove('loading');
    }
  }
}

if (reloadBtn) reloadBtn.addEventListener('click', refreshCurrentScreen);

if (toggleMoneyBtn) {
  toggleMoneyBtn.addEventListener('click', () => {
    moneyHidden = !moneyHidden;
    localStorage.setItem(MONEY_HIDDEN_KEY, moneyHidden ? '1' : '0');
    applyMoneyHidden();
  });
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', hideModal);

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    const data = {
      backendUrl: backendUrlInput ? backendUrlInput.value.trim() : DEFAULT_SETTINGS.backendUrl,
      portfolioId: portfolioIdInput ? portfolioIdInput.value.trim() : DEFAULT_SETTINGS.portfolioId
    };
    saveSettings(data);
    hideModal();
    setStatus('Настройките са записани.');
    renderInitialDashboard();
  });
}

if (navDashboard) navDashboard.addEventListener('click', renderInitialDashboard);
if (navHoldings) navHoldings.addEventListener('click', () => loadHoldings().catch(() => {}));
if (navHorizons) navHorizons.addEventListener('click', () => loadHorizons().catch(() => {}));

(function init() {
  hideModal();
  applyMoneyHidden();

  if (reloadBtn) {
    reloadBtn.disabled = false;
    reloadBtn.textContent = 'Опресни';
    reloadBtn.classList.remove('loading');
  }

  setStatus('Готово. Избери екран отдолу или натисни Опресни.');
  renderInitialDashboard();
})();
