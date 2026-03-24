/**
 * Legacy scoring — compute Hall of Fame tracker values for any player.
 * Used both for induction eligibility and for the in-game HoF meter.
 */

import { type LeagueHistory, type LegacyTier, deriveCareerStats } from '../models/History';
import { TUNING } from './config';

// ── Position group ────────────────────────────────────────────────────────────

type PosGroup = keyof typeof TUNING.hof.statWeights;

export function getPositionGroup(position: string): PosGroup {
  switch (position) {
    case 'QB':                       return 'QB';
    case 'RB':                       return 'RB';
    case 'WR':                       return 'WR';
    case 'TE':                       return 'TE';
    case 'OT': case 'OG': case 'C': return 'OL';
    case 'DE': case 'DT':            return 'DL';
    case 'OLB': case 'MLB':          return 'LB';
    case 'CB':                       return 'CB';
    case 'FS': case 'SS':            return 'SAF';
    default:                         return 'ST';
  }
}

// Primary stats used for all-time rank bonus, per position group
const PRIMARY_STATS: Record<PosGroup, string[]> = {
  QB:  ['passingYards', 'passingTDs'],
  RB:  ['rushingYards', 'rushingTDs'],
  WR:  ['receivingYards', 'receivingTDs'],
  TE:  ['receivingYards', 'receivingTDs'],
  OL:  [],
  DL:  ['sacks'],
  LB:  ['sacks', 'interceptionsCaught'],
  CB:  ['interceptionsCaught'],
  SAF: ['interceptionsCaught'],
  ST:  [],
};

// ── Core scoring ──────────────────────────────────────────────────────────────

/**
 * Compute the raw legacy score for a player from their career history.
 * Works for both active and retired players.
 */
export function computeLegacyScore(
  playerId: string,
  position: string,
  history:  LeagueHistory,
): number {
  const seasons = history.playerHistory[playerId];
  if (!seasons || seasons.length === 0) return 0;

  const career   = deriveCareerStats(seasons);
  const posGroup = getPositionGroup(position);
  const w        = TUNING.hof.statWeights[posGroup];

  // 1. Career stat contribution (position-weighted)
  let score = 0;
  score += career.passingYards        * w.passingYards;
  score += career.passingTDs          * w.passingTDs;
  score += career.rushingYards        * w.rushingYards;
  score += career.rushingTDs          * w.rushingTDs;
  score += career.receivingYards      * w.receivingYards;
  score += career.receivingTDs        * w.receivingTDs;
  score += career.receptions          * w.receptions;
  score += career.sacks               * w.sacks;
  score += career.interceptionsCaught * w.interceptionsCaught;

  // 2. Longevity
  score += career.seasons * TUNING.hof.longevityPerYear;

  // 3. Awards
  const awardPts = TUNING.hof.awardPoints as unknown as Record<string, number>;
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      score += awardPts[a.type] ?? 0;
    }
  }

  // 4. Championships (player was on the winning team that season)
  for (const s of seasons) {
    if (history.championsByYear[s.year]?.teamId === s.teamId) {
      score += TUNING.hof.championshipBonus;
    }
  }

  // 5. All-time rank bonus
  const primStats = PRIMARY_STATS[posGroup];
  for (const stat of primStats) {
    const leaders = Object.entries(history.playerHistory)
      .map(([pid, pSeasons]) => ({
        playerId: pid,
        total: pSeasons.reduce((sum, s) => sum + ((s as unknown as Record<string, number>)[stat] ?? 0), 0),
      }))
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total);

    const rank = leaders.findIndex(e => e.playerId === playerId) + 1;
    if (rank <= 0) continue;
    if (rank <= 3)       score += TUNING.hof.rankBonus.top3;
    else if (rank <= 5)  score += TUNING.hof.rankBonus.top5;
    else if (rank <= 10) score += TUNING.hof.rankBonus.top10;
  }

  return Math.round(score);
}

// ── Tier + label ──────────────────────────────────────────────────────────────

export function computeLegacyTier(score: number): LegacyTier {
  const t = TUNING.hof.tierThresholds;
  if (score >= t.hall_of_famer) return 'hall_of_famer';
  if (score >= t.likely)        return 'likely';
  if (score >= t.strong)        return 'strong';
  if (score >= t.building)      return 'building';
  if (score >= t.outside_shot)  return 'outside_shot';
  return 'none';
}

export function getLegacyLabel(tier: LegacyTier): string {
  switch (tier) {
    case 'hall_of_famer': return 'Hall of Famer';
    case 'likely':        return 'Likely Hall of Famer';
    case 'strong':        return 'Strong Candidate';
    case 'building':      return 'Building a Case';
    case 'outside_shot':  return 'Outside Shot';
    default:              return 'No Case';
  }
}
