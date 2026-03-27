import { type Player } from './Player';
import { type Coach, type CoachingStaff } from './Coach';
import { type DepthChart, buildDepthChart, getStarters } from './DepthChart';
import { type PlaycallingWeights, DEFAULT_PLAYCALLING, clampWeights } from './Playcalling';
import { type HeadScout } from './Scout';
import { type ProspectScoutingState } from './Prospect';
import { type FormationDepthCharts } from './Formation';
import { type Playbook, type OffensivePlan } from './Playbook';
import { type PackageDepthCharts } from './DefensivePackage';
import { type DefensivePlan, type DefensivePlaybook as DefPlaybookModel } from './DefensivePlaybook';

// ── Gameplan types ─────────────────────────────────────────────────────────────

export type DefensiveFocus    = 'balanced' | 'stop_inside_run' | 'stop_outside_run' | 'stop_short_pass' | 'stop_deep_pass';
export type OffensivePlaybook = 'balanced' | 'spread' | 'power_run' | 'vertical' | 'west_coast';
export type DefensivePlaybook = 'balanced' | 'four_three' | 'three_four' | 'nickel_heavy' | 'zone_heavy';
export type Tempo             = 'slow' | 'normal' | 'fast';
export type PlayActionUsage   = 'low' | 'medium' | 'high';
export type PassEmphasis      = 'conservative' | 'balanced' | 'aggressive';
export type RunEmphasis       = 'light' | 'balanced' | 'heavy';

export interface GameplanSettings {
  passEmphasis:      PassEmphasis;
  runEmphasis:       RunEmphasis;
  tempo:             Tempo;
  playAction:        PlayActionUsage;
  defensiveFocus:    DefensiveFocus;
  offensivePlaybook: OffensivePlaybook;
  defensivePlaybook: DefensivePlaybook;
}

export const DEFAULT_GAMEPLAN: GameplanSettings = {
  passEmphasis:      'balanced',
  runEmphasis:       'balanced',
  tempo:             'normal',
  playAction:        'medium',
  defensiveFocus:    'balanced',
  offensivePlaybook: 'balanced',
  defensivePlaybook: 'balanced',
};

/**
 * Translate high-level gameplan settings into raw playcalling weights.
 * passEmphasis drives runPct; runEmphasis drives insideRunPct;
 * offensivePlaybook drives the pass depth distribution.
 */
export function derivePlaycalling(g: GameplanSettings): PlaycallingWeights {
  // Base run percentage from pass emphasis
  const runPctMap: Record<PassEmphasis, number> = { conservative: 55, balanced: 42, aggressive: 28 };
  // Inside-run fraction from run emphasis
  const insideRunPctMap: Record<RunEmphasis, number> = { light: 40, balanced: 55, heavy: 70 };
  // Pass depth from offensive playbook
  const passMap: Record<OffensivePlaybook, { short: number; medium: number }> = {
    balanced:   { short: 40, medium: 35 },
    spread:     { short: 50, medium: 30 },
    power_run:  { short: 35, medium: 35 },
    vertical:   { short: 25, medium: 30 },
    west_coast: { short: 55, medium: 35 },
  };
  const { short, medium } = passMap[g.offensivePlaybook];
  return clampWeights({
    runPct:        runPctMap[g.passEmphasis],
    insideRunPct:  insideRunPctMap[g.runEmphasis],
    shortPassPct:  short,
    mediumPassPct: medium,
  });
}

// ── Front-office personality ──────────────────────────────────────────────────

/**
 * Persistent front-office building philosophy for a CPU-controlled team.
 * Influences draft, free-agency, trade, and coaching carousel decisions.
 * Does not override football logic — biases it.
 */
export type FrontOfficePersonality =
  | 'balanced'       // Even-handed; no strong bias
  | 'aggressive'     // Prioritises impact; willing to spend and take risks
  | 'conservative'   // Patient and value-driven; avoids overpaying
  | 'win_now'        // Maximises present-window; trades future for today
  | 'rebuilder'      // Trades veterans for youth and picks; builds long-term
  | 'development';   // Invests in young players; tolerates short-term losses

// ── Team ──────────────────────────────────────────────────────────────────────

export interface Team {
  id:           string;
  name:         string;
  abbreviation: string;
  ownerId?:     string;
  roster:       Player[];
  depthChart:   DepthChart;
  coaches:      CoachingStaff;
  /** Offensive playcalling weights — derived from gameplan or set directly. */
  playcalling:  PlaycallingWeights;
  /** High-level strategic settings for this team. */
  gameplan?:    GameplanSettings;
  /** Conference this team belongs to (e.g. 'IC', 'SC') */
  conference?:  string;
  /** Division within the conference (e.g. 'East', 'West', 'North', 'South') */
  division?:    string;

  // ── Scouting ──────────────────────────────────────────────────────────────
  /** Head Scout — affects scouting report quality/reliability */
  scout?:            HeadScout;
  /** Budget tier (1–10); multiplied by TUNING.scouting.pointsPerBudgetUnit → scoutingPoints */
  scoutingBudget?:   number;
  /** Remaining scouting points for the current draft cycle */
  scoutingPoints?:   number;
  /** Per-prospect scouting progress for this team; keyed by prospectId */
  scoutingData?:     Record<string, ProspectScoutingState>;
  /** Ordered list of prospect IDs this team wants to target */
  draftBoard?:       string[];
  /** Persistent front-office building philosophy (CPU teams only). */
  frontOffice?:      FrontOfficePersonality;

  // ── Playbook / formation system ────────────────────────────────────────────
  /**
   * Formation-specific slot assignments: formationId → { slot → playerId }.
   * Applied to the positional depth chart before each play when a play is
   * selected from offensivePlan. Falls back to the base depthChart when unset.
   */
  formationDepthCharts?: FormationDepthCharts;
  /**
   * Maps every down/distance bucket to a playbook ID.
   * When present, play selection uses this plan instead of the engine's
   * built-in selectPlayType() logic.
   */
  offensivePlan?:        OffensivePlan;

  // ── Defensive package system ────────────────────────────────────────────────
  /**
   * Package-specific slot assignments: packageId → { slot → playerId }.
   * Applied to the defensive depth chart before each play when a play is
   * selected from defensivePlan. Falls back to the base depthChart when unset.
   */
  packageDepthCharts?: PackageDepthCharts;
  /**
   * Maps every down/distance bucket to a defensive playbook ID.
   * When present, defensive play selection uses this plan instead of leaving
   * the depth chart unmodified.
   */
  defensivePlan?:      DefensivePlan;

  // ── Custom playbooks (GM-created) ───────────────────────────────────────────
  /** Offensive playbooks created by the team's GM. Merged with built-ins during play selection. */
  customOffensivePlaybooks?: Playbook[];
  /** Defensive playbooks created by the team's GM. Merged with built-ins during play selection. */
  customDefensivePlaybooks?: DefPlaybookModel[];
}

export function createTeam(
  id:           string,
  name:         string,
  abbreviation: string,
  roster:       Player[],
  coaches:      CoachingStaff,
  opts: {
    conference?:    string;
    division?:      string;
    playcalling?:   PlaycallingWeights;
    gameplan?:      GameplanSettings;
    scout?:         HeadScout;
    scoutingBudget?: number;
    frontOffice?:   FrontOfficePersonality;
  } = {},
): Team {
  const gameplan = opts.gameplan ?? DEFAULT_GAMEPLAN;
  return {
    id,
    name,
    abbreviation,
    roster,
    depthChart: buildDepthChart(roster),
    coaches,
    playcalling: opts.playcalling ?? derivePlaycalling(gameplan),
    gameplan,
    ...(opts.conference    !== undefined && { conference:    opts.conference }),
    ...(opts.division      !== undefined && { division:      opts.division   }),
    ...(opts.scout         !== undefined && { scout:         opts.scout }),
    ...(opts.scoutingBudget !== undefined && {
      scoutingBudget:  opts.scoutingBudget,
      scoutingPoints:  opts.scoutingBudget * 30,  // initial allocation
      scoutingData:    {} as Record<string, ProspectScoutingState>,
      draftBoard:      [] as string[],
    }),
    ...(opts.frontOffice !== undefined && { frontOffice: opts.frontOffice }),
  };
}

export function getTeamOverall(team: Team): number {
  const players = getStarters(team.depthChart);
  if (players.length === 0) {
    if (team.roster.length === 0) return 0;
    return Math.round(team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length);
  }
  return Math.round(players.reduce((sum, p) => sum + p.scoutedOverall, 0) / players.length);
}

/** Convenience: find a coach on any team by id. */
export function findCoach(team: Team, coachId: string): Coach | undefined {
  const { hc, oc, dc } = team.coaches;
  return [hc, oc, dc].filter((c): c is Coach => c !== null).find(c => c.id === coachId);
}
