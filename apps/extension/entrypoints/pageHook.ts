const SYNCED_DRAFT_STATE_MESSAGE_TYPE = 'umalytics:synced-draft-state';

type JsonRecord = Record<string, unknown>;

export default defineUnlistedScript(() => {
  installFetchHook();
  installXhrHook();
  installWebSocketHook();
  scanBrowserStorage();

  window.setInterval(scanBrowserStorage, 2_000);
});

function installFetchHook(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof window.fetch>): Promise<Response> => {
    const response = await originalFetch(...args);
    inspectResponse(response.clone());
    return response;
  };
}

function installXhrHook(): void {
  const originalSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.send = function sendWithUmaLyticsInspection(
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest['send']>
  ): void {
    this.addEventListener('load', () => {
      if (typeof this.responseText !== 'string' || this.responseText.length === 0) {
        return;
      }

      inspectPossibleJson(this.responseText);
    });

    originalSend.apply(this, args);
  };
}

function installWebSocketHook(): void {
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>) {
      const socket = new target(...args);

      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        inspectPossiblePayload(event.data);
      });

      return socket;
    }
  });

  window.WebSocket.prototype = OriginalWebSocket.prototype;
}

function scanBrowserStorage(): void {
  scanStorageArea(window.localStorage);
  scanStorageArea(window.sessionStorage);
}

function scanStorageArea(storage: Storage): void {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key === null) {
      continue;
    }

    const value = storage.getItem(key);

    if (value !== null) {
      inspectPossibleJson(value);
    }
  }
}

async function inspectResponse(response: Response): Promise<void> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      inspectPossiblePayload(await response.json());
      return;
    } catch {
      return;
    }
  }

  try {
    inspectPossibleJson(await response.text());
  } catch {
    // Ignore unreadable response bodies.
  }
}

function inspectPossiblePayload(payload: unknown): void {
  if (typeof payload === 'string') {
    inspectPossibleJson(payload);
    return;
  }

  const syncedDraftState = findSyncedDraftState(payload);

  if (syncedDraftState !== null) {
    window.postMessage(
      {
        type: SYNCED_DRAFT_STATE_MESSAGE_TYPE,
        payload: syncedDraftState
      },
      window.location.origin
    );
  }
}

function inspectPossibleJson(value: string): void {
  if (!value.includes('rankedQueueRoster') && !value.includes('syncedDraftState_multiplayer')) {
    return;
  }

  try {
    inspectPossiblePayload(JSON.parse(value));
  } catch {
    // Some realtime protocols wrap JSON in non-JSON frames; those can be decoded later once observed.
  }
}

function findSyncedDraftState(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.syncedDraftState_multiplayer)) {
    return value;
  }

  if (Array.isArray(value.rankedQueueRoster)) {
    return {
      syncedDraftState_multiplayer: value
    };
  }

  for (const child of Object.values(value)) {
    if (!isRecord(child) && !Array.isArray(child)) {
      continue;
    }

    const nestedState = findSyncedDraftStateInContainer(child);

    if (nestedState !== null) {
      return nestedState;
    }
  }

  return null;
}

function findSyncedDraftStateInContainer(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedState = findSyncedDraftState(item);

      if (nestedState !== null) {
        return nestedState;
      }
    }

    return null;
  }

  return findSyncedDraftState(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
