/**
 * Hall of Fame induction — evaluates retired players at the end of each offseason
 * and permanently records inductees in league.history.hallOfFame.
 */

import { type League }                             from '../models/League';
import { type HallOfFameEntry, deriveCareerStats } from '../models/History';
import { type NewsItem }                           from '../models/News';
import { computeLegacyScore, computeLegacyTier }   from './legacy';
import { newsForHofInduction, addNewsItems }        from './news';
import { TUNING }                                  from './config';

/**
 * Evaluate all retired players who have not yet been inducted.
 * Those whose legacy score meets the induction threshold are added to
 * league.history.hallOfFame and receive a news item.
 *
 * Call this after processRetirements() so newly retired players are included.
 */
export function inductHallOfFame(league: League): League {
  const year      = league.currentSeason.year;
  const alreadyIn = new Set(
    (league.history.hallOfFame ?? []).map(e => e.playerId),
  );

  const candidates = league.history.retiredPlayers.filter(
    r => !alreadyIn.has(r.playerId),
  );

  if (candidates.length === 0) return league;

  const newInductees: HallOfFameEntry[] = [];
  const newsItems:    NewsItem[]         = [];

  for (const retired of candidates) {
    const score = computeLegacyScore(retired.playerId, retired.position, league.history);
    if (score < TUNING.hof.inductionThreshold) continue;

    const tier    = computeLegacyTier(score);
    const seasons = league.history.playerHistory[retired.playerId] ?? [];
    const career  = deriveCareerStats(seasons);

    // Awards count per type
    const awardsCount: Record<string, number> = {};
    for (const sa of league.history.seasonAwards) {
      for (const a of sa.awards) {
        if (a.playerId !== retired.playerId) continue;
        awardsCount[a.type] = (awardsCount[a.type] ?? 0) + 1;
      }
    }

    // Championships (player was on the title team that year)
    let championships = 0;
    for (const s of seasons) {
      if (league.history.championsByYear[s.year]?.teamId === s.teamId) {
        championships++;
      }
    }

    // Teams played for (in chronological order, deduplicated)
    const seenTeams  = new Set<string>();
    const teamIds:   string[] = [];
    const teamNames: string[] = [];
    for (const s of seasons) {
      if (seenTeams.has(s.teamId)) continue;
      seenTeams.add(s.teamId);
      teamIds.push(s.teamId);
      // Prefer full name from current roster; fall back to abbreviation from history
      const liveTeam = league.teams.find(t => t.id === s.teamId);
      teamNames.push(liveTeam?.name ?? s.teamAbbreviation);
    }

    const entry: HallOfFameEntry = {
      playerId:      retired.playerId,
      name:          retired.name,
      position:      retired.position,
      inductionYear: year,
      yearsPlayed:   seasons.length,
      legacyScore:   score,
      legacyTier:    tier,
      careerStats:   career,
      awardsCount,
      championships,
      teamIds,
      teamNames,
    };

    newInductees.push(entry);
    newsItems.push(
      newsForHofInduction(retired.name, retired.playerId, retired.position, year, championships),
    );
  }

  if (newInductees.length === 0) return league;

  return addNewsItems(
    {
      ...league,
      history: {
        ...league.history,
        hallOfFame: [...(league.history.hallOfFame ?? []), ...newInductees],
      },
    },
    newsItems,
  );
}
