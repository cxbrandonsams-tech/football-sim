export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'scramble' | 'interception' | 'fumble'
  | 'field_goal' | 'punt'
  | 'spike';  // clock-stopping spike (2-minute drill)

export type PlayResult =
  | 'success' | 'fail' | 'touchdown' | 'turnover'
  | 'field_goal_good' | 'field_goal_miss'
  | 'safety';

export type PenaltyType =
  | 'dpi'              // Defensive Pass Interference
  | 'def_holding'      // Defensive Holding
  | 'roughing'         // Roughing the Passer
  | 'offsides'         // Neutral Zone Infraction / Offsides
  | 'off_holding'      // Offensive Holding
  | 'false_start';     // False Start

export interface PenaltyInfo {
  type:       PenaltyType;
  onOffense:  boolean;     // true = offensive penalty, false = defensive
  yards:      number;      // yards gained/lost from the penalty
  autoFirst:  boolean;     // does this penalty award an automatic first down?
}

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
  // ── Play selection explanation (optional, for UI "Show Play Logic" toggle) ──
  explanation?:   string[];    // human-readable reasons for play choice
  // ── Penalty (if one occurred on this play) ───────────────────────────────
  penalty?:       PenaltyInfo; // penalty details — undefined if no flag
}
