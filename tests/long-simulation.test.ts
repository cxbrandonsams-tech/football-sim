/**
 * Long simulation validation — runs multiple full seasons to verify
 * no crashes, invalid states, or data corruption over time.
 *
 * This test takes longer than unit tests (~10-30 seconds).
 */
import { describe, it, expect } from 'vitest';
import { createInitialLeague } from '../src/initialLeague';
import { simulateWeek } from '../src/engine/simulateWeek';
import { seedPlayoffBracket, advancePlayoffRound } from '../src/engine/postseason';
import type { League } from '../src/models/League';

function createTestLeague(): League {
  return createInitialLeague('long-sim', 'Long Sim Test', 2025);
}

describe('Full season simulation (18 weeks + postseason)', () => {
  it('simulates a complete regular season without crashing', () => {
    let league = createTestLeague();

    // Simulate all 18 weeks
    for (let w = 1; w <= 18; w++) {
      league = simulateWeek(league);
      // After simulating week w, currentWeek advances to w+1.
      // After week 18, currentWeek=19 is the internal trigger for postseason — not a real "week 19".
      expect(league.currentWeek).toBe(w + 1);

      // All week-w games should be final
      const weekGames = league.currentSeason.games.filter(g => g.week === w);
      for (const g of weekGames) {
        expect(g.status).toBe('final');
        expect(g.homeScore).toBeGreaterThanOrEqual(0);
        expect(g.awayScore).toBeGreaterThanOrEqual(0);
      }
    }

    // After 18 weeks, all 272 games should be final
    const allFinal = league.currentSeason.games.filter(g => g.status === 'final');
    expect(allFinal).toHaveLength(272);
  }, 30000);

  it('postseason completes without crashing', () => {
    let league = createTestLeague();

    // Quick-sim regular season
    for (let w = 1; w <= 18; w++) {
      league = simulateWeek(league);
    }

    // Start postseason
    const bracket = seedPlayoffBracket(league);
    league = { ...league, phase: 'postseason' as const, playoff: bracket };
    expect(league.playoff).toBeDefined();
    expect(league.playoff!.matchups.length).toBeGreaterThan(0);

    // Advance through all playoff rounds
    const teamMap = new Map(league.teams.map(t => [t.id, t]));
    let rounds = 0;
    while (league.playoff && league.playoff.currentRound !== 'complete') {
      const nextBracket = advancePlayoffRound(league.playoff, teamMap);
      league = { ...league, playoff: nextBracket };
      rounds++;
      if (rounds > 10) throw new Error('Infinite loop in postseason');
    }

    // Should have a champion
    expect(league.playoff!.championId).toBeTruthy();
    expect(league.playoff!.championName).toBeTruthy();
    expect(rounds).toBeGreaterThanOrEqual(3); // At least WC, Div, Conf, Championship
  }, 30000);
});

describe('Stat sanity checks over a full season', () => {
  let league: League;

  it('setup: simulate full season', () => {
    league = createTestLeague();
    for (let w = 1; w <= 18; w++) {
      league = simulateWeek(league);
    }
  }, 30000);

  it('total points scored is reasonable (NFL averages ~44 PPG)', () => {
    const games = league.currentSeason.games.filter(g => g.status === 'final');
    const totalPoints = games.reduce((s, g) => s + g.homeScore + g.awayScore, 0);
    const ppg = totalPoints / games.length;
    // Should be roughly 30-70 combined PPG (wide range to avoid false alarms)
    expect(ppg).toBeGreaterThan(25);
    expect(ppg).toBeLessThan(75);
  });

  it('no team has an impossible record', () => {
    for (const team of league.teams) {
      const teamGames = league.currentSeason.games.filter(
        g => g.status === 'final' && (g.homeTeam.id === team.id || g.awayTeam.id === team.id)
      );
      let w = 0, l = 0;
      for (const g of teamGames) {
        const isHome = g.homeTeam.id === team.id;
        const my = isHome ? g.homeScore : g.awayScore;
        const opp = isHome ? g.awayScore : g.homeScore;
        if (my > opp) w++;
        else if (my < opp) l++;
      }
      expect(w + l).toBeLessThanOrEqual(17);
      // No team should go 0-17 or 17-0 consistently (extremely unlikely)
      // This is a sanity check, not a tuning assertion
    }
  });

  it('all teams still have valid rosters after season', () => {
    for (const team of league.teams) {
      expect(team.roster.length).toBeGreaterThan(0);
      expect(team.coaches.hc).toBeDefined();
      expect(team.coaches.hc.overall).toBeGreaterThan(0);
    }
  });

  it('news was generated throughout the season', () => {
    const news = league.news ?? [];
    expect(news.length).toBeGreaterThan(100); // Should have many game results + events
  });
});
