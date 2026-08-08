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

export default function App() {
  const [roster, setRoster] = useState<PrematchRoster | undefined>();
  const [profileSnapshot, setProfileSnapshot] = useState<PlayerProfileSummariesSnapshot | undefined>();

  useEffect(() => {
    void getLatestPrematchRoster().then(setRoster);
    void getPlayerProfileSummaries().then(setProfileSnapshot);

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

  return (
    <main className="app-shell">
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
        <span className={roster === undefined ? 'status-pill idle' : 'status-pill live'}>
          {roster === undefined ? 'Waiting' : `${roster.players.length}/10`}
        </span>
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
  loadingDiscordIds
}: {
  team: PrematchTeam;
  profiles: Record<string, PlayerProfileSummary>;
  loadingDiscordIds: string[];
}) {
  return (
    <section className="team-section">
      <header className="team-header">
        <div>
          <h2>{team.name ?? team.id}</h2>
          <p>{team.players.length} players</p>
        </div>
      </header>

      <ol className="player-list">
        {team.players.map((player) => (
          <PlayerRow
            key={`${player.discordId}:${player.userId}`}
            player={player}
            profile={profiles[player.discordId]}
            isProfileLoading={loadingDiscordIds.includes(player.discordId)}
          />
        ))}
      </ol>
    </section>
  );
}

function PlayerRow({
  player,
  profile,
  isProfileLoading
}: {
  player: PrematchPlayer;
  profile?: PlayerProfileSummary;
  isProfileLoading: boolean;
}) {
  const rating = profile?.conservativeRating ?? profile?.rating ?? player.displayRatingSnapshot ?? player.ratingSnapshot;
  const tags = getPlayerTags(player);
  const discordId = getLookupDiscordId(player);
  const profileUrl = profile?.profileUrl ?? player.profileUrl;

  return (
    <li className="player-row">
      <div className="player-main">
        {profileUrl === undefined ? (
          <span className="player-name">{profile?.displayName ?? player.displayName}</span>
        ) : (
          <a className="player-name" href={profileUrl} target="_blank" rel="noreferrer">
            {profile?.displayName ?? player.displayName}
          </a>
        )}
        <span className="player-id">{discordId ?? 'Profile unavailable from room page'}</span>
        {profile?.title !== null && profile?.title !== undefined ? (
          <span className="player-title">{profile.title}</span>
        ) : null}
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
      {profile?.topUmas !== undefined && profile.topUmas.length > 0 ? (
        <div className="top-umas" aria-label={`${player.displayName} most played Umas`}>
          <p>Most Played</p>
          <ol>
            {profile.topUmas.map((uma) => (
              <li key={uma.umaId}>
                <span className="uma-name" title={uma.name}>
                  {uma.name}
                </span>
                <span className="uma-meta">
                  {uma.matches} GP - {formatPercent(uma.winRate)} - {formatDecimal(uma.pointsPerGame)} PPG
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {profile?.statsPrivate === true ? (
        <p className="player-note">Stats are private.</p>
      ) : profile?.error !== undefined ? (
        <p className="player-note">{profile.error}</p>
      ) : null}
    </li>
  );
}

function getLookupDiscordId(player: PrematchPlayer): string | undefined {
  return /^\d{16,20}$/.test(player.discordId) ? player.discordId : undefined;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
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
