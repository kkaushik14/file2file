import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionBudget } from '../../src/contracts/connection-budget';

test('one address cannot occupy the service; release is idempotent and other addresses still work', () => {
  const budget = new ConnectionBudget();
  const releases = Array.from({ length: 8 }, () => budget.acquire('a', 0)!);
  assert.ok(releases.every(Boolean));
  assert.equal(budget.acquire('a', 0), undefined);
  assert.ok(budget.acquire('b', 0));
  releases[0]();
  releases[0]();
  assert.ok(budget.acquire('a', 0));
  assert.equal(budget.acquire('a', 0), undefined);
  assert.equal(budget.acquire('a', 60_001), undefined);
});

test('rapid reconnects are limited and expired idle addresses can be reclaimed', () => {
  const budget = new ConnectionBudget();
  for (let i = 0; i < 60; i++) {
    const release = budget.acquire('a', 0);
    assert.ok(release);
    release();
  }
  assert.equal(budget.acquire('a', 59_999), undefined);
  assert.ok(budget.acquire('a', 60_000));
  for (let i = 1; i < 1000; i++) {
    const release = budget.acquire(String(i), 60_000);
    assert.ok(release);
    release();
  }
  assert.equal(budget.acquire('overflow', 60_000), undefined);
  assert.ok(budget.acquire('overflow', 120_000));
});
