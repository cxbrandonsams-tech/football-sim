import { type Player } from '../models/Player';
import { type League } from '../models/League';
import { type RetiredPlayerRecord } from '../models/History';
import { type NewsItem } from '../models/News';
import { buildDepthChart } from '../models/DepthChart';
import { newsForRetirement, addNewsItems } from './news';
import { TUNING } from './config';

const RET = TUNING.retirement;

// ── Retirement probability ────────────────────────────────────────────────────

/**
 * Looks up the base retirement chance for a player's age.
 * Returns 0 for players below minRetirementAge.
 */
function baseRetirementChance(age: number): number {
  if (age < RET.minRetirementAge) return 0;
  let chance = 0;
  for (const entry of RET.ageCurve) {
    if (age >= entry.minAge) chance = entry.chance;
  }
  return chance;
}

function retirementChance(player: Player): number {
  let chance = baseRetirementChance(player.age);
  if (chance === 0) return 0;

  // Low-overall players are more likely to call it quits
  if (player.overall < RET.lowOverallThreshold) {
    chance += RET.lowOverallBonus;
  }

  // Elite players can hang on longer
  if (player.overall >= RET.eliteOverallThreshold) {
    chance = Math.max(0, chance - RET.eliteOverallSave);
  }

  return Math.min(1, chance);
}

function makeRecord(player: Player, year: number): RetiredPlayerRecord {
  return {
    playerId:       player.id,
    name:           player.name,
    position:       player.position,
    retirementYear: year,
    finalAge:       player.age,
    finalOverall:   player.overall,
  };
}

// ── League retirement pass ────────────────────────────────────────────────────

export interface RetirementResult {
  league:       League;
  retiredCount: number;
}

/**
 * Process retirements for all players (rosters + free agents).
 * Call this after `progressLeague()` so that age increments have already occurred.
 *
 * Players who retire are:
 *  - Removed from their team roster (or the free-agent pool)
 *  - Appended to league.history.retiredPlayers
 *  - Preserved in league.history.playerHistory (stat history is untouched)
 */
export function processRetirements(league: League): RetirementResult {
  const year        = league.currentSeason.year;
  const newRetired: RetiredPlayerRecord[] = [];
  const newsItems:  NewsItem[] = [];

  const retire = (player: Player) => {
    const record = makeRecord(player, year);
    newRetired.push(record);
    const seasons = league.history.playerHistory[player.id]?.length ?? 0;
    newsItems.push(newsForRetirement(player.name, player.id, player.position, player.age, seasons, year));
  };

  // ── Team rosters ─────────────────────────────────────────────────────────
  const updatedTeams = league.teams.map(team => {
    const isUserTeam = team.id === league.userTeamId;
    const active: Player[] = [];

    for (const player of team.roster) {
      if (Math.random() < retirementChance(player)) retire(player);
      else active.push(player);
    }

    if (active.length === team.roster.length) return team;
    return { ...team, roster: active, depthChart: buildDepthChart(active, isUserTeam) };
  });

  // ── Free agent pool ───────────────────────────────────────────────────────
  const remainingFA: Player[] = [];
  for (const player of league.freeAgents) {
    if (Math.random() < retirementChance(player)) retire(player);
    else remainingFA.push(player);
  }

  if (newRetired.length === 0) {
    return { league, retiredCount: 0 };
  }

  const updated: League = {
    ...league,
    teams:      updatedTeams,
    freeAgents: remainingFA,
    history: {
      ...league.history,
      retiredPlayers: [...league.history.retiredPlayers, ...newRetired],
    },
  };

  return {
    league:       addNewsItems(updated, newsItems),
    retiredCount: newRetired.length,
  };
}
