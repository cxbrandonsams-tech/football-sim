import { calcSalary } from '../models/Player';
import { type Team } from '../models/Team';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { getTeamDirection, evaluateRosterNeeds, posGroup } from './teamDirection';
import { TUNING } from './config';

export const MAX_ROSTER_SIZE = 56;
/** Teams must have at least this many players; auto-filled from FA pool if needed. */
export const MIN_ROSTER_SIZE = 45;
/**
 * Soft salary cap.  Scaled for 56-player rosters at avg overall ~65:
 *   56 × calcSalary(65) = 56 × 7 ≈ 392 → 420 gives comfortable headroom.
 */
export const CAP_LIMIT       = 420;

export function getTeamPayroll(team: Team): number {
  return team.roster.reduce((sum, p) => sum + p.salary, 0);
}

export function signPlayer(league: League, playerId: string): { league: League; error?: string } {
  const player = league.freeAgents.find(p => p.id === playerId);
  if (!player) return { league, error: 'Player not found in free agency.' };

  const userTeam = getUserTeam(league);
  if (userTeam.roster.length >= MAX_ROSTER_SIZE) {
    return { league, error: `Roster is full (max ${MAX_ROSTER_SIZE}).` };
  }

  const currentPayroll = getTeamPayroll(userTeam);
  if (currentPayroll + player.salary > CAP_LIMIT) {
    return { league, error: `Signing ${player.name} ($${player.salary}) would exceed the cap ($${currentPayroll}/$${CAP_LIMIT}).` };
  }

  // Apply Contract Negotiator discount if user team has that trait on any coach
  const coaches = [userTeam.coaches.hc, userTeam.coaches.oc, userTeam.coaches.dc];
  const hasNegotiator = coaches.some(c => c?.trait === 'contract_negotiator');
  const discount = hasNegotiator ? (TUNING.coaching.traits.contractNegotiatorDiscount ?? 0) : 0;

  // Give signed player a fresh vet contract (2–4 years); signing clears rookie status.
  const signedPlayer = {
    ...player,
    isRookie:       false,
    salary:         Math.max(1, Math.round(calcSalary(player.overall) * (1 - discount))),
    yearsRemaining: Math.floor(Math.random() * 3) + 2,
  };

  const newRoster    = [...userTeam.roster, signedPlayer];
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);

  return {
    league: {
      ...league,
      teams: updatedTeams,
      freeAgents: league.freeAgents.filter(p => p.id !== playerId),
    },
  };
}

/**
 * Score a free agent for a given team based on direction and roster needs.
 *
 *   base        — raw overall (primary driver)
 *   needBonus   — up to +12 when position group has real need
 *   agePenalty  — contenders avoid players aged 33+; rebuilders avoid players aged 30+
 *                 (keep the FA pool moving; each team signs what fits their window)
 */
function scoreFAForTeam(
  fa:        { overall: number; age: number; position: Parameters<typeof posGroup>[0] },
  direction: ReturnType<typeof getTeamDirection>,
  needs:     ReturnType<typeof evaluateRosterNeeds>,
): number {
  const group     = posGroup(fa.position);
  const need      = needs[group] ?? 0;
  const needBonus = Math.min(12, Math.max(0, need * 4));

  let agePenalty = 0;
  if (direction === 'contender'  && fa.age >= 33) agePenalty = 8;
  if (direction === 'rebuilding' && fa.age >= 30) agePenalty = (fa.age - 29) * 4;

  return fa.overall + needBonus - agePenalty;
}

// Each AI team signs free agents until its roster is full or cap is tight.
// Direction and position need influence priority; user team is skipped entirely.
export function aiSignFreeAgents(league: League): { league: League; signed: { teamAbbr: string; playerName: string; salary: number }[] } {
  let current = { ...league, freeAgents: [...league.freeAgents] };
  const signed: { teamAbbr: string; playerName: string; salary: number }[] = [];

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;

    let currentTeam = current.teams.find(t => t.id === team.id)!;
    const direction = getTeamDirection(currentTeam, current);
    const needs     = evaluateRosterNeeds(currentTeam);

    // Score and sort FAs for this specific team's context
    const sortedFAs = [...current.freeAgents].sort(
      (a, b) => scoreFAForTeam(b, direction, needs) - scoreFAForTeam(a, direction, needs),
    );

    for (const fa of sortedFAs) {
      if (currentTeam.roster.length >= MAX_ROSTER_SIZE) break;
      const payroll = getTeamPayroll(currentTeam);
      if (payroll + fa.salary > CAP_LIMIT) continue;

      // Signing clears rookie status and gives a fresh vet contract (2–4 years).
      const signedPlayer = {
        ...fa,
        isRookie:       false,
        salary:         calcSalary(fa.overall),
        yearsRemaining: Math.floor(Math.random() * 3) + 2,
      };
      const newRoster = [...currentTeam.roster, signedPlayer];
      currentTeam     = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, false) };
      current         = {
        ...current,
        teams:      current.teams.map(t => t.id === currentTeam.id ? currentTeam : t),
        freeAgents: current.freeAgents.filter(p => p.id !== fa.id),
      };
      signed.push({ teamAbbr: team.abbreviation, playerName: fa.name, salary: signedPlayer.salary });
    }
  }

  return { league: current, signed };
}

/**
 * Enforce roster size limits for all teams:
 *   - Over MAX_ROSTER_SIZE (56): cut lowest-overall players until at max.
 *   - Under MIN_ROSTER_SIZE (45): sign best available FAs until at min or pool is empty.
 *
 * Applies to all teams, including the user team (user had the offseason to manage).
 */
export function enforceRosterLimits(league: League): League {
  let current = league;

  // Pass 1 — cut excess
  const trimmedTeams = current.teams.map(team => {
    if (team.roster.length <= MAX_ROSTER_SIZE) return team;
    const isUser   = team.id === current.userTeamId;
    const sorted   = [...team.roster].sort((a, b) => a.overall - b.overall); // worst first
    const kept     = sorted.slice(team.roster.length - MAX_ROSTER_SIZE);     // keep best
    const released = sorted.slice(0, team.roster.length - MAX_ROSTER_SIZE);
    current = { ...current, freeAgents: [...current.freeAgents, ...released] };
    return { ...team, roster: kept, depthChart: buildDepthChart(kept, isUser) };
  });
  current = { ...current, teams: trimmedTeams };

  // Pass 2 — fill shortfalls from FA pool
  for (const team of current.teams) {
    if (team.roster.length >= MIN_ROSTER_SIZE) continue;
    const isUser   = team.id === current.userTeamId;
    let currentTeam = current.teams.find(t => t.id === team.id)!;
    const sortedFAs = [...current.freeAgents].sort((a, b) => b.overall - a.overall);

    for (const fa of sortedFAs) {
      if (currentTeam.roster.length >= MIN_ROSTER_SIZE) break;
      const payroll = getTeamPayroll(currentTeam);
      if (payroll + fa.salary > CAP_LIMIT) continue;

      const signedPlayer = {
        ...fa,
        isRookie:       false,
        salary:         calcSalary(fa.overall),
        yearsRemaining: Math.floor(Math.random() * 3) + 2,
      };
      const newRoster = [...currentTeam.roster, signedPlayer];
      currentTeam     = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, isUser) };
      current         = {
        ...current,
        teams:      current.teams.map(t => t.id === currentTeam.id ? currentTeam : t),
        freeAgents: current.freeAgents.filter(p => p.id !== fa.id),
      };
    }
  }

  return current;
}

export function releasePlayer(league: League, playerId: string): { league: League; error?: string } {
  const userTeam = getUserTeam(league);
  const player   = userTeam.roster.find(p => p.id === playerId);
  if (!player) return { league, error: 'Player not found on roster.' };

  const newRoster    = userTeam.roster.filter(p => p.id !== playerId);
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);

  return {
    league: {
      ...league,
      teams: updatedTeams,
      freeAgents: [...league.freeAgents, player],
    },
  };
}
