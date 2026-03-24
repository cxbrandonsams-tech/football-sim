/**
 * End-of-season rollup and next-season setup.
 *
 * rollupSeasonHistory() — called once after the league championship is decided.
 *   Archives player/team/coach stats and season awards into league.history.
 *   The playoff bracket must already have championId set before calling this.
 *
 * startNextSeason() — called after rollupSeasonHistory() during the offseason advance.
 *   Increments the year, generates a new schedule (using prev-season div finish),
 *   and resets per-season state.  Does not run player progression or contracts.
 */

import { type League, type PlayoffBracket } from '../models/League';
import {
  type LeagueHistory,
  type TeamSeasonHistory,
  type CoachSeasonRecord,
}                                            from '../models/History';
import { buildSeasonStats, buildTeamSeasonLines } from './seasonStats';
import { computeSeasonAwards }                    from './awards';
import { newsForAward, addNewsItems }             from './news';
import { computeDivisionStandings, extractDivFinish } from './standings';
import { createSeason }                           from '../models/Season';
import { progressLeague }                         from './progression';
import { processRetirements }                     from './retirement';
import { inductHallOfFame }                       from './hallOfFame';
import { inductRingOfHonor }                      from './ringOfHonor';
import { aiExtendPlayers }                        from './contracts';
import { aiSignFreeAgents, enforceRosterLimits }  from './rosterManagement';
import { runAICoachCarousel, autoFillUserVacancies } from './coachCarousel';
import { TUNING }                                  from './config';

// ── Playoff depth helper ───────────────────────────────────────────────────────

/**
 * Returns the deepest playoff round a team reached, or undefined if they
 * missed the playoffs entirely.
 */
function deriveChampionshipRound(
  teamId:    string,
  playoff:   PlayoffBracket | undefined,
  champId:   string | undefined,
): TeamSeasonHistory['championshipRound'] {
  if (!playoff) return undefined;
  if (teamId === champId) return 'champion';

  // Walk from deepest to shallowest — first match wins.
  const rounds = ['championship', 'conference', 'divisional', 'wildcard'] as const;
  for (const round of rounds) {
    const appeared = playoff.matchups.some(
      m => m.round === round && (m.topSeedId === teamId || m.bottomSeedId === teamId),
    );
    if (appeared) return round;
  }
  return undefined;
}

// ── Main rollup ───────────────────────────────────────────────────────────────

/**
 * Archive the completed regular season into league.history and compute awards.
 *
 * Updates (all append-only):
 *  - history.playerHistory   — one season stat line per player
 *  - history.teamHistory     — one season record per team
 *  - history.coachHistory    — one season record per coach (HC, OC, DC)
 *  - history.championsByYear — champion once playoff is complete
 *  - history.seasonAwards    — full award slate for the year
 *
 * Awards are computed using history BEFORE this season is appended, so
 * Comeback Player comparisons correctly reference the prior season only.
 *
 * Returns a new League object; does not mutate in place.
 */
export function rollupSeasonHistory(league: League): League {
  const { currentSeason, teams, history, playoff } = league;
  const year      = currentSeason.year;
  const championId = playoff?.championId;

  // ── Compute season stats ───────────────────────────────────────────────────
  const playerStats = buildSeasonStats(currentSeason, teams);
  const teamLines   = buildTeamSeasonLines(currentSeason, teams);

  // ── All teams that participated in any playoff matchup ────────────────────
  const playoffTeams = new Set<string>();
  if (playoff) {
    for (const m of playoff.matchups) {
      playoffTeams.add(m.topSeedId);
      playoffTeams.add(m.bottomSeedId);
    }
  }

  // ── Awards ─────────────────────────────────────────────────────────────────
  // Uses regular-season stats only (playoff games live in bracket, not season.games).
  const seasonAwards = computeSeasonAwards(league, playerStats);

  // ── Player history ─────────────────────────────────────────────────────────
  const playerHistory = { ...history.playerHistory };
  for (const [playerId, stats] of Object.entries(playerStats)) {
    playerHistory[playerId] = [...(playerHistory[playerId] ?? []), stats];
  }

  // ── Team history ───────────────────────────────────────────────────────────
  const teamHistory = { ...history.teamHistory };
  for (const line of Object.values(teamLines)) {
    const madePlayoffs      = playoffTeams.has(line.teamId);
    const championshipRound = deriveChampionshipRound(line.teamId, playoff, championId);

    const entry: TeamSeasonHistory = {
      year,
      wins:          line.wins,
      losses:        line.losses,
      ties:          line.ties,
      pointsFor:     line.pointsFor,
      pointsAgainst: line.pointsAgainst,
      madePlayoffs,
      ...(championshipRound !== undefined && { championshipRound }),
    };
    teamHistory[line.teamId] = [...(teamHistory[line.teamId] ?? []), entry];
  }

  // ── Coach history ──────────────────────────────────────────────────────────
  const coachHistory = { ...history.coachHistory };
  for (const team of teams) {
    const line = teamLines[team.id];
    if (!line) continue;
    const madePlayoffs = playoffTeams.has(team.id);
    const isChampion   = team.id === championId;

    for (const coach of [team.coaches.hc, team.coaches.oc, team.coaches.dc].filter((c): c is NonNullable<typeof c> => c !== null)) {
      const record: CoachSeasonRecord = {
        year,
        teamId:          team.id,
        teamName:        team.name,
        wins:            line.wins,
        losses:          line.losses,
        ties:            line.ties,
        madePlayoffs,
        wonChampionship: isChampion,
      };
      coachHistory[coach.id] = [...(coachHistory[coach.id] ?? []), record];
    }
  }

  // ── Champion record ────────────────────────────────────────────────────────
  const championsByYear = { ...history.championsByYear };
  if (playoff?.championId && playoff.championName) {
    championsByYear[year] = { teamId: playoff.championId, teamName: playoff.championName };
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const newHistory: LeagueHistory = {
    ...history,
    seasonAwards:    [...history.seasonAwards, seasonAwards],
    playerHistory,
    teamHistory,
    coachHistory,
    championsByYear,
  };

  const baseLeague = { ...league, history: newHistory };

  // Generate award news items
  const awardNews = seasonAwards.awards
    .map(a => newsForAward(a, year))
    .filter((n): n is NonNullable<typeof n> => n !== null);

  return addNewsItems(baseLeague, awardNews);
}

// ── Offseason flow ────────────────────────────────────────────────────────────

/**
 * Run the first half of the offseason: age players, decrement contracts,
 * generate contract demands for final-year players, move expired contracts
 * to the free-agent pool.
 *
 * Call this immediately when the league enters the offseason phase (after the
 * championship) so that contract demands are visible during the offseason window.
 * The user can then manage their own roster before calling startNextSeason.
 */
export function runOffseasonProgression(league: League): League {
  // 1. Age players, update ratings, handle contracts
  const { league: progressed } = progressLeague(league);
  // 2. Retire eligible players (uses post-progression ages)
  const { league: afterRetirements } = processRetirements(progressed);
  // 3. Induct Hall of Fame (evaluates all newly retired + previously eligible players)
  const afterHoF = inductHallOfFame(afterRetirements);
  // 4. Ring of Honor induction (team-specific legacy, independent of HoF)
  const afterRoH = inductRingOfHonor(afterHoF);
  // 5. AI coach carousel — evaluate HCs, fire/hire, replenish pool
  const afterCarousel = runAICoachCarousel(afterRoH);
  return afterCarousel;
}

/**
 * Transition the league into the next season.
 *
 * Runs the second half of the offseason in order:
 *   1. AI teams extend their players with pending contract demands
 *   2. AI teams sign free agents to fill roster holes
 *   3. Roster limits are enforced league-wide (cut excess, fill shortfalls)
 *   4. A new 17-game schedule is generated (using prior-season division finish)
 *   5. Per-season state is reset
 *
 * The user should make their own contract/FA decisions (via endpoints) before
 * calling this.  Preserves teams, coaches, history, and all long-term state.
 */
export function startNextSeason(league: League): League {
  // ── Ensure no vacancies remain before the season starts ───────────────────
  const afterVacancies = autoFillUserVacancies(league);

  // ── Apply Talent Evaluator scouting bonus ─────────────────────────────────
  const withScoutingBonuses = {
    ...afterVacancies,
    teams: afterVacancies.teams.map(team => {
      const coaches = [team.coaches.hc, team.coaches.oc, team.coaches.dc];
      const hasTalentEvaluator = coaches.some(c => c?.trait === 'talent_evaluator');
      if (!hasTalentEvaluator) return team;
      return {
        ...team,
        scoutingBudget: (team.scoutingBudget ?? 5) + (TUNING.coaching.traits.talentEvaluatorScoutingBonus ?? 0),
      };
    }),
  };

  // ── AI handles their contracts and roster gaps ─────────────────────────────
  const { league: afterExtensions } = aiExtendPlayers(withScoutingBonuses);
  const { league: afterSignings    } = aiSignFreeAgents(afterExtensions);
  const afterEnforcement             = enforceRosterLimits(afterSignings);

  // ── Generate new schedule based on prior season's standings ───────────────
  const divStandings  = computeDivisionStandings(
    afterEnforcement.currentSeason,
    afterEnforcement.teams,
    afterEnforcement.divisions,
  );
  const prevDivFinish = extractDivFinish(divStandings);
  const nextYear      = afterEnforcement.currentSeason.year + 1;
  const nextSeason    = createSeason(nextYear, afterEnforcement.teams, afterEnforcement.divisions, prevDivFinish);

  const { playoff: _dropped, ...rest } = afterEnforcement;
  return {
    ...rest,
    phase:              'regular_season',
    currentSeason:      nextSeason,
    currentWeek:        1,
    currentSeasonStats: {},
  };
}
