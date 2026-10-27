# Frontier AI — Backend Architecture, Cloudflare Setup & AI Integration: Comprehensive Engineering Report

**Author / Lead Backend Engineer:** Kartikay ([@potatobun321](https://github.com/potatobun321) / `kart123.san@gmail.com`)  
**Project:** Frontier AI Internal Engineering & Governance Platform  
**Repository:** `potatobun321/fronterAI-repo`  
**Target Environment:** Localhost (Node.js + SQLite) & Production Edge (Cloudflare Pages + Workers + D1 SQLite)  

---

## 1. Executive Summary & Scope of Responsibility

Frontier AI is an internal engineering collaboration and governance workspace built under a strict **Zero-Cost (₹0 budget)** and **Zero External SaaS/Library Bloat** engineering mandate. It provides team tracking, peer-to-peer micro-tasking, Google Meet bridge rotation, cryptographic blind peer evaluation, 2-Man governance, and conversational workspace intelligence.

### Primary Assigned Responsibilities:
1. **Core Backend Architecture & API Design:** Designing and building the entire server runtime, routing topology, database schema, data models, and business logic.
2. **Cloudflare Serverless Setup & Production Deployment:** Implementing the serverless edge router (`functions/api/[[catchall]].js`), configuring Cloudflare Pages, Workers runtime (`worker.js`), Wrangler orchestration (`wrangler.toml`), and Cloudflare D1 Serverless SQLite database bindings.
3. **Frontier Oracle AI Chat Integration:** Engineering the end-to-end multi-turn conversational AI assistant with Groq (Llama 3.3 70B Versatile, Llama 3.1 8B) and Google Gemini 1.5 Flash fallbacks, featuring real-time workspace context injection, persistent conversation threads, sliding-window memory, and intelligent offline fallbacks.
4. **Authentication, Security & Session Persistence:** Developing the Google OAuth 2.0 flow, stateless HMAC-SHA256 CSRF protection, dual-channel session persistence (30-day HttpOnly cookies + LocalStorage Bearer tokens), and dynamic Host access request approval gating.
5. **Cryptographic Anonymous Peer Review & Voting Engine:** Implementing the Two-Phase Blind Ballot Protocol using HMAC-SHA256, decoupling voter identity from ballot storage, preventing double-voting, and executing atomic batch submissions.
6. **Quality Assurance, Bugfixes & Production Hardening:** Creating the 20-point automated integration test suite (`test_prototype.js`), fixing production edge race conditions, and maintaining dual-engine parity.

---

## 2. The Dual-Engine Backend Architecture

To guarantee rapid local feature development without requiring cloud credentials or internet connectivity, while maintaining a high-performance serverless edge deployment in production, a **Dual-Engine Model** was engineered:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LOCAL DEVELOPMENT ENGINE                        │
│                                                                        │
│   • Entry Point: server.js (Native Node.js HTTP server)                │
│   • Modular Routes: routes/*.js (auth, tasks, voting, ai, calendar)    │
│   • Database: Local SQLite file (frontier.db via better-sqlite3)       │
│   • Auth Simulator: One-click local persona pills & dev simulator      │
│   • Dependency Footprint: Zero external framework (node:http, crypto) │
│   • Cloud Dependency: 0% (Works completely offline, ₹0 cost)           │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                             Tested & Reviewed
                             Pull Request Flow
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION EDGE ENGINE                          │
│                                                                        │
│   • Entry Point: worker.js & functions/api/[[catchall]].js             │
│   • Runtime: Cloudflare Pages Functions / V8 Serverless Edge           │
│   • Database: Cloudflare D1 Serverless SQLite (env.DB)                 │
│   • Auth: Real Google OAuth 2.0 with stateless HMAC state verification │
│   • AI Model: Groq Llama 3.3 70B & Gemini 1.5 Flash native REST        │
│   • Cost: 100% Free Tier (₹0 hosting, ₹0 database, ₹0 SSL)             │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Parity & Synchronized Data Contract
Both engines execute identical business logic and share the same database schema (`schema.sql`). While the local engine uses `better-sqlite3` synchronous queries, the Cloudflare edge engine uses asynchronous D1 statements (`await env.DB.prepare(...).bind(...).run()`). An auto-migrating `ensureSchema(env)` routine runs on edge startup to guarantee table and column parity across all distributed edge instances.

---

## 3. Cloudflare Setup & Production Infrastructure

The production platform runs globally on Cloudflare's edge network at zero operational cost:

### 3.1 Components & Configuration

1. **Static Frontend (`public/` via Cloudflare Assets):**
   - Built with vanilla HTML5, modern CSS3 (Google Workspace Dark Mode), and ES Modules.
   - Served directly from Cloudflare's global CDN cache with v2.0.2 cache busting.
2. **Edge Worker Entry Point (`worker.js`):**
   - Intercepts incoming HTTP requests.
   - Routes `/api/*` traffic to the serverless catchall edge router (`functions/api/[[catchall]].js`).
   - Delegates static asset requests (`index.html`, `styles.css`, `app.js`, icons) to the `ASSETS` binding.
3. **Cloudflare D1 Serverless Database (`frontier-production-db`):**
   - Serverless SQLite distributed database bound as `env.DB`.
   - Stores 16 core tables: `members`, `tasks`, `meeting_slots`, `calendar_events`, `voting_sessions`, `voting_options`, `voting_eligibility`, `ballots`, `used_tokens`, `sessions`, `tasklets`, `access_tickets`, `ai_threads`, `ai_messages`, `member_memories`, and `audit_events`.
4. **Wrangler Configuration (`wrangler.toml`):**
   ```toml
   name = "fronterai-repo"
   compatibility_date = "2024-04-01"
   main = "worker.js"

   [assets]
   directory = "./public"
   binding = "ASSETS"

   [[d1_databases]]
   binding = "DB"
   database_name = "frontier-production-db"
   database_id = "caceef73-0711-4397-96b3-77e43c91f029"

   [vars]
   NODE_ENV = "production"
   GOOGLE_CLIENT_ID = "33531224866-tci0079quk7mfgh7plhtgnpj6lfa96ou.apps.googleusercontent.com"
   ```

### 3.2 Free Tier Cost Economics
- **Cloudflare Pages:** Unlimited requests and bandwidth (₹0).
- **Pages Functions / Workers:** 100,000 free requests/day (team usage: ~2,000 req/day = ₹0).
- **Cloudflare D1:** 5,000,000 read units/day, 100,000 write units/day, 5 GB storage (team usage: < 5,000 reads/day, ~2 MB = ₹0).
- **SSL & DNS:** Automatic Cloudflare SSL certificates with universal global edge caching (₹0).

---

## 4. Frontier Oracle AI Chat Integration

"Frontier Oracle" is the platform's intelligent workspace assistant, built to answer questions regarding active sprint deliverables, team roster, deadlines, meeting bridges, and peer tasklets without leaking unblinded voting data or administrative secrets.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTIER ORACLE AI PIPELINE                     │
│                                                                        │
│   1. User Query: "What tasks are due this week and who is on backend?"│
│                              │                                         │
│                              ▼                                         │
│   2. Dynamic Intent Filtering & Token Optimization (Zero Stuffing)     │
│      • Detects: /task|sprint|due/ -> Queries D1 for active 15 tasks    │
│      • Detects: /team|who|roster/ -> Queries D1 for team directory     │
│      • Detects: /meet|calendar/   -> Queries D1 for 6 meeting slots    │
│      • Gating: Host-only tickets only exposed if user.is_host === 1    │
│                              │                                         │
│                              ▼                                         │
│   3. Multi-Turn History (Sliding Window: Last 6 turns in D1/SQLite)    │
│                              │                                         │
│                              ▼                                         │
│   4. LLM Execution Engine (Cascade with Native REST fetch):            │
│      • Primary: Groq Llama 3.3 70B Versatile (Ultra-fast inference)   │
│      • Secondary: Groq Llama 3.1 8B Instant                            │
│      • Alternate: Google Gemini 1.5 Flash (Direct REST API)            │
│      • Fallback: Intelligent Deterministic SQLite Local Generator      │
│                              │                                         │
│                              ▼                                         │
│   5. Persistent Turn Storage: INSERT into ai_messages & ai_threads     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Token Optimization & Intent Filtering (No "Context Stuffing")
Rather than dumping the entire database into the LLM system prompt on every turn—which burns token budgets and slows response times—a dynamic intent-filtering algorithm was engineered in `services/aiService.js` and `functions/api/[[catchall]].js`:
- **Identity & Permissions (~25 tokens):** Always injected (`Current User: Name, Handle, Role, Track, is_host`).
- **Live Team Roster (~80 tokens):** Always injected from live database state, ensuring new members are immediately recognized.
- **Sprint Deliverables (~100 tokens):** Injected only when the prompt matches `/task|todo|progress|deliverable|deadline|work|sprint|status|who|assign/` or short queries (< 20 chars).
- **Meeting Bridges (~50 tokens):** Injected only when the prompt matches `/meet|call|sync|calendar|slot|bridge|schedule|event/`.
- **Peer Tasklets (~40 tokens):** Injected when peer collaboration is referenced.
- **Administrative Access Tickets:** Strictly gated behind `if (currentUser.is_host)`.

### 4.2 Multi-Turn Sliding Window & Persistence
Conversation threads are stored in `ai_threads` (`id`, `member_id`, `title`, `created_at`, `updated_at`). Individual turns are saved in `ai_messages` (`id`, `thread_id`, `sender_role`, `content`, `created_at`). 
To keep prompt overhead tight, the edge function fetches only the last 6 turns (`LIMIT 6`) and maps the database roles (`user` / `model`) into standard LLM roles (`user` / `assistant`).

### 4.3 Intelligent Offline Fallback
If external API keys are unset or upstream providers experience network timeouts, Frontier Oracle does not crash. It automatically evaluates the user's intent against live SQLite/D1 records and formats a clean markdown response listing current tasks, upcoming syncs, or team directory information.

### 4.4 Privacy & Conversation Management
Full lifecycle endpoints were implemented:
- `GET /api/ai/threads`: Fetches the current user's conversation threads.
- `GET /api/ai/threads/:id/messages`: Loads historical dialogue with role-gated access (users cannot view another member's chat history unless they are Team Lead).
- `DELETE /api/ai/threads/:id`: Deletes a thread and cascades deletion to all associated messages.
- `DELETE /api/ai/threads`: Permanently clears all conversation history for the current user.

---

## 5. Authentication, Security & Session Persistence

The authentication architecture was re-engineered to resolve real-world deployment challenges observed in Cloudflare Pages and modern browser sandboxes.

### 5.1 Stateless HMAC-SHA256 OAuth State Verification
Standard OAuth state verification relies on setting an HTTP cookie before redirecting to Google, then checking that cookie upon callback. However:
1. Cross-site navigation redirects from Google Accounts frequently drop `SameSite=Lax` cookies in strict browser environments (Safari ITP, Brave, Chrome Incognito).
2. Users double-clicking "Sign in with Google" caused a race condition where Click #2 overwrote the cookie, causing Google's callback for Click #1 to fail with `csrf_state_mismatch`.

**The Solution:**
A stateless, cryptographic state token format was implemented:
$$\text{State} = \text{nonce} \,.\, \text{timestamp} \,.\, \text{HMAC-SHA256}(\text{secret}, \text{nonce} \,.\, \text{timestamp})$$
Upon callback, the edge server verifies the signature using the shared secret and validates that the timestamp is within a 15-minute expiration window. This eliminates the race condition and works even if cookies are dropped during cross-domain navigation.

### 5.2 Dual-Persistence Session Engine (30-Day Sessions)
To prevent users from being logged out on page refresh or across worker restarts:
- **Channel A (Cookie):** The server issues an `HttpOnly; SameSite=Lax; Max-Age=2592000` cookie named `frontier_session`.
- **Channel B (Bearer Token in LocalStorage):** The login callback returns the session token to the frontend, which stores it in `localStorage.setItem('frontier_session_token', token)`.
- **Universal Fetch Interceptor (`public/app.js`):** A client-side fetch wrapper automatically injects `Authorization: Bearer <token>` on all outbound API requests while including credentials.

### 5.3 Host Gatekeeping & Dynamic Access Request Flow
To prevent arbitrary Google users from entering private workspaces without maintaining a fragile hardcoded email list:
1. When an unrecognized user signs in with Google, their account is marked `is_allowed = 0` and entered into `access_tickets` with status `PENDING_APPROVAL`.
2. The user sees a clean waiting screen informing them that their access request is pending approval by the Team Lead.
3. The Team Lead (`kart123.san@gmail.com` / `id: 1`) receives an alert in the Team Directory view.
4. The Lead can approve (`POST /api/members/:id/approve`) or reject the candidate. Upon approval, `is_allowed` is set to `1`, granting immediate access.
5. Host immunity and auto-healing logic in `ensureSchema()` ensures the Team Lead can never be locked out or demoted.

---

## 6. Cryptographic Anonymous Peer Review & Voting Engine

To enable objective peer evaluations without fear of retaliation or interpersonal friction, a **Two-Phase Blind Ballot Protocol** was engineered.

```
┌────────────────────────────────────────────────────────────────────────┐
│                    TWO-PHASE BLIND BALLOT PROTOCOL                     │
│                                                                        │
│   PHASE 1: ELIGIBILITY VERIFICATION & UNLINKED TOKEN ISSUANCE         │
│   1. Member requests ballot token for Session #S                       │
│   2. Server verifies Member is allowed & has not voted in #S           │
│   3. Server stamps voting_eligibility (member_id, session_id)          │
│   4. Server derives unlinked HMAC token:                               │
│      Token = HMAC-SHA256(VOTING_SECRET, SessionId : MemberId : Salt)   │
│   5. Token returned to client (Server discards memory of mapping)      │
│                                                                        │
│   PHASE 2: ANONYMOUS BALLOT SUBMISSION                                 │
│   1. Client submits: { session_id, option_id, rating, token }          │
│   2. Server calculates: TokenHash = SHA256(Token)                      │
│   3. Server checks: TokenHash in used_tokens?                          │
│      • If YES -> Reject (Double voting attempt blocked!)               │
│      • If NO  -> Atomically INSERT TokenHash into used_tokens          │
│   4. Server inserts Ballot (session_id, option_id, rating)             │
│      *CRITICAL: ZERO member_id column exists in ballots table!*        │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Technical Achievements in Voting:
- **Mathematical Decoupling:** The voter identity is verified in Phase 1, but ballots stored in Phase 2 have no user identifier column.
- **Double-Voting Prevention:** The spent token hash is recorded in `used_tokens`. Re-submitting the same token is rejected with HTTP 400.
- **Orphaned Token Recovery:** If a network disconnection occurs after token generation but before voting, the system allows the legitimate member to re-fetch their active token.
- **Atomic Edge Transactions:** Multiple ballot submissions are executed using atomic batch statements to eliminate database foreign key inconsistencies.
- **Target Member Peer Evaluation:** Extended the schema with `target_member_id`, `candidate_member_id`, and `rating` (1–5 scale) for granular peer performance reviews.

---

## 7. Tasks, Governance, Calendar & Disaster Recovery

### 7.1 Optimistic Concurrency Control (OCC) on Tasks
To prevent concurrent overwrite issues when multiple teammates update task statuses or PR links simultaneously:
- Each task in `tasks` contains a `version INTEGER DEFAULT 1` column.
- Updates require matching the existing version:
  ```sql
  UPDATE tasks SET status = ?, deliverable_url = ?, version = version + 1
  WHERE id = ? AND version = ?
  ```
- If another teammate updated the record in the interim, the query affects 0 rows, triggering an HTTP 409 Conflict alert.

### 7.2 Two-Man Rule Governance
Sensitive operations (such as approving access tickets or elevating permissions) enforce the cryptographic "Four-Eyes Principle":
- Requester ID cannot equal Approver ID (`if (ticket.requester_id === member.id) return 403 Forbidden`).
- Self-approvals are blocked and logged in the security audit trail.

### 7.3 Masked Google Meet Companion Gateway
To prevent meeting bridge link harvesting or unauthorized link sharing:
- Raw meeting URLs are stored securely in `meeting_slots` (`SLOT-01` to `SLOT-06`).
- The frontend only receives internal masked URLs: `/api/meetings/join/:id`.
- Clicking Join routes the user through the edge gateway, verifies their active session, logs attendance, and performs a 302 redirect.
- Supports Least-Recently-Used (LRU) slot rotation when scheduling new syncs.

### 7.4 Disaster Recovery & Audit Trail
- **Audit Logging:** Every sensitive event (logins, task allocations, ticket resolutions, voting launches) is logged to `audit_events` with actor handle, timestamp, target, and status.
- **Disaster Recovery Export (`POST /api/disaster-recovery/export`):** Allows the Team Lead to download an encrypted JSON backup containing all 16 database tables for zero-cost offline storage.

---

## 8. Development Changelog & Production Bugfixes

During the engineering lifecycle, several critical bugs were identified and solved:

| Component | Bug / Challenge | Root Cause | Solution Implemented |
|---|---|---|---|
| **Auth** | Multi-click requirement (`csrf_state_mismatch`) | Browser dropped `SameSite=Lax` cookies on cross-origin redirects from Google; double-clicks overwrote cookie state | Migrated to stateless HMAC-SHA256 signed tokens (`nonce.timestamp.sig`) with 15-minute validity window. |
| **Auth** | Session logout on page refresh | Cloudflare Pages partitioned cookie sandbox + SQLite `datetime('now')` string collation mismatch | Implemented dual persistence (30-day cookie + LocalStorage Bearer token) with universal fetch interceptor and dual ISO timestamp checks. |
| **Voting** | `FOREIGN KEY constraint failed` on ballots | Ballot insertions attempted to write `option_id` before verifying option existence in D1 edge instances | Resolved foreign key constraints, wrapped ballot submissions in atomic D1 batches, and auto-recovered orphaned tokens. |
| **Voting** | Premature auto-archiving of voting sessions | Timezone offset disparity between Cloudflare edge UTC and local client clocks | Aligned session expiration evaluation and added manual Admin launch/close controls. |
| **AI Chat** | Token exhaustion & high latency | "Context stuffing" entire database into LLM prompt on every single message | Designed keyword-triggered intent filter with compact markdown schemas, reducing prompt tokens by ~70%. |
| **UI** | Command Palette freeze (Ctrl+K) | Native HTML `<dialog>` element backdrop locking on mobile and desktop Chrome | Replaced native modal with custom zero-freeze CSS overlay container and restored `escapeHtml` helper. |
| **UI** | Asset caching & stale JavaScript | Aggressive Cloudflare CDN caching serving older versions of `app.js` and `styles.css` | Added `v=2.0.2` cache-busting query strings to all script and stylesheet tags in `index.html`. |

---

## 9. Verification & Automated Test Suite

A comprehensive 20-point integration test suite was built in `test_prototype.js` to automatically verify system integrity:

```bash
# Run the automated verification suite
node test_prototype.js
```

### Verified Test Checks:
1. `[PASS]` **1. Verified Members:** Confirms member count and authorized Host (`Kartikay`).
2. `[PASS]` **1b. Public Member Sanitization:** Zero sensitive numeric IDs leaked to anonymous visitors.
3. `[PASS]` **2. Hard Allowlist:** Unauthorized login attempts rejected with HTTP 403 Forbidden.
4. `[PASS]` **3. Role Authorization Gating:** Non-lead members blocked from allocating tasks (HTTP 403).
5. `[PASS]` **4. Calendar Gating:** Non-lead members blocked from creating calendar syncs (HTTP 403).
6. `[PASS]` **5. Host Task Allotment:** Host successfully creates and assigns tasks.
7. `[PASS]` **6. Host Calendar Scheduling:** Host broadcasts meeting pings.
8. `[PASS]` **6b. Meeting Slots & Masking:** 6 slots configured, raw URLs strictly masked.
9. `[PASS]` **7. Participant Deliverable Submission:** Member submits PR deliverable and notes.
10. `[PASS]` **8. Personal Dashboard:** Accurately computes tasks, completion rates, and upcoming syncs.
11. `[PASS]` **8b. Masked Join Gateway:** Authenticates member session and redirects to meeting bridge.
12. `[PASS]` **9. Blind Token Claimed:** Issues unlinked cryptographic ballot token.
13. `[PASS]` **10. Peer Performance Vote Cast:** Casts ballot with zero voter identity linkage.
14. `[PASS]` **11. Double Voting Guard:** Re-submission with spent token rejected with HTTP 400.
15. `[PASS]` **12a/b. Authorator Git Disaster Recovery:** Non-leads blocked; Host exports full database JSON backup.
16. `[PASS]` **13a/b/c. Host Audit Trail Access:** Host views audit log; non-leads (403) and anonymous users (401) blocked.
17. `[PASS]` **14. Persistent SQLite Sessions:** Session token persisted in database.
18. `[PASS]` **15a. Frontier Oracle AI Query:** Returns grounded workspace answer with thread ID.
19. `[PASS]` **15b. AI Memory Engine:** Thread and conversational turns persisted in database.
20. `[PASS]` **15c. AI Security Isolation:** Anonymous users blocked from querying Oracle (HTTP 401).

---

## 10. Summary for Project Evaluation & Presentation

If asked to explain your contributions in an interview or project evaluation, you can present this concise summary:

> *"As Lead Backend Engineer for Frontier AI, I architected a zero-cost, zero-dependency dual-engine platform running locally on Node.js/SQLite and globally on Cloudflare Pages, Workers, and D1 Serverless SQL. I built the Google OAuth 2.0 layer with stateless HMAC-SHA256 CSRF protection and dual-channel 30-day session persistence, dynamic Host access request approval gating, and optimistic concurrency control on sprint deliverables. I engineered the Two-Phase Blind Ballot cryptographic voting system that guarantees anonymous peer reviews while preventing double-voting. Furthermore, I built Frontier Oracle—a conversational workspace AI assistant powered by Groq Llama 3.3 and Gemini 1.5 Flash—featuring token-optimized intent-filtered context injection, persistent multi-turn thread memory, and zero-downtime offline fallbacks."*
