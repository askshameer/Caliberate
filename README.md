# Caliberate — Resource Utilization & Deployment Tracker (RUDT)

Caliberate is an internal workforce intelligence platform for tracking deployment lifecycles, bench aging, roll-off risk, loaded bench cost, skills supply, and internal talent mobility. It ships as a React single-page application backed by an Express API and a persistent SQLite database.

## Capabilities

- **Role-based access**: Admin, Operations/PMO, Manager, Resource, Sales capacity, Panel (interviewer), and Talent Acquisition (TA).
- **External hiring**: Managers raise external hire requests when no internal resource matches; Admin/Operations approve them, then candidate details are captured.
- **Interview panels**: Panel members maintain the skills they can interview and one-hour availability slots for the current and next week. The roster is visible to Admin, Operations, Manager, and TA.
- **Interview scheduling**: TA schedules interviews against approved external requests; the roster blocks the interviewer's time, enforces JD-skill to panel-skill matching and slot availability, rejects time conflicts, and surfaces a weekly calendar view. Panel members can cancel their own interviews, which notifies TA, Operations, and Admin.
- **Deployment lifecycle**: Deployed, Allocated, Bench, and On Leave with partial allocations, start/end dates, extension likelihood, and roll-off forecasting.
- **Bench aging policies**: global Amber/Red/Critical thresholds plus per-practice or per-skill overrides. Bench days are calculated from the real current date and `bench_start`.
- **Manager workflows**: direct-report and full-org views, team utilization, roll-off radar, certification expiry alerts, and staffing requests.
- **Operations workflows**: allocation editor, bench watch, deployment management, two-step request approval, CSV bulk import, and validated CSV exports.
- **Resource self-service**: profile completeness, skills matrix, certifications, resume upload/download, career preferences, internal marketplace applications, and learning recommendations.
- **Sales capacity view**: anonymized, finance-free availability and skills search for proposal staffing.
- **Governance**: server-side audit logging for mutations, role-based field masking, account provisioning, forced password rotation, account lockout, and session revocation.
- **Enterprise runtime**: httpOnly session cookies, Helmet CSP, CORS allowlist, rate limiting, health/readiness probes, graceful shutdown, atomic database writes, and Docker deployment.

## First-time setup, reset and user import

- **First launch:** when the database is empty, Caliberate shows a setup wizard. Choose **With demo** (loads the sample data and one account per role) or **Without demo** (you create the default admin username and password). Setting `DEMO_MODE` / `ADMIN_EMAIL` + `ADMIN_PASSWORD` in the environment skips the wizard for automated deployments.
- **Reset Application (Admin):** wipes all data and every account, including the administrator, ends existing sessions, and returns to first-time setup. Choose demo data or create a new administrator there. The setup state survives a restart even when demo environment variables are set. Type `RESET` to confirm. API: `POST /api/settings/reset` with `{ "confirm": "RESET" }`.
- **Backup & Restore (Admin):** download a JSON snapshot containing accounts (including password hashes), business data, settings, audit/login history and uploaded resumes. Keep backups private. Restore accepts a Caliberate version 1 backup up to 100 MB, validates it before replacing current data, and ends all sessions. Sign in with credentials from the backup afterward. To recover after a reset, complete setup with an administrator, then open **Backup & Restore**. APIs: `GET /api/settings/backup` and multipart `POST /api/settings/restore` with `backup` and `confirm=RESTORE`.
- **Login History (Admin):** view successful and failed sign-in attempts with name, email, role, local timestamp, IP and browser/device information. Search by name/email, filter by outcome, and page through results. History starts when this feature is installed; older attempts are not reconstructed. API: `GET /api/users/login-history?search=&outcome=&page=1`.
- **User CSV import/export (Admin):** *Users & Access* has **Export CSV** and **Import CSV** (columns `name,email,role,roleTitle,department,status`). Imported users get the default password `Password@123` and must change it on first sign-in; existing emails are skipped. API: `GET /api/users/export`, `POST /api/users/import` with `{ "csv": "..." }`.
- **First sign-in:** any account created by an admin or imported must change its password before using the app.
## Demo credentials

On first launch, choose demo mode in the setup wizard (or set `DEMO_MODE=true`) to seed seven personas. All demo accounts use `caliberate123`.

| Role | Email |
|---|---|
| Admin | `admin@caliberate.io` |
| Operations | `ops@caliberate.io` |
| Manager | `rachel.shah@caliberate.io` |
| Resource | `aarav.kumar@caliberate.io` |
| Sales | `sales@caliberate.io` |
| Panel | `priya.nair@caliberate.io` |
| TA | `ta@caliberate.io` |

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

The suite covers authentication, RBAC, financial masking, sales anonymization, people CRUD, marketplace applications, staffing approvals, policy governance, audit logging, forced password rotation, user provisioning, CSV import, external hiring, interview panels, roster scheduling with skill matching and time-conflict protection, plus health/readiness. The command builds the production client, starts an isolated server on a dynamically assigned port with disposable demo data, runs 126 feature assertions, then runs the availability and admin regression suites. No running dev server is needed, and application data is not modified. Temporary feature databases are removed afterward.

Run `npm run test:admin` for isolated reset/setup, imported-user login, backup/restore, upload recovery and login-history regression checks. It creates a temporary database and does not change your running application's data.

### Reset application

An Admin can use **Reset Application** to erase all accounts and data and return to setup, or call:

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
| `DEMO_MODE` | Seeds demo personas and enables one-click persona login | `false`; chosen during setup |
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

## Linux server deployment (standalone / local)

Caliberate can be deployed directly on any local or on-premises Linux server (bare metal or VM) with Node.js—no external database server or cloud service is required.

### Server requirements

| Resource | Minimum required | Recommended |
|---|---|---|
| **OS** | 64-bit Linux (Ubuntu 22.04+, Debian 12+, RHEL / Rocky / AlmaLinux 9+) | Ubuntu 24.04 LTS or Debian 12+ (64-bit) |
| **CPU** | 1 vCPU (`x86_64` or `arm64`) | 2+ vCPUs (faster bcrypt hashing & Vite builds) |
| **RAM** | 1 GB (add 1–2 GB swap if building the client on the same host) | 2–4 GB |
| **Storage** | 5 GB free disk space | 20+ GB SSD/NVMe (database, resume uploads, and backups) |
| **Runtime** | Node.js 20 LTS & npm 10+ (or Docker Engine + Compose v2) | Node.js 22 LTS & npm 10+, `systemd`, Nginx/Caddy |
| **Network** | TCP port `3001` (or `80`/`443` via reverse proxy) | HTTPS on `443` with internal CA or Let's Encrypt |

### 1. Install Node.js and system prerequisites

Example for Ubuntu / Debian (run as a sudo-enabled user):

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v22.x
npm -v
```

*(On RHEL / Rocky / AlmaLinux, install `git` and `nodejs` 22 via `dnf` or NodeSource RPMs.)*

### 2. Create a service user, clone, and build

```bash
sudo useradd --system --home /opt/caliberate --shell /usr/sbin/nologin caliberate || true
sudo mkdir -p /opt/caliberate /var/lib/caliberate/uploads
sudo git clone https://github.com/askshameer/Caliberate.git /opt/caliberate
cd /opt/caliberate

# Install production backend dependencies and build the React frontend
sudo npm ci --prefix server --omit=dev
sudo npm ci --prefix client
sudo npm run build
sudo chown -R caliberate:caliberate /opt/caliberate /var/lib/caliberate
```

### 3. Configure `.env`

Create `/opt/caliberate/.env` from `.env.example` and generate a 32+ character `JWT_SECRET`:

```bash
sudo cp /opt/caliberate/.env.example /opt/caliberate/.env
```

Edit `/opt/caliberate/.env`:

```ini
NODE_ENV=production
PORT=3001
JWT_SECRET=<paste-output-of-node-crypto-randomBytes-below>

# Store SQLite DB and uploaded resumes outside the code directory
DB_PATH=/var/lib/caliberate/caliberate.db
UPLOAD_DIR=/var/lib/caliberate/uploads

# IMPORTANT for local/LAN HTTP deployments:
# Set COOKIE_SECURE=false and TRUST_PROXY=0 if users access http://<server-ip>:3001 directly without HTTPS.
# Keep COOKIE_SECURE=true and TRUST_PROXY=1 when serving over HTTPS via Nginx/Caddy.
COOKIE_SECURE=false
TRUST_PROXY=0
```

Generate a random `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **First-time setup:** Leave `DEMO_MODE`, `SEED_DEMO_DATA`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` unset to use the browser setup wizard on first launch (choose **With demo** or **Without demo**). For unattended provisioning, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ chars with uppercase, lowercase, number, and symbol) in `.env`.

Secure the `.env` file permissions:

```bash
sudo chown caliberate:caliberate /opt/caliberate/.env
sudo chmod 600 /opt/caliberate/.env
```

### 4. Run as a `systemd` service

Create `/etc/systemd/system/caliberate.service`:

```ini
[Unit]
Description=Caliberate Resource Utilization & Deployment Tracker
After=network.target

[Service]
Type=simple
User=caliberate
Group=caliberate
WorkingDirectory=/opt/caliberate/server
EnvironmentFile=/opt/caliberate/.env
ExecStart=/usr/bin/node /opt/caliberate/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable, start, and verify:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now caliberate
sudo systemctl status caliberate
curl -fsS http://127.0.0.1:3001/api/health
```

View live logs anytime with:

```bash
sudo journalctl -u caliberate -f
```

### 5. Optional: Nginx reverse proxy (recommended for HTTPS / port 80/443)

If you want users to access Caliberate on a hostname (e.g., `https://caliberate.internal`) without `:3001`:

```bash
sudo apt-get install -y nginx
```

Create `/etc/nginx/sites-available/caliberate`:

```nginx
server {
    listen 80;
    server_name caliberate.internal;

    # Allow 5 MB resume uploads and up to 100 MB admin backup restores
    client_max_body_size 105M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/caliberate /etc/nginx/sites-enabled/caliberate
sudo nginx -t && sudo systemctl reload nginx
```

If you terminate TLS/HTTPS on Nginx (via Certbot or an internal CA certificate), set `COOKIE_SECURE=true` and `TRUST_PROXY=1` in `/opt/caliberate/.env`, then run `sudo systemctl restart caliberate`.

If using a firewall (`ufw`):

```bash
# Direct access on 3001 (without Nginx):
sudo ufw allow 3001/tcp
# Or with Nginx:
sudo ufw allow 'Nginx Full'
```

### 6. Upgrading on a Linux server

```bash
cd /opt/caliberate
sudo -u caliberate git pull origin main
sudo -u caliberate npm ci --prefix server --omit=dev
sudo -u caliberate npm ci --prefix client
sudo -u caliberate npm run build
sudo systemctl restart caliberate
```

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
├── test_all_features.mjs       126-assertion API and business-rule suite
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
| Settings | `GET/PUT /settings`, `GET/POST /settings/audit-log`, `POST /settings/reset`, `GET /settings/backup`, `POST /settings/restore` |
| External Hires | `GET/POST /external-requests`, `PUT /external-requests/:id/review`, `PUT /external-requests/:id/candidate` |
| Panels | `GET/POST /panels`, `GET /panels/me`, `GET /panels/available`, `PUT/DELETE /panels/:id` |
| Interview Roster | `GET/POST /interview-roster`, `PUT /interview-roster/:id` |
| Ops | `GET /health`, `GET /ready` |

## Notes and constraints

- The dashboard uses the real current date. Bench days are computed server-side from `bench_start`; stored `days` values are retained only for historical/seed compatibility.
- The data model currently tracks one active project assignment per person. Concurrent multi-project allocations can be added with an `allocations` table without changing the UI contract.
- Email/Slack/Teams notification toggles are stored policy settings. Outbound delivery requires wiring a provider (SMTP, Slack/Teams webhook) into the audit/bench policy service.
