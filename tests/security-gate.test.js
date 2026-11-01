import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions, depSeverity, fixedVersions, gitleaksFindings, osvFindings, semgrepFindings, semgrepSeverity, suppressionFindings} from '../scripts/security/gate.mjs';

// Built from parts so this file does not itself trip the suppressions check.
const NOSEM = 'nosem' + 'grep';
const ALLOW = 'gitleaks' + ':allow';

const semgrepResult = (severity, confidence) => ({check_id: 'r.js.rule', path: 'a.js', start: {line: 3}, extra: {severity, message: 'm', metadata: {confidence}}});

test('semgrep blocks ERROR rules and high-confidence WARNING rules only', () => {
 assert.equal(semgrepSeverity(semgrepResult('ERROR', 'LOW')), 'error');
 assert.equal(semgrepSeverity(semgrepResult('WARNING', 'HIGH')), 'error');
 assert.equal(semgrepSeverity(semgrepResult('WARNING', 'MEDIUM')), 'warning');
 assert.equal(semgrepSeverity(semgrepResult('WARNING', undefined)), 'warning');
 assert.equal(semgrepSeverity(semgrepResult('INFO', 'HIGH')), 'info');
});

test('semgrep reports files it could not parse, but not partial-parse warnings', () => {
 const out = semgrepFindings({results: [semgrepResult('ERROR')], errors: [
  {level: 'warn', type: ['PartialParsing'], path: 'b.js'},
  {level: 'error', type: 'Syntax error', path: 'c.js'},
 ]});
 assert.deepEqual(out.map(f => [f.file, f.severity, f.action]), [['a.js', 'error', 'auto-fix'], ['c.js', 'warning', 'no-op']]);
});

test('dependency severity falls back to the advisory label, and unscored advisories block', () => {
 assert.equal(depSeverity(7.5, []), 'error');
 assert.equal(depSeverity(5, []), 'warning');
 assert.equal(depSeverity(2, []), 'info');
 assert.equal(depSeverity(NaN, [{database_specific: {severity: 'HIGH'}}]), 'error');
 assert.equal(depSeverity(NaN, [{database_specific: {severity: 'MODERATE'}}]), 'warning');
 assert.equal(depSeverity(NaN, [{database_specific: {severity: 'LOW'}}]), 'info');
 assert.equal(depSeverity(NaN, [{database_specific: {}}]), 'error');
});

test('versions sort numerically with pre-releases before their release', () => {
 assert.deepEqual(['1.0.0', '1.0.0-rc.10', '0.9.9', '1.0.0-rc.2', '1.0.0-beta', '1.10.0'].sort(compareVersions),
  ['0.9.9', '1.0.0-beta', '1.0.0-rc.2', '1.0.0-rc.10', '1.0.0', '1.10.0']);
});

test('the suggested upgrade stays on the current major when a fix exists there', () => {
 const ranges = fixed => ({affected: [{ranges: [{events: [{introduced: '0'}, ...fixed.map(f => ({fixed: f}))]}]}]});
 assert.equal(fixedVersions([ranges(['6.4.2', '7.3.7']), ranges(['7.3.5'])], '7.3.6'), '7.3.7');
 assert.equal(fixedVersions([ranges(['8.0.0'])], '7.3.6'), '8.0.0');
 assert.equal(fixedVersions([{}], '7.3.6'), undefined);
});

test('osv results become one finding per advisory group', () => {
 const out = osvFindings({results: [{packages: [{
  package: {name: '@scope/pkg', version: '1.2.1'},
  vulnerabilities: [{id: 'GHSA-x', summary: 'bad', affected: [{ranges: [{events: [{fixed: '1.2.2'}]}]}]}, {id: 'GHSA-y', summary: 'worse'}],
  groups: [{ids: ['GHSA-x'], aliases: ['GHSA-x', 'CVE-2026-1'], max_severity: '8.7'}, {ids: ['GHSA-y'], aliases: []}],
 }]}]});
 assert.deepEqual(out.map(f => [f.id, f.severity, f.action]), [['deps--scope-pkg-GHSA-x', 'error', 'auto-fix'], ['deps--scope-pkg-GHSA-y', 'error', 'ask-user']]);
 assert.match(out[0].description, /CVE-2026-1\) CVSS 8.7 .*Upgrade to 1.2.2/);
 assert.deepEqual(osvFindings({results: []}), []);
});

test('a secret still in the tree is reported once, preferring the commit it came from', () => {
 const leak = {RuleID: 'github-pat', File: 'a.js', StartLine: 1};
 const out = gitleaksFindings([{...leak, Commit: 'abcdef123', Fingerprint: 'abcdef123:a.js:github-pat:1'}], [leak, {...leak, File: 'b.js'}]);
 assert.deepEqual(out.map(f => [f.file, f.action]), [['a.js', 'ask-user'], ['b.js', 'ask-user']]);
 assert.match(out[0].description, /in commit abcdef1/);
});

test('new suppression comments, ignore files and pipeline edits each need a decision', () => {
 const diff = [
  'diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js',
  '@@ -10,0 +11,2 @@', '+ok();', `+exec(cmd); // ${NOSEM}`,
  '@@ -20 +22 @@', `-old(); // ${ALLOW}`, `+token = x; // ${ALLOW}`,
  'diff --git a/osv-scanner.toml b/osv-scanner.toml', '--- /dev/null', '+++ b/osv-scanner.toml',
  '@@ -0,0 +1,2 @@', '+[[IgnoredVulns]]', '+id = "GHSA-x"',
  'diff --git a/.gitleaksignore b/.gitleaksignore', '--- a/.gitleaksignore', '+++ /dev/null', '@@ -1 +0,0 @@', '-abc',
  'diff --git a/scripts/security/gate.mjs b/scripts/security/gate.mjs', '--- a/scripts/security/gate.mjs', '+++ b/scripts/security/gate.mjs',
  '@@ -1 +1 @@', `+// mentions ${NOSEM}`,
  'diff --git a/.github/workflows/security.yml b/.github/workflows/security.yml', '--- a/.github/workflows/security.yml', '+++ /dev/null', '@@ -1 +0,0 @@', '-name: security',
 ].join('\n');
 const out = suppressionFindings(diff);
 assert.deepEqual(out.map(f => [f.file, f.line]), [['src/a.js', 12], ['src/a.js', 22], ['osv-scanner.toml', undefined], ['scripts/security/gate.mjs', undefined], ['.github/workflows/security.yml', undefined]]);
 assert.ok(out.every(f => f.severity === 'error' && f.action === 'ask-user'));
 assert.deepEqual(suppressionFindings(''), []);
});
