#!/usr/bin/env node
// Crée une boulangerie et son compte patron (hors démo).
// Usage : node scripts/create-account.mjs "Nom de la boulangerie" email@exemple.fr "Prénom Nom" [--remote]
// Le mot de passe est demandé de façon masquée, puis haché en PBKDF2 (même format que l'API).

import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const [bakeryName, email, name, flag] = process.argv.slice(2);
if (!bakeryName || !email || !name) {
  console.error('Usage : node scripts/create-account.mjs "Boulangerie" email "Prénom Nom" [--remote]');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const password = await askHidden('Mot de passe (10 caractères minimum) : ');
if (password.length < 10) { console.error('Mot de passe trop court.'); process.exit(1); }

const b64 = (buf) => Buffer.from(buf).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
const hash = `pbkdf2$100000$${b64(salt)}$${b64(bits)}`;

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const bakeryId = crypto.randomUUID();
const sql = `INSERT INTO bakeries (id, name) VALUES (${q(bakeryId)}, ${q(bakeryName)});
INSERT INTO users (id, bakery_id, email, name, role, password_hash) VALUES (${q(crypto.randomUUID())}, ${q(bakeryId)}, ${q(email.toLowerCase())}, ${q(name)}, 'patron', ${q(hash)});`;

const file = join(tmpdir(), `fournil-${bakeryId}.sql`);
writeFileSync(file, sql);
try {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'fournil', flag === '--remote' ? '--remote' : '--local', `--file=${file}`], { stdio: 'inherit' });
  console.log(`\nCompte créé : ${email} (patron de « ${bakeryName} »).`);
} finally { unlinkSync(file); }
