# Woven Time Tracking

Internal time tracking tool for the Woven Research & Insights team. Tracks time logged against client projects with workspace isolation, Microsoft SSO, and reporting.

## Features

- **Projects** — Auto-generated project codes (workspace-configurable prefix, e.g. WRI-001, WRI-002, …), project types with color tags, budgeted hours with usage progress bar, file attachments, and team member allocation (with a designated SPOC per project); assigned members are emailed when added to a project. The table sorts by Request Date (newest first) by default, and Request Date / Report Initiated / Report Delivered columns are independently sortable via clickable header arrows. A "Users Assigned" column shows project members as soon as they're assigned, regardless of whether they've logged time yet. Requestor email is not shown in the table — only their name. Admins can export the full project list to CSV.
- **Timesheets** — Log time against your assigned projects only; entries are tied to the logged-in user automatically and can only be edited/deleted by their owner (or a workspace admin). Log Time defaults to the project's Report Initiated date and is constrained to fall within the project's Report Initiated / Report Delivered window (enforced both client- and server-side)
- **Report status updates** — Project members (not just admins) can update a project's status inline from the Projects table; all other project fields remain admin-only
- **Clients & Contacts** — Multi-project clients with contacts (name, email, phone required); contacts can be set as project requestors
- **Reports** — Time by user, project, or client, with budget vs. logged hours visualization, CSV export, and a report delivery calendar view showing delivered/upcoming report dates; "Users Assigned" reflects project membership, not just users who've logged time
- **Workspaces** — Each team gets an isolated workspace; users can belong to multiple workspaces; any authenticated user can create a new workspace (becoming its admin); new sign-ups can alternatively join an existing workspace that already has a member sharing their email domain, joining as a regular member. Each page has its own URL route
- **Settings (Admin)** — Workspace admins manage project types, workspace users/roles, and clients & contacts; a super admin (configured via `SUPER_ADMIN_EMAIL`) can additionally manage all workspaces org-wide
- **Microsoft SSO** — Azure AD OAuth2 login restricted to the configured tenant domain; dev-login fallback when credentials are not configured

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Express 4 + Node.js built-in `node:sqlite` |
| Database | SQLite (via Node 22 native module) |
| Auth | Azure AD OAuth2 + custom SQLite sessions |
| File uploads | multer (stored in `uploads/`) |
| Process manager | PM2 |
| Reverse proxy | Caddy (with Let's Encrypt SSL) |

> **Node 22+ required** — the `node:sqlite` built-in is only available from Node 22 onwards.

## Local Development

### Prerequisites

- Node.js v22+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables)).

### Run

```bash
# Start both backend and Vite dev server concurrently
npm run dev
```

Backend runs on `http://localhost:3000`, Vite dev server on `http://localhost:5173` (proxies `/api` and `/auth` to the backend automatically).

When `AZURE_CLIENT_ID` is not set, a dev-login form is shown instead of Microsoft SSO — no Azure credentials needed for local development.

## Production Build & Deployment

```bash
# Build the frontend
npm run build

# Start the server (serves built frontend + API)
npm start
```

The server serves the compiled `dist/` and all `/api/*` routes from a single Express process.

### Deploying to the server

```bash
# Sync server files
rsync -avz --exclude node_modules --exclude dist --exclude '*.db' --exclude .env --exclude uploads \
  ./ user@your-server:/var/www/time-tracking/

# On the server
cd /var/www/time-tracking
npm install --omit=dev
npm run build
pm2 restart woven-time-tracking
```

See [PM2 & Caddy](#pm2--caddy) for full server setup.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant ID or domain (e.g. `woventalent.in`) — also used to reject SSO logins from email domains outside this tenant |
| `AZURE_CLIENT_ID` | Azure AD application (client) ID |
| `AZURE_CLIENT_SECRET` | Azure AD client secret value |
| `AUTH_REDIRECT_URI` | OAuth2 callback URL (e.g. `https://your-production-domain.example.com/auth/callback`) |
| `SUPER_ADMIN_EMAIL` | Email (or comma-separated emails) granted the `super_admin` global role, which can manage all workspaces |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP credentials for project-assignment emails (used as a fallback when Microsoft SSO isn't configured); assignment emails are silently skipped if unset |
| `APP_URL` | Public app URL, used as the link target in assignment emails (set this to your production domain) |
| `PORT` | Port for the Express server (default `3000`) |
| `NODE_ENV` | Set to `production` to enable secure (HTTPS-only) session cookies |

If `AZURE_CLIENT_ID` is not set, the app falls back to a dev-login form.

## PM2 & Caddy

### PM2 (`ecosystem.config.cjs`)

The PM2 config reads `.env` at startup and passes all variables to the Node process:

```bash
pm2 delete woven-time-tracking   # needed after env changes
pm2 start ecosystem.config.cjs
pm2 save
```

The app must be started with `--experimental-sqlite`:

```js
node_args: '--experimental-sqlite'
```

### Caddy

Add to your Caddyfile:

```
your-production-domain.example.com {
    reverse_proxy 172.18.0.1:3001
}
```

If Caddy runs inside Docker, allow the Docker subnet through the firewall:

```bash
ufw allow from 172.18.0.0/16 to any port 3001
```

Reload Caddy after editing the Caddyfile.

## Microsoft SSO Setup (Azure AD)

1. Go to **Azure Portal → App registrations → New registration**
2. Set Redirect URI to `https://your-domain/auth/callback`
3. Under **Certificates & secrets**, create a new client secret
4. Copy the **Tenant ID**, **Application (client) ID**, and **Secret value** into `.env`
5. Under **API permissions**, ensure `User.Read` (Microsoft Graph) is granted

## Project Structure

```
├── server.js            # Express backend — all API routes, auth, SQLite schema
├── src/
│   ├── contexts/
│   │   └── AuthContext.jsx   # Auth state (user, workspace, MSAuth)
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   └── Modal.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── WorkspaceSelect.jsx
│   │   ├── Projects.jsx
│   │   ├── Timesheets.jsx
│   │   ├── Reports.jsx
│   │   ├── Calendar.jsx      # Report delivery calendar view
│   │   └── Admin.jsx         # Settings page (project types, users, clients, and — for super admins — all workspaces)
│   └── main.jsx
├── index.html
├── vite.config.js
├── ecosystem.config.cjs      # PM2 config (production)
├── .env.example
└── package.json
```

## License

Internal tool — not for public distribution.
