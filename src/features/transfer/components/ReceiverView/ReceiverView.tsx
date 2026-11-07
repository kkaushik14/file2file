'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { LinkEnvelope } from '@/contracts/transfer';
import { ActionButton } from '@/components/ui/ActionButton/ActionButton';
import { parseLink, unlockLink } from '../../domain/crypto';
import { TransferSession, type TransferProgress } from '../../domain/session';
import { TransferStatus } from '../TransferStatus/TransferStatus';
import styles from './ReceiverView.module.css';

export function ReceiverView() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const envelope = useRef<LinkEnvelope | null>(null);
  const initialFragment = useRef<string | null>(null);
  const session = useRef<TransferSession | null>(null);
  const blobUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Link secrets are read and removed only in the browser, never during static rendering.
    initialFragment.current ??= location.hash;
    const fragment = initialFragment.current;
    history.replaceState(null, '', location.pathname);
    const initialize = async () => {
      try {
        const parsed = parseLink(fragment);
        envelope.current = parsed;
        setAvailable(true);
        expiryTimer.current = setTimeout(() => {
          generation.current += 1;
          session.current?.close();
          envelope.current = null;
          initialFragment.current = null;
          if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
          blobUrl.current = null;
          setDownload(null);
          setPin('');
          setAvailable(false);
          setBusy(false);
          setProgress(null);
          setError('This transfer has expired. Ask the sender for a new link.');
        }, parsed.expiresAt - Date.now());
      } catch {
        setError('This link is missing, invalid, or expired. Ask the sender for a new link.');
      }
    };
    void initialize();
    const dispose = () => {
      generation.current += 1;
      session.current?.close();
      envelope.current = null;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      if (retry.current) clearTimeout(retry.current);
    };
    const leave = () => {
      dispose();
      initialFragment.current = null;
      session.current = null;
      blobUrl.current = null;
      setPin('');
      setDownload(null);
      setAvailable(false);
      setBusy(false);
      setProgress(null);
      setCooldown(false);
      setError('Transfer cleared when you left this page. Ask the sender for a new link.');
    };
    window.addEventListener('pagehide', leave);
    return () => {
      dispose();
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  function cancel() {
    generation.current += 1;
    session.current?.close();
    envelope.current = null;
    initialFragment.current = null;
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    if (retry.current) clearTimeout(retry.current);
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null;
    setDownload(null);
    setPin('');
    setAvailable(false);
    setBusy(false);
    setProgress(null);
    setError('Transfer cleared. Open a new link to receive another file.');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || cooldown || !envelope.current) return;
    const operation = ++generation.current;
    const link = envelope.current;
    setBusy(true);
    setError('');
    let unlocked: Awaited<ReturnType<typeof unlockLink>>;
    try {
      unlocked = await unlockLink(link, pin);
    } catch {
      if (generation.current !== operation) return;
      const count = attempts + 1;
      setAttempts(count);
      setBusy(false);
      setPin('');
      if (count >= 5) {
        envelope.current = null;
        initialFragment.current = null;
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        setAvailable(false);
        setError(
          'Five attempts used in this view. Link material cleared. Ask the sender for a new link.',
        );
      } else {
        setError(`Unable to unlock. Check the PIN. ${5 - count} attempts left in this view.`);
        setCooldown(true);
        retry.current = setTimeout(() => setCooldown(false), 500 * 2 ** (count - 1));
      }
      return;
    }
    if (generation.current !== operation) {
      unlocked.root.fill(0);
      return;
    }
    setPin('');
    const controller = new TransferSession({
      progress: (value) => {
        if (generation.current === operation) setProgress(value);
      },
      error: (message) => {
        if (generation.current === operation) {
          setError(message);
          setBusy(false);
          setAvailable(false);
          envelope.current = null;
          initialFragment.current = null;
          if (expiryTimer.current) clearTimeout(expiryTimer.current);
          setProgress(null);
        }
      },
      complete: (file) => {
        if (generation.current !== operation || !file) return;
        const url = URL.createObjectURL(file.blob);
        blobUrl.current = url;
        setDownload({ url, name: file.name });
        setBusy(false);
        setAvailable(false);
        setProgress(null);
        envelope.current = null;
        initialFragment.current = null;
      },
    });
    session.current = controller;
    try {
      await controller.receiveFile(link, unlocked.root, unlocked.admission);
    } catch (cause) {
      controller.close();
      if (generation.current === operation) {
        setError(cause instanceof Error ? cause.message : 'Connection failed.');
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        setBusy(false);
        setAvailable(false);
        setProgress(null);
        envelope.current = null;
        initialFragment.current = null;
      }
    }
  }

  return (
    <section className={styles.view}>
      <p className={styles.eyebrow}>02 / RECEIVE</p>
      <h1>A file is on its way.</h1>
      <p className={styles.intro}>
        Enter the PIN from your sender. Your browser will connect, verify the file, and prepare it
        to save.
      </p>
      <div className={styles.panel}>
        {available && !download && (
          <form onSubmit={submit} className={styles.form}>
            <label htmlFor="receive-pin">Transfer PIN</label>
            <input
              id="receive-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="(?:[0-9]{6}|[0-9]{8})"
              minLength={6}
              maxLength={8}
              required
              value={pin}
              disabled={busy || cooldown}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="6 or 8 digits"
            />
            <ActionButton type="submit" disabled={busy || cooldown}>
              {busy
                ? 'Opening your transfer…'
                : cooldown
                  ? 'Wait before trying again…'
                  : 'Unlock and receive'}
            </ActionButton>
          </form>
        )}
        {progress && <TransferStatus progress={progress} />}
        {download && (
          <div className={styles.ready}>
            <h2 role="status">Verified. Ready to save.</h2>
            <p>{download.name}</p>
            <a className={styles.save} href={download.url} download={download.name}>
              Save file
            </a>
            <p className={styles.help}>
              Integrity verified, not scanned for malware. Only open files from someone you trust.
              Available until you clear this page or the original link expires. Saved downloads stay
              on your device.
            </p>
          </div>
        )}
        {(available || download) && (
          <ActionButton variant="secondary" onClick={cancel}>
            {download ? 'Clear file from this page' : 'Cancel transfer'}
          </ActionButton>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!available && !download && <Link href="/">Send a file instead</Link>}
      </div>
      <p className={styles.help}>
        By using File2File, you agree to the <a href="/terms/">Terms of Use</a>. Read our{' '}
        <a href="/privacy/">Privacy Policy</a>. Leaving this page ends an active transfer.
      </p>
      <p className={styles.help}>
        The sender must keep their tab open. A PIN adds a barrier; someone with the full link can
        still guess it offline. A relay, when used, forwards encrypted data without storing the
        file.
      </p>
    </section>
  );
}
