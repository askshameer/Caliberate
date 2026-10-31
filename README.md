# Caliberate — Resource Utilization & Deployment Tracker (RUDT)

Caliberate is an internal workforce intelligence platform for tracking deployment lifecycles, bench aging, roll-off risk, loaded bench cost, skills supply, and internal talent mobility. It ships as a React single-page application backed by an Express API and a persistent SQLite database.

## Capabilities

- **Five role-scoped experiences**: Admin, Operations/PMO, Manager, Resource, and Sales capacity.
- **Deployment lifecycle**: Deployed, Allocated, Bench, and On Leave with partial allocations, start/end dates, extension likelihood, and roll-off forecasting.
- **Bench aging policies**: global Amber/Red/Critical thresholds plus per-practice or per-skill overrides. Bench days are calculated from the real current date and `bench_start`.
- **Manager workflows**: direct-report and full-org views, team utilization, roll-off radar, certification expiry alerts, and staffing requests.
- **Operations workflows**: allocation editor, bench watch, deployment management, two-step request approval, CSV bulk import, and validated CSV exports.
- **Resource self-service**: profile completeness, skills matrix, certifications, resume upload/download, career preferences, internal marketplace applications, and learning recommendations.
- **Sales capacity view**: anonymized, finance-free availability and skills search for proposal staffing.
- **Governance**: server-side audit logging for mutations, role-based field masking, account provisioning, forced password rotation, account lockout, and session revocation.
- **Enterprise runtime**: httpOnly session cookies, Helmet CSP, CORS allowlist, rate limiting, health/readiness probes, graceful shutdown, atomic database writes, and Docker deployment.

## Demo credentials

Demo mode is enabled by default outside production and seeds five personas. All demo accounts use `caliberate123`.

| Role | Email |
|---|---|
| Admin | `admin@caliberate.io` |
| Operations | `ops@caliberate.io` |
| Manager | `rachel.shah@caliberate.io` |
| Resource | `aarav.kumar@caliberate.io` |
| Sales | `sales@caliberate.io` |

The login screen also supports one-click persona sign-in while demo mode is enabled. Demo data is shifted relative to the current date on every seed so the dashboards stay meaningful.

## Quick start

Prerequisites: Node.js 20+ and npm.

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001/api`
- Health probe: `http://localhost:3001/api/health`

### Production build

```bash
npm run build
npm start
```

The Express server serves the built SPA from `client/dist` and the API from the same origin.

### Tests

```bash
npm test
```

The suite covers authentication, RBAC, financial masking, sales anonymization, people CRUD, marketplace applications, staffing approvals, policy governance, audit logging, forced password rotation, user provisioning, CSV import, and health/readiness. It expects the dev servers to be running on ports 3001 and 5173.

### Reset demo data

In demo mode only, an Admin can use **Settings → Reset Demo Data**, or call:

```bash
curl -X POST http://localhost:3001/api/settings/reset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"confirm":"RESET"}'
```

## Configuration

Copy `.env.example` to `.env` and set values for your environment. The server loads `.env` from the repository root.

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | `development`, `test`, or `production` | `development` |
| `PORT` | API/HTTP port | `3001` |
| `JWT_SECRET` | Token signing secret; **required in production**, 32+ characters | dev-only fallback |
| `JWT_EXPIRES_IN` | Session token lifetime | `12h` |
| `SESSION_COOKIE_NAME` | httpOnly session cookie name | `caliberate_session` |
| `COOKIE_SECURE` | Send cookies over HTTPS only | `true` in production |
| `COOKIE_SAME_SITE` | Cookie SameSite policy | `strict` |
| `TRUST_PROXY` | Express trust-proxy setting when behind a proxy | `1` in production |
| `CORS_ORIGINS` | Comma-separated allowed browser origins; empty for same-origin | dev: `http://localhost:5173` |
| `DEMO_MODE` | Seeds demo personas and enables one-click persona login | `true` outside production |
| `SEED_DEMO_DATA` | Seeds demo workforce data | same as `DEMO_MODE` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run production administrator | required when the DB is empty and demo mode is off |
| `ADMIN_NAME` | First-run administrator display name | `Platform Administrator` |
| `DB_PATH` | SQLite database file | `server/db/caliberate.db` |
| `UPLOAD_DIR` | Resume storage directory | `server/uploads` |
| `MAX_UPLOAD_BYTES` | Maximum resume upload size | `5242880` (5 MB) |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | Global / login rate limits per window | `600` / `20` |
| `BCRYPT_ROUNDS` | Password hashing cost | `12` |
| `LOG_FORMAT` | Morgan log format | `dev` (production: `combined`) |

Same-origin deployment is recommended. If the SPA is hosted on a different origin, set `CORS_ORIGINS`, `COOKIE_SAME_SITE=none`, and `COOKIE_SECURE=true` (HTTPS is required for `SameSite=None` cookies).

## Docker deployment

Create a `.env` file with at least:

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
ADMIN_EMAIL=admin@your-company.com
ADMIN_PASSWORD=replace-with-a-strong-temporary-password
DEMO_MODE=false
SEED_DEMO_DATA=false
COOKIE_SECURE=true
```

Then:

```bash
docker compose up -d --build
```

The container runs as a non-root user, persists the database and uploads in the `caliberate-data` volume, and exposes port 3001. Put it behind a TLS-terminating reverse proxy or load balancer and set `COOKIE_SECURE=true`. Set `TRUST_PROXY` to match your proxy topology.

### Backups

The database is a single SQLite file. Back up the mounted `/data` volume (or `DB_PATH` plus `UPLOAD_DIR`) on a schedule. Database writes use a temp file and atomic rename to reduce corruption risk.

### Horizontal scaling

The bundled persistence layer is a single-node SQLite database, which is appropriate for a single-instance internal deployment. For multi-replica or high-availability requirements, move the data layer to PostgreSQL and add a shared session store; the API routes are isolated enough to make that migration straightforward.

## Security model

- Passwords are hashed with bcrypt at a configurable cost.
- Sessions are signed JWTs stored in an httpOnly, SameSite cookie. Bearer tokens remain accepted for API clients and automated tests.
- Account lockout after five failed sign-in attempts, with a 15-minute cooldown.
- Admin-created accounts require a password change on first sign-in; password changes revoke all existing sessions.
- Role checks and field masking happen on the server, not only in the UI.
- Managers can only edit direct reports and cannot change deployment status, financials, or allocation terms; those require an Operations-reviewed request.
- Sales sees anonymized bench/allocated capacity only, with no names, rates, customers, notes, or applications.
- Resume uploads are type- and size-restricted and served through an authorized download endpoint.
- All workforce, allocation, application, request, policy, and user mutations are written to the audit log with actor, IP, user agent, and before/after payloads.
- Security headers are applied with Helmet, including an explicit CSP.
- Login and global API rate limits are enforced.

### SSO

The application ships with local account authentication and a clear auth boundary. Enterprises that require OIDC/SAML can place Caliberate behind an identity-aware proxy, or extend `server/routes/auth.js` with an OIDC/SAML callback that issues the same session cookie. Demo persona login and public demo-user discovery are disabled automatically when `DEMO_MODE=false`.

## Project structure

```
Caliberate/
├── client/                     React 19 + Vite + Tailwind 4 SPA
│   ├── src/components/         Login, workspace, modals, error boundary
│   ├── src/contexts/           Auth/session context
│   ├── src/hooks/              API client
│   └── src/utils/              Business calculations and constants
├── server/                     Express 5 API
│   ├── config.js               Environment configuration and validation
│   ├── db/init.js              Schema, migrations, seed, atomic persistence
│   ├── middleware/auth.js      Session verification and RBAC
│   ├── routes/                 Auth, users, people, jobs, applications, requests, settings
│   ├── services/audit.js       Server-side audit trail
│   └── validation/             Zod request schemas
├── test_all_features.mjs       72-assertion end-to-end feature suite
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## API overview

All endpoints are under `/api`. Authentication is required except for `/auth/login`, `/auth/config`, and `/auth/demo-users` (demo mode only).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `GET /auth/config`, `GET /auth/demo-users` |
| Users (Admin) | `GET/POST /users`, `PUT/DELETE /users/:id` |
| People | `GET/POST /people`, `GET/PUT/DELETE /people/:id`, `POST /people/import`, `POST/GET /people/:id/resume` |
| Jobs | `GET/POST /jobs`, `GET/PUT/DELETE /jobs/:id` |
| Applications | `GET/POST /applications`, `PUT /applications/:id` |
| Staffing requests | `GET/POST /requests`, `PUT /requests/:id` |
| Settings | `GET/PUT /settings`, `GET/POST /settings/audit-log`, `POST /settings/reset` (demo mode) |
| Ops | `GET /health`, `GET /ready` |

## Notes and constraints

- The dashboard uses the real current date. Bench days are computed server-side from `bench_start`; stored `days` values are retained only for historical/seed compatibility.
- The data model currently tracks one active project assignment per person. Concurrent multi-project allocations can be added with an `allocations` table without changing the UI contract.
- Email/Slack/Teams notification toggles are stored policy settings. Outbound delivery requires wiring a provider (SMTP, Slack/Teams webhook) into the audit/bench policy service.
