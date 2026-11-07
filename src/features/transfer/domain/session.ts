import {
  CHUNK_BYTES,
  ID_PATTERN,
  MAX_FILE_BYTES,
  MAX_RECORD_BYTES,
  object,
  parseSignal,
  safeFilename,
  SESSION_TTL_MS,
  TOKEN_PATTERN,
  type LinkEnvelope,
  type Manifest,
  type SignalData,
} from '@/contracts/transfer';
import {
  createLink,
  decode,
  decryptRecord,
  deriveTransferKeys,
  encode,
  encryptRecord,
  type Bytes,
} from './crypto';
import { FileReceiver } from './receiver';
import { connectSignaling } from './signaling';
import { parseIceConfiguration } from '@/contracts/ice';

export type TransferProgress = { label: string; bytes: number; total: number };
type Callbacks = {
  progress: (progress: TransferProgress) => void;
  error: (message: string) => void;
  complete: (file?: { blob: Blob; name: string }) => void;
};
type Created = { id: string; expiresAt: number; admission: string };

export class TransferSession {
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private keys?: Awaited<ReturnType<typeof deriveTransferKeys>>;
  private receiver?: FileReceiver;
  private file?: File;
  private id = '';
  private role: 'sender' | 'receiver' = 'sender';
  private abort = new AbortController();
  private done = false;
  private expired?: ReturnType<typeof setTimeout>;
  private inactivity?: ReturnType<typeof setTimeout>;
  private controlSequence = 0;
  private queuedBytes = 0;
  private records = Promise.resolve();
  private signals = Promise.resolve();
  private queuedSignals = 0;
  private queuedSignalBytes = 0;
  private candidates: RTCIceCandidateInit[] = [];
  private creation?: { resolve: (value: Created) => void; reject: (error: Error) => void };

  constructor(private callbacks: Callbacks) {}

  async sendFile(file: File, pin: string) {
    if (file.size > MAX_FILE_BYTES) throw new Error('Choose a file of 50 MiB or less.');
    this.file = file;
    this.refreshDeadline();
    this.socket = await connectSignaling(
      (value) => this.handleSignal(value),
      () => this.disconnected(),
      this.abort.signal,
    );
    const created = new Promise<Created>((resolve, reject) => {
      this.creation = { resolve, reject };
    });
    this.signal({ type: 'create' });
    const session = await created;
    this.assertActive();
    this.id = session.id;
    this.setExpiry(session.expiresAt);
    const link = await createLink(session.id, session.expiresAt, session.admission, pin);
    try {
      this.assertActive();
      const keys = await deriveTransferKeys(link.root, this.id);
      this.assertActive();
      this.keys = keys;
    } finally {
      link.root.fill(0);
    }
    clearTimeout(this.inactivity);
    this.callbacks.progress({ label: 'Waiting for the receiver', bytes: 0, total: file.size });
    return { url: `${location.origin}/receive/#${link.fragment}`, expiresAt: session.expiresAt };
  }

  async receiveFile(envelope: LinkEnvelope, root: Bytes, admission: string) {
    this.role = 'receiver';
    this.id = envelope.id;
    this.setExpiry(envelope.expiresAt);
    try {
      const keys = await deriveTransferKeys(root, this.id);
      this.assertActive();
      this.keys = keys;
    } finally {
      root.fill(0);
    }
    this.receiver = new FileReceiver(this.keys.sender, this.id);
    this.refreshDeadline();
    this.callbacks.progress({ label: 'Connecting to the sender', bytes: 0, total: 0 });
    this.socket = await connectSignaling(
      (value) => this.handleSignal(value),
      () => this.disconnected(),
      this.abort.signal,
    );
    this.signal({ type: 'join', id: this.id, admission });
  }

  private setExpiry(expiry: number) {
    if (expiry <= Date.now() || expiry > Date.now() + SESSION_TTL_MS + 60_000)
      throw new Error('Session expired or invalid.');
    this.expired = setTimeout(
      () => this.fail('This transfer has expired. Ask the sender for a new link.'),
      expiry - Date.now(),
    );
  }

  private assertActive() {
    if (this.abort.signal.aborted) throw new Error('Transfer cancelled.');
  }

  private refreshDeadline() {
    clearTimeout(this.inactivity);
    this.inactivity = setTimeout(
      () =>
        this.fail(
          'Connection stalled. Keep both tabs open and try a new link. If it repeats, check the network and relay service.',
        ),
      30_000,
    );
  }

  private signal(value: unknown) {
    this.assertActive();
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Signaling disconnected.');
    this.socket.send(JSON.stringify(value));
  }

  private handleSignal(value: unknown) {
    if (this.abort.signal.aborted || this.done) return;
    const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (this.queuedSignals >= 128 || this.queuedSignalBytes + size > 256 * 1024) {
      this.fail('Too much connection data. Ask the sender for a new link.');
      return;
    }
    this.queuedSignals += 1;
    this.queuedSignalBytes += size;
    this.signals = this.signals
      .then(async () => {
        this.assertActive();
        const message = object(value);
        if (message.type === 'created') {
          if (
            !this.creation ||
            typeof message.id !== 'string' ||
            !ID_PATTERN.test(message.id) ||
            typeof message.admission !== 'string' ||
            !TOKEN_PATTERN.test(message.admission) ||
            !Number.isSafeInteger(message.expiresAt)
          )
            throw new Error('Invalid session.');
          this.creation.resolve(message as Created);
          this.creation = undefined;
        } else if (message.type === 'paired' && this.role === 'sender') {
          this.setupPeer(message.ice);
          this.refreshDeadline();
          this.callbacks.progress({
            label: 'Connecting to the receiver',
            bytes: 0,
            total: this.file?.size || 0,
          });
          const peer = this.peer!;
          this.attachChannel(peer.createDataChannel('file2file-v1', { ordered: true }));
          await peer.setLocalDescription(await peer.createOffer());
          this.signal({ type: 'signal', data: { type: 'offer', sdp: peer.localDescription!.sdp } });
        } else if (message.type === 'signal') {
          await this.acceptSignal(parseSignal(message.data));
        } else if (message.type === 'joined' && this.role === 'receiver') {
          this.setupPeer(message.ice);
        } else if (message.type === 'ended' || message.type === 'error') {
          throw new Error(
            message.reason === 'expired'
              ? 'This transfer has expired.'
              : 'Session unavailable. Keep the sender tab open and use a new link.',
          );
        } else throw new Error('Unexpected signaling message.');
      })
      .catch((error: unknown) =>
        this.fail(error instanceof Error ? error.message : 'Connection failed.'),
      )
      .finally(() => {
        this.queuedSignals -= 1;
        this.queuedSignalBytes -= size;
      });
  }

  private setupPeer(value: unknown) {
    if (this.peer) throw new Error('Connection already configured.');
    const configuration = parseIceConfiguration(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (configuration.mode === 'local' && !local)
      throw new Error('Cross-network transfers require a configured relay service.');
    const peer = new RTCPeerConnection({
      iceServers: configuration.iceServers,
      iceTransportPolicy: configuration.iceTransportPolicy,
    });
    this.peer = peer;
    peer.onicecandidate = ({ candidate }) => {
      if (this.done || this.abort.signal.aborted) return;
      try {
        this.signal({
          type: 'signal',
          data: {
            type: 'candidate',
            candidate: candidate?.candidate || '',
            sdpMid: candidate?.sdpMid ?? null,
            sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
          },
        });
      } catch {
        this.disconnected();
      }
    };
    peer.ondatachannel = ({ channel }) => {
      if (
        this.role !== 'receiver' ||
        this.channel ||
        channel.label !== 'file2file-v1' ||
        !channel.ordered ||
        channel.maxRetransmits !== null ||
        channel.maxPacketLifeTime !== null
      ) {
        channel.close();
        this.fail('Invalid transfer channel.');
        return;
      }
      this.attachChannel(channel);
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) this.disconnected();
    };
  }

  private async acceptSignal(data: SignalData) {
    const peer = this.peer;
    if (!peer) throw new Error('Connection is not configured.');
    if (data.type === 'candidate') {
      const candidate = {
        candidate: data.candidate,
        sdpMid: data.sdpMid,
        sdpMLineIndex: data.sdpMLineIndex,
      };
      if (this.candidates.length >= 128) throw new Error('Too many connection candidates.');
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else this.candidates.push(candidate);
      return;
    }
    if (
      (this.role === 'sender' && data.type !== 'answer') ||
      (this.role === 'receiver' && data.type !== 'offer') ||
      peer.remoteDescription
    )
      throw new Error('Invalid connection negotiation.');
    await peer.setRemoteDescription({ type: data.type, sdp: data.sdp });
    for (const candidate of this.candidates) await peer.addIceCandidate(candidate);
    this.candidates = [];
    if (data.type === 'offer') {
      await peer.setLocalDescription(await peer.createAnswer());
      this.signal({ type: 'signal', data: { type: 'answer', sdp: peer.localDescription!.sdp } });
    }
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 64 * 1024;
    channel.onclose = () => this.disconnected();
    channel.onerror = () => this.fail('The file connection failed. Try a new link.');
    let started = false;
    const startChannel = () => {
      if (started || this.abort.signal.aborted) return;
      started = true;
      if (this.role === 'receiver') {
        void this.sendRecord('receiver', 0, encode({ type: 'ready' })).catch(() =>
          this.fail('Cannot start the transfer.'),
        );
      }
    };
    channel.onopen = startChannel;
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (this.done || this.abort.signal.aborted) return;
      if (
        !(data instanceof ArrayBuffer) ||
        data.byteLength > MAX_RECORD_BYTES ||
        data.byteLength < 20
      ) {
        this.fail('Invalid transfer record.');
        return;
      }
      this.queuedBytes += data.byteLength;
      if (this.queuedBytes > 512 * 1024) {
        this.fail('The receiver cannot keep up. Try a smaller file.');
        return;
      }
      this.records = this.records
        .then(async () => {
          this.assertActive();
          this.refreshDeadline();
          if (this.role === 'receiver') await this.acceptFileRecord(new Uint8Array(data));
          else await this.acceptControlRecord(new Uint8Array(data));
        })
        .catch(() => this.fail('Transfer verification failed. No download was created.'))
        .finally(() => {
          this.queuedBytes -= data.byteLength;
        });
    };
    if (channel.readyState === 'open') startChannel();
  }

  private async sendRecord(direction: 'sender' | 'receiver', sequence: number, plain: Bytes) {
    this.assertActive();
    const record = await encryptRecord(this.keys![direction], this.id, direction, sequence, plain);
    this.assertActive();
    const channel = this.channel!;
    const maximum = this.peer?.sctp?.maxMessageSize;
    if (maximum && record.byteLength > maximum) throw new Error('Peer message limit is too small.');
    const start = Date.now();
    if (channel.bufferedAmount > 256 * 1024) {
      while (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.assertActive();
        if (Date.now() - start > 30_000) throw new Error('Send timed out.');
      }
    }
    if (channel.readyState !== 'open') throw new Error('Connection closed.');
    channel.send(record.buffer);
    this.refreshDeadline();
  }

  private async acceptControlRecord(record: Bytes) {
    const plain = await decryptRecord(
      this.keys!.receiver,
      this.id,
      'receiver',
      this.controlSequence,
      record,
    );
    this.assertActive();
    const control = object(decode(plain));
    plain.fill(0);
    if (this.controlSequence === 0 && control.type === 'ready') {
      this.controlSequence += 1;
      await this.streamFile();
    } else if (this.controlSequence === 1 && control.type === 'ack') {
      this.done = true;
      this.callbacks.complete();
      this.close();
    } else throw new Error('Invalid acknowledgement.');
  }

  private async streamFile() {
    const file = this.file!;
    const manifest: Manifest = {
      type: 'manifest',
      name: safeFilename(file.name),
      size: file.size,
      chunkSize: CHUNK_BYTES,
      chunks: Math.ceil(file.size / CHUNK_BYTES),
    };
    await this.sendRecord('sender', 0, encode(manifest));
    let lastUpdate = 0;
    for (let index = 0; index < manifest.chunks; index += 1) {
      this.assertActive();
      const bytes = new Uint8Array(
        await file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer(),
      );
      try {
        await this.sendRecord('sender', index + 1, bytes);
      } finally {
        bytes.fill(0);
      }
      if (Date.now() - lastUpdate > 100) {
        this.callbacks.progress({
          label: 'Sending encrypted file',
          bytes: Math.min((index + 1) * CHUNK_BYTES, file.size),
          total: file.size,
        });
        lastUpdate = Date.now();
      }
    }
    await this.sendRecord(
      'sender',
      manifest.chunks + 1,
      encode({ type: 'complete', size: manifest.size, chunks: manifest.chunks }),
    );
    this.callbacks.progress({
      label: 'Waiting for receiver verification',
      bytes: file.size,
      total: file.size,
    });
  }

  private async acceptFileRecord(record: Bytes) {
    const result = await this.receiver!.accept(record);
    this.assertActive();
    if (result.complete) {
      const blob = this.receiver!.takeBlob();
      await this.sendRecord('receiver', 1, encode({ type: 'ack' }));
      this.done = true;
      clearTimeout(this.inactivity);
      clearTimeout(this.expired);
      this.file = undefined;
      this.keys = undefined;
      this.callbacks.complete({ blob, name: safeFilename(result.name) });
    } else
      this.callbacks.progress({
        label: 'Receiving and verifying',
        bytes: result.received,
        total: result.size,
      });
  }

  private disconnected() {
    if (this.done) {
      this.close();
      return;
    }
    if (!this.abort.signal.aborted)
      this.fail('The other browser disconnected. Ask the sender for a new link.');
  }

  private fail(message: string) {
    if (this.abort.signal.aborted || this.done) return;
    this.close();
    this.callbacks.error(message);
  }

  close() {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    clearTimeout(this.expired);
    clearTimeout(this.inactivity);
    this.creation?.reject(new Error('Session closed.'));
    this.creation = undefined;
    this.channel?.close();
    this.peer?.close();
    this.socket?.close();
    this.channel = undefined;
    this.peer = undefined;
    this.socket = undefined;
    this.receiver?.clear();
    this.receiver = undefined;
    this.keys = undefined;
    this.file = undefined;
    this.candidates = [];
  }
}
