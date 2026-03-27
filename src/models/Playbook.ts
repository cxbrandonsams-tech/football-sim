/**
 * Playbook and play type definitions.
 *
 * OffensivePlay: a named play tied to a formation, with a direct engineType
 *   that maps to the existing PlayType the simulation engine understands.
 *
 * Playbook: a reusable weighted collection of play IDs.
 *
 * OffensivePlan: maps every down/distance bucket to a playbook ID.
 *   Stored per-team. When present, the play selection layer uses it to pick
 *   a play each snap instead of the engine's default selectPlayType().
 */

import { type OffensiveSlot } from './Formation';
import { type PlayType } from './PlayEvent';

// ── Route tags ────────────────────────────────────────────────────────────────

/** Depth tag for a receiver's route in a named play. Metadata only — not used in engine math. */
export type RouteTag = 'SHORT' | 'MEDIUM' | 'DEEP';

export interface SlotRoute {
  slot:     OffensiveSlot;
  routeTag: RouteTag;
}

// ── Down & distance buckets ───────────────────────────────────────────────────

/**
 * Every snap maps to exactly one bucket, which drives playbook selection.
 *
 * Distance thresholds (yards to go):
 *   Short  = 1–3
 *   Medium = 4–6
 *   Long   = 7+
 *
 * FIRST_10 is its own bucket (the standard 1st & 10 case).
 */
export type DownDistanceBucket =
  | 'FIRST_10'
  | 'FIRST_LONG'
  | 'FIRST_MEDIUM'
  | 'FIRST_SHORT'
  | 'SECOND_LONG'
  | 'SECOND_MEDIUM'
  | 'SECOND_SHORT'
  | 'THIRD_LONG'
  | 'THIRD_MEDIUM'
  | 'THIRD_SHORT'
  | 'FOURTH_LONG'
  | 'FOURTH_MEDIUM'
  | 'FOURTH_SHORT';

// ── Offensive play ────────────────────────────────────────────────────────────

export interface OffensivePlay {
  id:               string;
  name:             string;
  /** Links to OffensiveFormation.id — determines which slot assignments apply. */
  formationId:      string;
  /** The engine PlayType this play maps to. This is what gets passed to simulatePlay(). */
  engineType:       PlayType;
  /** Optional link to playConcepts.ts for future concept-aware targeting. */
  conceptId?:       string;
  /** Route assignments per slot (pass plays). Metadata — not used by engine math. */
  routes?:          SlotRoute[];
  /** Which slot carries the ball (run plays). Metadata — not used by engine math. */
  ballCarrierSlot?: OffensiveSlot;
  /** Whether this play includes a play-action fake. */
  isPlayAction?:    boolean;
}

// ── Playbooks ─────────────────────────────────────────────────────────────────

export interface PlaybookEntry {
  playId:  string;
  weight:  number;
}

/** A named, reusable weighted collection of plays. The same play can appear in multiple playbooks. */
export interface Playbook {
  id:      string;
  name:    string;
  entries: PlaybookEntry[];
}

// ── Offensive plan ────────────────────────────────────────────────────────────

/**
 * Maps every down/distance bucket to a playbook ID.
 * Stored as an optional field on Team. When present, the play selection layer
 * uses it each snap instead of the engine's built-in selectPlayType().
 */
export type OffensivePlan = Record<DownDistanceBucket, string>;
