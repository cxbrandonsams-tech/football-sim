/**
 * Player ratings tests — validates the discipline field fix and
 * ensures all position-specific ratings are properly structured.
 *
 * Note: Backend players have trueRatings only. visibleRatings is a
 * frontend concept (scouted view). These tests use trueRatings.
 */
import { describe, it, expect } from 'vitest';
import { createInitialLeague } from '../src/initialLeague';
import type { Player } from '../src/models/Player';

function getAllPlayers(): Player[] {
  const league = createInitialLeague('test', 'Test', 2025);
  return league.teams.flatMap(t => t.roster);
}

describe('Player ratings structure', () => {
  const players = getAllPlayers();

  it('generates players for all positions', () => {
    const positions = new Set(players.map(p => p.trueRatings.position));
    expect(positions.has('QB')).toBe(true);
    expect(positions.has('RB')).toBe(true);
    expect(positions.has('WR')).toBe(true);
    expect(positions.has('TE')).toBe(true);
    expect(positions.has('K')).toBe(true);
  });

  it('OL players have discipline field (regression test)', () => {
    const olPlayers = players.filter(p =>
      p.trueRatings.position === 'OT' ||
      p.trueRatings.position === 'OG' ||
      p.trueRatings.position === 'C'
    );
    expect(olPlayers.length).toBeGreaterThan(0);
    for (const p of olPlayers) {
      const r = p.trueRatings as { discipline?: number };
      expect(r.discipline).toBeDefined();
      expect(typeof r.discipline).toBe('number');
      expect(r.discipline).toBeGreaterThanOrEqual(1);
      expect(r.discipline).toBeLessThanOrEqual(99);
    }
  });

  it('LB players have discipline field (regression test)', () => {
    const lbPlayers = players.filter(p =>
      p.trueRatings.position === 'OLB' ||
      p.trueRatings.position === 'MLB'
    );
    expect(lbPlayers.length).toBeGreaterThan(0);
    for (const p of lbPlayers) {
      const r = p.trueRatings as { discipline?: number };
      expect(r.discipline).toBeDefined();
      expect(typeof r.discipline).toBe('number');
    }
  });

  it('CB players have discipline field (regression test)', () => {
    const cbPlayers = players.filter(p => p.trueRatings.position === 'CB');
    expect(cbPlayers.length).toBeGreaterThan(0);
    for (const p of cbPlayers) {
      const r = p.trueRatings as { discipline?: number };
      expect(r.discipline).toBeDefined();
      expect(typeof r.discipline).toBe('number');
    }
  });

  it('Safety players have discipline field (regression test)', () => {
    const safetyPlayers = players.filter(p =>
      p.trueRatings.position === 'FS' ||
      p.trueRatings.position === 'SS'
    );
    expect(safetyPlayers.length).toBeGreaterThan(0);
    for (const p of safetyPlayers) {
      const r = p.trueRatings as { discipline?: number };
      expect(r.discipline).toBeDefined();
      expect(typeof r.discipline).toBe('number');
    }
  });

  it('DL players have discipline field', () => {
    const dlPlayers = players.filter(p =>
      p.trueRatings.position === 'DE' ||
      p.trueRatings.position === 'DT'
    );
    expect(dlPlayers.length).toBeGreaterThan(0);
    for (const p of dlPlayers) {
      const r = p.trueRatings as { discipline?: number };
      expect(r.discipline).toBeDefined();
    }
  });

  it('all player overalls are in valid range (30-99)', () => {
    for (const p of players) {
      expect(p.overall).toBeGreaterThanOrEqual(30);
      expect(p.overall).toBeLessThanOrEqual(99);
    }
  });

  it('QB ratings have all required fields', () => {
    const qbs = players.filter(p => p.trueRatings.position === 'QB');
    expect(qbs.length).toBeGreaterThan(0);
    for (const p of qbs) {
      const r = p.trueRatings as Record<string, unknown>;
      expect(r.armStrength).toBeDefined();
      expect(r.shortAccuracy).toBeDefined();
      expect(r.mediumAccuracy).toBeDefined();
      expect(r.deepAccuracy).toBeDefined();
      expect(r.decisionMaking).toBeDefined();
    }
  });
});
