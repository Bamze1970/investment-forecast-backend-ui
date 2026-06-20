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
let activeScreen = 'dashboard';
let selectedHorizon = 'y4';
let lastHoldings = [];
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

function fundBadge(item) {
  const direction = String(item?.direction || 'flat').toLowerCase();
  const value = Number(item?.changePercent);

  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
    if (direction === 'up') return '<span class="pill up">▲</span>';
    if (direction === 'down') return '<span class="pill down">▼</span>';
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
    'product-amundi-us': 'amundi_us_pioneer_nav_eur',
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
  return Number.isFinite(price) ? price : Number(row.current_price || 0);
}

function getDisplayValue(row, extItem) {
  const price = Number(extItem?.price);
  const qty = Number(row.quantity_input);

  if (Number.isFinite(price) && Number.isFinite(qty)) {
    return qty * price;
  }

  return Number(row.current_value || 0);
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
  if (statusBar) {
    statusBar.textContent = text;
  }
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

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
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

  if (!base) {
    throw new Error('Липсва Backend URL');
  }

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
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? ' - ' + text.slice(0, 160) : ''}`
    );
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

function renderInitialDashboard() {
  setActiveNav('dashboard');
  if (dashboardView) dashboardView.classList.remove('hidden');
  if (contentView) contentView.classList.add('hidden');

  if (dashboardView) {
    dashboardView.innerHTML = `
      <section class="card">
        <h2>Добре дошъл</h2>
        <p class="note">
          Началният екран вече не се зарежда автоматично, за да не блокира приложението.
        </p>
        <div class="quick-grid">
          <button class="quick-btn" id="quickHoldings"><strong>Активи</strong>Отвори списъка с активи</button>
          <button class="quick-btn" id="quickHorizons"><strong>Хоризонти</strong>Отвори прогнозите</button>
          <button class="quick-btn" id="quickSettings"><strong>Настройки</strong>Провери backend URL и portfolio ID</button>
        </div>
      </section>
    `;
  }

  updateDashboardQuickActions();
  applyMoneyHidden();
  setStatus('Готово. Избери екран или натисни Опресни.');
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
  if (dashboardView) dashboardView.classList.remove('hidden');
  if (contentView) contentView.classList.add('hidden');
  setStatus('Зареждане на dashboard...');

  try {
    const s = getSettings();
    const data = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/dashboard`);

    if (dashboardView) {
      dashboardView.innerHTML = `
        <section class="card">
          <h2>Dashboard</h2>
          <p class="note">Портфейл: <strong>${s.portfolioId}</strong></p>
          <div class="grid grid-4">
            <div class="metric"><span>Текущ портфейл</span><strong class="money">${fmtEuro(data.current_total)}</strong></div>
            <div class="metric"><span>4Y Low</span><strong class="money">${fmtEuro(data.low_4y)}</strong></div>
            <div class="metric"><span>4Y Base</span><strong class="money">${fmtEuro(data.base_4y)}</strong></div>
            <div class="metric"><span>4Y High</span><strong class="money">${fmtEuro(data.high_4y)}</strong></div>
          </div>
        </section>

        <section class="card">
          <h2>Бързи действия</h2>
          <div class="quick-grid">
            <button class="quick-btn" id="quickHoldings"><strong>Активи</strong>Редактирай количества</button>
            <button class="quick-btn" id="quickHorizons"><strong>Хоризонти</strong>Преглед на прогнози low/base/high</button>
            <button class="quick-btn" id="quickSettings"><strong>Настройки</strong>Backend URL, Portfolio ID, визуализация</button>
          </div>
        </section>
      `;
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

  return api(
    `/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings/${encodeURIComponent(holdingId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ quantity_input: Number(quantity) })
    }
  );
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

    const [rows, onemarketData, amundiItems] = await Promise.all([
      api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings`),
      api('/api/onemarket').catch(() => ({ items: [] })),
      loadAmundiManual().catch(() => [])
    ]);

    const onemarketItems = Array.isArray(onemarketData?.items) ? onemarketData.items : [];
    const prevCache = getPriceCache();

    if (contentView) {
      contentView.innerHTML = `
        <section class="card">
          <h2>Активи</h2>
          <p class="note">
            Onemarkets идват от backend-а, а Amundi цените идват от <strong>amundi_manual.json</strong>.
          </p>

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
                const am = findAmundiMatch(r, amundiItems);
                const ext = om || am;

                const displayPrice = getDisplayPrice(r, ext);
                const displayValue = getDisplayValue(r, ext);
                const displayUnit = ext?.currency || r.current_price_unit;
                const changeHtml = ext ? fundBadge(ext) : diffBadge(displayPrice, prev);
                const sourceDate = ext?.lastUpdated
                  ? `<span class="unit-muted">NAV: ${ext.lastUpdated}</span>`
                  : '';

                return `
                  <div class="row">
                    <div>
                      <strong>${r.product_name}</strong>
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
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>
      `;
    }

    const newCache = { ...prevCache };
    rows.forEach((r) => {
      const om = findOnemarketMatch(r, onemarketItems);
      const am = findAmundiMatch(r, amundiItems);
      const ext = om || am;
      newCache[r.product_id] = getDisplayPrice(r, ext);
    });

    setPriceCache(newCache);
    lastHoldings = rows;
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
    const data = await api(
      `/api/portfolios/${encodeURIComponent(s.portfolioId)}/forecasts?horizon=${encodeURIComponent(selectedHorizon)}&scenario=${encodeURIComponent(selectedScenario)}`
    );

    const horizons = [
      ['week', '1 седмица'],
      ['month', '1 месец'],
      ['q1', 'Q1'],
      ['q2', 'Q2'],
      ['q3', 'Q3'],
      ['q4', 'Q4'],
      ['y1', '1Y'],
      ['y2', '2Y'],
      ['y3', '3Y'],
      ['y4', '4Y']
    ];

    const scenarios = [
      ['low', 'Песимистичен'],
      ['base', 'Основен'],
      ['high', 'Оптимистичен']
    ];

    if (contentView) {
      contentView.innerHTML = `
        <section class="card">
          <h2>Хоризонти</h2>
          <p class="note">След смяна на количества натисни <strong>Опресни</strong> или мини пак през Хоризонти.</p>

          <div class="tabs">
            ${horizons
              .map(
                ([k, l]) =>
                  `<button class="tab ${k === selectedHorizon ? 'active' : ''}" data-h="${k}">${l}</button>`
              )
              .join('')}
          </div>

          <div class="tabs">
            ${scenarios
              .map(
                ([k, l]) =>
                  `<button class="tab ${k === selectedScenario ? 'active' : ''}" data-s="${k}">${l}</button>`
              )
              .join('')}
          </div>

          <div class="grid grid-2">
            <div class="metric"><span>Хоризонт</span><strong>${data.horizon}</strong></div>
            <div class="metric"><span>Сценарий</span><strong>${data.scenario}</strong></div>
          </div>

          <div class="metric" style="margin-top:12px">
            <span>Обща стойност</span>
            <strong class="money">${fmtEuro(data.total_value)}</strong>
          </div>

          <div class="table-wrap" style="margin-top:12px">
            <div class="row head-row">
              <div>Продукт</div>
              <div></div>
              <div></div>
              <div></div>
              <div>Projected Value</div>
            </div>

            ${data.lines
              .map(
                (line) => `
                  <div class="row">
                    <div><strong>${line.product_name}</strong></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div><strong class="money">${fmtEuro(line.projected_value)}</strong></div>
                  </div>
                `
              )
              .join('')}
          </div>
        </section>
      `;
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
    if (activeScreen === 'holdings') {
      await loadHoldings();
    } else if (activeScreen === 'horizons') {
      await loadHorizons();
    } else {
      await loadDashboard();
    }
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

if (reloadBtn) {
  reloadBtn.addEventListener('click', refreshCurrentScreen);
}

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
  saveSettingsBtn.addEventListener('click', async () => {
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

if (navDashboard) navDashboard.addEventListener('click', () => renderInitialDashboard());
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

  renderInitialDashboard();
})();
