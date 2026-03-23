export type CoachRole = 'HC' | 'OC' | 'DC';

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
  overall: number;             // 1-99 composite coaching ability
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
  oc: Coach;
  dc: Coach;
}


export function createCoach(
  id: string,
  name: string,
  role: 'HC',
  overall: number,
  opts: {
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
  opts: { offensiveScheme: OffensiveScheme; passing?: number; rushing?: number },
): Coach;
export function createCoach(
  id: string,
  name: string,
  role: 'DC',
  overall: number,
  opts: { defensiveScheme: DefensiveScheme; coverage?: number; runDefense?: number },
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
