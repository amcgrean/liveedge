# Beisser LiveEdge — Digital Takeoff & Delivery Management

Comprehensive platform for Beisser Lumber Co.'s four Iowa locations:
- **Web App** (`/app`, `/src`): Next.js 15 — takeoff estimating, bid tracking, dispatch management, admin portal
- **Mobile App** (`/mobile-app`): React Native (Expo) — delivery driver app for POD completion

## Quick Start

### Web App
```bash
npm install
npm run dev
# Opens http://localhost:3000
```

### Mobile App
```bash
cd mobile-app
npm install
npm start
# Press 'i' for iOS simulator or 'a' for Android emulator
```

## Documentation

- **Web App**: See [CLAUDE.md](./CLAUDE.md) for architecture, routes, database, auth
- **Mobile App**: See [docs/MOBILE_APP.md](./docs/MOBILE_APP.md) for setup, API, development phases
- **Database**: See [docs/routes.md](./docs/routes.md) for API endpoints
- **Deployment**: See [docs/](./docs/) for hosting and DevOps

## Architecture Overview

**Database**: Supabase (postgres.js + Drizzle ORM)
- `bids` schema: All LiveEdge takeoff + bidding tables
- `public` schema: ERP mirror tables (via Agility API)

**Auth**: NextAuth v5 with passwordless OTP
**APIs**: 147+ REST routes + 77 pages

See CLAUDE.md for full details.