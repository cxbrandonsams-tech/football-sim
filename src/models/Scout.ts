/**
 * Head Scout — attached to each team, affects scouting report reliability.
 * A higher overall produces tighter projected-round ranges and less rating noise.
 */

export interface HeadScout {
  id:      string;
  name:    string;
  overall: number;  // 40–90; higher = more accurate reports
}
