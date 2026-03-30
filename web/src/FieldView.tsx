/**
 * FieldView — visual football field with ball position, team-colored end zones,
 * broadcast-style scoreboard, and engine-generated commentary.
 */
import { useState, useEffect, useRef } from 'react';
import type { PlayEvent } from './types';
import { TeamLogo } from './TeamLogo';

// ── Team Colors ──────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D',
  CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
  DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB:  '#203731',
  HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC:  '#E31837',
  LAC: '#0080C6', LAR: '#003594', LV:  '#A5ACAF', MIA: '#008E97',
  MIN: '#4F2683', NE:  '#002244', NO:  '#D3BC8D', NYE: '#125740',
  NYG: '#0B2265', PHI: '#004C54', PIT: '#FFB612', SEA: '#002244',
  SF:  '#AA0000', TB:  '#D50A0A', TEN: '#0C2340', WAS: '#5A1414',
};

function teamColor(abbr: string): string {
  return TEAM_COLORS[abbr.toUpperCase()] ?? '#334155';
}

// ── Constants ────────────────────────────────────────────────────────────────

const BIG_PLAY_THRESHOLD = 20;

const PENALTY_LABELS: Record<string, string> = {
  dpi:          'Pass Interference',
  def_holding:  'Def. Holding',
  roughing:     'Roughing the Passer',
  offsides:     'Offsides',
  off_holding:  'Holding',
  false_start:  'False Start',
};

function isBigPlay(ev: PlayEvent): boolean {
  if (ev.result === 'touchdown') return true;
  if (ev.result === 'turnover') return true;
  if (ev.type === 'sack') return true;
  if (Math.abs(ev.yards) >= BIG_PLAY_THRESHOLD) return true;
  if (ev.result === 'field_goal_miss') return true;
  return false;
}

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
  momentumPct?: number;
  momentumLeader?: 'home' | 'away' | null;
  driveText?: string;
}

export function FieldView({ event, homeAbbr, awayAbbr, homeId, homeScore, awayScore, quarter, playIndex, totalPlays, momentumPct = 50, momentumLeader, driveText }: FieldViewProps) {
  const [commentary, setCommentary] = useState<string | null>(null);
  const [bigPlay, setBigPlay] = useState(false);
  const [flashType, setFlashType] = useState<'td' | 'turnover' | 'big' | null>(null);
  const [scorePulse, setScorePulse] = useState(false);
  const prevIdxRef = useRef(playIndex);
  const prevScoreRef = useRef(homeScore + awayScore);

  useEffect(() => {
    if (!event) { setCommentary(null); setBigPlay(false); setFlashType(null); return; }
    if (playIndex === prevIdxRef.current) return;
    prevIdxRef.current = playIndex;

    const text = event.commentaryFull ?? `Play result: ${event.yards} yards.`;
    setCommentary(text);

    let flash: 'td' | 'turnover' | 'big' | null = null;
    if (event.result === 'touchdown') flash = 'td';
    else if (event.result === 'turnover') flash = 'turnover';
    else if (Math.abs(event.yards) >= BIG_PLAY_THRESHOLD) flash = 'big';
    setFlashType(flash);

    const totalScore = homeScore + awayScore;
    if (totalScore !== prevScoreRef.current) {
      setScorePulse(true);
      setTimeout(() => setScorePulse(false), 600);
    }
    prevScoreRef.current = totalScore;

    const big = isBigPlay(event);
    if (big || flash) {
      setBigPlay(true);
      const t = setTimeout(() => { setBigPlay(false); setFlashType(null); }, 2000);
      return () => clearTimeout(t);
    } else {
      setBigPlay(false);
    }
  }, [event, playIndex, homeScore, awayScore]);

  if (!event) return null;

  const offIsHome = event.offenseTeamId === homeId;
  const ballPct = Math.max(2, Math.min(98, event.yardLine));
  const offAbbr = offIsHome ? homeAbbr : awayAbbr;
  const defAbbr = offIsHome ? awayAbbr : homeAbbr;

  // Team colors for end zones
  const defColor = teamColor(defAbbr);
  const offColor = teamColor(offAbbr);

  const downDist = event.down > 0 ? `${event.down}${event.down === 1 ? 'st' : event.down === 2 ? 'nd' : event.down === 3 ? 'rd' : 'th'} & ${event.distance}` : '';
  const isRedZone = event.yardLine >= 80;
  const isOT = event.quarter > 4;
  const hasPenalty = !!event.penalty;
  const flashCls = flashType ? ` field-flash-${flashType}` : '';
  const otCls = isOT ? ' field-ot' : '';
  const isBig = bigPlay || (commentary && commentary.length > 0 && isBigPlay(event));

  return (
    <div className={`field-wrap${bigPlay ? ' field-big-play' : ''}${flashCls}${otCls}`}>
      {/* Scoreboard strip */}
      <div className="field-scoreboard">
        <div className="field-sb-team field-sb-away">
          <TeamLogo abbr={awayAbbr} size={32} />
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
          <TeamLogo abbr={homeAbbr} size={32} />
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

      {/* Football field — enlarged with team-colored end zones */}
      <div className={`field-container${isRedZone ? ' field-redzone' : ''}`}>
        {isRedZone && (
          <div className="field-rz-overlay">
            <span className="field-rz-label">RED ZONE</span>
          </div>
        )}

        {/* End zones — team colors applied via inline style */}
        <div
          className="field-endzone field-endzone-left"
          style={{ background: `linear-gradient(135deg, ${defColor}cc, ${defColor}88)` }}
        >
          <TeamLogo abbr={defAbbr} size={36} className="field-ez-logo" />
          <span className="field-ez-text">{defAbbr}</span>
        </div>
        <div
          className="field-endzone field-endzone-right"
          style={{ background: `linear-gradient(135deg, ${offColor}cc, ${offColor}88)` }}
        >
          <TeamLogo abbr={offAbbr} size={36} className="field-ez-logo" />
          <span className="field-ez-text">{offAbbr}</span>
        </div>

        <div className="field-grass">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yl => (
            <div key={yl} className="field-yardline" style={{ left: `${yl}%` }}>
              <span className="field-yardline-num">
                {yl <= 50 ? yl : 100 - yl}
              </span>
            </div>
          ))}
        </div>

        <div className="field-ball-marker" style={{ left: `${ballPct}%` }}>
          <div className="field-ball">🏈</div>
          <div className="field-ball-team">{offAbbr}</div>
        </div>

        {event.down > 0 && event.yardLine + event.distance <= 100 && (
          <div
            className="field-first-down"
            style={{ left: `${Math.min(98, event.yardLine + event.distance)}%` }}
          />
        )}
      </div>

      {/* Down & distance — larger */}
      <div className="field-info-bar">
        <span className="field-down">{downDist}</span>
        <span className="field-possession">{offAbbr} ball</span>
        <span className="field-yardline-text">
          {event.yardLine <= 50
            ? `Own ${event.yardLine}`
            : `Opp ${100 - event.yardLine}`}
        </span>
      </div>

      {/* Commentary */}
      {commentary && (
        <div className={`field-commentary${isBig ? ' field-commentary-big' : ''}${hasPenalty ? ' field-commentary-penalty' : ''}`}>
          <span className="field-commentary-text">{commentary}</span>
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
