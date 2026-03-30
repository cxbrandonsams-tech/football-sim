import { type PlayEvent } from '../models/PlayEvent';
import { type Game } from '../models/Game';

// ── Formatters ────────────────────────────────────────────────────────────────

function downStr(down: number): string {
  return ['1st', '2nd', '3rd', '4th'][down - 1] ?? `${down}th`;
}

function fieldPos(yardLine: number): string {
  if (yardLine < 50)  return `Own ${yardLine}`;
  if (yardLine === 50) return `Mid`;
  return `OPP ${100 - yardLine}`;
}

function formatPlay(ev: PlayEvent): string {
  const sit = `${downStr(ev.down)}&${ev.distance} ${fieldPos(ev.yardLine).padEnd(7)}`;
  const qb  = ev.ballCarrier ?? '?';
  const wr  = ev.target ?? '?';
  const yds = ev.yards;
  const ydStr = `${yds} yd${Math.abs(yds) !== 1 ? 's' : ''}`;

  let action: string;
  switch (ev.type) {
    case 'inside_run':
      action = ev.result === 'touchdown' ? `${qb} dives in — TOUCHDOWN`
        : `${qb} inside run ${ydStr}`;
      break;
    case 'outside_run':
      action = ev.result === 'touchdown' ? `${qb} sweeps in — TOUCHDOWN`
        : `${qb} outside run ${ydStr}`;
      break;
    case 'short_pass':
      action = ev.result === 'touchdown' ? `${qb} → ${wr} short — TOUCHDOWN`
        : ev.result === 'success'        ? `${qb} → ${wr} short, ${ydStr}`
        :                                  `${qb} → ${wr} incomplete`;
      break;
    case 'medium_pass':
      action = ev.result === 'touchdown' ? `${qb} → ${wr} — TOUCHDOWN`
        : ev.result === 'success'        ? `${qb} → ${wr}, ${ydStr}`
        :                                  `${qb} → ${wr} incomplete`;
      break;
    case 'deep_pass':
      action = ev.result === 'touchdown' ? `${qb} deep → ${wr} — TOUCHDOWN`
        : ev.result === 'success'        ? `${qb} deep → ${wr}, ${ydStr}`
        :                                  `${qb} deep → ${wr} incomplete`;
      break;
    case 'sack':
      action = `${qb} sacked ${ydStr}`;
      break;
    case 'scramble':
      action = ev.result === 'touchdown' ? `${qb} scrambles in — TOUCHDOWN`
        : `${qb} scrambles ${ydStr}`;
      break;
    case 'interception':
      action = `${qb} → ${wr} — INTERCEPTED`;
      break;
    case 'fumble':
      action = `${qb} FUMBLE — turnover`;
      break;
    case 'field_goal':
      action = ev.result === 'field_goal_good'
        ? `${qb} FG ${(100 - ev.yardLine) + 17} yds — GOOD`
        : `${qb} FG — NO GOOD`;
      break;
    case 'punt':
      action = `Punt ${yds} yds`;
      break;
    case 'spike':
      action = `QB spikes the ball`;
      break;
  }

  const fd = ev.firstDown ? ' ↑' : '';

  // Penalty annotation
  let penStr = '';
  if (ev.penalty) {
    const p = ev.penalty;
    const penName = p.type === 'dpi' ? 'Pass Interference' :
                    p.type === 'def_holding' ? 'Defensive Holding' :
                    p.type === 'roughing' ? 'Roughing the Passer' :
                    p.type === 'offsides' ? 'Offsides' :
                    p.type === 'off_holding' ? 'Holding' :
                    'False Start';
    if (p.accepted) {
      penStr = ` 🚩 ${penName} (${Math.abs(p.yards)} yds) — ACCEPTED`;
    } else {
      penStr = ` 🚩 ${penName} — DECLINED`;
    }
  }

  return `${sit} | ${action}${fd}${penStr}`;
}

// ── Game log ──────────────────────────────────────────────────────────────────

export function formatGameLog(game: Game): string[] {
  const lines: string[] = [];
  const homeId = game.homeTeam.id;

  let currentQuarter = 0;
  let homeScore = 0;
  let awayScore = 0;

  for (const ev of (game.events ?? [])) {
    if (ev.quarter !== currentQuarter) {
      if (currentQuarter > 0) {
        lines.push(`  Score: ${game.awayTeam.abbreviation} ${awayScore} — ${game.homeTeam.abbreviation} ${homeScore}`);
        lines.push('');
      }
      currentQuarter = ev.quarter;
      const qLabel = currentQuarter <= 4 ? `Q${currentQuarter}` : currentQuarter === 5 ? 'OT' : `OT${currentQuarter - 4}`;
      lines.push(`  ── ${qLabel} ──`);
    }

    const offAbbr = ev.offenseTeamId === homeId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
    lines.push(`  [${offAbbr}] ${formatPlay(ev)}`);

    if (ev.result === 'touchdown')      { if (ev.offenseTeamId === homeId) homeScore += 7; else awayScore += 7; }
    if (ev.result === 'field_goal_good'){ if (ev.offenseTeamId === homeId) homeScore += 3; else awayScore += 3; }
  }

  lines.push('');
  lines.push(`  FINAL: ${game.awayTeam.abbreviation} ${game.awayScore} — ${game.homeTeam.abbreviation} ${game.homeScore}`);
  return lines;
}
