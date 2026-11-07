export function resolveSignalingUrl(hostname: string, configured?: string, origin?: string) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (configured === 'same-origin') {
    const page = new URL(origin || `https://${hostname}`);
    if (
      page.hostname !== hostname ||
      (page.protocol !== 'https:' && !(local && page.protocol === 'http:'))
    )
      throw new Error('Signaling requires HTTPS.');
    return `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}/`;
  }
  if (!configured && local) return `ws://${hostname}:8787`;
  if (!configured) throw new Error('Remote signaling is not configured. Use the local demo.');
  const url = new URL(configured);
  if (
    url.protocol !== 'wss:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Configure a secure signaling origin without credentials, query or path.');
  return url.href;
}

export function signalingUrl() {
  return resolveSignalingUrl(
    location.hostname,
    process.env.NEXT_PUBLIC_SIGNAL_URL,
    location.origin,
  );
}

export async function connectSignaling(
  onMessage: (message: unknown) => void,
  onClose: () => void,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new Error('Cancelled.');
  const socket = new WebSocket(signalingUrl());
  socket.onmessage = (event) => {
    try {
      if (typeof event.data !== 'string' || event.data.length > 32 * 1024)
        throw new Error('Invalid signaling payload.');
      onMessage(JSON.parse(event.data));
    } catch {
      socket.close();
    }
  };
  socket.onclose = onClose;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Signaling timed out. Check your connection and try again.'));
    }, 10_000);
    const stop = () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('Cancelled.'));
    };
    signal.addEventListener('abort', stop, { once: true });
    socket.onopen = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      resolve();
    };
    socket.onerror = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      reject(new Error('Cannot reach signaling. Check your connection and try again.'));
    };
  });
  if (signal.aborted) {
    socket.close();
    throw new Error('Cancelled.');
  }
  return socket;
}
