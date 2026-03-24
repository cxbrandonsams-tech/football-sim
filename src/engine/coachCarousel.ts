/**
 * Coach carousel — end-of-season evaluation, hiring/firing, internal promotions,
 * and pool management.
 *
 * AI teams are handled automatically in runAICoachCarousel().
 * User team changes are handled via server endpoints (fire/hire/promote).
 */

import * as crypto from 'crypto';
import {
  type Coach,
  type CoachRole,
  type CoachPersonality,
  type CoachTrait,
  type OffensiveScheme,
  type DefensiveScheme,
  createCoach,
} from '../models/Coach';
import { type League } from '../models/League';
import { type Team } from '../models/Team';
import {
  newsForCoachFired,
  newsForCoachHired,
  newsForCoordPromoted,
  addNewsItems,
} from './news';
import { TUNING } from './config';

// ── Name lists for pool generation ────────────────────────────────────────────

const POOL_HC_NAMES = [
  'Vic Parrish','Cole Denton','Ralph Oswald','Stu Finney','Dex Holland','Amos Trent',
  'Burt Wiley','Norm Caldwell','Curt Lindsey','Eli Sherman','Ford Putnam','Glen Odom',
  'Harv Kimball','Ira Dupont','Jake Snell','Kirk Whitney','Lane Kohl','Mort Baines',
];

const POOL_OC_NAMES = [
  'Ty Drummond','Walt Embry','Rex Gatlin','Shep Nolan','Blaine Corey','Cruz Tatum',
  'Deke Ingram','Emil Storey','Flint Carey','Gavin Moody','Hugo Pratt','Ivan Thorne',
  'Jules Bauer','Kent Ladd','Luca Farris','Milo Howe','Ned Castillo','Omar Parks',
];

const POOL_DC_NAMES = [
  'Drew Holloway','Finn Burrows','Grant Stahl','Hank Quigley','Ivan Cross','Jake Pryor',
  'Kip Larkin','Lou Easton','Mack Winters','Neil Ashby','Otis Vance','Pete Lamb',
  'Quinn Doyle','Rex Horton','Stu Hale','Ted Burk','Vin Tolar','Wayne Kelsey',
];

const OFF_SCHEMES: OffensiveScheme[] = ['balanced','short_passing','deep_passing','run_inside','run_outside'];
const DEF_SCHEMES: DefensiveScheme[] = ['balanced','run_focus','speed_defense','stop_short_pass','stop_deep_pass','aggressive'];
const PERSONALITIES: CoachPersonality[] = ['conservative','balanced','balanced','aggressive']; // balanced weighted

// Traits biased by role
const HC_TRAITS:   CoachTrait[] = ['talent_evaluator','contract_negotiator','player_developer','offensive_pioneer','defensive_architect','quarterback_guru','run_game_specialist','pass_rush_specialist','turnover_machine'];
const OC_TRAITS:   CoachTrait[] = ['offensive_pioneer','quarterback_guru','run_game_specialist','player_developer','youth_developer','veteran_stabilizer'];
const DC_TRAITS:   CoachTrait[] = ['defensive_architect','pass_rush_specialist','turnover_machine','player_developer','youth_developer','veteran_stabilizer'];
const POOL_TRAITS: CoachTrait[] = ['talent_evaluator','contract_negotiator','offensive_pioneer','quarterback_guru','run_game_specialist','defensive_architect','pass_rush_specialist','turnover_machine','player_developer','youth_developer','veteran_stabilizer'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function clampOvr(n: number): number {
  return Math.max(40, Math.min(90, Math.round(n)));
}

// ── Coach generation ─────────────────────────────────────────────────────────

export function generatePoolHC(nameOverride?: string): Coach {
  const cfg  = TUNING.coaching.carousel;
  const ovr  = clampOvr(62 + (Math.random() - 0.5) * 20);
  const name = nameOverride ?? pick(POOL_HC_NAMES);
  const personality = pick(PERSONALITIES);
  const trait = Math.random() < cfg.traitChancePool ? pick(HC_TRAITS) : undefined;
  const offSch = pick(OFF_SCHEMES);
  const defSch = pick(DEF_SCHEMES);
  return createCoach(crypto.randomUUID(), name, 'HC', ovr, {
    personality,
    ...(trait ? { trait } : {}),
    leadership:      clampOvr(ovr + (Math.random() - 0.5) * 10),
    gameManagement:  clampOvr(ovr + (Math.random() - 0.5) * 10),
    offensiveScheme: offSch,
    defensiveScheme: defSch,
  });
}

export function generatePoolOC(nameOverride?: string): Coach {
  const cfg  = TUNING.coaching.carousel;
  const ovr  = clampOvr(60 + (Math.random() - 0.5) * 20);
  const name = nameOverride ?? pick(POOL_OC_NAMES);
  const personality = pick(PERSONALITIES);
  const trait = Math.random() < cfg.traitChancePool ? pick(OC_TRAITS) : undefined;
  const offSch = pick(OFF_SCHEMES);
  return createCoach(crypto.randomUUID(), name, 'OC', ovr, {
    personality,
    ...(trait ? { trait } : {}),
    offensiveScheme: offSch,
    passing: clampOvr(ovr + 2),
    rushing: clampOvr(ovr - 2),
  });
}

export function generatePoolDC(nameOverride?: string): Coach {
  const cfg  = TUNING.coaching.carousel;
  const ovr  = clampOvr(60 + (Math.random() - 0.5) * 20);
  const name = nameOverride ?? pick(POOL_DC_NAMES);
  const personality = pick(PERSONALITIES);
  const trait = Math.random() < cfg.traitChancePool ? pick(DC_TRAITS) : undefined;
  const defSch = pick(DEF_SCHEMES);
  return createCoach(crypto.randomUUID(), name, 'DC', ovr, {
    personality,
    ...(trait ? { trait } : {}),
    defensiveScheme: defSch,
    coverage:   clampOvr(ovr),
    runDefense: clampOvr(ovr),
  });
}

/**
 * Generate an internal coordinator (lower OVR, guaranteed scheme match with HC,
 * higher trait chance than external hires).
 */
export function generateInternalCoordinator(
  hc:   Coach,
  role: 'OC' | 'DC',
): Coach {
  const cfg = TUNING.coaching.carousel;
  // External pool average is ~60; internal is penalized
  const baseOvr = 60 - cfg.internalOvrPenalty;
  const ovr     = clampOvr(baseOvr + (Math.random() - 0.5) * 12);
  const personality = pick(PERSONALITIES);
  const hasTrait    = Math.random() < cfg.traitChanceInternal;

  if (role === 'OC') {
    const offSch = hc.offensiveScheme ?? pick(OFF_SCHEMES); // guaranteed match
    const trait: CoachTrait | undefined = hasTrait ? pick(OC_TRAITS) : undefined;
    return createCoach(crypto.randomUUID(), pick(POOL_OC_NAMES), 'OC', ovr, {
      personality,
      ...(trait ? { trait } : {}),
      offensiveScheme: offSch,
      passing: clampOvr(ovr + 2),
      rushing: clampOvr(ovr - 2),
    });
  } else {
    const defSch = hc.defensiveScheme ?? pick(DEF_SCHEMES); // guaranteed match
    const trait: CoachTrait | undefined = hasTrait ? pick(DC_TRAITS) : undefined;
    return createCoach(crypto.randomUUID(), pick(POOL_DC_NAMES), 'DC', ovr, {
      personality,
      ...(trait ? { trait } : {}),
      defensiveScheme: defSch,
      coverage:   clampOvr(ovr),
      runDefense: clampOvr(ovr),
    });
  }
}

// ── Pool management ───────────────────────────────────────────────────────────

/** Ensure the unemployed coach pool has at least poolTargetSize coaches. */
export function replenishCoachPool(league: League): League {
  const target  = TUNING.coaching.carousel.poolTargetSize;
  let   coaches = [...(league.unemployedCoaches ?? [])];

  while (coaches.length < target) {
    const roll = Math.random();
    if (roll < 0.33)      coaches.push(generatePoolHC());
    else if (roll < 0.66) coaches.push(generatePoolOC());
    else                  coaches.push(generatePoolDC());
  }

  return { ...league, unemployedCoaches: coaches };
}

// ── Fire / Hire (user + AI) ────────────────────────────────────────────────────

/**
 * Fire a coach on the given team by role.
 * The fired coach is added to the unemployed pool.
 * Returns { league, error? }.
 */
export function fireCoach(
  league: League,
  teamId: string,
  role:   CoachRole,
): { league: League; error?: string } {
  const teamIdx = league.teams.findIndex(t => t.id === teamId);
  if (teamIdx === -1) return { league, error: 'Team not found.' };

  const team  = league.teams[teamIdx]!;
  const fired = role === 'HC' ? team.coaches.hc
              : role === 'OC' ? team.coaches.oc
              : team.coaches.dc;

  if (!fired) return { league, error: `No ${role} to fire.` };

  const newCoaches = {
    ...team.coaches,
    hc: role === 'HC' ? (null as unknown as Coach) : team.coaches.hc,
    oc: role === 'OC' ? null : team.coaches.oc,
    dc: role === 'DC' ? null : team.coaches.dc,
  };

  const updatedTeam   = { ...team, coaches: newCoaches };
  const updatedTeams  = league.teams.map((t, i) => i === teamIdx ? updatedTeam : t);
  const updatedPool   = [...(league.unemployedCoaches ?? []), fired];

  const year    = league.currentSeason?.year ?? 0;
  const newsItem = newsForCoachFired(fired.name, fired.role, team.name, teamId, year);

  return {
    league: addNewsItems(
      { ...league, teams: updatedTeams, unemployedCoaches: updatedPool },
      [newsItem],
    ),
  };
}

/**
 * Hire a coach from the unemployed pool for the given team and role.
 * Returns { league, error? }.
 */
export function hireCoachFromPool(
  league:  League,
  teamId:  string,
  role:    CoachRole,
  coachId: string,
): { league: League; error?: string } {
  const teamIdx  = league.teams.findIndex(t => t.id === teamId);
  if (teamIdx === -1) return { league, error: 'Team not found.' };

  const pool    = league.unemployedCoaches ?? [];
  const coach   = pool.find(c => c.id === coachId);
  if (!coach) return { league, error: 'Coach not found in available pool.' };
  if (coach.role !== role) return { league, error: `Coach is a ${coach.role}, not a ${role}.` };

  const team = league.teams[teamIdx]!;
  const newCoaches = {
    ...team.coaches,
    hc: role === 'HC' ? coach : team.coaches.hc,
    oc: role === 'OC' ? coach : team.coaches.oc,
    dc: role === 'DC' ? coach : team.coaches.dc,
  };

  const updatedTeam  = { ...team, coaches: newCoaches };
  const updatedTeams = league.teams.map((t, i) => i === teamIdx ? updatedTeam : t);
  const updatedPool  = pool.filter(c => c.id !== coachId);

  const year     = league.currentSeason?.year ?? 0;
  const newsItem = newsForCoachHired(coach.name, coach.role, team.name, teamId, year);

  return {
    league: addNewsItems(
      { ...league, teams: updatedTeams, unemployedCoaches: updatedPool },
      [newsItem],
    ),
  };
}

/**
 * Generate and install an internal coordinator for the given team.
 * Only valid for OC/DC slots.
 */
export function promoteWithin(
  league: League,
  teamId: string,
  role:   'OC' | 'DC',
): { league: League; error?: string } {
  const teamIdx = league.teams.findIndex(t => t.id === teamId);
  if (teamIdx === -1) return { league, error: 'Team not found.' };

  const team = league.teams[teamIdx]!;
  const coordinator = generateInternalCoordinator(team.coaches.hc, role);

  const newCoaches = {
    ...team.coaches,
    oc: role === 'OC' ? coordinator : team.coaches.oc,
    dc: role === 'DC' ? coordinator : team.coaches.dc,
  };

  const updatedTeam  = { ...team, coaches: newCoaches };
  const updatedTeams = league.teams.map((t, i) => i === teamIdx ? updatedTeam : t);

  const year     = league.currentSeason?.year ?? 0;
  const newsItem = newsForCoordPromoted(coordinator.name, role, team.name, teamId, year);

  return {
    league: addNewsItems(
      { ...league, teams: updatedTeams },
      [newsItem],
    ),
  };
}

// ── AI coach carousel ─────────────────────────────────────────────────────────

/** Evaluate whether an AI team's HC should be fired. */
function shouldFireHC(teamId: string, league: League): boolean {
  const cfg    = TUNING.coaching.carousel.firing;
  const record = league.history.teamHistory[teamId];
  if (!record || record.length === 0) return false;

  const lastSeason = record[record.length - 1];
  if (!lastSeason) return false;

  const wins = lastSeason.wins;
  if (wins < cfg.belowWinThreshold)     return Math.random() < cfg.probBelowThreshold;
  if (wins < cfg.midWinThreshold)       return Math.random() < cfg.probMidWins;
  return Math.random() < cfg.probHighWins;
}

/** Auto-fill any vacant coordinator slots for an AI team using the pool. */
function autoFillCoords(team: Team, pool: Coach[]): {
  team: Team;
  pool: Coach[];
} {
  let coaches = { ...team.coaches };
  let remaining = [...pool];

  if (!coaches.oc) {
    const candidate = remaining.find(c => c.role === 'OC');
    if (candidate) {
      coaches = { ...coaches, oc: candidate };
      remaining = remaining.filter(c => c.id !== candidate.id);
    } else {
      coaches = { ...coaches, oc: generatePoolOC() };
    }
  }
  if (!coaches.dc) {
    const candidate = remaining.find(c => c.role === 'DC');
    if (candidate) {
      coaches = { ...coaches, dc: candidate };
      remaining = remaining.filter(c => c.id !== candidate.id);
    } else {
      coaches = { ...coaches, dc: generatePoolDC() };
    }
  }

  return { team: { ...team, coaches }, pool: remaining };
}

/**
 * Run the full AI coaching carousel for all non-user teams:
 * 1. Evaluate each HC — fire if warranted
 * 2. Hire replacement HC from pool (best available by overall)
 * 3. Auto-fill vacant OC/DC slots
 * 4. Replenish pool
 */
export function runAICoachCarousel(league: League): League {
  const year    = league.currentSeason?.year ?? 0;
  let   current = { ...league };
  const newsItems = [];

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue; // user manages own team

    if (shouldFireHC(team.id, current)) {
      // Fire HC — add to pool
      const fired = team.coaches.hc;
      const updatedTeam = { ...team, coaches: { ...team.coaches, hc: null as unknown as Coach } };
      current = {
        ...current,
        teams: current.teams.map(t => t.id === team.id ? updatedTeam : t),
        unemployedCoaches: [...(current.unemployedCoaches ?? []), fired],
      };
      newsItems.push(newsForCoachFired(fired.name, 'HC', team.name, team.id, year));
    }
  }

  // Hire new HCs from pool for teams that need one
  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;
    if (team.coaches.hc) continue; // already has HC

    const pool     = current.unemployedCoaches ?? [];
    const hcPool   = pool.filter(c => c.role === 'HC').sort((a, b) => b.overall - a.overall);
    let   newHC: Coach;

    if (hcPool.length > 0) {
      // Pick from top-3 available HCs with some randomness
      const candidates = hcPool.slice(0, Math.min(3, hcPool.length));
      newHC = candidates[Math.floor(Math.random() * candidates.length)]!;
      current = {
        ...current,
        unemployedCoaches: pool.filter(c => c.id !== newHC.id),
      };
    } else {
      newHC = generatePoolHC();
    }

    const updatedTeam = { ...team, coaches: { ...team.coaches, hc: newHC } };
    current = { ...current, teams: current.teams.map(t => t.id === team.id ? updatedTeam : t) };
    newsItems.push(newsForCoachHired(newHC.name, 'HC', team.name, team.id, year));
  }

  // Auto-fill vacant OC/DC for all AI teams
  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;
    if (team.coaches.oc && team.coaches.dc) continue;

    const { team: filledTeam, pool: updatedPool } = autoFillCoords(team, current.unemployedCoaches ?? []);
    current = {
      ...current,
      teams: current.teams.map(t => t.id === team.id ? filledTeam : t),
      unemployedCoaches: updatedPool,
    };
  }

  // Replenish pool
  current = replenishCoachPool(current);

  return addNewsItems(current, newsItems);
}

/**
 * Auto-fill any vacant slots on the user team using the best available from pool.
 * Called in startNextSeason as a safety net.
 */
export function autoFillUserVacancies(league: League): League {
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return league;

  const pool  = [...(league.unemployedCoaches ?? [])];
  let   team  = userTeam;
  let   year  = league.currentSeason?.year ?? 0;
  const news  = [];

  if (!team.coaches.hc) {
    const hcCandidate = pool.find(c => c.role === 'HC') ?? generatePoolHC();
    const idx = pool.findIndex(c => c.id === hcCandidate.id);
    if (idx >= 0) pool.splice(idx, 1);
    team = { ...team, coaches: { ...team.coaches, hc: hcCandidate } };
    news.push(newsForCoachHired(hcCandidate.name, 'HC', team.name, team.id, year));
  }
  if (!team.coaches.oc) {
    const ocCandidate = pool.find(c => c.role === 'OC') ?? generatePoolOC();
    const idx = pool.findIndex(c => c.id === ocCandidate.id);
    if (idx >= 0) pool.splice(idx, 1);
    team = { ...team, coaches: { ...team.coaches, oc: ocCandidate } };
    news.push(newsForCoachHired(ocCandidate.name, 'OC', team.name, team.id, year));
  }
  if (!team.coaches.dc) {
    const dcCandidate = pool.find(c => c.role === 'DC') ?? generatePoolDC();
    const idx = pool.findIndex(c => c.id === dcCandidate.id);
    if (idx >= 0) pool.splice(idx, 1);
    team = { ...team, coaches: { ...team.coaches, dc: dcCandidate } };
    news.push(newsForCoachHired(dcCandidate.name, 'DC', team.name, team.id, year));
  }

  const updatedLeague = {
    ...league,
    teams: league.teams.map(t => t.id === team.id ? team : t),
    unemployedCoaches: pool,
  };
  return news.length > 0 ? addNewsItems(updatedLeague, news) : updatedLeague;
}
