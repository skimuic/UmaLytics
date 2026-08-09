# UmaLytics Beta Testing

UmaLytics is currently distributed as an unpacked browser extension for private testing.

## Packages

- Chrome / Edge: `umalytics-chrome-edge-beta.zip`
- Firefox: `umalytics-firefox-beta.zip`
- Opera GX: `umalytics-opera-gx-beta.zip`

## Install

Chrome or Edge:
1. Unzip `umalytics-chrome-edge-beta.zip`.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the unzipped `chrome-edge-mv3` folder.
6. Open `https://drafter.uma.guide/`, refresh the page, and open the UmaLytics side panel.

Firefox:
1. Unzip `umalytics-firefox-beta.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on.
4. Select `firefox-mv3/manifest.json`.
5. Open `https://drafter.uma.guide/`, refresh the page, and click the UmaLytics toolbar icon.

Opera GX:
1. Unzip `umalytics-opera-gx-beta.zip`.
2. Open `opera://extensions`.
3. Turn on Developer Mode.
4. Click Load unpacked.
5. Select the unzipped `opera-gx-mv3` folder.
6. Open `https://drafter.uma.guide/`, refresh the page, and click the UmaLytics toolbar icon.

## Updating

1. Remove or replace the old unzipped beta folder.
2. Go back to the browser extensions page.
3. Click Reload on UmaLytics, or remove the old temporary add-on and load the new one.
4. Refresh the Uma Drafter page.

## Test Checklist

- Lobby detection shows the correct room code.
- Player count updates when players join, leave, or swap teams.
- Both teams show five stable slots.
- Player profile links open correctly.
- Season and All-time toggle changes W-L, PPG, Most Played, and Best Performing.
- Best Performing includes 3+ game samples and marks small samples clearly.
- Refresh button respects the wait timer and does not spam requests.
- Chrome/Edge side panel opens and Popout works.
- Firefox and Opera GX toolbar icons open a separate UmaLytics window.
- No obvious cutoff, overlap, or unreadable text in dark mode.

## Feedback To Send

- Browser and version.
- Extension package used.
- Room code or screenshot if lobby detection is wrong.
- What looked wrong, what you expected, and whether refreshing the Drafter page fixed it.

## Notes

- UmaLytics only runs on `https://drafter.uma.guide/*`.
- Profile scouting data is read from Uma Drafter pages/API and cached locally by the extension.
- Firefox temporary add-ons disappear after restarting Firefox.
