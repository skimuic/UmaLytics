import { browser } from 'wxt/browser';
import type { PrematchRoster } from '@umalytics/shared';

export type UmaLyticsMessage = {
  type: 'prematch-roster-detected';
  roster: PrematchRoster;
} | {
  type: 'profile-refresh-requested';
  roster: PrematchRoster;
};

export function isUmaLyticsMessage(value: unknown): value is UmaLyticsMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type !== 'prematch-roster-detected' && value.type !== 'profile-refresh-requested') {
    return false;
  }

  return isRecord(value.roster) && Array.isArray(value.roster.players);
}

export async function sendPrematchRoster(roster: PrematchRoster): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'prematch-roster-detected',
    roster
  } satisfies UmaLyticsMessage);
}

export async function sendProfileRefreshRequest(roster: PrematchRoster): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'profile-refresh-requested',
    roster
  } satisfies UmaLyticsMessage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
