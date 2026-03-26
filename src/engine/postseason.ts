/**
 * Postseason bracket engine.
 *
 * 7-seed per conference format:
 *   Wild Card   (Rd 1): seeds 2v7, 3v6, 4v5 — seed 1 gets a bye
 *   Divisional  (Rd 2): 4 teams per conf, highest seed hosts lowest remaining
 *   Conference  (Rd 3): conference championships (IC and SC)
 *   Championship(Rd 4): league title game
 *
 * Public API:
 *   seedPlayoffBracket(league)         → initial bracket from playoff field
 *   advancePlayoffRound(bracket, teamMap) → simulate + advance one round
 */

import {
  type League,
  type PlayoffBracket,
  type PlayoffMatchup,
  type PlayoffSeed,
  type ConferenceName,
} from '../models/League';
import { type Team }             from '../models/Team';
import { type Game, createGame } from '../models/Game';
import { simulateGame }          from './simulateGame';
import { computePlayoffField }   from './standings';

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeMatchup(
  id:           string,
  round:        PlayoffMatchup['round'],
  conference:   ConferenceName | undefined,
  topSeed:      number,
  bottomSeed:   number,
  topTeamId:    string,
  bottomTeamId: string,
): PlayoffMatchup {
  const m: PlayoffMatchup = {
    id, round, topSeed, bottomSeed,
    topSeedId: topTeamId, bottomSeedId: bottomTeamId,
  };
  if (conference !== undefined) m.conference = conference;
  return m;
}

function simulateMatchup(m: PlayoffMatchup, teamMap: Map<string, Team>): PlayoffMatchup {
  if (m.winnerId) return m;                      // already played
  // TODO: assumes both IDs exist in teamMap; a corrupt bracket will crash inside simulateGame
  const home = teamMap.get(m.topSeedId)!;
  const away = teamMap.get(m.bottomSeedId)!;
  const { game } = simulateGame(createGame(`playoff-${m.id}`, 0, home, away));
  // Ties go to the higher seed (top/home team) — no OT in this engine yet.
  const topWon     = game.homeScore >= game.awayScore;
  const winnerId   = topWon ? m.topSeedId   : m.bottomSeedId;
  const winnerSeed = topWon ? m.topSeed      : m.bottomSeed;
  return { ...m, game, winnerId, winnerSeed };
}

// ── Bracket creation ──────────────────────────────────────────────────────────

/**
 * Build the initial playoff bracket from the current league state.
 * Calls computePlayoffField() to get the 14 seeds, then creates wild-card matchups.
 */
export function seedPlayoffBracket(league: League): PlayoffBracket {
  const field  = computePlayoffField(league.currentSeason, league.teams, league.divisions);
  const year   = league.currentSeason.year;

  const seeds: PlayoffSeed[] = [];
  const matchups: PlayoffMatchup[] = [];

  for (const conf of field) {
    // Store all 7 seeds for this conference
    for (const s of conf.seeds) {
      seeds.push({ ...s, conference: conf.conference });
    }

    // Wild card: 2v7, 3v6, 4v5  (seed 1 gets bye)
    const find = (seed: number) => conf.seeds.find(s => s.seed === seed)!;
    for (const [top, bot] of [[2, 7], [3, 6], [4, 5]] as [number, number][]) {
      matchups.push(makeMatchup(
        `${year}-${conf.conference}-wc-${top}v${bot}`,
        'wildcard', conf.conference,
        top, bot,
        find(top).teamId, find(bot).teamId,
      ));
    }
  }

  return { year, currentRound: 'wildcard', seeds, matchups };
}

// ── Round transitions ─────────────────────────────────────────────────────────

function buildDivisionalMatchups(bracket: PlayoffBracket): PlayoffMatchup[] {
  const { year, seeds, matchups } = bracket;
  const newMatchups: PlayoffMatchup[] = [];

  for (const conf of ['IC', 'SC'] as ConferenceName[]) {
    // Wild card winners
    const wcWinners = matchups
      .filter(m => m.round === 'wildcard' && m.conference === conf)
      .map(m => ({ teamId: m.winnerId!, seed: m.winnerSeed! }));

    // Add seed 1 (bye team — never played a WC game)
    const byeEntry = seeds.find(s => s.conference === conf && s.seed === 1)!;

    // All 4 divisional survivors, sorted best→worst (ascending seed number)
    const remaining = [
      { teamId: byeEntry.teamId, seed: 1 },
      ...wcWinners,
    ].sort((a, b) => a.seed - b.seed);

    // Re-seed: best vs worst, second-best vs third
    //   remaining[0] = best seed, remaining[3] = worst
    newMatchups.push(makeMatchup(
      `${year}-${conf}-div-A`,
      'divisional', conf,
      remaining[0]!.seed, remaining[3]!.seed,
      remaining[0]!.teamId, remaining[3]!.teamId,
    ));
    newMatchups.push(makeMatchup(
      `${year}-${conf}-div-B`,
      'divisional', conf,
      remaining[1]!.seed, remaining[2]!.seed,
      remaining[1]!.teamId, remaining[2]!.teamId,
    ));
  }

  return newMatchups;
}

function buildConferenceMatchups(bracket: PlayoffBracket): PlayoffMatchup[] {
  const { year, matchups } = bracket;
  const newMatchups: PlayoffMatchup[] = [];

  for (const conf of ['IC', 'SC'] as ConferenceName[]) {
    const divWinners = matchups
      .filter(m => m.round === 'divisional' && m.conference === conf)
      .map(m => ({ teamId: m.winnerId!, seed: m.winnerSeed! }))
      .sort((a, b) => a.seed - b.seed);   // best seed hosts

    newMatchups.push(makeMatchup(
      `${year}-${conf}-conf`,
      'conference', conf,
      divWinners[0]!.seed, divWinners[1]!.seed,
      divWinners[0]!.teamId, divWinners[1]!.teamId,
    ));
  }

  return newMatchups;
}

function buildChampionshipMatchup(bracket: PlayoffBracket): {
  matchup: PlayoffMatchup;
  icChampionId: string;
  scChampionId: string;
} {
  const { year, seeds, matchups } = bracket;

  const icConf = matchups.find(m => m.round === 'conference' && m.conference === 'IC')!;
  const scConf = matchups.find(m => m.round === 'conference' && m.conference === 'SC')!;

  const icId   = icConf.winnerId!;
  const scId   = scConf.winnerId!;
  const icSeed = icConf.winnerSeed!;
  const scSeed = scConf.winnerSeed!;

  // Lower seed number (better seeding) gets the "home" side of the matchup.
  // If equal, IC champion is top seed (arbitrary tiebreak).
  const icIsTop = icSeed <= scSeed;

  const matchup = makeMatchup(
    `${year}-championship`,
    'championship', undefined,    // no conference — neutral/league game
    icIsTop ? icSeed : scSeed,
    icIsTop ? scSeed : icSeed,
    icIsTop ? icId   : scId,
    icIsTop ? scId   : icId,
  );

  return { matchup, icChampionId: icId, scChampionId: scId };
}

// ── Public advance function ───────────────────────────────────────────────────

/**
 * Simulate all games in the bracket's current round, then create the next
 * round's matchups and advance currentRound.
 *
 * When the championship is complete, currentRound becomes 'complete' and
 * championId / championName are set on the returned bracket.
 *
 * Returns a new PlayoffBracket; does not mutate in place.
 */
export function advancePlayoffRound(
  bracket:  PlayoffBracket,
  teamMap:  Map<string, Team>,
): PlayoffBracket {
  // Guard: callers must check currentRound === 'complete' before calling (server.ts does this).
  if (bracket.currentRound === 'complete') {
    throw new Error('Postseason is already complete.');
  }

  // 1. Simulate all unplayed games in the current round.
  const simMatchups = bracket.matchups.map(m =>
    m.round === bracket.currentRound ? simulateMatchup(m, teamMap) : m,
  );
  const sim = { ...bracket, matchups: simMatchups };

  // 2. Build next round's matchups and advance.
  switch (bracket.currentRound) {
    case 'wildcard': {
      const next = buildDivisionalMatchups(sim);
      return { ...sim, currentRound: 'divisional', matchups: [...simMatchups, ...next] };
    }
    case 'divisional': {
      const next = buildConferenceMatchups(sim);
      return { ...sim, currentRound: 'conference', matchups: [...simMatchups, ...next] };
    }
    case 'conference': {
      const { matchup, icChampionId, scChampionId } = buildChampionshipMatchup(sim);
      return {
        ...sim,
        currentRound: 'championship',
        matchups:     [...simMatchups, matchup],
        icChampionId,
        scChampionId,
      };
    }
    case 'championship': {
      const champMatchup = simMatchups.find(m => m.round === 'championship')!;
      const champId   = champMatchup.winnerId!;
      const champName = teamMap.get(champId)?.name ?? champId;
      return {
        ...sim,
        currentRound: 'complete',
        championId:   champId,
        championName: champName,
      };
    }
    default:
      return sim;
  }
}

// ── Activity message helper ───────────────────────────────────────────────────

const ROUND_LABELS: Record<string, string> = {
  divisional:   'Divisional Round',
  conference:   'Conference Championship',
  championship: 'League Championship',
  complete:     'completion',
};

/**
 * Returns human-readable activity messages for the round that was just played.
 * Call after advancePlayoffRound() with the old bracket and new bracket.
 */
export function getPlayoffActivityMessages(
  prevRound: PlayoffBracket['currentRound'],
  nextBracket: PlayoffBracket,
  teamMap: Map<string, Team>,
): string[] {
  const played = nextBracket.matchups.filter(
    m => m.round === prevRound && m.winnerId,
  );

  if (nextBracket.currentRound === 'complete') {
    const champ = nextBracket.championName ?? 'Unknown';
    return [`${champ} win the ${nextBracket.year} League Championship!`];
  }

  const nextLabel = ROUND_LABELS[nextBracket.currentRound] ?? nextBracket.currentRound;
  return played.map(m => {
    const winner = teamMap.get(m.winnerId!)?.name ?? m.winnerId!;
    return `${winner} advance to the ${nextLabel}`;
  });
}
