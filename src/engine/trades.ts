import { type Player } from '../models/Player';
import { type League, type TradeProposal, type TradeAsset } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { getTeamDirection } from './teamDirection';
import * as crypto from 'crypto';

// ── Value model ───────────────────────────────────────────────────────────────

export function calcPlayerValue(player: Player): number {
  let value = player.overall;

  // Age curve — peak around 26-27
  const age = player.age;
  if      (age <= 23) value += 12;
  else if (age <= 25) value += 8;
  else if (age <= 27) value += 4;
  else if (age <= 29) value += 0;
  else if (age <= 31) value -= 8;
  else                value -= 18;

  // Contract control bonus (each year under team control adds value)
  value += Math.min(player.yearsRemaining, 4) * 3;

  // Rookie contract discount
  if (player.isRookie) value += 20;

  // Salary efficiency (lower salary is better at given OVR; avg ~6M)
  value -= Math.max(0, player.salary - 6) * 0.5;

  return Math.round(value);
}

const ROUND_BASE: Record<number, number> = {
  1: 100, 2: 65, 3: 45, 4: 30, 5: 20, 6: 14, 7: 10,
};

export function calcPickValue(round: number, pickInRound: number, numTeams: number): number {
  const base = ROUND_BASE[round] ?? 8;
  const rangeBonus = round <= 2 ? 25 : round <= 4 ? 12 : 8;
  const pickBonus  = ((numTeams - pickInRound) / numTeams) * rangeBonus;
  return Math.round(base + pickBonus);
}

function assetValue(asset: TradeAsset, league: League): number {
  if (asset.type === 'player') {
    const player = findPlayerAnywhere(league, asset.playerId);
    if (!player) return 0;
    return calcPlayerValue(player);
  }
  const numTeams   = league.teams.length;
  const midPick    = Math.floor(numTeams / 2);
  return calcPickValue(asset.round, midPick, numTeams);
}

function findPlayerAnywhere(league: League, playerId: string): Player | undefined {
  for (const t of league.teams) {
    const found = t.roster.find(p => p.id === playerId);
    if (found) return found;
  }
  return undefined;
}

export function totalAssetsValue(assets: TradeAsset[], league: League): number {
  return assets.reduce((sum, a) => sum + assetValue(a, league), 0);
}

/** Returns all picks that teamId currently owns for the next draft. */
export function getTeamOwnedPicks(league: League, teamId: string): TradeAsset[] {
  const results: TradeAsset[] = [];
  const draftYear = league.draft?.year ?? (league.currentSeason.year + 1);
  for (const team of league.teams) {
    for (let round = 1; round <= 7; round++) {
      const key   = `${draftYear}:${round}:${team.id}`;
      const owner = league.draftPickOwnership[key] ?? team.id;
      if (owner === teamId) {
        results.push({
          type:             'pick',
          year:             draftYear,
          round,
          originalTeamId:   team.id,
          originalTeamName: team.name,
        });
      }
    }
  }
  return results;
}

// ── Trade proposal ────────────────────────────────────────────────────────────

export function createTradeProposal(
  league:     League,
  fromTeamId: string,
  toTeamId:   string,
  fromAssets: TradeAsset[],
  toAssets:   TradeAsset[],
): { league: League; proposal?: TradeProposal; error?: string } {
  if (fromTeamId === toTeamId) return { league, error: 'Cannot trade with yourself.' };
  if (fromAssets.length === 0 && toAssets.length === 0)
    return { league, error: 'Trade must include at least one asset.' };

  const fromTeam = league.teams.find(t => t.id === fromTeamId);
  const toTeam   = league.teams.find(t => t.id === toTeamId);
  if (!fromTeam) return { league, error: 'Sending team not found.' };
  if (!toTeam)   return { league, error: 'Receiving team not found.' };

  for (const a of fromAssets) {
    if (a.type === 'player') {
      if (!fromTeam.roster.some(p => p.id === a.playerId))
        return { league, error: `${a.playerName} is not on your roster.` };
    } else {
      const key   = `${a.year}:${a.round}:${a.originalTeamId}`;
      const owner = league.draftPickOwnership[key] ?? a.originalTeamId;
      if (owner !== fromTeamId)
        return { league, error: `You do not own that draft pick.` };
    }
  }

  for (const a of toAssets) {
    if (a.type === 'player') {
      if (!toTeam.roster.some(p => p.id === a.playerId))
        return { league, error: `${a.playerName} is not on the other team's roster.` };
    } else {
      const key   = `${a.year}:${a.round}:${a.originalTeamId}`;
      const owner = league.draftPickOwnership[key] ?? a.originalTeamId;
      if (owner !== toTeamId)
        return { league, error: `The other team does not own that draft pick.` };
    }
  }

  const proposal: TradeProposal = {
    id: crypto.randomUUID(),
    fromTeamId,
    toTeamId,
    fromAssets,
    toAssets,
    status: 'pending',
  };

  const updated: League = { ...league, tradeProposals: [...league.tradeProposals, proposal] };
  return { league: updated, proposal };
}

// ── Apply trade ───────────────────────────────────────────────────────────────

export function applyTrade(league: League, proposal: TradeProposal): League {
  let updatedTeams        = [...league.teams];
  let updatedPickOwnership = { ...league.draftPickOwnership };

  // Move fromAssets: fromTeam → toTeam
  for (const a of proposal.fromAssets) {
    if (a.type === 'player') {
      const player = league.teams.find(t => t.id === proposal.fromTeamId)!
        .roster.find(p => p.id === a.playerId)!;
      updatedTeams = updatedTeams.map(t => {
        if (t.id === proposal.fromTeamId) return { ...t, roster: t.roster.filter(p => p.id !== a.playerId) };
        if (t.id === proposal.toTeamId)   return { ...t, roster: [...t.roster, player] };
        return t;
      });
    } else {
      updatedPickOwnership[`${a.year}:${a.round}:${a.originalTeamId}`] = proposal.toTeamId;
    }
  }

  // Move toAssets: toTeam → fromTeam
  for (const a of proposal.toAssets) {
    if (a.type === 'player') {
      const player = updatedTeams.find(t => t.id === proposal.toTeamId)!
        .roster.find(p => p.id === a.playerId)!;
      updatedTeams = updatedTeams.map(t => {
        if (t.id === proposal.toTeamId)   return { ...t, roster: t.roster.filter(p => p.id !== a.playerId) };
        if (t.id === proposal.fromTeamId) return { ...t, roster: [...t.roster, player] };
        return t;
      });
    } else {
      updatedPickOwnership[`${a.year}:${a.round}:${a.originalTeamId}`] = proposal.fromTeamId;
    }
  }

  // Rebuild depth charts for affected teams
  const affected = new Set([proposal.fromTeamId, proposal.toTeamId]);
  updatedTeams = updatedTeams.map(t =>
    affected.has(t.id)
      ? { ...t, depthChart: buildDepthChart(t.roster, t.id === league.userTeamId) }
      : t
  );

  return { ...league, teams: updatedTeams, draftPickOwnership: updatedPickOwnership };
}

// ── AI evaluation ─────────────────────────────────────────────────────────────

/** Returns true if the AI toTeam should accept the proposal. */
export function shouldAIAcceptTrade(proposal: TradeProposal, league: League): boolean {
  const incomingValue = totalAssetsValue(proposal.fromAssets, league);
  const outgoingValue = totalAssetsValue(proposal.toAssets, league);

  const toTeam    = league.teams.find(t => t.id === proposal.toTeamId);
  const direction = toTeam ? getTeamDirection(toTeam, league) : 'neutral';

  // Adjust acceptance threshold based on team direction and asset type:
  //   contenders are slightly more willing to overpay for proven players
  //   rebuilders demand more when trading away players, unless receiving picks/youth
  const incomingHasPick    = proposal.fromAssets.some(a => a.type === 'pick');
  const incomingHasYouth   = proposal.fromAssets.some(
    a => a.type === 'player' && (league.teams.flatMap(t => t.roster)
      .find(p => p.id === a.playerId)?.age ?? 99) <= 24,
  );

  let threshold = 0.85;
  if (direction === 'contender')  threshold = 0.80; // willing to slightly overpay
  if (direction === 'rebuilding' && (incomingHasPick || incomingHasYouth)) threshold = 0.75; // eager for assets
  if (direction === 'rebuilding' && !incomingHasPick && !incomingHasYouth) threshold = 0.90; // wary of losing players

  return incomingValue >= outgoingValue * threshold;
}

// ── Asset description ─────────────────────────────────────────────────────────

export function describeAssets(assets: TradeAsset[]): string {
  if (assets.length === 0) return 'nothing';
  return assets
    .map(a => a.type === 'player' ? a.playerName : `${a.year} R${a.round} pick (${a.originalTeamName})`)
    .join(', ');
}

// ── AI-to-AI offseason trades ─────────────────────────────────────────────────

/**
 * Offseason AI-to-AI trades with direction awareness.
 *
 * Prefers pairing a contender (wants veterans, has surplus youth) with a rebuilder
 * (wants youth/picks, has surplus veterans). Falls back to value-balanced swaps
 * between any two teams when no contender-rebuilder pairing is found.
 *
 * Guards prevent rebuilders from trading away their best young core, and
 * contenders from trading away irreplaceable veteran starters.
 */
export function runAITrades(league: League): League {
  if (league.phase !== 'offseason') return league;

  let cur = league;
  const aiTeamIds = league.teams
    .filter(t => t.id !== league.userTeamId)
    .map(t => t.id);

  if (aiTeamIds.length < 2) return league;

  const MAX_TRADES   = 3;
  const MAX_ATTEMPTS = 15;
  let completed      = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && completed < MAX_TRADES; attempt++) {
    // Pick two distinct AI teams
    const i1 = Math.floor(Math.random() * aiTeamIds.length);
    let   i2 = Math.floor(Math.random() * (aiTeamIds.length - 1));
    if (i2 >= i1) i2++;

    const team1 = cur.teams.find(t => t.id === aiTeamIds[i1]!);
    const team2 = cur.teams.find(t => t.id === aiTeamIds[i2]!);
    if (!team1 || !team2 || team1.roster.length < 2 || team2.roster.length < 2) continue;

    const dir1 = getTeamDirection(team1, cur);
    const dir2 = getTeamDirection(team2, cur);

    // Determine who is the "seller" (trades veteran) and "buyer" (receives veteran).
    // Prefer: rebuilder sells to contender. Fall back to any pair.
    let seller = team1;
    let buyer  = team2;
    if (dir2 === 'rebuilding' && dir1 === 'contender') { seller = team2; buyer = team1; }
    else if (dir1 === 'rebuilding' && dir2 !== 'rebuilding') { /* seller already = team1 */ }
    else if (dir2 === 'rebuilding' && dir1 !== 'rebuilding') { seller = team2; buyer = team1; }
    // else random pair stands

    const sellerDir = getTeamDirection(seller, cur);
    const buyerDir  = getTeamDirection(buyer, cur);

    // Seller offers a veteran (age 28+) or high-overall player they're willing to move.
    const sellerCandidates = [...seller.roster]
      .sort((a, b) => calcPlayerValue(b) - calcPlayerValue(a))
      .filter(p => {
        // Rebuilders won't trade their best young players (future core)
        if (sellerDir === 'rebuilding' && p.age <= 26 && p.overall >= 70) return false;
        return true;
      });

    const p1Idx   = Math.floor(Math.random() * Math.min(4, sellerCandidates.length));
    const player1 = sellerCandidates[p1Idx];
    if (!player1) continue;
    const val1 = calcPlayerValue(player1);

    // Buyer offers a player of similar value, protecting their veteran starters.
    const buyerCandidates = buyer.roster.filter(p => {
      // Contenders won't trade veteran starters they rely on to win now
      if (buyerDir === 'contender' && p.age >= 27 && p.age <= 32 && p.overall >= 70) return false;
      return true;
    });

    const player2 = buyerCandidates
      .map(p => ({ p, diff: Math.abs(calcPlayerValue(p) - val1) }))
      .sort((a, b) => a.diff - b.diff)[0]?.p;
    if (!player2) continue;

    const val2   = calcPlayerValue(player2);
    const higher = Math.max(val1, val2);
    const lower  = Math.min(val1, val2);
    if (lower < higher * 0.80) continue; // too lopsided

    const fromAssets: TradeAsset[] = [{
      type: 'player', playerId: player1.id, playerName: player1.name,
      playerPos: player1.position, playerOvr: player1.overall,
    }];
    const toAssets: TradeAsset[] = [{
      type: 'player', playerId: player2.id, playerName: player2.name,
      playerPos: player2.position, playerOvr: player2.overall,
    }];

    const proposal: TradeProposal = {
      id: crypto.randomUUID(),
      fromTeamId: seller.id,
      toTeamId:   buyer.id,
      fromAssets,
      toAssets,
      status: 'accepted',
    };

    cur = applyTrade(cur, proposal);
    cur = { ...cur, tradeProposals: [...cur.tradeProposals, proposal] };
    cur = {
      ...cur,
      activities: [...cur.activities, {
        id:        crypto.randomUUID(),
        message:   `${seller.name} trades ${player1.name} to ${buyer.name} for ${player2.name}`,
        createdAt: Date.now(),
      }],
    };
    completed++;
  }

  return cur;
}
