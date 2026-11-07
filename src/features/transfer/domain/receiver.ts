import { object, parseManifest, type Manifest } from '@/contracts/transfer';
import { decode, decryptRecord, type Bytes } from './crypto';

export class FileReceiver {
  private next = 0;
  private parts: Blob[] = [];
  private batch: Bytes[] = [];
  private batchBytes = 0;
  private manifest: Manifest | null = null;
  private received = 0;
  private disposed = false;
  complete = false;

  constructor(
    private key: CryptoKey,
    private id: string,
  ) {}

  async accept(record: Bytes) {
    if (this.disposed || this.complete) throw new Error('Transfer is closed.');
    const plain = await decryptRecord(this.key, this.id, 'sender', this.next, record);
    if (this.disposed) {
      plain.fill(0);
      throw new Error('Transfer cancelled.');
    }
    if (!this.manifest) {
      this.manifest = parseManifest(decode(plain));
      plain.fill(0);
    } else if (this.next <= this.manifest.chunks) {
      const expected = Math.min(this.manifest.chunkSize, this.manifest.size - this.received);
      if (plain.length !== expected) {
        plain.fill(0);
        throw new Error('Invalid chunk length.');
      }
      this.batch.push(plain);
      this.batchBytes += plain.length;
      if (this.batchBytes >= 1024 * 1024) this.flush();
      this.received += plain.length;
    } else {
      const end = object(decode(plain));
      plain.fill(0);
      if (
        end.type !== 'complete' ||
        end.size !== this.manifest.size ||
        end.chunks !== this.manifest.chunks ||
        this.received !== this.manifest.size
      )
        throw new Error('Incomplete file.');
      this.complete = true;
    }
    this.next += 1;
    return {
      name: this.manifest.name,
      size: this.manifest.size,
      received: this.received,
      complete: this.complete,
    };
  }

  takeBlob() {
    if (!this.complete || this.disposed) throw new Error('File is not verified.');
    this.flush();
    const blob = new Blob(this.parts, { type: 'application/octet-stream' });
    this.clear();
    return blob;
  }

  clear() {
    this.disposed = true;
    for (const part of this.batch) part.fill(0);
    this.batch = [];
    this.batchBytes = 0;
    this.parts = [];
    this.manifest = null;
  }

  private flush() {
    if (!this.batchBytes) return;
    // Blob snapshots release the mutable decrypted chunks in bounded batches.
    // The browser still owns up to MAX_FILE_BYTES of backing data; this is not
    // a constant-memory disk stream or a guarantee against browser swapping.
    this.parts.push(new Blob(this.batch, { type: 'application/octet-stream' }));
    for (const part of this.batch) part.fill(0);
    this.batch = [];
    this.batchBytes = 0;
  }
}
