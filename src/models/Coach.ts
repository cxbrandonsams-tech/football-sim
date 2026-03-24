export type CoachRole = 'HC' | 'OC' | 'DC';

export type CoachPersonality = 'conservative' | 'balanced' | 'aggressive';

export type CoachTrait =
  // Team-Building
  | 'talent_evaluator'      // +scouting actions per season
  | 'contract_negotiator'   // FA salaries cheaper
  // Gameplay — Offense
  | 'offensive_pioneer'     // play-action / explosive-play bonus
  | 'quarterback_guru'      // QB efficiency / INT reduction bonus
  | 'run_game_specialist'   // run-game success bonus
  // Gameplay — Defense
  | 'defensive_architect'   // coverage / defensive consistency bonus
  | 'pass_rush_specialist'  // sack / pressure bonus
  | 'turnover_machine'      // interception / turnover generation bonus
  // Development
  | 'player_developer'      // progression + / regression -
  | 'youth_developer'       // progression boost for yearsPro <= 3
  | 'veteran_stabilizer';   // regression reduction for older players

export type OffensiveScheme =
  | 'balanced'       // no strong tendency
  | 'short_passing'  // timing routes, high completion %
  | 'deep_passing'   // vertical attack
  | 'run_inside'     // power run between the tackles
  | 'run_outside';   // speed option, outside zone

export type DefensiveScheme =
  | 'balanced'        // no strong tendency
  | 'run_focus'       // stack the box
  | 'speed_defense'   // athletic, fast pursuit
  | 'stop_short_pass' // underneath coverage, press
  | 'stop_deep_pass'  // two-high safety shells
  | 'aggressive';     // pressure-heavy, risk/reward

export interface Coach {
  id: string;
  name: string;
  role: CoachRole;
  overall: number;                  // 1-99 composite coaching ability
  personality?: CoachPersonality;   // optional for backward compat; defaults to 'balanced'
  trait?: CoachTrait;               // one visible coaching trait
  // HC — scheme preferences used for HC+OC / HC+DC alignment bonus
  leadership?: number;
  gameManagement?: number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  // OC
  passing?: number;
  rushing?: number;
  // DC
  coverage?: number;
  runDefense?: number;
}

export interface CoachingStaff {
  hc: Coach;
  oc: Coach | null;   // null = vacant (offseason only)
  dc: Coach | null;   // null = vacant (offseason only)
}

/** Resolve personality with fallback for legacy data. */
export function getPersonality(coach: Coach | null): CoachPersonality {
  return coach?.personality ?? 'balanced';
}

export function createCoach(
  id: string,
  name: string,
  role: 'HC',
  overall: number,
  opts: {
    personality?: CoachPersonality;
    trait?: CoachTrait;
    leadership?: number;
    gameManagement?: number;
    offensiveScheme?: OffensiveScheme;
    defensiveScheme?: DefensiveScheme;
  },
): Coach;
export function createCoach(
  id: string,
  name: string,
  role: 'OC',
  overall: number,
  opts: {
    personality?: CoachPersonality;
    trait?: CoachTrait;
    offensiveScheme: OffensiveScheme;
    passing?: number;
    rushing?: number;
  },
): Coach;
export function createCoach(
  id: string,
  name: string,
  role: 'DC',
  overall: number,
  opts: {
    personality?: CoachPersonality;
    trait?: CoachTrait;
    defensiveScheme: DefensiveScheme;
    coverage?: number;
    runDefense?: number;
  },
): Coach;
export function createCoach(
  id: string,
  name: string,
  role: CoachRole,
  overall: number,
  opts: Record<string, unknown> = {},
): Coach {
  return { id, name, role, overall, ...opts };
}
