import { type Player, type Ratings, calcOverall, calcSalary, clamp, refreshScouting } from '../models/Player';
import { type Team } from '../models/Team';
import { type League } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';

// ── Check system ──────────────────────────────────────────────────────────────

const DC = 14;

function ageModifier(age: number): number {
  if (age <= 24) return  4;  // young: growth bias
  if (age <= 28) return  0;  // prime: stable
  return -4;                 // old: regression bias
}

function traitBonus(player: Player): number {
  return player.trait === 'high_work_ethic' ? 2 : 0;
}

type Outcome = 'crit_success' | 'success' | 'failure' | 'crit_failure';

function rollOutcome(player: Player): Outcome {
  const roll = Math.ceil(Math.random() * 20) + ageModifier(player.age) + traitBonus(player);
  if (roll >= DC + 10) return 'crit_success';
  if (roll >= DC)      return 'success';
  if (roll <= DC - 10) return 'crit_failure';
  return 'failure';
}

const RATING_KEYS: (keyof Ratings)[] = ['skill', 'athleticism', 'iq'];

function pickRating(): keyof Ratings {
  return RATING_KEYS[Math.floor(Math.random() * RATING_KEYS.length)]!;
}

// ── Single player progression ─────────────────────────────────────────────────

export interface ProgressionResult {
  player: Player;
  outcome: Outcome;
  delta: number;   // net overall change (trueOverall before vs after)
  summary: string; // human-readable description
}

export function progressPlayer(player: Player): ProgressionResult {
  const outcome = rollOutcome(player);
  const ratings = { ...player.trueRatings };
  let summary = '';

  if (outcome === 'crit_success') {
    const key = pickRating();
    ratings[key] = clamp(ratings[key] + 3);
    summary = `+3 ${key}`;
  } else if (outcome === 'success') {
    const key = pickRating();
    ratings[key] = clamp(ratings[key] + 1);
    summary = `+1 ${key}`;
  } else if (outcome === 'crit_failure') {
    const key = pickRating();
    ratings[key] = clamp(ratings[key] - 3);
    summary = `-3 ${key}`;
  }

  const prevOverall = player.overall;
  const updatedPlayer = refreshScouting({
    ...player,
    age: player.age + 1,
    trueRatings: ratings,
    overall: calcOverall(player.position, ratings),
    injuryWeeksRemaining: 0, // all players heal over the off-season
  });

  return {
    player: updatedPlayer,
    outcome,
    delta: updatedPlayer.overall - prevOverall,
    summary,
  };
}

// ── League-wide progression ───────────────────────────────────────────────────

export interface LeagueProgressionSummary {
  improved: ProgressionResult[];
  declined: ProgressionResult[];
}

function progressRoster(roster: Player[], isUserTeam: boolean): { roster: Player[]; results: ProgressionResult[] } {
  const results = roster.map(p => progressPlayer(p));
  const newRoster = results.map(r => r.player);
  return { roster: newRoster, results };
}

export function progressLeague(league: League): { league: League; summary: LeagueProgressionSummary } {
  const improved: ProgressionResult[] = [];
  const declined: ProgressionResult[] = [];
  const newFreeAgents: ReturnType<typeof progressPlayer>['player'][] = [];

  const updatedTeams: Team[] = league.teams.map(team => {
    const isUserTeam = team.id === league.userTeamId;
    const { roster, results } = progressRoster(team.roster, isUserTeam);

    for (const r of results) {
      if (r.delta > 0) improved.push(r);
      if (r.delta < 0) declined.push(r);
    }

    // Expire contracts: decrement years, release anyone hitting 0, demand for anyone hitting 1
    const active: typeof roster   = [];
    const expired: typeof roster  = [];
    for (const p of roster) {
      const years = p.yearsRemaining - 1;
      if (years <= 0) {
        expired.push({ ...p, yearsRemaining: 0 });
      } else if (years === 1 && !p.contractDemand) {
        // Final year — generate extension demand based on post-progression value
        let demandSalary = Math.max(p.salary, calcSalary(p.overall));
        if (p.trait === 'greedy') demandSalary = Math.ceil(demandSalary  * 1.2);
        if (p.trait === 'loyal')  demandSalary = Math.floor(demandSalary * 0.9);
        demandSalary = Math.max(1, demandSalary);
        const demandYears  = p.age < 26 ? 4 : p.age < 30 ? 3 : p.age < 33 ? 2 : 1;
        active.push({ ...p, yearsRemaining: 1, contractDemand: { salary: demandSalary, years: demandYears } });
      } else {
        active.push({ ...p, yearsRemaining: years });
      }
    }
    newFreeAgents.push(...expired);

    return {
      ...team,
      roster: active,
      depthChart: buildDepthChart(active, isUserTeam),
    };
  });

  // Progress existing free agents (no contract expiration for FAs)
  const updatedFreeAgents = [
    ...league.freeAgents.map(p => progressPlayer(p).player),
    ...newFreeAgents,
  ];

  return {
    league: {
      ...league,
      teams: updatedTeams,
      freeAgents: updatedFreeAgents,
      scoutingBudget: league.budgetAllocation.scouting,
      developmentBudget: league.budgetAllocation.development,
    },
    summary: { improved, declined },
  };
}
