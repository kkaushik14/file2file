import { CHUNK_BYTES, object, parseManifest, type Manifest } from '@/contracts/transfer';
import { decode, decryptRecord, type Bytes } from './crypto';

export class FileReceiver {
  private next = 0;
  private parts: Bytes[] = [];
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
      const expected = Math.min(CHUNK_BYTES, this.manifest.size - this.received);
      if (plain.length !== expected) {
        plain.fill(0);
        throw new Error('Invalid chunk length.');
      }
      this.parts.push(plain);
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
    const blob = new Blob(this.parts, { type: 'application/octet-stream' });
    this.clear();
    return blob;
  }

  clear() {
    this.disposed = true;
    for (const part of this.parts) part.fill(0);
    this.parts = [];
    this.manifest = null;
  }
}
