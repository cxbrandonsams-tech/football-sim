import { calcSalary, type Player } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { CAP_LIMIT, MAX_ROSTER_SIZE, getTeamPayroll } from './rosterManagement';
import { TUNING } from './config';
import { getTeamDirection, evaluateRosterNeeds, posGroup } from './teamDirection';

// ── Asking price ──────────────────────────────────────────────────────────────

/**
 * Returns the contract a free agent is seeking.
 * Salary = market value × premium.
 * Years demanded based on player age (younger = more years).
 */
export function calcAskingPrice(player: Player): { salary: number; years: number } {
  const fa = TUNING.freeAgency;
  const marketSalary = Math.max(player.salary, calcSalary(player.overall));
  const salary = Math.round(marketSalary * fa.salaryPremium);

  let years: number;
  if      (player.age <= 24) years = Math.min(4, fa.maxDemandYears);
  else if (player.age <= 27) years = Math.min(3, fa.maxDemandYears);
  else if (player.age <= 30) years = Math.min(2, fa.maxDemandYears);
  else                       years = 1;

  return { salary, years };
}

// ── Offer evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluates a contract offer against the player's asking price.
 * Years must be >= asking years (or within 1 if salary is generous).
 * Salary ratio determines acceptance probability.
 */
function evaluateOffer(
  asking:       { salary: number; years: number },
  offered:      { salary: number; years: number },
): 'accepted' | 'rejected' {
  const fa = TUNING.freeAgency;

  // Years shortfall check — must be within 1 of demanded, unless salary is well above asking
  const yearsShortfall = asking.years - offered.years;
  if (yearsShortfall > 1) return 'rejected';
  if (yearsShortfall === 1 && offered.salary < asking.salary * 1.10) return 'rejected';

  const ratio = offered.salary / asking.salary;

  if (ratio >= fa.autoAcceptThreshold) return 'accepted';
  if (ratio <  fa.acceptThreshold)     return 'rejected';

  // Probabilistic band: 0.88 – 1.00 → linear probability 0% – 100%
  const probability = (ratio - fa.acceptThreshold) / (fa.autoAcceptThreshold - fa.acceptThreshold);
  return Math.random() < probability ? 'accepted' : 'rejected';
}

// ── User offer contract ───────────────────────────────────────────────────────

export function offerContract(
  league:   League,
  playerId: string,
  salary:   number,
  years:    number,
): { league: League; accepted: boolean; message: string; error?: string } {
  const player = league.freeAgents.find(p => p.id === playerId);
  if (!player) return { league, accepted: false, message: '', error: 'Player not found in free agency.' };

  const userTeam = getUserTeam(league);

  if (userTeam.roster.length >= MAX_ROSTER_SIZE) {
    return { league, accepted: false, message: '', error: `Roster is full (max ${MAX_ROSTER_SIZE}).` };
  }

  const currentPayroll = getTeamPayroll(userTeam);
  if (currentPayroll + salary > CAP_LIMIT) {
    return {
      league, accepted: false, message: '',
      error: `Signing ${player.name} at $${salary} would exceed the cap ($${currentPayroll + salary}/$${CAP_LIMIT}).`,
    };
  }

  const asking  = calcAskingPrice(player);
  const outcome = evaluateOffer(asking, { salary, years });

  if (outcome === 'rejected') {
    const message = salary < asking.salary * TUNING.freeAgency.acceptThreshold
      ? `${player.name} rejected the offer — the salary is far below market ($${asking.salary} asking).`
      : `${player.name} rejected the offer — looking for better terms ($${asking.salary}/${asking.years}yr asking).`;
    return { league, accepted: false, message };
  }

  // Sign the player
  const signedPlayer: Player = {
    ...player,
    isRookie:       false,
    salary,
    yearsRemaining: years,
  };

  const newRoster   = [...userTeam.roster, signedPlayer];
  const updatedTeam = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedLeague: League = {
    ...league,
    teams:      league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t),
    freeAgents: league.freeAgents.filter(p => p.id !== playerId),
  };

  const message = `${player.name} signed a ${years}-year deal at $${salary}/yr.`;
  return { league: updatedLeague, accepted: true, message };
}

// ── CPU initial FA signings ───────────────────────────────────────────────────

/**
 * CPU teams sign a fraction of their open roster spots in the initial FA wave,
 * competing only for players with overall >= cpuCompeteMinOvr.
 * Runs once at the start of offseason, before the user can act.
 */
export function cpuInitialFASignings(league: League): League {
  const fa   = TUNING.freeAgency;
  let current = { ...league, freeAgents: [...league.freeAgents] };

  // Eligible FAs for CPU competition
  const eligibleFAs = current.freeAgents.filter(p => p.overall >= fa.cpuCompeteMinOvr);
  if (eligibleFAs.length === 0) return current;

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;

    let currentTeam = current.teams.find(t => t.id === team.id)!;
    const openSpots = MAX_ROSTER_SIZE - currentTeam.roster.length;
    if (openSpots <= 0) continue;

    const spotsToFill = Math.ceil(openSpots * fa.cpuInitialSignFrac);
    if (spotsToFill <= 0) continue;

    const direction = getTeamDirection(currentTeam, current);
    const needs     = evaluateRosterNeeds(currentTeam);

    // Score only eligible FAs for this team
    const scoredFAs = current.freeAgents
      .filter(p => p.overall >= fa.cpuCompeteMinOvr)
      .map(p => ({
        player: p,
        score:  scoreFAForTeam(p, direction, needs),
      }))
      .sort((a, b) => b.score - a.score);

    let signed = 0;
    for (const { player: faPlayer } of scoredFAs) {
      if (signed >= spotsToFill) break;
      if (currentTeam.roster.length >= MAX_ROSTER_SIZE) break;

      const payroll = getTeamPayroll(currentTeam);
      const signSalary = calcSalary(faPlayer.overall);
      if (payroll + signSalary > CAP_LIMIT) continue;

      const signedPlayer: Player = {
        ...faPlayer,
        isRookie:       false,
        salary:         signSalary,
        yearsRemaining: Math.floor(Math.random() * 3) + 2,
      };

      const newRoster = [...currentTeam.roster, signedPlayer];
      currentTeam     = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, false) };
      current         = {
        ...current,
        teams:      current.teams.map(t => t.id === currentTeam.id ? currentTeam : t),
        freeAgents: current.freeAgents.filter(p => p.id !== faPlayer.id),
      };
      signed++;
    }
  }

  return current;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
