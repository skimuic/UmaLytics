import { browser } from 'wxt/browser';
import { isUmaLyticsMessage } from '../utils/messaging';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isUmaLyticsMessage(message)) {
      return;
    }

    if (message.type === 'prematch-roster-detected') {
      console.log('[UmaLytics] Roster detected:', message.roster);
    }
  });
});
