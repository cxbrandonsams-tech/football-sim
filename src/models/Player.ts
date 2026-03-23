export type Position =
  | 'QB'
  | 'RB' | 'WR' | 'TE'
  | 'OT' | 'OG' | 'C'
  | 'DE' | 'DT'
  | 'OLB' | 'MLB'
  | 'CB' | 'FS' | 'SS'
  | 'K' | 'P';

export type Trait =
  | 'high_work_ethic'  // training roll +3; better progression
  | 'injury_prone'     // double injury chance
  | 'durable'          // half injury chance
  | 'greedy'           // contract demand +20%
  | 'loyal';           // contract demand −10%

const ALL_TRAITS: Trait[] = ['high_work_ethic', 'injury_prone', 'durable', 'greedy', 'loyal'];

// 25% chance of any trait; called when createPlayer receives no explicit trait option.
function randomTrait(): Trait | undefined {
  if (Math.random() > 0.25) return undefined;
  return ALL_TRAITS[Math.floor(Math.random() * ALL_TRAITS.length)]!;
}

export function traitLabel(trait: Trait | undefined): string {
  switch (trait) {
    case 'high_work_ethic': return 'WE';
    case 'injury_prone':    return 'IP';
    case 'durable':         return 'DUR';
    case 'greedy':          return 'GRD';
    case 'loyal':           return 'LOY';
    default:                return '';
  }
}

export interface Ratings {
  skill: number;       // 1-99
  athleticism: number; // 1-99
  iq: number;          // 1-99
}

export interface ContractDemand {
  salary: number;
  years: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  age: number;
  trait?: Trait;
  contractDemand?: ContractDemand;  // set when yearsRemaining hits 1
  scoutingLevel: number;   // 0-100: how well this player is known
  trueRatings: Ratings;    // used by simulation — never shown directly
  scoutedRatings: Ratings; // shown to the GM
  overall: number;         // derived from trueRatings
  scoutedOverall: number;  // derived from scoutedRatings
  salary: number;               // cap hit per season
  yearsRemaining: number;       // seasons left on contract
  injuryWeeksRemaining: number; // 0 = healthy
}

export interface PlayerOptions {
  trait?: Trait;
  scoutingLevel?: number;  // default 60
  yearsRemaining?: number; // default random 1–3
}

// Weights must sum to 1.0 per position
const WEIGHTS: Record<Position, { skill: number; athleticism: number; iq: number }> = {
  QB:  { skill: 0.30, athleticism: 0.20, iq: 0.50 },
  RB:  { skill: 0.30, athleticism: 0.50, iq: 0.20 },
  WR:  { skill: 0.40, athleticism: 0.45, iq: 0.15 },
  TE:  { skill: 0.35, athleticism: 0.40, iq: 0.25 },
  OT:  { skill: 0.40, athleticism: 0.35, iq: 0.25 },
  OG:  { skill: 0.45, athleticism: 0.30, iq: 0.25 },
  C:   { skill: 0.35, athleticism: 0.25, iq: 0.40 },
  DE:  { skill: 0.35, athleticism: 0.50, iq: 0.15 },
  DT:  { skill: 0.40, athleticism: 0.45, iq: 0.15 },
  OLB: { skill: 0.30, athleticism: 0.50, iq: 0.20 },
  MLB: { skill: 0.30, athleticism: 0.35, iq: 0.35 },
  CB:  { skill: 0.35, athleticism: 0.50, iq: 0.15 },
  FS:  { skill: 0.25, athleticism: 0.40, iq: 0.35 },
  SS:  { skill: 0.30, athleticism: 0.45, iq: 0.25 },
  K:   { skill: 0.75, athleticism: 0.15, iq: 0.10 },
  P:   { skill: 0.75, athleticism: 0.15, iq: 0.10 },
};

export function calcOverall(position: Position, ratings: Ratings): number {
  const w = WEIGHTS[position];
  return Math.round(
    ratings.skill * w.skill +
    ratings.athleticism * w.athleticism +
    ratings.iq * w.iq
  );
}

// Salary is based on true overall: OVR 50→5, OVR 70→7, OVR 90→9
export function calcSalary(overall: number): number {
  return Math.max(1, Math.round(overall / 10));
}

export function clamp(n: number): number {
  return Math.max(1, Math.min(99, n));
}

// Variance shrinks as scoutingLevel rises: level 0 → ±25, level 100 → ±2
function scoutVariance(scoutingLevel: number): number {
  return Math.round(25 - (scoutingLevel / 100) * 23);
}

function generateScoutedRatings(trueRatings: Ratings, scoutingLevel: number): Ratings {
  const v = scoutVariance(scoutingLevel);
  const noise = () => Math.round((Math.random() - 0.5) * 2 * v);
  return {
    skill:       clamp(trueRatings.skill       + noise()),
    athleticism: clamp(trueRatings.athleticism + noise()),
    iq:          clamp(trueRatings.iq          + noise()),
  };
}

export function refreshScouting(player: Player): Player {
  const scoutedRatings = generateScoutedRatings(player.trueRatings, player.scoutingLevel);
  return { ...player, scoutedRatings, scoutedOverall: calcOverall(player.position, scoutedRatings) };
}

export function scoutBar(level: number): string {
  const filled = Math.round(level / 20);
  return '■'.repeat(filled) + '□'.repeat(5 - filled);
}

export function createPlayer(
  id: string,
  name: string,
  position: Position,
  age: number,
  trueRatings: Ratings,
  options: PlayerOptions = {},
): Player {
  const { scoutingLevel = 60, yearsRemaining = Math.floor(Math.random() * 3) + 1 } = options;
  const trait = 'trait' in options ? options.trait : randomTrait();
  const scoutedRatings = generateScoutedRatings(trueRatings, scoutingLevel);
  const overall = calcOverall(position, trueRatings);
  return {
    id,
    name,
    position,
    age,
    ...(trait !== undefined ? { trait } : {}),
    scoutingLevel,
    trueRatings,
    scoutedRatings,
    overall,
    scoutedOverall: calcOverall(position, scoutedRatings),
    salary: calcSalary(overall),
    yearsRemaining,
    injuryWeeksRemaining: 0,
  };
}
