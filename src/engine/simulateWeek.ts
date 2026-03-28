import { type Player } from '../models/Player';
import { type Team, type PlayEffStats } from '../models/Team';
import { type League, type MetaProfile } from '../models/League';
import { type NewsItem } from '../models/News';
import { type PlayerSeasonStats } from '../models/History';
import { buildDepthChart } from '../models/DepthChart';
import { simulateGame, type GameInjury } from './simulateGame';
import { buildSeasonStats } from './seasonStats';
import {
  newsForGame,
  newsForBigPerformance,
  newsForWeeklyRecap,
  newsForMilestone,
  newsForStatRace,
  newsForStreak,
  addNewsItems,
} from './news';
import { TUNING } from './config';
import { OFFENSIVE_PLAYS } from '../data/plays';

// ── League meta computation ──────────────────────────────────────────────────

function computeLeagueMeta(teams: Team[]): MetaProfile | undefined {
  const engineTypeById = new Map(OFFENSIVE_PLAYS.map(p => [p.id, p.engineType]));
  // Also add custom plays from all teams
  for (const t of teams) {
    for (const p of t.customOffensivePlays ?? []) {
      engineTypeById.set(p.id, p.engineType);
    }
  }

  let runCalls = 0, passCalls = 0, deepCalls = 0, totalCalls = 0;

  for (const t of teams) {
    if (!t.playStats) continue;
    for (const [playId, stats] of Object.entries(t.playStats)) {
      const et = engineTypeById.get(playId);
      if (!et) continue;
      totalCalls += stats.calls;
      if (et === 'inside_run' || et === 'outside_run') runCalls += stats.calls;
      if (et === 'short_pass' || et === 'medium_pass' || et === 'deep_pass') passCalls += stats.calls;
      if (et === 'deep_pass') deepCalls += stats.calls;
    }
  }

  if (totalCalls < 50) return undefined; // not enough league data yet

  const passRate = passCalls / totalCalls;
  const deepRate = passCalls > 0 ? deepCalls / passCalls : 0.2;

  return { passRate, runRate: 1 - passRate, deepRate, totalCalls };
}

// ── Performance thresholds (single-game box score) ─────────────────────────────

const PERF = {
  passingYards:      300,
  passingTDs:        4,
  rushingYards:      150,
  rushingTDs:        3,
  receivingYards:    150,
  receivingTDs:      3,
  sacks:             3,
  interceptionsCaught: 3,
};

// Stat-race categories (shown mid-season)
const RACE_CATS: Array<{ key: keyof PlayerSeasonStats; label: string }> = [
  { key: 'passingYards',        label: 'passing yards'   },
  { key: 'rushingYards',        label: 'rushing yards'   },
  { key: 'receivingYards',      label: 'receiving yards' },
  { key: 'sacks',               label: 'sacks'           },
  { key: 'interceptionsCaught', label: 'interceptions'   },
];

function recoverInjuries(team: Team, isUserTeam: boolean): Team {
  const newRoster = team.roster.map((p: Player) =>
    p.injuryWeeksRemaining > 0
      ? { ...p, injuryWeeksRemaining: p.injuryWeeksRemaining - 1 }
      : p
  );
  if (newRoster.every((p, i) => p.injuryWeeksRemaining === team.roster[i]!.injuryWeeksRemaining)) {
    return team;
  }
  return { ...team, roster: newRoster, depthChart: buildDepthChart(newRoster, isUserTeam) };
}

/** Compute streak length (in games) for a team at the END of all completed games.
 *  Returns { type: 'win' | 'loss', length } or null if last game was a tie. */
function computeStreak(
  teamId: string,
  games: League['currentSeason']['games'],
): { type: 'win' | 'loss'; length: number } | null {
  const played = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === teamId || g.awayTeam.id === teamId))
    .sort((a, b) => a.week - b.week);
  if (played.length === 0) return null;

  let type: 'win' | 'loss' | null = null;
  let length = 0;

  for (let i = played.length - 1; i >= 0; i--) {
    const g = played[i]!;
    const isHome   = g.homeTeam.id === teamId;
    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    if (myScore === oppScore) break; // tie ends the streak
    const result: 'win' | 'loss' = myScore > oppScore ? 'win' : 'loss';

    if (type === null) { type = result; length = 1; }
    else if (type === result) { length++; }
    else break;
  }
  if (!type) return null;
  return { type, length };
}

export function simulateWeek(league: League): League {
  // 1. Recover existing multi-game injuries
  let teams = league.teams.map(t => recoverInjuries(t, t.id === league.userTeamId));

  // 2. Compute league meta profile from all teams' play stats
  const meta = computeLeagueMeta(teams);

  // 3. Simulate games, collecting in-game injuries
  const teamMap      = new Map(teams.map(t => [t.id, t]));
  const allInjuries: GameInjury[] = [];
  const allPlayStats = new Map<string, Map<string, PlayEffStats>>(); // teamId → playId → stats
  const updatedGames = league.currentSeason.games.map(g => {
    if (g.week !== league.currentWeek || g.status !== 'scheduled') return g;
    const result = simulateGame({
      ...g,
      homeTeam: teamMap.get(g.homeTeam.id) ?? g.homeTeam,
      awayTeam: teamMap.get(g.awayTeam.id) ?? g.awayTeam,
    }, meta);
    allInjuries.push(...result.injuries);
    // Merge play effectiveness stats from this game
    for (const [teamId, playMap] of result.playStats) {
      if (!allPlayStats.has(teamId)) allPlayStats.set(teamId, new Map());
      const dest = allPlayStats.get(teamId)!;
      for (const [playId, stats] of playMap) {
        const existing = dest.get(playId);
        if (existing) {
          existing.calls      += stats.calls;
          existing.totalYards += stats.totalYards;
          existing.successes  += stats.successes;
          existing.firstDowns += stats.firstDowns;
          existing.touchdowns += stats.touchdowns;
          existing.turnovers  += stats.turnovers;
        } else {
          dest.set(playId, { ...stats });
        }
      }
    }
    return result.game;
  });

  // 3. Apply in-game injuries and play stats to team rosters
  // Merge cumulative play stats onto teams
  teams = teams.map(t => {
    const gameStats = allPlayStats.get(t.id);
    if (!gameStats) return t;
    const existing = { ...(t.playStats ?? {}) };
    for (const [playId, stats] of gameStats) {
      const prev = existing[playId];
      if (prev) {
        existing[playId] = {
          calls:      prev.calls      + stats.calls,
          totalYards: prev.totalYards + stats.totalYards,
          successes:  prev.successes  + stats.successes,
          firstDowns: prev.firstDowns + stats.firstDowns,
          touchdowns: prev.touchdowns + stats.touchdowns,
          turnovers:  prev.turnovers  + stats.turnovers,
        };
      } else {
        existing[playId] = { ...stats };
      }
    }
    return { ...t, playStats: existing };
  });

  for (const inj of allInjuries) {
    teams = teams.map(t => {
      if (t.id !== inj.teamId) return t;
      const roster = t.roster.map(p =>
        p.id === inj.playerId ? { ...p, injuryWeeksRemaining: inj.weeks } : p
      );
      if (roster === t.roster) return t;
      return { ...t, roster, depthChart: buildDepthChart(roster, t.id === league.userTeamId) };
    });
  }

  const updatedSeason      = { ...league.currentSeason, games: updatedGames };
  const currentSeasonStats = buildSeasonStats(updatedSeason, teams);
  const year               = league.currentSeason.year;
  const week               = league.currentWeek;
  const weekGames          = updatedGames.filter(g => g.week === week && g.status === 'final');

  // 4. Compute team records before this week (for upset detection)
  const recordsBeforeWeek: Record<string, { w: number; l: number; t: number }> = {};
  for (const g of league.currentSeason.games) {
    if (g.status !== 'final' || g.week >= week) continue;
    for (const [tid] of [[g.homeTeam.id], [g.awayTeam.id]]) {
      if (!recordsBeforeWeek[tid!]) recordsBeforeWeek[tid!] = { w: 0, l: 0, t: 0 };
    }
    if (g.homeScore > g.awayScore) {
      recordsBeforeWeek[g.homeTeam.id]!.w++;
      recordsBeforeWeek[g.awayTeam.id]!.l++;
    } else if (g.awayScore > g.homeScore) {
      recordsBeforeWeek[g.awayTeam.id]!.w++;
      recordsBeforeWeek[g.homeTeam.id]!.l++;
    } else {
      recordsBeforeWeek[g.homeTeam.id]!.t++;
      recordsBeforeWeek[g.awayTeam.id]!.t++;
    }
  }

  // 5. Generate news for games (with upset detection)
  const newsItems: NewsItem[] = weekGames.map(g => newsForGame(g, year, false, undefined, recordsBeforeWeek));

  // 6. Build roster lookup (playerId → { position, teamId, name })
  const rosterMap = new Map<string, { position: string; teamId: string; name: string }>();
  for (const t of teams) {
    for (const p of t.roster) {
      rosterMap.set(p.id, { position: p.position, teamId: t.id, name: p.name });
    }
  }

  // 7. Generate big-performance news from box scores
  for (const game of weekGames) {
    if (!game.boxScore) continue;
    for (const [playerId, gs] of Object.entries(game.boxScore.players)) {
      const playerTeam = teamMap.get(gs.teamId);
      if (!playerTeam) continue;
      const position = rosterMap.get(playerId)?.position ?? '';

      if (gs.attempts >= 10 && (gs.passingYards >= PERF.passingYards || gs.passingTDs >= PERF.passingTDs)) {
        const parts: string[] = [];
        if (gs.passingYards > 0) parts.push(`${gs.passingYards} yds`);
        if (gs.passingTDs > 0)   parts.push(`${gs.passingTDs} TD`);
        if (gs.interceptions > 0) parts.push(`${gs.interceptions} INT`);
        newsItems.push(newsForBigPerformance(
          gs.name, playerId, position || 'QB',
          playerTeam.name, playerTeam.id,
          parts.join(', '), year, week,
        ));
      } else if (gs.carries >= 8 && (gs.rushingYards >= PERF.rushingYards || gs.rushingTDs >= PERF.rushingTDs)) {
        const parts: string[] = [];
        if (gs.rushingYards > 0) parts.push(`${gs.rushingYards} rush yds`);
        if (gs.rushingTDs > 0)   parts.push(`${gs.rushingTDs} rush TD`);
        newsItems.push(newsForBigPerformance(
          gs.name, playerId, position || 'RB',
          playerTeam.name, playerTeam.id,
          parts.join(', '), year, week,
        ));
      } else if (gs.targets >= 4 && (gs.receivingYards >= PERF.receivingYards || gs.receivingTDs >= PERF.receivingTDs)) {
        const parts: string[] = [];
        if (gs.receptions > 0 && gs.targets > 0) parts.push(`${gs.receptions}/${gs.targets} rec`);
        if (gs.receivingYards > 0) parts.push(`${gs.receivingYards} yds`);
        if (gs.receivingTDs > 0)   parts.push(`${gs.receivingTDs} TD`);
        newsItems.push(newsForBigPerformance(
          gs.name, playerId, position || 'WR',
          playerTeam.name, playerTeam.id,
          parts.join(', '), year, week,
        ));
      } else if (gs.sacks >= PERF.sacks || gs.interceptionsCaught >= PERF.interceptionsCaught) {
        const parts: string[] = [];
        if (gs.sacks >= PERF.sacks)                           parts.push(`${gs.sacks} sacks`);
        if (gs.interceptionsCaught >= PERF.interceptionsCaught) parts.push(`${gs.interceptionsCaught} INT`);
        newsItems.push(newsForBigPerformance(
          gs.name, playerId, position || 'DEF',
          playerTeam.name, playerTeam.id,
          parts.join(', '), year, week,
        ));
      }
    }
  }

  // 8. Milestone detection (compare prev season stats to new)
  const milestoneThresholds = TUNING.news.milestones;
  type MilestoneStatKey = keyof typeof milestoneThresholds;
  const milestonesHit = { ...league.milestonesHit };
  const milestoneItems: NewsItem[] = [];

  for (const [playerId, newStats] of Object.entries(currentSeasonStats)) {
    const prevStats = league.currentSeasonStats[playerId];
    const rp       = rosterMap.get(playerId);
    const pt       = teamMap.get(newStats.teamId);
    if (!rp || !pt) continue;

    const hitKeys: string[] = milestonesHit[playerId] ? [...milestonesHit[playerId]] : [];

    for (const statKey of Object.keys(milestoneThresholds) as MilestoneStatKey[]) {
      const thresholds = milestoneThresholds[statKey] as readonly number[];
      const prevVal    = (prevStats?.[statKey] as number | undefined) ?? 0;
      const newVal     = newStats[statKey] as number;

      for (const threshold of thresholds) {
        const milestoneKey = `${statKey}:${threshold}`;
        if (hitKeys.includes(milestoneKey)) continue;
        if (prevVal < threshold && newVal >= threshold) {
          milestoneItems.push(newsForMilestone(
            rp.name, playerId, rp.position,
            pt.name, pt.id,
            statKey, threshold,
            year, week,
          ));
          hitKeys.push(milestoneKey);
        }
      }
    }

    if (hitKeys.length > (milestonesHit[playerId]?.length ?? 0)) {
      milestonesHit[playerId] = hitKeys;
    }
  }

  // Cap milestones per week
  const cappedMilestones = milestoneItems.slice(0, TUNING.news.feedBalance.maxMilestonesPerWeek);
  newsItems.push(...cappedMilestones);

  // 9. Stat race headlines (gated by week)
  const raceItems: NewsItem[] = [];
  if (week >= TUNING.news.statRace.firstEligibleWeek) {
    // Shuffle categories so we vary which 2 are shown each week
    const shuffled = [...RACE_CATS].sort(() => Math.random() - 0.5);
    const picked: NewsItem[] = [];

    for (const cat of shuffled) {
      if (picked.length >= TUNING.news.statRace.maxPerWeek) break;

      const sorted = Object.entries(currentSeasonStats)
        .map(([id, s]) => ({ id, val: s[cat.key] as number, teamId: s.teamId }))
        .filter(e => e.val > 0)
        .sort((a, b) => b.val - a.val);

      if (sorted.length === 0) continue;
      const leader  = sorted[0]!;
      const chaser  = sorted[1] ?? null;
      const lrp     = rosterMap.get(leader.id);
      const lTeam   = teamMap.get(leader.teamId);
      if (!lrp || !lTeam) continue;

      const chaserName  = chaser ? (rosterMap.get(chaser.id)?.name ?? null) : null;
      const chaserVal   = chaser?.val ?? null;

      picked.push(newsForStatRace(
        lrp.name, leader.id,
        lTeam.name, lTeam.id,
        cat.key, leader.val,
        chaserName, chaserVal,
        year, week,
      ));
    }
    raceItems.push(...picked);
    newsItems.push(...raceItems);
  }

  // 10. Streak detection — fire when streak length = 3, 5, 7, 9 ...
  for (const team of teams) {
    const streak = computeStreak(team.id, updatedGames);
    if (!streak) continue;
    const len = streak.length;
    if (len >= TUNING.news.streak.minLength && (len - TUNING.news.streak.minLength) % 2 === 0) {
      newsItems.push(newsForStreak(team.name, team.id, streak.type, len, year, week));
    }
  }

  // 11. Weekly recap (max 1 per week)
  const recapPerfs: { name: string; playerId: string; teamName: string; teamId: string; line: string }[] = [];

  // Collect top passing + rushing performances from box scores
  type BoxEntry = { playerId: string; name: string; teamId: string; passingYards: number; rushingYards: number; receivingYards: number };
  const boxEntries: BoxEntry[] = [];
  for (const game of weekGames) {
    if (!game.boxScore) continue;
    for (const [pid, gs] of Object.entries(game.boxScore.players)) {
      boxEntries.push({
        playerId: pid, name: gs.name, teamId: gs.teamId,
        passingYards:   gs.passingYards,
        rushingYards:   gs.rushingYards,
        receivingYards: gs.receivingYards,
      });
    }
  }
  // Top passer
  const topPasser = boxEntries.filter(e => e.passingYards > 0).sort((a, b) => b.passingYards - a.passingYards)[0];
  if (topPasser && topPasser.passingYards >= 250) {
    const team = teamMap.get(topPasser.teamId);
    if (team) recapPerfs.push({ name: topPasser.name, playerId: topPasser.playerId, teamName: team.name, teamId: team.id, line: `${topPasser.passingYards} pass yds` });
  }
  // Top rusher
  const topRusher = boxEntries.filter(e => e.rushingYards > 0).sort((a, b) => b.rushingYards - a.rushingYards)[0];
  if (topRusher && topRusher.rushingYards >= 100) {
    const team = teamMap.get(topRusher.teamId);
    if (team) recapPerfs.push({ name: topRusher.name, playerId: topRusher.playerId, teamName: team.name, teamId: team.id, line: `${topRusher.rushingYards} rush yds` });
  }

  // Any upset from this week?
  const upsetItem = newsItems.find(n => n.type === 'upset');
  const upsetSummary = upsetItem ? upsetItem.body : null;

  // Best-record team (for standout team)
  const allTeamRecords: Array<{ teamId: string; w: number; total: number }> = [];
  for (const g of updatedGames) {
    if (g.status !== 'final') continue;
    for (const [tid, won] of [
      [g.homeTeam.id, g.homeScore > g.awayScore] as [string, boolean],
      [g.awayTeam.id, g.awayScore > g.homeScore] as [string, boolean],
    ]) {
      const existing = allTeamRecords.find(r => r.teamId === tid);
      if (existing) { existing.total++; if (won) existing.w++; }
      else allTeamRecords.push({ teamId: tid, w: won ? 1 : 0, total: 1 });
    }
  }
  const bestTeamEntry = allTeamRecords
    .filter(r => r.total >= 3)
    .sort((a, b) => (b.w / b.total) - (a.w / a.total))[0];
  const standoutTeam = bestTeamEntry
    ? { name: teamMap.get(bestTeamEntry.teamId)?.name ?? '', id: bestTeamEntry.teamId }
    : null;

  const recapItem = newsForWeeklyRecap(week, year, recapPerfs, upsetSummary, standoutTeam);
  newsItems.push(recapItem);

  // 12. Assemble final league state
  // Recompute meta after this week's stats are merged into teams
  const updatedMeta = computeLeagueMeta(teams);
  const base: League = {
    ...league,
    teams,
    currentSeason:      updatedSeason,
    currentSeasonStats,
    currentWeek:        week + 1,
    milestonesHit,
    ...(updatedMeta ? { metaProfile: updatedMeta } : {}),
  };
  return addNewsItems(base, newsItems);
}
