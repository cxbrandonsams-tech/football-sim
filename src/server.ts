import express from 'express';
import cors from 'cors';
import { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { type League, type TradeAsset, type TradeProposal, type LeagueNotification, type Activity, type SeasonRecord } from './models/League';
import { simulateWeek }          from './engine/simulateWeek';
import { createInitialLeague }    from './initialLeague';
import { seedPlayoffBracket, advancePlayoffRound, getPlayoffActivityMessages } from './engine/postseason';
import { rollupSeasonHistory, startNextSeason, runOffseasonProgression } from './engine/seasonEngine';
import { extendPlayer }   from './engine/contracts';
import { signPlayer, releasePlayer } from './engine/rosterManagement';
import { fireCoach, hireCoachFromPool, promoteWithin } from './engine/coachCarousel';
import { incrementGmStat, initGmCareer } from './engine/gmCareer';
import { offerContract, cpuInitialFASignings, calcAskingPrice } from './engine/freeAgency';
import { startDraft, makeDraftPick, simRemainingDraft, advanceOneCpuPick, advanceToUserPick } from './engine/draft';
import { generateDraftClass, generateScoutingReport, budgetToPoints } from './engine/scoutingEngine';
import { type ProspectScoutingState, type Prospect } from './models/Prospect';
import { TUNING } from './engine/config';
import { createTradeProposal, applyTrade, shouldAIAcceptTrade, runAITrades, describeAssets, validateTradeCaps, generateShopOffers } from './engine/trades';
import { newsForGame, newsForTrade, newsForSigning, newsForDraftPick, addNewsItems } from './engine/news';
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
  getGameLog,
  purgeSeasonGameLogs,
  getGameResults,
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

/**
 * Strip hidden prospect fields (trueOverall, trueRatings, truePotential, trueRound)
 * from draftClass before sending League to the client.
 */
function sanitizeLeagueForClient(league: League): League {
  if (!league.draftClass || !Array.isArray(league.draftClass.prospects)) return league;
  const sanitizedProspects = league.draftClass.prospects.map(
    ({ trueOverall: _1, trueRatings: _2, truePotential: _3, trueRound: _4, ...safe }) =>
      safe as Prospect,
  );
  return { ...league, draftClass: { ...league.draftClass, prospects: sanitizedProspects } };
}

/** Send a League response with hidden prospect fields stripped. */
function sendLeague(res: Response, league: League): void {
  res.json(sanitizeLeagueForClient(league));
}

/**
 * Generate a draft class for the upcoming season and reset all team scouting points.
 * Called when the league transitions to the offseason phase.
 */
function initDraftCycle(league: League): League {
  const draftYear  = league.currentSeason.year + 1;
  const draftClass = generateDraftClass(draftYear);
  const updatedTeams = league.teams.map(t => ({
    ...t,
    scoutingPoints: budgetToPoints(t.scoutingBudget ?? TUNING.scouting.defaultBudgetTier),
    scoutingData:   {} as Record<string, ProspectScoutingState>,
    draftBoard:     [] as string[],
  }));
  return { ...league, draftClass, teams: updatedTeams };
}

function doAdvance(league: League): League {
  // ── Offseason → start draft ────────────────────────────────────────────────
  if (league.phase === 'offseason') {
    const withAITrades = runAITrades(league);
    const withDraft    = startDraft(withAITrades);
    const afterCpu     = advanceToUserPick(withDraft);  // advance CPU picks to user's first turn
    return addActivity(afterCpu, `Draft underway — ${afterCpu.draft!.players.length} prospects available`);
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
      // CPU teams grab top FAs before the user can act.
      updated = cpuInitialFASignings(updated);
      // Generate the upcoming draft class and reset scouting points for all teams.
      updated = initDraftCycle(updated);
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

// ── CORS ──────────────────────────────────────────────────────────────────────
//
// ALLOWED_ORIGINS  — comma-separated exact origins, e.g.:
//                    https://your-app.vercel.app,https://custom-domain.com
// ALLOW_VERCEL_PREVIEWS — set to "true" to additionally allow any
//                         *.vercel.app origin (safe; only Vercel accounts
//                         can deploy there). Useful during active development.
//
// In local dev (no ALLOWED_ORIGINS set) all origins are allowed.

const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowVercelPreviews = process.env['ALLOW_VERCEL_PREVIEWS'] === 'true';

function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (allowVercelPreviews && /^https:\/\/[^.]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);              // server-to-server / health checks
    if (allowedOrigins.length === 0) return callback(null, true); // local dev: no list = open
    if (isOriginAllowed(origin)) return callback(null, origin);   // reflect exact origin
    console.warn(`[CORS] Rejected origin: ${origin}`);
    callback(null, false);  // deny — do NOT pass an Error; that skips headers in error handler
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

// Explicit preflight handler — must come before app.use(cors()) so that
// OPTIONS /league/:id (parametric routes) is handled before Express tries
// to match a GET/POST handler and returns 404/405.
app.options(/.*/, cors(corsOptions));

// Apply CORS headers to every non-OPTIONS response.
app.use(cors(corsOptions));

app.use(express.json());

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

// GET /auth/me — validate token and return current user identity.
app.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  const { userId, username } = (req as AuthRequest).user!;
  res.json({ userId, username });
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

// GET /health — deployment sanity check (safe to expose publicly)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    env: process.env['NODE_ENV'] ?? 'development',
    cors: {
      originsConfigured: allowedOrigins.length,
      vercelPreviewsAllowed: allowVercelPreviews,
    },
  });
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

  const rawLeague = createInitialLeague(id, {
    displayName: displayName?.trim() || 'My League',
    visibility:  visibility ?? 'public',
    commissionerId: userId,
    ...(inviteCode    && { inviteCode }),
    ...(advanceSchedule && { advanceSchedule }),
  });
  const league = initGmCareer(rawLeague);

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

  sendLeague(res, league);
});

// GET /league/:id — return league state.
app.get('/league/:id', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const userId = (req as AuthRequest).user?.userId ?? '(unauthenticated)';
  console.log(`[league] GET /league/${id} user=${userId}`);
  try {
    const league = dbGetLeague(id);
    console.log(`[league] DB lookup result: ${league ? `found phase=${league.phase}` : 'not found'}`);
    if (!league) {
      res.status(404).json({ error: `League '${id}' not found.` });
      return;
    }
    const membership = userId !== '(unauthenticated)' ? getMembership(id, userId) : null;
    console.log(`[league] Membership: ${membership ? `teamId=${membership.teamId}` : 'none'}`);
    sendLeague(res, league);
  } catch (err) {
    console.error(`[league] GET /league/${id} crashed:`, err);
    res.status(500).json({ error: 'Failed to load league.' });
  }
});

// GET /league/:id/game/:gameId/events — fetch play-by-play log for a completed game.
// Returns 404 if the game is from a prior season (logs purged at rollover).
app.get('/league/:id/game/:gameId/events', (req: Request, res: Response) => {
  const { id, gameId } = req.params as { id: string; gameId: string };
  const events = getGameLog(id, gameId);
  if (!events) {
    res.status(404).json({ error: 'Play-by-play detail is not available for this game. Detailed logs are only retained for the current season.' });
    return;
  }
  res.json(events);
});

// GET /league/:id/results/:season — permanent lightweight game results for any past season.
app.get('/league/:id/results/:season', (req: Request, res: Response) => {
  const { id, season } = req.params as { id: string; season: string };
  const year = parseInt(season, 10);
  if (isNaN(year)) { res.status(400).json({ error: 'season must be a number.' }); return; }
  res.json(getGameResults(id, year));
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

  sendLeague(res, updated);
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

    if (accepted) {
      const capErr = validateTradeCaps(withProposal, proposal);
      if (capErr) { res.status(400).json({ error: capErr }); return; }
    }

    const now      = Date.now();
    const status   = accepted ? 'accepted' : 'rejected';
    const withStatus: League = {
      ...withProposal,
      tradeProposals: withProposal.tradeProposals.map(p =>
        p.id === proposal.id
          ? { ...p, status, completedAt: now, completedWeek: league.currentWeek, completedPhase: league.phase }
          : p
      ),
    };

    let final: League = accepted ? applyTrade(withStatus, proposal) : withStatus;
    if (accepted) final = incrementGmStat(final, 'trade');
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
    sendLeague(res, final);
    return;
  }

  // Human-owned receiving team — leave pending and notify
  const updated = addNotification(
    withProposal, toTeamId,
    `Trade offer from ${fromTeam.name}: send ${toDesc}, receive ${fromDesc}`
  );
  dbSaveLeague(updated);
  sendLeague(res, updated);
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

  if (accept) {
    const capErr = validateTradeCaps(league, proposal);
    if (capErr) { res.status(400).json({ error: capErr }); return; }
  }

  const now       = Date.now();
  const newStatus = accept ? 'accepted' : 'rejected';
  const withStatus: League = {
    ...league,
    tradeProposals: league.tradeProposals.map(p =>
      p.id === proposalId
        ? { ...p, status: newStatus, completedAt: now, completedWeek: league.currentWeek, completedPhase: league.phase }
        : p
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
  sendLeague(res, final);
});

// POST /league/:id/shop-player — generate CPU trade offers for one of the user's players.
app.post('/league/:id/shop-player', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam?.roster.some(p => p.id === playerId)) {
    res.status(400).json({ error: 'Player not found on your roster.' }); return;
  }
  const { league: updated, count, error } = generateShopOffers(league, league.userTeamId, playerId);
  if (error) { res.status(400).json({ error }); return; }
  dbSaveLeague(updated);
  res.json({ league: sanitizeLeagueForClient(updated), count });
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
  sendLeague(res, updated);
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
    // Detect season rollover: draft complete → regular_season transition.
    const isSeasonRollover = league.phase === 'draft' && !!league.draft?.complete;
    const oldSeasonYear    = league.currentSeason.year;

    const updated = doAdvance(league);
    dbSaveLeague(updated);

    // Purge prior-season play logs after the new season is safely saved.
    if (isSeasonRollover) purgeSeasonGameLogs(league.id, oldSeasonYear);

    sendLeague(res, updated);
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
  sendLeague(res, updated);
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
  sendLeague(res, updated);
});

// POST /league/:id/fire-coach — user fires a coach from their staff.
app.post('/league/:id/fire-coach', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { role } = req.body as { role?: string };
  if (!role || !['HC', 'OC', 'DC'].includes(role)) {
    res.status(400).json({ error: 'role must be HC, OC, or DC.' }); return;
  }
  if (role === 'HC') {
    res.status(400).json({ error: 'Cannot fire the HC directly; hire a replacement first.' }); return;
  }
  const userTeam = getUserTeam(league);
  const { league: updated } = fireCoach(league, userTeam.id, role as 'OC' | 'DC');
  dbSaveLeague(updated);
  sendLeague(res, updated);
});

// POST /league/:id/hire-coach — user hires a coach from the unemployed pool.
app.post('/league/:id/hire-coach', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { coachId, role } = req.body as { coachId?: string; role?: string };
  if (!coachId) { res.status(400).json({ error: 'coachId is required.' }); return; }
  if (!role || !['HC', 'OC', 'DC'].includes(role)) {
    res.status(400).json({ error: 'role must be HC, OC, or DC.' }); return;
  }
  const userTeam = getUserTeam(league);
  const { league: updated, error } = hireCoachFromPool(league, userTeam.id, role as 'HC' | 'OC' | 'DC', coachId);
  if (error) { res.status(400).json({ error }); return; }
  dbSaveLeague(updated);
  sendLeague(res, updated);
});

// POST /league/:id/promote-within — user promotes an internal coordinator candidate.
app.post('/league/:id/promote-within', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { role } = req.body as { role?: string };
  if (!role || !['OC', 'DC'].includes(role)) {
    res.status(400).json({ error: 'role must be OC or DC.' }); return;
  }
  const userTeam = getUserTeam(league);
  const { league: updated } = promoteWithin(league, userTeam.id, role as 'OC' | 'DC');
  dbSaveLeague(updated);
  sendLeague(res, updated);
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
  let final = incrementGmStat(updated, 'faSigning');
  if (player) {
    const userTeam = league.teams.find(t => t.id === final.userTeamId);
    if (userTeam) {
      final = addNewsItems(final, [newsForSigning(
        player.name, player.id, player.position,
        userTeam.name, userTeam.id,
        league.currentSeason.year, league.currentWeek,
      )]);
    }
  }
  dbSaveLeague(final);
  sendLeague(res, final);
});

// POST /league/:id/offer-contract — user offers a contract to a free agent.
app.post('/league/:id/offer-contract', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId, salary, years } = req.body as { playerId?: string; salary?: number; years?: number };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  if (typeof salary !== 'number' || salary < 1) { res.status(400).json({ error: 'salary must be a positive number.' }); return; }
  if (typeof years !== 'number' || years < 1 || years > 10) { res.status(400).json({ error: 'years must be between 1 and 10.' }); return; }
  const { league: updated, accepted, message, error } = offerContract(league, playerId, salary, years);
  if (error) { res.status(400).json({ error }); return; }
  let final = updated;
  if (accepted) {
    const player = league.freeAgents.find(p => p.id === playerId);
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
  }
  dbSaveLeague(final);
  res.json({ league: sanitizeLeagueForClient(final), accepted, message });
});

// POST /league/:id/draft-pick — user selects a prospect from the draft board.
app.post('/league/:id/draft-pick', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: 'playerId is required.' }); return; }
  const { league: updated, error } = makeDraftPick(league, playerId);
  if (error) { res.status(400).json({ error }); return; }
  const slot = updated.draft?.slots.find(s => s.playerId === playerId);
  const withGm = incrementGmStat(updated, 'draftPick');
  let withActivity = addActivity(withGm, `You selected ${slot?.playerName ?? playerId}`);
  // Generate news for early-round picks (rounds 1-3)
  if (slot?.playerId && slot.playerName && slot.round <= 3) {
    withActivity = addNewsItems(withActivity, [newsForDraftPick(
      slot.playerName, slot.playerId, slot.playerPos ?? '?',
      slot.teamName, slot.teamId,
      slot.round, slot.overallPick,
      updated.draft!.year,
    )]);
  }
  dbSaveLeague(withActivity);
  sendLeague(res, withActivity);
});

// POST /league/:id/sim-draft — AI picks for all remaining slots (including user's).
app.post('/league/:id/sim-draft', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  if (!league.draft || league.draft.complete) {
    res.status(400).json({ error: 'No active draft to simulate.' }); return;
  }
  const prevIdx = league.draft.currentSlotIdx;
  const simmed = simRemainingDraft(league);
  let withActivity = addActivity(simmed, 'Remaining draft picks simulated by AI.');
  // Generate news for early-round picks that were just simulated
  const newlyPickedSlots = simmed.draft?.slots.slice(prevIdx).filter(s => s.playerId && s.playerName && s.round <= 3) ?? [];
  if (newlyPickedSlots.length > 0) {
    const draftYear = simmed.draft!.year;
    const draftNews = newlyPickedSlots.map(s => newsForDraftPick(
      s.playerName!, s.playerId!, s.playerPos ?? '?',
      s.teamName, s.teamId, s.round, s.overallPick, draftYear,
    ));
    withActivity = addNewsItems(withActivity, draftNews);
  }
  dbSaveLeague(withActivity);
  sendLeague(res, withActivity);
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
  sendLeague(res, updated);
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
  sendLeague(res, updated);
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
  sendLeague(res, updated);
});

// POST /league/:id/advance-draft-pick — advance exactly one CPU pick.
app.post('/league/:id/advance-draft-pick', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { league: updated, error } = advanceOneCpuPick(league);
  if (error) { res.status(400).json({ error }); return; }
  // Build activity message from the just-completed slot (currentSlotIdx was incremented by applyPick)
  const completedSlot = updated.draft?.slots[(updated.draft?.currentSlotIdx ?? 1) - 1];
  const msg = completedSlot?.playerName
    ? `${completedSlot.teamName} selects ${completedSlot.playerName} (${completedSlot.playerPos ?? ''})`
    : 'Pick made.';
  let withActivity = addActivity(updated, msg);
  // Generate news for early-round CPU picks (rounds 1-3)
  if (completedSlot?.playerId && completedSlot.playerName && completedSlot.round <= 3) {
    withActivity = addNewsItems(withActivity, [newsForDraftPick(
      completedSlot.playerName, completedSlot.playerId, completedSlot.playerPos ?? '?',
      completedSlot.teamName, completedSlot.teamId,
      completedSlot.round, completedSlot.overallPick,
      updated.draft!.year,
    )]);
  }
  dbSaveLeague(withActivity);
  sendLeague(res, withActivity);
});

// POST /league/:id/advance-to-user-pick — advance all CPU picks until the user's next turn.
app.post('/league/:id/advance-to-user-pick', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  if (!league.draft || league.draft.complete) {
    res.status(400).json({ error: 'No active draft.' }); return;
  }
  const slot = league.draft.slots[league.draft.currentSlotIdx];
  if (slot?.teamId === league.userTeamId) {
    // Already at user's pick — no-op (avoid spurious activity log)
    sendLeague(res, league); return;
  }
  const updated = advanceToUserPick(league);
  const withActivity = addActivity(updated, "CPU picks complete — your turn.");
  dbSaveLeague(withActivity);
  sendLeague(res, withActivity);
});

// POST /league/:id/scout-prospect — spend scouting points to generate/upgrade a prospect report.
app.post('/league/:id/scout-prospect', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { prospectId } = req.body as { prospectId?: string };
  if (!prospectId) { res.status(400).json({ error: 'prospectId is required.' }); return; }

  if (!league.draftClass) { res.status(400).json({ error: 'No draft class available to scout.' }); return; }

  const prospect = league.draftClass.prospects.find(p => p.id === prospectId);
  if (!prospect) { res.status(404).json({ error: `Prospect '${prospectId}' not found.` }); return; }

  const userTeam = getUserTeam(league);
  const scoutingData: Record<string, ProspectScoutingState> = userTeam.scoutingData ?? {};
  const existing: ProspectScoutingState = scoutingData[prospectId] ?? {
    prospectId, scoutLevel: 0, pointsSpent: 0, report: null,
  };

  if (existing.scoutLevel >= 3) {
    res.status(400).json({ error: 'Already fully scouted.' }); return;
  }

  const costs = [TUNING.scouting.pass1Cost, TUNING.scouting.pass2Cost, TUNING.scouting.pass3Cost];
  const cost  = costs[existing.scoutLevel]!;
  const available = userTeam.scoutingPoints ?? 0;
  if (available < cost) {
    res.status(400).json({ error: `Not enough scouting points. Need ${cost}, have ${available}.` }); return;
  }

  const newLevel = (existing.scoutLevel + 1) as 1 | 2 | 3;
  const scoutOverall = userTeam.scout?.overall ?? 60;
  const report = generateScoutingReport(prospect, newLevel, scoutOverall);

  const newState: ProspectScoutingState = {
    prospectId,
    scoutLevel:  newLevel,
    pointsSpent: existing.pointsSpent + cost,
    report,
  };

  const updatedTeam = {
    ...userTeam,
    scoutingPoints: available - cost,
    scoutingData:   { ...scoutingData, [prospectId]: newState },
  };
  const updated: League = {
    ...league,
    teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t),
  };
  dbSaveLeague(updated);
  sendLeague(res, updated);
});

// POST /league/:id/draft-board — persist the user's ordered draft board.
app.post('/league/:id/draft-board', requireAuth, (req: Request, res: Response) => {
  const league = getLeagueOrFail(req, res);
  if (!league) return;
  const { board } = req.body as { board?: string[] };
  if (!Array.isArray(board)) { res.status(400).json({ error: 'board must be an array of prospect IDs.' }); return; }

  const userTeam = getUserTeam(league);
  const updatedTeam = { ...userTeam, draftBoard: board };
  const updated: League = {
    ...league,
    teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t),
  };
  dbSaveLeague(updated);
  sendLeague(res, updated);
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
      try {
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

        const isSeasonRollover = league.phase === 'draft' && !!league.draft?.complete;
        const oldSeasonYear    = league.currentSeason.year;

        const advanced: League = { ...doAdvance(league), lastAdvanceTime: now };
        dbSaveLeague(advanced);

        if (isSeasonRollover) purgeSeasonGameLogs(id, oldSeasonYear);

        console.log(`[scheduler] League ${id} advanced (phase: ${advanced.phase}, week: ${advanced.currentWeek})`);
      } catch (err) {
        console.error(`[scheduler] League ${id} advance failed:`, err);
        continue;
      }
    }
  }, 10_000);
}

// ── Global error handler ──────────────────────────────────────────────────────
// Must be registered after all routes. Catches any error passed to next(err)
// by Express (e.g. synchronous throws in route handlers). Returns JSON so the
// browser can read the error body; CORS headers are already set by the cors
// middleware that ran earlier in the request pipeline.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error] Unhandled route error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env['PORT'] ?? 3000;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[server] Gridiron running on http://0.0.0.0:${PORT} (${process.env['NODE_ENV'] ?? 'development'})`);
  if (allowedOrigins.length > 0) {
    console.log(`[cors]   Allowed origins (${allowedOrigins.length}): ${allowedOrigins.join(', ')}`);
  } else {
    console.log(`[cors]   No ALLOWED_ORIGINS set — all origins permitted (dev mode)`);
  }
  if (allowVercelPreviews) console.log(`[cors]   Vercel preview domains (*.vercel.app) allowed`);
  runScheduler();
});
