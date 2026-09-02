// ============================================================
//  RedGalaxy Studio / NebulaForge Studio — wiki backend
//
//  Single-file Worker: routing, auth, and the JSON API all live
//  here so the whole backend is one script to read and deploy.
//  Static frontend is served automatically from /public via the
//  ASSETS binding configured in wrangler.toml — this file only
//  runs for anything under /api/*.
// ============================================================

const PBKDF2_ITERATIONS = 120000;      // see scripts/create-account.mjs — must match
const SALT_BYTES = 16;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;      // 14 days
const SESSION_RENEW_WINDOW_SECONDS = 60 * 60 * 24 * 3; // renew if <3 days left
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MINUTES = 15;
const SESSION_COOKIE = 'sid';

const UNIT_CATEGORIES = ['common', 'rare', 'legendary', 'mythic', 'godly', 'limited'];


// ============================================================
//  Small utilities
// ============================================================

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function randomHex(byteLength) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

function ok(data, status = 200) {
  return json({ ok: true, data }, { status });
}

function fail(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: message, code }, { status });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}


// ============================================================
//  Password hashing (Web Crypto PBKDF2-SHA256)
// ============================================================

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}


// ============================================================
//  Cookies + sessions
// ============================================================

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join('='));
  }
  return out;
}

// `secure` is left out for plain-HTTP requests (e.g. `wrangler dev`
// on localhost) because browsers silently drop `Secure` cookies over
// HTTP — without this the whole login flow would look broken locally.
// Cloudflare only ever serves *.workers.dev / custom domains over
// HTTPS, so production always gets the flag.
function sessionCookieHeader(sessionId, maxAgeSeconds, secure) {
  const attrs = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function clearedSessionCookieHeader(secure) {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function isHttps(request) {
  return new URL(request.url).protocol === 'https:';
}

async function createSession(db, userId) {
  const id = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();
  return id;
}

// Returns { user, renewedCookie } — renewedCookie is set when the
// session was close to expiry and got pushed out another SESSION_TTL.
async function getSessionUser(db, request) {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return { user: null, renewedCookie: null };

  const session = await db
    .prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?')
    .bind(sid)
    .first();

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    return { user: null, renewedCookie: null };
  }

  const user = await db
    .prepare(
      'SELECT id, username, email, display_name, role, prefers_desktop FROM users WHERE id = ?'
    )
    .bind(session.user_id)
    .first();

  if (!user) return { user: null, renewedCookie: null };

  let renewedCookie = null;
  const msLeft = new Date(session.expires_at).getTime() - Date.now();
  if (msLeft < SESSION_RENEW_WINDOW_SECONDS * 1000) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(newExpiry, sid).run();
    renewedCookie = sessionCookieHeader(sid, SESSION_TTL_SECONDS, isHttps(request));
  }

  return { user, renewedCookie };
}

async function requireUser(db, request) {
  const { user, renewedCookie } = await getSessionUser(db, request);
  if (!user) return { user: null, renewedCookie: null, response: fail('Not signed in.', 401, 'UNAUTHENTICATED') };
  return { user, renewedCookie, response: null };
}


// ============================================================
//  Login rate limiting
// ============================================================

async function isRateLimited(db, identifier, ip) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS attempts FROM login_attempts
       WHERE identifier = ? AND ip = ? AND succeeded = 0 AND attempted_at > ?`
    )
    .bind(identifier.toLowerCase(), ip, since)
    .first();
  return (row?.attempts ?? 0) >= LOGIN_MAX_ATTEMPTS;
}

async function recordAttempt(db, identifier, ip, succeeded) {
  await db
    .prepare('INSERT INTO login_attempts (identifier, ip, succeeded) VALUES (?, ?, ?)')
    .bind(identifier.toLowerCase(), ip, succeeded ? 1 : 0)
    .run();
}


// ============================================================
//  Route: POST /api/auth/setup  (bootstrap — only while empty)
// ============================================================

async function handleSetup(request, env) {
  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (count > 0) {
    return fail('Setup already completed — sign in instead.', 403, 'SETUP_CLOSED');
  }

  const body = await readJson(request);
  const username = (body?.username || '').trim();
  const email = (body?.email || '').trim().toLowerCase();
  const displayName = (body?.display_name || username).trim();
  const password = body?.password || '';

  if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return fail('Username must be 3–24 characters: letters, numbers, underscores.', 422, 'INVALID_USERNAME');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('Enter a valid email address.', 422, 'INVALID_EMAIL');
  }
  if (password.length < 10) {
    return fail('Password must be at least 10 characters.', 422, 'WEAK_PASSWORD');
  }

  const { hash, salt } = await hashPassword(password);

  try {
    const result = await env.DB.prepare(
      `INSERT INTO users (username, email, display_name, password_hash, password_salt, role)
       VALUES (?, ?, ?, ?, ?, 'owner')`
    )
      .bind(username, email, displayName, hash, salt)
      .run();

    const sid = await createSession(env.DB, result.meta.last_row_id);
    const res = ok({ username, display_name: displayName, role: 'owner' }, 201);
    res.headers.append('set-cookie', sessionCookieHeader(sid, SESSION_TTL_SECONDS, isHttps(request)));
    return res;
  } catch (err) {
    console.error('setup failed', err);
    return fail('That username or email is already taken.', 409, 'CONFLICT');
  }
}


// ============================================================
//  Route: POST /api/auth/login
// ============================================================

async function handleLogin(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const body = await readJson(request);
  const identifier = (body?.identifier || '').trim();
  const password = body?.password || '';

  if (!identifier || !password) {
    return fail('Enter your username/email and password.', 422, 'MISSING_FIELDS');
  }

  if (await isRateLimited(env.DB, identifier, ip)) {
    return fail('Too many attempts. Try again in a few minutes.', 429, 'RATE_LIMITED');
  }

  const user = await env.DB.prepare(
    `SELECT id, username, email, display_name, role, prefers_desktop, password_hash, password_salt
     FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)`
  )
    .bind(identifier, identifier)
    .first();

  const valid = user ? await verifyPassword(password, user.password_hash, user.password_salt) : false;
  await recordAttempt(env.DB, identifier, ip, valid);

  if (!valid) {
    return fail('That username/email and password don\u2019t match.', 401, 'INVALID_CREDENTIALS');
  }

  const sid = await createSession(env.DB, user.id);
  const res = ok({
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    prefers_desktop: !!user.prefers_desktop,
  });
  res.headers.append('set-cookie', sessionCookieHeader(sid, SESSION_TTL_SECONDS, isHttps(request)));
  return res;
}


// ============================================================
//  Route: POST /api/auth/logout
// ============================================================

async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  }
  const res = ok({ signed_out: true });
  res.headers.append('set-cookie', clearedSessionCookieHeader(isHttps(request)));
  return res;
}


// ============================================================
//  Route: GET /api/auth/me
// ============================================================

async function handleMe(request, env) {
  const { user, renewedCookie } = await getSessionUser(env.DB, request);
  const res = ok({ user: user ? { ...user, prefers_desktop: !!user.prefers_desktop } : null });
  if (renewedCookie) res.headers.append('set-cookie', renewedCookie);
  return res;
}


// ============================================================
//  Route: PUT /api/account
// ============================================================

async function handleAccountUpdate(request, env) {
  const { user, renewedCookie, response } = await requireUser(env.DB, request);
  if (response) return response;

  const body = await readJson(request);
  const updates = [];
  const values = [];

  if (typeof body?.username === 'string' && body.username.trim() && body.username.trim() !== user.username) {
    const username = body.username.trim();
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return fail('Username must be 3–24 characters: letters, numbers, underscores.', 422, 'INVALID_USERNAME');
    }
    updates.push('username = ?');
    values.push(username);
  }

  if (typeof body?.password === 'string' && body.password.length > 0) {
    if (body.password.length < 10) {
      return fail('New password must be at least 10 characters.', 422, 'WEAK_PASSWORD');
    }
    const { hash, salt } = await hashPassword(body.password);
    updates.push('password_hash = ?', 'password_salt = ?');
    values.push(hash, salt);
  }

  if (typeof body?.prefers_desktop === 'boolean') {
    updates.push('prefers_desktop = ?');
    values.push(body.prefers_desktop ? 1 : 0);
  }

  if (updates.length === 0) {
    return fail('Nothing to update.', 422, 'NO_CHANGES');
  }

  values.push(user.id);

  try {
    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  } catch (err) {
    console.error('account update failed', err);
    return fail('That username is already taken.', 409, 'CONFLICT');
  }

  const fresh = await env.DB.prepare(
    'SELECT username, email, display_name, role, prefers_desktop FROM users WHERE id = ?'
  )
    .bind(user.id)
    .first();

  const res = ok({ user: { ...fresh, prefers_desktop: !!fresh.prefers_desktop } });
  if (renewedCookie) res.headers.append('set-cookie', renewedCookie);
  return res;
}


// ============================================================
//  Route: GET /api/games
// ============================================================

async function handleGamesList(env) {
  const { results } = await env.DB.prepare(
    'SELECT slug, name, tagline FROM games ORDER BY sort_order, name'
  ).all();
  return ok({ games: results });
}


// ============================================================
//  Route: GET /api/games/:slug
// ============================================================

async function handleGameDetail(env, slug) {
  const game = await env.DB.prepare('SELECT id, slug, name, tagline FROM games WHERE slug = ?')
    .bind(slug)
    .first();

  if (!game) return fail('Game not found.', 404, 'NOT_FOUND');

  const { results: unitRows } = await env.DB.prepare(
    `SELECT category, name, area, base_cost FROM units
     WHERE game_id = ? ORDER BY category, sort_order, name`
  )
    .bind(game.id)
    .all();

  const units = Object.fromEntries(UNIT_CATEGORIES.map((c) => [c, []]));
  for (const row of unitRows) {
    (units[row.category] ??= []).push({
      name: row.name,
      area: row.area,
      base_cost: row.base_cost,
    });
  }

  const { results: shopItems } = await env.DB.prepare(
    `SELECT name, base_rarity, base_cost, base_income FROM shop_items
     WHERE game_id = ? ORDER BY sort_order, name`
  )
    .bind(game.id)
    .all();

  const { id, ...publicGame } = game;
  return ok({ game: publicGame, units, shop_items: shopItems });
}


// ============================================================
//  Route: GET /api/staff
// ============================================================

async function handleStaff(env) {
  const { results } = await env.DB.prepare(
    'SELECT role_label, name FROM staff ORDER BY sort_order, name'
  ).all();
  return ok({ staff: results });
}


// ============================================================
//  Route: GET /api/config
// ============================================================

async function handleConfig(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM site_config').all();
  const map = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  return ok({
    setup_required: count === 0,
    socials: {
      facebook: map.social_facebook || '',
      tiktok: map.social_tiktok || '',
      youtube: map.social_youtube || '',
    },
    download: {
      url: map.download_url || '',
      label: map.download_label || 'Latest Release',
    },
  });
}


// ============================================================
//  Router
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (pathname === '/api/auth/setup' && method === 'POST') return await handleSetup(request, env);
      if (pathname === '/api/auth/login' && method === 'POST') return await handleLogin(request, env);
      if (pathname === '/api/auth/logout' && method === 'POST') return await handleLogout(request, env);
      if (pathname === '/api/auth/me' && method === 'GET') return await handleMe(request, env);
      if (pathname === '/api/account' && method === 'PUT') return await handleAccountUpdate(request, env);
      if (pathname === '/api/games' && method === 'GET') return await handleGamesList(env);
      if (pathname === '/api/staff' && method === 'GET') return await handleStaff(env);
      if (pathname === '/api/config' && method === 'GET') return await handleConfig(env);

      const gameMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)$/);
      if (gameMatch && method === 'GET') return await handleGameDetail(env, gameMatch[1]);

      return fail('Not found.', 404, 'NOT_FOUND');
    } catch (err) {
      console.error('unhandled error', err);
      return fail('Something went wrong on our end.', 500, 'INTERNAL_ERROR');
    }
  },
};
