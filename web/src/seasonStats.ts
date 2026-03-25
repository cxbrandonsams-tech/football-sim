import { type Game } from './types';

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
 * Aggregate stats across all completed games in a season.
 * Uses the server-computed boxScore.players (keyed by player.id) so this
 * works whether or not play events are present in the game object.
 * Keyed by player.id in the returned record.
 */
export function aggregateSeasonStats(games: Game[]): Record<string, SeasonPlayerStats> {
  const totals: Record<string, SeasonPlayerStats> = {};

  for (const game of games) {
    if (game.status !== 'final' || !game.boxScore) continue;

    const teamAbbr: Record<string, string> = {
      [game.homeTeam.id]: game.homeTeam.abbreviation,
      [game.awayTeam.id]: game.awayTeam.abbreviation,
    };

    for (const [playerId, s] of Object.entries(game.boxScore.players)) {
      const abbr = teamAbbr[s.teamId] ?? '?';
      const t = totals[playerId];
      if (!t) {
        totals[playerId] = {
          playerId,
          name:             s.name,
          teamId:           s.teamId,
          teamAbbreviation: abbr,
          completions:      s.completions,
          attempts:         s.attempts,
          passingYards:     s.passingYards,
          passingTDs:       s.passingTDs,
          interceptions:    s.interceptions,
          sacksTotal:       s.sacksAllowed,
          carries:          s.carries,
          rushingYards:     s.rushingYards,
          rushingTDs:       s.rushingTDs,
          targets:          s.targets,
          receptions:       s.receptions,
          receivingYards:   s.receivingYards,
          receivingTDs:     s.receivingTDs,
        };
      } else {
        t.completions    += s.completions;
        t.attempts       += s.attempts;
        t.passingYards   += s.passingYards;
        t.passingTDs     += s.passingTDs;
        t.interceptions  += s.interceptions;
        t.sacksTotal     += s.sacksAllowed;
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
