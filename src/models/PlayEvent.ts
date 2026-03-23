export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'interception' | 'fumble'
  | 'field_goal' | 'punt';

export type PlayResult =
  | 'success' | 'fail' | 'touchdown' | 'turnover'
  | 'field_goal_good' | 'field_goal_miss';

export interface PlayEvent {
  type:           PlayType;
  offenseTeamId:  string;
  defenseTeamId:  string;
  result:         PlayResult;
  yards:          number;
  quarter:        number;
  down:           number;
  distance:       number;
  yardLine:       number;      // 0 = own end zone, 100 = opponent's
  firstDown?:     boolean;
  // ── Display strings (last name, used for play-by-play text) ──────────────
  ballCarrier?:   string;      // last name of QB/RB
  target?:        string;      // last name of receiver
  // ── Player IDs (authoritative for stat tracking) ─────────────────────────
  ballCarrierId?: string;      // player.id of ball carrier (QB for passes, RB for runs)
  targetId?:      string;      // player.id of receiver
  defPlayerId?:   string;      // player.id of defensive player (sacking DE or intercepting CB)
}
