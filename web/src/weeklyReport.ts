/**
 * Weekly League Report generator.
 *
 * Produces structured headlines, standouts, and notable games
 * from existing league data. Pure functions, no React.
 */

import type {
  League, Game, Standing, PlayerGameStats,
} from './types';

// ── Report structure ─────────────────────────────────────────────────────────

export interface WeeklyReport {
  week:           number;
  year:           number;
  headlines:      string[];
  metaSummary:    string | null;
  standoutTeams:  StandoutTeam[];
  standoutPlayers: StandoutPlayerLine[];
  notableGames:   NotableGame[];
}

export interface StandoutTeam {
  abbr:   string;
  name:   string;
  detail: string;  // e.g. "4-0, best record in the league"
}

export interface StandoutPlayerLine {
  playerId?: string;
  name:   string;
  teamAbbr: string;
  line:   string;  // e.g. "342 yds, 3 TD passing"
}

export interface NotableGame {
  away:     string;  // abbreviation
  home:     string;
  awayScore: number;
  homeScore: number;
  tag:      string;  // e.g. "Highest scoring", "Closest game"
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickSeeded(templates: string[], seed: number): string {
  return templates[((seed >>> 0) % templates.length)]!;
}

function teamAbbr(game: Game, teamId: string): string {
  return teamId === game.homeTeam.id ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
}

// ── Generator ────────────────────────────────────────────────────────────────

export function generateWeeklyReport(
  league: League,
  standings: Standing[],
): WeeklyReport | null {
  const week = league.currentWeek - 1; // report is for the week just played
  if (week < 1) return null;

  const year = league.currentSeason.year;
  const weekGames = league.currentSeason.games.filter(
    g => g.week === week && g.status === 'final',
  );
  if (weekGames.length === 0) return null;

  const seed = week * 1000 + year;
  const headlines: string[] = [];

  // ── Standings-based headlines ──────────────────────────────────────────────

  const top = standings[0];
  if (top && top.w > 0) {
    const streakLen = top.w;
    if (streakLen >= 4 && top.l === 0) {
      headlines.push(`${top.team.name} remain unbeaten at ${top.w}–${top.l}`);
    } else if (streakLen >= 3) {
      headlines.push(pickSeeded([
        `${top.team.name} sit atop the league at ${top.w}–${top.l}`,
        `${top.team.abbreviation} hold the best record in the league at ${top.w}–${top.l}`,
      ], seed));
    }
  }

  // Worst record (only after week 4+)
  if (week >= 4) {
    const bottom = standings[standings.length - 1];
    if (bottom && bottom.l >= 3 && bottom.w <= 1 && headlines.length < 5) {
      headlines.push(`${bottom.team.name} are struggling at ${bottom.w}–${bottom.l}`);
    }
  }

  // Top offense / defense by points (after week 3+)
  if (week >= 3 && standings.length >= 4) {
    const byPf = [...standings].sort((a, b) => b.pf - a.pf);
    const topOff = byPf[0];
    if (topOff && headlines.length < 5) {
      headlines.push(`${topOff.team.abbreviation} lead the league with ${topOff.pf} points scored`);
    }
    const byPa = [...standings].sort((a, b) => a.pa - b.pa);
    const topDef = byPa[0];
    if (topDef && topDef.team.id !== topOff?.team.id && headlines.length < 5) {
      headlines.push(`${topDef.team.abbreviation} boast the stingiest defense (${topDef.pa} points allowed)`);
    }
  }

  // ── Notable games ──────────────────────────────────────────────────────────

  const notableGames: NotableGame[] = [];

  // Highest scoring
  const sorted = [...weekGames].sort(
    (a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore),
  );
  const highest = sorted[0];
  if (highest && highest.homeScore + highest.awayScore >= 40) {
    notableGames.push({
      away: highest.awayTeam.abbreviation,
      home: highest.homeTeam.abbreviation,
      awayScore: highest.awayScore,
      homeScore: highest.homeScore,
      tag: 'Highest scoring',
    });
    headlines.push(
      `${highest.awayTeam.abbreviation}–${highest.homeTeam.abbreviation} combine for ${highest.homeScore + highest.awayScore} points in a shootout`,
    );
  }

  // Closest game
  const byMargin = [...weekGames].sort(
    (a, b) => Math.abs(a.homeScore - a.awayScore) - Math.abs(b.homeScore - b.awayScore),
  );
  const closest = byMargin[0];
  if (closest && Math.abs(closest.homeScore - closest.awayScore) <= 3 && closest !== highest) {
    notableGames.push({
      away: closest.awayTeam.abbreviation,
      home: closest.homeTeam.abbreviation,
      awayScore: closest.awayScore,
      homeScore: closest.homeScore,
      tag: 'Nail-biter',
    });
    const winner = closest.homeScore >= closest.awayScore ? closest.homeTeam : closest.awayTeam;
    headlines.push(
      `${winner.abbreviation} survives in a ${closest.awayScore}–${closest.homeScore} thriller`,
    );
  }

  // Biggest blowout
  const byBlowout = [...weekGames].sort(
    (a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore),
  );
  const blowout = byBlowout[0];
  if (blowout && Math.abs(blowout.homeScore - blowout.awayScore) >= 21 && blowout !== highest && blowout !== closest) {
    const winner = blowout.homeScore > blowout.awayScore ? blowout.homeTeam : blowout.awayTeam;
    const loser  = blowout.homeScore > blowout.awayScore ? blowout.awayTeam : blowout.homeTeam;
    notableGames.push({
      away: blowout.awayTeam.abbreviation,
      home: blowout.homeTeam.abbreviation,
      awayScore: blowout.awayScore,
      homeScore: blowout.homeScore,
      tag: 'Blowout',
    });
    headlines.push(`${winner.abbreviation} dominates ${loser.abbreviation} in a lopsided affair`);
  }

  // Defensive struggle (lowest scoring, ≤20 combined)
  const lowest = sorted[sorted.length - 1];
  if (lowest && lowest.homeScore + lowest.awayScore <= 20 && lowest !== closest && lowest !== blowout) {
    notableGames.push({
      away: lowest.awayTeam.abbreviation,
      home: lowest.homeTeam.abbreviation,
      awayScore: lowest.awayScore,
      homeScore: lowest.homeScore,
      tag: 'Defensive battle',
    });
    if (headlines.length < 5) {
      headlines.push(`A defensive struggle defines the ${lowest.awayTeam.abbreviation}–${lowest.homeTeam.abbreviation} matchup`);
    }
  }

  // ── Standout players (from this week's box scores) ────────────────────────

  const standoutPlayers: StandoutPlayerLine[] = [];
  const allPlayerStats: { p: PlayerGameStats; game: Game }[] = [];

  for (const g of weekGames) {
    if (!g.boxScore) continue;
    for (const p of Object.values(g.boxScore.players)) {
      allPlayerStats.push({ p, game: g });
    }
  }

  // Top passer
  const passers = allPlayerStats
    .filter(({ p }) => p.attempts >= 10)
    .sort((a, b) => b.p.passingYards - a.p.passingYards);
  if (passers[0]) {
    const { p, game } = passers[0];
    const abbr = teamAbbr(game, p.teamId);
    standoutPlayers.push({
      playerId: p.playerId, name: p.name, teamAbbr: abbr,
      line: `${p.completions}/${p.attempts}, ${p.passingYards} yds, ${p.passingTDs} TD${p.interceptions > 0 ? `, ${p.interceptions} INT` : ''}`,
    });
    if (p.passingYards >= 300 && headlines.length < 6) {
      headlines.push(`${p.name} throws for ${p.passingYards} yards in ${abbr} ${game.homeTeam.id === p.teamId ? 'home' : 'road'} win`);
    }
  }

  // Top rusher
  const rushers = allPlayerStats
    .filter(({ p }) => p.carries >= 5)
    .sort((a, b) => b.p.rushingYards - a.p.rushingYards);
  if (rushers[0] && rushers[0].p.rushingYards >= 50) {
    const { p, game } = rushers[0];
    standoutPlayers.push({
      playerId: p.playerId, name: p.name, teamAbbr: teamAbbr(game, p.teamId),
      line: `${p.carries} car, ${p.rushingYards} yds${p.rushingTDs > 0 ? `, ${p.rushingTDs} TD` : ''}`,
    });
  }

  // Top receiver
  const receivers = allPlayerStats
    .filter(({ p }) => p.receptions >= 3)
    .sort((a, b) => b.p.receivingYards - a.p.receivingYards);
  if (receivers[0] && receivers[0].p.receivingYards >= 60) {
    const { p, game } = receivers[0];
    standoutPlayers.push({
      playerId: p.playerId, name: p.name, teamAbbr: teamAbbr(game, p.teamId),
      line: `${p.receptions} rec, ${p.receivingYards} yds${p.receivingTDs > 0 ? `, ${p.receivingTDs} TD` : ''}`,
    });
  }

  // ── Standout teams ─────────────────────────────────────────────────────────

  const standoutTeams: StandoutTeam[] = [];

  // Best record
  if (top && top.w >= 2) {
    standoutTeams.push({
      abbr: top.team.abbreviation, name: top.team.name,
      detail: `${top.w}–${top.l}, best record in the league`,
    });
  }

  // Biggest win this week
  const biggestWinGame = byBlowout[0];
  if (biggestWinGame) {
    const margin = Math.abs(biggestWinGame.homeScore - biggestWinGame.awayScore);
    if (margin >= 14) {
      const winner = biggestWinGame.homeScore > biggestWinGame.awayScore
        ? biggestWinGame.homeTeam : biggestWinGame.awayTeam;
      if (!standoutTeams.some(t => t.abbr === winner.abbreviation)) {
        standoutTeams.push({
          abbr: winner.abbreviation, name: winner.name,
          detail: `Won by ${margin} this week`,
        });
      }
    }
  }

  // ── Meta summary ───────────────────────────────────────────────────────────

  let metaSummary: string | null = null;
  const m = league.metaProfile;
  if (m && m.totalCalls >= 50) {
    if (m.passRate > 0.60)      metaSummary = 'The league is trending pass-heavy — run-first teams may find openings.';
    else if (m.passRate < 0.40) metaSummary = 'Running games are dominating the league — expect defenses to adjust.';
    else if (m.deepRate > 0.30) metaSummary = 'Deep shots are on the rise — safeties are being tested across the league.';
    else if (m.deepRate < 0.12) metaSummary = 'Short passing rules the day — press coverage and blitzes have the edge.';
    else                        metaSummary = 'The league meta is balanced heading into the next week.';

    // Add a meta-related headline if room
    if (headlines.length < 5) {
      if (m.passRate > 0.58) headlines.push('League-wide passing rates continue to climb');
      else if (m.runRate > 0.58) headlines.push('Run-heavy approaches are gaining traction across the league');
    }
  }

  // ── Surprising teams (big record change, after week 6+) ──────────────────

  if (week >= 6 && standings.length >= 6 && headlines.length < 6) {
    // Team with a much better record than expected (bottom-half team doing well)
    const midIdx = Math.floor(standings.length / 2);
    for (let i = 0; i < Math.min(midIdx, 3); i++) {
      const s = standings[i]!;
      if (s.w >= week * 0.6 && headlines.length < 6) {
        // Only add if not already mentioned (top record)
        if (!headlines.some(h => h.includes(s.team.name) || h.includes(s.team.abbreviation))) {
          headlines.push(`${s.team.name} are turning heads with a ${s.w}–${s.l} record`);
          break;
        }
      }
    }
  }

  // ── Fallback headline if we have too few ────────────────────────────────────

  if (headlines.length === 0) {
    headlines.push(`Week ${week} is in the books`);
  }

  // Cap at 6
  headlines.splice(6);

  return {
    week, year, headlines, metaSummary,
    standoutTeams, standoutPlayers, notableGames,
  };
}
