/**
 * Pre-authored defensive play library.
 *
 * Each play:
 *   - belongs to exactly one package (packageId)
 *   - carries front/coverage/blitz metadata for display
 *   - affects gameplay by triggering package depth chart remapping
 *
 * Plays are referenced by ID in DefensivePlaybook entries.
 * The engine receives a remapped defensive depth chart — no engine math changes.
 */

import { type DefensivePlay } from '../models/DefensivePlaybook';

export const DEFENSIVE_PLAYS: DefensivePlay[] = [

  // ── 4-3 Base ────────────────────────────────────────────────────────────────

  {
    id:       '4-3_cover3',
    name:     'Cover 3 Zone',
    packageId: '4-3_base',
    front:    'four_three',
    coverage: 'cover_3',
  },
  {
    id:       '4-3_cover2',
    name:     'Tampa-2',
    packageId: '4-3_base',
    front:    'four_three',
    coverage: 'tampa_2',
  },
  {
    id:       '4-3_man_free',
    name:     'Man-Free (Cover 1)',
    packageId: '4-3_base',
    front:    'four_three',
    coverage: 'cover_1',
  },
  {
    id:       '4-3_lb_blitz',
    name:     'Inside Blitz',
    packageId: '4-3_base',
    front:    'four_three',
    coverage: 'cover_1',
    blitz:    'lb_blitz',
  },
  {
    id:       '4-3_cover4',
    name:     'Quarters Coverage',
    packageId: '4-3_base',
    front:    'four_three',
    coverage: 'cover_4',
  },

  // ── 3-4 Base ────────────────────────────────────────────────────────────────

  {
    id:       '3-4_cover2',
    name:     'Cover 2 Zone',
    packageId: '3-4_base',
    front:    'three_four',
    coverage: 'cover_2',
  },
  {
    id:       '3-4_cover3',
    name:     'Cover 3 Sky',
    packageId: '3-4_base',
    front:    'three_four',
    coverage: 'cover_3',
  },
  {
    id:       '3-4_olb_blitz',
    name:     'Outside Linebacker Blitz',
    packageId: '3-4_base',
    front:    'three_four',
    coverage: 'cover_1',
    blitz:    'lb_blitz',
  },
  {
    id:       '3-4_zone_blitz',
    name:     'Zone Blitz',
    packageId: '3-4_base',
    front:    'three_four',
    coverage: 'cover_3',
    blitz:    'zone_blitz',
  },
  {
    id:       '3-4_man_under',
    name:     'Man Under',
    packageId: '3-4_base',
    front:    'three_four',
    coverage: 'man_under',
  },

  // ── Nickel ──────────────────────────────────────────────────────────────────

  {
    id:       'nickel_cover2',
    name:     'Nickel Cover 2',
    packageId: 'nickel',
    front:    'nickel',
    coverage: 'cover_2',
  },
  {
    id:       'nickel_cover3',
    name:     'Nickel Cover 3',
    packageId: 'nickel',
    front:    'nickel',
    coverage: 'cover_3',
  },
  {
    id:       'nickel_man_press',
    name:     'Nickel Man Press',
    packageId: 'nickel',
    front:    'nickel',
    coverage: 'cover_0',
  },
  {
    id:       'nickel_cb_blitz',
    name:     'Nickel Cornerback Blitz',
    packageId: 'nickel',
    front:    'nickel',
    coverage: 'cover_1',
    blitz:    'cb_blitz',
  },
  {
    id:       'nickel_cover6',
    name:     'Nickel Cover 6',
    packageId: 'nickel',
    front:    'nickel',
    coverage: 'cover_6',
  },

  // ── Dime ────────────────────────────────────────────────────────────────────

  {
    id:       'dime_cover2',
    name:     'Dime Cover 2',
    packageId: 'dime',
    front:    'dime',
    coverage: 'cover_2',
  },
  {
    id:       'dime_cover4',
    name:     'Dime Quarters',
    packageId: 'dime',
    front:    'dime',
    coverage: 'cover_4',
  },
  {
    id:       'dime_all_out_blitz',
    name:     'Dime All-Out Blitz',
    packageId: 'dime',
    front:    'dime',
    coverage: 'cover_0',
    blitz:    'safety_blitz',
  },
  {
    id:       'dime_safety_blitz',
    name:     'Dime Safety Blitz',
    packageId: 'dime',
    front:    'dime',
    coverage: 'cover_1',
    blitz:    'safety_blitz',
  },

  // ── Quarter ──────────────────────────────────────────────────────────────────

  {
    id:       'quarter_cover4',
    name:     'Quarter Prevent',
    packageId: 'quarter',
    front:    'quarter',
    coverage: 'cover_4',
  },
  {
    id:       'quarter_man_free',
    name:     'Quarter Man-Free',
    packageId: 'quarter',
    front:    'quarter',
    coverage: 'cover_1',
  },
  {
    id:       'quarter_cover2',
    name:     'Quarter Cover 2',
    packageId: 'quarter',
    front:    'quarter',
    coverage: 'cover_2',
  },

  // ── Goal Line ────────────────────────────────────────────────────────────────

  {
    id:       'goal_line_stack',
    name:     'Goal Line Stack',
    packageId: 'goal_line',
    front:    'goal_line',
    coverage: 'cover_1',
  },
  {
    id:       'goal_line_man',
    name:     'Goal Line Man',
    packageId: 'goal_line',
    front:    'goal_line',
    coverage: 'cover_0',
  },
  {
    id:       'goal_line_blitz',
    name:     'Goal Line Safety Blitz',
    packageId: 'goal_line',
    front:    'goal_line',
    coverage: 'cover_0',
    blitz:    'safety_blitz',
  },
];
