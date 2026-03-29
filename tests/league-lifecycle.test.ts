/**
 * League lifecycle tests — validates the core season flow from creation
 * through regular season simulation.
 */
import { describe, it, expect } from 'vitest';
import { createInitialLeague } from '../src/initialLeague';
import { simulateWeek } from '../src/engine/simulateWeek';
import type { League } from '../src/models/League';

function createTestLeague(): League {
  return createInitialLeague('test-league', 'Test League', 2025);
}

describe('League creation', () => {
  it('creates a league with 32 teams', () => {
    const league = createTestLeague();
    expect(league.teams).toHaveLength(32);
  });

  it('creates 272 scheduled games (17 per team)', () => {
    const league = createTestLeague();
    const games = league.currentSeason.games;
    expect(games).toHaveLength(272);
    expect(games.every(g => g.status === 'scheduled')).toBe(true);
  });

  it('starts in regular_season phase at week 1', () => {
    const league = createTestLeague();
    expect(league.phase).toBe('regular_season');
    expect(league.currentWeek).toBe(1);
  });

  it('has 8 divisions (4 per conference)', () => {
    const league = createTestLeague();
    expect(league.divisions).toHaveLength(8);
    const ic = league.divisions!.filter(d => d.conference === 'IC');
    const sc = league.divisions!.filter(d => d.conference === 'SC');
    expect(ic).toHaveLength(4);
    expect(sc).toHaveLength(4);
  });

  it('assigns 4 teams per division', () => {
    const league = createTestLeague();
    for (const div of league.divisions!) {
      expect(div.teamIds).toHaveLength(4);
    }
  });

  it('gives each team a roster of 50-56 players', () => {
    const league = createTestLeague();
    for (const team of league.teams) {
      expect(team.roster.length).toBeGreaterThanOrEqual(50);
      expect(team.roster.length).toBeLessThanOrEqual(56);
    }
  });

  it('gives each team coaching staff', () => {
    const league = createTestLeague();
    for (const team of league.teams) {
      expect(team.coaches.hc).toBeDefined();
      expect(team.coaches.hc.overall).toBeGreaterThan(0);
    }
  });

  it('each team has exactly 17 games (1 bye in 18 weeks)', () => {
    const league = createTestLeague();
    const games = league.currentSeason.games;
    for (const team of league.teams) {
      const teamGames = games.filter(
        g => g.homeTeam.id === team.id || g.awayTeam.id === team.id
      );
      expect(teamGames).toHaveLength(17);
    }
  });
});

describe('Week simulation', () => {
  it('simulates one week and advances to week 2', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    expect(after.currentWeek).toBe(2);
  });

  it('produces games with valid scores', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    const finals = after.currentSeason.games.filter(g => g.status === 'final');
    expect(finals.length).toBeGreaterThan(0);
    for (const g of finals) {
      expect(g.homeScore).toBeGreaterThanOrEqual(0);
      expect(g.awayScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('generates play-by-play events for each game', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    const finals = after.currentSeason.games.filter(g => g.status === 'final');
    for (const g of finals) {
      expect(g.events.length).toBeGreaterThan(0);
    }
  });

  it('generates news items after a week', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    expect((after.news ?? []).length).toBeGreaterThan(0);
  });

  it('does not modify scheduled games for future weeks', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    const futureGames = after.currentSeason.games.filter(g => g.week > 1);
    for (const g of futureGames) {
      expect(g.status).toBe('scheduled');
    }
  });

  it('simulates correct number of games per week (accounts for byes)', () => {
    const league = createTestLeague();
    const after = simulateWeek(league);
    const week1Games = after.currentSeason.games.filter(g => g.week === 1);
    const finals = week1Games.filter(g => g.status === 'final');
    // All week 1 games should be final
    expect(finals.length).toBe(week1Games.length);
    // Should be 14-16 games (some teams on bye)
    expect(finals.length).toBeGreaterThanOrEqual(14);
    expect(finals.length).toBeLessThanOrEqual(16);
  });
});
