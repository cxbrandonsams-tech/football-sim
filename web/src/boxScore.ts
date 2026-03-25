import { type Game, type GameBoxScore } from './types';

export interface TeamBoxScore {
  teamId: string;
  score: number;
  pointsByQuarter: [number, number, number, number];
  totalYards: number;
  rushingYards: number;
  passingYards: number;
  firstDowns: number;
  turnovers: number;
  sacksAllowed: number;
}

export interface PlayerStats {
  name: string;
  // passing
  completions: number;
  attempts: number;
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  sacksTotal: number;
  // rushing
  carries: number;
  rushingYards: number;
  rushingTDs: number;
  // receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
}

export interface BoxScore {
  home: TeamBoxScore;
  away: TeamBoxScore;
  players: Record<string, PlayerStats>;
}

function emptyPlayer(name: string): PlayerStats {
  return {
    name,
    completions: 0, attempts: 0, passingYards: 0, passingTDs: 0, interceptions: 0, sacksTotal: 0,
    carries: 0, rushingYards: 0, rushingTDs: 0,
    targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
  };
}

/**
 * Convert a server-computed GameBoxScore into the local BoxScore shape.
 * Players are re-keyed by last name to match the event-derived format so
 * existing callers that do name-based lookups continue to work.
 */
function fromStoredBoxScore(bs: GameBoxScore): BoxScore {
  const players: Record<string, PlayerStats> = {};
  for (const p of Object.values(bs.players)) {
    const lastName = p.name.split(' ').pop() ?? p.name;
    players[lastName] = {
      name:           p.name,
      completions:    p.completions,
      attempts:       p.attempts,
      passingYards:   p.passingYards,
      passingTDs:     p.passingTDs,
      interceptions:  p.interceptions,
      sacksTotal:     p.sacksAllowed,
      carries:        p.carries,
      rushingYards:   p.rushingYards,
      rushingTDs:     p.rushingTDs,
      targets:        p.targets,
      receptions:     p.receptions,
      receivingYards: p.receivingYards,
      receivingTDs:   p.receivingTDs,
    };
  }
  return { home: bs.home, away: bs.away, players };
}

export function deriveBoxScore(game: Game): BoxScore {
  // Fast path: completed games no longer carry events in the league blob.
  // Use the server-computed box score that was persisted with the game result.
  if ((!game.events || game.events.length === 0) && game.boxScore) {
    return fromStoredBoxScore(game.boxScore);
  }

  const homeId = game.homeTeam.id;

  const mkTeam = (teamId: string, score: number): TeamBoxScore => ({
    teamId, score,
    pointsByQuarter: [0, 0, 0, 0],
    totalYards: 0, rushingYards: 0, passingYards: 0,
    firstDowns: 0, turnovers: 0, sacksAllowed: 0,
  });

  const home = mkTeam(homeId, game.homeScore);
  const away = mkTeam(game.awayTeam.id, game.awayScore);
  const players: Record<string, PlayerStats> = {};

  const offTeam  = (id: string) => id === homeId ? home : away;
  const player   = (name: string) => (players[name] ??= emptyPlayer(name));
  const qi       = (q: number) => (Math.min(q, 4) - 1) as 0 | 1 | 2 | 3;

  for (const ev of (game.events ?? [])) {
    const off  = offTeam(ev.offenseTeamId);
    const q    = qi(ev.quarter);
    const isRun        = ev.type === 'inside_run' || ev.type === 'outside_run';
    const isPassAttempt = ev.type === 'short_pass' || ev.type === 'medium_pass'
                        || ev.type === 'deep_pass'  || ev.type === 'interception';
    const caught = ev.result === 'success' || ev.result === 'touchdown';

    // Scoring
    if (ev.result === 'touchdown')       off.pointsByQuarter[q] += 7;
    if (ev.result === 'field_goal_good') off.pointsByQuarter[q] += 3;

    // Rushing
    if (isRun) {
      off.rushingYards += ev.yards;
      off.totalYards   += ev.yards;
      if (ev.firstDown) off.firstDowns++;
      if (ev.ballCarrier) {
        const p = player(ev.ballCarrier);
        p.carries++;
        p.rushingYards += ev.yards;
        if (ev.result === 'touchdown') p.rushingTDs++;
      }
    }

    // Passing
    if (isPassAttempt) {
      if (ev.ballCarrier) {
        const p = player(ev.ballCarrier);
        p.attempts++;
        if (caught) {
          p.completions++;
          p.passingYards += ev.yards;
          off.passingYards += ev.yards;
          off.totalYards   += ev.yards;
          if (ev.firstDown) off.firstDowns++;
        }
        if (ev.result === 'touchdown')   p.passingTDs++;
        if (ev.type === 'interception') { p.interceptions++; off.turnovers++; }
      }
      if (ev.target) {
        const p = player(ev.target);
        p.targets++;
        if (caught) {
          p.receptions++;
          p.receivingYards += ev.yards;
          if (ev.result === 'touchdown') p.receivingTDs++;
        }
      }
    }

    // Sack
    if (ev.type === 'sack') {
      off.sacksAllowed++;
      if (ev.ballCarrier) player(ev.ballCarrier).sacksTotal++;
    }

    // Fumble
    if (ev.type === 'fumble') off.turnovers++;
  }

  return { home, away, players };
}
