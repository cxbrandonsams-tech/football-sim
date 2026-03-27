/**
 * Pre-authored offensive play library.
 *
 * Each play:
 *   - belongs to exactly one formation (formationId)
 *   - maps to an engineType the simulation engine already understands
 *   - carries optional route/slot metadata for display and future targeting
 *
 * Plays are referenced by ID in Playbook entries.
 * The engine only sees engineType — no engine math changes required.
 */

import { type OffensivePlay } from '../models/Playbook';

export const OFFENSIVE_PLAYS: OffensivePlay[] = [

  // ── Shotgun 11 Personnel ────────────────────────────────────────────────────

  {
    id:              'zone_inside_11',
    name:            'Inside Zone',
    formationId:     'shotgun_11',
    engineType:      'inside_run',
    conceptId:       'run_inside',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'outside_zone_11',
    name:            'Outside Zone',
    formationId:     'shotgun_11',
    engineType:      'outside_run',
    conceptId:       'run_outside',
    ballCarrierSlot: 'RB',
  },
  {
    id:          'curl_flat_11',
    name:        'Curl Flat',
    formationId: 'shotgun_11',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'MEDIUM' },
      { slot: 'TE',   routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'slant_combo_11',
    name:        'Slant Combo',
    formationId: 'shotgun_11',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'SHORT'  },
      { slot: 'TE',   routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'hitch_screen_11',
    name:        'Hitch Screen',
    formationId: 'shotgun_11',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'drive_11',
    name:        'Drive Concept',
    formationId: 'shotgun_11',
    engineType:  'medium_pass',
    conceptId:   'pass_medium',
    routes: [
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'MEDIUM' },
      { slot: 'SLOT', routeTag: 'MEDIUM' },
      { slot: 'TE',   routeTag: 'MEDIUM' },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'mesh_11',
    name:        'Mesh',
    formationId: 'shotgun_11',
    engineType:  'medium_pass',
    conceptId:   'pass_medium',
    routes: [
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'MEDIUM' },
      { slot: 'SLOT', routeTag: 'SHORT'  },
      { slot: 'TE',   routeTag: 'MEDIUM' },
    ],
  },
  {
    id:           'pa_seam_11',
    name:         'Play Action Seam',
    formationId:  'shotgun_11',
    engineType:   'medium_pass',
    conceptId:    'pa_medium',
    isPlayAction: true,
    routes: [
      { slot: 'TE',   routeTag: 'MEDIUM' },
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'four_verticals_11',
    name:        'Four Verticals',
    formationId: 'shotgun_11',
    engineType:  'deep_pass',
    conceptId:   'pass_deep',
    routes: [
      { slot: 'X',    routeTag: 'DEEP'   },
      { slot: 'Z',    routeTag: 'DEEP'   },
      { slot: 'SLOT', routeTag: 'DEEP'   },
      { slot: 'TE',   routeTag: 'DEEP'   },
    ],
  },
  {
    id:          'comeback_post_11',
    name:        'Comeback Post',
    formationId: 'shotgun_11',
    engineType:  'deep_pass',
    conceptId:   'pass_deep',
    routes: [
      { slot: 'X',    routeTag: 'DEEP'   },
      { slot: 'Z',    routeTag: 'MEDIUM' },
      { slot: 'SLOT', routeTag: 'DEEP'   },
    ],
  },

  // ── Shotgun 10 Personnel (Spread) ───────────────────────────────────────────

  {
    id:          'quick_slants_10',
    name:        'Quick Slants',
    formationId: 'shotgun_10',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'spacing_10',
    name:        'Spacing',
    formationId: 'shotgun_10',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'four_verticals_10',
    name:        'Four Verticals',
    formationId: 'shotgun_10',
    engineType:  'deep_pass',
    conceptId:   'pass_deep',
    routes: [
      { slot: 'X',    routeTag: 'DEEP'   },
      { slot: 'Z',    routeTag: 'DEEP'   },
      { slot: 'SLOT', routeTag: 'DEEP'   },
    ],
  },
  {
    id:          'smash_10',
    name:        'Smash',
    formationId: 'shotgun_10',
    engineType:  'medium_pass',
    conceptId:   'pass_medium',
    routes: [
      { slot: 'X',    routeTag: 'DEEP'   },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'SLOT', routeTag: 'MEDIUM' },
    ],
  },

  // ── Singleback 12 Personnel ──────────────────────────────────────────────────

  {
    id:              'power_12',
    name:            'Power',
    formationId:     'singleback_12',
    engineType:      'inside_run',
    conceptId:       'run_power_short',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'counter_12',
    name:            'Counter',
    formationId:     'singleback_12',
    engineType:      'outside_run',
    conceptId:       'run_outside',
    ballCarrierSlot: 'RB',
  },
  {
    id:          'seam_route_12',
    name:        'Seam Route',
    formationId: 'singleback_12',
    engineType:  'medium_pass',
    conceptId:   'pass_medium',
    routes: [
      { slot: 'TE',   routeTag: 'MEDIUM' },
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
  {
    id:          'crossers_12',
    name:        'Crossers',
    formationId: 'singleback_12',
    engineType:  'medium_pass',
    conceptId:   'pass_medium',
    routes: [
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'MEDIUM' },
      { slot: 'TE',   routeTag: 'MEDIUM' },
    ],
  },
  {
    id:           'pa_cross_12',
    name:         'PA Crossers',
    formationId:  'singleback_12',
    engineType:   'medium_pass',
    conceptId:    'pa_medium',
    isPlayAction: true,
    routes: [
      { slot: 'TE',   routeTag: 'MEDIUM' },
      { slot: 'X',    routeTag: 'MEDIUM' },
      { slot: 'Z',    routeTag: 'SHORT'  },
    ],
  },
  {
    id:           'boot_deep_12',
    name:         'PA Boot Deep',
    formationId:  'singleback_12',
    engineType:   'deep_pass',
    conceptId:    'pa_deep',
    isPlayAction: true,
    routes: [
      { slot: 'Z',    routeTag: 'DEEP'   },
      { slot: 'TE',   routeTag: 'MEDIUM' },
    ],
  },

  // ── I-Formation 21 Personnel ─────────────────────────────────────────────────

  {
    id:              'inside_zone_21',
    name:            'Inside Zone',
    formationId:     'iformation_21',
    engineType:      'inside_run',
    conceptId:       'run_inside',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'power_i_21',
    name:            'Power I',
    formationId:     'iformation_21',
    engineType:      'inside_run',
    conceptId:       'run_power_short',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'fb_dive_21',
    name:            'FB Dive',
    formationId:     'iformation_21',
    engineType:      'inside_run',
    conceptId:       'run_power_short',
    ballCarrierSlot: 'FB',
  },
  {
    id:              'outside_zone_21',
    name:            'Outside Zone',
    formationId:     'iformation_21',
    engineType:      'outside_run',
    conceptId:       'run_outside',
    ballCarrierSlot: 'RB',
  },
  {
    id:           'pa_boot_21',
    name:         'PA Bootleg',
    formationId:  'iformation_21',
    engineType:   'medium_pass',
    conceptId:    'pa_medium',
    isPlayAction: true,
    routes: [
      { slot: 'Z',    routeTag: 'MEDIUM' },
      { slot: 'TE',   routeTag: 'MEDIUM' },
      { slot: 'X',    routeTag: 'SHORT'  },
    ],
  },
  {
    id:           'pa_vertical_21',
    name:         'PA Vertical',
    formationId:  'iformation_21',
    engineType:   'deep_pass',
    conceptId:    'pa_deep',
    isPlayAction: true,
    routes: [
      { slot: 'X',    routeTag: 'DEEP'   },
      { slot: 'Z',    routeTag: 'DEEP'   },
      { slot: 'TE',   routeTag: 'MEDIUM' },
    ],
  },
  {
    id:          'hitch_21',
    name:        'Hitch',
    formationId: 'iformation_21',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'Z',    routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },

  // ── Jumbo 22 Personnel (Goal Line) ───────────────────────────────────────────

  {
    id:              'power_22',
    name:            'Power',
    formationId:     'iformation_22',
    engineType:      'inside_run',
    conceptId:       'run_power_short',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'fb_lead_22',
    name:            'FB Lead',
    formationId:     'iformation_22',
    engineType:      'inside_run',
    conceptId:       'run_inside',
    ballCarrierSlot: 'RB',
  },
  {
    id:              'slam_22',
    name:            'Goal Line Slam',
    formationId:     'iformation_22',
    engineType:      'inside_run',
    conceptId:       'run_power_short',
    ballCarrierSlot: 'FB',
  },
  {
    id:          'te_slip_22',
    name:        'TE Slip',
    formationId: 'iformation_22',
    engineType:  'short_pass',
    conceptId:   'pass_short',
    routes: [
      { slot: 'TE',   routeTag: 'SHORT'  },
      { slot: 'X',    routeTag: 'SHORT'  },
      { slot: 'RB',   routeTag: 'SHORT'  },
    ],
  },
];

export function getPlay(id: string): OffensivePlay | undefined {
  return OFFENSIVE_PLAYS.find(p => p.id === id);
}
