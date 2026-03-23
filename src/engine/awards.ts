/**
 * Season awards computation.
 *
 * Called after the regular season ends, before postseason begins.
 * Uses regular-season stats only (league.currentSeasonStats or explicit stats arg).
 *
 * Awards computed:
 *   MVP, OPOY, DPOY, OROY, DROY, Coach_of_Year, Comeback_Player
 *   1st Team All-Pro, 2nd Team All-Pro
 */

import { type League }         from '../models/League';
import {
  type PlayerSeasonStats,
  type SeasonAwards,
  type AwardRecord,
}                              from '../models/History';
import { buildTeamSeasonLines } from './seasonStats';
import { TUNING }              from './config';

// ── Player metadata ───────────────────────────────────────────────────────────

interface PlayerMeta {
  id:       string;
  name:     string;
  teamId:   string;
  position: string;
  age:      number;
  overall:  number; // true overall — used as baseline for non-stat positions
}

function buildPlayerMeta(league: League): Map<string, PlayerMeta> {
  const map = new Map<string, PlayerMeta>();
  for (const team of league.teams) {
    for (const p of team.roster) {
      map.set(p.id, {
        id:       p.id,
        name:     p.name,
        teamId:   team.id,
        position: p.position,
        age:      p.age,
        overall:  p.overall,
      });
    }
  }
  return map;
}

// ── Position sets ─────────────────────────────────────────────────────────────

const OFFENSE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C']);
const DEFENSE_POSITIONS = new Set(['DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS']);
const SKILL_POSITIONS   = new Set(['RB', 'WR', 'TE']);

// ── Shared score helpers ──────────────────────────────────────────────────────

function offensiveScore(
  s: PlayerSeasonStats,
  cfg: typeof TUNING.awards.opoy,
): number {
  return (
    s.passingYards   * cfg.passingYardsScale
    + s.passingTDs   * cfg.passingTDBonus
    - s.interceptions * cfg.intPenalty
    + s.rushingYards  * cfg.rushingYardsScale
    + s.rushingTDs    * cfg.rushingTDBonus
    + s.receivingYards * cfg.receivingYardsScale
    + s.receivingTDs   * cfg.receivingTDBonus
  );
}

function defensiveScore(
  s: PlayerSeasonStats,
  m: PlayerMeta,
  cfg: typeof TUNING.awards.dpoy,
): number {
  return s.sacks * cfg.sackBonus
       + s.interceptionsCaught * cfg.intCaughtBonus
       + m.overall * cfg.overallScale;
}

// ── Production score (used for Comeback Player) ───────────────────────────────
// A single number capturing overall contribution regardless of position.

function productionScore(s: PlayerSeasonStats): number {
  return s.passingYards + s.rushingYards + s.receivingYards
       + (s.passingTDs + s.rushingTDs + s.receivingTDs) * 20
       + (s.sacks + s.interceptionsCaught) * 30;
}

// ── MVP ───────────────────────────────────────────────────────────────────────

function computeMVP(
  stats: Record<string, PlayerSeasonStats>,
  teamWins: Record<string, number>,
  meta: Map<string, PlayerMeta>,
): AwardRecord | undefined {
  const cfg = TUNING.awards.mvp;
  const min = TUNING.awards.minGamesPlayed;
  let best: { score: number; id: string } | undefined;

  for (const [id, s] of Object.entries(stats)) {
    const m = meta.get(id);
    if (!m || !OFFENSE_POSITIONS.has(m.position)) continue;
    if (s.gamesPlayed < min) continue;

    const wins = teamWins[m.teamId] ?? 0;
    let score =
      s.passingYards  * cfg.passingYardsScale
      + s.passingTDs  * cfg.passingTDBonus
      - s.interceptions * cfg.intPenalty
      + s.rushingYards  * cfg.rushingYardsScale
      + s.rushingTDs    * cfg.rushingTDBonus
      - s.sacksAllowed  * cfg.sackAllowedPenalty
      + wins            * cfg.teamWinBonus;

    if (m.position !== 'QB') score *= cfg.nonQBMultiplier;
    if (!best || score > best.score) best = { score, id };
  }

  if (!best) return undefined;
  const m = meta.get(best.id)!;
  return { type: 'MVP', year: 0, playerId: m.id, playerName: m.name, teamId: m.teamId };
}

// ── Offensive Player of the Year ──────────────────────────────────────────────

function computeOPOY(
  stats: Record<string, PlayerSeasonStats>,
  meta: Map<string, PlayerMeta>,
  excludeId?: string,
): AwardRecord | undefined {
  const cfg = TUNING.awards.opoy;
  const min = TUNING.awards.minGamesPlayed;
  let best: { score: number; id: string } | undefined;

  for (const [id, s] of Object.entries(stats)) {
    const m = meta.get(id);
    if (!m || !OFFENSE_POSITIONS.has(m.position)) continue;
    // OL positions have no tracked stats — skip for offensive award
    if (m.position === 'OT' || m.position === 'OG' || m.position === 'C') continue;
    if (s.gamesPlayed < min) continue;
    if (id === excludeId) continue;

    let score = offensiveScore(s, cfg);
    if (SKILL_POSITIONS.has(m.position)) score *= cfg.skillPositionMult;
    if (!best || score > best.score) best = { score, id };
  }

  if (!best) return undefined;
  const m = meta.get(best.id)!;
  return { type: 'OPOY', year: 0, playerId: m.id, playerName: m.name, teamId: m.teamId };
}

// ── Defensive Player of the Year ──────────────────────────────────────────────

function computeDPOY(
  stats: Record<string, PlayerSeasonStats>,
  meta: Map<string, PlayerMeta>,
): AwardRecord | undefined {
  const cfg = TUNING.awards.dpoy;
  const min = TUNING.awards.minGamesPlayed;
  let best: { score: number; id: string } | undefined;

  for (const [id, s] of Object.entries(stats)) {
    const m = meta.get(id);
    if (!m || !DEFENSE_POSITIONS.has(m.position)) continue;
    if (s.gamesPlayed < min) continue;

    const score = defensiveScore(s, m, cfg);
    if (!best || score > best.score) best = { score, id };
  }

  if (!best) return undefined;
  const m = meta.get(best.id)!;
  return { type: 'DPOY', year: 0, playerId: m.id, playerName: m.name, teamId: m.teamId };
}

// ── Rookie of the Year (offensive / defensive) ────────────────────────────────

function computeROY(
  stats: Record<string, PlayerSeasonStats>,
  meta: Map<string, PlayerMeta>,
  isOffense: boolean,
): AwardRecord | undefined {
  const type     = isOffense ? ('OROY' as const) : ('DROY' as const);
  const validPos = isOffense ? OFFENSE_POSITIONS : DEFENSE_POSITIONS;
  const ocfg     = TUNING.awards.opoy;
  const dcfg     = TUNING.awards.dpoy;
  const maxAge   = TUNING.awards.rookieMaxAge;
  let best: { score: number; id: string } | undefined;

  for (const [id, s] of Object.entries(stats)) {
    const m = meta.get(id);
    if (!m || !validPos.has(m.position)) continue;
    if (m.age > maxAge) continue;
    if (s.gamesPlayed < 5) continue; // lower bar for rookies

    let score: number;
    if (isOffense) {
      if (m.position === 'OT' || m.position === 'OG' || m.position === 'C') {
        score = m.overall; // OL — use rating
      } else {
        score = offensiveScore(s, ocfg);
        if (SKILL_POSITIONS.has(m.position)) score *= ocfg.skillPositionMult;
      }
    } else {
      score = defensiveScore(s, m, dcfg);
    }

    if (!best || score > best.score) best = { score, id };
  }

  if (!best) return undefined;
  const m = meta.get(best.id)!;
  return { type, year: 0, playerId: m.id, playerName: m.name, teamId: m.teamId };
}

// ── Coach of the Year ─────────────────────────────────────────────────────────

function computeCoachOfYear(
  league: League,
  teamWins: Record<string, number>,
  madePlayoffs: Set<string>,
): AwardRecord | undefined {
  const cfg = TUNING.awards.coy;
  const prevTeamHistory = league.history.teamHistory;
  let best: { score: number; teamId: string } | undefined;

  for (const team of league.teams) {
    const wins = teamWins[team.id] ?? 0;
    const prev = prevTeamHistory[team.id];
    const improvement = prev && prev.length > 0
      ? wins - prev[prev.length - 1]!.wins
      : 0; // no improvement bonus for first season

    const score =
      wins        * cfg.winScale
      + improvement * cfg.improvementScale
      + (madePlayoffs.has(team.id) ? cfg.playoffBonus : 0);

    if (!best || score > best.score) best = { score, teamId: team.id };
  }

  if (!best) return undefined;
  const team = league.teams.find(t => t.id === best!.teamId)!;
  return {
    type:      'Coach_of_Year',
    year:      0,
    coachId:   team.coaches.hc.id,
    coachName: team.coaches.hc.name,
    teamId:    team.id,
    teamName:  team.name,
  };
}

// ── Comeback Player of the Year ───────────────────────────────────────────────

function computeComebackPlayer(
  stats: Record<string, PlayerSeasonStats>,
  meta: Map<string, PlayerMeta>,
  prevHistory: Record<string, PlayerSeasonStats[]>,
): AwardRecord | undefined {
  const cfg = TUNING.awards.comeback;
  let best: { score: number; id: string } | undefined;

  for (const [id, s] of Object.entries(stats)) {
    const m = meta.get(id);
    if (!m) continue;

    const currentProd = productionScore(s);
    if (currentProd < cfg.minCurrentProduction) continue;

    // Must have a prior season on record
    const priorSeasons = prevHistory[id];
    if (!priorSeasons || priorSeasons.length === 0) continue;
    const prior = priorSeasons[priorSeasons.length - 1]!;

    const priorProd = productionScore(prior);
    if (priorProd >= currentProd) continue; // must be better than prior year

    let score = currentProd - priorProd;
    if (priorProd < cfg.lowPriorThreshold) score += cfg.lowPriorBonus;

    if (!best || score > best.score) best = { score, id };
  }

  if (!best) return undefined;
  const m = meta.get(best.id)!;
  return {
    type:       'Comeback_Player',
    year:       0,
    playerId:   m.id,
    playerName: m.name,
    teamId:     m.teamId,
  };
}

// ── All-Pro teams ─────────────────────────────────────────────────────────────

/**
 * Position groups and slot counts for the All-Pro ballot.
 * Each entry: [groupLabel, slotsPerTeam, positions_that_qualify]
 */
const ALL_PRO_SLOTS: ReadonlyArray<readonly [string, number, readonly string[]]> = [
  ['QB',  1, ['QB']],
  ['RB',  2, ['RB']],
  ['WR',  2, ['WR']],
  ['TE',  1, ['TE']],
  ['OT',  2, ['OT']],
  ['OG',  2, ['OG']],
  ['C',   1, ['C']],
  ['DE',  2, ['DE']],
  ['DT',  2, ['DT']],
  ['LB',  2, ['OLB', 'MLB']],
  ['CB',  2, ['CB']],
  ['S',   2, ['FS', 'SS']],
] as const;

function allProScore(
  group: string,
  s: PlayerSeasonStats | undefined,
  m: PlayerMeta,
): number {
  // OL: no blocking stats tracked — use player overall as proxy
  if (group === 'OT' || group === 'OG' || group === 'C') return m.overall;

  if (!s) return m.overall * 0.5;

  switch (group) {
    case 'QB':
      return s.passingYards * 0.04 + s.passingTDs * 6
           - s.interceptions * 4 - s.sacksAllowed * 0.3;
    case 'RB':
      return s.rushingYards * 0.10 + s.rushingTDs * 6
           + s.receivingYards * 0.05 + s.receptions * 0.3;
    case 'WR':
    case 'TE':
      return s.receivingYards * 0.10 + s.receivingTDs * 6 + s.receptions * 0.5;
    case 'DE':
      return s.sacks * 8 + m.overall * 0.2;
    case 'DT':
      return s.sacks * 5 + m.overall * 0.3;
    case 'LB':
      return s.sacks * 5 + s.interceptionsCaught * 7 + m.overall * 0.2;
    case 'CB':
      return s.interceptionsCaught * 8 + m.overall * 0.3;
    case 'S':
      return s.interceptionsCaught * 7 + m.overall * 0.3;
    default:
      return 0;
  }
}

function computeAllPro(
  stats: Record<string, PlayerSeasonStats>,
  meta: Map<string, PlayerMeta>,
  year: number,
): AwardRecord[] {
  const awards: AwardRecord[] = [];

  for (const [group, count, positions] of ALL_PRO_SLOTS) {
    const posSet = new Set(positions as string[]);
    const candidates: Array<{ id: string; score: number }> = [];

    for (const [id, m] of meta) {
      if (!posSet.has(m.position)) continue;
      candidates.push({ id, score: allProScore(group, stats[id], m) });
    }

    candidates.sort((a, b) => b.score - a.score);

    const first  = candidates.slice(0, count);
    const second = candidates.slice(count, count * 2);

    for (const c of first) {
      const m = meta.get(c.id)!;
      awards.push({
        type: 'AllPro1', year,
        playerId: m.id, playerName: m.name, teamId: m.teamId, position: group,
      });
    }
    for (const c of second) {
      const m = meta.get(c.id)!;
      awards.push({
        type: 'AllPro2', year,
        playerId: m.id, playerName: m.name, teamId: m.teamId, position: group,
      });
    }
  }

  return awards;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute all end-of-season awards from the completed regular season.
 *
 * @param league  League state after regular season, with playoff bracket seeded
 *                (matchups present but games not yet played).
 * @param stats   Regular-season player stats (e.g. buildSeasonStats output).
 */
export function computeSeasonAwards(
  league:  League,
  stats:   Record<string, PlayerSeasonStats>,
): SeasonAwards {
  const year = league.currentSeason.year;
  const meta = buildPlayerMeta(league);

  // Team win totals from regular-season games
  const teamLines  = buildTeamSeasonLines(league.currentSeason, league.teams);
  const teamWins: Record<string, number> = {};
  for (const line of Object.values(teamLines)) teamWins[line.teamId] = line.wins;

  // Playoff entrants (bracket seeded but not yet played)
  const madePlayoffs = new Set<string>();
  if (league.playoff) {
    for (const m of league.playoff.matchups) {
      madePlayoffs.add(m.topSeedId);
      madePlayoffs.add(m.bottomSeedId);
    }
  }

  const awards: AwardRecord[] = [];

  // ── Individual awards ──────────────────────────────────────────────────────
  const mvp = computeMVP(stats, teamWins, meta);
  if (mvp) { mvp.year = year; awards.push(mvp); }

  // OPOY: MVP winner ineligible (avoids same player sweeping both)
  const opoy = computeOPOY(stats, meta, mvp?.playerId);
  if (opoy) { opoy.year = year; awards.push(opoy); }

  const dpoy = computeDPOY(stats, meta);
  if (dpoy) { dpoy.year = year; awards.push(dpoy); }

  const oroy = computeROY(stats, meta, true);
  if (oroy) { oroy.year = year; awards.push(oroy); }

  const droy = computeROY(stats, meta, false);
  if (droy) { droy.year = year; awards.push(droy); }

  const coy = computeCoachOfYear(league, teamWins, madePlayoffs);
  if (coy) { coy.year = year; awards.push(coy); }

  const comeback = computeComebackPlayer(stats, meta, league.history.playerHistory);
  if (comeback) { comeback.year = year; awards.push(comeback); }

  // ── All-Pro teams ──────────────────────────────────────────────────────────
  awards.push(...computeAllPro(stats, meta, year));

  return { year, awards };
}
