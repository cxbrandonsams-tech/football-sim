import {
  type Player,
  type AnyRatings,
  type DevTrait,
  calcOverall,
  calcSalary,
  clamp,
  refreshScouting,
} from '../models/Player';
import { type Coach } from '../models/Coach';
import { type Team } from '../models/Team';
import { type League } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { TUNING } from './config';

const PROG = TUNING.progression;

// ── Utility ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ── Rating helpers ────────────────────────────────────────────────────────────

/** All progressable (numeric, non-personality) field names for a given ratings object. */
function getProgressableFields(ratings: AnyRatings): string[] {
  switch (ratings.position) {
    case 'QB':
      return ['armStrength', 'pocketPresence', 'mobility', 'shortAccuracy', 'mediumAccuracy', 'deepAccuracy', 'processing', 'decisionMaking'];
    case 'RB':
      return ['speed', 'elusiveness', 'power', 'vision', 'ballSecurity'];
    case 'WR':
      return ['speed', 'routeRunning', 'hands', 'yac', 'size'];
    case 'TE':
      return ['speed', 'routeRunning', 'hands', 'yac', 'size', 'blocking'];
    case 'OT': case 'OG': case 'C':
      return ['passBlocking', 'runBlocking', 'awareness'];
    case 'DE': case 'DT':
      return ['passRush', 'runDefense', 'discipline'];
    case 'OLB': case 'MLB':
      return ['passRush', 'runDefense', 'coverage', 'speed', 'pursuit', 'awareness'];
    case 'CB':
      // Range is derived (speed*0.6 + awareness*0.4) — progressing speed/awareness develops range
      return ['manCoverage', 'zoneCoverage', 'ballSkills', 'speed', 'size', 'awareness', 'tackling'];
    case 'FS': case 'SS':
      // Range is derived — NOT progressable directly
      return ['manCoverage', 'zoneCoverage', 'ballSkills', 'speed', 'size', 'awareness', 'tackling'];
    case 'K': case 'P':
      return ['kickPower', 'kickAccuracy', 'composure'];
  }
}

function getRating(ratings: AnyRatings, key: string): number {
  return ((ratings as unknown as Record<string, unknown>)[key] as number) ?? 50;
}

function setRating(ratings: AnyRatings, key: string, value: number): AnyRatings {
  return { ...ratings, [key]: value } as AnyRatings;
}

// ── Age-band lookup ───────────────────────────────────────────────────────────

interface AgeBand {
  maxAge:        number;
  improveChance: number;
  declineChance: number;
  maxGain:       number;
  maxLoss:       number;
  numRatings:    number;
}

function getAgeBand(age: number): AgeBand {
  for (const band of PROG.ageBands) {
    if (age <= band.maxAge) return band as AgeBand;
  }
  // Fallback to last band (handles any age above 99)
  return PROG.ageBands[PROG.ageBands.length - 1] as AgeBand;
}

// ── Work Ethic modifier ───────────────────────────────────────────────────────

function getWorkEthic(player: Player): number {
  const r = player.trueRatings;
  if (r.position === 'QB') return 50; // QB has no personality ratings
  return (r as { personality?: { workEthic?: number } }).personality?.workEthic ?? 50;
}

/** Applies Work Ethic shift to the band's base improve/decline probabilities. */
function applyWorkEthic(
  band: AgeBand,
  workEthic: number,
): { improveChance: number; declineChance: number } {
  let improveChance = band.improveChance;
  let declineChance = band.declineChance;

  if (workEthic >= PROG.workEthicHighThreshold) {
    improveChance = Math.min(0.95, improveChance + PROG.workEthicImproveBonus);
    declineChance = Math.max(0.01, declineChance - PROG.workEthicDeclineSave);
  } else if (workEthic <= PROG.workEthicLowThreshold) {
    improveChance = Math.max(0.01, improveChance - PROG.workEthicImprovePenalty);
    declineChance = Math.min(0.95, declineChance + PROG.workEthicDeclineBonus);
  }

  return { improveChance, declineChance };
}

// ── Dev trait modifier ────────────────────────────────────────────────────────

const DT = TUNING.devTraits;

function applyDevTrait(
  devTrait: DevTrait,
  yearsPro: number,
  improveChance: number,
  declineChance: number,
): { improveChance: number; declineChance: number } {
  let mod: { improveBonus: number; declineSave: number };

  if (devTrait === 'lateBloomer' && yearsPro >= DT.lateBloomerPeakYears) {
    // Late bloomers hit their stride after a few pro seasons
    mod = { improveBonus: DT.lateBloomerPeakImproveBonus, declineSave: DT.lateBloomerPeakDeclineSave };
  } else {
    mod = DT[devTrait] as { improveBonus: number; declineSave: number };
  }

  const newImprove = Math.min(0.95, Math.max(0.01, improveChance + mod.improveBonus));
  // declineSave: positive saves from decline, negative adds to decline
  const newDecline = Math.min(0.95, Math.max(0.01, declineChance - mod.declineSave));
  return { improveChance: newImprove, declineChance: newDecline };
}

// ── Outcome type ──────────────────────────────────────────────────────────────

type Outcome = 'improve' | 'stable' | 'decline';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProgressionResult {
  player:  Player;
  outcome: Outcome;
  delta:   number;   // change in overall
  summary: string;   // human-readable description of what changed
}

export interface LeagueProgressionSummary {
  improved: ProgressionResult[];
  declined: ProgressionResult[];
}

// ── Coaching trait progression modifier ───────────────────────────────────────

interface CoachingProgBonus { improveBonus: number; declineSave: number; }

function computeCoachingProgBonus(player: Player, coaches: (Coach | null)[]): CoachingProgBonus {
  let improveBonus = 0;
  let declineSave  = 0;
  const tr = TUNING.coaching.traits;

  for (const coach of coaches) {
    if (!coach) continue;
    if (coach.trait === 'player_developer') {
      improveBonus += tr.playerDeveloperImproveBonus ?? 0;
      declineSave  += tr.playerDeveloperDeclineSave  ?? 0;
    }
    if (coach.trait === 'youth_developer' && (player.yearsPro ?? 0) <= 3) {
      improveBonus += tr.youthDeveloperImproveBonus ?? 0;
    }
    if (coach.trait === 'veteran_stabilizer' && player.age >= 30) {
      declineSave += tr.veteranStabilizerDeclineSave ?? 0;
    }
  }

  return { improveBonus, declineSave };
}

// ── Single player progression ─────────────────────────────────────────────────

export function progressPlayer(
  player: Player,
  coachingBonus?: CoachingProgBonus,
): ProgressionResult {
  const band = getAgeBand(player.age);
  const we   = getWorkEthic(player);
  const afterWE = applyWorkEthic(band, we);
  const { improveChance, declineChance } = applyDevTrait(
    player.devTrait ?? 'normal',
    player.yearsPro ?? 0,
    afterWE.improveChance,
    afterWE.declineChance,
  );

  // Apply coaching trait bonuses
  const finalImprove = Math.min(0.95, improveChance + (coachingBonus?.improveBonus ?? 0));
  const finalDecline = Math.max(0.01, declineChance - (coachingBonus?.declineSave  ?? 0));

  // Determine outcome
  const roll = Math.random();
  let outcome: Outcome;
  if      (roll < finalImprove)            outcome = 'improve';
  else if (roll < 1.0 - finalDecline)      outcome = 'stable';
  else                                     outcome = 'decline';

  // Apply rating changes
  const fields  = getProgressableFields(player.trueRatings);
  let   ratings = player.trueRatings;
  const parts: string[] = [];

  if (outcome !== 'stable') {
    // Shuffle and pick the target ratings
    const shuffled = [...fields].sort(() => Math.random() - 0.5);
    const count    = band.numRatings;

    for (let i = 0; i < count; i++) {
      const key = shuffled[i];
      if (!key) break;
      const current = getRating(ratings, key);
      const mag     = outcome === 'improve'
        ? randInt(1, band.maxGain)
        : -randInt(1, band.maxLoss);
      const newVal = clamp(current + mag);
      if (newVal !== current) {
        ratings = setRating(ratings, key, newVal);
        parts.push(`${mag > 0 ? '+' : ''}${mag} ${key}`);
      }
    }
  }

  // Stamina drift: outcome-driven direction + small random component
  const staminaDir   = outcome === 'improve'
    ? PROG.staminaGainPerImprove
    : outcome === 'decline' ? -PROG.staminaLossPerDecline : 0;
  const staminaRnd   = randInt(-PROG.staminaRandomRange, PROG.staminaRandomRange);
  const newStamina   = Math.max(1, Math.min(99, (player.stamina ?? 60) + staminaDir + staminaRnd));

  const prevOverall   = player.overall;
  const updatedPlayer = refreshScouting({
    ...player,
    age:                  player.age + 1,
    yearsPro:             (player.yearsPro ?? 0) + 1,
    stamina:              newStamina,
    trueRatings:          ratings,
    overall:              calcOverall(ratings),
    injuryWeeksRemaining: 0,
  });

  return {
    player:  updatedPlayer,
    outcome,
    delta:   updatedPlayer.overall - prevOverall,
    summary: parts.join(', ') || (outcome === 'stable' ? 'no change' : 'minimal change'),
  };
}

// ── League-wide progression ───────────────────────────────────────────────────

function progressRoster(
  roster:  Player[],
  coaches: (Coach | null)[],
): { roster: Player[]; results: ProgressionResult[] } {
  const results   = roster.map(p => progressPlayer(p, computeCoachingProgBonus(p, coaches)));
  const newRoster = results.map(r => r.player);
  return { roster: newRoster, results };
}

export function progressLeague(league: League): { league: League; summary: LeagueProgressionSummary } {
  const improved: ProgressionResult[] = [];
  const declined: ProgressionResult[] = [];
  const newFreeAgents: Player[] = [];

  const updatedTeams: Team[] = league.teams.map(team => {
    const isUserTeam = team.id === league.userTeamId;
    const coaches: (Coach | null)[] = [team.coaches.hc, team.coaches.oc, team.coaches.dc];
    const { roster, results } = progressRoster(team.roster, coaches);

    for (const r of results) {
      if (r.delta > 0) improved.push(r);
      if (r.delta < 0) declined.push(r);
    }

    const active: Player[]  = [];
    const expired: Player[] = [];
    for (const p of roster) {
      const years = p.yearsRemaining - 1;
      if (years <= 0) {
        expired.push({ ...p, yearsRemaining: 0 });
      } else if (years === 1 && !p.contractDemand) {
        // Final year — generate extension demand
        const greed = (() => {
          const r = p.trueRatings;
          if (r.position === 'QB') return 50;
          return (r as { personality?: { greed?: number } }).personality?.greed ?? 50;
        })();
        const loyalty = (() => {
          const r = p.trueRatings;
          if (r.position === 'QB') return 50;
          return (r as { personality?: { loyalty?: number } }).personality?.loyalty ?? 50;
        })();
        let demandSalary = Math.max(p.salary, calcSalary(p.overall));
        if (greed  >= 70) demandSalary = Math.ceil(demandSalary  * 1.2);
        if (loyalty >= 70) demandSalary = Math.floor(demandSalary * 0.9);
        demandSalary = Math.max(1, demandSalary);
        const demandYears = p.age < 26 ? 4 : p.age < 30 ? 3 : p.age < 33 ? 2 : 1;
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

  const updatedFreeAgents = [
    ...league.freeAgents.map(p => progressPlayer(p).player),
    ...newFreeAgents,
  ];

  return {
    league: {
      ...league,
      teams:            updatedTeams,
      freeAgents:       updatedFreeAgents,
      scoutingBudget:   league.budgetAllocation.scouting,
      developmentBudget: league.budgetAllocation.development,
    },
    summary: { improved, declined },
  };
}
