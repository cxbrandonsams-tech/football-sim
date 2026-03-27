/**
 * Defensive package type definitions.
 *
 * Defensive plays reference package slots (DE1, DE2, NT, LB1, CB1, NCB, FS, etc.).
 * Package depth charts map those slots to specific player IDs.
 * The selection layer applies these assignments to the positional depth chart
 * before the engine executes the play — no engine math changes required.
 *
 * Slot → positional depth chart index mapping:
 *   DE1  → DE[0]    DE2  → DE[1]
 *   DT1  → DT[0]    DT2  → DT[1]    NT → DT[0]
 *   LB1  → LB[0]    LB2  → LB[1]    LB3 → LB[2]    LB4 → LB[3]
 *   OLB1 → LB[0]    OLB2 → LB[1]    ILB1 → LB[2]   ILB2 → LB[3]
 *   CB1  → CB[0]    CB2  → CB[1]    NCB → CB[2]     DC1 → CB[3]   DC2 → CB[4]
 *   FS   → S[0]     SS   → S[1]
 */

// ── Defensive slot labels ──────────────────────────────────────────────────────

/**
 * All valid slot labels across all defensive packages.
 * Each package defines which subset of these slots it uses.
 */
export type DefensiveSlot =
  | 'DE1' | 'DE2'
  | 'DT1' | 'DT2' | 'NT'
  | 'LB1' | 'LB2' | 'LB3' | 'LB4'
  | 'OLB1' | 'OLB2' | 'ILB1' | 'ILB2'
  | 'CB1' | 'CB2' | 'NCB' | 'DC1' | 'DC2'
  | 'FS' | 'SS';

/** Descriptive name for each slot label (displayed in UI). */
export const DEFENSIVE_SLOT_LABELS: Record<DefensiveSlot, string> = {
  DE1:  'DE1 — Defensive End',
  DE2:  'DE2 — Defensive End',
  DT1:  'DT1 — Defensive Tackle',
  DT2:  'DT2 — Defensive Tackle',
  NT:   'NT — Nose Tackle',
  LB1:  'LB1 — Linebacker',
  LB2:  'LB2 — Linebacker',
  LB3:  'LB3 — Linebacker',
  LB4:  'LB4 — Linebacker',
  OLB1: 'OLB1 — Outside Linebacker',
  OLB2: 'OLB2 — Outside Linebacker',
  ILB1: 'ILB1 — Inside Linebacker',
  ILB2: 'ILB2 — Inside Linebacker',
  CB1:  'CB1 — Cornerback',
  CB2:  'CB2 — Cornerback',
  NCB:  'NCB — Nickel Back',
  DC1:  'DC1 — Dime Back',
  DC2:  'DC2 — Second Dime Back',
  FS:   'FS — Free Safety',
  SS:   'SS — Strong Safety',
};

/** Positions eligible to be assigned to each defensive slot. */
export const DEFENSIVE_SLOT_ELIGIBLE_POSITIONS: Record<DefensiveSlot, string[]> = {
  DE1:  ['DE'],
  DE2:  ['DE'],
  DT1:  ['DT'],
  DT2:  ['DT'],
  NT:   ['DT'],
  LB1:  ['OLB', 'MLB'],
  LB2:  ['OLB', 'MLB'],
  LB3:  ['OLB', 'MLB'],
  LB4:  ['OLB', 'MLB'],
  OLB1: ['OLB'],
  OLB2: ['OLB'],
  ILB1: ['MLB'],
  ILB2: ['MLB'],
  CB1:  ['CB'],
  CB2:  ['CB'],
  NCB:  ['CB'],
  DC1:  ['CB'],
  DC2:  ['CB'],
  FS:   ['FS'],
  SS:   ['SS'],
};

// ── Package definitions ────────────────────────────────────────────────────────

/** NFL personnel notation for defensive packages (rough DL-LB-DB classification). */
export type DefensivePersonnel =
  | '4-3'   // 4 DL, 3 LB, 4 DB
  | '3-4'   // 3 DL, 4 LB, 4 DB
  | '4-2-5' // Nickel: 4 DL, 2 LB, 5 DB
  | '4-1-6' // Dime: 4 DL, 1 LB, 6 DB
  | '4-0-7' // Quarter: 4 DL, 0 LB, 7 DB
  | '5-3-3' // Goal Line: 5 DL, 3 LB, 3 DB
  ;

export interface DefensivePackage {
  id:         string;
  name:       string;
  personnel:  DefensivePersonnel;
  /** Which slots are active and assignable in this package. */
  slots:      DefensiveSlot[];
  description?: string;
}

/**
 * Slot → player ID assignments for one package.
 * null means the slot is deliberately left empty (use positional depth chart fallback).
 * Missing key means the slot is unset (also falls back to positional depth chart).
 */
export type PackageSlotAssignment = Partial<Record<DefensiveSlot, string | null>>;

/**
 * Per-team package depth charts: packageId → slot assignments.
 * Stored on Team as an optional field.
 */
export type PackageDepthCharts = Record<string, PackageSlotAssignment>;

// ── Package library ────────────────────────────────────────────────────────────

export const DEFENSIVE_PACKAGES: DefensivePackage[] = [
  {
    id:          '4-3_base',
    name:        '4-3 Base',
    personnel:   '4-3',
    description: 'Traditional 4-man front with 3 linebackers. Balanced run and pass defense.',
    slots:       ['DE1', 'DE2', 'DT1', 'DT2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'FS', 'SS'],
  },
  {
    id:          '3-4_base',
    name:        '3-4 Base',
    personnel:   '3-4',
    description: 'Three-man front with 4 linebackers. Versatile front — edge rushers can drop or blitz.',
    slots:       ['DE1', 'DE2', 'NT', 'OLB1', 'OLB2', 'ILB1', 'ILB2', 'CB1', 'CB2', 'FS', 'SS'],
  },
  {
    id:          'nickel',
    name:        'Nickel (4-2-5)',
    personnel:   '4-2-5',
    description: 'Fifth defensive back replaces a linebacker. Strong against 3-WR sets.',
    slots:       ['DE1', 'DE2', 'DT1', 'DT2', 'LB1', 'LB2', 'CB1', 'CB2', 'NCB', 'FS', 'SS'],
  },
  {
    id:          'dime',
    name:        'Dime (4-1-6)',
    personnel:   '4-1-6',
    description: 'Six defensive backs on the field. Used against obvious passing situations.',
    slots:       ['DE1', 'DE2', 'DT1', 'DT2', 'LB1', 'CB1', 'CB2', 'NCB', 'DC1', 'FS', 'SS'],
  },
  {
    id:          'quarter',
    name:        'Quarter (4-0-7)',
    personnel:   '4-0-7',
    description: 'All four linebackers replaced by DBs. Maximum pass coverage on obvious passing downs.',
    slots:       ['DE1', 'DE2', 'DT1', 'DT2', 'CB1', 'CB2', 'NCB', 'DC1', 'DC2', 'FS', 'SS'],
  },
  {
    id:          'goal_line',
    name:        'Goal Line (5-3-3)',
    personnel:   '5-3-3',
    description: 'Extra lineman replaces a DB. Maximum run-stop personnel near the end zone.',
    slots:       ['DE1', 'DE2', 'DT1', 'DT2', 'NT', 'LB1', 'LB2', 'LB3', 'CB1', 'SS', 'FS'],
  },
];

export function getPackage(id: string): DefensivePackage | undefined {
  return DEFENSIVE_PACKAGES.find(p => p.id === id);
}
