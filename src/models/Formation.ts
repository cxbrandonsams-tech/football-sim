/**
 * Formation and defensive package type definitions.
 *
 * Offensive plays reference formation slots (X, Z, SLOT, TE, RB, FB).
 * Formation depth charts map those slots to specific player IDs.
 * The selection layer applies these assignments to the positional depth chart
 * before the engine executes the play — no engine math changes required.
 */

// ── Offensive formations ──────────────────────────────────────────────────────

/** NFL personnel notation: RBs + TEs on field. WRs fill the rest. */
export type OffensivePersonnel = '11' | '12' | '21' | '22' | '10' | '00';

/**
 * Named offensive formation slots.
 * X  = split end (wide, weak/left side)
 * Z  = flanker (wide, strong/right side)
 * SLOT = inside receiver in 3-WR sets
 * TE = tight end
 * RB = running back
 * FB = fullback (2-back sets)
 */
export type OffensiveSlot = 'X' | 'Z' | 'SLOT' | 'TE' | 'RB' | 'FB';

export interface OffensiveFormation {
  id:        string;
  name:      string;
  personnel: OffensivePersonnel;
  /** Which slots are active and assignable in this formation. */
  slots:     OffensiveSlot[];
}

/**
 * Slot → player ID assignments for one formation.
 * null means the slot is deliberately left empty (use positional depth chart fallback).
 * Missing key means the slot is unset (also falls back to positional depth chart).
 */
export type FormationSlotAssignment = Partial<Record<OffensiveSlot, string | null>>;

/**
 * Per-team formation depth charts: formationId → slot assignments.
 * Stored on Team as an optional field.
 */
export type FormationDepthCharts = Record<string, FormationSlotAssignment>;

// ── Formation library ─────────────────────────────────────────────────────────

export const OFFENSIVE_FORMATIONS: OffensiveFormation[] = [
  {
    id:        'shotgun_11',
    name:      'Shotgun (11 Personnel)',
    personnel: '11',
    slots:     ['X', 'Z', 'SLOT', 'TE', 'RB'],
  },
  {
    id:        'shotgun_10',
    name:      'Shotgun Empty (10 Personnel)',
    personnel: '10',
    slots:     ['X', 'Z', 'SLOT', 'RB'],
  },
  {
    id:        'singleback_12',
    name:      'Singleback (12 Personnel)',
    personnel: '12',
    slots:     ['X', 'Z', 'TE', 'RB'],
  },
  {
    id:        'iformation_21',
    name:      'I-Formation (21 Personnel)',
    personnel: '21',
    slots:     ['X', 'Z', 'TE', 'RB', 'FB'],
  },
  {
    id:        'iformation_22',
    name:      'Jumbo I (22 Personnel)',
    personnel: '22',
    slots:     ['X', 'TE', 'RB', 'FB'],
  },
];

export function getFormation(id: string): OffensiveFormation | undefined {
  return OFFENSIVE_FORMATIONS.find(f => f.id === id);
}
