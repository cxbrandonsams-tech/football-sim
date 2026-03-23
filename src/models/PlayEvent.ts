export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'interception' | 'fumble'
  | 'field_goal' | 'punt';

export type PlayResult =
  | 'success' | 'fail' | 'touchdown' | 'turnover'
  | 'field_goal_good' | 'field_goal_miss';

export interface PlayEvent {
  type: PlayType;
  offenseTeamId: string;
  defenseTeamId: string;
  result: PlayResult;
  yards: number;
  quarter: number;
  down: number;
  distance: number;
  yardLine: number;    // 0 = own end zone, 100 = opponent's
  firstDown?: boolean;
  ballCarrier?: string; // last name
  target?: string;      // last name (receiver)
}
