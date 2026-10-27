# Frontier AI — Team Contributors, Allocations & Engineering Report

This document records the official team allocation, contributor ownership, file mappings, and engineering deliverables for the **Frontier AI** project.

---

## 1. Executive Contributor Matrix

| Contributor | GitHub Handle | Assigned Role & Track | Primary Files Owned | Key Deliverables & Scope |
|---|---|---|---|---|
| **Kartikay** | [@potatobun321](https://github.com/potatobun321) | **Team Host & Lead Backend / Systems Architect** | `server.js`<br>`db.js`<br>`schema.sql`<br>`routes/*.js`<br>`services/*.js`<br>`middleware/*.js`<br>`test_prototype.js` | Complete backend architecture, REST API design, Google OAuth 2.0 flow, session management, Two-Phase Blind Ballot Cryptography, Optimistic Concurrency Control, Frontier Oracle AI integration, and 20-point test runner. |
| **Dheeraj** | [@dheeraj1030-ctrl](https://github.com/dheeraj1030-ctrl) | **Frontend Engineer** *(UI Layout & Oracle Panel)* | `public/index.html`<br>`public/app.js`<br>`public/styles.css` | Implemented the initial Oracle AI slide-out drawer, mobile navigation responsiveness, persona menu integration, and initial DOM structure cleanup. *(PR #2, PR #6)* |
| **Pawan Kumar** | [@slugxpawan](https://github.com/slugxpawan) | **Frontend / UI/UX Engineer** *(Mobile Navigation)* | `public/index.html`<br>`public/app.js`<br>`public/styles.css` | Enhanced mobile navigation, implemented bottom navigation bar docking on small viewports, theme toggle structure, and mobile viewport responsiveness. *(PR #8)* |
| **Rashi Choudhary**| [@rashichoudhary07](https://github.com/rashichoudhary07) | **Database & Seeding Contributor** | `seed.js`<br>`test.js`<br>Proposed `db.js` | Explored initial relational schema modeling for tasks and members, authored mock seed data scripts (`seed.js`), and wrote verification queries for foreign key associations. *(PR #4)* |
| **Drashti** | [@drashti0369](https://github.com/drashti0369) / `drashti0369-vision` | **Authentication Architecture Contributor** | `authentication/` module | Researched authentication routing structures, password salting and hashing concepts, and route protection middleware (`requireAuth.js`). *(PR #3)* |

---

## 2. Detailed Contributor Breakdowns & File Reports

### 2.1 Kartikay ([@potatobun321](https://github.com/potatobun321)) — Team Host & Lead Backend Architect

- **Assigned Scope:** End-to-end backend architecture, database modeling, authentication security, conversational AI intelligence, and integration testing.
- **Repository Files Owned & Maintained:**
  - [`server.js`](../server.js) — Native Node.js HTTP server entry point (`node:http`) operating with zero external framework dependencies.
  - [`db.js`](../db.js) — SQLite connection management using `better-sqlite3` in WAL mode with timeout protection.
  - [`schema.sql`](../schema.sql) — Canonical database schema defining all 16 relational tables and initial seed data.
  - [`routes/`](../routes/) — Modular REST route handlers:
    - [`authRoutes.js`](../routes/authRoutes.js): Google OAuth 2.0, HMAC state verification, and 30-day session issuance.
    - [`memberRoutes.js`](../routes/memberRoutes.js): Team directory lookups, Host access request approval, and cascade member purge.
    - [`taskRoutes.js`](../routes/taskRoutes.js): Deliverables board with Optimistic Concurrency Control (OCC) version locking.
    - [`taskletRoutes.js`](../routes/taskletRoutes.js): Peer-to-peer micro-task engine and category transitions.
    - [`votingRoutes.js`](../routes/votingRoutes.js): Two-Phase Blind Ballot cryptographic protocol using HMAC tokens.
    - [`calendarRoutes.js`](../routes/calendarRoutes.js): Meeting sync scheduling and Least-Recently-Used (LRU) slot rotation.
    - [`meetingRoutes.js`](../routes/meetingRoutes.js): Masked Google Meet companion gateway (`/api/meetings/join/:id`).
    - [`aiRoutes.js`](../routes/aiRoutes.js): Frontier Oracle AI conversation endpoints and thread lifecycle management.
    - [`governanceRoutes.js`](../routes/governanceRoutes.js): 2-Man Rule elevation tickets (`requester_id != approver_id`).
    - [`disasterRecoveryRoutes.js`](../routes/disasterRecoveryRoutes.js): Offline database snapshot export engine.
  - [`services/aiService.js`](../services/aiService.js) — Frontier Oracle AI context builder, intent keyword filtering (preventing context stuffing), Groq Llama 3.3 70B & Gemini 1.5 Flash native REST callers, and deterministic offline fallback.
  - [`services/ballotCrypto.js`](../services/ballotCrypto.js) — Ephemeral HMAC-SHA256 token issuance and ballot decoupling.
  - [`test_prototype.js`](../test_prototype.js) — 20-point automated integration test suite validating role gating, OCC locking, cryptographic voting, and AI memory persistence.
  - [`MY_WORK_AND_SYSTEM_ARCHITECTURE.md`](../MY_WORK_AND_SYSTEM_ARCHITECTURE.md) — Comprehensive technical architecture report.

---

### 2.2 Dheeraj ([@dheeraj1030-ctrl](https://github.com/dheeraj1030-ctrl)) — Frontend Engineer

- **Assigned Scope:** Frontend user interface integration, AI Oracle desktop/mobile panel, and navigation structure.
- **Repository Files Touched:**
  - [`public/index.html`](../public/index.html) — Structured the DOM layout for the Oracle AI slide-out drawer, navigation tabs, and header user chip.
  - [`public/app.js`](../public/app.js) — Added event listeners for opening/closing the Oracle side drawer, keyboard shortcut bindings, and initial persona dropdown logic.
  - [`public/styles.css`](../public/styles.css) — Added CSS transition rules for drawer slide-in animations, responsive media queries, and header positioning.
- **Associated Pull Requests:**
  - **PR #2:** *"update-frontend"* — Initial update of frontend templates and card structures.
  - **PR #6:** *"feat(frontend): add oracle ai side panel, mobile nav, and fix auth flicker"* — Introduced the slide-out Oracle panel container and responsive layout adjustments.

---

### 2.3 Pawan Kumar ([@slugxpawan](https://github.com/slugxpawan)) — Frontend / UI/UX Engineer

- **Assigned Scope:** Mobile navigation ergonomics, responsive viewport layouts, and UI theme support.
- **Repository Files Touched:**
  - [`public/index.html`](../public/index.html) — Structured the bottom navigation dock for mobile viewports (`#mobile-bottom-nav`) and theme toggle controls.
  - [`public/app.js`](../public/app.js) — Added active state synchronization between desktop sidebar tabs and mobile bottom navigation icons.
  - [`public/styles.css`](../public/styles.css) — Implemented CSS rules for docking the mobile navigation bar, adjusting padding on small screens, and touch target optimization.
- **Associated Pull Requests:**
  - **PR #8:** *"feat: improve mobile navigation and add theme toggle"* — Cleaned up mobile view navigation and introduced responsive bottom bar styling.

---

### 2.4 Rashi Choudhary ([@rashichoudhary07](https://github.com/rashichoudhary07)) — Database Contributor

- **Assigned Scope:** Relational database exploratory work and sample data seeding.
- **Repository Files & Commits:**
  - Commit `aaac20a` / **PR #4:** *"Add SQLite database layer"*
  - Authored files: `seed.js`, `test.js`, and proposed schema modifications in `db.js`.
- **Engineering Contribution & Technical Notes:**
  - Contributed exploratory scripts demonstrating initial table creation and sample member insertion (Alice Vance, Bob Ross, etc.).
  - *Integration Note:* While the schema proposed in PR #4 used CommonJS `require()` and altered canonical column names (`assigned_to` instead of `assignee_id`), the foreign key linking concepts and task relationship ideas were adopted and formalized into the project's canonical `schema.sql`.

---

### 2.5 Drashti ([@drashti0369](https://github.com/drashti0369)) — Authentication Contributor

- **Assigned Scope:** Authentication backend research and route protection concepts.
- **Repository Files & Commits:**
  - Commit `933be89` / **PR #3:** *"Add authentication backend"*
  - Authored files in `authentication/` directory: `server.js`, `routes/auth.js`, `middleware/requireAuth.js`.
- **Engineering Contribution & Technical Notes:**
  - Explored modular authentication routing, session protection middleware patterns, and password salting techniques.
  - *Integration Note:* The implementation utilized Express.js and third-party session packages. To preserve the project's zero-dependency mandate and enable stateless CSRF security, the route protection principles were synthesized into native `node:http` middleware (`middleware/session.js`) and Google OAuth 2.0 signed state verification.

---

## 3. Engineering Workflow & Git Branching Standards

The team followed a structured Git workflow to ensure code quality:

```
[Local Feature Branch]             [develop branch]                  [main branch]
(feat/* or fix/*)                (Team Integration Base)            (Stable Release)
      │                                   │                               │
      ├─ 1. Branch off develop ──────────►│                               │
      │                                   │                               │
      ├─ 2. Code & test locally           │                               │
      │                                   │                               │
      └─ 3. Pull Request into develop ───►│                               │
                                          │                               │
                                          ├─ 4. Code Review & Verification│
                                          │                               │
                                          └─ 5. Merge PR into main ──────►│
```

- **`develop`**: The primary shared integration branch for all team feature PRs.
- **`main`**: The stable, production-ready branch containing verified releases.
- **Testing Standard:** All backend changes must pass all 20 tests in `test_prototype.js` before merging.
