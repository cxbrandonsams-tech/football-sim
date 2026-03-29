/**
 * Ring of Honor — team-specific legacy system.
 *
 * Unlike the Hall of Fame (league-wide career), Ring of Honor evaluates only
 * what a player accomplished while on a specific franchise.  A player can be
 * in multiple Ring of Honors if they had meaningful stints on multiple teams,
 * and Ring-of-Honor membership is completely independent from Hall of Fame.
 *
 * Call inductRingOfHonor() after processRetirements() and inductHallOfFame()
 * in the offseason flow.
 */

import { type League }                                             from '../models/League';
import { type RingOfHonorEntry, type PlayerSeasonStats, deriveCareerStats } from '../models/History';
import { type NewsItem }                                           from '../models/News';
import { getPositionGroup }                                        from './legacy';
import { newsForRingOfHonorInduction, newsForJerseyRetirement, addNewsItems } from './news';
import { TUNING }                                                  from './config';

// ── Team-specific legacy score ─────────────────────────────────────────────────

/**
 * Compute how much legacy a player built with one specific team.
 * Uses the same stat multipliers as the Hall of Fame, but:
 *   - only counts seasons spent on that team
 *   - adds a loyalty bonus for long-term franchise cornerstones
 *   - awards and championships are counted only if they occurred while on that team
 */
export function computeTeamLegacyScore(
  playerId: string,
  position: string,
  teamId:   string,
  history:  League['history'],
): number {
  const allSeasons  = history.playerHistory[playerId] ?? [];
  const teamSeasons = allSeasons.filter(s => s.teamId === teamId);
  if (teamSeasons.length === 0) return 0;

  const career   = deriveCareerStats(teamSeasons);
  const posGroup = getPositionGroup(position);
  const w        = TUNING.hof.statWeights[posGroup];
  const cfg      = TUNING.ringOfHonor;

  // 1. Era-relative seasonal rank (for team seasons only)
  const RANK_STATS: Record<string, (keyof PlayerSeasonStats)[]> = {
    QB: ['passingYards', 'passingTDs'], RB: ['rushingYards', 'rushingTDs'],
    WR: ['receivingYards', 'receivingTDs'], TE: ['receivingYards', 'receptions'],
    OL: [], DL: ['sacks'], LB: ['tackles', 'sacks'],
    CB: ['interceptionsCaught'], SAF: ['interceptionsCaught'], ST: [],
  };
  const rankStats = RANK_STATS[posGroup] ?? [];
  let score = 0;
  for (const s of teamSeasons) {
    for (const stat of rankStats) {
      const entries: { val: number }[] = [];
      let myVal = 0;
      for (const pSeasons of Object.values(history.playerHistory)) {
        const ps = pSeasons.find(ps2 => ps2.year === s.year);
        if (!ps) continue;
        const v = ps[stat];
        if (typeof v === 'number' && v > 0) {
          entries.push({ val: v });
          if (pSeasons === allSeasons) myVal = v;
        }
      }
      if (myVal <= 0) continue;
      entries.sort((a, b) => b.val - a.val);
      const rank = entries.findIndex(e => e.val <= myVal) + 1;
      if (rank === 1)       score += 5;
      else if (rank <= 3)   score += 3;
      else if (rank <= 5)   score += 2;
      else if (rank <= 10)  score += 1;
    }
  }

  // 2. Small stat contribution (reduced — seasonal ranks carry primary weight)
  score += career.passingYards        * w.passingYards * 0.3;
  score += career.passingTDs          * w.passingTDs * 0.3;
  score += career.rushingYards        * w.rushingYards * 0.3;
  score += career.rushingTDs          * w.rushingTDs * 0.3;
  score += career.receivingYards      * w.receivingYards * 0.3;
  score += career.receivingTDs        * w.receivingTDs * 0.3;
  score += career.receptions          * w.receptions * 0.3;
  score += career.sacks               * w.sacks * 0.3;
  score += career.interceptionsCaught * w.interceptionsCaught * 0.3;

  // 2. Longevity with this team
  score += career.seasons * (cfg.longevityPerYear ?? 2);

  // 3. Loyalty bonus for franchise cornerstones
  const loyaltyThreshold = cfg.loyaltyThreshold ?? 3;
  const loyaltyBonus     = cfg.loyaltyBonus     ?? 4;
  if (career.seasons > loyaltyThreshold) {
    score += (career.seasons - loyaltyThreshold) * loyaltyBonus;
  }

  // 4. Awards won while on this team
  const awardPts = cfg.awardPoints as unknown as Record<string, number>;
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      // Only credit awards earned while on this specific team
      const matchingSeason = teamSeasons.find(s => s.year === sa.year);
      if (!matchingSeason) continue;
      score += awardPts[a.type] ?? 0;
    }
  }

  // 5. Championships won with this team
  const championshipBonus = cfg.championshipBonus ?? 15;
  for (const s of teamSeasons) {
    if (history.championsByYear[s.year]?.teamId === teamId) {
      score += championshipBonus;
    }
  }

  return Math.round(score);
}

// ── Induction ─────────────────────────────────────────────────────────────────

/**
 * Evaluate all retired players for Ring of Honor eligibility across every team
 * they played for.  Qualifying players are inducted into each team's Ring of
 * Honor and may have their jersey retired if they clear the higher threshold.
 *
 * Safe to call repeatedly — already-inducted players are silently skipped.
 */
export function inductRingOfHonor(league: League): League {
  const year      = league.currentSeason.year;
  const cfg       = TUNING.ringOfHonor;
  const threshold = cfg.inductionThreshold        ?? 45;
  const jerseyThr = cfg.jerseyRetirementThreshold ?? 80;

  // Build dedup sets for what's already in each team's Ring of Honor
  const alreadyIn = new Map<string, Set<string>>();
  for (const [teamId, entries] of Object.entries(league.history.ringOfHonor ?? {})) {
    alreadyIn.set(teamId, new Set(entries.map(e => e.playerId)));
  }

  const candidates = league.history.retiredPlayers;
  if (candidates.length === 0) return league;

  const newEntries = new Map<string, RingOfHonorEntry[]>();
  const newsItems:  NewsItem[] = [];

  for (const retired of candidates) {
    const seasons = league.history.playerHistory[retired.playerId] ?? [];
    if (seasons.length === 0) continue;

    // Evaluate for every team the player spent time with
    const teamIds = [...new Set(seasons.map(s => s.teamId))];

    for (const teamId of teamIds) {
      // Skip if already inducted for this team
      if (alreadyIn.get(teamId)?.has(retired.playerId)) continue;

      const score = computeTeamLegacyScore(retired.playerId, retired.position, teamId, league.history);
      if (score < threshold) continue;

      // Team-filtered seasons only
      const teamSeasons   = seasons.filter(s => s.teamId === teamId);
      const yearsWithTeam = teamSeasons.length;

      // Awards earned while on this team
      const awardsWithTeam: Record<string, number> = {};
      for (const sa of league.history.seasonAwards) {
        for (const a of sa.awards) {
          if (a.playerId !== retired.playerId) continue;
          if (!teamSeasons.some(s => s.year === sa.year)) continue;
          awardsWithTeam[a.type] = (awardsWithTeam[a.type] ?? 0) + 1;
        }
      }

      // Championships with this team
      let champs = 0;
      for (const s of teamSeasons) {
        if (league.history.championsByYear[s.year]?.teamId === teamId) champs++;
      }

      const jerseyRetired = score >= jerseyThr;
      const teamName      = league.teams.find(t => t.id === teamId)?.name ?? teamId;

      const entry: RingOfHonorEntry = {
        playerId:              retired.playerId,
        name:                  retired.name,
        position:              retired.position,
        inductedYear:          year,
        yearsWithTeam,
        teamLegacyScore:       score,
        awardsWithTeam,
        championshipsWithTeam: champs,
        jerseyRetired,
      };

      if (!newEntries.has(teamId)) newEntries.set(teamId, []);
      newEntries.get(teamId)!.push(entry);

      newsItems.push(
        newsForRingOfHonorInduction(
          retired.name, retired.playerId, retired.position,
          teamId, teamName, year, champs,
        ),
      );
      if (jerseyRetired) {
        newsItems.push(
          newsForJerseyRetirement(
            retired.name, retired.playerId, retired.position,
            teamId, teamName, year,
          ),
        );
      }

      // Track dedup for subsequent iterations within the same call
      if (!alreadyIn.has(teamId)) alreadyIn.set(teamId, new Set());
      alreadyIn.get(teamId)!.add(retired.playerId);
    }
  }

  if (newEntries.size === 0) return league;

  const existingRoH = league.history.ringOfHonor ?? {};
  const updatedRoH: Record<string, RingOfHonorEntry[]> = { ...existingRoH };
  for (const [teamId, entries] of newEntries) {
    updatedRoH[teamId] = [...(existingRoH[teamId] ?? []), ...entries];
  }

  return addNewsItems(
    {
      ...league,
      history: { ...league.history, ringOfHonor: updatedRoH },
    },
    newsItems,
  );
}
