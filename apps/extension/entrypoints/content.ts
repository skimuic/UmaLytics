import { extractMatchCodeFromUrl } from '../utils/matchDetection';
import { sendPrematchRoster } from '../utils/messaging';
import { extractPrematchRosterFromSyncedDraftState } from '../utils/playerExtraction';

const SYNCED_DRAFT_STATE_MESSAGE_TYPE = 'umalytics:synced-draft-state';

export default defineContentScript({
  matches: ['https://drafter.uma.guide/*'],
  runAt: 'document_idle',
  main() {
    console.log('[UmaLytics] Extension loaded');

    const matchCode = extractMatchCodeFromUrl(window.location.href);

    if (matchCode !== undefined) {
      console.log(`[UmaLytics] Match detected: ${matchCode}`);
    }

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      void handleWindowMessage(event.data, matchCode);
    });
  }
});

async function handleWindowMessage(message: unknown, matchCode?: string): Promise<void> {
  if (!isRecord(message) || message.type !== SYNCED_DRAFT_STATE_MESSAGE_TYPE) {
    return;
  }

  const roster = extractPrematchRosterFromSyncedDraftState(message.payload, matchCode);

  if (roster === null) {
    return;
  }

  if (roster.players.length !== 10) {
    console.log(`[UmaLytics] Roster candidate detected with ${roster.players.length} players`);
    return;
  }

  console.log('[UmaLytics] Roster detected: 10 players', roster);
  await sendPrematchRoster(roster);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
