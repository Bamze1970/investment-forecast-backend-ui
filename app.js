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

const fmtEuro = (v) => new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
const fmtNum = (v, d=2) => new Intl.NumberFormat('bg-BG', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; }
  catch { return DEFAULT_SETTINGS; }
}
function saveSettings(data){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); }
function setStatus(text){ statusBar.textContent = text; }
function showModal(){ settingsModal.classList.remove('hidden'); settingsModal.style.display='flex'; settingsModal.setAttribute('aria-hidden','false'); }
function hideModal(){ settingsModal.classList.add('hidden'); settingsModal.style.display='none'; settingsModal.setAttribute('aria-hidden','true'); }
function setActiveNav(key){ [navDashboard, navHoldings, navHorizons].forEach(x=>x.classList.remove('active')); if(key==='dashboard')navDashboard.classList.add('active'); if(key==='holdings')navHoldings.classList.add('active'); if(key==='horizons')navHorizons.classList.add('active'); activeScreen = key; }
function applyMoneyHidden(){ document.body.classList.toggle('money-hidden', moneyHidden); toggleMoneyBtn.textContent = moneyHidden ? 'Покажи суми' : 'Скрий суми'; }

function maskMoney(html){ return `<span class="money">${html}</span>`; }

function getPriceCache(){
  try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function setPriceCache(data){ localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(data)); }

function diffBadge(current, previous){
  if (previous === undefined || previous === null || Number.isNaN(previous)) return '<span class="pill flat">• 0.00%</span>';
  if (previous === 0) return '<span class="pill flat">• 0.00%</span>';
  const diffPct = ((current - previous) / previous) * 100;
  if (Math.abs(diffPct) < 0.0001) return '<span class="pill flat">• 0.00%</span>';
  if (diffPct > 0) return `<span class="pill up">▲ ${fmtNum(diffPct, 2)}%</span>`;
  return `<span class="pill down">▼ ${fmtNum(Math.abs(diffPct), 2)}%</span>`;
}

async function api(path, options = {}) {
  const s = getSettings();
  const base = (s.backendUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('Липсва Backend URL');
  const res = await fetch(base + path, {
    headers: { 'Accept': 'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ' - ' + text.slice(0,160) : ''}`);
  }
  return res.json();
}

async function healthCheck() {
  const s = getSettings();
  const base = (s.backendUrl || '').replace(/\/$/, '');
  if (!base) return false;
  try {
    const res = await fetch(base + '/health');
    return res.ok;
  } catch {
    return false;
  }
}

function updateDashboardQuickActions(){
  const qh = document.getElementById('quickHoldings'); if (qh) qh.addEventListener('click', loadHoldings);
  const qz = document.getElementById('quickHorizons'); if (qz) qz.addEventListener('click', loadHorizons);
  const qs = document.getElementById('quickSettings'); if (qs) qs.addEventListener('click', openSettings);
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
      </section>`;
    updateDashboardQuickActions();
    applyMoneyHidden();
    setStatus('Dashboard е зареден успешно.');
  } catch (e) {
    dashboardView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    setStatus('Грешка при dashboard.');
  }
}

async function patchQuantity(holdingId, quantity){
  const s = getSettings();
  return api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings/${encodeURIComponent(holdingId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity_input: Number(quantity) }),
  });
}

function bindHoldingActions(rows, prevPrices){
  rows.forEach((row) => {
    const btn = document.getElementById(`save-${row.id}`);
    const input = document.getElementById(`qty-${row.id}`);
    if (!btn || !input) return;
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        setStatus(`Записване на количество за ${row.product_name}...`);
        await patchQuantity(row.id, input.value);
        await Promise.all([loadDashboard(), loadHoldings()]);
        if (activeScreen === 'horizons') await loadHorizons();
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
  dashboardView.classList.add('hidden');
  contentView.classList.remove('hidden');
  setStatus('Зареждане на активи...');
  try {
    const s = getSettings();
    const rows = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings`);
    const prevCache = getPriceCache();

    contentView.innerHTML = `<section class="card"><h2>Активи</h2><p class="note">Металите се въвеждат в <strong>грамове</strong>, а backend-ът автоматично изчислява стойността по цена в <strong>EUR/TROY_OUNCE</strong>.</p><div class="table-wrap"><div class="row head-row"><div>Продукт</div><div>Количество</div><div>Цена</div><div>Промяна</div><div>Стойност</div></div>${rows.map(r => {
      const prev = prevCache[r.product_id];
      return `<div class="row">
        <div><strong>${r.product_name}</strong><span class="unit-muted mono">${r.product_id}</span></div>
        <div>
          <input id="qty-${r.id}" class="qty-inline" type="number" step="0.00000001" value="${r.quantity_input}" />
          <span class="unit-muted">${r.quantity_input_unit}</span>
          <div class="inline-actions"><button id="save-${r.id}" class="secondary-btn small-btn">Запази</button></div>
        </div>
        <div>
          <strong>${fmtNum(r.current_price, 2)}</strong>
          <span class="unit-muted">${r.current_price_unit}</span>
        </div>
        <div>${diffBadge(r.current_price, prev)}</div>
        <div><strong class="money">${fmtEuro(r.current_value)}</strong><span class="unit-muted">${r.currency}</span></div>
      </div>`;
    }).join('')}</div></section>`;

    const newCache = { ...prevCache };
    rows.forEach(r => { newCache[r.product_id] = r.current_price; });
    setPriceCache(newCache);
    lastHoldings = rows;
    bindHoldingActions(rows, prevCache);
    applyMoneyHidden();
    setStatus('Активите са заредени успешно.');
  } catch (e) {
    contentView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    setStatus('Грешка при holdings.');
  }
}

async function loadHorizons() {
  setActiveNav('horizons');
  dashboardView.classList.add('hidden');
  contentView.classList.remove('hidden');
  setStatus('Зареждане на прогноза...');
  try {
    const s = getSettings();
    const data = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/forecasts?horizon=${encodeURIComponent(selectedHorizon)}&scenario=${encodeURIComponent(selectedScenario)}`);
    const horizons = [['week','1 седмица'],['month','1 месец'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['y1','1Y'],['y2','2Y'],['y3','3Y'],['y4','4Y']];
    const scenarios = [['low','Песимистичен'],['base','Основен'],['high','Оптимистичен']];
    contentView.innerHTML = `<section class="card"><h2>Хоризонти</h2><p class="note">След смяна на количества натисни <strong>Опресни</strong> или мини пак през Хоризонти.</p><div class="tabs">${horizons.map(([k,l]) => `<button class="tab ${k===selectedHorizon?'active':''}" data-h="${k}">${l}</button>`).join('')}</div><div class="tabs">${scenarios.map(([k,l]) => `<button class="tab ${k===selectedScenario?'active':''}" data-s="${k}">${l}</button>`).join('')}</div><div class="grid grid-2"><div class="metric"><span>Хоризонт</span><strong>${data.horizon}</strong></div><div class="metric"><span>Сценарий</span><strong>${data.scenario}</strong></div></div><div class="metric" style="margin-top:12px"><span>Обща стойност</span><strong class="money">${fmtEuro(data.total_value)}</strong></div><div class="table-wrap" style="margin-top:12px"><div class="row head-row"><div>Продукт</div><div></div><div></div><div></div><div>Projected Value</div></div>${data.lines.map(line => `<div class="row"><div><strong>${line.product_name}</strong></div><div></div><div></div><div></div><div><strong class="money">${fmtEuro(line.projected_value)}</strong></div></div>`).join('')}</div></section>`;
    contentView.querySelectorAll('[data-h]').forEach(btn => btn.addEventListener('click', () => { selectedHorizon = btn.dataset.h; loadHorizons(); }));
    contentView.querySelectorAll('[data-s]').forEach(btn => btn.addEventListener('click', () => { selectedScenario = btn.dataset.s; loadHorizons(); }));
    applyMoneyHidden();
    setStatus('Прогнозата е заредена успешно.');
  } catch (e) {
    contentView.innerHTML = `<section class="card"><h2>Грешка</h2><pre>${e.message}</pre></section>`;
    setStatus('Грешка при forecasts.');
  }
}

function openSettings(){
  const s = getSettings();
  backendUrlInput.value = s.backendUrl || '';
  portfolioIdInput.value = s.portfolioId || '';
  showModal();
}

reloadBtn.addEventListener('click', async () => {
  if (activeScreen === 'holdings') return loadHoldings();
  if (activeScreen === 'horizons') return loadHorizons();
  return loadDashboard();
});

toggleMoneyBtn.addEventListener('click', () => {
  moneyHidden = !moneyHidden;
  localStorage.setItem(MONEY_HIDDEN_KEY, moneyHidden ? '1' : '0');
  applyMoneyHidden();
});

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', hideModal);
saveSettingsBtn.addEventListener('click', async () => {
  const data = { backendUrl: backendUrlInput.value.trim(), portfolioId: portfolioIdInput.value.trim() };
  saveSettings(data);
  hideModal();
  const ok = await healthCheck();
  if (!ok) { setStatus('Backend не отговаря. Провери URL-а.'); return; }
  await loadDashboard();
});
navDashboard.addEventListener('click', loadDashboard);
navHoldings.addEventListener('click', loadHoldings);
navHorizons.addEventListener('click', loadHorizons);

(async function init(){
  hideModal();
  applyMoneyHidden();
  const ok = await healthCheck();
  if (ok) loadDashboard();
  else setStatus('Backend не отговаря. Отвори Настройки и провери Backend URL.');
})();
