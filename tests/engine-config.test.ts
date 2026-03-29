/**
 * Engine config tests — validates that TUNING constants are in expected
 * ranges and the config structure is intact. Does NOT tune values.
 */
import { describe, it, expect } from 'vitest';
import { TUNING } from '../src/engine/config';

describe('TUNING config integrity', () => {
  it('has pass configuration', () => {
    expect(TUNING.pass).toBeDefined();
    expect(TUNING.pass.window).toBeDefined();
  });

  it('has run configuration', () => {
    expect(TUNING.run).toBeDefined();
  });

  it('has clock configuration', () => {
    expect(TUNING.clock).toBeDefined();
    expect(TUNING.clock.secondsPerQuarter).toBeGreaterThan(0);
  });

  it('has red zone configuration (yardLine 80 = opponent 20)', () => {
    expect(TUNING.redZone).toBeDefined();
    expect(TUNING.redZone.yardLine).toBe(80); // 100 - 80 = opponent's 20
  });

  it('has pass window thresholds', () => {
    const w = TUNING.pass.window;
    expect(w.openThreshold).toBeDefined();
    expect(w.softOpenThreshold).toBeDefined();
    expect(w.tightThreshold).toBeDefined();
    expect(w.contestedThreshold).toBeDefined();
  });

  it('has fatigue configuration', () => {
    expect(TUNING.fatigue).toBeDefined();
    expect(TUNING.fatigue.effectivenessPenalty).toBeGreaterThan(0);
  });

  it('field goal base chance is valid (0-1 range)', () => {
    expect(TUNING.fieldGoal).toBeDefined();
    expect(TUNING.fieldGoal.baseChance).toBeGreaterThan(0);
    expect(TUNING.fieldGoal.baseChance).toBeLessThanOrEqual(1);
  });

  it('punt configuration is valid', () => {
    expect(TUNING.punt).toBeDefined();
    expect(TUNING.punt.minYards).toBeGreaterThan(0);
    expect(TUNING.punt.maxYards).toBeGreaterThan(TUNING.punt.minYards);
  });
});
