# BBL Bookmark Manager

Personal bookmark manager. Private to each signed-in user. Backend + frontend monorepo.

## Status

**In progress.** See `/transcripts/` for the live build log.

| Area | State |
|---|---|
| §3.1 Backend (NestJS + Prisma + Auth0) | scaffolded |
| §3.2 Frontend (Vite + React + MUI v9 + RR v8) | pending |
| §3.3 Sharing | **deferred — see DECISIONS.md** |
| §3.4 Bonuses | not started |
| Verification harness | pending |
| Docs (API_DESIGN, DECISIONS, AI_WORKFLOW) | partial |

## Quick start

```bash
# backend
cd backend
cp ../.env.example backend/.env   # fill in secrets
npm install
npx prisma migrate dev
npm run seed
npm run start:dev

# frontend
cd ../frontend
cp ../.env.example frontend/.env  # fill in VITE_* secrets
npm install
npm run dev
```

## What's done vs skipped

(updated as we ship — final list at end of build)

## Layout

```
backend/      NestJS API + Prisma
frontend/     Vite + React app
transcripts/  this build's conversation log
.agent/       agent capabilities used in this build
```
