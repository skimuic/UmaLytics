import type { PlayerProfileSummary, PlayerTopUmaSummary, PrematchPlayer } from '@umalytics/shared';

const API_ORIGIN = 'https://drafter-api.uma.guide';
const PROFILE_ORIGIN = 'https://drafter.uma.guide';
const UMA_LABEL_CACHE_TTL_MS = 60 * 60 * 1000;

interface ApiPlayerProfile {
  displayName?: string;
  discordUsername?: string;
  title?: string | null;
  supporter?: boolean;
}

interface ApiPlayerStats {
  umaEntries?: ApiUmaEntry[];
  summary?: {
    matchesIncluded?: number;
    totalPointsScored?: number;
    totalPodiumPlacements?: number;
    totalMvpMatches?: number;
  };
}

interface ApiUmaEntry {
  umaId?: string;
  matches?: number;
  wins?: number;
  losses?: number;
  pointsScored?: number;
  podiumPlacements?: number;
  mvpMatches?: number;
}

interface ApiSeason {
  id?: string;
  active?: boolean;
}

interface ApiLeaderboard {
  entries?: ApiLeaderboardEntry[];
}

interface ApiLeaderboardEntry {
  userId?: string;
  displayName?: string;
  rating?: number;
  rd?: number;
  wins?: number;
  losses?: number;
}

interface LeaderboardLookup {
  ranksByDiscordId: Map<string, ApiLeaderboardEntry & { rank: number }>;
}

interface UmaCard {
  cardId?: number | string;
  name?: string;
  charaName?: string;
  title?: string;
  cardTitle?: string;
}

let cachedUmaLabels:
  | {
      labelsById: Map<string, string>;
      fetchedAt: number;
    }
  | undefined;

export async function fetchPlayerProfileSummaries(
  players: PrematchPlayer[]
): Promise<Record<string, PlayerProfileSummary>> {
  const [leaderboard, umaLabels] = await Promise.all([
    fetchActiveLeaderboard(),
    fetchUmaLabels()
  ]);
  const uniquePlayers = uniqueByDiscordId(players);
  const summaries = await mapWithConcurrency(uniquePlayers, 3, (player) =>
    fetchPlayerProfileSummary(player, leaderboard, umaLabels)
  );

  return Object.fromEntries(summaries.map((summary) => [summary.discordId, summary]));
}

async function fetchPlayerProfileSummary(
  player: PrematchPlayer,
  leaderboard: LeaderboardLookup,
  umaLabels: Map<string, string>
): Promise<PlayerProfileSummary> {
  const profileUrl = `${PROFILE_ORIGIN}/players/${encodeURIComponent(player.discordId)}`;
  const leaderboardEntry = leaderboard.ranksByDiscordId.get(player.discordId);
  let profile: ApiPlayerProfile | undefined;
  let stats: ApiPlayerStats | undefined;
  let statsPrivate = false;
  let error: string | undefined;

  try {
    profile = await fetchJson<ApiPlayerProfile>(
      `/api/stats/players/${encodeURIComponent(player.discordId)}/profile`
    );
  } catch (caught) {
    error = getErrorMessage(caught);
  }

  try {
    stats = await fetchJson<ApiPlayerStats>(
      `/api/stats/players/${encodeURIComponent(player.discordId)}/stats?mode=ranked`
    );
  } catch (caught) {
    if (caught instanceof ApiRequestError && caught.status === 403) {
      statsPrivate = true;
    } else {
      error = error ?? getErrorMessage(caught);
    }
  }

  const fallbackRecord = getRecordFromUmaEntries(stats?.umaEntries);
  const wins = leaderboardEntry?.wins ?? fallbackRecord.wins ?? null;
  const losses = leaderboardEntry?.losses ?? fallbackRecord.losses ?? null;
  const matches = stats?.summary?.matchesIncluded ?? addNullable(wins, losses);
  const points = stats?.summary?.totalPointsScored;

  return {
    discordId: player.discordId,
    displayName: profile?.displayName ?? leaderboardEntry?.displayName ?? player.displayName,
    discordUsername: profile?.discordUsername,
    title: profile?.title ?? null,
    supporter: profile?.supporter,
    rank: leaderboardEntry?.rank ?? null,
    rating: leaderboardEntry?.rating ?? player.displayRatingSnapshot ?? player.ratingSnapshot ?? null,
    ratingDeviation: leaderboardEntry?.rd ?? player.displayRdSnapshot ?? player.rdSnapshot ?? null,
    conservativeRating:
      leaderboardEntry?.rating !== undefined && leaderboardEntry.rd !== undefined
        ? Math.round(leaderboardEntry.rating - leaderboardEntry.rd)
        : null,
    wins,
    losses,
    winRate: wins !== null && losses !== null && wins + losses > 0 ? wins / (wins + losses) : null,
    matches,
    points: points ?? null,
    pointsPerGame: points !== undefined && matches !== null && matches > 0 ? points / matches : null,
    podiums: stats?.summary?.totalPodiumPlacements ?? null,
    mvpMatches: stats?.summary?.totalMvpMatches ?? null,
    topUmas: getTopPlayedUmas(stats?.umaEntries, umaLabels),
    statsPrivate,
    fetchedAt: Date.now(),
    profileUrl,
    error
  };
}

async function fetchUmaLabels(): Promise<Map<string, string>> {
  const now = Date.now();

  if (cachedUmaLabels !== undefined && now - cachedUmaLabels.fetchedAt < UMA_LABEL_CACHE_TTL_MS) {
    return cachedUmaLabels.labelsById;
  }

  try {
    const cardsAssetUrl = await fetchCardsAssetUrl();
    const script = await fetchText(cardsAssetUrl);
    const cards = parseUmaCards(script);
    const labelsById = new Map(
      cards
        .map((card) => {
          const id = card.cardId;

          if (id === undefined) {
            return null;
          }

          return [String(id), formatUmaLabel(card)] as const;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null)
    );

    cachedUmaLabels = {
      labelsById,
      fetchedAt: now
    };

    return labelsById;
  } catch (caught) {
    console.warn('[UmaLytics] Unable to load Uma labels:', caught);
    return cachedUmaLabels?.labelsById ?? new Map();
  }
}

async function fetchCardsAssetUrl(): Promise<URL> {
  const html = await fetchText(new URL('/', PROFILE_ORIGIN));
  const match = /["'](\/assets\/cards-[^"']+\.js)["']/.exec(html);

  if (match?.[1] === undefined) {
    throw new Error('Unable to find Uma card labels asset.');
  }

  return new URL(match[1], PROFILE_ORIGIN);
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url, {
    cache: 'force-cache',
    credentials: 'omit'
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, `Request failed: ${response.status}`);
  }

  return await response.text();
}

function parseUmaCards(script: string): UmaCard[] {
  const match = /JSON\.parse\(`([\s\S]*?)`\)/.exec(script);

  if (match?.[1] === undefined) {
    return [];
  }

  return JSON.parse(match[1]) as UmaCard[];
}

function formatUmaLabel(card: UmaCard): string {
  const name = card.name ?? card.charaName ?? String(card.cardId);
  const title = card.title ?? card.cardTitle;
  const cleanTitle = title?.trim().replace(/^\[/, '').replace(/\]$/, '');

  return cleanTitle === undefined || cleanTitle.length === 0 ? name : `${name} (${cleanTitle})`;
}

async function fetchActiveLeaderboard(): Promise<LeaderboardLookup> {
  const seasons = await fetchJson<ApiSeason[]>('/api/seasons');
  const activeSeason = seasons.find((season) => season.active === true && season.id !== undefined);

  if (activeSeason?.id === undefined) {
    return { ranksByDiscordId: new Map() };
  }

  const leaderboard = await fetchJson<ApiLeaderboard>(
    `/api/leaderboard?season=${encodeURIComponent(activeSeason.id)}`
  );
  const entries = leaderboard.entries ?? [];

  return {
    ranksByDiscordId: new Map(
      entries
        .map((entry, index) =>
          entry.userId === undefined ? null : [entry.userId, { ...entry, rank: index + 1 }] as const
        )
        .filter((entry): entry is readonly [string, ApiLeaderboardEntry & { rank: number }] =>
          entry !== null
        )
    )
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, API_ORIGIN), {
    cache: 'no-store',
    credentials: 'omit'
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function uniqueByDiscordId(players: PrematchPlayer[]): PrematchPlayer[] {
  const seen = new Set<string>();
  const uniquePlayers: PrematchPlayer[] = [];

  for (const player of players) {
    if (!isDiscordSnowflake(player.discordId)) {
      continue;
    }

    if (seen.has(player.discordId)) {
      continue;
    }

    seen.add(player.discordId);
    uniquePlayers.push(player);
  }

  return uniquePlayers;
}

function isDiscordSnowflake(value: string): boolean {
  return /^\d{16,20}$/.test(value);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];

      if (item !== undefined) {
        results[currentIndex] = await mapper(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

function getRecordFromUmaEntries(
  umaEntries: ApiUmaEntry[] | undefined
): { wins: number | null; losses: number | null } {
  if (umaEntries === undefined) {
    return { wins: null, losses: null };
  }

  return umaEntries.reduce<{ wins: number; losses: number }>(
    (record, entry) => ({
      wins: record.wins + (entry.wins ?? 0),
      losses: record.losses + (entry.losses ?? 0)
    }),
    { wins: 0, losses: 0 }
  );
}

function getTopPlayedUmas(
  umaEntries: ApiUmaEntry[] | undefined,
  umaLabels: Map<string, string>
): PlayerTopUmaSummary[] {
  if (umaEntries === undefined) {
    return [];
  }

  return [...umaEntries]
    .filter((entry) => entry.umaId !== undefined && (entry.matches ?? 0) > 0)
    .sort((left, right) => (right.matches ?? 0) - (left.matches ?? 0))
    .slice(0, 3)
    .map((entry) => {
      const umaId = entry.umaId ?? 'unknown';
      const matches = entry.matches ?? 0;
      const wins = entry.wins ?? 0;
      const losses = entry.losses ?? 0;
      const points = entry.pointsScored ?? 0;

      return {
        umaId,
        name: umaLabels.get(umaId) ?? umaId,
        matches,
        wins,
        losses,
        winRate: wins + losses > 0 ? wins / (wins + losses) : null,
        points,
        pointsPerGame: matches > 0 ? points / matches : null,
        podiums: entry.podiumPlacements ?? 0,
        mvpMatches: entry.mvpMatches ?? 0
      };
    });
}

function addNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function getErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Unable to load profile.';
}

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}
