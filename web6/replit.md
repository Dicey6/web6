# FundedFrens

A Solana meme coin prop trading platform where users pay for trading challenges and earn referral rewards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000 in Replit, 8080 in production)
- `pnpm --filter @workspace/fundedfrens run dev` — run the frontend (port from $PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to Supabase PostgreSQL (dev only)

## Environment Variables

See `.env.example` for the full list with descriptions.

### Frontend (Vercel)
| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase public anon key |
| `VITE_API_URL` | ⬜ | Full URL of backend API (empty = same-origin) |

### Backend (Render)
| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ | Injected by Render automatically |
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (never expose to browser) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS allowed origins (Vercel URL) |
| `TREASURY_WALLET` | ✅ | Solana wallet address for payments |
| `APP_URL` | ⬜ | Frontend URL (used in referral links) |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React 19 + Vite, TailwindCSS, Wouter, Supabase Auth, React Query
- **Backend**: Express 5, Drizzle ORM, Supabase JWT verification
- **Database**: Supabase PostgreSQL (accessed via Drizzle ORM)
- **Auth**: Supabase Auth — email/password, JWT forwarded to API in `Authorization: Bearer` header
- **Codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Deployment**: Vercel (frontend) + Render (backend) + Supabase (DB & Auth)

## Where things live

| Path | Purpose |
|---|---|
| `lib/api-spec/openapi.yaml` | Single source of truth for all API contracts |
| `lib/api-client-react/src/generated/` | Generated React Query hooks (do not edit) |
| `lib/api-zod/src/generated/` | Generated Zod schemas (do not edit) |
| `lib/db/src/schema/index.ts` | Drizzle ORM table definitions |
| `artifacts/api-server/src/middlewares/auth.ts` | Supabase JWT verification middleware |
| `artifacts/api-server/src/routes/` | Express route handlers |
| `artifacts/fundedfrens/src/` | React frontend |
| `artifacts/fundedfrens/src/contexts/AuthContext.tsx` | Auth state provider |
| `artifacts/fundedfrens/src/lib/supabase.ts` | Supabase browser client |
| `vercel.json` | Vercel deployment config (SPA rewrites) |

## Architecture decisions

- **JWT forwarded via Bearer header**: The Supabase access token is attached to every API request by `main.tsx` via `setAuthTokenGetter`. The backend verifies it using the Supabase admin client (`auth.getUser(token)`). No session cookies are used.
- **Profile auto-creation**: `GET /v1/users/profile` creates the profile row on first call if it doesn't exist, avoiding the need for a database trigger.
- **Vercel SPA rewrite**: `vercel.json` rewrites all `/*` to `/index.html`. The frontend calls the API server at `VITE_API_URL` (an external Render URL), NOT via `/api` — so Vercel's rewrite never intercepts API calls in production.
- **CORS**: The API server allows origins specified in `ALLOWED_ORIGINS`. Set this to your Vercel deployment URL in Render.

## Deployment

### Frontend → Vercel
1. Connect GitHub repo `Dicey6/web6` to Vercel
2. Set Root Directory = `.` (repo root)
3. Build command: `pnpm --filter @workspace/fundedfrens run build`
4. Output directory: `artifacts/fundedfrens/dist`
5. Add all `VITE_*` environment variables

### Backend → Render
1. Connect GitHub repo to Render as a Web Service
2. Build command: `pnpm install && pnpm --filter @workspace/api-server run build`
3. Start command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
4. Add all backend environment variables

### Database → Supabase
1. Run `pnpm --filter @workspace/db run push` once to create all tables
2. Alternatively, apply the Drizzle schema via `drizzle-kit push`

## Gotchas

- **Never set `VITE_API_URL` to a relative path like `/api`**: On Vercel, the SPA rewrite would intercept API calls and return HTML. Always point to the full Render URL.
- **`pnpm --filter @workspace/db run push` creates tables**: Run this against the production DATABASE_URL once after schema changes.
- **Root Directory in Vercel must be `.`**: If it's set to `artifacts/fundedfrens/`, the `outputDirectory` path in `vercel.json` resolves to the wrong place.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
