# Woven Time Tracking

Internal time tracking tool for the Woven Research & Insights team. Tracks time logged against client projects with workspace isolation, Microsoft SSO, and reporting.

## Features

- **Projects** — Auto-generated project codes (WRI-001, WRI-002, …), project types with color tags, budgeted hours with usage progress bar, file attachments, and team member allocation
- **Timesheets** — Log time against assigned projects; entries are tied to the logged-in user automatically
- **Clients & Contacts** — Multi-project clients with contacts (name, email, phone required); contacts can be set as project requestors
- **Reports** — Time by user or by project, with budget vs. logged hours visualization
- **Workspaces** — Each team gets an isolated workspace; users can belong to multiple workspaces
- **Settings (Admin)** — Manage project types, workspace users/roles, and clients & contacts
- **Microsoft SSO** — Azure AD OAuth2 login; dev-login fallback when credentials are not configured

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

Backend runs on `http://localhost:3000`, Vite dev server on `http://localhost:5173` (proxies `/api` to the backend automatically).

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
| `SESSION_SECRET` | Random secret for signing session cookies |
| `AZURE_TENANT_ID` | Azure AD tenant ID or domain (e.g. `woventalent.in`) |
| `AZURE_CLIENT_ID` | Azure AD application (client) ID |
| `AZURE_CLIENT_SECRET` | Azure AD client secret value |
| `AZURE_REDIRECT_URI` | OAuth2 callback URL (e.g. `https://time.woventalent.in/auth/callback`) |
| `PORT` | Port for the Express server (default `3000`) |

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
time.woventalent.in {
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
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── WorkspaceSelect.jsx
│   │   ├── Projects.jsx
│   │   ├── Timesheets.jsx
│   │   ├── Reports.jsx
│   │   └── Admin.jsx         # Settings page (project types, users, clients)
│   └── main.jsx
├── index.html
├── vite.config.js
├── ecosystem.config.cjs      # PM2 config (production)
├── .env.example
└── package.json
```

## License

Internal tool — not for public distribution.
