import { type League } from '../models/League';
import { type Game } from '../models/Game';
import { type NewsItem, type NewsType } from '../models/News';
import { type AwardRecord } from '../models/History';

// ── Utility ───────────────────────────────────────────────────────────────────

const MAX_NEWS = 500;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function makeId(type: NewsType, year: number, week: number): string {
  return `${type}-${year}-${week}-${Math.random().toString(36).slice(2, 7)}`;
}

function item(
  type:      NewsType,
  headline:  string,
  body:      string,
  year:      number,
  week:      number,
  teamIds:   string[] = [],
  playerIds: string[] = [],
): NewsItem {
  return { id: makeId(type, year, week), type, headline, body, year, week, createdAt: Date.now(), teamIds, playerIds };
}

/** Prepend new items and trim to MAX_NEWS. */
export function addNewsItems(league: League, items: NewsItem[]): League {
  if (items.length === 0) return league;
  const news = [...items, ...league.news].slice(0, MAX_NEWS);
  return { ...league, news };
}

// ── Round labels ──────────────────────────────────────────────────────────────

function roundLabel(round: string): string {
  switch (round) {
    case 'wildcard':      return 'Wild Card';
    case 'divisional':   return 'Divisional Round';
    case 'conference':   return 'Conference Championship';
    case 'championship': return 'Championship Game';
    default:             return round;
  }
}

// ── Game result ───────────────────────────────────────────────────────────────

export function newsForGame(
  game: Game,
  year: number,
  isPlayoff = false,
  round?: string,
): NewsItem {
  const hw = game.homeTeam.name, aw = game.awayTeam.name;
  const hs = game.homeScore,     as_ = game.awayScore;
  const homeWon = hs >= as_;
  const winner  = homeWon ? hw  : aw;
  const loser   = homeWon ? aw  : hw;
  const ws      = homeWon ? hs  : as_;
  const ls      = homeWon ? as_ : hs;
  const margin  = ws - ls;

  const winnerTeamId = homeWon ? game.homeTeam.id : game.awayTeam.id;
  const loserTeamId  = homeWon ? game.awayTeam.id : game.homeTeam.id;

  if (isPlayoff && round === 'championship') {
    const templates = [
      [`${winner} are champions!`, `${winner} win the championship with a ${ws}–${ls} victory over ${loser}.`],
      [`${winner} claim the title!`, `${winner} defeat ${loser} ${ws}–${ls} in the championship game to claim the trophy.`],
      [`${winner} win it all!`, `In a ${margin <= 7 ? 'hard-fought' : 'dominant'} title game, ${winner} top ${loser} ${ws}–${ls}.`],
    ] as const;
    const [headline, body] = pick(templates);
    return item('championship', headline, body, year, 0, [winnerTeamId, loserTeamId]);
  }

  if (isPlayoff && round) {
    const label = roundLabel(round);
    const templates = [
      [`${winner} advance past ${loser}`, `${winner} defeat ${loser} ${ws}–${ls} in the ${label}.`],
      [`${loser} eliminated`, `${winner} end ${loser}'s season with a ${ws}–${ls} win in the ${label}.`],
      [`${winner} move on`, `${winner} advance in the ${label}, beating ${loser} ${ws}–${ls}.`],
    ] as const;
    const [headline, body] = pick(templates);
    return item('playoff_result', headline, body, year, 0, [winnerTeamId, loserTeamId]);
  }

  // Regular-season game
  let headline: string;
  let body: string;

  if (margin <= 3) {
    const templates = [
      [`${winner} edge ${loser}`, `A last-minute finish: ${winner} hold on to win ${ws}–${ls}.`],
      [`${winner} survive thriller`, `${winner} escape with a narrow ${ws}–${ls} win over ${loser}.`],
      [`Nail-biter: ${winner} def. ${loser}`, `${winner} and ${loser} went down to the wire — final score ${ws}–${ls}.`],
    ] as const;
    [headline, body] = pick(templates);
  } else if (margin >= 21) {
    const templates = [
      [`${winner} dominate ${loser}`, `It was never close: ${winner} rout ${loser} ${ws}–${ls}.`],
      [`${winner} roll over ${loser}`, `${winner} put up ${ws} points in a dominant ${ws}–${ls} win.`],
      [`Blowout: ${winner} crush ${loser}`, `${loser} fall apart as ${winner} win ${ws}–${ls}.`],
    ] as const;
    [headline, body] = pick(templates);
  } else {
    const templates = [
      [`${winner} defeat ${loser}`, `${winner} win ${ws}–${ls} over ${loser} in week ${game.week} action.`],
      [`${winner} top ${loser}`, `${winner} take care of business, beating ${loser} ${ws}–${ls}.`],
      [`${loser} fall to ${winner}`, `${winner} get the win, ${ws}–${ls}, against ${loser}.`],
    ] as const;
    [headline, body] = pick(templates);
  }

  return item('game_result', headline, body, year, game.week, [winnerTeamId, loserTeamId]);
}

// ── Award ─────────────────────────────────────────────────────────────────────

export function newsForAward(award: AwardRecord, year: number): NewsItem | null {
  const name  = award.playerName ?? award.coachName ?? 'Unknown';
  const pId   = award.playerId  ? [award.playerId]  : [];
  const tId   = award.teamId    ? [award.teamId]     : [];

  let headline: string;
  let body:     string;

  switch (award.type) {
    case 'MVP':
      [headline, body] = pick([
        [`${name} wins MVP`, `${name} takes home the MVP award after a dominant regular season.`],
        [`MVP: ${name}`, `The league votes ${name} as the most valuable player of the year.`],
        [`${name} named league MVP`, `${name} is the MVP after putting together an outstanding season.`],
      ] as const);
      break;
    case 'OPOY':
      [headline, body] = pick([
        [`${name} wins Offensive Player of the Year`, `${name} earns OPOY honors after a stellar offensive campaign.`],
        [`OPOY: ${name}`, `${name} is named the best offensive player in the league.`],
      ] as const);
      break;
    case 'DPOY':
      [headline, body] = pick([
        [`${name} wins Defensive Player of the Year`, `${name} dominates on defense to earn the DPOY award.`],
        [`DPOY: ${name}`, `${name} is named the league's top defensive player.`],
      ] as const);
      break;
    case 'OROY':
      [headline, body] = pick([
        [`${name} wins Offensive Rookie of the Year`, `In an impressive debut season, ${name} earns OROY honors.`],
        [`Rookie standout: ${name} wins OROY`, `${name} shines in year one, taking home Offensive Rookie of the Year.`],
      ] as const);
      break;
    case 'DROY':
      [headline, body] = pick([
        [`${name} wins Defensive Rookie of the Year`, `${name} makes an immediate impact, earning DROY.`],
        [`${name} named DROY`, `${name} earns Defensive Rookie of the Year after a strong debut.`],
      ] as const);
      break;
    case 'Coach_of_Year':
      [headline, body] = pick([
        [`${name} wins Coach of the Year`, `${name} earns Coach of the Year for leading his team to an outstanding season.`],
        [`Coach of the Year: ${name}`, `Voters recognize ${name} as the top coach in the league this year.`],
      ] as const);
      break;
    case 'Comeback_Player':
      [headline, body] = pick([
        [`${name} wins Comeback Player of the Year`, `After a down year, ${name} bounces back to earn Comeback Player of the Year.`],
        [`Comeback Player: ${name}`, `${name} overcomes adversity for a stellar rebound season, earning Comeback Player honors.`],
      ] as const);
      break;
    case 'AllPro1':
      [headline, body] = pick([
        [`${name} named First Team All-Pro`, `${name} earns a spot on the First Team All-Pro roster.`],
        [`All-Pro: ${name}`, `${name} is recognized as one of the best players in the league with a First Team nod.`],
      ] as const);
      break;
    case 'AllPro2':
      headline = `${name} earns Second Team All-Pro`;
      body     = `${name} is named to the Second Team All-Pro squad.`;
      break;
    case 'Champion':
      return null; // handled separately by newsForGame
    default:
      return null;
  }

  return item('award', headline, body, year, 0, tId, pId);
}

// ── FA signing ────────────────────────────────────────────────────────────────

export function newsForSigning(
  playerName: string, playerId: string,
  playerPos: string,
  teamName: string,  teamId: string,
  year: number, week: number,
): NewsItem {
  const [headline, body] = pick([
    [
      `${teamName} sign ${playerName}`,
      `${teamName} add ${playerName} (${playerPos}) from the free-agent market.`,
    ],
    [
      `${playerName} joins ${teamName}`,
      `Free agent ${playerName} (${playerPos}) agrees to a deal with ${teamName}.`,
    ],
    [
      `${teamName} land ${playerName}`,
      `${teamName} bolster their roster by signing ${playerName} (${playerPos}).`,
    ],
  ] as const);
  return item('signing', headline, body, year, week, [teamId], [playerId]);
}

// ── Trade ─────────────────────────────────────────────────────────────────────

export function newsForTrade(
  teamAName: string, teamAId: string,
  teamBName: string, teamBId: string,
  fromDesc: string, toDesc: string,
  year: number, week: number,
): NewsItem {
  const [headline, body] = pick([
    [
      `${teamAName} and ${teamBName} complete trade`,
      `${teamAName} send ${fromDesc} to ${teamBName} in exchange for ${toDesc}.`,
    ],
    [
      `Trade: ${teamAName} deals with ${teamBName}`,
      `${teamBName} acquire ${toDesc} from ${teamAName}, who get ${fromDesc} in return.`,
    ],
    [
      `${teamAName}–${teamBName} trade finalized`,
      `${teamAName} and ${teamBName} swap assets: ${fromDesc} for ${toDesc}.`,
    ],
  ] as const);
  return item('trade', headline, body, year, week, [teamAId, teamBId]);
}

// ── Retirement ────────────────────────────────────────────────────────────────

export function newsForRetirement(
  playerName: string, playerId: string,
  position: string,
  age: number,
  seasons: number,
  year: number,
): NewsItem {
  const career = seasons > 0 ? `${seasons} season${seasons !== 1 ? 's' : ''}` : 'a career';
  const [headline, body] = pick([
    [
      `${playerName} announces retirement`,
      `${playerName} (${position}) calls it a career after ${career} in the league at age ${age}.`,
    ],
    [
      `${playerName} retires`,
      `${position} ${playerName} hangs up his cleats after ${career}, retiring at age ${age}.`,
    ],
    [
      `End of an era: ${playerName} retires`,
      `After ${career} of professional football, ${playerName} (${position}) announces his retirement.`,
    ],
  ] as const);
  return item('retirement', headline, body, year, 0, [], [playerId]);
}
