import express = require('express');
import { type Request, type Response, type NextFunction } from 'express';
import { type League, type TradeProposal, type LeagueNotification, type Activity, type PlayoffMatchup, type PlayoffBracket, type SeasonRecord } from './models/League';
import { simulateWeek } from './engine/simulateWeek';
import { simulateGame } from './engine/simulateGame';
import { createGame } from './models/Game';
import { saveLeague, loadLeague } from './engine/persistence';
import { createInitialLeague } from './initialLeague';
import crypto = require('crypto');

// ── In-memory state ───────────────────────────────────────────────────────────

const leagues: Record<string, League> = {};
const passwords: Record<string, string> = {}; // leagueId → password (never sent to client)

// ── Helpers ───────────────────────────────────────────────────────────────────

function addActivity(league: League, message: string): League {
  const entry: Activity = { id: crypto.randomUUID(), message, createdAt: Date.now() };
  return { ...league, activities: [...league.activities, entry] };
}

function addNotification(league: League, teamId: string, message: string): League {
  const notif: LeagueNotification = {
    id: crypto.randomUUID(),
    teamId,
    message,
    createdAt: Date.now(),
    read: false,
  };
  return { ...league, notifications: [...league.notifications, notif] };
}

function getPlayoffSeeds(league: League): { teamId: string; teamName: string }[] {
  const wins = new Map<string, number>();
  const pd   = new Map<string, number>();
  for (const t of league.teams) { wins.set(t.id, 0); pd.set(t.id, 0); }
  for (const g of league.currentSeason.games) {
    if (g.status !== 'final') continue;
    if (g.homeScore > g.awayScore)      wins.set(g.homeTeam.id, (wins.get(g.homeTeam.id) ?? 0) + 1);
    else if (g.awayScore > g.homeScore) wins.set(g.awayTeam.id, (wins.get(g.awayTeam.id) ?? 0) + 1);
    pd.set(g.homeTeam.id, (pd.get(g.homeTeam.id) ?? 0) + g.homeScore - g.awayScore);
    pd.set(g.awayTeam.id, (pd.get(g.awayTeam.id) ?? 0) + g.awayScore - g.homeScore);
  }
  return [...league.teams]
    .sort((a, b) => {
      const wDiff = (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0);
      return wDiff !== 0 ? wDiff : (pd.get(b.id) ?? 0) - (pd.get(a.id) ?? 0);
    })
    .slice(0, 4)
    .map(t => ({ teamId: t.id, teamName: t.name }));
}

function generatePlayoffBracket(year: number, seeds: { teamId: string }[]): PlayoffBracket {
  return {
    year,
    currentRound: 'semifinal',
    matchups: [
      { id: `semi-1-${year}`, round: 'semifinal', topSeedId: seeds[0]!.teamId, bottomSeedId: seeds[3]!.teamId },
      { id: `semi-2-${year}`, round: 'semifinal', topSeedId: seeds[1]!.teamId, bottomSeedId: seeds[2]!.teamId },
    ],
  };
}

function doAdvance(league: League): League {
  if (league.phase === 'offseason') throw new Error('Season is complete.');

  if (league.phase === 'postseason') {
    const bracket = league.playoff!;
    if (bracket.currentRound === 'complete') throw new Error('Postseason is complete.');
    const teamMap = new Map(league.teams.map(t => [t.id, t]));

    const simMatchups: PlayoffMatchup[] = bracket.matchups.map(m => {
      if (m.round !== bracket.currentRound || m.winnerId) return m;
      const home = teamMap.get(m.topSeedId)!;
      const away = teamMap.get(m.bottomSeedId)!;
      const game = simulateGame(createGame(`playoff-${m.id}`, 0, home, away));
      const winnerId = game.homeScore >= game.awayScore ? m.topSeedId : m.bottomSeedId;
      return { ...m, game, winnerId };
    });

    if (bracket.currentRound === 'semifinal') {
      const semis = simMatchups.filter(m => m.round === 'semifinal');
      const champMatchup: PlayoffMatchup = {
        id: `champ-${bracket.year}`,
        round: 'championship',
        topSeedId: semis[0]!.winnerId!,
        bottomSeedId: semis[1]!.winnerId!,
      };
      let updated: League = { ...league, playoff: { ...bracket, currentRound: 'championship', matchups: [...simMatchups, champMatchup] } };
      for (const m of semis) {
        updated = addActivity(updated, `${teamMap.get(m.winnerId!)?.name} advances to the championship`);
      }
      return updated;
    }

    // Championship
    const champ = simMatchups.find(m => m.round === 'championship')!;
    const champion = teamMap.get(champ.winnerId!)!;
    const record: SeasonRecord = { year: bracket.year, championId: champion.id, championName: champion.name };
    let updated: League = {
      ...league,
      phase: 'offseason',
      playoff: { ...bracket, currentRound: 'complete', matchups: simMatchups, championId: champion.id, championName: champion.name },
      seasonHistory: [...league.seasonHistory, record],
    };
    return addActivity(updated, `${champion.name} are the ${bracket.year} League Champions!`);
  }

  // Regular season
  const totalWeeks = Math.max(...league.currentSeason.games.map(g => g.week));
  if (league.currentWeek > totalWeeks) {
    const seeds = getPlayoffSeeds(league);
    const bracket = generatePlayoffBracket(league.currentSeason.year, seeds);
    let updated: League = { ...league, phase: 'postseason', playoff: bracket };
    return addActivity(updated, `Playoffs begin! Top 4: ${seeds.map(s => s.teamName).join(', ')}`);
  }

  const afterWeek = simulateWeek(league);
  return addActivity(afterWeek, `Week ${league.currentWeek} results are in`);
}

function getLeague(req: Request, res: Response): League | null {
  const id = req.params['id'] as string;
  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return null;
  }
  return league;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  const s = String(e);
  return s.startsWith('Error: ') ? s.slice(7) : s;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET / — basic landing response so Render doesn't show "Cannot GET /"
app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Football Sim backend is running.' });
});

// GET /health — deployment sanity check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /leagues — list public leagues (summary only, no rosters/events).
app.get('/leagues', (_req: Request, res: Response) => {
  const summaries = Object.values(leagues)
    .filter(l => l.visibility === 'public')
    .map(l => ({
      id:          l.id,
      displayName: l.displayName,
      currentWeek: l.currentWeek,
      year:        l.currentSeason.year,
    }));
  res.json(summaries);
});

// POST /league/create — create a new league.
app.post('/league/create', (req: Request, res: Response) => {
  const { displayName, visibility, password, advanceSchedule } = req.body as {
    displayName?: string;
    visibility?: 'public' | 'private';
    password?: string;
    advanceSchedule?: string;
  };

  if (visibility === 'private' && !password) {
    res.status(400).json({ error: 'Private leagues require a password.' });
    return;
  }

  const id = crypto.randomUUID();
  leagues[id] = createInitialLeague(id, {
    displayName: displayName?.trim() || 'My League',
    visibility: visibility ?? 'public',
    ...(advanceSchedule && { advanceSchedule }),
  });

  if (visibility === 'private' && password) {
    passwords[id] = password;
  }

  res.json({ id });
});

// POST /league/join — join by id + optional password.
app.post('/league/join', (req: Request, res: Response) => {
  const { id, password } = req.body as { id?: string; password?: string };

  if (!id) {
    res.status(400).json({ error: 'League id is required.' });
    return;
  }

  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  if (league.visibility === 'private') {
    if (!password || password !== passwords[id]) {
      res.status(403).json({ error: 'Incorrect password.' });
      return;
    }
  }

  res.json(league);
});

// GET /league/:id — return league state.
app.get('/league/:id', (req: Request, res: Response) => {
  const league = getLeague(req, res);
  if (!league) return;
  res.json(league);
});

// POST /league/:id/claim-team — assign a GM to an unclaimed team.
app.post('/league/:id/claim-team', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const { teamId, gmId } = req.body as { teamId?: string; gmId?: string };

  if (!teamId || !gmId) {
    res.status(400).json({ error: 'teamId and gmId are required.' });
    return;
  }

  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const team = league.teams.find(t => t.id === teamId);
  if (!team) {
    res.status(404).json({ error: `Team '${teamId}' not found.` });
    return;
  }

  if (team.ownerId && team.ownerId !== gmId) {
    res.status(409).json({ error: 'Team is already claimed.' });
    return;
  }

  leagues[id] = {
    ...league,
    teams: league.teams.map(t => t.id === teamId ? { ...t, ownerId: gmId } : t),
  };

  res.json(leagues[id]);
});

// POST /league/:id/propose-trade — create a pending trade proposal.
app.post('/league/:id/propose-trade', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const { fromTeamId, toTeamId, playerId, gmId } = req.body as {
    fromTeamId?: string; toTeamId?: string; playerId?: string; gmId?: string;
  };

  if (!fromTeamId || !toTeamId || !playerId || !gmId) {
    res.status(400).json({ error: 'fromTeamId, toTeamId, playerId, and gmId are required.' });
    return;
  }

  if (fromTeamId === toTeamId) {
    res.status(400).json({ error: 'Cannot trade to the same team.' });
    return;
  }

  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const fromTeam = league.teams.find(t => t.id === fromTeamId);
  if (!fromTeam) {
    res.status(404).json({ error: `Team '${fromTeamId}' not found.` });
    return;
  }

  if (fromTeam.ownerId !== gmId) {
    res.status(403).json({ error: 'You do not own this team.' });
    return;
  }

  if (!fromTeam.roster.some(p => p.id === playerId)) {
    res.status(404).json({ error: `Player '${playerId}' not on this team.` });
    return;
  }

  if (!league.teams.some(t => t.id === toTeamId)) {
    res.status(404).json({ error: `Team '${toTeamId}' not found.` });
    return;
  }

  const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    fromTeamId,
    toTeamId,
    playerId,
    status: 'pending',
  };

  const playerName = fromTeam.roster.find(p => p.id === playerId)?.name ?? playerId;
  let updated: League = { ...league, tradeProposals: [...league.tradeProposals, proposal] };
  updated = addNotification(updated, toTeamId, `Trade offer from ${fromTeam.name}: ${playerName}`);
  leagues[id] = updated;
  res.json(leagues[id]);
});

// POST /league/:id/respond-trade — accept or reject a pending proposal.
app.post('/league/:id/respond-trade', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const { proposalId, gmId, accept } = req.body as {
    proposalId?: string; gmId?: string; accept?: boolean;
  };

  if (!proposalId || !gmId || accept === undefined) {
    res.status(400).json({ error: 'proposalId, gmId, and accept are required.' });
    return;
  }

  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const proposal = league.tradeProposals.find(p => p.id === proposalId);
  if (!proposal) {
    res.status(404).json({ error: `Proposal '${proposalId}' not found.` });
    return;
  }

  if (proposal.status !== 'pending') {
    res.status(400).json({ error: 'Proposal is no longer pending.' });
    return;
  }

  const toTeam = league.teams.find(t => t.id === proposal.toTeamId);
  if (!toTeam || toTeam.ownerId !== gmId) {
    res.status(403).json({ error: 'You do not own the receiving team.' });
    return;
  }

  const updateProposals = (status: 'accepted' | 'rejected') =>
    league.tradeProposals.map(p => p.id === proposalId ? { ...p, status } : p);

  if (!accept) {
    const rejectedPlayerName = league.teams.find(t => t.id === proposal.fromTeamId)?.roster.find(p => p.id === proposal.playerId)?.name ?? proposal.playerId;
    let rejected: League = { ...league, tradeProposals: updateProposals('rejected') };
    rejected = addActivity(rejected, `${toTeam.name} rejected a trade offer from ${league.teams.find(t => t.id === proposal.fromTeamId)?.name ?? proposal.fromTeamId} (${rejectedPlayerName})`);
    rejected = addNotification(rejected, proposal.fromTeamId, `${toTeam.name} rejected your trade offer for ${rejectedPlayerName}`);
    leagues[id] = rejected;
    res.json(leagues[id]);
    return;
  }

  const fromTeam = league.teams.find(t => t.id === proposal.fromTeamId);
  const player = fromTeam?.roster.find(p => p.id === proposal.playerId);
  if (!player) {
    res.status(400).json({ error: 'Player no longer available.' });
    return;
  }

  let accepted: League = {
    ...league,
    teams: league.teams.map(t => {
      if (t.id === proposal.fromTeamId) return { ...t, roster: t.roster.filter(p => p.id !== proposal.playerId) };
      if (t.id === proposal.toTeamId)   return { ...t, roster: [...t.roster, player] };
      return t;
    }),
    tradeProposals: updateProposals('accepted'),
  };
  accepted = addActivity(accepted, `${league.teams.find(t => t.id === proposal.fromTeamId)?.name ?? proposal.fromTeamId} traded ${player.name} to ${toTeam.name}`);
  accepted = addNotification(accepted, proposal.fromTeamId, `${toTeam.name} accepted your trade offer for ${player.name}`);
  leagues[id] = accepted;
  res.json(leagues[id]);
});

// POST /league/:id/mark-notifications-read — mark all notifications as read for this GM's team.
app.post('/league/:id/mark-notifications-read', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const { gmId } = req.body as { gmId?: string };

  if (!gmId) {
    res.status(400).json({ error: 'gmId is required.' });
    return;
  }

  const league = leagues[id];
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const myTeam = league.teams.find(t => t.ownerId === gmId);
  if (!myTeam) {
    res.status(403).json({ error: 'No team owned by this GM.' });
    return;
  }

  leagues[id] = {
    ...league,
    notifications: league.notifications.map(n =>
      n.teamId === myTeam.id ? { ...n, read: true } : n
    ),
  };
  res.json(leagues[id]);
});

// POST /league/:id/advance-week — advance the league (regular season week, playoff round, or playoffs start).
app.post('/league/:id/advance-week', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const league = getLeague(req, res);
  if (!league) return;
  try {
    leagues[id] = doAdvance(league);
    res.json(leagues[id]);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

// POST /league/:id/save — persist to disk.
app.post('/league/:id/save', (req: Request, res: Response) => {
  const league = getLeague(req, res);
  if (!league) return;
  try {
    saveLeague(league);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

// POST /league/:id/load — reload from disk.
app.post('/league/:id/load', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const league = getLeague(req, res);
  if (!league) return;
  const saved = loadLeague();
  if (!saved) {
    res.status(404).json({ error: 'No save file found.' });
    return;
  }
  leagues[id] = saved;
  res.json(leagues[id]);
});

// ── Scheduler ─────────────────────────────────────────────────────────────────

const SCHEDULE_INTERVALS: Record<string, number> = {
  fast:   30_000,       // 30 seconds
  normal: 2 * 60_000,   // 2 minutes
};

function runScheduler(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, league] of Object.entries(leagues)) {
      const interval = SCHEDULE_INTERVALS[league.advanceSchedule ?? ''];
      if (!interval) continue;
      if (now - (league.lastAdvanceTime ?? 0) < interval) continue;
      if (league.phase === 'offseason') continue;

      // During regular season, only advance if there are scheduled games this week
      if (league.phase === 'regular_season') {
        const totalWeeks = Math.max(...league.currentSeason.games.map(g => g.week));
        if (league.currentWeek <= totalWeeks) {
          const scheduledGames = league.currentSeason.games.filter(
            g => g.week === league.currentWeek && g.status === 'scheduled'
          );
          if (scheduledGames.length === 0) continue;
        }
      }

      try {
        leagues[id] = { ...doAdvance(league), lastAdvanceTime: now };
        console.log(`[scheduler] League ${id} advanced (phase: ${leagues[id].phase}, week: ${leagues[id].currentWeek})`);
      } catch { continue; }
    }
  }, 10_000);
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env['PORT'] ?? 3000;
app.listen(PORT, () => {
  console.log(`Gridiron server running on http://localhost:${PORT}`);
  runScheduler();
});
