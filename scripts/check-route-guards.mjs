#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POLICY_FILE = path.join(ROOT, 'docs/security-policy-routes.md');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = '^' + esc.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$';
  return new RegExp(regex);
}

function parsePolicy() {
  const text = fs.readFileSync(POLICY_FILE, 'utf8');
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error(`Missing JSON policy block in ${POLICY_FILE}`);
  return JSON.parse(match[1]);
}

const policy = parsePolicy();
const publicMatchers = (policy.public || []).map(globToRegExp);
const serviceMatchers = (policy.serviceAuth || []).map(globToRegExp);
const guardPatterns = policy.guardPatterns || [];
const serviceLegacyMatchers = (policy.serviceAuthLegacy || []).map(globToRegExp);
const unguardedAllowedMatchers = (policy.unguardedAllowed || []).map(globToRegExp);

const routeFiles = walk(path.join(ROOT, 'app', 'api')).map((f) => path.relative(ROOT, f).replaceAll(path.sep, '/'));

const failures = [];
for (const rel of routeFiles) {
  if (publicMatchers.some((r) => r.test(rel))) continue;
  if (unguardedAllowedMatchers.some((r) => r.test(rel))) continue;

  const contents = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hasGuard = guardPatterns.some((pattern) => contents.includes(pattern));

  if (serviceMatchers.some((r) => r.test(rel))) {
    const hasServiceGuard =
      contents.includes('verifyCronSignature(') ||
      contents.includes('verifyInternalToken(') ||
      contents.includes('verifyHubbellUploadToken(');
    if (!hasServiceGuard && !serviceLegacyMatchers.some((r) => r.test(rel))) {
      failures.push(`${rel} (serviceAuth route missing verifyCronSignature/verifyInternalToken/verifyHubbellUploadToken)`);
    }
    continue;
  }

  if (!hasGuard) failures.push(`${rel} (missing recognized auth guard)`);
}

if (failures.length > 0) {
  console.error('Route guard policy violations found:\n');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(`Route guard check passed for ${routeFiles.length} routes.`);
