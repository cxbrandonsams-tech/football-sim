/**
 * Schedule generation tests — validates NFL-style 18-week schedule.
 */
import { describe, it, expect } from 'vitest';
import { createInitialLeague } from '../src/initialLeague';

describe('Schedule generation', () => {
  const league = createInitialLeague('test', 'Test', 2025);
  const games = league.currentSeason.games;

  it('generates exactly 272 games (17 per team × 32 / 2)', () => {
    expect(games).toHaveLength(272);
  });

  it('schedule spans 18 weeks', () => {
    const weeks = new Set(games.map(g => g.week));
    expect(weeks.size).toBe(18);
    expect(Math.min(...weeks)).toBe(1);
    expect(Math.max(...weeks)).toBe(18);
  });

  it('each team plays exactly 17 games', () => {
    for (const team of league.teams) {
      const teamGames = games.filter(
        g => g.homeTeam.id === team.id || g.awayTeam.id === team.id
      );
      expect(teamGames.length).toBe(17);
    }
  });

  it('no team plays more than one game per week', () => {
    for (const team of league.teams) {
      const weekCounts = new Map<number, number>();
      for (const g of games) {
        if (g.homeTeam.id === team.id || g.awayTeam.id === team.id) {
          weekCounts.set(g.week, (weekCounts.get(g.week) ?? 0) + 1);
        }
      }
      for (const [week, count] of weekCounts) {
        expect(count, `${team.name} week ${week}`).toBe(1);
      }
    }
  });

  it('each team has exactly one bye week', () => {
    for (const team of league.teams) {
      const playedWeeks = new Set<number>();
      for (const g of games) {
        if (g.homeTeam.id === team.id || g.awayTeam.id === team.id) {
          playedWeeks.add(g.week);
        }
      }
      const byeWeeks = 18 - playedWeeks.size;
      expect(byeWeeks, `${team.name} bye weeks`).toBe(1);
    }
  });

  it('bye weeks are in the valid NFL range (weeks 6-13)', () => {
    for (const team of league.teams) {
      const playedWeeks = new Set<number>();
      for (const g of games) {
        if (g.homeTeam.id === team.id || g.awayTeam.id === team.id) {
          playedWeeks.add(g.week);
        }
      }
      for (let w = 1; w <= 18; w++) {
        if (!playedWeeks.has(w)) {
          expect(w, `${team.name} bye in week ${w}`).toBeGreaterThanOrEqual(6);
          expect(w, `${team.name} bye in week ${w}`).toBeLessThanOrEqual(13);
        }
      }
    }
  });

  it('no team plays itself', () => {
    for (const g of games) {
      expect(g.homeTeam.id).not.toBe(g.awayTeam.id);
    }
  });

  it('home and away teams have valid abbreviations', () => {
    for (const g of games) {
      expect(g.homeTeam.abbreviation).toBeTruthy();
      expect(g.awayTeam.abbreviation).toBeTruthy();
      expect(g.homeTeam.abbreviation.length).toBeLessThanOrEqual(4);
      expect(g.awayTeam.abbreviation.length).toBeLessThanOrEqual(4);
    }
  });
});
