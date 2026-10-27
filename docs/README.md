# Frontier AI — Technical Documentation Suite

Welcome to the Frontier AI technical documentation suite. This documentation provides an in-depth breakdown of the architecture, security mechanisms, task engines, cryptographic protocols, meeting infrastructure, and deployment roadmap.

---

## Documentation Index

| Document | Title | Description |
|---|---|---|
| [**01. Architecture Overview**](01_ARCHITECTURE_OVERVIEW.md) | System Architecture & Design Philosophy | High-level system diagram, the zero-cost (₹0 budget) rationale, the zero npm dependencies mandate, and component directory structure. |
| [**02. Authentication & Security**](02_AUTHENTICATION_SECURITY.md) | Authentication, Sessions & Security Architecture | Immutable numeric GitHub ID allowlist, persistent SQLite sessions, role-based access control (Lead vs. Member), two-person rule governance ("Four-Eyes Principle"), and security audit logs. |
| [**03. Tasks & Peer Tasklets**](03_TASKS_AND_TASKLETS.md) | Task Assignment & Peer Tasklet Engine | Dual task paradigm: formal sprint deliverables with Optimistic Concurrency Control (OCC) vs. informal peer-to-peer micro-tasks ("tasklets") with state machine transitions. Sized Kanban board layout. |
| [**04. Cryptographic Peer Review**](04_CRYPTOGRAPHIC_PEER_REVIEW.md) | Cryptographic Peer Review & Evaluation Protocol | The Two-Phase Blind Ballot Protocol using HMAC-SHA256, unlinked token decoupling, double-voting prevention, the 2 evaluation templates (Peer Performance & Project Quality), and client token caching. |
| [**05. Call Room & Google Meet Gateway**](05_CALL_ROOM_AND_EMBEDDED_MEET.md) | Call Room & Google Meet Gateway Architecture | 6-slot Google Meet rotation engine, masked gateway redirect with attendance verification, dynamic status indicator hues (live green, scheduled amber, idle blue), clean collapsed sidebar circle state, and the Path A companion gateway model. |
| [**06. Deployment & Cloudflare Guide**](06_DEPLOYMENT_AND_MIGRATION_GUIDE.md) | Deployment & Cloudflare Migration Guide | Step-by-step instructions to migrate from localhost Node.js + SQLite to Cloudflare Pages + Workers + D1, staying 100% within the permanent ₹0 free tier. |
| [**07. AI Oracle, Memory & Modular Architecture**](07_AI_ORACLE_MEMORY_AND_MODULAR_ARCHITECTURE.md) | AI Assistant, 3-Tier Memory & Modular Architecture | Architectural blueprint for the AI Oracle assistant, 3-tier SQLite memory engine, token optimization, and decoupled backend structure. |
| [**08. Cloudflare D1 Hosting Guide**](08_CLOUDFLARE_D1_HOSTING_GUIDE.md) | Cloudflare Pages & D1 Edge Hosting Architecture | Production hosting guide for Cloudflare Pages Functions edge routing, D1 serverless SQLite, Groq AI inference, and Google OAuth setup. |
| [**09. OAuth & Session Persistence Fixes**](09_OAUTH_AUTHENTICATION_AND_PERSISTENCE_FIXES.md) | OAuth CSRF, Dual-Persistence & Reliability Architecture | Comprehensive analysis of the multi-click sign-in race condition, session non-persistence, stateless HMAC state tokens, and dual Bearer/Cookie persistence. |
| [**10. Backend, Cloudflare & AI Engineering Report**](10_BACKEND_CLOUDFLARE_AI_CONTRIBUTION_REPORT.md) | Lead Backend Engineer Contribution & Architecture Report | Full engineering report on the dual-engine architecture, Cloudflare serverless setup, D1 SQLite, Frontier Oracle AI integration, cryptographic voting, and production bugfixes. |
| [**Team Contributors & Roadmap**](TEAM_ALLOCATION_AND_ROADMAP.md) | Team Allocation, File Ownership & Contributor Reports | Detailed mapping of all 5 team members, their assigned roles, files owned/touched, and PR histories. |
| [**Presentation Speaker Script**](PRESENTATION_SPEAKER_SCRIPT.md) | Speaker Script & Demo Walkthrough Guide | Word-for-word spoken walkthrough, scene-by-scene demo cues, and answers to tough technical questions for the live presentation. |

---

## Quick Reference: Running the System

```bash
# 1. Start the local prototype server (runs at http://localhost:3030)
npm start

# 2. Run the 17-point automated verification & security test suite
node test_prototype.js
```
