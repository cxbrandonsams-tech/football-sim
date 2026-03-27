import { type Player, type AnyRatings, calcOverall, clamp, refreshScouting } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';

/** A training focus is any valid gameplay rating field name for the player's position. */
export type TrainingFocus = string;

// ── Trainable fields per position ─────────────────────────────────────────────

export function getTrainableFields(ratings: AnyRatings): { key: string; label: string }[] {
  switch (ratings.position) {
    case 'QB': return [
      { key: 'armStrength',    label: 'Arm Strength' },
      { key: 'pocketPresence', label: 'Pocket Presence' },
      { key: 'mobility',       label: 'Mobility' },
      { key: 'shortAccuracy',  label: 'Short Accuracy' },
      { key: 'mediumAccuracy', label: 'Medium Accuracy' },
      { key: 'deepAccuracy',   label: 'Deep Accuracy' },
      { key: 'processing',     label: 'Processing' },
      { key: 'decisionMaking', label: 'Decision Making' },
    ];
    case 'RB': return [
      { key: 'speed',        label: 'Speed' },
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'power',        label: 'Power' },
      { key: 'agility',      label: 'Agility' },
      { key: 'vision',       label: 'Vision' },
      { key: 'ballSecurity', label: 'Ball Security' },
    ];
    case 'WR': return [
      { key: 'speed',        label: 'Speed' },
      { key: 'catching',     label: 'Catching' },
      { key: 'routeRunning', label: 'Route Running' },
      { key: 'separation',   label: 'Separation' },
      { key: 'release',      label: 'Release' },
    ];
    case 'TE': return [
      { key: 'catching',     label: 'Catching' },
      { key: 'routeRunning', label: 'Route Running' },
      { key: 'blocking',     label: 'Blocking' },
      { key: 'speed',        label: 'Speed' },
      { key: 'strength',     label: 'Strength' },
    ];
    case 'OT': case 'OG': case 'C': return [
      { key: 'passBlocking', label: 'Pass Blocking' },
      { key: 'runBlocking',  label: 'Run Blocking' },
      { key: 'awareness',    label: 'Awareness' },
      { key: 'discipline',   label: 'Discipline' },
    ];
    case 'DE': case 'DT': return [
      { key: 'passRush',    label: 'Pass Rush' },
      { key: 'runStop',     label: 'Run Stop' },
      { key: 'strength',    label: 'Strength' },
      { key: 'athleticism', label: 'Athleticism' },
      { key: 'motor',       label: 'Motor' },
    ];
    case 'OLB': case 'MLB': return [
      { key: 'runDefense',  label: 'Run Defense' },
      { key: 'coverage',    label: 'Coverage' },
      { key: 'speed',       label: 'Speed' },
      { key: 'pursuit',     label: 'Pursuit' },
      { key: 'awareness',   label: 'Awareness' },
      { key: 'discipline',  label: 'Discipline' },
    ];
    case 'CB': return [
      { key: 'manCoverage',  label: 'Man Coverage' },
      { key: 'zoneCoverage', label: 'Zone Coverage' },
      { key: 'ballSkills',   label: 'Ball Skills' },
      { key: 'speed',        label: 'Speed' },
      { key: 'discipline',   label: 'Discipline' },
    ];
    case 'FS': case 'SS': return [
      { key: 'zoneCoverage', label: 'Zone Coverage' },
      { key: 'manCoverage',  label: 'Man Coverage' },
      { key: 'ballSkills',   label: 'Ball Skills' },
      { key: 'awareness',    label: 'Awareness' },
      { key: 'discipline',   label: 'Discipline' },
    ];
    case 'K': case 'P': return [
      { key: 'kickPower',    label: 'Kick Power' },
      { key: 'kickAccuracy', label: 'Kick Accuracy' },
      { key: 'composure',    label: 'Composure' },
    ];
  }
}

// ── Cost ──────────────────────────────────────────────────────────────────────

export function trainingCost(age: number): number {
  if (age < 23) return 1;
  if (age < 27) return 2;
  if (age < 31) return 3;
  return 4;
}

// ── Work Ethic bonus ──────────────────────────────────────────────────────────

function workEthicBonus(player: Player): number {
  const r = player.trueRatings;
  if (r.position === 'QB') return 0;
  const we = (r as { personality?: { workEthic?: number } }).personality?.workEthic ?? 50;
  return we >= 80 ? 3 : 0;
}

// ── Roll ──────────────────────────────────────────────────────────────────────

const DC_SUCCESS = 12;
const DC_CRIT    = 18;

export interface TrainingResult {
  roll:    number;
  total:   number;
  gain:    number;
  focus:   TrainingFocus;
  cost:    number;
}

function applyGain(ratings: AnyRatings, focus: string, gain: number): AnyRatings {
  const current = ((ratings as unknown as Record<string, unknown>)[focus] as number) ?? 50;
  return { ...ratings, [focus]: clamp(current + gain) } as AnyRatings;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function trainPlayer(
  league:   League,
  playerId: string,
  focus:    TrainingFocus,
): { league: League; result?: TrainingResult; error?: string } {
  const userTeam = getUserTeam(league);
  const player   = userTeam.roster.find(p => p.id === playerId);

  if (!player) return { league, error: 'Player not found on your roster.' };

  const cost = trainingCost(player.age);
  if (league.developmentBudget < cost) {
    return { league, error: `Not enough development points (need ${cost}, have ${league.developmentBudget}).` };
  }

  const roll   = Math.ceil(Math.random() * 20);
  const total  = roll + workEthicBonus(player);
  const gain   = total >= DC_CRIT ? 4 : total >= DC_SUCCESS ? 2 : 0;

  const newTrueRatings = applyGain(player.trueRatings, focus, gain);
  const updatedPlayer  = refreshScouting({
    ...player,
    trueRatings: newTrueRatings,
    overall:     calcOverall(newTrueRatings),
  });

  const newRoster    = userTeam.roster.map(p => p.id === playerId ? updatedPlayer : p);
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedLeague: League = {
    ...league,
    teams:            league.teams.map(t => t.id === userTeam.id ? updatedTeam : t),
    developmentBudget: league.developmentBudget - cost,
  };

  return { league: updatedLeague, result: { roll, total, gain, focus, cost } };
}
