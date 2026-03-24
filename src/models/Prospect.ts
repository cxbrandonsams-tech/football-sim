/**
 * Draft prospect model.
 *
 * Prospects have two tiers of data:
 *   Public   — always visible: id, name, position, age, college, height, weight
 *   Hidden   — trueOverall, trueRatings, truePotential, trueRound
 *              These fields MUST be stripped (see sanitizeLeagueForClient in server.ts)
 *              before the League object is sent to the frontend.
 *
 * Per-team scouting progress is tracked in ProspectScoutingState and lives on Team.
 */

import { type AnyRatings, type DevTrait } from './Player';

// ── Tiers / confidence ────────────────────────────────────────────────────────

export type ProspectTier    = 'elite' | 'day1' | 'day2' | 'day3' | 'udfa';
export type ScoutConfidence = 'low' | 'medium' | 'high';

// ── Scouting report (what the GM sees after each scouting pass) ───────────────

export interface ScoutingReport {
  /** Projected round range, e.g. { min: 1, max: 3 } */
  projectedRound: { min: number; max: number };
  /** Human-readable grade label, e.g. "Day 2 prospect" */
  grade:          string;
  strengths:      string[];
  weaknesses:     string[];
  confidence:     ScoutConfidence;
  /** Narrative notes from the scout */
  notes:          string;
}

// ── Per-team scouting state for a single prospect ─────────────────────────────

export interface ProspectScoutingState {
  prospectId:  string;
  /** 0 = not scouted; 1–3 = scouting passes completed */
  scoutLevel:  0 | 1 | 2 | 3;
  pointsSpent: number;
  /** null until the first scouting pass is done */
  report:      ScoutingReport | null;
}

// ── Prospect ──────────────────────────────────────────────────────────────────

export interface Prospect {
  id:       string;
  name:     string;
  position: string;
  age:      number;
  college:  string;
  height:   string;   // display string, e.g. "6'2\""
  weight:   number;   // lbs

  // ── Hidden truth (never sent to frontend) ───────────────────────────────────
  trueOverall:   number;
  trueRatings:   AnyRatings;
  truePotential: ProspectTier;
  trueRound:     number;   // ideal draft round 1–7
  devTrait:      DevTrait; // hidden development archetype, assigned at draft
}

/** The safe client-facing shape: all hidden fields omitted. */
export type ClientProspect = Omit<Prospect, 'trueOverall' | 'trueRatings' | 'truePotential' | 'trueRound' | 'devTrait'>;

// ── Draft class ───────────────────────────────────────────────────────────────

export interface DraftClass {
  year:      number;
  prospects: Prospect[];
}
