/**
 * Legacy scoring — compute Hall of Fame and Ring of Honor tracker values.
 *
 * The scoring system is ERA-RELATIVE: instead of fixed career stat thresholds,
 * players earn points for seasonal league dominance (top-N rankings among
 * contemporaries). This ensures that:
 *   - Initial roster players (shorter careers) aren't penalized
 *   - Generated players aren't advantaged by longer careers
 *   - Stat inflation/deflation across eras is automatically neutralized
 *
 * Scoring categories:
 *   1. Seasonal league rank (era-relative stat dominance)
 *   2. Awards (MVP, All-Pro, etc.)
 *   3. Championships
 *   4. Longevity
 *   5. All-time career rank bonus (smaller complement to seasonal ranks)
 */

import { type LeagueHistory, type LegacyTier, type PlayerSeasonStats, deriveCareerStats } from '../models/History';
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

// Stats tracked for seasonal league rankings, per position group.
// Players earn era-relative points by finishing top-N in these stats each season.
const SEASONAL_RANK_STATS: Record<PosGroup, (keyof PlayerSeasonStats)[]> = {
  QB:  ['passingYards', 'passingTDs'],
  RB:  ['rushingYards', 'rushingTDs'],
  WR:  ['receivingYards', 'receivingTDs'],
  TE:  ['receivingYards', 'receptions'],
  OL:  [],  // no individual stats — rely on awards/longevity
  DL:  ['sacks'],
  LB:  ['tackles', 'sacks'],
  CB:  ['interceptionsCaught'],
  SAF: ['interceptionsCaught'],
  ST:  [],  // no individual stats — rely on awards/longevity
};

// Points awarded for seasonal league rank in a tracked stat
const SEASONAL_RANK_POINTS = {
  top1:  8,
  top3:  5,
  top5:  3,
  top10: 1,
};

// Primary stats used for all-time career rank bonus (smaller complement)
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

// ── Seasonal league rank computation ──────────────────────────────────────────

/**
 * For a given year and stat, rank ALL players in the league that season.
 * Returns the rank (1-based) for the target player, or 0 if not found.
 */
function getSeasonalRank(
  playerId: string,
  year: number,
  stat: keyof PlayerSeasonStats,
  allPlayerHistory: Record<string, PlayerSeasonStats[]>,
): number {
  const entries: { pid: string; val: number }[] = [];
  for (const [pid, seasons] of Object.entries(allPlayerHistory)) {
    const season = seasons.find(s => s.year === year);
    if (!season) continue;
    const val = season[stat];
    if (typeof val === 'number' && val > 0) {
      entries.push({ pid, val });
    }
  }
  entries.sort((a, b) => b.val - a.val);
  const idx = entries.findIndex(e => e.pid === playerId);
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * Compute era-relative seasonal dominance points for a player.
 * For each season they played, check their league rank in position-relevant stats.
 */
function computeSeasonalRankScore(
  playerId: string,
  posGroup: PosGroup,
  seasons: PlayerSeasonStats[],
  allPlayerHistory: Record<string, PlayerSeasonStats[]>,
): number {
  const stats = SEASONAL_RANK_STATS[posGroup];
  if (stats.length === 0) return 0;

  let total = 0;
  for (const season of seasons) {
    for (const stat of stats) {
      const rank = getSeasonalRank(playerId, season.year, stat, allPlayerHistory);
      if (rank === 0) continue;
      if (rank === 1)       total += SEASONAL_RANK_POINTS.top1;
      else if (rank <= 3)   total += SEASONAL_RANK_POINTS.top3;
      else if (rank <= 5)   total += SEASONAL_RANK_POINTS.top5;
      else if (rank <= 10)  total += SEASONAL_RANK_POINTS.top10;
    }
  }
  return total;
}

// ── Core scoring ──────────────────────────────────────────────────────────────

/**
 * Compute the raw legacy score for a player from their career history.
 * Works for both active and retired players.
 *
 * Scoring breakdown:
 *   - Seasonal league ranks (era-relative): 0–80+ pts for dominant careers
 *   - Awards: 0–90+ pts for award winners
 *   - Championships: 0–40+ pts
 *   - Longevity: 0–45 pts for long careers
 *   - All-time career rank: 0–50 pts bonus for career totals
 *   - Small stat contribution: keeps OL/ST positions viable via award path
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

  let score = 0;

  // 1. Era-relative seasonal league rank (primary stat contribution)
  score += computeSeasonalRankScore(playerId, posGroup, seasons, history.playerHistory);

  // 2. Small career stat contribution (keeps OL/ST/edge cases viable)
  // These are intentionally reduced from the old system — seasonal ranks carry most weight
  score += career.passingYards        * w.passingYards * 0.3;
  score += career.passingTDs          * w.passingTDs * 0.3;
  score += career.rushingYards        * w.rushingYards * 0.3;
  score += career.rushingTDs          * w.rushingTDs * 0.3;
  score += career.receivingYards      * w.receivingYards * 0.3;
  score += career.receivingTDs        * w.receivingTDs * 0.3;
  score += career.receptions          * w.receptions * 0.3;
  score += career.sacks               * w.sacks * 0.3;
  score += career.interceptionsCaught * w.interceptionsCaught * 0.3;

  // 3. Longevity
  score += career.seasons * TUNING.hof.longevityPerYear;

  // 4. Awards
  const awardPts = TUNING.hof.awardPoints as unknown as Record<string, number>;
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      score += awardPts[a.type] ?? 0;
    }
  }

  // 5. Championships (player was on the winning team that season)
  for (const s of seasons) {
    if (history.championsByYear[s.year]?.teamId === s.teamId) {
      score += TUNING.hof.championshipBonus;
    }
  }

  // 6. All-time career rank bonus (smaller than before — seasonal ranks are primary)
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
