import { injectScript } from 'wxt/utils/inject-script';
import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import type { PrematchRoster } from '@umalytics/shared';
import { extractMatchCodeFromUrl } from '../utils/matchDetection';
import { sendPrematchRoster } from '../utils/messaging';
import {
  extractPrematchRosterFromRoomDom,
  extractRoomCodeFromRoomDom
} from '../utils/domLobbyExtraction';
import { extractPrematchRosterFromSyncedDraftState } from '../utils/playerExtraction';

const SYNCED_DRAFT_STATE_MESSAGE_TYPE = 'umalytics:synced-draft-state';
const PAGE_HOOK_SCRIPT_PATH = '/pageHook.js' as ScriptPublicPath;
const ROOM_DOM_SCAN_DEBOUNCE_MS = 750;
type RosterSource = 'dom' | 'synced';

let lastRosterSignature: string | undefined;
let lastRosterMatchCode: string | undefined;
let lastRosterSource: RosterSource | undefined;
let lastIgnoredStaleSyncedMatchCode: string | undefined;
let activeRoomDomMatchCode: string | undefined;
let roomDomScanTimer: number | undefined;
let roomDomObserver: MutationObserver | undefined;
let isContentScriptActive = true;

export default defineContentScript({
  matches: ['https://drafter.uma.guide/*'],
  runAt: 'document_start',
  async main() {
    console.log('[UmaLytics] Extension loaded');

    const initialMatchCode = getCurrentMatchCode();

    if (initialMatchCode !== undefined) {
      console.log(`[UmaLytics] Match detected: ${initialMatchCode}`);
    }

    window.addEventListener('message', handlePageMessage);

    installRoomDomObserver();

    try {
      await injectScript(PAGE_HOOK_SCRIPT_PATH, { keepInDom: true });
    } catch (caught) {
      if (isExtensionContextInvalidatedError(caught)) {
        deactivateContentScript();
        return;
      }

      throw caught;
    }
  }
});

function handlePageMessage(event: MessageEvent<unknown>): void {
  if (!isContentScriptActive) {
    return;
  }

  void handleWindowMessage(event.data, getCurrentMatchCode());
}

async function handleWindowMessage(message: unknown, matchCode?: string): Promise<void> {
  if (!isContentScriptActive) {
    return;
  }

  if (!isRecord(message) || message.type !== SYNCED_DRAFT_STATE_MESSAGE_TYPE) {
    return;
  }

  refreshActiveRoomDomMatchCode(matchCode);

  const roster = extractPrematchRosterFromSyncedDraftState(message.payload, matchCode);

  if (roster === null || roster.players.length !== 10) {
    return;
  }

  if (isStaleSyncedRoster(roster)) {
    if (roster.matchCode !== lastIgnoredStaleSyncedMatchCode) {
      console.debug('[UmaLytics] Ignoring stale synced roster:', roster.matchCode);
      lastIgnoredStaleSyncedMatchCode = roster.matchCode;
    }

    return;
  }

  await publishRoster(roster, 'synced');
}

function installRoomDomObserver(): void {
  queueRoomDomScan();

  roomDomObserver = new MutationObserver(() => {
    queueRoomDomScan();
  });

  roomDomObserver.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true
  });
}

function queueRoomDomScan(): void {
  if (!isContentScriptActive) {
    return;
  }

  if (roomDomScanTimer !== undefined) {
    return;
  }

  roomDomScanTimer = window.setTimeout(() => {
    roomDomScanTimer = undefined;
    void publishRoomDomRoster();
  }, ROOM_DOM_SCAN_DEBOUNCE_MS);
}

async function publishRoomDomRoster(): Promise<void> {
  if (!isContentScriptActive) {
    return;
  }

  const roster = extractPrematchRosterFromRoomDom(document);

  if (roster === null) {
    refreshActiveRoomDomMatchCode(getCurrentMatchCode());
    return;
  }

  activeRoomDomMatchCode = roster.matchCode;
  await publishRoster(roster, 'dom');
}

async function publishRoster(roster: PrematchRoster, source: RosterSource): Promise<void> {
  if (roster.players.length === 0) {
    return;
  }

  if (
    source === 'dom' &&
    lastRosterSource === 'synced' &&
    lastRosterMatchCode === roster.matchCode
  ) {
    return;
  }

  const rosterSignature = getRosterSignature(roster);

  if (rosterSignature === lastRosterSignature) {
    return;
  }

  console.log(`[UmaLytics] Roster detected: ${roster.players.length} players`);
  lastRosterSignature = rosterSignature;
  lastRosterMatchCode = roster.matchCode;
  lastRosterSource = source;

  try {
    await sendPrematchRoster(roster);
  } catch (caught) {
    if (isExtensionContextInvalidatedError(caught)) {
      deactivateContentScript();
      return;
    }

    throw caught;
  }
}

function isStaleSyncedRoster(roster: PrematchRoster): boolean {
  if (activeRoomDomMatchCode === undefined) {
    return false;
  }

  return roster.matchCode !== activeRoomDomMatchCode;
}

function refreshActiveRoomDomMatchCode(fallbackMatchCode?: string): void {
  const visibleRoomDomMatchCode = extractRoomCodeFromRoomDom(document);

  if (visibleRoomDomMatchCode !== undefined) {
    activeRoomDomMatchCode = visibleRoomDomMatchCode;
    return;
  }

  if (
    fallbackMatchCode !== undefined &&
    activeRoomDomMatchCode !== undefined &&
    fallbackMatchCode !== activeRoomDomMatchCode
  ) {
    activeRoomDomMatchCode = undefined;
  }
}

function getRosterSignature(roster: { matchCode?: string; players: Array<{ userId: string; team?: string }> }): string {
  const playerSignature = roster.players
    .map((player) => `${player.userId}:${player.team ?? 'unknown'}`)
    .sort()
    .join('|');

  return `${roster.matchCode ?? 'unknown'}:${playerSignature}`;
}

function getCurrentMatchCode(): string | undefined {
  return extractMatchCodeFromUrl(window.location.href);
}

function deactivateContentScript(): void {
  if (!isContentScriptActive) {
    return;
  }

  isContentScriptActive = false;
  window.removeEventListener('message', handlePageMessage);

  if (roomDomScanTimer !== undefined) {
    window.clearTimeout(roomDomScanTimer);
    roomDomScanTimer = undefined;
  }

  roomDomObserver?.disconnect();
  roomDomObserver = undefined;
  console.debug('[UmaLytics] Disabled stale content script after extension reload.');
}

function isExtensionContextInvalidatedError(caught: unknown): boolean {
  return caught instanceof Error && caught.message.includes('Extension context invalidated');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
