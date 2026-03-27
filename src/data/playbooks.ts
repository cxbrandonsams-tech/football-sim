/**
 * Pre-built playbook library and default offensive plan.
 *
 * Each Playbook is a named, reusable weighted collection of play IDs.
 * The same play can appear in multiple playbooks with different weights.
 *
 * DEFAULT_OFFENSIVE_PLAN maps all 13 down/distance buckets to a playbook ID.
 * Teams without a custom plan fall back to this default automatically.
 */

import { type Playbook, type OffensivePlan } from '../models/Playbook';

export const PLAYBOOKS: Playbook[] = [
  {
    id:   'first_down_base',
    name: 'First Down Base',
    entries: [
      { playId: 'zone_inside_11',  weight: 3 },
      { playId: 'outside_zone_11', weight: 2 },
      { playId: 'curl_flat_11',    weight: 3 },
      { playId: 'drive_11',        weight: 2 },
      { playId: 'inside_zone_21',  weight: 2 },
      { playId: 'power_12',        weight: 2 },
      { playId: 'seam_route_12',   weight: 1 },
    ],
  },
  {
    id:   'run_balance',
    name: 'Run Balance',
    entries: [
      { playId: 'zone_inside_11',  weight: 3 },
      { playId: 'outside_zone_11', weight: 2 },
      { playId: 'curl_flat_11',    weight: 2 },
      { playId: 'pa_seam_11',      weight: 2 },
      { playId: 'inside_zone_21',  weight: 2 },
      { playId: 'pa_boot_21',      weight: 1 },
    ],
  },
  {
    id:   'pass_heavy',
    name: 'Pass Heavy',
    entries: [
      { playId: 'four_verticals_11', weight: 2 },
      { playId: 'comeback_post_11',  weight: 2 },
      { playId: 'mesh_11',           weight: 3 },
      { playId: 'drive_11',          weight: 2 },
      { playId: 'quick_slants_10',   weight: 3 },
      { playId: 'four_verticals_10', weight: 2 },
      { playId: 'smash_10',          weight: 2 },
    ],
  },
  {
    id:   'third_medium',
    name: 'Third and Medium',
    entries: [
      { playId: 'mesh_11',         weight: 3 },
      { playId: 'drive_11',        weight: 3 },
      { playId: 'slant_combo_11',  weight: 2 },
      { playId: 'crossers_12',     weight: 2 },
      { playId: 'seam_route_12',   weight: 2 },
      { playId: 'hitch_screen_11', weight: 1 },
    ],
  },
  {
    id:   'short_yardage',
    name: 'Short Yardage',
    entries: [
      { playId: 'power_i_21',      weight: 4 },
      { playId: 'power_22',        weight: 3 },
      { playId: 'power_12',        weight: 3 },
      { playId: 'inside_zone_21',  weight: 2 },
      { playId: 'curl_flat_11',    weight: 2 },
      { playId: 'slant_combo_11',  weight: 1 },
    ],
  },
  {
    id:   'goal_line',
    name: 'Goal Line',
    entries: [
      { playId: 'slam_22',        weight: 3 },
      { playId: 'fb_lead_22',     weight: 3 },
      { playId: 'power_22',       weight: 2 },
      { playId: 'te_slip_22',     weight: 2 },
      { playId: 'power_i_21',     weight: 2 },
      { playId: 'fb_dive_21',     weight: 1 },
    ],
  },
  {
    id:   'play_action',
    name: 'Play Action',
    entries: [
      { playId: 'pa_seam_11',     weight: 3 },
      { playId: 'pa_boot_21',     weight: 3 },
      { playId: 'pa_vertical_21', weight: 2 },
      { playId: 'pa_cross_12',    weight: 2 },
      { playId: 'boot_deep_12',   weight: 2 },
    ],
  },
  {
    id:   'spread_pass',
    name: 'Spread Pass',
    entries: [
      { playId: 'quick_slants_10',   weight: 3 },
      { playId: 'four_verticals_10', weight: 2 },
      { playId: 'spacing_10',        weight: 3 },
      { playId: 'smash_10',          weight: 2 },
      { playId: 'slant_combo_11',    weight: 2 },
    ],
  },
];

/**
 * Default plan used when a team has an offensivePlan but a bucket entry
 * is missing, or as the system-wide fallback for teams without a plan.
 */
export const DEFAULT_OFFENSIVE_PLAN: OffensivePlan = {
  FIRST_10:      'first_down_base',
  FIRST_LONG:    'first_down_base',
  FIRST_MEDIUM:  'first_down_base',
  FIRST_SHORT:   'short_yardage',
  SECOND_LONG:   'pass_heavy',
  SECOND_MEDIUM: 'run_balance',
  SECOND_SHORT:  'short_yardage',
  THIRD_LONG:    'pass_heavy',
  THIRD_MEDIUM:  'third_medium',
  THIRD_SHORT:   'short_yardage',
  FOURTH_LONG:   'pass_heavy',
  FOURTH_MEDIUM: 'third_medium',
  FOURTH_SHORT:  'goal_line',
};

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find(pb => pb.id === id);
}
