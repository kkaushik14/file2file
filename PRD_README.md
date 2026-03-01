# Product Requirements Document (PRD)

## Project Title

Ephemeral, PIN‑Protected, Zero‑Storage File & Folder Sharing Web Application

---

## 1. Purpose & Vision

### 1.1 Purpose

Build a **privacy‑first web application** that allows users to securely share files or folders via a URL, protected by a sender‑defined PIN, **without permanent server-side storage**. The system must ensure:

* No plaintext data is ever stored on servers
* Files are encrypted end‑to‑end in the browser
* Verification (PIN + URL secret) happens client‑side
* Instant availability after verification with no perceived delay
* Complete wipe on verification failure

### 1.2 Vision

To create a sharing mechanism that is **simpler than PGP**, **faster than traditional uploads**, and **more private than cloud storage**, while remaining usable for non‑technical users.

---

## 2. Goals & Non‑Goals

### 2.1 Goals

* Zero permanent storage of user files on any server
* End‑to‑end encryption enforced by design
* PIN‑based secondary protection in addition to unguessable URLs
* Fast UX via parallel chunk streaming and verification
* Deterministic cleanup and security wipe on failure
* Works fully in modern browsers without plugins

### 2.2 Non‑Goals

* Long‑term file hosting or backups
* User accounts or authentication systems
* Search, indexing, or sharing history
* Collaboration or versioning

---

## 3. Target Users

### 3.1 Primary Users

* Developers sharing sensitive builds or logs
* Professionals sharing confidential documents
* Students sharing large files temporarily

### 3.2 Secondary Users

* Privacy‑conscious users avoiding cloud storage
* Users behind restricted networks (fallback relay)

---

## 4. User Stories

### Sender

* As a sender, I want to select a file/folder and set a PIN
* As a sender, I want to share a single URL that expires naturally
* As a sender, I want assurance that the server cannot read my data

### Receiver

* As a receiver, I want to open a link and enter a PIN
* As a receiver, I want the download to start instantly after verification
* As a receiver, I want nothing stored if verification fails

---

## 5. Functional Requirements

### 5.1 File Handling

* Support single file and folder (folders zipped client‑side)
* Chunk files into configurable sizes
* Stream chunks progressively

### 5.2 Encryption

* Generate random symmetric file key per transfer
* Encrypt each chunk independently using authenticated encryption
* Encrypt file key using derived key from (URL secret + PIN)

### 5.3 PIN System

* Sender chooses 4 / 6 / 8 digit PIN
* PIN never sent to server
* PIN verification occurs entirely client‑side
* Limited verification attempts

### 5.4 URL Handling

* Transfer URL contains only transferID in path
* All secrets stored in URL fragment
* Fragment never transmitted to server

### 5.5 Transport

* Primary: Peer‑to‑peer streaming via browser channels
* Fallback: Encrypted relay with strict TTL
* Automatic selection without user intervention

### 5.6 Receiver Caching

* Receiver may cache encrypted chunks before PIN verification
* No plaintext written before verification

### 5.7 Verification Flow

* Chunk reception and PIN verification run in parallel
* On success → instant decrypt & download
* On failure → full wipe & redirect

### 5.8 Wipe & Cleanup

* Clear all encrypted chunks
* Delete browser storage used for transfer
* Close all connections
* Soft redirect with skeleton UI

---

## 6. Non‑Functional Requirements

### 6.1 Security

* End‑to‑end encryption mandatory
* No server access to keys or plaintext
* Strong key derivation to resist brute force
* Authenticated encryption for integrity

### 6.2 Performance

* No noticeable delay after PIN success
* Chunk streaming must begin immediately
* Optimized for large files

### 6.3 Reliability

* Resume capability optional but desirable
* Graceful handling of disconnects

### 6.4 Compatibility

* Modern desktop browsers
* Mobile browsers with reduced parameters

---

## 7. Architecture Overview

### 7.1 Client Responsibilities

* Key generation
* Encryption & decryption
* Chunking & assembly
* PIN verification
* Secure wipe

### 7.2 Server Responsibilities

* Session signaling
* NAT traversal assistance
* Optional encrypted relay
* Enforce TTL and cleanup

### 7.3 Trust Model

* Server is **untrusted**
* Client is sole owner of secrets

---

## 8. Detailed Flow

### 8.1 Sender Flow

1. User selects file/folder
2. User sets PIN
3. Client generates keys
4. File is chunked and encrypted
5. URL is generated and shared
6. Encrypted chunks streamed

### 8.2 Receiver Flow

1. User opens URL
2. Client starts receiving encrypted chunks
3. User enters PIN
4. Client derives key and verifies
5. On success: decrypt & download
6. On failure: wipe & redirect

---

## 9. State Machine

INIT → CONNECTING → RECEIVING → AWAIT_PIN → VERIFYING →

* SUCCESS → DECRYPTING → COMPLETE
* FAILURE → WIPING → REDIRECT

---

## 10. Storage Design

### 10.1 Browser Storage

* IndexedDB for encrypted chunks
* Memory buffers for active streams

### 10.2 Server Storage

* None by default
* Relay storage only if fallback is used

---

## 11. Security Considerations

* URL guessing protection via entropy
* PIN brute force mitigation
* Replay and tamper detection
* Side‑channel minimization

---

## 12. UX Requirements

* Skeleton loaders for all waits
* Clear but non‑revealing error messages
* Minimal refresh or reload

---

## 13. Telemetry & Logging

* Only anonymous session metrics
* No content, filenames, or keys logged

---

## 14. Risks & Mitigations

| Risk            | Mitigation                           |
| --------------- | ------------------------------------ |
| Weak PIN        | Combine with URL secret + strong KDF |
| Network failure | Relay fallback                       |
| Browser limits  | Adaptive chunking                    |

---

## 15. Future Enhancements

* Expiring links with timers
* QR code sharing
* Multi‑receiver support
* Resume support

---

## 16. Success Metrics

* Successful transfers
* Average time to first byte after PIN
* Zero data persistence incidents

---

## 17. Open Questions

* Resume semantics across sessions
* Multi‑tab receiver behavior
* Maximum practical file size

---

## 18. Conclusion

This project defines a **secure, ephemeral, and performant** file‑sharing mechanism that minimizes trust, maximizes privacy, and delivers a seamless user experience while adhering strictly to modern browser security constraints.
