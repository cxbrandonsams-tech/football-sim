/**
 * Pre-built defensive playbook library and default defensive plan.
 *
 * Each DefensivePlaybook is a named, reusable weighted collection of defensive play IDs.
 * The same play can appear in multiple playbooks with different weights.
 *
 * DEFAULT_DEFENSIVE_PLAN maps all 13 down/distance buckets to a playbook ID.
 * Teams without a custom defensive plan leave the depth chart unmodified.
 */

import { type DefensivePlaybook, type DefensivePlan } from '../models/DefensivePlaybook';

export const DEFENSIVE_PLAYBOOKS: DefensivePlaybook[] = [
  {
    id:   'base_defense',
    name: 'Base Defense',
    entries: [
      { playId: '4-3_cover3',    weight: 3 },
      { playId: '4-3_cover2',    weight: 2 },
      { playId: '4-3_man_free',  weight: 2 },
      { playId: '3-4_cover2',    weight: 2 },
      { playId: '3-4_cover3',    weight: 2 },
      { playId: '4-3_cover4',    weight: 1 },
    ],
  },
  {
    id:   'run_defense',
    name: 'Run Defense',
    entries: [
      { playId: '4-3_cover3',     weight: 4 },
      { playId: '4-3_man_free',   weight: 3 },
      { playId: '3-4_man_under',  weight: 3 },
      { playId: '4-3_lb_blitz',   weight: 2 },
      { playId: 'goal_line_stack', weight: 1 },
    ],
  },
  {
    id:   'pass_defense',
    name: 'Pass Defense',
    entries: [
      { playId: 'nickel_cover2',   weight: 3 },
      { playId: 'nickel_cover3',   weight: 3 },
      { playId: 'nickel_cover6',   weight: 2 },
      { playId: 'dime_cover2',     weight: 2 },
      { playId: 'dime_cover4',     weight: 2 },
      { playId: '4-3_cover4',      weight: 1 },
    ],
  },
  {
    id:   'nickel_package',
    name: 'Nickel Package',
    entries: [
      { playId: 'nickel_cover2',     weight: 3 },
      { playId: 'nickel_cover3',     weight: 3 },
      { playId: 'nickel_cover6',     weight: 2 },
      { playId: 'nickel_man_press',  weight: 1 },
      { playId: 'nickel_cb_blitz',   weight: 1 },
    ],
  },
  {
    id:   'dime_package',
    name: 'Dime Package',
    entries: [
      { playId: 'dime_cover2',        weight: 3 },
      { playId: 'dime_cover4',        weight: 3 },
      { playId: 'dime_safety_blitz',  weight: 2 },
      { playId: 'dime_all_out_blitz', weight: 1 },
    ],
  },
  {
    id:   'prevent_defense',
    name: 'Prevent Defense',
    entries: [
      { playId: 'quarter_cover4',   weight: 4 },
      { playId: 'quarter_cover2',   weight: 3 },
      { playId: 'quarter_man_free', weight: 2 },
      { playId: 'dime_cover4',      weight: 2 },
    ],
  },
  {
    id:   'blitz_package',
    name: 'Blitz Package',
    entries: [
      { playId: '4-3_lb_blitz',       weight: 3 },
      { playId: '3-4_olb_blitz',      weight: 3 },
      { playId: '3-4_zone_blitz',     weight: 2 },
      { playId: 'nickel_cb_blitz',    weight: 2 },
      { playId: 'dime_all_out_blitz', weight: 1 },
    ],
  },
  {
    id:   'goal_line_package',
    name: 'Goal Line Package',
    entries: [
      { playId: 'goal_line_stack', weight: 3 },
      { playId: 'goal_line_man',   weight: 3 },
      { playId: 'goal_line_blitz', weight: 2 },
      { playId: '4-3_lb_blitz',    weight: 1 },
    ],
  },
];

/**
 * Default plan used when a team has no defensivePlan configured.
 * Applied per-bucket as the system-wide fallback.
 */
export const DEFAULT_DEFENSIVE_PLAN: DefensivePlan = {
  FIRST_10:      'base_defense',
  FIRST_LONG:    'base_defense',
  FIRST_MEDIUM:  'base_defense',
  FIRST_SHORT:   'run_defense',
  SECOND_LONG:   'pass_defense',
  SECOND_MEDIUM: 'base_defense',
  SECOND_SHORT:  'run_defense',
  THIRD_LONG:    'dime_package',
  THIRD_MEDIUM:  'nickel_package',
  THIRD_SHORT:   'run_defense',
  FOURTH_LONG:   'prevent_defense',
  FOURTH_MEDIUM: 'nickel_package',
  FOURTH_SHORT:  'goal_line_package',
};

export function getDefensivePlaybook(id: string): DefensivePlaybook | undefined {
  return DEFENSIVE_PLAYBOOKS.find(pb => pb.id === id);
}
