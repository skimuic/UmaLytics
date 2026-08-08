import type { MatchCode, PrematchPlayer, PrematchRoster, PrematchTeam, TeamId } from '@umalytics/shared';

const TEAM_HEADINGS: Record<string, TeamId> = {
  'Team 1': 'team1',
  'Team 2': 'team2'
};

const PLAYER_ROLES = new Set(['Player', 'Captain']);

export function extractPrematchRosterFromRoomDom(document: Document): PrematchRoster | null {
  const roomCode = normalizeText(
    document.querySelector<HTMLButtonElement>('button[title="Copy room code"]')?.textContent
  );

  if (roomCode === undefined) {
    return null;
  }

  const teams = findTeamSections(document).map((section) => extractTeam(section));
  const players = teams.flatMap((team) => team.players);

  if (players.length === 0) {
    return null;
  }

  return {
    matchCode: roomCode as MatchCode,
    phase: 'room-lobby',
    players,
    teams: Object.fromEntries(teams.map((team) => [team.id, team])) as Record<TeamId, PrematchTeam>
  };
}

function findTeamSections(document: Document): Array<{ id: TeamId; element: HTMLElement }> {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>('h2'))
    .map((heading) => {
      const label = normalizeText(heading.textContent);
      const id = label === undefined ? undefined : TEAM_HEADINGS[label];
      const element = heading.closest<HTMLElement>('.surface-3d');

      return id === undefined || element === null ? null : { id, element };
    })
    .filter((section): section is { id: TeamId; element: HTMLElement } => section !== null);
}

function extractTeam(section: { id: TeamId; element: HTMLElement }): PrematchTeam {
  const players = findPlayerRows(section.element).map((row, index) =>
    extractPlayer(row, section.id, index)
  );

  return {
    id: section.id,
    name: section.id === 'team1' ? 'Team 1' : 'Team 2',
    players
  };
}

function findPlayerRows(teamElement: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const rows: HTMLElement[] = [];

  for (const badge of Array.from(teamElement.querySelectorAll<HTMLElement>('span'))) {
    const role = normalizeText(badge.textContent);

    if (role === undefined || !PLAYER_ROLES.has(role)) {
      continue;
    }

    const row = findClosestRow(badge);

    if (row === null || seen.has(row)) {
      continue;
    }

    seen.add(row);
    rows.push(row);
  }

  return rows;
}

function findClosestRow(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;

  while (current !== null) {
    if (current.tagName === 'DIV' && current.querySelector('p') !== null) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function extractPlayer(row: HTMLElement, team: TeamId, index: number): PrematchPlayer {
  const image = row.querySelector<HTMLImageElement>('img[alt]');
  const displayName = normalizeText(image?.alt) ?? readDisplayName(row) ?? `Unknown ${index + 1}`;
  const role = readRole(row);
  const avatarUrl = image?.src;
  const discordId = avatarUrl === undefined ? undefined : extractDiscordIdFromAvatarUrl(avatarUrl);
  const stableDomId = makeStableDomId(team, index, displayName);

  return {
    userId: discordId ?? stableDomId,
    discordId: discordId ?? stableDomId,
    displayName,
    partyId: null,
    partyRatingBonus: 0,
    team,
    role,
    isCaptain: role === 'captain',
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
    ...(discordId === undefined
      ? { profileLookupUnavailable: true }
      : { profileUrl: `https://drafter.uma.guide/players/${discordId}` }),
    source: 'room-lobby-dom'
  };
}

function readDisplayName(row: HTMLElement): string | undefined {
  return Array.from(row.querySelectorAll<HTMLParagraphElement>('p'))
    .map((paragraph) => normalizeText(paragraph.textContent))
    .find((text) => text !== undefined);
}

function readRole(row: HTMLElement): string | undefined {
  return Array.from(row.querySelectorAll<HTMLElement>('span'))
    .map((span) => normalizeText(span.textContent))
    .find((text) => text !== undefined && PLAYER_ROLES.has(text))
    ?.toLowerCase();
}

function extractDiscordIdFromAvatarUrl(value: string): string | undefined {
  return /\/avatars\/(\d+)\//.exec(value)?.[1];
}

function makeStableDomId(team: TeamId, index: number, displayName: string): string {
  return `room-dom:${team}:${index}:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}
