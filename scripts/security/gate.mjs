#!/usr/bin/env node
// Runs one security check and reports its results in the no-mistakes
// structured-findings format (when NO_MISTAKES_FINDINGS_FILE is set) and as
// GitHub annotations (when GITHUB_ACTIONS is set).
// Usage: node scripts/security/gate.mjs <secrets|sast|deps|suppressions> [--advisory]
//   --advisory reports error findings as warnings (CI uses it for suppressions,
//   where the PR review is the approval).
// Exit codes: 0 = no error findings, 1 = error findings, 2 = scanner unavailable or failed.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const SEMGREP_CONFIGS = ['p/javascript', 'p/security-audit'];
const SEMGREP_EXCLUDES = ['public', 'dist', 'node_modules', 'test-results', 'playwright-report', 'docs'];
// Files that tell a scanner to skip findings, and inline comments that do the same.
export const SUPPRESSION_FILES = ['.gitleaksignore', '.gitleaks.toml', '.semgrepignore', 'osv-scanner.toml'];
export const SUPPRESSION_COMMENT = /\b(nosemgrep|gitleaks:allow)\b/;
// Changes to these are reported whole, so their own text is not scanned for suppression comments.
export const PIPELINE_PATHS = [/^\.no-mistakes\.yaml$/, /^\.github\//, /^scripts\/security\//];

let kind;
let tempDir;

if (isMain()) main();

function isMain() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

function main() {
  const [arg, ...flags] = process.argv.slice(2);
  kind = arg;
  const scanners = {secrets, sast, deps, suppressions};
  if (!Object.hasOwn(scanners, kind)) fail(`usage: gate.mjs <${Object.keys(scanners).join('|')}> [--advisory]`);
  let findings = scanners[kind]();
  if (flags.includes('--advisory')) findings = findings.map(f => f.severity === 'error' ? {...f, severity: 'warning'} : f);
  report(findings);
  process.exit(findings.some(f => f.severity === 'error') ? 1 : 0);
}

function secrets() {
  // Scan every commit (a secret committed then deleted still ships in history)
  // plus the working tree (uncommitted edits when run by hand).
  return gitleaksFindings(gitleaks(['git', '.'], 'history.json'), gitleaks(['dir', '.'], 'tree.json'));
}

export function gitleaksFindings(history, tree) {
  const key = leak => `${leak.RuleID}:${leak.File}:${leak.StartLine}`;
  const seen = new Set(history.map(key));
  return dedupe([...history, ...tree.filter(leak => !seen.has(key(leak)))].map(leak => ({
    id: `secret-${hash(leak.Fingerprint || key(leak))}`,
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
  return semgrepFindings(parseJson(res.stdout, 'semgrep'));
}

export function semgrepFindings(output) {
  const results = output.results.map(r => ({
    id: `sast-${hash(`${r.check_id}:${r.path}:${r.start.line}`)}`,
    severity: semgrepSeverity(r),
    file: r.path,
    line: r.start.line,
    description: `${r.check_id.split('.').pop()}: ${r.extra.message.trim()}`,
    action: 'auto-fix',
  }));
  // Partial-parse warnings still scan the rest of the file; an error-level
  // parse failure means the file was not scanned at all.
  const unscanned = (output.errors || []).filter(e => e.level === 'error' && e.path).map(e => ({
    id: `sast-unscanned-${hash(e.path)}`,
    severity: 'warning',
    file: e.path,
    description: `semgrep could not scan this file (${[e.type].flat()[0] || 'error'}); it was not checked.`,
    action: 'no-op',
  }));
  return dedupe([...results, ...unscanned]);
}

// Registry rules mark most security checks WARNING; block on those the rule
// author rates high-confidence, so they cannot pass unnoticed.
export function semgrepSeverity(result) {
  const level = result.extra.severity;
  if (level === 'ERROR') return 'error';
  if (level === 'WARNING') return String(result.extra.metadata?.confidence).toUpperCase() === 'HIGH' ? 'error' : 'warning';
  if (level === 'INFO') return 'info';
  return 'warning';
}

function deps() {
  const res = run('osv-scanner', ['scan', 'source', '--lockfile', 'package-lock.json', '--format', 'json'],
    'https://google.github.io/osv-scanner/installation/');
  // osv-scanner exits 1 when it finds vulnerabilities; anything else non-zero is a real failure.
  if (res.status !== 0 && res.status !== 1) fail(`osv-scanner failed (exit ${res.status})`);
  return osvFindings(parseJson(res.stdout, 'osv-scanner'));
}

export function osvFindings(output) {
  const findings = [];
  for (const result of output.results || []) {
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
          severity: depSeverity(cvss, vulns),
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

// CVSS score when osv-scanner has one, else the advisory's severity label;
// a vulnerability with neither blocks rather than passing silently.
export function depSeverity(cvss, vulns) {
  if (Number.isFinite(cvss) && cvss > 0) return cvss >= 7 ? 'error' : cvss >= 4 ? 'warning' : 'info';
  const labels = vulns.map(v => String(v.database_specific?.severity || '').toUpperCase());
  if (labels.some(l => l === 'CRITICAL' || l === 'HIGH')) return 'error';
  if (labels.includes('MODERATE') || labels.includes('MEDIUM')) return 'warning';
  if (labels.includes('LOW')) return 'info';
  return 'error';
}

export function fixedVersions(vulns, current) {
  const [major] = current.split('.');
  const fixes = vulns.flatMap(v => (v.affected || []).flatMap(a => (a.ranges || [])
    .flatMap(r => r.events.filter(e => e.fixed).map(e => e.fixed))));
  const sameMajor = fixes.filter(f => f.split('.')[0] === major);
  return (sameMajor.length ? sameMajor : fixes).sort(compareVersions).pop();
}

// Semver order: numeric core, then a pre-release sorts before its release.
export function compareVersions(a, b) {
  const [coreA, preA] = splitVersion(a), [coreB, preB] = splitVersion(b);
  for (let i = 0; i < Math.max(coreA.length, coreB.length); i++) {
    const d = (coreA[i] || 0) - (coreB[i] || 0);
    if (d) return d;
  }
  if (!preA || !preB) return preA ? -1 : preB ? 1 : 0;
  const pa = preA.split('.'), pb = preB.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined || pb[i] === undefined) return pa[i] === undefined ? -1 : 1;
    const na = /^\d+$/.test(pa[i]), nb = /^\d+$/.test(pb[i]);
    if (na && nb && Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (!na && pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function splitVersion(v) {
  const [main, ...pre] = v.split('+')[0].split('-');
  return [main.split('.').map(n => Number(n) || 0), pre.join('-')];
}

// Flags anything added since the base branch that silences a scanner or edits
// the pipeline itself, so it needs a human decision instead of passing quietly.
function suppressions() {
  const base = process.env.SECURITY_BASE_REF || 'origin/main';
  const mergeBase = run('git', ['merge-base', base, 'HEAD'], 'https://git-scm.com/downloads');
  if (mergeBase.status !== 0) fail(`cannot find merge base with ${base}; set SECURITY_BASE_REF`);
  const diff = run('git', ['diff', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff',
    mergeBase.stdout.trim()], 'https://git-scm.com/downloads');
  if (diff.status !== 0) fail(`git diff failed (exit ${diff.status})`);
  return suppressionFindings(diff.stdout);
}

export function suppressionFindings(diffText) {
  const findings = [];
  let file = null, oldFile = null, line = 0;
  for (const text of diffText.split('\n')) {
    if (text.startsWith('--- ')) {
      oldFile = text === '--- /dev/null' ? null : text.slice(6);
    } else if (text.startsWith('+++ ')) {
      file = text === '+++ /dev/null' ? null : text.slice(6);
      const name = file?.split('/').pop();
      // Pipeline files are checked by old path too, so deleting one is caught.
      const pipeline = [file, oldFile].find(f => f && PIPELINE_PATHS.some(p => p.test(f)));
      if (file && SUPPRESSION_FILES.includes(name)) {
        findings.push(suppressionFinding(file, undefined, `Changes ${name}, which tells a scanner to skip findings. Confirm each new entry is intended.`));
      } else if (pipeline) {
        findings.push(suppressionFinding(pipeline, undefined, 'Changes the security pipeline. Confirm the change is intended; it can weaken or skip checks.'));
      }
    } else if (text.startsWith('@@ ')) {
      line = Number(/\+(\d+)/.exec(text)?.[1] || 0);
    } else if (text.startsWith('+') && file) {
      const match = SUPPRESSION_COMMENT.exec(text);
      if (match && !PIPELINE_PATHS.some(p => p.test(file))) {
        findings.push(suppressionFinding(file, line, `Adds a ${match[1]} comment, which hides scanner findings on this line. Confirm the finding is a false positive.`));
      }
      line++;
    }
  }
  return dedupe(findings);
}

function suppressionFinding(file, line, description) {
  return {id: `suppression-${hash(`${file}:${line ?? ''}`)}`, severity: 'error', file, ...(line ? {line} : {}), description, action: 'ask-user'};
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
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), 'security-gate-'));
    process.on('exit', () => rmSync(tempDir, {recursive: true, force: true}));
  }
  return join(tempDir, name);
}

function readJson(path) {
  const text = readFileSync(path, 'utf8').trim();
  return text ? JSON.parse(text) : [];
}

// Empty or malformed scanner output fails the gate instead of reading as "no findings".
function parseJson(text, scanner) {
  if (!text?.trim()) fail(`${scanner} produced no output`);
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`${scanner} output is not JSON: ${err.message}`);
  }
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
