import type { MatchCode, PrematchPlayer, PrematchRoster } from '@umalytics/shared';

export function normalizePrematchRosterFromPlayers(
  value: unknown,
  matchCode?: MatchCode
): PrematchRoster | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const players = value
    .map(normalizePrematchPlayer)
    .filter((player): player is PrematchPlayer => player !== null);
  const dedupedPlayers = dedupePrematchPlayers(players);

  return {
    ...(matchCode === undefined ? {} : { matchCode }),
    players: dedupedPlayers
  };
}

export function normalizePrematchPlayer(value: unknown): PrematchPlayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const { userId, discordId, displayName, partyId, partyRatingBonus } = value;

  if (
    typeof userId !== 'string' ||
    typeof discordId !== 'string' ||
    typeof displayName !== 'string' ||
    (typeof partyId !== 'string' && partyId !== null) ||
    typeof partyRatingBonus !== 'number'
  ) {
    return null;
  }

  return {
    userId,
    discordId,
    displayName,
    partyId,
    partyRatingBonus
  };
}

function dedupePrematchPlayers(players: PrematchPlayer[]): PrematchPlayer[] {
  const seenPlayerIds = new Set<string>();
  const dedupedPlayers: PrematchPlayer[] = [];

  for (const player of players) {
    const stableKey = `${player.discordId}:${player.userId}`;

    if (seenPlayerIds.has(stableKey)) {
      continue;
    }

    seenPlayerIds.add(stableKey);
    dedupedPlayers.push(player);
  }

  return dedupedPlayers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
