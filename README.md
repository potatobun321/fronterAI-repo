# Frontier AI — Internal Engineering Platform

A full-stack, internal engineering workspace built around a disciplined **Google Workspace dark theme** with zero external frontend libraries and a permanent **₹0 hosting footprint** on **GitHub Pages + Cloudflare Pages Functions + Cloudflare D1 (Serverless SQLite)**.

---

## Technical Documentation Suite

Comprehensive technical and architectural documentation is available in the [`docs/`](docs/) directory:

- [**Lead Backend Engineer & Architecture Report**](MY_WORK_AND_SYSTEM_ARCHITECTURE.md) — Comprehensive technical report detailing all backend engineering, Cloudflare serverless setup, Frontier Oracle AI, cryptographic voting, and production bugfixes.
- [**Handover Blueprint & Architecture Guide**](docs/HANDOVER_GUIDE.md) — Comprehensive guide for frontend & backend engineers explaining data flows, token optimization, and HMAC cryptographic state.
- [**01. Architecture Overview**](docs/01_ARCHITECTURE_OVERVIEW.md) — System topology, ₹0 budget constraints, and the zero npm dependencies mandate.
- [**02. Authentication & Security**](docs/02_AUTHENTICATION_SECURITY.md) — Google OAuth 2.0, immutable numeric ID allowlists, and persistent SQLite sessions.
- [**03. Tasks & Peer Tasklets**](docs/03_TASKS_AND_TASKLETS.md) — Dual task paradigm: formal sprint deliverables with OCC vs. informal peer micro-tasks ("tasklets").
- [**04. Cryptographic Peer Review**](docs/04_CRYPTOGRAPHIC_PEER_REVIEW.md) — Two-Phase Blind HMAC-SHA256 protocol, 1–5 star ratings, and unlinked ballot persistence.
- [**05. Call Room & Google Meet Gateway**](docs/05_CALL_ROOM_AND_EMBEDDED_MEET.md) — 6-slot Google Meet rotation, masked access gateway, and companion window synchronization.
- [**06. Deployment & Cloudflare Guide**](docs/06_DEPLOYMENT_AND_MIGRATION_GUIDE.md) — Step-by-step roadmap for Cloudflare Pages + Cloudflare D1.
- [**07. AI Oracle, Memory & Modular Architecture**](docs/07_AI_ORACLE_MEMORY_AND_MODULAR_ARCHITECTURE.md) — Frontier Oracle AI assistant, multi-turn sliding window, token optimization, and thread lifecycle.
- [**08. Cloudflare D1 Hosting Guide**](docs/08_CLOUDFLARE_D1_HOSTING_GUIDE.md) — Edge SQL queries and D1 configuration.

---

## Core Modules & Platform Capabilities

### 1. Frontier Oracle AI Assistant (Sliding Context & Intent Filtering)
* **Dual Runtime Engine**: Native support for **Google Gemini 1.5 Flash** and **Groq (Llama 3.3 70B)** via standard `fetch()` with zero external SDKs.
* **Cost & Token Optimized Context**: Employs an intent-based filter (injecting tasks or meeting schedules only when relevant) combined with a **6-turn sliding conversation window**, cutting token consumption by ~40% and eliminating context blowouts.
* **Full Data Privacy & Deletion**: Complete thread lifecycle with `DELETE /api/ai/threads/:id` and a 1-click **"Clear All"** option for permanent data purging.

### 2. Cryptographic Anonymous Peer Review (Blind HMAC-SHA256)
* **Blind Nonce Decoupling**: Voters claim an ephemeral HMAC-SHA256 token. When ballots (1–5 star sprint contributions) are deposited into the ballot box, the token is burned with **zero identity linkage** to the voter.
* **Dynamic Lifecycle States**: Clearly transitions between `Idle` (no active round), `Active` (live submissions), and `Closed` (finalized aggregate standings and distribution charts).
* **Single-Member Safe State**: Automatically detects single-member workspaces and displays guidance rather than empty disabled controls.

### 3. Google Meet Companion Gateway
* **Least-Recently-Used Room Rotation**: 6 pre-configured Google Meet bridges rotate dynamically for team standups and retrospectives.
* **Masked Gateway**: Raw video URLs are never exposed in client HTML. Calls route through `/api/meetings/join/:id`, verifying active member sessions and recording attendance.
* **Accurate State Badges**: Distinctly separates **"Ready / Available"** bridge slots from **"Live Call in Session"**.

### 4. Sprint Deliverables, OCC & Two-Person Governance
* **Optimistic Concurrency Control (OCC)**: Every task mutation verifies a version integer (`version = ?`) to prevent accidental overwrites during concurrent team updates.
* **Two-Person Rule Sign-Off**: Deliverables require review and sign-off by a peer or team lead before marking as completed; requesters cannot approve their own items.
* **Tamper-Evident Audit Logs**: All state transitions, voting launches, and administrative actions are logged immutably in `audit_events` with 1-click JSON/CSV export.

### 5. Google Workspace Dark UI & Keyboard Velocity
* **Google Workspace Design Language**: Strict dark palette (`#131314` canvas, `#1e1f20` cards, `#28292a` elevated surfaces) with **zero emojis**.
* **Global Command Palette (`Ctrl+K`)**: Instant keyboard navigation to any view, task, or team member with `Escape` dismissal.

---

## Quickstart & Local Development

> [!TIP]
> **Contributing to Frontier AI?** Read our dedicated [**Developer Onboarding & Git Workflow Guide**](DEVELOPER_README.md) for branch rules (`develop` vs `main`), zero-cloud local testing, and pull request procedures.

The local server runs on standard Node.js (v20+) with **zero external dependencies**.

```bash
# 1. Start local development server (accessible at http://localhost:3030)
npm start

# Or with automatic reload during development:
npm run dev

# 2. Run automated verification suite (20 automated tests)
node test_prototype.js

# 3. Test Cloudflare Pages Functions locally
npx wrangler pages dev public
```

---

## Edge Deployment (Cloudflare Pages + D1)

```bash
# Provision Cloudflare D1 Database
npx wrangler d1 create frontier-db

# Apply SQL Schema
npx wrangler d1 execute frontier-db --file=schema.sql

# Deploy to Cloudflare Pages
npx wrangler pages deploy public
```
