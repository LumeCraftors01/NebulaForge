// ============================================================
//  RedGalaxy Studio / NebulaForge Studio — wiki frontend
//
//  Plain JS, hash-based router, no build step. All markup is
//  built with small template-string renderers and mounted into
//  #main-content; Lucide icons are (re)hydrated after every
//  render via mountIcons().
// ============================================================

const state = {
  user: null,
  games: [],
  staff: [],
  config: null,
};

// Per-game sidebar/header icon. Falls back to a generic controller
// icon for any game slug added later that isn't listed here.
const GAME_ICONS = {
  'dont-crash-the-train-for-brainrots': 'train-front',
  'crystal-collecting-simulator': 'gem',
};
const DEFAULT_GAME_ICON = 'gamepad-2';

const CATEGORY_ORDER = ['common', 'rare', 'legendary', 'mythic', 'godly', 'limited'];
const CATEGORY_LABELS = {
  common: 'Common Units',
  rare: 'Rare Units',
  legendary: 'Legendary Units',
  mythic: 'Mythic Units',
  godly: 'Godly Units',
  limited: 'Limited Units',
};

// Edit these to match this game's real mutation system — only the
// "Normal" tier is guaranteed to reflect actual game balance.
const MUTATION_TIERS = [
  { key: 'normal', label: 'Normal (x1)', multiplier: 1 },
  { key: 'bronze', label: 'Bronze (x1.5)', multiplier: 1.5 },
  { key: 'silver', label: 'Silver (x2.5)', multiplier: 2.5 },
  { key: 'gold', label: 'Gold (x5)', multiplier: 5 },
  { key: 'diamond', label: 'Diamond (x10)', multiplier: 10 },
];

const STAFF_ICON = { owner: 'crown', head_admin: 'shield-check', admin: 'shield' };


// ============================================================
//  Small utilities
// ============================================================

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function iconTag(name, cls) {
  return `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
}

function mountIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

function rarityColorVar(category) {
  const key = (category || '').toLowerCase();
  const known = ['common', 'rare', 'legendary', 'mythic', 'godly', 'limited'];
  return known.includes(key) ? `var(--rarity-${key})` : 'var(--rarity-common)';
}

function $(selector, root = document) {
  return root.querySelector(selector);
}
function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function setTitle(title) {
  $('#topbar-title').textContent = title;
  document.title = `${title} — RedGalaxy Studio / NebulaForge Studio`;
}

function mainEl() {
  return $('#main-content');
}

function renderView(html) {
  const main = mainEl();
  main.innerHTML = `<div class="route-view">${html}</div>`;
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
  mountIcons();
}

function loadingHtml(label) {
  return `<div class="page-loading">${iconTag('loader-circle', 'spin')}<span>${esc(label)}</span></div>`;
}


// ============================================================
//  API client
// ============================================================

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok || !payload?.ok) {
    const err = new Error(payload?.error || 'Something went wrong.');
    err.code = payload?.code;
    err.status = res.status;
    throw err;
  }

  return payload.data;
}


// ============================================================
//  Toasts
// ============================================================

function toast(type, message) {
  const stack = $('#toast-stack');
  if (!stack) return;

  const iconName = type === 'success' ? 'circle-check-big' : type === 'error' ? 'triangle-alert' : 'sparkles';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${iconTag(iconName)}<span>${esc(message)}</span>`;
  stack.appendChild(el);
  mountIcons();

  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  }, 3200);
}


// ============================================================
//  Sidebar + topbar
// ============================================================

function renderSidebarNav() {
  const gamesList = $('#nav-games');
  gamesList.innerHTML = [
    `<li><a class="nav-link" href="#/">${iconTag('house')}<span>Main Page</span></a></li>`,
    ...state.games.map((g) => {
      const icon = GAME_ICONS[g.slug] || DEFAULT_GAME_ICON;
      return `<li><a class="nav-link" href="#/games/${esc(g.slug)}">${iconTag(icon)}<span>${esc(g.name)}</span></a></li>`;
    }),
  ].join('');

  const accountList = $('#nav-account');
  if (state.user) {
    accountList.innerHTML = `
      <li><a class="nav-link" href="#/settings">${iconTag('settings')}<span>Settings</span></a></li>
      <li><button type="button" class="nav-link" id="sidebar-logout">${iconTag('log-out')}<span>Log out</span></button></li>
    `;
    $('#sidebar-logout').addEventListener('click', handleLogout);
  } else {
    accountList.innerHTML = `
      <li><a class="nav-link" href="#/login">${iconTag('log-in')}<span>Sign in</span></a></li>
    `;
  }

  mountIcons();
  updateActiveNav();
}

function renderStaffList() {
  const list = $('#staff-list');
  if (!state.staff.length) {
    list.innerHTML = `<p class="field-hint">No staff on record yet.</p>`;
    return;
  }
  list.innerHTML = state.staff.map((s) => {
    const roleKey = s.role_label.toLowerCase().replace(/\s+/g, '_');
    const icon = STAFF_ICON[roleKey] || 'user';
    return `
      <div class="staff-row">
        <span class="staff-role-icon ${roleKey}">${iconTag(icon)}</span>
        <span class="staff-info">
          <span class="staff-role-label">${esc(s.role_label)}</span>
          <span class="staff-name">${esc(s.name)}</span>
        </span>
      </div>
    `;
  }).join('');
  mountIcons();
}

function renderTopbarUser() {
  const el = $('#topbar-user');
  if (state.user) {
    const initial = (state.user.display_name || state.user.username || '?').trim().charAt(0).toUpperCase();
    el.innerHTML = `
      <a class="user-chip" href="#/settings" aria-label="Account settings">
        <span class="user-chip-avatar">${esc(initial)}</span>
        <span class="user-chip-name">${esc(state.user.display_name || state.user.username)}</span>
      </a>
    `;
  } else {
    el.innerHTML = `<a class="btn btn-ghost" href="#/login">${iconTag('log-in')}<span>Sign in</span></a>`;
  }
  mountIcons();
}

function updateActiveNav() {
  const current = location.hash || '#/';
  $all('.nav-link[href]').forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('href') === current);
  });
}

function closeMobileSidebar() {
  $('#app-shell').classList.remove('sidebar-open');
  $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
}

function applyDesktopPreference() {
  $('#app-shell').classList.toggle('force-desktop', !!state.user?.prefers_desktop);
}


// ============================================================
//  Route: Main Page
// ============================================================

function renderMainPage() {
  setTitle('Main Page');

  const cards = state.games.map((g) => {
    const icon = GAME_ICONS[g.slug] || DEFAULT_GAME_ICON;
    return `
      <a class="game-card" href="#/games/${esc(g.slug)}">
        <span class="game-card-icon">${iconTag(icon)}</span>
        <p class="game-card-name">${esc(g.name)}</p>
        <p class="game-card-tagline">${esc(g.tagline || '')}</p>
        <p class="game-card-arrow">Open the database ${iconTag('arrow-right')}</p>
      </a>
    `;
  }).join('');

  renderView(`
    <div class="page-header">
      <span class="page-header-icon">${iconTag('orbit')}</span>
      <div>
        <h2 class="page-title">RedGalaxy Studio / NebulaForge Studio</h2>
        <p class="page-tagline">Pick a game below to open its unit and shop database.</p>
      </div>
    </div>
    <div class="game-grid">${cards || emptyStateHtml('gamepad-2', 'No games listed yet', 'Games will appear here once they are added.')}</div>
  `);
}

function emptyStateHtml(icon, title, detail) {
  return `
    <div class="empty-state">
      ${iconTag(icon)}
      <p class="empty-state-title">${esc(title)}</p>
      <p class="empty-state-detail">${esc(detail)}</p>
    </div>
  `;
}


// ============================================================
//  Route: Game detail
// ============================================================

async function renderGamePage(slug, token) {
  const meta = state.games.find((g) => g.slug === slug);
  setTitle(meta ? meta.name : 'Game');
  renderView(loadingHtml('Loading game data…'));

  let data;
  try {
    data = await api(`/api/games/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (token !== routeToken) return; // superseded by a newer navigation
    renderView(emptyStateHtml('triangle-alert', 'Couldn\u2019t load this game', err.message));
    return;
  }
  if (token !== routeToken) return; // superseded by a newer navigation

  const icon = GAME_ICONS[slug] || DEFAULT_GAME_ICON;
  const hasAnyUnits = CATEGORY_ORDER.some((c) => (data.units[c] || []).length > 0);
  const hasShopItems = (data.shop_items || []).length > 0;

  const unitSections = CATEGORY_ORDER
    .filter((cat) => (data.units[cat] || []).length > 0)
    .map((cat) => unitSectionHtml(cat, data.units[cat]))
    .join('');

  const shopSection = hasShopItems ? shopSectionHtml(data.shop_items) : '';

  renderView(`
    <div class="page-header">
      <span class="page-header-icon">${iconTag(icon)}</span>
      <div>
        <h2 class="page-title">${esc(data.game.name)}</h2>
        ${data.game.tagline ? `<p class="page-tagline">${esc(data.game.tagline)}</p>` : ''}
      </div>
    </div>

    <div class="card mechanics-card">
      <p class="mechanics-title">${iconTag('sparkles')}Game Mechanics</p>
      <div class="field-inline">
        <label for="mutation-select">Apply Mutation Multiplier</label>
        <select id="mutation-select" class="select-control">
          ${MUTATION_TIERS.map((t) => `<option value="${t.key}" data-multiplier="${t.multiplier}">${esc(t.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    ${hasAnyUnits ? unitSections : emptyStateHtml('sparkles', 'No units documented yet', 'Check back once this game\u2019s roster is added.')}
    ${shopSection}
  `);

  const select = $('#mutation-select');
  if (select) {
    select.addEventListener('change', () => {
      applyMutationMultiplier(Number(select.selectedOptions[0].dataset.multiplier));
    });
  }
}

function unitSectionHtml(category, units) {
  return `
    <section class="section">
      <div class="section-heading">
        <span class="rarity-dot" style="background:${rarityColorVar(category)}"></span>
        <h3 class="section-title">${CATEGORY_LABELS[category]}</h3>
        <span class="section-count">${units.length}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Area</th>
              <th class="num-col">Cost / Price</th>
            </tr>
          </thead>
          <tbody>
            ${units.map((u) => `
              <tr>
                <td>${esc(u.name)}</td>
                <td class="area-col">${esc(u.area || '\u2014')}</td>
                <td class="num-col"><span class="num value-flash" data-base="${u.base_cost}">${formatNumber(u.base_cost)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function shopSectionHtml(items) {
  return `
    <section class="section">
      <div class="section-heading">
        <span class="rarity-dot" style="background:var(--accent-rose)"></span>
        <h3 class="section-title">Shop Items</h3>
        <span class="section-count">${items.length}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rarity</th>
              <th class="num-col">Cost / Price</th>
              <th class="num-col">Income (Per/s)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => `
              <tr>
                <td>${esc(it.name)}</td>
                <td><span class="rarity-chip" style="color:${rarityColorVar(it.base_rarity)}">${esc(it.base_rarity)}</span></td>
                <td class="num-col"><span class="num value-flash" data-base="${it.base_cost}">${formatNumber(it.base_cost)}</span></td>
                <td class="num-col"><span class="num value-flash" data-base="${it.base_income}" style="color:var(--positive)">${formatNumber(it.base_income)} /s</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// Animates every [data-base] figure on the current game page to
// baseValue * multiplier — this is the one motion in the app that
// directly answers a user action, so it gets a real tween rather
// than an instant swap.
function applyMutationMultiplier(multiplier) {
  $all('[data-base]').forEach((el) => {
    const base = Number(el.dataset.base);
    const from = Number(el.textContent.replace(/[^\d.-]/g, '')) || base;
    const to = base * multiplier;
    const suffix = el.textContent.trim().endsWith('/s') ? ' /s' : '';
    el.classList.add('is-updating');
    tweenNumber(from, to, 420, (value) => {
      el.textContent = formatNumber(value) + suffix;
    }, () => el.classList.remove('is-updating'));
  });
}

function tweenNumber(from, to, duration, onFrame, onDone) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    onFrame(from + (to - from) * eased);
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (onDone) {
      onDone();
    }
  }
  requestAnimationFrame(step);
}


// ============================================================
//  Route: Login
// ============================================================

function renderLogin() {
  if (state.config?.setup_required) { location.hash = '#/setup'; return; }
  if (state.user) { location.hash = '#/'; return; }

  setTitle('Sign in');
  renderView(`
    <div class="auth-screen">
      <div class="auth-glow"></div>
      <div class="auth-card">
        <div class="auth-brand">
          <span class="brand-mark">${iconTag('orbit')}</span>
        </div>
        <h2 class="auth-title">User Log in</h2>
        <p class="auth-subtitle">RedGalaxy Studio / NebulaForge Studio</p>

        <div id="login-error"></div>

        <form id="login-form" novalidate>
          <div class="field">
            <label class="field-label" for="login-identifier">Username or email</label>
            <div class="input-wrap">
              ${iconTag('user', 'input-icon')}
              <input type="text" id="login-identifier" autocomplete="username" placeholder="Enter your username or email" required />
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="login-password">Password</label>
            <div class="input-wrap">
              ${iconTag('lock', 'input-icon')}
              <input type="password" id="login-password" autocomplete="current-password" placeholder="Enter your password" required />
              <button type="button" class="toggle-visibility" data-target="login-password" aria-label="Show password">${iconTag('eye')}</button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="login-submit">
            <span id="login-submit-label">Log in</span>
          </button>
        </form>
      </div>
    </div>
  `);

  wireVisibilityToggles();
  $('#login-form').addEventListener('submit', handleLoginSubmit);
}

function wireVisibilityToggles(root = document) {
  $all('.toggle-visibility', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = iconTag(showing ? 'eye' : 'eye-off');
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      mountIcons();
    });
  });
}

function showAuthError(containerId, message) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div class="auth-banner">${iconTag('triangle-alert')}<span>${esc(message)}</span></div>`;
  const card = container.closest('.auth-card');
  card.classList.remove('shake');
  // restart the animation even if it's already mid-shake
  void card.offsetWidth;
  card.classList.add('shake');
  mountIcons();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const identifier = $('#login-identifier').value.trim();
  const password = $('#login-password').value;
  const submitBtn = $('#login-submit');
  const label = $('#login-submit-label');

  submitBtn.disabled = true;
  label.textContent = 'Signing in…';

  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
    state.user = data;
    applyDesktopPreference();
    renderSidebarNav();
    renderTopbarUser();
    toast('success', `Welcome back, ${data.display_name || data.username}.`);
    location.hash = '#/';
  } catch (err) {
    showAuthError('login-error', err.message);
  } finally {
    submitBtn.disabled = false;
    label.textContent = 'Log in';
  }
}


// ============================================================
//  Route: First-run setup (creates the owner account)
// ============================================================

function renderSetup() {
  if (!state.config?.setup_required) { location.hash = '#/login'; return; }

  setTitle('Create owner account');
  renderView(`
    <div class="auth-screen">
      <div class="auth-glow"></div>
      <div class="auth-card">
        <div class="auth-brand"><span class="brand-mark">${iconTag('orbit')}</span></div>
        <h2 class="auth-title">Create the owner account</h2>
        <p class="auth-subtitle">This wiki has no accounts yet — set up the first one.</p>

        <div id="setup-error"></div>

        <form id="setup-form" novalidate>
          <div class="field">
            <label class="field-label" for="setup-name">Display name</label>
            <div class="input-wrap">${iconTag('user', 'input-icon')}<input type="text" id="setup-name" autocomplete="name" placeholder="LumeCraftor" required /></div>
          </div>
          <div class="field">
            <label class="field-label" for="setup-username">Username</label>
            <div class="input-wrap">${iconTag('user', 'input-icon')}<input type="text" id="setup-username" autocomplete="username" placeholder="3–24 characters" required /></div>
          </div>
          <div class="field">
            <label class="field-label" for="setup-email">Email address</label>
            <div class="input-wrap">${iconTag('mail', 'input-icon')}<input type="email" id="setup-email" autocomplete="email" placeholder="you@example.com" required /></div>
          </div>
          <div class="field">
            <label class="field-label" for="setup-password">Password</label>
            <div class="input-wrap">
              ${iconTag('lock', 'input-icon')}
              <input type="password" id="setup-password" autocomplete="new-password" placeholder="At least 10 characters" required />
              <button type="button" class="toggle-visibility" data-target="setup-password" aria-label="Show password">${iconTag('eye')}</button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="setup-submit">
            <span id="setup-submit-label">Create account</span>
          </button>
        </form>
      </div>
    </div>
  `);

  wireVisibilityToggles();
  $('#setup-form').addEventListener('submit', handleSetupSubmit);
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  const body = {
    display_name: $('#setup-name').value.trim(),
    username: $('#setup-username').value.trim(),
    email: $('#setup-email').value.trim(),
    password: $('#setup-password').value,
  };
  const submitBtn = $('#setup-submit');
  const label = $('#setup-submit-label');
  submitBtn.disabled = true;
  label.textContent = 'Creating…';

  try {
    const data = await api('/api/auth/setup', { method: 'POST', body });
    state.user = data;
    state.config.setup_required = false;
    applyDesktopPreference();
    renderSidebarNav();
    renderTopbarUser();
    toast('success', `Owner account created — welcome, ${data.display_name}.`);
    location.hash = '#/';
  } catch (err) {
    showAuthError('setup-error', err.message);
  } finally {
    submitBtn.disabled = false;
    label.textContent = 'Create account';
  }
}


// ============================================================
//  Route: Settings
// ============================================================

function renderSettings() {
  if (!state.user) { location.hash = '#/login'; return; }

  setTitle('Settings');
  const u = state.user;
  const socials = state.config?.socials || {};
  const socialRows = [
    { key: 'facebook', label: 'Facebook' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'youtube', label: 'YouTube' },
  ].filter((s) => socials[s.key]);

  const download = state.config?.download || {};

  renderView(`
    <div class="page-header">
      <span class="page-header-icon">${iconTag('settings')}</span>
      <div><h2 class="page-title">Settings</h2></div>
    </div>

    <div class="card">
      <p class="field-hint" style="margin-bottom:1.1rem;">Name: ${esc(u.display_name || u.username)}</p>

      <form id="account-form" novalidate>
        <div class="field">
          <label class="field-label" for="acct-username">Username</label>
          <div class="input-wrap"><input type="text" id="acct-username" class="no-icon" value="${esc(u.username)}" /></div>
        </div>

        <div class="field">
          <label class="field-label" for="acct-password">New password</label>
          <div class="input-wrap">
            ${iconTag('lock', 'input-icon')}
            <input type="password" id="acct-password" autocomplete="new-password" placeholder="Leave blank to keep current password" />
            <button type="button" class="toggle-visibility" data-target="acct-password" aria-label="Show password">${iconTag('eye')}</button>
          </div>
          <p class="field-hint">At least 10 characters.</p>
        </div>

        <div class="switch-row">
          <div>
            <p class="switch-row-label">Desktop layout</p>
            <p class="switch-row-hint">Keep the full sidebar visible instead of collapsing it on narrow screens.</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="acct-desktop" ${u.prefers_desktop ? 'checked' : ''} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>

        <div id="account-error"></div>

        <button type="submit" class="btn btn-primary" id="account-submit">
          <span id="account-submit-label">Save Changes</span>
        </button>
      </form>
    </div>

    <div class="card">
      <h3 class="section-title" style="margin-bottom:0.8rem;">Socials</h3>
      ${socialRows.length ? socialRows.map((s) => `
        <a class="social-row" href="${esc(socials[s.key])}" target="_blank" rel="noopener noreferrer">
          ${iconTag('external-link')}<span>${esc(s.label)}</span>${iconTag('chevron-right')}
        </a>
      `).join('') : `<p class="field-hint">No social links configured yet.</p>`}
    </div>

    <div class="card">
      <h3 class="section-title" style="margin-bottom:0.8rem;">Downloads</h3>
      ${download.url ? `
        <p class="field-label" style="margin-bottom:0.5rem;">${esc(download.label)}</p>
        <div class="copy-row">
          <div class="input-wrap"><input type="text" id="download-url" class="no-icon" value="${esc(download.url)}" readonly /></div>
          <button type="button" class="btn btn-ghost" id="copy-download" aria-label="Copy download link">${iconTag('copy')}<span>Copy</span></button>
        </div>
      ` : `<p class="field-hint">No download link configured yet.</p>`}
    </div>
  `);

  wireVisibilityToggles();
  $('#account-form').addEventListener('submit', handleAccountSubmit);

  const copyBtn = $('#copy-download');
  if (copyBtn) copyBtn.addEventListener('click', handleCopyDownload);
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  const body = {};
  const newUsername = $('#acct-username').value.trim();
  if (newUsername && newUsername !== state.user.username) body.username = newUsername;

  const newPassword = $('#acct-password').value;
  if (newPassword) body.password = newPassword;

  body.prefers_desktop = $('#acct-desktop').checked;

  const submitBtn = $('#account-submit');
  const label = $('#account-submit-label');
  submitBtn.disabled = true;
  label.textContent = 'Saving…';

  try {
    const data = await api('/api/account', { method: 'PUT', body });
    state.user = data.user;
    applyDesktopPreference();
    renderSidebarNav();
    renderTopbarUser();
    toast('success', 'Settings saved.');
    $('#acct-password').value = '';
  } catch (err) {
    const container = $('#account-error');
    container.innerHTML = `<div class="auth-banner">${iconTag('triangle-alert')}<span>${esc(err.message)}</span></div>`;
    mountIcons();
  } finally {
    submitBtn.disabled = false;
    label.textContent = 'Save Changes';
  }
}

async function handleCopyDownload() {
  const input = $('#download-url');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  toast('success', 'Download link copied.');
}


// ============================================================
//  Auth: logout
// ============================================================

async function handleLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* clearing local state regardless */
  }
  state.user = null;
  applyDesktopPreference();
  renderSidebarNav();
  renderTopbarUser();
  toast('info', 'Signed out.');
  location.hash = '#/';
}


// ============================================================
//  Router
// ============================================================

let routeToken = 0;

function route() {
  routeToken += 1;
  const token = routeToken;

  closeMobileSidebar();
  updateActiveNav();

  const hash = location.hash || '#/';

  if (hash === '#/' || hash === '') return renderMainPage();
  if (hash === '#/login') return renderLogin();
  if (hash === '#/setup') return renderSetup();
  if (hash === '#/settings') return renderSettings();

  const gameMatch = hash.match(/^#\/games\/([a-z0-9-]+)$/);
  if (gameMatch) return renderGamePage(gameMatch[1], token);

  setTitle('Not found');
  renderView(emptyStateHtml('triangle-alert', 'Page not found', 'That page doesn\u2019t exist — try the navigation on the left.'));
}


// ============================================================
//  Boot
// ============================================================

async function boot() {
  wireSidebarToggle();

  const [meResult, gamesResult, staffResult, configResult] = await Promise.allSettled([
    api('/api/auth/me'),
    api('/api/games'),
    api('/api/staff'),
    api('/api/config'),
  ]);

  if (meResult.status === 'fulfilled') state.user = meResult.value.user;
  if (gamesResult.status === 'fulfilled') state.games = gamesResult.value.games;
  if (staffResult.status === 'fulfilled') state.staff = staffResult.value.staff;
  if (configResult.status === 'fulfilled') state.config = configResult.value;

  applyDesktopPreference();
  renderSidebarNav();
  renderStaffList();
  renderTopbarUser();

  if (state.config?.setup_required && location.hash !== '#/setup') {
    location.hash = '#/setup';
  }

  route();
  window.addEventListener('hashchange', route);
}

function wireSidebarToggle() {
  const shell = $('#app-shell');
  const toggle = $('#sidebar-toggle');
  const scrim = $('#sidebar-scrim');

  toggle.addEventListener('click', () => {
    const open = shell.classList.toggle('sidebar-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', closeMobileSidebar);

  $('#sidebar').addEventListener('click', (event) => {
    if (event.target.closest('a.nav-link')) closeMobileSidebar();
  });
}

document.addEventListener('DOMContentLoaded', boot);
