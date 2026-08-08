import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type {
  PlayerProfileSummary,
  PrematchPlayer,
  PrematchRoster,
  PrematchTeam,
  TeamId
} from '@umalytics/shared';
import {
  getPlayerProfileSummaries,
  PLAYER_PROFILE_SUMMARIES_STORAGE_KEY,
  type PlayerProfileSummariesSnapshot
} from '../../utils/profileStorage';
import {
  getLatestPrematchRoster,
  LATEST_PREMATCH_ROSTER_STORAGE_KEY
} from '../../utils/rosterStorage';

const TEAM_IDS = ['team1', 'team2'] as const satisfies readonly TeamId[];
const TEAM_SLOT_COUNT = 5;
const SIDE_PANEL_THEME_STORAGE_KEY = 'sidePanelTheme';

type SidePanelTheme = 'dark' | 'light';

export default function App() {
  const [roster, setRoster] = useState<PrematchRoster | undefined>();
  const [profileSnapshot, setProfileSnapshot] = useState<PlayerProfileSummariesSnapshot | undefined>();
  const [theme, setTheme] = useState<SidePanelTheme>('dark');
  const [expandedPlayerKeys, setExpandedPlayerKeys] = useState<string[]>([]);

  useEffect(() => {
    void getLatestPrematchRoster().then(setRoster);
    void getPlayerProfileSummaries().then(setProfileSnapshot);
    void getStoredTheme().then(setTheme);

    const handleStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const rosterChange = changes[LATEST_PREMATCH_ROSTER_STORAGE_KEY];

      if (rosterChange !== undefined) {
        setRoster(isPrematchRoster(rosterChange.newValue) ? rosterChange.newValue : undefined);
      }

      const profileChange = changes[PLAYER_PROFILE_SUMMARIES_STORAGE_KEY];

      if (isProfileSnapshot(profileChange?.newValue)) {
        setProfileSnapshot(profileChange.newValue);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const teamGroups = useMemo(() => getTeamGroups(roster), [roster]);
  const loadingProfiles = profileSnapshot?.loadingDiscordIds.length ?? 0;

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    void browser.storage.local.set({ [SIDE_PANEL_THEME_STORAGE_KEY]: nextTheme });
  };

  const toggleExpandedPlayer = (playerKey: string) => {
    setExpandedPlayerKeys((currentKeys) =>
      currentKeys.includes(playerKey)
        ? currentKeys.filter((currentKey) => currentKey !== playerKey)
        : [...currentKeys, playerKey]
    );
  };

  return (
    <main className={`app-shell theme-${theme}`}>
      <header className="app-header">
        <div>
          <h1>UmaLytics</h1>
          <p>
            {roster?.matchCode === undefined
              ? 'Lobby scouting'
              : loadingProfiles > 0
                ? `Match ${roster.matchCode} - scouting ${loadingProfiles}`
                : `Match ${roster.matchCode}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <span className={roster === undefined ? 'status-pill idle' : 'status-pill live'}>
            {roster === undefined ? 'Waiting' : `${roster.players.length}/10`}
          </span>
        </div>
      </header>

      {roster === undefined ? (
        <section className="empty-state">
          <h2>No lobby detected</h2>
          <p>Open an Uma Drafter lobby or spectate page to populate player scouting.</p>
        </section>
      ) : (
        <section className="team-list" aria-label="Detected lobby teams">
          {teamGroups.map((team) => (
            <TeamSection
              key={team.id}
              team={team}
              profiles={profileSnapshot?.profiles ?? {}}
              loadingDiscordIds={profileSnapshot?.loadingDiscordIds ?? []}
              expandedPlayerKeys={expandedPlayerKeys}
              onTogglePlayer={toggleExpandedPlayer}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function TeamSection({
  team,
  profiles,
  loadingDiscordIds,
  expandedPlayerKeys,
  onTogglePlayer
}: {
  team: PrematchTeam;
  profiles: Record<string, PlayerProfileSummary>;
  loadingDiscordIds: string[];
  expandedPlayerKeys: string[];
  onTogglePlayer: (playerKey: string) => void;
}) {
  const playerSlots = Array.from({ length: TEAM_SLOT_COUNT }, (_, index) => team.players[index]);

  return (
    <section className="team-section">
      <header className="team-header">
        <div>
          <h2>{team.name ?? team.id}</h2>
          <p>{Math.min(team.players.length, TEAM_SLOT_COUNT)}/{TEAM_SLOT_COUNT} players</p>
        </div>
      </header>

      <ol className="player-list">
        {playerSlots.map((player, index) => (
          player === undefined ? (
            <EmptyPlayerSlot key={`${team.id}:empty:${index}`} slotNumber={index + 1} />
          ) : (
            <PlayerRow
              key={getPlayerKey(player)}
              player={player}
              profile={profiles[player.discordId]}
              isProfileLoading={loadingDiscordIds.includes(player.discordId)}
              isExpanded={expandedPlayerKeys.includes(getPlayerKey(player))}
              onToggleExpanded={() => {
                onTogglePlayer(getPlayerKey(player));
              }}
            />
          )
        ))}
      </ol>
    </section>
  );
}

function PlayerRow({
  player,
  profile,
  isProfileLoading,
  isExpanded,
  onToggleExpanded
}: {
  player: PrematchPlayer;
  profile?: PlayerProfileSummary;
  isProfileLoading: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const rating = profile?.conservativeRating ?? profile?.rating ?? player.displayRatingSnapshot ?? player.ratingSnapshot;
  const tags = getPlayerTags(player);
  const discordId = getLookupDiscordId(player);
  const profileUrl = profile?.profileUrl ?? player.profileUrl;
  const note =
    profile?.statsPrivate === true
      ? 'Stats are private.'
      : profile?.error !== undefined
        ? profile.error
        : undefined;

  return (
    <li className={isExpanded ? 'player-row expanded' : 'player-row'}>
      <div className="player-main">
        {profileUrl === undefined ? (
          <span className="player-name-row">
            <span className="player-name">{profile?.displayName ?? player.displayName}</span>
            <button type="button" className="expand-button" onClick={onToggleExpanded}>
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </span>
        ) : (
          <span className="player-name-row">
            <a className="player-name" href={profileUrl} target="_blank" rel="noreferrer">
              {profile?.displayName ?? player.displayName}
            </a>
            <button type="button" className="expand-button" onClick={onToggleExpanded}>
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </span>
        )}
        <span className="player-id">{discordId ?? 'Profile unavailable from room page'}</span>
        <span className="player-title">{profile?.title ?? ' '}</span>
      </div>
      <div className="player-meta">
        <span>{formatRank(profile, isProfileLoading && discordId !== undefined)}</span>
        <span>{rating === undefined || rating === null ? 'Rating unknown' : `${rating} rating`}</span>
        {tags.map((tag) => (
          <span key={tag} className="player-tag">
            {tag}
          </span>
        ))}
        {profile?.supporter === true ? <span className="player-tag">Supporter</span> : null}
      </div>
      <div className="scouting-grid" aria-label={`${player.displayName} scouting summary`}>
        <StatCell label="W-L" value={formatRecord(profile)} />
        <StatCell label="Win" value={formatPercent(profile?.winRate)} />
        <StatCell label="Pts/GP" value={formatDecimal(profile?.pointsPerGame)} />
        <StatCell label="Podiums" value={formatNumber(profile?.podiums)} />
        <StatCell label="MVP" value={formatNumber(profile?.mvpMatches)} />
      </div>
      <TopUmasList topUmas={profile?.topUmas} playerName={player.displayName} />
      {isExpanded ? <BestUmasList bestUmas={profile?.bestUmas} playerName={player.displayName} /> : null}
      <p className={note === undefined ? 'player-note empty' : 'player-note'}>{note ?? ' '}</p>
    </li>
  );
}

function EmptyPlayerSlot({ slotNumber }: { slotNumber: number }) {
  return (
    <li className="player-row empty-player-row">
      <div className="player-main">
        <span className="player-name">Waiting for player</span>
        <span className="player-id">Slot {slotNumber}</span>
        <span className="player-title"> </span>
      </div>
      <div className="player-meta">
        <span>Open slot</span>
      </div>
      <div className="scouting-grid" aria-label={`Empty player slot ${slotNumber}`}>
        <StatCell label="W-L" value="-" />
        <StatCell label="Win" value="-" />
        <StatCell label="Pts/GP" value="-" />
        <StatCell label="Podiums" value="-" />
        <StatCell label="MVP" value="-" />
      </div>
      <TopUmasList playerName={`empty slot ${slotNumber}`} />
      <p className="player-note empty"> </p>
    </li>
  );
}

function getLookupDiscordId(player: PrematchPlayer): string | undefined {
  return /^\d{16,20}$/.test(player.discordId) ? player.discordId : undefined;
}

function getPlayerKey(player: PrematchPlayer): string {
  return `${player.discordId}:${player.userId}`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function TopUmasList({
  topUmas,
  playerName
}: {
  topUmas?: PlayerProfileSummary['topUmas'];
  playerName: string;
}) {
  const slots = Array.from({ length: 3 }, (_, index) => topUmas?.[index]);

  return (
    <div className="top-umas" aria-label={`${playerName} most played Umas`}>
      <p>Most Played</p>
      <ol>
        {slots.map((uma, index) => (
          uma === undefined ? (
            <li key={`empty-uma:${index}`} className="empty-uma-row">
              <span className="uma-name">-</span>
              <span className="uma-meta">-</span>
            </li>
          ) : (
            <li key={uma.umaId}>
              <span className="uma-name" title={uma.name}>
                {uma.name}
              </span>
              <span className="uma-meta">
                {uma.matches} GP - {formatPercent(uma.winRate)} - {formatDecimal(uma.pointsPerGame)} PPG
              </span>
            </li>
          )
        ))}
      </ol>
    </div>
  );
}

function BestUmasList({
  bestUmas,
  playerName
}: {
  bestUmas?: PlayerProfileSummary['bestUmas'];
  playerName: string;
}) {
  const slots = Array.from({ length: 5 }, (_, index) => bestUmas?.[index]);

  return (
    <div className="top-umas best-umas" aria-label={`${playerName} best performing Umas`}>
      <p>Best Performing</p>
      <ol>
        {slots.map((uma, index) => (
          uma === undefined ? (
            <li key={`empty-best-uma:${index}`} className="empty-uma-row">
              <span className="uma-name">-</span>
              <span className="uma-meta">-</span>
            </li>
          ) : (
            <li key={uma.umaId}>
              <span className="uma-name" title={uma.name}>
                {uma.name}
              </span>
              <span className="uma-meta">
                {formatNumber(uma.performanceScore)} score - {formatDecimal(uma.pointsPerGame)} PPG -{' '}
                {formatPercent(uma.winRate)} - {uma.matches} GP
              </span>
            </li>
          )
        ))}
      </ol>
    </div>
  );
}

function getTeamGroups(roster: PrematchRoster | undefined): PrematchTeam[] {
  if (roster === undefined) {
    return [];
  }

  if (roster.teams !== undefined) {
    return TEAM_IDS.map((teamId) => roster.teams?.[teamId]).filter(
      (team): team is PrematchTeam => team !== undefined
    );
  }

  return [
    {
      id: 'team1',
      players: roster.players
    }
  ];
}

function getPlayerTags(player: PrematchPlayer): string[] {
  const tags: string[] = [];

  if (player.isCaptain === true || player.role === 'captain') {
    tags.push('Captain');
  }

  if (player.partyId !== null) {
    tags.push('Party');
  }

  return tags;
}

function isPrematchRoster(value: unknown): value is PrematchRoster {
  return (
    typeof value === 'object' &&
    value !== null &&
    'players' in value &&
    Array.isArray(value.players)
  );
}

function isProfileSnapshot(value: unknown): value is PlayerProfileSummariesSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'profiles' in value &&
    'loadingDiscordIds' in value &&
    Array.isArray(value.loadingDiscordIds)
  );
}

function formatRank(profile: PlayerProfileSummary | undefined, isLoading: boolean): string {
  if (profile?.rank !== undefined && profile.rank !== null) {
    return `#${profile.rank}`;
  }

  return isLoading ? 'Loading profile' : 'Unranked';
}

function formatRecord(profile: PlayerProfileSummary | undefined): string {
  if (profile?.wins === undefined || profile.losses === undefined) {
    return '-';
  }

  if (profile.wins === null || profile.losses === null) {
    return '-';
  }

  return `${profile.wins}-${profile.losses}`;
}

function formatPercent(value: number | null | undefined): string {
  return value === undefined || value === null ? '-' : `${(value * 100).toFixed(0)}%`;
}

function formatDecimal(value: number | null | undefined): string {
  return value === undefined || value === null ? '-' : value.toFixed(1);
}

function formatNumber(value: number | null | undefined): string {
  return value === undefined || value === null ? '-' : value.toLocaleString();
}

async function getStoredTheme(): Promise<SidePanelTheme> {
  const values = await browser.storage.local.get(SIDE_PANEL_THEME_STORAGE_KEY);
  const storedTheme = values[SIDE_PANEL_THEME_STORAGE_KEY];

  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
}
