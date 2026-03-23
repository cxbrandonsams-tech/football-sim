import { type Game } from './types';
import { deriveBoxScore } from './boxScore';

export interface SeasonPlayerStats {
  playerId: string;
  name: string;
  teamId: string;
  teamAbbreviation: string;
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

/**
 * Build a name → { id, teamId, teamAbbreviation } lookup from both rosters in a game.
 * Used to map event name strings back to stable player IDs.
 */
function buildRosterLookup(game: Game): Map<string, { id: string; teamId: string; teamAbbreviation: string }> {
  const map = new Map<string, { id: string; teamId: string; teamAbbreviation: string }>();
  for (const team of [game.homeTeam, game.awayTeam]) {
    for (const player of team.roster) {
      map.set(player.name, { id: player.id, teamId: team.id, teamAbbreviation: team.abbreviation });
    }
  }
  return map;
}

/**
 * Aggregate stats across all completed games in a season.
 * Keyed by player.id — not by name — so duplicate names never collide.
 */
export function aggregateSeasonStats(games: Game[]): Record<string, SeasonPlayerStats> {
  const totals: Record<string, SeasonPlayerStats> = {};

  for (const game of games) {
    if (game.status !== 'final') continue;

    const bs     = deriveBoxScore(game);
    const lookup = buildRosterLookup(game);

    for (const [name, s] of Object.entries(bs.players)) {
      const info = lookup.get(name);
      // Use player.id as key; fall back to a name-prefixed key if somehow not in roster.
      const key = info?.id ?? `name:${name}`;

      const t = totals[key];
      if (!t) {
        totals[key] = {
          playerId:         info?.id ?? key,
          name,
          teamId:           info?.teamId ?? '',
          teamAbbreviation: info?.teamAbbreviation ?? '?',
          completions:    s.completions,
          attempts:       s.attempts,
          passingYards:   s.passingYards,
          passingTDs:     s.passingTDs,
          interceptions:  s.interceptions,
          sacksTotal:     s.sacksTotal,
          carries:        s.carries,
          rushingYards:   s.rushingYards,
          rushingTDs:     s.rushingTDs,
          targets:        s.targets,
          receptions:     s.receptions,
          receivingYards: s.receivingYards,
          receivingTDs:   s.receivingTDs,
        };
      } else {
        t.completions    += s.completions;
        t.attempts       += s.attempts;
        t.passingYards   += s.passingYards;
        t.passingTDs     += s.passingTDs;
        t.interceptions  += s.interceptions;
        t.sacksTotal     += s.sacksTotal;
        t.carries        += s.carries;
        t.rushingYards   += s.rushingYards;
        t.rushingTDs     += s.rushingTDs;
        t.targets        += s.targets;
        t.receptions     += s.receptions;
        t.receivingYards += s.receivingYards;
        t.receivingTDs   += s.receivingTDs;
      }
    }
  }

  return totals;
}
