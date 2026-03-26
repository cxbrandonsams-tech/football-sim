import { type Season } from '../models/Season';
import { type Team } from '../models/Team';
import { type PlayerSeasonStats } from '../models/History';
import { type PlayerGameStats } from './gameStats';

// ── Roster metadata lookup ────────────────────────────────────────────────────

interface PlayerMeta {
  name:             string;
  teamId:           string;
  teamAbbreviation: string;
}

function buildRosterMeta(teams: Team[]): Map<string, PlayerMeta> {
  const map = new Map<string, PlayerMeta>();
  for (const team of teams) {
    for (const p of team.roster) {
      map.set(p.id, { name: p.name, teamId: team.id, teamAbbreviation: team.abbreviation });
    }
  }
  return map;
}

// ── Accumulation helpers ──────────────────────────────────────────────────────

function emptySeasonStats(
  year: number,
  meta: PlayerMeta,
): PlayerSeasonStats {
  return {
    year,
    teamId:            meta.teamId,
    teamAbbreviation:  meta.teamAbbreviation,
    gamesPlayed:       0,
    completions:       0,
    attempts:          0,
    passingYards:      0,
    passingTDs:        0,
    interceptions:     0,
    sacksAllowed:      0,
    carries:           0,
    rushingYards:      0,
    rushingTDs:        0,
    targets:           0,
    receptions:        0,
    receivingYards:    0,
    receivingTDs:      0,
    sacks:             0,
    interceptionsCaught: 0,
    tackles:           0,
  };
}

function mergeGameStats(
  season: PlayerSeasonStats,
  game: PlayerGameStats,
): PlayerSeasonStats {
  return {
    ...season,
    gamesPlayed:       season.gamesPlayed + 1,
    completions:       season.completions       + game.completions,
    attempts:          season.attempts          + game.attempts,
    passingYards:      season.passingYards      + game.passingYards,
    passingTDs:        season.passingTDs        + game.passingTDs,
    interceptions:     season.interceptions     + game.interceptions,
    sacksAllowed:      season.sacksAllowed      + game.sacksAllowed,
    carries:           season.carries           + game.carries,
    rushingYards:      season.rushingYards      + game.rushingYards,
    rushingTDs:        season.rushingTDs        + game.rushingTDs,
    targets:           season.targets           + game.targets,
    receptions:        season.receptions        + game.receptions,
    receivingYards:    season.receivingYards    + game.receivingYards,
    receivingTDs:      season.receivingTDs      + game.receivingTDs,
    sacks:             season.sacks             + game.sacks,
    interceptionsCaught: season.interceptionsCaught + game.interceptionsCaught,
    tackles:           season.tackles           + game.tackles,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build cumulative player season stats from all completed games in a season.
 * Uses box scores stored on each game (populated by simulateGame).
 * Falls back to an empty record if a game has no box score yet.
 *
 * @param season  The current or completed season.
 * @param teams   All teams (used to look up team abbreviations for FAs/missing rosters).
 * @returns Record keyed by player.id → PlayerSeasonStats for the season year.
 */
export function buildSeasonStats(
  season: Season,
  teams: Team[],
): Record<string, PlayerSeasonStats> {
  const meta = buildRosterMeta(teams);
  const totals: Record<string, PlayerSeasonStats> = {};

  for (const game of season.games) {
    if (game.status !== 'final' || !game.boxScore) continue;

    for (const [playerId, gs] of Object.entries(game.boxScore.players)) {
      // Skip entries with no meaningful stats (e.g. placeholder entries)
      const hasActivity =
        gs.attempts > 0 || gs.carries > 0 || gs.targets > 0 ||
        gs.sacks > 0 || gs.interceptionsCaught > 0;
      if (!hasActivity) continue;

      const playerMeta: PlayerMeta = meta.get(playerId) ?? {
        name:             gs.name,
        teamId:           gs.teamId,
        teamAbbreviation: '?',
      };

      if (!totals[playerId]) {
        totals[playerId] = emptySeasonStats(season.year, playerMeta);
      }
      totals[playerId] = mergeGameStats(totals[playerId]!, gs);
    }
  }

  return totals;
}

/**
 * Summarize team-level season stats for standings and history.
 * Uses existing game scores — no need for box scores.
 */
export interface TeamSeasonLine {
  teamId:        string;
  teamName:      string;
  abbreviation:  string;
  wins:          number;
  losses:        number;
  ties:          number;
  pointsFor:     number;
  pointsAgainst: number;
}

export function buildTeamSeasonLines(
  season: Season,
  teams: Team[],
): Record<string, TeamSeasonLine> {
  const lines: Record<string, TeamSeasonLine> = {};
  for (const t of teams) {
    lines[t.id] = {
      teamId:       t.id,
      teamName:     t.name,
      abbreviation: t.abbreviation,
      wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0,
    };
  }

  for (const game of season.games) {
    if (game.status !== 'final') continue;
    const home = lines[game.homeTeam.id];
    const away = lines[game.awayTeam.id];
    if (!home || !away) continue;

    home.pointsFor     += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor     += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore)      { home.wins++;   away.losses++; }
    else if (game.awayScore > game.homeScore) { away.wins++;   home.losses++; }
    else                                       { home.ties++;   away.ties++;   }
  }

  return lines;
}
