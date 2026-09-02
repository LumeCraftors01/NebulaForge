#!/usr/bin/env node
// ============================================================
//  create-account.mjs
//
//  Generates a ready-to-run SQL statement for adding a staff
//  account, hashed with the exact same PBKDF2 parameters the
//  Worker uses at login time (see PBKDF2_ITERATIONS in
//  src/index.js — keep the two in sync if you ever change it).
//
//  Usage:
//    node scripts/create-account.mjs \
//      --username LumeCraftor \
//      --email owner@example.com \
//      --name "LumeCraftor" \
//      --role owner \
//      --password "a strong password"
//
//  Then run the SQL it prints with:
//    wrangler d1 execute studio_wiki_db --remote --command "<paste>"
// ============================================================

import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!key || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { username, email, name, role = 'member', password } = args;

  if (!username || !email || !name || !password) {
    console.error(
      'Usage: node scripts/create-account.mjs --username <u> --email <e> --name "<display name>" --role <owner|head_admin|admin|member> --password "<password>"'
    );
    process.exit(1);
  }

  const validRoles = ['owner', 'head_admin', 'admin', 'member'];
  if (!validRoles.includes(role)) {
    console.error(`--role must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const { hash, salt } = await hashPassword(password);

  const sql =
    `INSERT INTO users (username, email, display_name, password_hash, password_salt, role) VALUES ` +
    `('${sqlEscape(username)}', '${sqlEscape(email)}', '${sqlEscape(name)}', '${hash}', '${salt}', '${role}');`;

  console.log('\nRun this against your database:\n');
  console.log(`  wrangler d1 execute studio_wiki_db --remote --command "${sql.replace(/"/g, '\\"')}"\n`);
  console.log('Or save it to a file and pass --file instead:\n');
  console.log(sql);
  console.log('');
}

main();
