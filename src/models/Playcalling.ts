/**
 * User-controlled offensive playcalling weights.
 * All values are 0–100 integers representing percentages.
 *
 * runPct          — % of plays that are runs (rest are passes)
 * insideRunPct    — % of runs that go inside (rest go outside)
 * shortPassPct    — % of passes that are short
 * mediumPassPct   — % of passes that are medium (rest are deep)
 *
 * deepPassPct is implicit: 100 - shortPassPct - mediumPassPct
 */
export interface PlaycallingWeights {
  runPct:       number;
  insideRunPct: number;
  shortPassPct: number;
  mediumPassPct: number;
}

export const DEFAULT_PLAYCALLING: PlaycallingWeights = {
  runPct:        42,
  insideRunPct:  55,
  shortPassPct:  40,
  mediumPassPct: 35,
};

/** Clamp each field to [5, 95] so the sim always has some probability. */
export function clampWeights(w: PlaycallingWeights): PlaycallingWeights {
  const clamp = (v: number) => Math.max(5, Math.min(95, v));
  return {
    runPct:        clamp(w.runPct),
    insideRunPct:  clamp(w.insideRunPct),
    shortPassPct:  clamp(w.shortPassPct),
    mediumPassPct: clamp(w.mediumPassPct),
  };
}
