/**
 * GM Career Mode — Phase 35.
 *
 * Tracks the user-controlled GM's season-by-season history, transactions,
 * legacy score, and earned achievements.
 *
 * Public API:
 *   initGmCareer(league)          — call once when a user first takes control of a team.
 *   updateGmSeasonRecord(league)  — call at end-of-season rollup to archive the GM's season.
 *   resetGmSeasonCounters(league) — call at start of each new season to zero in-season counters.
 *   incrementGmStat(league, stat) — call from server endpoints to track transactions.
 *   computeGmLegacyScore(career)  — derive legacy score from career history.
 *   checkGmAchievements(league)   — evaluate and unlock new achievements; returns news items.
 */

import { type League }                     from '../models/League';
import { type GmCareer, type GmSeasonRecord, type GmAchievement } from '../models/History';
import { type NewsItem }                   from '../models/News';
import { TUNING }                          from './config';
import { newsForGmMilestone }              from './news';

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise a fresh GmCareer for the user's team.
 * Safe to call on an existing league — returns unchanged if gmCareer already exists.
 */
export function initGmCareer(league: League): League {
  if (league.gmCareer) return league;
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return league;

  const career: GmCareer = {
    teamId:                  userTeam.id,
    teamName:                userTeam.name,
    startYear:               league.currentSeason.year,
    seasons:                 [],
    achievements:            [],
    legacyScore:             0,
    currentSeasonDraftPicks: 0,
    currentSeasonTrades:     0,
    currentSeasonFaSignings: 0,
  };
  return { ...league, gmCareer: career };
}

// ── In-season counters ────────────────────────────────────────────────────────

/** Increment one of the in-season GM transaction counters. */
export function incrementGmStat(
  league: League,
  stat: 'draftPick' | 'trade' | 'faSigning',
): League {
  const career = league.gmCareer;
  if (!career) return league;

  const updated: GmCareer = {
    ...career,
    currentSeasonDraftPicks:  stat === 'draftPick' ? career.currentSeasonDraftPicks + 1 : career.currentSeasonDraftPicks,
    currentSeasonTrades:      stat === 'trade'     ? career.currentSeasonTrades + 1     : career.currentSeasonTrades,
    currentSeasonFaSignings:  stat === 'faSigning' ? career.currentSeasonFaSignings + 1 : career.currentSeasonFaSignings,
  };
  return { ...league, gmCareer: updated };
}

// ── End-of-season rollup ──────────────────────────────────────────────────────

/**
 * Archive the completed season into the GM's career history.
 * Recomputes the legacy score and checks for new achievements.
 *
 * Call this inside rollupSeasonHistory() after team/coach history is settled
 * so that playoff / championship info is available on the playoff bracket.
 */
export function updateGmSeasonRecord(league: League): { league: League; newsItems: NewsItem[] } {
  const career = league.gmCareer;
  if (!career) return { league, newsItems: [] };

  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return { league, newsItems: [] };

  // Find the team's season record from this year's team history
  const year     = league.currentSeason.year;
  const teamRecs = league.history.teamHistory[userTeam.id] ?? [];
  const teamRec  = teamRecs[teamRecs.length - 1];  // most recent (just appended)

  // Determine championship
  const wonChampionship = league.playoff?.championId === userTeam.id;
  const madePlayoffs    = (() => {
    const playoff = league.playoff;
    if (!playoff) return false;
    return playoff.matchups.some(
      m => m.topSeedId === userTeam.id || m.bottomSeedId === userTeam.id
    );
  })();

  const seasonRecord: GmSeasonRecord = {
    year,
    teamId:           userTeam.id,
    teamName:         userTeam.name,
    wins:             teamRec?.wins             ?? 0,
    losses:           teamRec?.losses           ?? 0,
    ties:             teamRec?.ties             ?? 0,
    madePlayoffs,
    wonChampionship,
    draftPicksMade:   career.currentSeasonDraftPicks,
    tradesMade:       career.currentSeasonTrades,
    faSigningsMade:   career.currentSeasonFaSignings,
  };

  const updatedSeasons = [...career.seasons, seasonRecord];
  const newScore       = computeGmLegacyScore({ ...career, seasons: updatedSeasons });

  const updatedCareer: GmCareer = {
    ...career,
    teamId:   userTeam.id,
    teamName: userTeam.name,
    seasons:  updatedSeasons,
    legacyScore: newScore,
    // Counters will be reset in startNextSeason
  };

  const leagueWithCareer = { ...league, gmCareer: updatedCareer };
  const { league: withAchievements, newsItems } = checkGmAchievements(leagueWithCareer);
  return { league: withAchievements, newsItems };
}

/**
 * Reset in-season counters at the start of each new season.
 * Call from startNextSeason().
 */
export function resetGmSeasonCounters(league: League): League {
  const career = league.gmCareer;
  if (!career) return league;
  const userTeam = league.teams.find(t => t.id === league.userTeamId);

  return {
    ...league,
    gmCareer: {
      ...career,
      // Update team name in case it changed (very unlikely, but safe)
      teamId:   userTeam?.id   ?? career.teamId,
      teamName: userTeam?.name ?? career.teamName,
      currentSeasonDraftPicks: 0,
      currentSeasonTrades:     0,
      currentSeasonFaSignings: 0,
    },
  };
}

// ── Legacy score ──────────────────────────────────────────────────────────────

/** Derive the GM's current legacy score from career history. */
export function computeGmLegacyScore(career: GmCareer): number {
  const cfg = TUNING.gmLegacy;
  let score  = 0;

  for (const s of career.seasons) {
    score += cfg.longevityPerYear;
    score += s.wins * cfg.winScale;
    if (s.wonChampionship)                    score += cfg.championshipBonus;
    if (s.madePlayoffs)                       score += cfg.playoffBonus;
    if (s.wins > s.losses)                    score += cfg.winningSeasonBonus;
  }

  // Achievement bonuses
  for (const ach of career.achievements) {
    score += cfg.achievementPoints[ach.id] ?? 0;
  }

  return Math.round(score);
}

/** Map a legacy score to a tier label. */
export function gmLegacyTier(score: number): string {
  const t = TUNING.gmLegacy.tierThresholds;
  if (score >= t.legendary)   return 'Legendary';
  if (score >= t.elite)       return 'Elite';
  if (score >= t.respected)   return 'Respected';
  if (score >= t.established) return 'Established';
  if (score >= t.building)    return 'Building';
  return 'Newcomer';
}

// ── Achievement definitions ───────────────────────────────────────────────────

interface AchievementDef {
  id:          string;
  label:       string;
  description: string;
  check: (career: GmCareer) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'first_championship',
    label: 'First Championship',
    description: 'Win your first league championship as GM.',
    check: c => c.seasons.some(s => s.wonChampionship),
  },
  {
    id: 'dynasty',
    label: 'Dynasty Builder',
    description: 'Win 3 or more championships.',
    check: c => c.seasons.filter(s => s.wonChampionship).length >= 3,
  },
  {
    id: 'perennial_contender',
    label: 'Perennial Contender',
    description: 'Make the playoffs 5 or more times.',
    check: c => c.seasons.filter(s => s.madePlayoffs).length >= 5,
  },
  {
    id: 'rebuild_artist',
    label: 'Rebuild Artist',
    description: 'Follow a losing season with a playoff appearance.',
    check: c => {
      for (let i = 1; i < c.seasons.length; i++) {
        const prev = c.seasons[i - 1]!;
        const curr = c.seasons[i]!;
        if (prev.wins <= prev.losses && curr.madePlayoffs) return true;
      }
      return false;
    },
  },
  {
    id: 'ironman',
    label: 'Ironman GM',
    description: 'Manage the same franchise for 10 or more seasons.',
    check: c => c.seasons.length >= 10,
  },
  {
    id: 'active_gm',
    label: 'Active GM',
    description: 'Complete your first season as GM.',
    check: c => c.seasons.length >= 1,
  },
  {
    id: 'deal_maker',
    label: 'Deal Maker',
    description: 'Complete 10 trades across your career.',
    check: c => c.seasons.reduce((sum, s) => sum + s.tradesMade, 0) >= 10,
  },
  {
    id: 'draft_expert',
    label: 'Draft Expert',
    description: 'Make 20 draft picks across your career.',
    check: c => c.seasons.reduce((sum, s) => sum + s.draftPicksMade, 0) >= 20,
  },
];

// ── Achievement check ─────────────────────────────────────────────────────────

/**
 * Evaluate all achievement definitions and unlock any newly earned ones.
 * Returns the updated league and news items for each new achievement.
 */
export function checkGmAchievements(league: League): { league: League; newsItems: NewsItem[] } {
  const career = league.gmCareer;
  if (!career) return { league, newsItems: [] };

  const existingIds = new Set(career.achievements.map(a => a.id));
  const newAchievements: GmAchievement[] = [];
  const newsItems: NewsItem[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (existingIds.has(def.id)) continue;
    if (!def.check(career)) continue;

    const ach: GmAchievement = {
      id:           def.id,
      label:        def.label,
      description:  def.description,
      unlockedYear: league.currentSeason.year,
    };
    newAchievements.push(ach);
    newsItems.push(newsForGmMilestone(def.label, def.description, league.currentSeason.year));
  }

  if (newAchievements.length === 0) return { league, newsItems: [] };

  const updatedCareer: GmCareer = {
    ...career,
    achievements: [...career.achievements, ...newAchievements],
    legacyScore:  computeGmLegacyScore({ ...career, achievements: [...career.achievements, ...newAchievements] }),
  };
  return { league: { ...league, gmCareer: updatedCareer }, newsItems };
}
