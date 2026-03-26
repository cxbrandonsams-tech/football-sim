import { type Team } from '../models/Team';
import { type PlayEvent } from '../models/PlayEvent';

// ── Per-player game stat line ─────────────────────────────────────────────────

export interface PlayerGameStats {
  playerId:           string;
  name:               string;   // denormalized for display
  teamId:             string;
  // Passing
  completions:        number;
  attempts:           number;
  passingYards:       number;
  passingTDs:         number;
  interceptions:      number;   // thrown
  sacksAllowed:       number;   // sacks taken (charged to QB)
  // Rushing
  carries:            number;
  rushingYards:       number;
  rushingTDs:         number;
  // Receiving
  targets:            number;
  receptions:         number;
  receivingYards:     number;
  receivingTDs:       number;
  // Defense
  sacks:              number;   // sacks recorded
  interceptionsCaught: number;  // INTs recorded
  tackles:            number;   // solo tackles (run stops, non-TD)
}

// ── Per-team game stat line ───────────────────────────────────────────────────

export interface TeamGameStats {
  teamId:          string;
  score:           number;
  pointsByQuarter: [number, number, number, number];
  totalYards:      number;
  rushingYards:    number;
  passingYards:    number;
  firstDowns:      number;
  turnovers:       number;
  sacksAllowed:    number;
}

// ── Scoring summary ───────────────────────────────────────────────────────────

export interface ScoringPlay {
  quarter:    number;
  teamId:     string;
  type:       'touchdown_run' | 'touchdown_pass' | 'touchdown_return' | 'field_goal';
  /** playerId of the ball carrier (RB/QB on runs; receiver on passing TDs; kicker on FGs) */
  scorerId:   string;
  /** playerId of the QB on passing TDs */
  assistId?:  string;
  yards:      number;
  /** Running score after this play */
  homeScore:  number;
  awayScore:  number;
  /** Index of the source PlayEvent in the game's events[] array */
  eventIndex: number;
}

// ── Box score ─────────────────────────────────────────────────────────────────

export interface GameBoxScore {
  home:         TeamGameStats;
  away:         TeamGameStats;
  /** Keyed by player.id */
  players:      Record<string, PlayerGameStats>;
  scoringPlays: ScoringPlay[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyPlayerStats(playerId: string, name: string, teamId: string): PlayerGameStats {
  return {
    playerId, name, teamId,
    completions: 0, attempts: 0, passingYards: 0, passingTDs: 0,
    interceptions: 0, sacksAllowed: 0,
    carries: 0, rushingYards: 0, rushingTDs: 0,
    targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    sacks: 0, interceptionsCaught: 0,
    tackles: 0,
  };
}

function emptyTeamStats(teamId: string, score: number): TeamGameStats {
  return {
    teamId, score,
    pointsByQuarter: [0, 0, 0, 0],
    totalYards: 0, rushingYards: 0, passingYards: 0,
    firstDowns: 0, turnovers: 0, sacksAllowed: 0,
  };
}

type PlayerLookup = Map<string, { name: string; teamId: string }>;

function buildPlayerLookup(home: Team, away: Team): PlayerLookup {
  const map: PlayerLookup = new Map();
  for (const team of [home, away]) {
    for (const p of team.roster) {
      map.set(p.id, { name: p.name, teamId: team.id });
    }
  }
  return map;
}

/**
 * Fallback: resolve a player ID from a last-name string when ballCarrierId
 * was not set (pre-Phase-2 events). Returns undefined if no unique match.
 */
function resolveByLastName(
  lastName: string | undefined,
  home: Team,
  away: Team,
): { id: string; name: string; teamId: string } | undefined {
  if (!lastName) return undefined;
  for (const team of [home, away]) {
    for (const p of team.roster) {
      const parts = p.name.split(' ');
      if (parts[parts.length - 1] === lastName) {
        return { id: p.id, name: p.name, teamId: team.id };
      }
    }
  }
  return undefined;
}

// ── Tackle attribution helpers ────────────────────────────────────────────────

type DefGroup = 'LB' | 'DL' | 'DB';

interface DefenderEntry { id: string; group: DefGroup }

/**
 * Build a pool of defensive starters eligible for tackle credit.
 * Uses depth chart starters only (DE, DT, LB, CB, S).
 */
function buildDefPool(team: Team): DefenderEntry[] {
  const pool: DefenderEntry[] = [];
  const dc = team.depthChart;
  if (!dc) return pool;
  for (const p of [...(dc.LB ?? [])]) {
    if (p) pool.push({ id: p.id, group: 'LB' });
  }
  for (const p of [...(dc.DE ?? []), ...(dc.DT ?? [])]) {
    if (p) pool.push({ id: p.id, group: 'DL' });
  }
  for (const p of [...(dc.CB ?? []), ...(dc.S ?? [])]) {
    if (p) pool.push({ id: p.id, group: 'DB' });
  }
  return pool;
}

/**
 * Select one defender from the pool using weighted position groups:
 * LB 50%, DL 30%, DB 20%. Falls back to any defender if the rolled group is empty.
 */
function pickDefender(pool: DefenderEntry[]): string | undefined {
  if (pool.length === 0) return undefined;
  const r = Math.random();
  const targetGroup: DefGroup = r < 0.50 ? 'LB' : r < 0.80 ? 'DL' : 'DB';
  const group = pool.filter(p => p.group === targetGroup);
  const candidates = group.length > 0 ? group : pool;
  return candidates[Math.floor(Math.random() * candidates.length)]!.id;
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a structured box score from a completed game's events.
 * Uses ballCarrierId/targetId/defPlayerId when present; falls back to
 * last-name roster lookup for pre-Phase-2 events.
 */
export function buildBoxScore(home: Team, away: Team, events: PlayEvent[]): GameBoxScore {
  const homeStats = emptyTeamStats(home.id, 0);  // scores filled below
  const awayStats = emptyTeamStats(away.id, 0);
  const players: Record<string, PlayerGameStats> = {};
  const lookup = buildPlayerLookup(home, away);
  const scoringPlays: ScoringPlay[] = [];

  // Running score totals used to stamp each scoring play
  let homeRunning = 0;
  let awayRunning = 0;

  // Defensive starter pools for tackle attribution (keyed by teamId)
  const defPools: Record<string, DefenderEntry[]> = {
    [home.id]: buildDefPool(home),
    [away.id]: buildDefPool(away),
  };

  const teamStats = (teamId: string) => teamId === home.id ? homeStats : awayStats;

  /** Get or create a PlayerGameStats entry by player ID. */
  const pStats = (id: string): PlayerGameStats => {
    if (!players[id]) {
      const info = lookup.get(id);
      players[id] = emptyPlayerStats(id, info?.name ?? '?', info?.teamId ?? '?');
    }
    return players[id]!;
  };

  /** Resolve ball-carrier: prefer ID, fall back to last-name lookup. */
  const resolveBallCarrier = (ev: PlayEvent) => {
    if (ev.ballCarrierId) return ev.ballCarrierId;
    const found = resolveByLastName(ev.ballCarrier, home, away);
    return found?.id;
  };

  /** Resolve receiver: prefer ID, fall back to last-name lookup. */
  const resolveTarget = (ev: PlayEvent) => {
    if (ev.targetId) return ev.targetId;
    const found = resolveByLastName(ev.target, home, away);
    return found?.id;
  };

  /** Quarter index (0-based, capped at 3 for overtime). */
  const qi = (q: number): 0 | 1 | 2 | 3 =>
    (Math.min(q, 4) - 1) as 0 | 1 | 2 | 3;

  for (let evIdx = 0; evIdx < events.length; evIdx++) {
    const ev  = events[evIdx]!;
    const off = teamStats(ev.offenseTeamId);
    const q   = qi(ev.quarter);

    const isRun         = ev.type === 'inside_run' || ev.type === 'outside_run';
    // GDD: QB scramble — mobility-enabled escape from pressure; counts as QB rushing
    const isScramble    = ev.type === 'scramble';
    const isPassType    = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
    const isPassAttempt = isPassType || ev.type === 'interception';
    const caught        = ev.result === 'success' || ev.result === 'touchdown';
    const isTD          = ev.result === 'touchdown';

    // ── Scoring ──────────────────────────────────────────────────────────
    if (isTD) {
      off.pointsByQuarter[q] += 7;
      if (ev.offenseTeamId === home.id) homeRunning += 7;
      else                              awayRunning += 7;

      let spType: ScoringPlay['type'];
      let scorerId: string | undefined;
      let assistId: string | undefined;

      if (isRun || isScramble) {
        spType   = 'touchdown_run';
        scorerId = resolveBallCarrier(ev);
      } else if (isPassType) {
        spType   = 'touchdown_pass';
        scorerId = resolveTarget(ev);
        assistId = resolveBallCarrier(ev);
      } else {
        spType   = 'touchdown_run';  // fumble return or other edge case
        scorerId = resolveBallCarrier(ev);
      }

      if (scorerId) {
        scoringPlays.push({
          quarter: ev.quarter,
          teamId:  ev.offenseTeamId,
          type:    spType,
          scorerId,
          ...(assistId !== undefined ? { assistId } : {}),
          yards:      ev.yards,
          homeScore:  homeRunning,
          awayScore:  awayRunning,
          eventIndex: evIdx,
        });
      }
    }

    if (ev.result === 'field_goal_good') {
      off.pointsByQuarter[q] += 3;
      if (ev.offenseTeamId === home.id) homeRunning += 3;
      else                              awayRunning += 3;

      const kId = resolveBallCarrier(ev);
      if (kId) {
        scoringPlays.push({
          quarter:    ev.quarter,
          teamId:     ev.offenseTeamId,
          type:       'field_goal',
          scorerId:   kId,
          yards:      (100 - ev.yardLine) + 17,  // actual kick distance
          homeScore:  homeRunning,
          awayScore:  awayRunning,
          eventIndex: evIdx,
        });
      }
    }

    // ── Rush ─────────────────────────────────────────────────────────────
    if (isRun) {
      off.rushingYards += ev.yards;
      off.totalYards   += ev.yards;
      if (ev.firstDown) off.firstDowns++;

      const rbId = resolveBallCarrier(ev);
      if (rbId) {
        const p = pStats(rbId);
        p.carries++;
        p.rushingYards += ev.yards;
        if (isTD) p.rushingTDs++;
      }

      // Tackle credit: non-TD runs only; credited to defending team's starters
      if (!isTD) {
        const defPool = defPools[ev.defenseTeamId] ?? [];
        const tackler = pickDefender(defPool);
        if (tackler) pStats(tackler).tackles++;
      }
    }

    // ── Scramble (QB rushing) ─────────────────────────────────────────────
    // GDD: QB Mobility enables scramble — counted as QB rushing yards
    if (isScramble) {
      off.rushingYards += ev.yards;
      off.totalYards   += ev.yards;
      if (ev.firstDown) off.firstDowns++;

      const qbId = resolveBallCarrier(ev);
      if (qbId) {
        const p = pStats(qbId);
        p.carries++;
        p.rushingYards += ev.yards;
        if (isTD) p.rushingTDs++;
      }

      if (!isTD) {
        const defPool = defPools[ev.defenseTeamId] ?? [];
        const tackler = pickDefender(defPool);
        if (tackler) pStats(tackler).tackles++;
      }
    }

    // ── Pass attempt ─────────────────────────────────────────────────────
    if (isPassAttempt) {
      const qbId = resolveBallCarrier(ev);
      if (qbId) {
        const p = pStats(qbId);
        p.attempts++;
        if (caught) {
          p.completions++;
          p.passingYards += ev.yards;
          off.passingYards += ev.yards;
          off.totalYards   += ev.yards;
          if (ev.firstDown) off.firstDowns++;
        }
        if (isTD)                  p.passingTDs++;
        if (ev.type === 'interception') {
          p.interceptions++;
          off.turnovers++;
        }
      }

      const wrId = resolveTarget(ev);
      if (wrId) {
        const p = pStats(wrId);
        p.targets++;
        if (caught) {
          p.receptions++;
          p.receivingYards += ev.yards;
          if (isTD) p.receivingTDs++;
        }
      }

      // Defensive INT
      if (ev.type === 'interception' && ev.defPlayerId) {
        pStats(ev.defPlayerId).interceptionsCaught++;
      }
    }

    // ── Sack ─────────────────────────────────────────────────────────────
    if (ev.type === 'sack') {
      off.sacksAllowed++;
      off.totalYards += ev.yards; // negative
      const qbId = resolveBallCarrier(ev);
      if (qbId) pStats(qbId).sacksAllowed++;
      if (ev.defPlayerId) pStats(ev.defPlayerId).sacks++;
    }

    // ── Fumble ───────────────────────────────────────────────────────────
    if (ev.type === 'fumble') off.turnovers++;
  }

  // Scores are on the game object — pass them in via a post-build step.
  // The caller fills in score from game.homeScore / game.awayScore.
  return { home: homeStats, away: awayStats, players, scoringPlays };
}

/**
 * Build a box score and set the correct final scores from the game result.
 */
export function buildBoxScoreFromGame(
  home: Team,
  away: Team,
  events: PlayEvent[],
  homeScore: number,
  awayScore: number,
): GameBoxScore {
  const bs = buildBoxScore(home, away, events);
  bs.home.score = homeScore;
  bs.away.score = awayScore;
  // Fill pointsByQuarter totals with score (sum check)
  const homeQTotal = bs.home.pointsByQuarter.reduce((a, b) => a + b, 0);
  const awayQTotal = bs.away.pointsByQuarter.reduce((a, b) => a + b, 0);
  // If quarter scoring is off (e.g. PAT not modeled), adjust final quarter to correct
  if (homeQTotal !== homeScore) {
    bs.home.pointsByQuarter[3] += homeScore - homeQTotal;
  }
  if (awayQTotal !== awayScore) {
    bs.away.pointsByQuarter[3] += awayScore - awayQTotal;
  }
  return bs;
}
