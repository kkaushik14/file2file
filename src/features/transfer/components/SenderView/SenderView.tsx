'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_FILE_BYTES, validPin } from '@/contracts/transfer';
import { ActionButton } from '@/components/ui/ActionButton/ActionButton';
import { TransferSession, type TransferProgress } from '../../domain/session';
import { PrivacyNote } from '../PrivacyNote/PrivacyNote';
import { TransferStatus } from '../TransferStatus/TransferStatus';
import styles from './SenderView.module.css';

export function SenderView() {
  const [file, setFile] = useState<File | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [complete, setComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const session = useRef<TransferSession | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);

  useEffect(() => {
    const dispose = () => {
      generation.current += 1;
      session.current?.close();
    };
    const leave = () => {
      dispose();
      session.current = null;
      setFile(null);
      setPin('');
      setLink(null);
      setProgress(null);
      setBusy(false);
      setComplete(false);
      setCopied(false);
      setError('');
      form.current?.reset();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      dispose();
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  function reset() {
    generation.current += 1;
    session.current?.close();
    session.current = null;
    setBusy(false);
    setLink(null);
    setPin('');
    setFile(null);
    setProgress(null);
    setComplete(false);
    setError('');
    setCopied(false);
    form.current?.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file || file.size > MAX_FILE_BYTES || !validPin(pin)) {
      setError('Choose a file up to 50 MiB and a 6- or 8-digit PIN.');
      return;
    }
    if (!globalThis.isSecureContext || !crypto.subtle || !globalThis.RTCPeerConnection) {
      setError('Use a browser with WebRTC on HTTPS or localhost.');
      return;
    }
    const operation = ++generation.current;
    setBusy(true);
    setError('');
    setComplete(false);
    setProgress({ label: 'Preparing your encrypted link', bytes: 0, total: file.size });
    const controller = new TransferSession({
      progress: (next) => {
        if (generation.current === operation) setProgress(next);
      },
      error: (message) => {
        if (generation.current !== operation) return;
        setError(message);
        setBusy(false);
        setLink(null);
        setPin('');
        setFile(null);
        setProgress(null);
        form.current?.reset();
      },
      complete: () => {
        if (generation.current !== operation) return;
        setComplete(true);
        setBusy(false);
        setLink(null);
        setPin('');
        setFile(null);
        setProgress(null);
        form.current?.reset();
      },
    });
    session.current = controller;
    try {
      const result = await controller.sendFile(file, pin);
      if (generation.current === operation) {
        setLink(result);
        setPin('');
        setFile(null);
        form.current?.reset();
      }
    } catch (cause) {
      controller.close();
      if (generation.current === operation) {
        setError(cause instanceof Error ? cause.message : 'Cannot create the transfer.');
        setBusy(false);
        setProgress(null);
        setPin('');
        setFile(null);
        form.current?.reset();
      }
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link!.url);
      setCopied(true);
    } catch {
      setError('Clipboard unavailable. Select and copy the link below.');
    }
  }

  return (
    <div className={styles.layout}>
      <section>
        <p className={styles.eyebrow}>PRIVATE BY DESIGN. TEMPORARY BY DEFAULT.</p>
        <h1>
          A file.
          <br />A link. <em>A handoff.</em>
        </h1>
        <p className={styles.intro}>
          Share between browsers. No upload folder, no account, no file stored on a server.
        </p>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            <h2>Send a file</h2>
            <span>01 / SEND</span>
          </div>
          <form ref={form} onSubmit={submit} className={styles.form}>
            {!busy && !complete && (
              <>
                <label className={styles.fileField}>
                  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
                    <path
                      d="M8 3h11l6 6v20H8zM19 3v7h6M12 17h9M12 22h6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <strong>{file ? file.name : 'Choose your file'}</strong>
                  <span>Any file type · Up to 50 MiB</span>
                  <input
                    aria-label="Choose a file"
                    type="file"
                    required
                    onChange={(event) => {
                      setFile(event.target.files?.[0] || null);
                      setError('');
                    }}
                  />
                </label>
                <label className={styles.pinLabel}>
                  Your PIN
                  <input
                    aria-describedby="pin-help"
                    type="password"
                    inputMode="numeric"
                    pattern="(?:[0-9]{6}|[0-9]{8})"
                    minLength={6}
                    maxLength={8}
                    required
                    autoComplete="off"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                    placeholder="6 or 8 digits"
                  />
                </label>
                <p id="pin-help" className={styles.help}>
                  Share this PIN separately from the link.
                </p>
                <ActionButton type="submit">Create transfer link</ActionButton>
              </>
            )}
            {progress && <TransferStatus progress={progress} />}
            {link && (
              <div className={styles.linkBox}>
                <label htmlFor="share-link">Your private link</label>
                <input
                  id="share-link"
                  readOnly
                  value={link.url}
                  onFocus={(event) => event.target.select()}
                />
                <p className={styles.help}>
                  Keep this tab open. Expires at{' '}
                  {new Date(link.expiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                </p>
                <ActionButton onClick={copyLink}>
                  {copied ? 'Link copied' : 'Copy link'}
                </ActionButton>
              </div>
            )}
            {busy && (
              <ActionButton variant="secondary" onClick={reset}>
                Cancel transfer
              </ActionButton>
            )}
            {complete && (
              <div className={styles.success}>
                <h3 role="status">File received and verified.</h3>
                <p>The receiver can now save it. This link is closed.</p>
                <ActionButton onClick={reset}>Send another file</ActionButton>
              </div>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </form>
          <p className={styles.localNote}>
            {process.env.NEXT_PUBLIC_NETWORK_MODE === 'stun'
              ? 'Free test preview: direct connections only. Some mobile or restricted networks need a relay, which is not enabled. Keep both tabs open.'
              : 'Keep both tabs open. Transfers connect directly when possible or use an encrypted relay when configured. Allow local-network access if your browser asks.'}
          </p>
        </div>
        <p className={styles.help}>
          By using File2File, you agree to the <a href="/terms/">Terms of Use</a>. Read our{' '}
          <a href="/privacy/">Privacy Policy</a>. Leaving this page ends an active transfer.
        </p>
      </section>
      <PrivacyNote />
    </div>
  );
}
