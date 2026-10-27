# Frontier AI — Internal Engineering & Governance Platform

A zero-framework, full-stack internal engineering workspace built around a disciplined **Google Workspace Dark Theme** with zero external frontend libraries, native Node.js HTTP/SQLite execution, cryptographic anonymous peer review, and conversational workspace intelligence.

---

## 1. Team Contributors & Engineering Ownership

This project was built collaboratively by a multi-disciplinary team. Each contributor owned distinct layers of the platform:

| Contributor | GitHub Profile | Engineering Role & Focus | Primary Files Owned / Touched | Contributor Report |
|---|---|---|---|:---:|
| **Kartikay** | [@potatobun321](https://github.com/potatobun321) | **Team Host & Lead Backend / Systems Architect** | [`server.js`](server.js)<br>[`db.js`](db.js)<br>[`schema.sql`](schema.sql)<br>[`routes/`](routes/)<br>[`services/`](services/)<br>[`test_prototype.js`](test_prototype.js) | [Detailed Report](MY_WORK_AND_SYSTEM_ARCHITECTURE.md) |
| **Dheeraj** | [@dheeraj1030-ctrl](https://github.com/dheeraj1030-ctrl) | **Frontend Engineer** *(UI Layout & Oracle Panel)* | [`public/index.html`](public/index.html)<br>[`public/app.js`](public/app.js)<br>[`public/styles.css`](public/styles.css) | [PR #6 Overview](docs/TEAM_ALLOCATION_AND_ROADMAP.md#22-dheeraj-dheeraj1030-ctrl--frontend-engineer) |
| **Pawan Kumar** | [@slugxpawan](https://github.com/slugxpawan) | **Frontend / UI/UX Engineer** *(Mobile Navigation)* | [`public/index.html`](public/index.html)<br>[`public/app.js`](public/app.js)<br>[`public/styles.css`](public/styles.css) | [PR #8 Overview](docs/TEAM_ALLOCATION_AND_ROADMAP.md#23-pawan-kumar-slugxpawan--frontend--uiux-engineer) |
| **Rashi Choudhary** | [@rashichoudhary07](https://github.com/rashichoudhary07) | **Database & Seeding Contributor** | `seed.js`<br>`test.js`<br>Proposed `db.js` | [PR #4 Overview](docs/TEAM_ALLOCATION_AND_ROADMAP.md#24-rashi-choudhary-rashichoudhary07--database-contributor) |
| **Drashti** | [@drashti0369](https://github.com/drashti0369) | **Authentication Architecture Contributor** | `authentication/` module | [PR #3 Overview](docs/TEAM_ALLOCATION_AND_ROADMAP.md#25-drashti-drashti0369--authentication-contributor) |

*For a full breakdown of each contributor's technical deliverables and PR history, see [docs/TEAM_ALLOCATION_AND_ROADMAP.md](docs/TEAM_ALLOCATION_AND_ROADMAP.md).*

---

## 2. Technical Documentation Suite

Complete architectural blueprints and reports are available in the [`docs/`](docs/) directory:

- [**Lead Backend Engineer & Architecture Report**](MY_WORK_AND_SYSTEM_ARCHITECTURE.md) — Comprehensive technical report detailing the native backend architecture, Frontier Oracle AI, cryptographic voting protocols, and production bugfixes.
- [**Team Contributors & Roadmap Report**](docs/TEAM_ALLOCATION_AND_ROADMAP.md) — Engineering allocations, contributor file mappings, and PR histories.
- [**Handover Blueprint & Architecture Guide**](docs/HANDOVER_GUIDE.md) — Data flow diagrams, token optimization, and HMAC cryptographic state specifications.
- [**01. Architecture Overview**](docs/01_ARCHITECTURE_OVERVIEW.md) — System topology and the zero npm framework mandate.
- [**02. Authentication & Security**](docs/02_AUTHENTICATION_SECURITY.md) — Google OAuth 2.0 flow, immutable numeric allowlists, and persistent SQLite sessions.
- [**03. Tasks & Peer Tasklets**](docs/03_TASKS_AND_TASKLETS.md) — Dual task paradigm: formal sprint deliverables with OCC vs. informal peer micro-tasks ("tasklets").
- [**04. Cryptographic Peer Review**](docs/04_CRYPTOGRAPHIC_PEER_REVIEW.md) — Two-Phase Blind Ballot Protocol using HMAC-SHA256, 1–5 star ratings, and unlinked ballot persistence.
- [**05. Call Room & Google Meet Gateway**](docs/05_CALL_ROOM_AND_EMBEDDED_MEET.md) — 6-slot Google Meet rotation, masked access gateway, and companion synchronization.
- [**07. AI Oracle, Memory & Modular Architecture**](docs/07_AI_ORACLE_MEMORY_AND_MODULAR_ARCHITECTURE.md) — Frontier Oracle AI assistant, multi-turn sliding window memory, token optimization, and thread lifecycle.
- [**Presentation Speaker Script**](docs/PRESENTATION_SPEAKER_SCRIPT.md) — Walkthrough guide and answers to technical evaluation questions.

---

## 3. Core Modules & Capabilities

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTIER AI ARCHITECTURE                        │
│                                                                        │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────┐  │
│   │   Tasks Board & OCC  │  │   Peer Tasklets Hub  │  │ Call Gateway│  │
│   │   Version-locked PRs │  │   Micro-collaborate  │  │ 6-Slot Meet │  │
│   └──────────┬───────────┘  └──────────┬───────────┘  └──────┬──────┘  │
│              │                         │                     │         │
│              ▼                         ▼                     ▼         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                 NATIVE REST CONTROLLERS & ENGINE                │  │
│   │        Native node:http | Zero External Framework Bloat         │  │
│   └────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│              ┌─────────────────────┼─────────────────────┐             │
│              ▼                     ▼                     ▼             │
│   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐  │
│   │ Frontier Oracle AI │ │ Blind Cryptography │ │ Persistent SQLite  │  │
│   │ Groq & Gemini REST │ │ HMAC Ballot Box    │ │ better-sqlite3     │  │
│   │ 6-Turn Memory      │ │ Zero Identity Link │ │ 16 Relational Tabs │  │
│   └────────────────────┘ └────────────────────┘ └────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Frontier Oracle AI Assistant (Sliding Context & Intent Filtering)
- **Multi-Model Inference:** Native REST calls to **Groq (Llama 3.3 70B Versatile, Llama 3.1 8B)** and **Google Gemini 1.5 Flash** using standard `fetch()` with zero external SDKs.
- **Intent-Based Context Injection:** Scans incoming prompts using regex to selectively inject only active tasks, team rosters, or meeting schedules, reducing prompt token usage by ~70% and preventing context stuffing.
- **Sliding-Window Dialogue Memory:** Persists conversation threads in `ai_threads` and turns in `ai_messages` with a 6-turn sliding window for natural multi-turn conversations.
- **Intelligent Offline Fallback:** If API keys are unset or network is offline, an internal deterministic engine answers task and team questions directly from SQLite without breaking.

### 3.2 Cryptographic Anonymous Peer Review (Two-Phase Blind Ballot)
- **Token Decoupling:** In Phase 1, eligible team members claim an ephemeral HMAC-SHA256 token. In Phase 2, ballots (with 1–5 star ratings) are deposited into the ballot box using the token hash.
- **Strict Voter Anonymity:** The `ballots` database table contains **zero member_id column**, mathematically preventing votes from being linked back to individual team members.
- **Double-Voting Guard:** Spent token hashes are recorded in `used_tokens` to prevent multiple submissions.

### 3.3 Sprint Deliverables & Optimistic Concurrency Control (OCC)
- **Atomic Version Locking:** Every task record contains a `version INTEGER` column. Updates verify `WHERE id = ? AND version = ?`, preventing concurrent teammate edits from accidentally overwriting each other.
- **Two-Man Rule ("Four-Eyes Principle"):** Sensitive governance and access requests require dual sign-off; users are cryptographically blocked from approving their own tickets.

### 3.4 Masked Google Meet Companion Gateway
- **Masked Gateway Routing:** Raw video links are never exposed in client HTML. Calls route through `/api/meetings/join/:id`, verifying active member sessions and logging attendance.
- **Least-Recently-Used (LRU) Rotation:** Dynamically rotates between 6 pre-configured Google Meet bridges (`SLOT-01` to `SLOT-06`) to prevent meeting room overlap.

### 3.5 Google Workspace Dark UI
- **Disciplined Design Language:** Implemented in pure HTML5 and Vanilla CSS tokens (`#131314` canvas, `#1e1f20` surface, `#8ab4f8` accent) with zero emojis.
- **Global Command Palette (`Ctrl+K`):** Non-blocking keyboard overlay for instant navigation across tasks, views, and team members.

---

## 4. Quickstart & Local Execution

The entire platform runs locally on standard Node.js (v20+) with **zero external framework dependencies** (only `better-sqlite3` for local database access).

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Server
```bash
# Standard start:
npm start

# Or with automatic reload during development (Node 20+):
npm run dev
```
Open **`http://localhost:3030`** in your browser.

### Step 3: Run the Automated Verification Suite
To run the automated 20-point integration test suite validating security, role gating, OCC locking, and AI memory:
```bash
node test_prototype.js
```
*All 20 tests will execute against the local server and verify system integrity.*

---

## 5. Repository File Map

```
fronterAI-repo/
├── public/                     # FRONTEND (Vanilla HTML5 / CSS3 / ES Modules)
│   ├── index.html              # Google Workspace Dark UI layout & views
│   ├── app.js                  # Frontend state, event handlers & fetch interceptor
│   └── styles.css              # Design system tokens & responsive component rules
│
├── routes/                     # MODULAR REST CONTROLLERS
│   ├── authRoutes.js           # Google OAuth 2.0 & 30-day session management
│   ├── memberRoutes.js         # Team directory & Host access request approvals
│   ├── taskRoutes.js           # Sprint deliverables with OCC version locking
│   ├── taskletRoutes.js        # Peer-to-peer micro-task engine
│   ├── votingRoutes.js         # Two-Phase Blind Ballot HMAC voting engine
│   ├── meetingRoutes.js        # Masked Google Meet join gateway
│   ├── calendarRoutes.js       # Standups & sprint sync scheduler
│   ├── aiRoutes.js             # Frontier Oracle AI chat & memory endpoints
│   ├── governanceRoutes.js     # 2-Man Rule elevation tickets
│   └── disasterRecoveryRoutes.js# Offline database backup JSON exporter
│
├── services/                   # CORE BUSINESS & CRYPTOGRAPHIC SERVICES
│   ├── aiService.js            # Groq Llama 3.3 & Gemini intent context builder
│   └── ballotCrypto.js         # HMAC-SHA256 blind ballot token generator
│
├── middleware/                 # SERVER UTILITIES
│   ├── httpHelpers.js          # Native request stream parser & JSON responder
│   └── session.js              # Session cookie and Bearer token authenticator
│
├── docs/                       # ARCHITECTURAL DOCUMENTATION SUITE
│   ├── TEAM_ALLOCATION_AND_ROADMAP.md # Detailed contributor reports & file ownership
│   ├── HANDOVER_GUIDE.md       # Technical handover blueprint
│   └── ...                     # In-depth architectural chapters
│
├── server.js                   # Native Node.js HTTP server entry point
├── db.js                       # Local SQLite connection & schema initializer
├── schema.sql                  # Canonical 16-table database schema & seed data
├── test_prototype.js           # 20-point automated integration test suite
├── MY_WORK_AND_SYSTEM_ARCHITECTURE.md # Lead Backend Architect technical report
└── package.json                # Project metadata
```
