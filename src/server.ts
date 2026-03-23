import express from 'express';
import { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { type League, type TradeAsset, type TradeProposal, type LeagueNotification, type Activity, type SeasonRecord } from './models/League';
import { simulateWeek }          from './engine/simulateWeek';
import { createInitialLeague }    from './initialLeague';
import { seedPlayoffBracket, advancePlayoffRound, getPlayoffActivityMessages } from './engine/postseason';
import { rollupSeasonHistory, startNextSeason, runOffseasonProgression } from './engine/seasonEngine';
import { extendPlayer }   from './engine/contracts';
import { signPlayer, releasePlayer } from './engine/rosterManagement';
import { startDraft, makeDraftPick, simRemainingDraft } from './engine/draft';
import { createTradeProposal, applyTrade, shouldAIAcceptTrade, runAITrades, describeAssets } from './engine/trades';
import { newsForGame, newsForTrade, newsForSigning, addNewsItems } from './engine/news';
import { getUserTeam } from './models/League';
import { type DepthChart } from './models/DepthChart';
import { type GameplanSettings, DEFAULT_GAMEPLAN, derivePlaycalling } from './models/Team';
import * as crypto from 'crypto';
import {
  getLeague as dbGetLeague,
  saveLeague as dbSaveLeague,
  createLeagueRow,
  listPublicLeagues,
  getLeaguePasswordHash,
  getScheduledLeagueIds,
  createUser,
  getUserByUsername,
  getMembership,
  addMembership,
  getUserLeagues,
  listLeagueMembers,
  removeMembership,
  updateLeaguePasswordHash,
} from './db';
import { signToken, requireAuth, type AuthRequest } from './auth';

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

function doAdvance(league: League): League {
  // ── Offseason → start draft ────────────────────────────────────────────────
  if (league.phase === 'offseason') {
    const withAITrades = runAITrades(league);
    const withDraft    = startDraft(withAITrades);
    return addActivity(withDraft, `Draft underway — ${withDraft.draft!.players.length} prospects available`);
  }

  // ── Draft complete → start next season ────────────────────────────────────
  if (league.phase === 'draft') {
    if (!league.draft?.complete) throw new Error('Draft is not yet complete.');
    const next = startNextSeason(league);
    return addActivity(next, `Season ${next.currentSeason.year} begins!`);
  }

  // ── Postseason → advance one round ────────────────────────────────────────
  if (league.phase === 'postseason') {
    const bracket = league.playoff!;
    if (bracket.currentRound === 'complete') {
      throw new Error('Postseason is complete. Advance again to start the next season.');
    }

    const teamMap     = new Map(league.teams.map(t => [t.id, t]));
    const prevRound   = bracket.currentRound;
    const nextBracket = advancePlayoffRound(bracket, teamMap);
    const messages    = getPlayoffActivityMessages(prevRound, nextBracket, teamMap);

    let updated: League = { ...league, playoff: nextBracket };
    for (const msg of messages) updated = addActivity(updated, msg);

    // Generate playoff news for each completed matchup in this round
    const year = nextBracket.year;
    const playoffNewsItems = nextBracket.matchups
      .filter(m => m.winnerId && m.game && m.round === prevRound)
      .map(m => newsForGame(m.game!, year, true, m.round));
    updated = addNewsItems(updated, playoffNewsItems);

    // Championship just finished — archive history, run progression, move to offseason.
    if (nextBracket.currentRound === 'complete') {
      updated = rollupSeasonHistory(updated);
      const record: SeasonRecord = {
        year:         nextBracket.year,
        championId:   nextBracket.championId!,
        championName: nextBracket.championName!,
      };
      updated = {
        ...updated,
        phase:         'offseason',
        seasonHistory: [...updated.seasonHistory, record],
      };
      // Age players, decrement contracts, surface demands — user can now manage
      // their roster before the next-season advance.
      updated = runOffseasonProgression(updated);
    }

    return updated;
  }

  // ── Regular season ─────────────────────────────────────────────────────────
  const totalWeeks = Math.max(...league.currentSeason.games.map(g => g.week));
  if (league.currentWeek > totalWeeks) {
    // Regular season complete — seed the playoff bracket.
    const bracket = seedPlayoffBracket(league);
    const byeTeams = bracket.seeds
      .filter(s => s.seed === 1)
      .map(s => `${s.teamName} (${s.conference})`);
    const updated: League = { ...league, phase: 'postseason', playoff: bracket };
    return addActivity(updated, `Playoffs begin! First-round byes: ${byeTeams.join(', ')}`);
  }

  const afterWeek = simulateWeek(league);
  return addActivity(afterWeek, `Week ${league.currentWeek} results are in`);
}

function getLeagueOrFail(req: Request, res: Response): League | null {
  const id = req.params['id'] as string;
  const league = dbGetLeague(id);
  if (!league) { res.status(404).json({ error: `League '${id}' not found.` }); return null; }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Auth endpoints ────────────────────────────────────────────────────────────

// POST /auth/signup
app.post('/auth/signup', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required.' });
    return;
  }
  const trimmed = username.trim();
  if (trimmed.length < 2) {
    res.status(400).json({ error: 'Username must be at least 2 characters.' });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters.' });
    return;
  }
  const existing = getUserByUsername(trimmed);
  if (existing) {
    res.status(409).json({ error: 'Username already taken.' });
    return;
  }
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  createUser(userId, trimmed, passwordHash);
  const token = signToken({ userId, username: trimmed });
  res.json({ token, userId, username: trimmed });
});

// POST /auth/login
app.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required.' });
    return;
  }
  const user = getUserByUsername(username.trim());
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, userId: user.id, username: user.username });
});

// GET /my-leagues — (auth required)
app.get('/my-leagues', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const leagues = getUserLeagues(userId);
  res.json(leagues);
});

// ── League endpoints ──────────────────────────────────────────────────────────

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
  const summaries = listPublicLeagues();
  res.json(summaries);
});

// POST /league/create — create a new league. requireAuth.
app.post('/league/create', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { displayName, visibility, password, advanceSchedule } = req.body as {
    displayName?: string;
    visibility?: 'public' | 'private';
    password?: string;
    advanceSchedule?: string;
  };

  const id = crypto.randomUUID();

  // For private leagues: auto-generate an invite code (ignores any supplied password)
  let inviteCode: string | undefined;
  let passwordHash: string | null = null;
  if (visibility === 'private') {
    inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    passwordHash = await bcrypt.hash(inviteCode, 10);
  }

  const league = createInitialLeague(id, {
    displayName: displayName?.trim() || 'My League',
    visibility:  visibility ?? 'public',
    commissionerId: userId,
    ...(inviteCode    && { inviteCode }),
    ...(advanceSchedule && { advanceSchedule }),
  });

  createLeagueRow(league, passwordHash);
  addMembership(id, userId, '', '');

  res.json({ id });
});

// POST /league/join — join by id + optional password.
app.post('/league/join', (req: Request, res: Response) => {
  const authUser = (req as AuthRequest).user;
  const { id, password } = req.body as { id?: string; password?: string };

  if (!id) {
    res.status(400).json({ error: 'League id is required.' });
    return;
  }

  const league = dbGetLeague(id);
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  if (league.visibility === 'private') {
    const storedHash = getLeaguePasswordHash(id);
    if (!password || !storedHash) {
      res.status(403).json({ error: 'Incorrect password.' });
      return;
    }
    const match = bcrypt.compareSync(password, storedHash);
    if (!match) {
      res.status(403).json({ error: 'Incorrect password.' });
      return;
    }
  }

  // If authenticated, record membership (if not already present)
  if (authUser) {
    const existing = getMembership(id, authUser.userId);
    if (!existing) {
      addMembership(id, authUser.userId, '', '');
    }
  }

  res.json(league);
});

// GET /league/:id — return league state.
app.get('/league/:id', (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  res.json(league);
});

// POST /league/:id/claim-team — assign a GM to an unclaimed team. requireAuth.
app.post('/league/:id/claim-team', requireAuth, (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const userId = (req as AuthRequest).user!.userId;
  const { teamId } = req.body as { teamId?: string };

  if (!teamId) {
    res.status(400).json({ error: 'teamId is required.' });
    return;
  }

  const league = dbGetLeague(id);
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const team = league.teams.find(t => t.id === teamId);
  if (!team) {
    res.status(404).json({ error: `Team '${teamId}' not found.` });
    return;
  }

  if (team.ownerId && team.ownerId !== userId) {
    res.status(409).json({ error: 'Team is already claimed.' });
    return;
  }

  const updated: League = {
    ...league,
    teams: league.teams.map(t => t.id === teamId ? { ...t, ownerId: userId } : t),
  };

  dbSaveLeague(updated);
  addMembership(id, userId, teamId, team.name);

  res.json(updated);
});

// POST /league/:id/propose-trade — user proposes a multi-asset trade; AI responds immediately.
app.post('/league/:id/propose-trade', requireAuth, (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const userId = (req as AuthRequest).user!.userId;
  const { fromTeamId, toTeamId, fromAssets, toAssets } = req.body as {
    fromTeamId?: string; toTeamId?: string;
    fromAssets?: TradeAsset[]; toAssets?: TradeAsset[];
  };

  if (!fromTeamId || !toTeamId || !Array.isArray(fromAssets) || !Array.isArray(toAssets)) {
    res.status(400).json({ error: 'fromTeamId, toTeamId, fromAssets, and toAssets are required.' });
    return;
  }

  const league = dbGetLeague(id);
  if (!league) { res.status(404).json({ error: `League '${id}' not found.` }); return; }

  const fromTeam = league.teams.find(t => t.id === fromTeamId);
  if (!fromTeam || fromTeam.ownerId !== userId) {
    res.status(403).json({ error: 'You do not own this team.' }); return;
  }

  const { league: withProposal, proposal, error } =
    createTradeProposal(league, fromTeamId, toTeamId, fromAssets, toAssets);
  if (error || !proposal) { res.status(400).json({ error: error ?? 'Unknown error.' }); return; }

  const toTeam   = league.teams.find(t => t.id === toTeamId)!;
  const fromDesc = describeAssets(fromAssets);
  const toDesc   = describeAssets(toAssets);

  // AI teams respond immediately
  if (!toTeam.ownerId) {
    const accepted = shouldAIAcceptTrade(proposal, withProposal);
    const status   = accepted ? 'accepted' : 'rejected';
    const withStatus: League = {
      ...withProposal,
      tradeProposals: withProposal.tradeProposals.map(p =>
        p.id === proposal.id ? { ...p, status } : p
      ),
    };

    let final: League = accepted ? applyTrade(withStatus, proposal) : withStatus;
    final = addActivity(final, accepted
      ? `${toTeam.name} accepted your trade: you send ${fromDesc}, receive ${toDesc}`
      : `${toTeam.name} rejected your trade offer`
    );
    if (accepted) {
      final = addNewsItems(final, [newsForTrade(
        fromTeam.name, fromTeam.id, toTeam.name, toTeam.id,
        fromDesc, toDesc,
        league.currentSeason.year, league.currentWeek,
      )]);
    }
    dbSaveLeague(final);
    res.json(final);
    return;
  }

  // Human-owned receiving team — leave pending and notify
  const updated = addNotification(
    withProposal, toTeamId,
    `Trade offer from ${fromTeam.name}: send ${toDesc}, receive ${fromDesc}`
  );
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/respond-trade — human GM accepts or rejects an incoming proposal.
app.post('/league/:id/respond-trade', requireAuth, (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const userId = (req as AuthRequest).user!.userId;
  const { proposalId, accept } = req.body as {
    proposalId?: string; accept?: boolean;
  };

  if (!proposalId || accept === undefined) {
    res.status(400).json({ error: 'proposalId and accept are required.' });
    return;
  }

  const league = dbGetLeague(id);
  if (!league) { res.status(404).json({ error: `League '${id}' not found.` }); return; }

  const proposal = league.tradeProposals.find(p => p.id === proposalId);
  if (!proposal) { res.status(404).json({ error: `Proposal '${proposalId}' not found.` }); return; }
  if (proposal.status !== 'pending') { res.status(400).json({ error: 'Proposal is no longer pending.' }); return; }

  const toTeam = league.teams.find(t => t.id === proposal.toTeamId);
  if (!toTeam || toTeam.ownerId !== userId) {
    res.status(403).json({ error: 'You do not own the receiving team.' }); return;
  }

  const fromTeam   = league.teams.find(t => t.id === proposal.fromTeamId)!;
  const fromDesc   = describeAssets(proposal.fromAssets);
  const toDesc     = describeAssets(proposal.toAssets);
  const newStatus  = accept ? 'accepted' : 'rejected';
  const withStatus: League = {
    ...league,
    tradeProposals: league.tradeProposals.map(p =>
      p.id === proposalId ? { ...p, status: newStatus } : p
    ),
  };

  let final: League = accept ? applyTrade(withStatus, proposal) : withStatus;
  final = addActivity(final, accept
    ? `${toTeam.name} accepted trade with ${fromTeam.name}: ${fromDesc} for ${toDesc}`
    : `${toTeam.name} rejected trade offer from ${fromTeam.name}`
  );
  if (accept) {
    final = addNewsItems(final, [newsForTrade(
      fromTeam.name, fromTeam.id, toTeam.name, toTeam.id,
      fromDesc, toDesc,
      league.currentSeason.year, league.currentWeek,
    )]);
  }
  final = addNotification(final, proposal.fromTeamId, accept
    ? `${toTeam.name} accepted your trade offer`
    : `${toTeam.name} rejected your trade offer`
  );
  dbSaveLeague(final);
  res.json(final);
});

// POST /league/:id/mark-notifications-read — mark all notifications as read for this GM's team.
app.post('/league/:id/mark-notifications-read', requireAuth, (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const userId = (req as AuthRequest).user!.userId;

  const league = dbGetLeague(id);
  if (!league) {
    res.status(404).json({ error: `League '${id}' not found.` });
    return;
  }

  const myTeam = league.teams.find(t => t.ownerId === userId);
  if (!myTeam) {
    res.status(403).json({ error: 'No team owned by this user.' });
    return;
  }

  const updated: League = {
    ...league,
    notifications: league.notifications.map(n =>
      n.teamId === myTeam.id ? { ...n, read: true } : n
    ),
  };
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/advance-week — advance the league (commissioner only).
app.post('/league/:id/advance-week', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  if (league.commissionerId && league.commissionerId !== userId) {
    res.status(403).json({ error: 'Only the commissioner can advance the league.' });
    return;
  }
  try {
    const updated = doAdvance(league);
    dbSaveLeague(updated);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

// POST /league/:id/extend-player — user extends a player on their roster.
app.post('/league/:id/extend-player', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const { league: updated, error } = extendPlayer(league, playerId);
  if (error) { res.status(400).json({ error }); return; }
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/release-player — user releases a player to free agency.
app.post('/league/:id/release-player', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const { league: updated, error } = releasePlayer(league, playerId);
  if (error) { res.status(400).json({ error }); return; }
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/sign-free-agent — user signs a player from free agency.
app.post('/league/:id/sign-free-agent', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const player = league.freeAgents.find(p => p.id === playerId);
  const { league: updated, error } = signPlayer(league, playerId);
  if (error) { res.status(400).json({ error }); return; }
  let final = updated;
  if (player) {
    const userTeam = league.teams.find(t => t.id === updated.userTeamId);
    if (userTeam) {
      final = addNewsItems(updated, [newsForSigning(
        player.name, player.id, player.position,
        userTeam.name, userTeam.id,
        league.currentSeason.year, league.currentWeek,
      )]);
    }
  }
  dbSaveLeague(final);
  res.json(final);
});

// POST /league/:id/draft-pick — user selects a prospect from the draft board.
app.post('/league/:id/draft-pick', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const { league: updated, error } = makeDraftPick(league, playerId);
  if (error) { res.status(400).json({ error }); return; }
  const withActivity = addActivity(updated, `You selected ${updated.draft?.slots.find(s => s.playerId === playerId)?.playerName ?? playerId}`);
  dbSaveLeague(withActivity);
  res.json(withActivity);
});

// POST /league/:id/sim-draft — AI picks for all remaining slots (including user's).
app.post('/league/:id/sim-draft', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  if (!league.draft || league.draft.complete) {
    res.status(400).json({ error: 'No active draft to simulate.' }); return;
  }
  const simmed = simRemainingDraft(league);
  const withActivity = addActivity(simmed, 'Remaining draft picks simulated by AI.');
  dbSaveLeague(withActivity);
  res.json(withActivity);
});

// POST /league/:id/set-depth-chart — reorder a position slot in the user's depth chart.
app.post('/league/:id/set-depth-chart', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { slot, playerIds } = req.body as { slot?: string; playerIds?: string[] };
  if (!slot || !Array.isArray(playerIds)) { res.status(400).json({ error: 'slot and playerIds are required.' }); return; }
  const userTeam = getUserTeam(league);
  const newSlot = playerIds.map(pid => userTeam.roster.find(p => p.id === pid) ?? null);
  const newChart = { ...userTeam.depthChart, [slot]: newSlot } as DepthChart;
  const updatedTeam = { ...userTeam, depthChart: newChart };
  const updated = { ...league, teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t) };
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/set-gameplan — update the user's team gameplan and derived playcalling.
app.post('/league/:id/set-gameplan', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const body = req.body as Partial<GameplanSettings>;
  const userTeam = getUserTeam(league);
  const current: GameplanSettings = userTeam.gameplan ?? DEFAULT_GAMEPLAN;
  const gameplan: GameplanSettings = {
    passEmphasis:      body.passEmphasis      ?? current.passEmphasis,
    runEmphasis:       body.runEmphasis       ?? current.runEmphasis,
    tempo:             body.tempo             ?? current.tempo,
    playAction:        body.playAction        ?? current.playAction,
    defensiveFocus:    body.defensiveFocus    ?? current.defensiveFocus,
    offensivePlaybook: body.offensivePlaybook ?? current.offensivePlaybook,
    defensivePlaybook: body.defensivePlaybook ?? current.defensivePlaybook,
  };
  const updatedTeam = { ...userTeam, gameplan, playcalling: derivePlaycalling(gameplan) };
  const updated = { ...league, teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t) };
  dbSaveLeague(updated);
  res.json(updated);
});

// POST /league/:id/settings — update league settings (commissioner only).
app.post('/league/:id/settings', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  if (league.commissionerId !== userId) {
    res.status(403).json({ error: 'Only the commissioner can update league settings.' });
    return;
  }

  const { displayName, maxUsers, visibility } = req.body as {
    displayName?: string;
    maxUsers?: number;
    visibility?: 'public' | 'private';
  };

  let updated: League = { ...league };
  if (displayName !== undefined && displayName.trim()) {
    updated = { ...updated, displayName: displayName.trim() };
  }
  if (maxUsers !== undefined) {
    const newMaxUsers = maxUsers > 0 ? maxUsers : undefined;
    const { maxUsers: _old, ...rest } = updated;
    updated = newMaxUsers !== undefined ? { ...rest, maxUsers: newMaxUsers } : rest as League;
  }
  if (visibility !== undefined && visibility !== league.visibility) {
    updated = { ...updated, visibility };
    if (visibility === 'private' && !updated.inviteCode) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      const hash = await bcrypt.hash(code, 10);
      updated = { ...updated, inviteCode: code };
      updateLeaguePasswordHash(league.id, hash);
    } else if (visibility === 'public') {
      updateLeaguePasswordHash(league.id, null);
    }
  }

  dbSaveLeague(updated);
  res.json(updated);
});

// GET /league/:id/members — list all members (auth required).
app.get('/league/:id/members', requireAuth, (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const league = dbGetLeague(id);
  if (!league) { res.status(404).json({ error: `League '${id}' not found.` }); return; }
  const members = listLeagueMembers(id);
  res.json(members);
});

// POST /league/:id/kick-member — remove a user from the league (commissioner only).
app.post('/league/:id/kick-member', requireAuth, (req: Request, res: Response) => {
  const id     = req.params['id'] as string;
  const userId = (req as AuthRequest).user!.userId;
  const { userId: targetId } = req.body as { userId?: string };

  const league = dbGetLeague(id);
  if (!league) { res.status(404).json({ error: `League '${id}' not found.` }); return; }
  if (league.commissionerId !== userId) {
    res.status(403).json({ error: 'Only the commissioner can remove members.' }); return;
  }
  if (!targetId) { res.status(400).json({ error: 'userId is required.' }); return; }
  if (targetId === userId) { res.status(400).json({ error: 'Cannot remove yourself.' }); return; }

  // Clear team ownership if the kicked user owns a team
  const ownedTeam = league.teams.find(t => t.ownerId === targetId);
  if (ownedTeam) {
    const updated: League = {
      ...league,
      teams: league.teams.map(t => {
        if (t.ownerId !== targetId) return t;
        const { ownerId: _o, ...rest } = t;
        return rest;
      }),
    };
    dbSaveLeague(updated);
  }

  removeMembership(id, targetId);
  res.json({ ok: true });
});

// ── Scheduler ─────────────────────────────────────────────────────────────────

const SCHEDULE_INTERVALS: Record<string, number> = {
  fast:   30_000,       // 30 seconds
  normal: 2 * 60_000,   // 2 minutes
};

function runScheduler(): void {
  setInterval(() => {
    const now = Date.now();
    const scheduledIds = getScheduledLeagueIds();

    for (const id of scheduledIds) {
      const league = dbGetLeague(id);
      if (!league) continue;

      const interval = SCHEDULE_INTERVALS[league.advanceSchedule ?? ''];
      if (!interval) continue;
      if (now - (league.lastAdvanceTime ?? 0) < interval) continue;
      // Skip offseason — the next-season rollover is a deliberate user action.
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
        const advanced: League = { ...doAdvance(league), lastAdvanceTime: now };
        dbSaveLeague(advanced);
        console.log(`[scheduler] League ${id} advanced (phase: ${advanced.phase}, week: ${advanced.currentWeek})`);
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
