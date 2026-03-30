export type CommentaryStyle = 'neutral' | 'hype' | 'analytical';

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
  accepted:   boolean;     // was the penalty accepted or declined?
  declinedPlayYards?: number; // if declined, the original play yards (for display)
}

// ── Commentary metadata — structured phase data for rich play-by-play ────────

export type WindowState = 'open' | 'soft_open' | 'tight' | 'contested' | 'covered';

export interface CommentaryMeta {
  // ── Pass play metadata ───────────────────────────────────────────────────
  pressureLevel?:   number;        // 0–1 (0 = clean pocket, 1 = heavy pressure)
  windowState?:     WindowState;   // coverage window at throw
  throwQuality?:    number;        // 0–1 final throw quality
  thrownAway?:      boolean;       // QB elected to throw ball away
  depth?:           'short' | 'medium' | 'deep';
  targetRole?:      string;        // WR / TE / RB
  catchContested?:  boolean;       // contested-window catch attempt
  yacYards?:        number;        // yards after catch portion
  // ── Run play metadata ────────────────────────────────────────────────────
  tfl?:             boolean;       // tackle for loss
  brokeTackle?:     boolean;       // broke first contact
  foundCutback?:    boolean;       // vision-phase cutback
  blockingScore?:   number;        // 0–1 blocking effectiveness proxy
  // ── Shared ───────────────────────────────────────────────────────────────
  breakaway?:       boolean;       // second-level breakaway (pass or run)
  // ── Defender identity (commentary-only, not for stat tracking) ───────────
  defPlayerName?:   string;        // last name of credited defender
  // ── Drive context (computed post-game from event sequence) ───────────────
  drivePlayNum?:    number;        // play number within current drive (1-based)
  prevPlayType?:    PlayType;      // previous play's type
  prevPlayResult?:  PlayResult;    // previous play's result
  isTwoMinute?:     boolean;       // inside 2-minute warning window
  // ── Drive state (accumulated across drive) ───────────────────────────────
  driveYards?:      number;        // total net yards on current drive
  driveFirstDowns?: number;        // first downs achieved on current drive
  // ── Streak tracking ──────────────────────────────────────────────────────
  consecutiveRuns?:         number; // consecutive run plays (resets on pass/other)
  consecutivePasses?:       number; // consecutive pass plays (resets on run/other)
  consecutiveCompletions?:  number; // consecutive completed passes
  consecutiveNegative?:     number; // sack + TFL + incompletion streak
  // ── Game context ─────────────────────────────────────────────────────────
  scoreDiff?:       number;        // offense score minus defense score at play time
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
  // ── Commentary (generated after play resolution) ────────────────────────
  commentaryFull?: string;       // rich descriptive text for current-play display
  commentaryLog?:  string;       // compact summary for historical play log
  commentaryMeta?: CommentaryMeta; // structured phase data for UI styling/icons
}
