import { browser } from 'wxt/browser';
import type { PlayerProfileSummary, PrematchRoster } from '@umalytics/shared';
import { isUmaLyticsMessage } from '../utils/messaging';
import { fetchPlayerProfileSummaries } from '../utils/playerProfileApi';
import {
  getPlayerProfileSummaries,
  setPlayerProfileSummaries
} from '../utils/profileStorage';
import { getLatestPrematchRoster, setLatestPrematchRoster } from '../utils/rosterStorage';

const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;
const REQUIRED_BEST_UMA_SCORE_VERSION = 2;

let enrichmentRunId = 0;

export default defineBackground(() => {
  void getLatestPrematchRoster().then((roster) => {
    if (roster !== undefined && roster.players.length > 0) {
      void enrichRosterProfiles(roster);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isUmaLyticsMessage(message)) {
      return undefined;
    }

    if (message.type === 'prematch-roster-detected') {
      return handlePrematchRosterDetected(message.roster);
    }

    if (message.type === 'profile-refresh-requested') {
      return handleProfileRefreshRequested(message.roster);
    }

    return undefined;
  });
});

async function handlePrematchRosterDetected(roster: PrematchRoster): Promise<void> {
  console.log('[UmaLytics] Roster detected:', roster);
  await setLatestPrematchRoster(roster);
  await enrichRosterProfiles(roster);
}

async function handleProfileRefreshRequested(roster: PrematchRoster): Promise<void> {
  console.log('[UmaLytics] Profile refresh requested:', roster.matchCode);
  await enrichRosterProfiles(roster, { forceRefresh: true });
}

async function enrichRosterProfiles(
  roster: PrematchRoster,
  options: { forceRefresh?: boolean } = {}
): Promise<void> {
  const runId = ++enrichmentRunId;
  const now = Date.now();
  const cachedSnapshot = await getPlayerProfileSummaries();
  const cachedProfiles = cachedSnapshot?.profiles ?? {};
  const rosterDiscordIds = [...new Set(roster.players.map((player) => player.discordId))];
  const lookupDiscordIds = rosterDiscordIds.filter(isDiscordSnowflake);
  const freshProfiles = getFreshProfiles(cachedProfiles, rosterDiscordIds, now);
  const retainedProfiles = options.forceRefresh === true
    ? getRetainedProfiles(cachedProfiles, freshProfiles, rosterDiscordIds)
    : freshProfiles;
  const missingDiscordIds = lookupDiscordIds.filter(
    (discordId) => options.forceRefresh === true || freshProfiles[discordId] === undefined
  );

  await setPlayerProfileSummaries({
    matchCode: roster.matchCode,
    profiles: retainedProfiles,
    loadingDiscordIds: missingDiscordIds,
    updatedAt: now
  });

  if (missingDiscordIds.length === 0) {
    return;
  }

  try {
    const fetchedProfiles = await fetchPlayerProfileSummaries(
      roster.players.filter((player) => missingDiscordIds.includes(player.discordId))
    );

    if (runId !== enrichmentRunId) {
      return;
    }

    await setPlayerProfileSummaries({
      matchCode: roster.matchCode,
      profiles: {
        ...retainedProfiles,
        ...fetchedProfiles
      },
      loadingDiscordIds: [],
      updatedAt: Date.now()
    });
  } catch (caught) {
    if (runId !== enrichmentRunId) {
      return;
    }

    console.warn('[UmaLytics] Profile scouting failed:', caught);
    await setPlayerProfileSummaries({
      matchCode: roster.matchCode,
      profiles: retainedProfiles,
      loadingDiscordIds: [],
      updatedAt: Date.now()
    });
  }
}

function getRetainedProfiles(
  cachedProfiles: Record<string, PlayerProfileSummary>,
  freshProfiles: Record<string, PlayerProfileSummary>,
  discordIds: string[]
): Record<string, PlayerProfileSummary> {
  return Object.fromEntries(
    discordIds
      .map((discordId) => [discordId, cachedProfiles[discordId] ?? freshProfiles[discordId]] as const)
      .filter((entry): entry is readonly [string, PlayerProfileSummary] => entry[1] !== undefined)
  );
}

function isDiscordSnowflake(value: string): boolean {
  return /^\d{16,20}$/.test(value);
}

function getFreshProfiles(
  cachedProfiles: Record<string, PlayerProfileSummary>,
  discordIds: string[],
  now: number
): Record<string, PlayerProfileSummary> {
  return Object.fromEntries(
    discordIds
      .map((discordId) => [discordId, cachedProfiles[discordId]] as const)
      .filter((entry): entry is readonly [string, PlayerProfileSummary] => {
        const profile = entry[1];

        return (
          profile !== undefined &&
          now - profile.fetchedAt < PROFILE_CACHE_TTL_MS &&
          hasResolvedTopUmaLabels(profile) &&
          profile.bestUmaScoreVersion === REQUIRED_BEST_UMA_SCORE_VERSION
        );
      })
  );
}

function hasResolvedTopUmaLabels(profile: PlayerProfileSummary): boolean {
  const topUmas = profile.topUmas;

  if (topUmas === undefined || topUmas.length === 0) {
    return true;
  }

  return topUmas.every((uma) => uma.name !== uma.umaId);
}
