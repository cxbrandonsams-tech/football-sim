import { type Player, type Position } from './Player';

export type DepthChartSlot = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DE' | 'DT' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export type DepthChart = Record<DepthChartSlot, (Player | null)[]>;

export const STARTER_COUNTS: Record<DepthChartSlot, number> = {
  QB: 1, RB: 1, WR: 2, TE: 1, OL: 5,
  DE: 2, DT: 2, LB: 2, CB: 2, S: 2,
  K: 1, P: 1,
};

const SLOT_POSITIONS: Record<DepthChartSlot, Position[]> = {
  QB:  ['QB'],
  RB:  ['RB'],
  WR:  ['WR'],
  TE:  ['TE'],
  OL:  ['OT', 'OG', 'C'],
  DE:  ['DE'],
  DT:  ['DT'],
  LB:  ['OLB', 'MLB'],
  CB:  ['CB'],
  S:   ['FS', 'SS'],
  K:   ['K'],
  P:   ['P'],
};

export function buildDepthChart(roster: Player[], useScouted = false): DepthChart {
  const chart = {} as DepthChart;
  for (const slot of Object.keys(STARTER_COUNTS) as DepthChartSlot[]) {
    const eligible = roster
      .filter(p => SLOT_POSITIONS[slot].includes(p.position))
      .sort((a, b) => useScouted
        ? b.scoutedOverall - a.scoutedOverall
        : b.overall - a.overall
      );
    chart[slot] = Array.from({ length: STARTER_COUNTS[slot] }, (_, i) => eligible[i] ?? null);
  }
  return chart;
}

export function getStarters(depthChart: DepthChart): Player[] {
  return Object.values(depthChart).flat().filter((p): p is Player => p !== null);
}
