import { TUNING } from './config';

// ── Defensive gameplan types ──────────────────────────────────────────────────

export type DefensiveGameplanType =
  | 'balanced'
  | 'stop_inside_run'
  | 'stop_outside_run'
  | 'stop_short_pass'
  | 'stop_deep_pass';

/**
 * Additive modifiers applied to play success rates.
 * Positive = helps offense; negative = hurts offense (or helps defense).
 * Modifiers represent realistic tradeoffs — specializing vs. one attack weakens
 * resistance to another.
 */
export interface GameplanModifiers {
  insideRunOffense:  number; // offense inside run success modifier
  insideRunDefense:  number; // defense inside run resist modifier
  outsideRunOffense: number;
  outsideRunDefense: number;
  shortPassDefense:  number; // defense short pass resist modifier
  deepPassDefense:   number; // defense deep pass resist modifier
}

export interface DefensiveGameplan {
  type:      DefensiveGameplanType;
  modifiers: GameplanModifiers;
}

const ZERO_MODIFIERS: GameplanModifiers = {
  insideRunOffense:  0,
  insideRunDefense:  0,
  outsideRunOffense: 0,
  outsideRunDefense: 0,
  shortPassDefense:  0,
  deepPassDefense:   0,
};

const cfg = TUNING.gameplan;

/**
 * Build the GameplanModifiers for a given defensive focus.
 * All modifiers are additive to the base success-chance calculation.
 */
export function buildGameplan(type: DefensiveGameplanType): DefensiveGameplan {
  switch (type) {
    case 'balanced':
      return { type, modifiers: { ...ZERO_MODIFIERS } };

    case 'stop_inside_run':
      return {
        type,
        modifiers: {
          ...ZERO_MODIFIERS,
          insideRunOffense: cfg.stopInsideRun.offSuccessPenalty,
          insideRunDefense: cfg.stopInsideRun.defResistBonus,
          shortPassDefense: cfg.stopInsideRun.passCost,
          deepPassDefense:  cfg.stopInsideRun.passCost,
        },
      };

    case 'stop_outside_run':
      return {
        type,
        modifiers: {
          ...ZERO_MODIFIERS,
          outsideRunOffense: cfg.stopOutsideRun.offSuccessPenalty,
          outsideRunDefense: cfg.stopOutsideRun.defResistBonus,
          shortPassDefense:  cfg.stopOutsideRun.passCost,
          deepPassDefense:   cfg.stopOutsideRun.passCost,
        },
      };

    case 'stop_short_pass':
      return {
        type,
        modifiers: {
          ...ZERO_MODIFIERS,
          shortPassDefense:  cfg.stopShortPass.defResistBonus,
          insideRunDefense:  cfg.stopShortPass.runCost,
          outsideRunDefense: cfg.stopShortPass.runCost,
        },
      };

    case 'stop_deep_pass':
      return {
        type,
        modifiers: {
          ...ZERO_MODIFIERS,
          deepPassDefense:  cfg.stopDeepPass.defResistBonus,
          shortPassDefense: cfg.stopDeepPass.shortPassCost,
          insideRunDefense: cfg.stopDeepPass.runCost,
          outsideRunDefense: cfg.stopDeepPass.runCost,
        },
      };
  }
}
