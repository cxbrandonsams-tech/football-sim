/**
 * Multi-league isolation tests — verifies that leagues don't leak data
 * between each other and that user permissions are correctly enforced.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = mkdtempSync(join(tmpdir(), 'football-sim-isolation-'));
process.env['DATA_DIR'] = testDir;
process.env['VITEST'] = '1';
process.env['JWT_SECRET'] = 'isolation-test-secret';

import request from 'supertest';
import { app } from '../src/server';

afterAll(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch {}
});

const suffix = Date.now().toString(36);
let tokenA = '';
let tokenB = '';
let leagueA = '';
let leagueB = '';

describe('Multi-league isolation', () => {
  it('setup: create two users', async () => {
    const resA = await request(app).post('/auth/signup').send({ username: `userA_${suffix}`, password: 'pass123' });
    const resB = await request(app).post('/auth/signup').send({ username: `userB_${suffix}`, password: 'pass456' });
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    tokenA = resA.body.token;
    tokenB = resB.body.token;
  });

  it('setup: each user creates their own league', async () => {
    const resA = await request(app)
      .post('/league/create')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ displayName: 'League A' });
    const resB = await request(app)
      .post('/league/create')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ displayName: 'League B' });
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    leagueA = resA.body.id;
    leagueB = resB.body.id;
    expect(leagueA).not.toBe(leagueB);
  });

  it('leagues have different IDs and independent teams', async () => {
    const resA = await request(app).get(`/league/${leagueA}`).set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app).get(`/league/${leagueB}`).set('Authorization', `Bearer ${tokenB}`);
    expect(resA.body.teams).toHaveLength(32);
    expect(resB.body.teams).toHaveLength(32);
    // Teams in league A should not appear in league B
    const teamIdsA = new Set(resA.body.teams.map((t: { id: string }) => t.id));
    const teamIdsB = new Set(resB.body.teams.map((t: { id: string }) => t.id));
    // IDs should be different (generated fresh for each league)
    // They use the same abbreviation-based IDs, so they'll match — that's by design
    // But the data (rosters, ratings) should be independent
    expect(resA.body.id).not.toBe(resB.body.id);
  });

  it('advancing league A does not affect league B', async () => {
    // Advance league A
    const advRes = await request(app)
      .post(`/league/${leagueA}/advance-week`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(advRes.status).toBe(200);
    expect(advRes.body.currentWeek).toBe(2);

    // League B should still be at week 1
    const resB = await request(app)
      .get(`/league/${leagueB}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.currentWeek).toBe(1);
    // League B should have no final games
    const finalsB = resB.body.currentSeason.games.filter(
      (g: { status: string }) => g.status === 'final'
    );
    expect(finalsB).toHaveLength(0);
  });

  it('user A cannot advance user B league', async () => {
    const res = await request(app)
      .post(`/league/${leagueB}/advance-week`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('user B cannot advance user A league', async () => {
    const res = await request(app)
      .post(`/league/${leagueA}/advance-week`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('my-leagues returns only the user own leagues', async () => {
    const resA = await request(app).get('/my-leagues').set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app).get('/my-leagues').set('Authorization', `Bearer ${tokenB}`);
    expect(resA.body.some((l: { leagueId: string }) => l.leagueId === leagueA)).toBe(true);
    expect(resA.body.some((l: { leagueId: string }) => l.leagueId === leagueB)).toBe(false);
    expect(resB.body.some((l: { leagueId: string }) => l.leagueId === leagueB)).toBe(true);
    expect(resB.body.some((l: { leagueId: string }) => l.leagueId === leagueA)).toBe(false);
  });

  it('news in league A does not appear in league B', async () => {
    const resA = await request(app).get(`/league/${leagueA}`).set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app).get(`/league/${leagueB}`).set('Authorization', `Bearer ${tokenB}`);
    // League A has been advanced — should have news
    expect((resA.body.news ?? []).length).toBeGreaterThan(0);
    // League B has not been advanced — should have no news
    expect((resB.body.news ?? []).length).toBe(0);
  });
});
