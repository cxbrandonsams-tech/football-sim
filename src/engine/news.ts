import { type League } from '../models/League';
import { type Game } from '../models/Game';
import { type NewsItem, type NewsType, type NewsMention } from '../models/News';
import { type AwardRecord } from '../models/History';

// ── Utility ───────────────────────────────────────────────────────────────────

const MAX_NEWS = 500;

function rnd<T>(arr: readonly T[]): T {
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
  mentions?: NewsMention[],
): NewsItem {
  return {
    id: makeId(type, year, week),
    type, headline, body, year, week,
    createdAt: Date.now(),
    teamIds, playerIds,
    ...(mentions && mentions.length > 0 ? { mentions } : {}),
  };
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
    case 'divisional':   return 'Divisional';
    case 'conference':   return 'Conference Championship';
    case 'championship': return 'League Championship';
    default:             return round;
  }
}

// ── Game result ───────────────────────────────────────────────────────────────

/** Compute win percentage from a record; returns 0.5 if fewer than 4 games played. */
function winPct(record: { w: number; l: number; t: number } | undefined): number {
  if (!record) return 0.5;
  const total = record.w + record.l + record.t;
  if (total < 4) return 0.5;
  return (record.w + 0.5 * record.t) / total;
}

/**
 * Generate a news item for a completed game.
 * If `teamRecords` is provided and the result qualifies as an upset
 * (underdog's win% ≤ 0.35, favorite's win% ≥ 0.65), the item type is 'upset'.
 */
export function newsForGame(
  game: Game,
  year: number,
  isPlayoff = false,
  round?: string,
  teamRecords?: Record<string, { w: number; l: number; t: number }>,
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
    const [headline, body] = rnd(templates);
    return item('championship', headline, body, year, 0, [winnerTeamId, loserTeamId]);
  }

  if (isPlayoff && round) {
    const label = roundLabel(round);
    const templates = [
      [`${winner} advance past ${loser}`, `${winner} defeat ${loser} ${ws}–${ls} in the ${label}.`],
      [`${loser} eliminated`, `${winner} end ${loser}'s season with a ${ws}–${ls} win in the ${label}.`],
      [`${winner} move on`, `${winner} advance in the ${label}, beating ${loser} ${ws}–${ls}.`],
    ] as const;
    const [headline, body] = rnd(templates);
    return item('playoff_result', headline, body, year, 0, [winnerTeamId, loserTeamId]);
  }

  // Detect upset for regular-season games
  if (teamRecords) {
    const winnerPct = winPct(teamRecords[winnerTeamId]);
    const loserPct  = winPct(teamRecords[loserTeamId]);
    const winnerTotal = (teamRecords[winnerTeamId]?.w ?? 0) + (teamRecords[winnerTeamId]?.l ?? 0);
    if (winnerTotal >= 4 && winnerPct <= 0.35 && loserPct >= 0.65) {
      const templates = [
        [`Upset! ${winner} stun ${loser}`, `${winner} pull off the upset, defeating heavily favored ${loser} ${ws}–${ls}.`],
        [`${loser} fall to ${winner} in shocker`, `In a surprise result, ${winner} knock off ${loser} ${ws}–${ls}.`],
        [`${winner} stun the league`, `Nobody saw this coming: ${winner} beat ${loser} ${ws}–${ls} in a stunning upset.`],
      ] as const;
      const [headline, body] = rnd(templates);
      return item('upset', headline, body, year, game.week, [winnerTeamId, loserTeamId]);
    }
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
    [headline, body] = rnd(templates);
  } else if (margin >= 21) {
    const templates = [
      [`${winner} dominate ${loser}`, `It was never close: ${winner} rout ${loser} ${ws}–${ls}.`],
      [`${winner} roll over ${loser}`, `${winner} put up ${ws} points in a dominant ${ws}–${ls} win.`],
      [`Blowout: ${winner} crush ${loser}`, `${loser} fall apart as ${winner} win ${ws}–${ls}.`],
    ] as const;
    [headline, body] = rnd(templates);
  } else {
    const templates = [
      [`${winner} defeat ${loser}`, `${winner} win ${ws}–${ls} over ${loser} in week ${game.week} action.`],
      [`${winner} top ${loser}`, `${winner} take care of business, beating ${loser} ${ws}–${ls}.`],
      [`${loser} fall to ${winner}`, `${winner} get the win, ${ws}–${ls}, against ${loser}.`],
    ] as const;
    [headline, body] = rnd(templates);
  }

  return item('game_result', headline, body, year, game.week, [winnerTeamId, loserTeamId]);
}

// ── Award ─────────────────────────────────────────────────────────────────────

export function newsForAward(award: AwardRecord, year: number): NewsItem | null {
  const name  = award.playerName ?? award.coachName ?? 'Unknown';
  const pId   = award.playerId  ? [award.playerId]  : [];
  const tId   = award.teamId    ? [award.teamId]     : [];
  const mentions: NewsMention[] = [
    ...(award.playerId  ? [{ id: award.playerId, name, entityType: 'player' as const }] : []),
    ...(award.teamId && award.teamName ? [{ id: award.teamId, name: award.teamName, entityType: 'team' as const }] : []),
  ];

  let headline: string;
  let body:     string;

  switch (award.type) {
    case 'MVP':
      [headline, body] = rnd([
        [`${name} wins MVP`, `${name} takes home the MVP award after a dominant regular season.`],
        [`MVP: ${name}`, `The league votes ${name} as the most valuable player of the year.`],
        [`${name} named league MVP`, `${name} is the MVP after putting together an outstanding season.`],
      ] as const);
      break;
    case 'OPOY':
      [headline, body] = rnd([
        [`${name} wins Offensive Player of the Year`, `${name} earns OPOY honors after a stellar offensive campaign.`],
        [`OPOY: ${name}`, `${name} is named the best offensive player in the league.`],
      ] as const);
      break;
    case 'DPOY':
      [headline, body] = rnd([
        [`${name} wins Defensive Player of the Year`, `${name} dominates on defense to earn the DPOY award.`],
        [`DPOY: ${name}`, `${name} is named the league's top defensive player.`],
      ] as const);
      break;
    case 'OROY':
      [headline, body] = rnd([
        [`${name} wins Offensive Rookie of the Year`, `In an impressive debut season, ${name} earns OROY honors.`],
        [`Rookie standout: ${name} wins OROY`, `${name} shines in year one, taking home Offensive Rookie of the Year.`],
      ] as const);
      break;
    case 'DROY':
      [headline, body] = rnd([
        [`${name} wins Defensive Rookie of the Year`, `${name} makes an immediate impact, earning DROY.`],
        [`${name} named DROY`, `${name} earns Defensive Rookie of the Year after a strong debut.`],
      ] as const);
      break;
    case 'Coach_of_Year':
      [headline, body] = rnd([
        [`${name} wins Coach of the Year`, `${name} earns Coach of the Year for leading his team to an outstanding season.`],
        [`Coach of the Year: ${name}`, `Voters recognize ${name} as the top coach in the league this year.`],
      ] as const);
      break;
    case 'Comeback_Player':
      [headline, body] = rnd([
        [`${name} wins Comeback Player of the Year`, `After a down year, ${name} bounces back to earn Comeback Player of the Year.`],
        [`Comeback Player: ${name}`, `${name} overcomes adversity for a stellar rebound season, earning Comeback Player honors.`],
      ] as const);
      break;
    case 'AllPro1':
      [headline, body] = rnd([
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

  return item('award', headline, body, year, 0, tId, pId, mentions);
}

// ── FA signing ────────────────────────────────────────────────────────────────

export function newsForSigning(
  playerName: string, playerId: string,
  playerPos: string,
  teamName: string,  teamId: string,
  year: number, week: number,
): NewsItem {
  const [headline, body] = rnd([
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
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('signing', headline, body, year, week, [teamId], [playerId], mentions);
}

// ── Trade ─────────────────────────────────────────────────────────────────────

export function newsForTrade(
  teamAName: string, teamAId: string,
  teamBName: string, teamBId: string,
  fromDesc: string, toDesc: string,
  year: number, week: number,
): NewsItem {
  const [headline, body] = rnd([
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
  const mentions: NewsMention[] = [
    { id: teamAId, name: teamAName, entityType: 'team' },
    { id: teamBId, name: teamBName, entityType: 'team' },
  ];
  return item('trade', headline, body, year, week, [teamAId, teamBId], [], mentions);
}

// ── Draft pick ────────────────────────────────────────────────────────────────

export function newsForDraftPick(
  playerName: string, playerId: string,
  position: string,
  teamName: string, teamId: string,
  round: number, overallPick: number,
  year: number,
): NewsItem {
  const ordinal = round === 1 ? '1st' : round === 2 ? '2nd' : `${round}rd`;
  const [headline, body] = rnd([
    [
      `${teamName} draft ${playerName}`,
      `With pick #${overallPick}, ${teamName} select ${playerName} (${position}) in round ${round}.`,
    ],
    [
      `${playerName} (${position}) goes to ${teamName}`,
      `${teamName} add ${playerName} with their ${ordinal}-round selection, pick #${overallPick}.`,
    ],
    [
      `${ordinal}-round pick: ${playerName}`,
      `${teamName} take ${playerName} (${position}) at pick #${overallPick} in the ${year} draft.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('draft_pick', headline, body, year, 0, [teamId], [playerId], mentions);
}

// ── Big performance ───────────────────────────────────────────────────────────

export function newsForBigPerformance(
  playerName: string, playerId: string,
  position: string,
  teamName: string, teamId: string,
  statLine: string,
  year: number, week: number,
): NewsItem {
  const [headline, body] = rnd([
    [
      `${playerName} goes off for ${statLine}`,
      `${teamName}'s ${playerName} (${position}) put up a monster line in Week ${week}: ${statLine}.`,
    ],
    [
      `Big game: ${playerName} erupts`,
      `${playerName} (${position}) dominated in Week ${week} with ${statLine} for ${teamName}.`,
    ],
    [
      `${playerName} torches the defense`,
      `${teamName}'s ${playerName} posted ${statLine} in a standout Week ${week} performance.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('big_performance', headline, body, year, week, [teamId], [playerId], mentions);
}

// ── Weekly recap ──────────────────────────────────────────────────────────

export function newsForWeeklyRecap(
  week: number,
  year: number,
  topPerformances: { name: string; playerId: string; teamName: string; teamId: string; line: string }[],
  upsetSummary:    string | null,
  standoutTeam:    { name: string; id: string } | null,
): NewsItem {
  const perf   = topPerformances.slice(0, 2);
  const perfStr = perf.length > 0
    ? perf.map(p => `${p.name} (${p.line})`).join(' and ')
    : '';

  let body = `Week ${week} is in the books.`;
  if (perfStr) body += ` Standout performances from ${perfStr}.`;
  if (upsetSummary) body += ` ${upsetSummary}`;
  if (standoutTeam) body += ` ${standoutTeam.name} are among the teams to watch.`;

  const teamIds   = [
    ...new Set([
      ...(standoutTeam ? [standoutTeam.id] : []),
      ...perf.map(p => p.teamId),
    ]),
  ];
  const playerIds = perf.map(p => p.playerId);
  const mentions: NewsMention[] = [
    ...perf.map(p => ({ id: p.playerId, name: p.name,         entityType: 'player' as const })),
    ...(standoutTeam ? [{ id: standoutTeam.id, name: standoutTeam.name, entityType: 'team' as const }] : []),
  ];

  return item('weekly_recap', `Week ${week} Recap`, body, year, week, teamIds, playerIds, mentions);
}

// ── Milestone ─────────────────────────────────────────────────────────────

const MILESTONE_STAT_LABEL: Record<string, string> = {
  passingYards:        'passing yards',
  passingTDs:          'passing touchdowns',
  rushingYards:        'rushing yards',
  rushingTDs:          'rushing touchdowns',
  receivingYards:      'receiving yards',
  receivingTDs:        'receiving touchdowns',
  sacks:               'sacks',
  interceptionsCaught: 'interceptions',
};

export function newsForMilestone(
  playerName: string, playerId: string,
  position: string,
  teamName: string, teamId: string,
  statKey: string,
  threshold: number,
  year: number, week: number,
): NewsItem {
  const statLabel = MILESTONE_STAT_LABEL[statKey] ?? statKey;
  const threshStr = threshold.toLocaleString();
  const [headline, body] = rnd([
    [
      `${playerName} reaches ${threshStr} ${statLabel}`,
      `${teamName}'s ${playerName} (${position}) hits the ${threshStr} ${statLabel} mark in Week ${week}.`,
    ],
    [
      `Milestone: ${playerName} surpasses ${threshStr} ${statLabel}`,
      `${playerName} crosses the ${threshStr} ${statLabel} threshold this season for ${teamName}.`,
    ],
    [
      `${playerName} cracks ${threshStr} ${statLabel}`,
      `Add it to the stat sheet — ${playerName} (${position}) now has ${threshStr}+ ${statLabel} this year.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('milestone', headline, body, year, week, [teamId], [playerId], mentions);
}

// ── Stat race ─────────────────────────────────────────────────────────────

export function newsForStatRace(
  leaderName: string, leaderId: string,
  leaderTeam: string, leaderTeamId: string,
  statKey: string,
  leaderValue: number,
  chaserName: string | null,
  chaserValue: number | null,
  year: number, week: number,
): NewsItem {
  const statLabel = MILESTONE_STAT_LABEL[statKey] ?? statKey;
  const valStr    = leaderValue.toLocaleString();
  let headline: string;
  let body: string;

  if (chaserName && chaserValue !== null) {
    const gap = leaderValue - chaserValue;
    headline = `${leaderName} leads the ${statLabel} race`;
    body = `${leaderName} (${leaderTeam}) tops the league with ${valStr} ${statLabel}, holding a ${gap}-unit lead over ${chaserName}.`;
  } else {
    headline = `${leaderName} pacing the league in ${statLabel}`;
    body = `${leaderName} (${leaderTeam}) leads all players with ${valStr} ${statLabel} through Week ${week}.`;
  }

  const mentions: NewsMention[] = [
    { id: leaderId,     name: leaderName, entityType: 'player' },
    { id: leaderTeamId, name: leaderTeam, entityType: 'team'   },
  ];
  return item('stat_race', headline, body, year, week, [leaderTeamId], [leaderId], mentions);
}

// ── Streak ────────────────────────────────────────────────────────────────

export function newsForStreak(
  teamName: string, teamId: string,
  streakType: 'win' | 'loss',
  length: number,
  year: number, week: number,
): NewsItem {
  const [headline, body] = streakType === 'win'
    ? rnd([
        [
          `${teamName} win ${length} straight`,
          `${teamName} are rolling, rattling off ${length} consecutive victories.`,
        ],
        [
          `${teamName} on a ${length}-game win streak`,
          `${teamName} have now won ${length} in a row and continue to build momentum.`,
        ],
        [
          `${teamName} unstoppable — ${length} straight wins`,
          `${teamName}'s winning streak reaches ${length} games after another victory.`,
        ],
      ] as const)
    : rnd([
        [
          `${teamName} drop ${length} straight`,
          `${teamName} have now lost ${length} consecutive games and are searching for answers.`,
        ],
        [
          `${teamName} on ${length}-game losing skid`,
          `The losses keep piling up for ${teamName}, who have dropped ${length} in a row.`,
        ],
        [
          `Tough stretch: ${teamName} lose ${length} straight`,
          `${teamName} fall again, extending their losing streak to ${length} games.`,
        ],
      ] as const);
  const mentions: NewsMention[] = [{ id: teamId, name: teamName, entityType: 'team' }];
  return item('streak', headline, body, year, week, [teamId], [], mentions);
}

// ── Hall of Fame induction ────────────────────────────────────────────────────

export function newsForHofInduction(
  playerName: string, playerId: string,
  position:   string,
  year:       number,
  championships: number,
): NewsItem {
  const champStr = championships > 0
    ? `, ${championships} championship${championships !== 1 ? 's' : ''}`
    : '';
  const [headline, body] = rnd([
    [
      `${playerName} inducted into the Hall of Fame`,
      `${playerName} (${position}) earns a place in the Hall of Fame after a legendary career${champStr}.`,
    ],
    [
      `Hall of Fame honors ${playerName}`,
      `${playerName} (${position}) is enshrined in the Hall of Fame, cementing a storied legacy${champStr}.`,
    ],
    [
      `${playerName} enters the Hall of Fame`,
      `One of the greats — ${playerName} (${position}) joins the Hall of Fame class of ${year}${champStr}.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [{ id: playerId, name: playerName, entityType: 'player' }];
  return item('hall_of_fame', headline, body, year, 0, [], [playerId], mentions);
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
  const [headline, body] = rnd([
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
  const mentions: NewsMention[] = [{ id: playerId, name: playerName, entityType: 'player' }];
  return item('retirement', headline, body, year, 0, [], [playerId], mentions);
}

// ── Coach change news ─────────────────────────────────────────────────────────

export function newsForCoachFired(
  coachName:  string,
  role:       string,
  teamName:   string,
  teamId:     string,
  year:       number,
): NewsItem {
  const roleLabel = role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';
  const [headline, body] = rnd([
    [
      `${teamName} parts ways with ${roleLabel} ${coachName}`,
      `${teamName} has announced the dismissal of ${roleLabel} ${coachName} following the season.`,
    ],
    [
      `${coachName} fired as ${teamName} ${roleLabel}`,
      `The ${teamName} made a coaching change, relieving ${coachName} of his duties as ${roleLabel}.`,
    ],
  ] as const);
  return item('coach_change', headline, body, year, 0, [teamId]);
}

export function newsForCoachHired(
  coachName:  string,
  role:       string,
  teamName:   string,
  teamId:     string,
  year:       number,
): NewsItem {
  const roleLabel = role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';
  const [headline, body] = rnd([
    [
      `${teamName} hires ${coachName} as new ${roleLabel}`,
      `${teamName} has agreed to terms with ${coachName}, who will serve as ${roleLabel}.`,
    ],
    [
      `${coachName} named ${roleLabel} of the ${teamName}`,
      `The ${teamName} have found their new ${roleLabel} in ${coachName}.`,
    ],
  ] as const);
  return item('coach_change', headline, body, year, 0, [teamId]);
}

export function newsForCoordPromoted(
  coachName: string,
  role:      'OC' | 'DC',
  teamName:  string,
  teamId:    string,
  year:      number,
): NewsItem {
  const roleLabel = role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';
  const headline = `${teamName} promotes ${coachName} to ${roleLabel}`;
  const body     = `${teamName} has elevated ${coachName} from within the organization to fill the ${roleLabel} vacancy.`;
  return item('coach_change', headline, body, year, 0, [teamId]);
}

// ── Ring of Honor induction ────────────────────────────────────────────────────

export function newsForRingOfHonorInduction(
  playerName: string, playerId: string,
  position:   string,
  teamId:     string,
  teamName:   string,
  year:       number,
  championships: number,
): NewsItem {
  const champStr = championships > 0
    ? `, including ${championships} championship${championships !== 1 ? 's' : ''} with the franchise`
    : '';
  const [headline, body] = rnd([
    [
      `${playerName} inducted into the ${teamName} Ring of Honor`,
      `${playerName} (${position}) is honored by ${teamName} for a legendary contribution to the franchise${champStr}.`,
    ],
    [
      `${teamName} inducts ${playerName} into Ring of Honor`,
      `${teamName} immortalizes ${playerName} (${position}) as a franchise icon, recognizing an outstanding career${champStr}.`,
    ],
    [
      `${playerName} joins the ${teamName} Ring of Honor`,
      `A franchise legend — ${playerName} (${position}) is enshrined in the ${teamName} Ring of Honor${champStr}.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('ring_of_honor', headline, body, year, 0, [teamId], [playerId], mentions);
}

// ── GM milestone ──────────────────────────────────────────────────────────────

export function newsForGmMilestone(
  label:       string,
  description: string,
  year:        number,
): NewsItem {
  const [headline, body] = rnd([
    [
      `GM Achievement Unlocked: ${label}`,
      `You've earned the "${label}" achievement. ${description}`,
    ],
    [
      `Milestone reached: ${label}`,
      `Your GM career hits a new milestone — ${label}. ${description}`,
    ],
  ] as const);
  return item('gm_milestone', headline, body, year, 0);
}

// ── Retired jersey ────────────────────────────────────────────────────────────

export function newsForJerseyRetirement(
  playerName: string, playerId: string,
  position:   string,
  teamId:     string,
  teamName:   string,
  year:       number,
): NewsItem {
  const [headline, body] = rnd([
    [
      `${teamName} retires ${playerName}'s jersey`,
      `${teamName} honors ${playerName} (${position}) by retiring his jersey — the ultimate tribute to a franchise legend.`,
    ],
    [
      `${playerName}'s number retired by ${teamName}`,
      `${playerName} (${position}) joins an elite group of franchise icons as ${teamName} permanently retires his number.`,
    ],
  ] as const);
  const mentions: NewsMention[] = [
    { id: playerId, name: playerName, entityType: 'player' },
    { id: teamId,   name: teamName,   entityType: 'team'   },
  ];
  return item('retired_jersey', headline, body, year, 0, [teamId], [playerId], mentions);
}
