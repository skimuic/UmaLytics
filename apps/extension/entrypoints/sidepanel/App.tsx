import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type {
  PlayerStatsScope,
  PlayerProfileSummary,
  PlayerTopUmaSummary,
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
import { sendProfileRefreshRequest } from '../../utils/messaging';
import {
  BEST_UMA_MIN_MATCHES,
  MANUAL_PROFILE_REFRESH_COOLDOWN_MS
} from '../../utils/profileConstants';

const TEAM_IDS = ['team1', 'team2'] as const satisfies readonly TeamId[];
const TEAM_SLOT_COUNT = 5;
const SIDE_PANEL_THEME_STORAGE_KEY = 'sidePanelTheme';
const STATS_SCOPE_STORAGE_KEY = 'statsScope';
const SCOUT_POPOUT_PATH = '/scout.html';
const SCOUT_POPOUT_WIDTH = 540;
const SCOUT_POPOUT_HEIGHT = 900;

type SidePanelTheme = 'dark' | 'light';
type ScoutSurface = 'sidepanel' | 'popout';
type NotableBadgeTone = 'rank' | 'scoring' | 'sample' | 'private';
type UmaBadgeTone = 'scoring' | 'sample' | 'private';
type SampleConfidence = 'small' | 'steady' | 'proven';

interface NotableBadge {
  label: string;
  tone: NotableBadgeTone;
}

interface UmaBadge {
  label: string;
  tone: UmaBadgeTone;
}

export default function App({ surface = 'sidepanel' }: { surface?: ScoutSurface }) {
  const [roster, setRoster] = useState<PrematchRoster | undefined>();
  const [profileSnapshot, setProfileSnapshot] = useState<PlayerProfileSummariesSnapshot | undefined>();
  const [theme, setTheme] = useState<SidePanelTheme>('dark');
  const [statsScope, setStatsScope] = useState<PlayerStatsScope>('currentSeason');
  const [expandedPlayerKeys, setExpandedPlayerKeys] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void getLatestPrematchRoster().then(setRoster);
    void getPlayerProfileSummaries().then(setProfileSnapshot);
    void getStoredTheme().then(setTheme);
    void getStoredStatsScope().then(setStatsScope);

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

  useEffect(() => {
    if (roster === undefined) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [roster]);

  const teamGroups = useMemo(() => getTeamGroups(roster), [roster]);
  const loadingProfiles = profileSnapshot?.loadingDiscordIds.length ?? 0;
  const hasRoster = roster !== undefined;
  const refreshCooldownMs = getRefreshCooldownMs(profileSnapshot?.updatedAt, now);
  const canRefresh = hasRoster && loadingProfiles === 0 && refreshCooldownMs === 0;
  const profileStatusLabel = getProfileSnapshotStatus(profileSnapshot, loadingProfiles, now);
  const statsScopeLabel = getStatsScopeDescription(statsScope);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    void browser.storage.local.set({ [SIDE_PANEL_THEME_STORAGE_KEY]: nextTheme });
  };

  const selectStatsScope = (nextStatsScope: PlayerStatsScope) => {
    setStatsScope(nextStatsScope);
    void browser.storage.local.set({ [STATS_SCOPE_STORAGE_KEY]: nextStatsScope });
  };

  const toggleExpandedPlayer = (playerKey: string) => {
    setExpandedPlayerKeys((currentKeys) =>
      currentKeys.includes(playerKey)
        ? currentKeys.filter((currentKey) => currentKey !== playerKey)
        : [...currentKeys, playerKey]
    );
  };

  const refreshProfiles = () => {
    if (roster === undefined || !canRefresh) {
      return;
    }

    void sendProfileRefreshRequest(roster);
  };

  const openPopout = () => {
    void browser.windows.create({
      url: browser.runtime.getURL(SCOUT_POPOUT_PATH),
      type: 'popup',
      width: SCOUT_POPOUT_WIDTH,
      height: SCOUT_POPOUT_HEIGHT,
      focused: true
    });
  };

  return (
    <main className={`app-shell theme-${theme} surface-${surface}`}>
      <header className="app-header">
        <div>
          <h1>UmaLytics</h1>
          <p>{roster?.matchCode === undefined ? 'Lobby scouting' : `Match ${roster.matchCode}`}</p>
          <p className="stats-scope-description">{statsScopeLabel}</p>
          {profileStatusLabel === undefined ? null : (
            <p className="profile-freshness">{profileStatusLabel}</p>
          )}
        </div>
        <div className="header-actions">
          <div className="stats-scope-toggle" aria-label="Stats time window">
            <button
              type="button"
              className={statsScope === 'currentSeason' ? 'active' : ''}
              title="Show current season records, scoring, and Uma stats."
              onClick={() => {
                selectStatsScope('currentSeason');
              }}
            >
              Season
            </button>
            <button
              type="button"
              className={statsScope === 'allTime' ? 'active' : ''}
              title="Show all-time ranked records, scoring, and Uma stats. Rank still uses the active season leaderboard."
              onClick={() => {
                selectStatsScope('allTime');
              }}
            >
              All-time
            </button>
          </div>
          <div className="header-control-row">
            <button
              type="button"
              className="theme-toggle"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
            {hasRoster ? (
              <button
                type="button"
                className="refresh-button"
                disabled={!canRefresh}
                onClick={refreshProfiles}
              >
                {loadingProfiles > 0
                  ? 'Refreshing'
                  : refreshCooldownMs > 0
                    ? `Wait ${Math.ceil(refreshCooldownMs / 1000)}s`
                    : 'Refresh data'}
              </button>
            ) : null}
            {surface === 'sidepanel' ? (
              <button type="button" className="popout-button" onClick={openPopout}>
                Popout
              </button>
            ) : null}
          </div>
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
              statsScope={statsScope}
              expandedPlayerKeys={expandedPlayerKeys}
              now={now}
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
  statsScope,
  expandedPlayerKeys,
  now,
  onTogglePlayer
}: {
  team: PrematchTeam;
  profiles: Record<string, PlayerProfileSummary>;
  loadingDiscordIds: string[];
  statsScope: PlayerStatsScope;
  expandedPlayerKeys: string[];
  now: number;
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
              statsScope={statsScope}
              isExpanded={expandedPlayerKeys.includes(getPlayerKey(player))}
              now={now}
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
  statsScope,
  isExpanded,
  now,
  onToggleExpanded
}: {
  player: PrematchPlayer;
  profile?: PlayerProfileSummary;
  isProfileLoading: boolean;
  statsScope: PlayerStatsScope;
  isExpanded: boolean;
  now: number;
  onToggleExpanded: () => void;
}) {
  const displayedProfile = getDisplayedProfileStats(profile, statsScope);
  const rating = profile?.conservativeRating ?? profile?.rating ?? player.displayRatingSnapshot ?? player.ratingSnapshot;
  const discordId = getLookupDiscordId(player);
  const profileUrl = profile?.profileUrl ?? player.profileUrl;
  const note = getPlayerNote(profile, discordId);
  const statsMessage = getStatsMessage(profile, isProfileLoading, discordId);
  const notableBadges = getNotableBadges(displayedProfile);
  const isInParty = player.partyId !== undefined && player.partyId !== null;
  const isCaptain = player.isCaptain === true || player.role === 'captain';

  return (
    <li className={getPlayerRowClassName(isExpanded, notableBadges, isCaptain)}>
      <div className="player-main">
        {profileUrl === undefined ? (
          <span className="player-name-row">
            <span className="player-identity">
              <span className="player-name">{profile?.displayName ?? player.displayName}</span>
              {isCaptain ? <CaptainCrown /> : null}
              {isInParty ? <span className="identity-tag">Party</span> : null}
            </span>
            {isProfileLoading && discordId !== undefined ? (
              <span className="player-inline-status">Refreshing</span>
            ) : null}
            <button type="button" className="expand-button" onClick={onToggleExpanded}>
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </span>
        ) : (
          <span className="player-name-row">
            <span className="player-identity">
              <a className="player-name" href={profileUrl} target="_blank" rel="noreferrer">
                {profile?.displayName ?? player.displayName}
              </a>
              {isCaptain ? <CaptainCrown /> : null}
              {isInParty ? <span className="identity-tag">Party</span> : null}
            </span>
            {isProfileLoading && discordId !== undefined ? (
              <span className="player-inline-status">Refreshing</span>
            ) : null}
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
        {notableBadges.map((badge) => (
          <span key={badge.label} className={`player-tag notable-tag ${badge.tone}`}>
            {badge.label}
          </span>
        ))}
      </div>
      <div className="scouting-grid" aria-label={`${player.displayName} scouting summary`}>
        <StatCell label="W-L" value={formatRecord(displayedProfile)} />
        <StatCell label="Win" value={formatPercent(displayedProfile?.winRate)} />
        <StatCell label="Pts/GP" value={formatDecimal(displayedProfile?.pointsPerGame)} />
        <StatCell label="Podiums" value={formatNumber(displayedProfile?.podiums)} />
        <StatCell label="MVP" value={formatNumber(displayedProfile?.mvpMatches)} />
      </div>
      <TopUmasList
        topUmas={displayedProfile?.topUmas}
        playerName={player.displayName}
        emptyMessage={statsMessage}
      />
      {isExpanded ? (
        <>
          <ProfileDataStatus
            discordId={discordId}
            profile={profile}
            isProfileLoading={isProfileLoading}
            now={now}
          />
          <ScoutingReport profile={displayedProfile} emptyMessage={statsMessage} />
          <BestUmasList
            bestUmas={displayedProfile?.bestUmas}
            playerName={player.displayName}
            emptyMessage={statsMessage}
          />
        </>
      ) : null}
      <p className={note === undefined ? 'player-note empty' : 'player-note'}>{note ?? ' '}</p>
    </li>
  );
}

function CaptainCrown() {
  return (
    <span className="captain-crown" title="Captain" aria-label="Captain">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3.8 8.8 8.7 13.2 12 5.8l3.3 7.4 4.9-4.4-1.8 9.1H5.6L3.8 8.8Z" />
      </svg>
    </span>
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
      <TopUmasList playerName={`empty slot ${slotNumber}`} emptyMessage="Waiting for player." />
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

function ProfileDataStatus({
  discordId,
  profile,
  isProfileLoading,
  now
}: {
  discordId: string | undefined;
  profile: PlayerProfileSummary | undefined;
  isProfileLoading: boolean;
  now: number;
}) {
  const status = getProfileDataStatus(discordId, profile, isProfileLoading, now);

  return (
    <div className={`profile-data-status ${status.tone}`}>
      <span>{status.label}</span>
    </div>
  );
}

function ScoutingReport({
  profile,
  emptyMessage
}: {
  profile: PlayerProfileSummary | undefined;
  emptyMessage?: string;
}) {
  if (profile === undefined || profile.statsPrivate === true || profile.error !== undefined) {
    return (
      <section className="scouting-report" aria-label="Player scouting report">
        <p>Scouting Report</p>
        <span className="section-message">{emptyMessage ?? 'No profile summary available.'}</span>
      </section>
    );
  }

  const comfortPick = profile.topUmas?.[0];
  const bestPick = profile.bestUmas?.[0];
  const sampleConfidence = getSampleConfidence(profile.matches);

  return (
    <section className="scouting-report" aria-label="Player scouting report">
      <p>Scouting Report</p>
      <div className="report-grid">
        <ReportMetric
          label="Comfort"
          value={comfortPick?.name ?? '-'}
          detail={formatUmaLine(comfortPick)}
        />
        <ReportMetric
          label="Best"
          value={bestPick?.name ?? '-'}
          detail={formatBestUmaLine(bestPick)}
        />
        <ReportMetric
          label="Sample"
          value={formatSampleConfidence(sampleConfidence)}
          detail={formatSampleDetail(profile)}
        />
        <ReportMetric
          label="Scoring"
          value={formatScoringValue(profile.pointsPerGame)}
          detail={formatWinRateDetail(profile.winRate)}
        />
      </div>
    </section>
  );
}

function ReportMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function TopUmasList({
  topUmas,
  playerName,
  emptyMessage
}: {
  topUmas?: PlayerProfileSummary['topUmas'];
  playerName: string;
  emptyMessage?: string;
}) {
  const slots = Array.from({ length: 3 }, (_, index) => topUmas?.[index]);
  const shouldShowMessage = topUmas === undefined || topUmas.length === 0;

  return (
    <div className="top-umas" aria-label={`${playerName} most played Umas`}>
      <p>Most Played</p>
      {shouldShowMessage ? (
        <span className="section-message">{emptyMessage ?? 'No ranked Uma data found.'}</span>
      ) : (
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
      )}
    </div>
  );
}

function BestUmasList({
  bestUmas,
  playerName,
  emptyMessage
}: {
  bestUmas?: PlayerProfileSummary['bestUmas'];
  playerName: string;
  emptyMessage?: string;
}) {
  const slots = Array.from({ length: 5 }, (_, index) => bestUmas?.[index]);
  const shouldShowMessage = bestUmas === undefined || bestUmas.length === 0;

  return (
    <div className="top-umas best-umas" aria-label={`${playerName} best performing Umas`}>
      <p>Best Performing</p>
      {shouldShowMessage ? (
        <span className="section-message">
          {emptyMessage ?? `No Umas meet the ${BEST_UMA_MIN_MATCHES} game sample yet.`}
        </span>
      ) : (
        <ol>
          {slots.map((uma, index) => (
            uma === undefined ? (
              <li key={`empty-best-uma:${index}`} className="empty-uma-row">
                <span className="uma-name">-</span>
                <span className="uma-meta">-</span>
              </li>
            ) : (
              <li key={uma.umaId} className="best-uma-row">
                <span className="best-uma-heading">
                  <span className="uma-name" title={uma.name}>
                    {uma.name}
                  </span>
                  <span className="best-uma-badges">
                    {getUmaBadges(uma).map((badge) => (
                      <span key={badge.label} className={`uma-badge ${badge.tone}`}>
                        {badge.label}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="best-uma-stats">
                  <span>
                    <small>Score</small>
                    <strong>{formatNumber(uma.performanceScore)}</strong>
                  </span>
                  <span>
                    <small>PPG</small>
                    <strong>{formatDecimal(uma.pointsPerGame)}</strong>
                  </span>
                  <span>
                    <small>WR</small>
                    <strong>{formatPercent(uma.winRate)}</strong>
                  </span>
                  <span>
                    <small>GP</small>
                    <strong>{uma.matches}</strong>
                  </span>
                </span>
              </li>
            )
          ))}
        </ol>
      )}
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

function getDisplayedProfileStats(
  profile: PlayerProfileSummary | undefined,
  statsScope: PlayerStatsScope
): PlayerProfileSummary | undefined {
  if (profile === undefined) {
    return undefined;
  }

  const stats = statsScope === 'allTime' ? profile.allTimeStats : profile.currentSeasonStats;

  if (stats === undefined) {
    return profile;
  }

  return {
    ...profile,
    ...stats,
    statsScope
  };
}

function getNotableBadges(profile: PlayerProfileSummary | undefined): NotableBadge[] {
  if (profile === undefined) {
    return [];
  }

  if (profile.statsPrivate === true) {
    return [
      {
        label: 'Private',
        tone: 'private'
      }
    ];
  }

  const badges: NotableBadge[] = [];

  if (profile.rank !== undefined && profile.rank !== null) {
    if (profile.rank <= 10) {
      badges.push({
        label: 'Top 10',
        tone: 'rank'
      });
    } else if (profile.rank <= 25) {
      badges.push({
        label: 'Top 25',
        tone: 'rank'
      });
    }
  }

  if (
    profile.pointsPerGame !== undefined &&
    profile.pointsPerGame !== null &&
    profile.pointsPerGame >= 6
  ) {
    badges.push({
      label: 'High scoring',
      tone: 'scoring'
    });
  }

  if (
    profile.matches !== undefined &&
    profile.matches !== null &&
    profile.matches >= 25 &&
    profile.winRate !== undefined &&
    profile.winRate !== null &&
    profile.winRate >= 0.6
  ) {
    badges.push({
      label: 'Reliable',
      tone: 'sample'
    });
  }

  return badges;
}

function getPlayerRowClassName(
  isExpanded: boolean,
  notableBadges: NotableBadge[],
  isCaptain: boolean
): string {
  const classes = ['player-row'];

  if (isExpanded) {
    classes.push('expanded');
  }

  if (isCaptain) {
    classes.push('captain-player');
  }

  if (notableBadges.some((badge) => badge.tone === 'rank')) {
    classes.push('rank-highlight');
  } else if (notableBadges.some((badge) => badge.tone === 'scoring')) {
    classes.push('scoring-highlight');
  } else if (notableBadges.some((badge) => badge.tone === 'private')) {
    classes.push('private-highlight');
  }

  return classes.join(' ');
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

function formatUmaLine(uma: PlayerTopUmaSummary | undefined): string {
  if (uma === undefined) {
    return 'No data';
  }

  return `${uma.matches} GP - ${formatDecimal(uma.pointsPerGame)} PPG`;
}

function formatBestUmaLine(uma: PlayerTopUmaSummary | undefined): string {
  if (uma === undefined) {
    return 'No data';
  }

  if (uma.performanceScore === undefined) {
    return `${formatDecimal(uma.pointsPerGame)} PPG - ${uma.matches} GP`;
  }

  return `${formatNumber(uma.performanceScore)} score - ${formatSampleConfidence(getSampleConfidence(uma.matches))}`;
}

function formatRecordDetail(profile: PlayerProfileSummary): string {
  const record = formatRecord(profile);

  return record === '-' ? 'Record unknown' : `${record} W-L`;
}

function formatSampleDetail(profile: PlayerProfileSummary): string {
  const matches = formatNumber(profile.matches);
  const record = formatRecordDetail(profile);

  return matches === '-' ? record : `${matches} GP - ${record}`;
}

function formatScoringValue(pointsPerGame: number | null | undefined): string {
  const formattedScoring = formatDecimal(pointsPerGame);

  return formattedScoring === '-' ? '-' : `${formattedScoring} PPG`;
}

function formatWinRateDetail(winRate: number | null | undefined): string {
  const formattedWinRate = formatPercent(winRate);

  return formattedWinRate === '-' ? 'Win rate unknown' : `${formattedWinRate} win`;
}

function getSampleConfidence(matches: number | null | undefined): SampleConfidence {
  if (matches === undefined || matches === null || matches < 10) {
    return 'small';
  }

  if (matches < 25) {
    return 'steady';
  }

  return 'proven';
}

function formatSampleConfidence(confidence: SampleConfidence): string {
  switch (confidence) {
    case 'proven':
      return 'Proven';
    case 'steady':
      return 'Steady';
    case 'small':
      return 'Small';
  }
}

function getUmaBadges(uma: PlayerTopUmaSummary): UmaBadge[] {
  const badges: UmaBadge[] = [];
  const confidence = getSampleConfidence(uma.matches);

  if (uma.pointsPerGame !== null && uma.pointsPerGame >= 6.5) {
    badges.push({
      label: 'High scorer',
      tone: 'scoring'
    });
  }

  if (uma.winRate !== null && uma.winRate >= 0.65 && uma.matches >= 10) {
    badges.push({
      label: 'Reliable',
      tone: 'sample'
    });
  }

  if (confidence === 'small') {
    badges.push({
      label: 'Small sample',
      tone: 'private'
    });
  } else if (confidence === 'proven') {
    badges.push({
      label: 'Proven',
      tone: 'sample'
    });
  }

  return badges.slice(0, 2);
}

function getRefreshCooldownMs(updatedAt: number | undefined, now: number): number {
  if (updatedAt === undefined) {
    return 0;
  }

  return Math.max(updatedAt + MANUAL_PROFILE_REFRESH_COOLDOWN_MS - now, 0);
}

function getProfileSnapshotStatus(
  snapshot: PlayerProfileSummariesSnapshot | undefined,
  loadingProfiles: number,
  now: number
): string | undefined {
  if (loadingProfiles > 0) {
    return `Refreshing ${loadingProfiles} profile${loadingProfiles === 1 ? '' : 's'}`;
  }

  if (snapshot === undefined) {
    return undefined;
  }

  return `Profile data updated ${formatRelativeAge(snapshot.updatedAt, now)}`;
}

function getStatsScopeDescription(statsScope: PlayerStatsScope): string {
  return statsScope === 'currentSeason'
    ? 'Showing current season stats'
    : 'Showing all-time stats - rank is current season';
}

function getProfileDataStatus(
  discordId: string | undefined,
  profile: PlayerProfileSummary | undefined,
  isProfileLoading: boolean,
  now: number
): { label: string; tone: 'fresh' | 'loading' | 'warning' | 'muted' } {
  if (discordId === undefined) {
    return {
      label: 'Profile link unavailable from room page',
      tone: 'muted'
    };
  }

  if (isProfileLoading) {
    return {
      label: 'Refreshing profile data',
      tone: 'loading'
    };
  }

  if (profile === undefined) {
    return {
      label: 'Profile data not loaded yet',
      tone: 'muted'
    };
  }

  if (profile.statsPrivate === true) {
    return {
      label: `Stats private - checked ${formatRelativeAge(profile.fetchedAt, now)}`,
      tone: 'warning'
    };
  }

  if (profile.error !== undefined) {
    return {
      label: `Profile unavailable - checked ${formatRelativeAge(profile.fetchedAt, now)}`,
      tone: 'warning'
    };
  }

  return {
    label: `Profile data current - updated ${formatRelativeAge(profile.fetchedAt, now)}`,
    tone: 'fresh'
  };
}

function formatRelativeAge(timestamp: number, now: number): string {
  const ageSeconds = Math.max(Math.floor((now - timestamp) / 1000), 0);

  if (ageSeconds < 10) {
    return 'just now';
  }

  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }

  const ageMinutes = Math.floor(ageSeconds / 60);

  if (ageMinutes < 60) {
    return `${ageMinutes}m ago`;
  }

  const ageHours = Math.floor(ageMinutes / 60);

  return `${ageHours}h ago`;
}

function getPlayerNote(
  profile: PlayerProfileSummary | undefined,
  discordId: string | undefined
): string | undefined {
  if (discordId === undefined) {
    return 'Open their Uma profile once available to scout detailed stats.';
  }

  if (profile === undefined) {
    return 'Profile data has not loaded yet.';
  }

  if (profile.statsPrivate === true) {
    return 'Stats are private.';
  }

  return profile.error;
}

function getStatsMessage(
  profile: PlayerProfileSummary | undefined,
  isProfileLoading: boolean,
  discordId: string | undefined
): string | undefined {
  if (isProfileLoading && discordId !== undefined) {
    return 'Loading ranked Uma stats.';
  }

  if (discordId === undefined) {
    return 'Profile lookup is unavailable from this room page.';
  }

  if (profile?.statsPrivate === true) {
    return 'Ranked Uma stats are private.';
  }

  if (profile?.error !== undefined) {
    return 'Unable to load ranked Uma stats.';
  }

  if (profile === undefined) {
    return 'Profile data has not loaded yet.';
  }

  return undefined;
}

async function getStoredTheme(): Promise<SidePanelTheme> {
  const values = await browser.storage.local.get(SIDE_PANEL_THEME_STORAGE_KEY);
  const storedTheme = values[SIDE_PANEL_THEME_STORAGE_KEY];

  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
}

async function getStoredStatsScope(): Promise<PlayerStatsScope> {
  const values = await browser.storage.local.get(STATS_SCOPE_STORAGE_KEY);
  const storedStatsScope = values[STATS_SCOPE_STORAGE_KEY];

  return storedStatsScope === 'allTime' || storedStatsScope === 'currentSeason'
    ? storedStatsScope
    : 'currentSeason';
}
