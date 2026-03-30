/**
 * FieldView — visual football field with ball position, team end zones,
 * and broadcast-style commentary for big plays.
 */
import { useState, useEffect, useRef } from 'react';
import type { PlayEvent } from './types';
import { TeamLogo } from './TeamLogo';

// ── Broadcaster commentary ──────────────────────────────────────────────────

const BIG_PLAY_THRESHOLD = 20; // yards to trigger "big play" commentary
const TD_CALLS = [
  "TOUCHDOWN! What a play!",
  "HE'S IN! TOUCHDOWN!",
  "INTO THE END ZONE! TOUCHDOWN!",
  "SCORES! What a drive!",
  "THAT'S SIX! INCREDIBLE!",
  "THE CROWD GOES WILD! TOUCHDOWN!",
  "NOTHING BUT END ZONE! TD!",
  "HE FINDS THE PROMISED LAND! TOUCHDOWN!",
];

const BIG_RUN_CALLS = [
  (name: string, yds: number) => `${name} BREAKS FREE! ${yds} yards on the carry!`,
  (name: string, yds: number) => `WHAT A RUN by ${name}! ${yds} yards and still going!`,
  (name: string, yds: number) => `${name} finds a HUGE hole — ${yds} yards!`,
  (name: string, yds: number) => `Look at ${name} GO! ${yds}-yard gash right up the middle!`,
  (name: string, yds: number) => `${name} makes 'em miss! ${yds} yards on the ground!`,
  (name: string, yds: number) => `He hits the edge and he is GONE! ${name}, ${yds} yards!`,
];

const BIG_PASS_CALLS = [
  (qb: string, rec: string, yds: number) => `${qb} LAUNCHES it deep to ${rec}! ${yds} yards through the air!`,
  (qb: string, rec: string, yds: number) => `WHAT A THROW! ${qb} to ${rec} for ${yds} yards!`,
  (qb: string, rec: string, yds: number) => `${rec} HAULS IT IN! ${yds}-yard strike from ${qb}!`,
  (qb: string, rec: string, yds: number) => `${qb} drops it in the BUCKET to ${rec} — ${yds} yards!`,
  (qb: string, rec: string, yds: number) => `${rec} is WIDE OPEN! ${qb} finds him for ${yds}!`,
  (qb: string, rec: string, yds: number) => `Beautiful deep ball by ${qb}! ${rec} with the ${yds}-yard grab!`,
];

const INT_CALLS = [
  (name: string) => `INTERCEPTED! ${name} jumps the route!`,
  (name: string) => `PICKED OFF! ${name} reads it all the way!`,
  (name: string) => `OH NO! That's intercepted by ${name}!`,
  (name: string) => `TURNOVER! ${name} with the interception!`,
];

const SACK_CALLS = [
  (name: string) => `SACKED! ${name} gets to the quarterback!`,
  (name: string) => `${name} BURIES him! Big sack!`,
  (name: string) => `He's DOWN! ${name} blows through the line!`,
];

const FG_CALLS = [
  "The kick is up... and it's GOOD!",
  "RIGHT down the middle! Field goal is GOOD!",
  "He nails it! Three points!",
];

const FG_MISS_CALLS = [
  "The kick is up... NO GOOD! It hooks wide!",
  "He MISSED it! Oh, that's brutal!",
  "Wide right! No good!",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateCommentary(ev: PlayEvent): { text: string; isBig: boolean } {
  const isRun = ev.type === 'inside_run' || ev.type === 'outside_run';
  const isPass = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
  const carrier = ev.ballCarrier ?? 'the runner';
  const target = ev.target ?? 'the receiver';

  // Touchdown
  if (ev.result === 'touchdown') {
    return { text: pick(TD_CALLS), isBig: true };
  }

  // Interception
  if (ev.result === 'turnover' && ev.type === 'interception') {
    return { text: pick(INT_CALLS)(ev.target ?? 'the defender'), isBig: true };
  }

  // Sack
  if (ev.type === 'sack') {
    return { text: pick(SACK_CALLS)(ev.target ?? 'the defense'), isBig: true };
  }

  // Field goal
  if (ev.result === 'field_goal_good') {
    return { text: pick(FG_CALLS), isBig: false };
  }
  if (ev.result === 'field_goal_miss') {
    return { text: pick(FG_MISS_CALLS), isBig: true };
  }

  // Big run
  if (isRun && ev.yards >= BIG_PLAY_THRESHOLD) {
    return { text: pick(BIG_RUN_CALLS)(carrier, ev.yards), isBig: true };
  }

  // Big pass
  if (isPass && ev.yards >= BIG_PLAY_THRESHOLD) {
    return { text: pick(BIG_PASS_CALLS)(carrier, target, ev.yards), isBig: true };
  }

  // Normal play — short description
  if (isRun) {
    return { text: `${carrier} runs for ${ev.yards} yard${ev.yards !== 1 ? 's' : ''}.`, isBig: false };
  }
  if (isPass && ev.result === 'success') {
    return { text: `${carrier} completes to ${target} for ${ev.yards} yard${ev.yards !== 1 ? 's' : ''}.`, isBig: false };
  }
  if (isPass && ev.result === 'fail') {
    return { text: `${carrier}'s pass to ${target} falls incomplete.`, isBig: false };
  }
  if (ev.type === 'scramble') {
    return { text: `${carrier} scrambles for ${ev.yards} yard${ev.yards !== 1 ? 's' : ''}.`, isBig: ev.yards >= 10 };
  }
  if (ev.type === 'fumble') {
    return { text: `FUMBLE! ${carrier} puts the ball on the ground!`, isBig: true };
  }
  if (ev.type === 'punt') {
    return { text: `Punt away.`, isBig: false };
  }

  if (ev.type === 'spike') {
    return { text: 'QB spikes the ball to stop the clock.', isBig: false };
  }

  return { text: `Play result: ${ev.yards} yards.`, isBig: false };
}

const PENALTY_LABELS: Record<string, string> = {
  dpi:          'Defensive Pass Interference',
  def_holding:  'Defensive Holding',
  roughing:     'Roughing the Passer',
  offsides:     'Offsides',
  off_holding:  'Offensive Holding',
  false_start:  'False Start',
};

// ── Field Component ─────────────────────────────────────────────────────────

interface FieldViewProps {
  event: PlayEvent | null;
  homeAbbr: string;
  awayAbbr: string;
  homeId: string;
  homeScore: number;
  awayScore: number;
  quarter: string;
  playIndex: number;
  totalPlays: number;
  /** Momentum bar position 0–100 (50 = neutral). Rendered below scoreboard. */
  momentumPct?: number;
  /** Which team has momentum (for bar color). */
  momentumLeader?: 'home' | 'away' | null;
  /** Drive summary text, e.g. "6 plays · 43 yds · 2:34" */
  driveText?: string;
}

export function FieldView({ event, homeAbbr, awayAbbr, homeId, homeScore, awayScore, quarter, playIndex, totalPlays, momentumPct = 50, momentumLeader, driveText }: FieldViewProps) {
  const [commentary, setCommentary] = useState<{ text: string; isBig: boolean } | null>(null);
  const [bigPlay, setBigPlay] = useState(false);
  const [flashType, setFlashType] = useState<'td' | 'turnover' | 'big' | null>(null);
  const [scorePulse, setScorePulse] = useState(false);
  const prevIdxRef = useRef(playIndex);
  const prevScoreRef = useRef(homeScore + awayScore);

  useEffect(() => {
    if (!event) { setCommentary(null); setBigPlay(false); setFlashType(null); return; }
    if (playIndex === prevIdxRef.current) return;
    prevIdxRef.current = playIndex;

    // Generate commentary (penalty info is now shown separately inline)
    const c = generateCommentary(event);
    setCommentary(c);

    // Key play flash type
    let flash: 'td' | 'turnover' | 'big' | null = null;
    if (event.result === 'touchdown') flash = 'td';
    else if (event.result === 'turnover') flash = 'turnover';
    else if (event.yards >= BIG_PLAY_THRESHOLD) flash = 'big';
    setFlashType(flash);

    // Score pulse
    const totalScore = homeScore + awayScore;
    if (totalScore !== prevScoreRef.current) {
      setScorePulse(true);
      setTimeout(() => setScorePulse(false), 600);
    }
    prevScoreRef.current = totalScore;

    if (c.isBig || flash) {
      setBigPlay(true);
      const t = setTimeout(() => { setBigPlay(false); setFlashType(null); }, 2000);
      return () => clearTimeout(t);
    } else {
      setBigPlay(false);
    }
  }, [event, playIndex, homeScore, awayScore]);

  if (!event) return null;

  // Convert yardLine (0=own end zone, 100=opp end zone) to field position
  // The offense always goes left→right. We need to figure out which end zone is which team.
  const offIsHome = event.offenseTeamId === homeId;
  // On our field: left=away end zone, right=home end zone
  // If home is on offense, they go left→right: yardLine 0 = left (home EZ), 100 = right (away EZ)
  // If away is on offense, they go left→right: yardLine 0 = left (away EZ), 100 = right (home EZ)
  // For display: let's always show home on right, away on left.
  // Ball position as % from left: if home offense, ball at (100 - yardLine)% because they go toward away EZ (left)
  // Actually, simpler: let's show the field from the offense's perspective — ball moves left to right.
  const ballPct = Math.max(2, Math.min(98, event.yardLine));

  const offAbbr = offIsHome ? homeAbbr : awayAbbr;
  const defAbbr = offIsHome ? awayAbbr : homeAbbr;

  const downDist = event.down > 0 ? `${event.down}${event.down === 1 ? 'st' : event.down === 2 ? 'nd' : event.down === 3 ? 'rd' : 'th'} & ${event.distance}` : '';

  const isRedZone = event.yardLine >= 80;
  const isOT = event.quarter > 4;
  const hasPenalty = !!event.penalty;
  const flashCls = flashType ? ` field-flash-${flashType}` : '';
  const otCls = isOT ? ' field-ot' : '';

  return (
    <div className={`field-wrap${bigPlay ? ' field-big-play' : ''}${flashCls}${otCls}`}>
      {/* Scoreboard strip with drive stats */}
      <div className="field-scoreboard">
        <div className="field-sb-team field-sb-away">
          <TeamLogo abbr={awayAbbr} size={28} />
          <span className="field-sb-abbr">{awayAbbr}</span>
          <span className={`field-sb-score${scorePulse ? ' field-score-pulse' : ''}`}>{awayScore}</span>
        </div>
        <div className="field-sb-center">
          {isOT ? (
            <span className="field-sb-quarter field-sb-ot">OVERTIME</span>
          ) : (
            <span className="field-sb-quarter">{quarter}</span>
          )}
          {driveText ? (
            <span className="field-sb-drive">{driveText}</span>
          ) : (
            <span className="field-sb-play">{playIndex + 1}/{totalPlays}</span>
          )}
        </div>
        <div className="field-sb-team field-sb-home">
          <span className={`field-sb-score${scorePulse ? ' field-score-pulse' : ''}`}>{homeScore}</span>
          <span className="field-sb-abbr">{homeAbbr}</span>
          <TeamLogo abbr={homeAbbr} size={28} />
        </div>
      </div>

      {/* Momentum tug-of-war bar */}
      <div className={`field-momentum${isOT ? ' field-momentum-ot' : ''}`}>
        <span className="field-momentum-label">{awayAbbr}</span>
        <div className="field-momentum-track">
          <div
            className={`field-momentum-fill${momentumLeader === 'home' ? ' field-momentum-home' : momentumLeader === 'away' ? ' field-momentum-away' : ''}`}
            style={{ width: `${momentumPct}%` }}
          />
          <div
            className={`field-momentum-dot${momentumLeader ? ` field-momentum-dot-${momentumLeader}` : ''}`}
            style={{ left: `${momentumPct}%` }}
          />
        </div>
        <span className="field-momentum-label">{homeAbbr}</span>
      </div>

      {/* Football field */}
      <div className={`field-container${isRedZone ? ' field-redzone' : ''}`}>
        {/* Red zone overlay */}
        {isRedZone && (
          <div className="field-rz-overlay">
            <span className="field-rz-label">RED ZONE</span>
          </div>
        )}

        {/* End zones */}
        <div className="field-endzone field-endzone-left">
          <TeamLogo abbr={defAbbr} size={30} className="field-ez-logo" />
          <span className="field-ez-text">{defAbbr}</span>
        </div>
        <div className="field-endzone field-endzone-right">
          <TeamLogo abbr={offAbbr} size={30} className="field-ez-logo" />
          <span className="field-ez-text">{offAbbr}</span>
        </div>

        {/* Yard lines */}
        <div className="field-grass">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yl => (
            <div key={yl} className="field-yardline" style={{ left: `${yl}%` }}>
              <span className="field-yardline-num">
                {yl <= 50 ? yl : 100 - yl}
              </span>
            </div>
          ))}
        </div>

        {/* Ball marker */}
        <div className="field-ball-marker" style={{ left: `${ballPct}%` }}>
          <div className="field-ball">🏈</div>
          <div className="field-ball-team">{offAbbr}</div>
        </div>

        {/* First down line */}
        {event.down > 0 && event.yardLine + event.distance <= 100 && (
          <div
            className="field-first-down"
            style={{ left: `${Math.min(98, event.yardLine + event.distance)}%` }}
          />
        )}
      </div>

      {/* Down & distance */}
      <div className="field-info-bar">
        <span className="field-down">{downDist}</span>
        <span className="field-possession">{offAbbr} ball</span>
        <span className="field-yardline-text">
          {event.yardLine <= 50
            ? `Own ${event.yardLine}`
            : `Opp ${100 - event.yardLine}`}
        </span>
      </div>

      {/* Commentary — with inline penalty display */}
      {commentary && (
        <div className={`field-commentary${commentary.isBig ? ' field-commentary-big' : ''}${hasPenalty ? ' field-commentary-penalty' : ''}`}>
          <span className="field-commentary-text">{commentary.text}</span>
          {hasPenalty && event.penalty && (
            <div className="field-penalty-inline">
              <span className="field-penalty-flag">🚩</span>
              <span className="field-penalty-name">
                {PENALTY_LABELS[event.penalty.type] ?? event.penalty.type}
              </span>
              <span className="field-penalty-decision">
                {event.penalty.accepted ? 'ACCEPTED' : 'DECLINED'}
              </span>
              {!event.penalty.accepted && event.penalty.declinedPlayYards != null && (
                <span className="field-penalty-reason">
                  ({Math.abs(event.penalty.yards)} yds &lt; {event.penalty.declinedPlayYards} yd gain)
                </span>
              )}
              {event.penalty.accepted && (
                <span className="field-penalty-reason">
                  ({Math.abs(event.penalty.yards)} yds{event.penalty.autoFirst ? ', auto 1st down' : ''})
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
