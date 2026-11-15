// Unit tests for the reporting scripts. No API calls: the committed baseline is the fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkGates } from '../../scripts/gate.mjs';
import { summarize } from '../../scripts/summarize.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../reports/baseline/${name}.json`, import.meta.url), 'utf8'));
const row = (over = {}) => ({ provider: { id: 'anthropic:messages:claude-haiku-5-5', label: 'haiku' }, testCase: { description: 'case' }, success: true, failureReason: 0, response: { output: 'ok' }, ...over });
const errored = () => row({ success: false, failureReason: 2, error: '429 Too Many Requests', response: undefined });
const data = (results) => ({ results: { timestamp: '2026-01-02T03:04:05.000Z', results } });

test('reproduces the committed baseline scores', () => {
  const md = summarize(load('eval'));
  assert.match(md, /claude-haiku-5\.5 \(small\) \| 93% \(27\/29\) \| 0 /);
  assert.match(md, /claude-sonnet-5\.5 \(medium\) \| 93% \(27\/29\) \| 0 /);
});

test('dates a report by its run, not by today', () => {
  assert.match(summarize(load('eval')), /Run on 2026-11-15/);
  assert.match(summarize(data([row()])), /Run on 2026-01-02/);
});

test('errored calls stay out of the pass rate and are listed separately', () => {
  const md = summarize(data([row(), errored()]));
  assert.match(md, /haiku \| 100% \(1\/1\) \| 1 /);
  assert.match(md, /Errored calls \(not graded\)[\s\S]*429 Too Many Requests/);
});

test('red team separates model defenses from provider-filter blocks', () => {
  const md = summarize(load('redteam-quick'));
  assert.match(md, /claude-haiku-5\.5 \(small\) \| 138 \| 36 \| 102 \| 0 \| 0 \|/);
  assert.match(md, /claude-sonnet-5\.5 \(medium\) \| 138 \| 64 \| 74 \| 0 \| 0 \|/);
});

test('judge tokens are reported', () => {
  assert.match(summarize(load('eval')), /Judge tokens/);
  const md = summarize(data([row({ gradingResult: { tokensUsed: { prompt: 1000, completion: 1000 } } })]));
  assert.match(md, /\| 2,000 \| \$0\.0120 \|/); // 1k in at $2/M + 1k out at $10/M
});

test('gate passes on the baseline', () => {
  assert.ok(checkGates(load('eval').results.results).every((c) => c.ok));
});

test('gate fails when a gated model has no results', () => {
  const [haiku, sonnet] = checkGates([row()]);
  assert.equal(haiku.ok, true);
  assert.equal(sonnet.ok, false);
});

test('gate fails below the threshold', () => {
  const rows = [row(), row({ success: false, failureReason: 1 })];
  assert.equal(checkGates(rows, [{ match: 'claude-haiku', min: 0.9 }])[0].ok, false);
});

test('gate fails when too many calls errored, even if the rest passed', () => {
  const rows = [row(), row(), errored()];
  const [check] = checkGates(rows, [{ match: 'claude-haiku', min: 0.9 }]);
  assert.equal(check.ok, false);
  assert.match(check.message, /errored/);
});

test('gate tolerates a few errors and scores only graded rows', () => {
  const rows = [...Array.from({ length: 19 }, () => row()), errored()];
  assert.equal(checkGates(rows, [{ match: 'claude-haiku', min: 0.9 }])[0].ok, true);
});
