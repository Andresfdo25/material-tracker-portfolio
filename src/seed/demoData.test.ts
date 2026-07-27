// demoData.test.ts — the demo database is a deliverable, not a fixture: it is the first
// (and for most visitors the only) thing that runs. These tests pin the two properties
// that make it worth shipping.
//
// 1. COVERAGE. Every status the engine can produce is visible on load. Without this,
//    deleting one seed row quietly empties a tile on the Overview board and nobody
//    notices until somebody is looking at the live demo.
// 2. TIME-INDEPENDENCE. The seed dates are offsets from today, so the semaphore has to
//    look the same whichever day the page is opened. The clock is moved a year forward
//    and the coverage assertion re-run — if a hard-coded date ever creeps back in, the
//    second run drifts and this fails.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDb } from './demoData';
import { closesAtSite, computeItem, DEFAULT_THRESHOLDS, deliveryWatch, isPartiallyInstalled, itemDirty } from '../store/logic';
import type { ItemStatus } from '../store/types';

/** Every status in the seed, computed the way the screens compute it — with each item's
 * package scope injected, since `computeItem` only ever sees the item snapshot. */
function statuses(): Set<ItemStatus> {
  const db = buildDb();
  const pkg = new Map(db.packages.map((p) => [p.id, p]));
  const proj = new Map(db.projects.map((p) => [p.id, p]));
  return new Set(db.items.map((it) => {
    const p = pkg.get(it.wpId)!;
    return computeItem(it, { ...DEFAULT_THRESHOLDS, supplyOnly: closesAtSite(p, proj.get(p.projectId)!) }).status;
  }));
}

const EVERY_STATUS: ItemStatus[] = [
  'order-now', 'order-soon', 'planned', 'needs-data', 'ordered', 'partial', 'delivered', 'on-site', 'installed', 'na',
];

describe('the demo database', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('puts every status on the board', () => {
    expect([...statuses()].sort()).toEqual([...EVERY_STATUS].sort());
  });

  it('still puts every status on the board a year from now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    expect([...statuses()].sort()).toEqual([...EVERY_STATUS].sort());
  });

  it('shows the delivery clock too — one late shipment and one on schedule', () => {
    const db = buildDb();
    const watch = db.items.map((it) => deliveryWatch(it, DEFAULT_THRESHOLDS));
    expect(watch).toContain('late');
    expect(watch).toContain('scheduled');
  });

  it('includes a partially installed item, so the qty chain is visible', () => {
    expect(buildDb().items.some(isPartiallyInstalled)).toBe(true);
  });

  it('leaves exactly one package with unpublished draft changes', () => {
    const db = buildDb();
    const dirty = db.items.filter(itemDirty);
    expect(dirty).toHaveLength(1);
    // Overview and Submittals read the published report, so a dirty item is precisely
    // the state where the two screens disagree — worth having one on screen.
    expect(dirty[0].report).toBeNull();
  });

  it('carries no real vendor or project data — ids are not the app defaults', () => {
    const db = buildDb();
    // 'p1' was the app's hard-coded default activeProjectId, and a seed that matched it
    // once masked a real project-picker bug. Keep the ids distinct.
    expect(db.projects.map((p) => p.id)).not.toContain('p1');
    expect(db.projects).toHaveLength(3);
    expect(db.items.every((it) => it.wpId && it.description)).toBe(true);
  });
});
