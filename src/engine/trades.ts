import { type Player } from '../models/Player';
import { type League, type TradeProposal, type TradeAsset } from '../models/League';
import { type Team } from '../models/Team';
import { buildDepthChart } from '../models/DepthChart';
import { getTeamDirection, evaluateRosterNeeds, posGroup } from './teamDirection';
import { CAP_LIMIT, getTeamPayroll } from './rosterManagement';
import { TUNING } from './config';
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

/** Returns all picks that teamId currently owns for the next two draft years. */
export function getTeamOwnedPicks(league: League, teamId: string): TradeAsset[] {
  const results: TradeAsset[] = [];
  const nextDraftYear   = league.draft?.year ?? (league.currentSeason.year + 1);
  const futureYear      = nextDraftYear + 1;

  for (const year of [nextDraftYear, futureYear]) {
    for (const team of league.teams) {
      for (let round = 1; round <= 7; round++) {
        const key   = `${year}:${round}:${team.id}`;
        const owner = league.draftPickOwnership[key] ?? team.id;
        if (owner === teamId) {
          results.push({
            type:             'pick',
            year,
            round,
            originalTeamId:   team.id,
            originalTeamName: team.name,
          });
        }
      }
    }
  }
  return results;
}

// ── Cap validation ────────────────────────────────────────────────────────────

/**
 * Checks that neither team will exceed CAP_LIMIT after the trade executes.
 * Returns an error string if invalid, or null if the trade is cap-legal.
 */
export function validateTradeCaps(league: League, proposal: TradeProposal): string | null {
  const fromTeam = league.teams.find(t => t.id === proposal.fromTeamId);
  const toTeam   = league.teams.find(t => t.id === proposal.toTeamId);
  if (!fromTeam || !toTeam) return null;

  // Sum player salaries from an asset list that belong to a specific team's roster
  function playerSalarySum(assets: TradeAsset[], ownerTeam: Team): number {
    return assets.reduce((s, a) => {
      if (a.type !== 'player') return s;
      return s + (ownerTeam.roster.find(p => p.id === a.playerId)?.salary ?? 0);
    }, 0);
  }

  // fromTeam: loses fromAssets players, gains toAssets players
  const fromPost = getTeamPayroll(fromTeam)
    - playerSalarySum(proposal.fromAssets, fromTeam)
    + playerSalarySum(proposal.toAssets,   toTeam);

  if (fromPost > CAP_LIMIT) {
    return `${fromTeam.name} would exceed the salary cap after this trade ($${fromPost}M / $${CAP_LIMIT}M).`;
  }

  // toTeam: loses toAssets players, gains fromAssets players
  const toPost = getTeamPayroll(toTeam)
    - playerSalarySum(proposal.toAssets,   toTeam)
    + playerSalarySum(proposal.fromAssets, fromTeam);

  if (toPost > CAP_LIMIT) {
    return `${toTeam.name} would exceed the salary cap after this trade ($${toPost}M / $${CAP_LIMIT}M).`;
  }

  return null;
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

  const incomingHasPick  = proposal.fromAssets.some(a => a.type === 'pick');
  const incomingHasYouth = proposal.fromAssets.some(
    a => a.type === 'player' && (league.teams.flatMap(t => t.roster)
      .find(p => p.id === a.playerId)?.age ?? 99) <= 24,
  );

  const t = TUNING.trades;
  let threshold: number = t.aiAcceptThreshold;
  if (direction === 'contender')  threshold = t.contenderThreshold;
  if (direction === 'rebuilding' && (incomingHasPick || incomingHasYouth)) threshold = t.rebuilderPickThreshold;
  if (direction === 'rebuilding' && !incomingHasPick && !incomingHasYouth) threshold = t.rebuilderNoPickThreshold;

  return incomingValue >= outgoingValue * threshold;
}

// ── Asset description ─────────────────────────────────────────────────────────

export function describeAssets(assets: TradeAsset[]): string {
  if (assets.length === 0) return 'nothing';
  return assets
    .map(a => a.type === 'player' ? a.playerName : `${a.year} R${a.round} pick (${a.originalTeamName})`)
    .join(', ');
}

// ── Shop player (generate CPU offers for a user's player) ─────────────────────

/**
 * Generates pending trade proposals from CPU teams interested in acquiring
 * the user's player. Proposals are saved to league.tradeProposals as 'pending'
 * so the user sees them in the Incoming Proposals section.
 */
export function generateShopOffers(
  league:    League,
  userTeamId: string,
  playerId:   string,
): { league: League; count: number; error?: string } {
  const userTeam = league.teams.find(t => t.id === userTeamId);
  if (!userTeam) return { league, count: 0, error: 'Your team not found.' };

  const shoppedPlayer = userTeam.roster.find(p => p.id === playerId);
  if (!shoppedPlayer) return { league, count: 0, error: 'Player not found on your roster.' };

  const askedValue = calcPlayerValue(shoppedPlayer);
  const tr         = TUNING.trades;
  const numTeams   = league.teams.length;
  const nextYear   = league.draft?.year ?? (league.currentSeason.year + 1);
  const group      = posGroup(shoppedPlayer.position);

  // Score each CPU team's interest level
  const interested = league.teams
    .filter(t => t.id !== userTeamId && !t.ownerId)
    .map(t => ({
      team:      t,
      needs:     evaluateRosterNeeds(t),
      capRoom:   CAP_LIMIT - getTeamPayroll(t),
      direction: getTeamDirection(t, league),
    }))
    .filter(({ needs, capRoom }) =>
      (needs[group] ?? 0) >= 0 && capRoom >= shoppedPlayer.salary - 10,
    )
    .sort((a, b) => (b.needs[group] ?? 0) - (a.needs[group] ?? 0));

  let cur   = league;
  let count = 0;

  for (const { team, direction } of interested) {
    if (count >= tr.shopMaxOffers) break;

    // Build candidate counter-offer: player of similar value, protecting
    // franchise-level assets on contenders.
    const candidates = [...team.roster]
      .filter(p => {
        if (direction === 'contender' && p.overall >= 78 && p.age >= 25 && p.age <= 32) return false;
        return true;
      })
      .map(p => ({ p, val: calcPlayerValue(p) }))
      .sort((a, b) => Math.abs(a.val - askedValue) - Math.abs(b.val - askedValue));

    const best = candidates[0];
    if (!best) continue;

    let offerValue          = best.val;
    const fromAssets: TradeAsset[] = [{
      type: 'player', playerId: best.p.id, playerName: best.p.name,
      playerPos: best.p.position, playerOvr: best.p.overall,
    }];

    // If value gap > 15%, try sweeting with a pick
    if (offerValue < askedValue * 0.85) {
      const pickRound = offerValue < askedValue * 0.70 ? 1 : 2;
      const key       = `${nextYear}:${pickRound}:${team.id}`;
      const pickOwner = cur.draftPickOwnership[key] ?? team.id;
      if (pickOwner === team.id) {
        offerValue += calcPickValue(pickRound, Math.floor(numTeams / 2), numTeams);
        fromAssets.push({
          type: 'pick', year: nextYear, round: pickRound,
          originalTeamId: team.id, originalTeamName: team.name,
        });
      }
    }

    if (offerValue < askedValue * tr.shopMinRatio) continue;

    // Cap check: team must be able to absorb the incoming player
    const netCapChange = shoppedPlayer.salary - best.p.salary;
    if (getTeamPayroll(team) + netCapChange > CAP_LIMIT) continue;

    const toAssets: TradeAsset[] = [{
      type: 'player', playerId: shoppedPlayer.id, playerName: shoppedPlayer.name,
      playerPos: shoppedPlayer.position, playerOvr: shoppedPlayer.overall,
    }];

    const proposal: TradeProposal = {
      id:         crypto.randomUUID(),
      fromTeamId: team.id,
      toTeamId:   userTeamId,
      fromAssets,
      toAssets,
      status:     'pending',
    };

    cur = { ...cur, tradeProposals: [...cur.tradeProposals, proposal] };
    count++;
  }

  return { league: cur, count };
}

// ── AI-to-AI offseason trades ─────────────────────────────────────────────────

/**
 * Offseason AI-to-AI trades with direction awareness.
 */
export function runAITrades(league: League): League {
  if (league.phase !== 'offseason') return league;

  let cur = league;
  const aiTeamIds = league.teams
    .filter(t => t.id !== league.userTeamId)
    .map(t => t.id);

  if (aiTeamIds.length < 2) return league;

  const tr          = TUNING.trades;
  const MAX_TRADES  = tr.aiMaxTrades;
  const MAX_ATTEMPTS = tr.aiMaxAttempts;
  let completed     = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && completed < MAX_TRADES; attempt++) {
    const i1 = Math.floor(Math.random() * aiTeamIds.length);
    let   i2 = Math.floor(Math.random() * (aiTeamIds.length - 1));
    if (i2 >= i1) i2++;

    const team1 = cur.teams.find(t => t.id === aiTeamIds[i1]!);
    const team2 = cur.teams.find(t => t.id === aiTeamIds[i2]!);
    if (!team1 || !team2 || team1.roster.length < 2 || team2.roster.length < 2) continue;

    const dir1 = getTeamDirection(team1, cur);
    const dir2 = getTeamDirection(team2, cur);

    let seller = team1;
    let buyer  = team2;
    if (dir2 === 'rebuilding' && dir1 === 'contender') { seller = team2; buyer = team1; }
    else if (dir1 === 'rebuilding' && dir2 !== 'rebuilding') { /* seller already = team1 */ }
    else if (dir2 === 'rebuilding' && dir1 !== 'rebuilding') { seller = team2; buyer = team1; }

    const sellerDir = getTeamDirection(seller, cur);
    const buyerDir  = getTeamDirection(buyer, cur);

    const sellerCandidates = [...seller.roster]
      .sort((a, b) => calcPlayerValue(b) - calcPlayerValue(a))
      .filter(p => {
        if (sellerDir === 'rebuilding' && p.age <= 26 && p.overall >= 70) return false;
        return true;
      });

    const p1Idx   = Math.floor(Math.random() * Math.min(4, sellerCandidates.length));
    const player1 = sellerCandidates[p1Idx];
    if (!player1) continue;
    const val1 = calcPlayerValue(player1);

    const buyerCandidates = buyer.roster.filter(p => {
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
    if (lower < higher * tr.aiLopsidedThreshold) continue;

    // Cap-check both teams before applying
    const draftProposal: TradeProposal = {
      id:        crypto.randomUUID(),
      fromTeamId: seller.id,
      toTeamId:   buyer.id,
      fromAssets: [{ type: 'player', playerId: player1.id, playerName: player1.name, playerPos: player1.position, playerOvr: player1.overall }],
      toAssets:   [{ type: 'player', playerId: player2.id, playerName: player2.name, playerPos: player2.position, playerOvr: player2.overall }],
      status: 'accepted',
      completedAt: Date.now(),
    };

    const capErr = validateTradeCaps(cur, draftProposal);
    if (capErr) continue;

    cur = applyTrade(cur, draftProposal);
    cur = { ...cur, tradeProposals: [...cur.tradeProposals, draftProposal] };
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
