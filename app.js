
const SETTINGS_KEY = 'inv-backend-settings-v6';
const DEFAULT_SETTINGS = {
  backendUrl: 'http://localhost:8000',
  portfolioId: 'portfolio-boris-main'
};

const dashboardView = document.getElementById('dashboardView');
const contentView = document.getElementById('contentView');
const statusBar = document.getElementById('statusBar');
const reloadBtn = document.getElementById('reloadBtn');
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

const fmtEuro = (v) => new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';

function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function saveSettings(data) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
}
function setStatus(text){ statusBar.textContent = text; }
function showModal(){ settingsModal.classList.remove('hidden'); settingsModal.style.display='flex'; settingsModal.setAttribute('aria-hidden','false'); }
function hideModal(){ settingsModal.classList.add('hidden'); settingsModal.style.display='none'; settingsModal.setAttribute('aria-hidden','true'); }
function setActiveNav(key){ [navDashboard, navHoldings, navHorizons].forEach(x=>x.classList.remove('active')); if(key==='dashboard')navDashboard.classList.add('active'); if(key==='holdings')navHoldings.classList.add('active'); if(key==='horizons')navHorizons.classList.add('active'); activeScreen = key; }

async function api(path) {
  const s = getSettings();
  if (!s.backendUrl || !s.portfolioId) throw new Error('Липсва backend URL или Portfolio ID');
  const base = s.backendUrl.replace(/\/$/, '');
  const res = await fetch(base + path, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ' - ' + text.slice(0,120) : ''}`);
  }
  return res.json();
}

async function healthCheck() {
  const s = getSettings();
  try {
    const base = s.backendUrl.replace(/\/$/, '');
    const r = await fetch(base + '/health');
    if (!r.ok) throw new Error('Health check failed');
    return true;
  } catch (e) {
    setStatus('Backend не отговаря: ' + e.message);
    return false;
  }
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
        <p class="note">Данните идват от backend API. Portfolio ID: <strong>${s.portfolioId}</strong></p>
        <div class="grid grid-4">
          <div class="metric"><span>Текущ портфейл</span><strong>${fmtEuro(data.current_total)}</strong></div>
          <div class="metric"><span>4Y Low</span><strong>${fmtEuro(data.low_4y)}</strong></div>
          <div class="metric"><span>4Y Base</span><strong>${fmtEuro(data.base_4y)}</strong></div>
          <div class="metric"><span>4Y High</span><strong>${fmtEuro(data.high_4y)}</strong></div>
        </div>
      </section>
      <section class="card">
        <h2>Бързи действия</h2>
        <div class="quick-grid">
          <button class="quick-btn" id="quickHoldings"><strong>Активи</strong>Преглед на holdings от backend</button>
          <button class="quick-btn" id="quickHorizons"><strong>Хоризонти</strong>Преглед на прогнози low/base/high</button>
          <button class="quick-btn" id="quickSettings"><strong>Настройки</strong>Смяна на backend URL и Portfolio ID</button>
        </div>
      </section>`;
    document.getElementById('quickHoldings').addEventListener('click', loadHoldings);
    document.getElementById('quickHorizons').addEventListener('click', loadHorizons);
    document.getElementById('quickSettings').addEventListener('click', openSettings);
    setStatus('Dashboard е зареден успешно.');
  } catch (e) {
    dashboardView.innerHTML = `<section class="card"><h2>Грешка</h2><p class="note">Неуспешно зареждане на dashboard.</p><pre>${e.message}</pre></section>`;
    setStatus('Грешка при dashboard.');
  }
}

async function loadHoldings() {
  setActiveNav('holdings');
  dashboardView.classList.add('hidden');
  contentView.classList.remove('hidden');
  setStatus('Зареждане на активи...');
  try {
    const s = getSettings();
    const rows = await api(`/api/portfolios/${encodeURIComponent(s.portfolioId)}/holdings`);
    contentView.innerHTML = `<section class="card"><h2>Активи</h2><p class="note">Данните идват директно от backend-а. Първоначално backend seed-ът съдържа Gold, Silver и Solana.</p><div class="table-wrap"><div class="row head-row"><div>Продукт</div><div>Количество</div><div>Текуща цена</div><div>Текуща стойност</div></div>${rows.map(r => `<div class="row"><div><strong>${r.product_id}</strong></div><div>${r.quantity_input} ${r.quantity_input_unit}</div><div>${fmtEuro(r.current_price)}</div><div>${fmtEuro(r.current_value)}</div></div>`).join('')}</div></section>`;
    setStatus('Активите са заредени успешно.');
  } catch (e) {
    contentView.innerHTML = `<section class="card"><h2>Грешка</h2><p class="note">Неуспешно зареждане на активи.</p><pre>${e.message}</pre></section>`;
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
    const horizons = [
      ['week','1 седмица'],['month','1 месец'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['y1','1Y'],['y2','2Y'],['y3','3Y'],['y4','4Y']
    ];
    const scenarios = [['low','Песимистичен'],['base','Основен'],['high','Оптимистичен']];
    contentView.innerHTML = `<section class="card"><h2>Хоризонти</h2><p class="note">Този frontend чете прогнозите от backend endpoint-а <code>/forecasts</code>.</p><div class="tabs">${horizons.map(([k,l]) => `<button class="tab ${k===selectedHorizon?'active':''}" data-h="${k}">${l}</button>`).join('')}</div><div class="tabs">${scenarios.map(([k,l]) => `<button class="tab ${k===selectedScenario?'active':''}" data-s="${k}">${l}</button>`).join('')}</div><div class="grid grid-2"><div class="metric"><span>Хоризонт</span><strong>${data.horizon}</strong></div><div class="metric"><span>Сценарий</span><strong>${data.scenario}</strong></div></div><div class="metric" style="margin-top:12px"><span>Обща стойност</span><strong>${fmtEuro(data.total_value)}</strong></div><div class="table-wrap" style="margin-top:12px"><div class="row head-row"><div>Продукт</div><div></div><div></div><div>Projected Value</div></div>${data.lines.map(line => `<div class="row"><div><strong>${line.product_name}</strong></div><div></div><div></div><div>${fmtEuro(line.projected_value)}</div></div>`).join('')}</div></section>`;
    contentView.querySelectorAll('[data-h]').forEach(btn => btn.addEventListener('click', () => { selectedHorizon = btn.dataset.h; loadHorizons(); }));
    contentView.querySelectorAll('[data-s]').forEach(btn => btn.addEventListener('click', () => { selectedScenario = btn.dataset.s; loadHorizons(); }));
    setStatus('Прогнозата е заредена успешно.');
  } catch (e) {
    contentView.innerHTML = `<section class="card"><h2>Грешка</h2><p class="note">Неуспешно зареждане на прогнозата.</p><pre>${e.message}</pre></section>`;
    setStatus('Грешка при forecasts.');
  }
}

function openSettings() {
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
settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', hideModal);
saveSettingsBtn.addEventListener('click', async () => {
  const data = { backendUrl: backendUrlInput.value.trim(), portfolioId: portfolioIdInput.value.trim() };
  saveSettings(data);
  hideModal();
  const healthOk = await healthCheck();
  if (healthOk) loadDashboard();
});
navDashboard.addEventListener('click', loadDashboard);
navHoldings.addEventListener('click', loadHoldings);
navHorizons.addEventListener('click', loadHorizons);

(async function init(){
  hideModal();
  const ok = await healthCheck();
  if (ok) loadDashboard();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js?v=6').catch(()=>{}));
}
