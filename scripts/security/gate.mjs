#!/usr/bin/env node
// Runs one security scanner and reports its results in the no-mistakes
// structured-findings format (when NO_MISTAKES_FINDINGS_FILE is set) and as
// GitHub annotations (when GITHUB_ACTIONS is set).
// Usage: node scripts/security/gate.mjs <secrets|sast|deps>
// Exit codes: 0 = no error findings, 1 = error findings, 2 = scanner unavailable or failed.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const SEMGREP_CONFIGS = ['p/javascript', 'p/security-audit'];
const SEMGREP_EXCLUDES = ['public', 'dist', 'node_modules', 'test-results', 'playwright-report', 'docs'];

const [kind] = process.argv.slice(2);
let tempDir;
const scanners = {secrets, sast, deps};
if (!scanners[kind]) fail(`usage: gate.mjs <${Object.keys(scanners).join('|')}>`);

const findings = scanners[kind]();
report(findings);
process.exit(findings.some(f => f.severity === 'error') ? 1 : 0);

function secrets() {
  // Scan every commit (a secret committed then deleted still ships in history)
  // plus the working tree (uncommitted edits when run by hand).
  const history = gitleaks(['git', '.'], 'history.json');
  const seen = new Set(history.map(leak => `${leak.RuleID}:${leak.File}:${leak.StartLine}`));
  const tree = gitleaks(['dir', '.'], 'tree.json').filter(leak => !seen.has(`${leak.RuleID}:${leak.File}:${leak.StartLine}`));
  return dedupe([...history, ...tree].map(leak => ({
    id: `secret-${hash(leak.Fingerprint || `${leak.RuleID}:${leak.File}:${leak.StartLine}`)}`,
    severity: 'error',
    file: leak.File,
    line: leak.StartLine,
    description: `Possible ${leak.RuleID} secret${leak.Commit ? ` in commit ${leak.Commit.slice(0, 7)}` : ''}. ` +
      'Rotate the credential first; deleting it from the file does not remove it from git history.',
    action: 'ask-user',
  })));
}

function gitleaks(mode, reportName) {
  const out = tempFile(reportName);
  const res = run('gitleaks', [...mode, '--redact', '--no-banner', '--exit-code', '0',
    '--report-format', 'json', '--report-path', out], 'https://github.com/gitleaks/gitleaks#installing');
  if (res.status !== 0) fail(`gitleaks ${mode[0]} failed (exit ${res.status})`);
  return readJson(out);
}

function sast() {
  const args = ['scan', '--metrics=off', '--json', '--quiet', '--disable-version-check',
    ...SEMGREP_CONFIGS.flatMap(c => ['--config', c]),
    ...SEMGREP_EXCLUDES.flatMap(e => ['--exclude', e]), '.'];
  const res = run('semgrep', args, 'https://semgrep.dev/docs/getting-started/cli (e.g. `pipx install semgrep`)');
  if (res.status !== 0) fail(`semgrep failed (exit ${res.status})`);
  const severity = {ERROR: 'error', WARNING: 'warning', INFO: 'info'};
  return dedupe(JSON.parse(res.stdout).results.map(r => ({
    id: `sast-${hash(`${r.check_id}:${r.path}:${r.start.line}`)}`,
    severity: severity[r.extra.severity] || 'warning',
    file: r.path,
    line: r.start.line,
    description: `${r.check_id.split('.').pop()}: ${r.extra.message.trim()}`,
    action: 'auto-fix',
  })));
}

function deps() {
  const res = run('osv-scanner', ['scan', 'source', '--lockfile', 'package-lock.json', '--format', 'json'],
    'https://google.github.io/osv-scanner/installation/');
  // osv-scanner exits 1 when it finds vulnerabilities; anything else non-zero is a real failure.
  if (res.status !== 0 && res.status !== 1) fail(`osv-scanner failed (exit ${res.status})`);
  const findings = [];
  for (const result of JSON.parse(res.stdout || '{"results":[]}').results || []) {
    for (const pkg of result.packages) {
      const {name, version} = pkg.package;
      for (const group of pkg.groups || []) {
        const vulns = pkg.vulnerabilities.filter(v => group.ids.includes(v.id));
        const fixed = fixedVersions(vulns, version);
        const cvss = Number(group.max_severity);
        const id = group.ids[0];
        const cve = (group.aliases || []).find(a => a.startsWith('CVE-'));
        findings.push({
          id: `deps-${name.replace(/[^a-z0-9]+/gi, '-')}-${id}`,
          severity: cvss >= 7 ? 'error' : cvss >= 4 ? 'warning' : 'info',
          file: 'package-lock.json',
          description: `${name}@${version}: ${id}${cve ? ` (${cve})` : ''}` +
            `${Number.isFinite(cvss) && cvss > 0 ? ` CVSS ${cvss}` : ''} - ${vulns[0]?.summary || 'known vulnerability'}. ` +
            (fixed ? `Upgrade to ${fixed} or later.` : 'No fixed version published; needs a decision.'),
          action: fixed ? 'auto-fix' : 'ask-user',
        });
      }
    }
  }
  return findings;
}

function fixedVersions(vulns, current) {
  const [major] = current.split('.');
  const fixes = vulns.flatMap(v => (v.affected || []).flatMap(a => (a.ranges || [])
    .flatMap(r => r.events.filter(e => e.fixed).map(e => e.fixed))));
  const sameMajor = fixes.filter(f => f.split('.')[0] === major);
  return (sameMajor.length ? sameMajor : fixes).sort(compareVersions).pop();
}

function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function report(list) {
  const counts = ['error', 'warning', 'info'].map(s => `${list.filter(f => f.severity === s).length} ${s}`).join(', ');
  console.log(`security/${kind}: ${list.length ? counts : 'no findings'}`);
  for (const f of list) {
    console.log(`  [${f.severity}] ${f.id} ${f.file ?? ''}${f.line ? `:${f.line}` : ''} ${f.description}`);
    if (process.env.GITHUB_ACTIONS) {
      const level = {error: 'error', warning: 'warning', info: 'notice'}[f.severity];
      const loc = f.file ? ` file=${f.file}${f.line ? `,line=${f.line}` : ''}` : '';
      console.log(`::${level}${loc},title=${kind}::${f.description.replace(/\r?\n/g, ' ')}`);
    }
  }
  if (process.env.NO_MISTAKES_FINDINGS_FILE) {
    writeFileSync(process.env.NO_MISTAKES_FINDINGS_FILE, JSON.stringify({findings: list}, null, 2));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### security/${kind}: ${list.length ? counts : 'no findings'}\n` +
      list.map(f => `- **${f.severity}** \`${f.file ?? ''}${f.line ? `:${f.line}` : ''}\` ${f.description}`).join('\n') + '\n');
  }
}

function run(cmd, args, installHint) {
  const res = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit']});
  if (res.error?.code === 'ENOENT') fail(`${cmd} is not installed. Install it: ${installHint}`);
  if (res.error) fail(`${cmd}: ${res.error.message}`);
  return res;
}

function tempFile(name) {
  tempDir ??= mkdtempSync(join(tmpdir(), 'security-gate-'));
  process.on('exit', () => rmSync(tempDir, {recursive: true, force: true}));
  return join(tempDir, name);
}

function readJson(path) {
  const text = readFileSync(path, 'utf8').trim();
  return text ? JSON.parse(text) : [];
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(f => !seen.has(f.id) && seen.add(f.id));
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function fail(message) {
  console.error(`security/${kind ?? '?'}: ${message}`);
  process.exit(2);
}
