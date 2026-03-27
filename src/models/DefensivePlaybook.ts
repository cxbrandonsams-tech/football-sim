/**
 * Defensive playbook and play type definitions.
 *
 * DefensivePlay: a named defensive call tied to a package (personnel grouping),
 *   with coverage and front metadata for display purposes.
 *
 * DefensivePlaybook: a reusable weighted collection of defensive play IDs.
 *
 * DefensivePlan: maps every down/distance bucket to a defensive playbook ID.
 *   Stored per-team. When present, the defensive selection layer uses it to
 *   deploy the right package each snap.
 *
 * Engine effect: by remapping DE/DT/LB/CB/S depth chart indices, the package
 *   controls which specific players the engine reads for run and pass defense.
 *   No engine math is changed.
 */

import { type DownDistanceBucket } from './Playbook';

// ── Coverage and front labels ─────────────────────────────────────────────────

/** High-level defensive front alignment. Metadata only — not used in engine math. */
export type DefensiveFront =
  | 'four_three'
  | 'three_four'
  | 'nickel'
  | 'dime'
  | 'quarter'
  | 'goal_line';

/** Coverage shell being played. Metadata only — not used in engine math. */
export type DefensiveCoverage =
  | 'cover_0'   // All-out man, no deep help
  | 'cover_1'   // Man-free: one high safety
  | 'cover_2'   // Two safeties split the deep halves (zone)
  | 'cover_3'   // Three-deep zone, four underneath
  | 'cover_4'   // Quarters coverage: four deep zones
  | 'cover_6'   // Quarter-Quarter-Half hybrid
  | 'tampa_2'   // Cover-2 with MLB dropping to middle deep
  | 'man_under' // Man coverage with two safeties over top
  ;

/** Blitz pressure tag. Metadata only — not used in engine math. */
export type BlitzTag =
  | 'lb_blitz'    // Linebacker blitz
  | 'cb_blitz'    // Cornerback blitz
  | 'safety_blitz'// Safety blitz
  | 'zone_blitz'  // Zone blitz (drop a lineman, rush a DB/LB)
  ;

// ── Defensive play ─────────────────────────────────────────────────────────────

export interface DefensivePlay {
  id:          string;
  name:        string;
  /** Links to DefensivePackage.id — determines which slot assignments apply. */
  packageId:   string;
  /** Front alignment (display metadata). */
  front:       DefensiveFront;
  /** Coverage being played (display metadata). */
  coverage:    DefensiveCoverage;
  /** Blitz tag, if any (display metadata). */
  blitz?:      BlitzTag;
}

// ── Defensive playbooks ────────────────────────────────────────────────────────

export interface DefensivePlaybookEntry {
  playId:  string;
  weight:  number;
}

/** A named, reusable weighted collection of defensive plays. */
export interface DefensivePlaybook {
  id:      string;
  name:    string;
  entries: DefensivePlaybookEntry[];
}

// ── Defensive plan ─────────────────────────────────────────────────────────────

/**
 * Maps every down/distance bucket to a defensive playbook ID.
 * Stored as an optional field on Team. When present, the defensive selection layer
 * uses it each snap instead of leaving the depth chart unmodified.
 */
export type DefensivePlan = Record<DownDistanceBucket, string>;

// Re-export DownDistanceBucket for convenience
export type { DownDistanceBucket };
