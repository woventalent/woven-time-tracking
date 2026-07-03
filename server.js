import express from 'express'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID, randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const APP_URL    = process.env.APP_URL || 'https://your-production-domain.example.com'

// ── Email ─────────────────────────────────────────────────────────────────────
const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
const mailer = SMTP_CONFIGURED ? nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null

// Graph API token cache (app-level, expires ~1h)
let _graphToken = null
let _graphTokenExpiry = 0
async function getGraphToken() {
  if (_graphToken && Date.now() < _graphTokenExpiry - 60_000) return _graphToken
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'woventalent.in'}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope:         'https://graph.microsoft.com/.default',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  _graphToken = data.access_token
  _graphTokenExpiry = Date.now() + data.expires_in * 1000
  return _graphToken
}

function buildEmailHtml({ toName, project, requestorName, clientName }) {
  const dateAssigned = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `
    <p>Dear ${toName},</p>
    <p>A new project has been assigned to you. Please find the project details below:</p>
    <p><strong>Project Details:</strong></p>
    <ul>
      <li><strong>Project Name:</strong> ${project.name}</li>
      <li><strong>Project Description:</strong> ${project.description || 'N/A'}</li>
      <li><strong>Project Requester:</strong> ${requestorName || 'N/A'}</li>
      <li><strong>Client:</strong> ${clientName || 'N/A'}</li>
      <li><strong>Date Assigned:</strong> ${dateAssigned}</li>
      <li><strong>Project Status:</strong> ${project.status === 'active' ? 'Active' : project.status}</li>
    </ul>
    <p>Please review the project details, initiate the project at the earliest, and schedule a briefing call with the requester.</p>
    <p>You can access the project using the link below:<br>
    <a href="${APP_URL}">Open Project</a></p>
    <p>If you have any questions or require additional information, please get in touch with the project requester or your Team Lead.</p>
    <br>
    <p>Regards,<br>${project.senderName || 'Time Tracking System'}</p>
  `
}

async function sendAssignmentEmail({ fromEmail, fromName, toEmail, toName, project, requestorName, clientName }) {
  const html = buildEmailHtml({ toName, project, requestorName, clientName })
  const subject = `New Project Assigned: ${project.name}`

  // Use Graph API (sends from the logged-in user's M365 mailbox) when SSO is enabled
  if (MS_AUTH && fromEmail) {
    try {
      const token = await getGraphToken()
      const graphRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: toEmail, name: toName } }],
          },
          saveToSentItems: true,
        }),
      })
      if (!graphRes.ok) {
        const err = await graphRes.json().catch(() => ({}))
        console.error('Graph sendMail failed:', err?.error?.message || graphRes.status)
      }
    } catch (err) {
      console.error('Graph email error:', err.message)
    }
    return
  }

  // Fallback: SMTP (for dev / non-SSO environments)
  if (!mailer) return
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: toEmail, subject, html })
  } catch (err) {
    console.error('SMTP email failed:', err.message)
  }
}

const MS_AUTH    = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
const TENANT     = process.env.AZURE_TENANT_ID || 'woventalent.in'
const REDIRECT_URI = process.env.AUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`
const SUPER_ADMIN_EMAILS = new Set(
  (process.env.SUPER_ADMIN_EMAIL || '').split(',').map(e => e.toLowerCase().trim()).filter(Boolean)
)

// ── Upload dir ────────────────────────────────────────────────────────────────
const UPLOAD_DIR = join(__dirname, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) => cb(null, `${randomUUID()}-${file.originalname.replace(/[^\w._-]/g, '_')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 400 }))
    }
  },
})

// ── Database ──────────────────────────────────────────────────────────────────
const db = new DatabaseSync(join(__dirname, 'timetracking.db'))
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    microsoft_oid TEXT UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspace_members (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    role         TEXT DEFAULT 'member',
    UNIQUE(workspace_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id INTEGER REFERENCES workspaces(id),
    expires_at   DATETIME NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id),
    name         TEXT NOT NULL,
    color        TEXT DEFAULT '#64748b',
    active       INTEGER DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS clients (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id),
    name         TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id),
    client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    email        TEXT,
    role         TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requestors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES workspaces(id),
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    active       INTEGER DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, email)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id    INTEGER REFERENCES workspaces(id),
    project_code    TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    project_type_id INTEGER REFERENCES project_types(id),
    request_date    DATE,
    requestor_id    INTEGER REFERENCES requestors(id),
    client_id       INTEGER REFERENCES clients(id),
    budgeted_hours  REAL,
    status          TEXT DEFAULT 'active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS project_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type     TEXT,
    size          INTEGER,
    description   TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS timesheet_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id),
    user_id     INTEGER REFERENCES users(id),
    date        DATE NOT NULL,
    hours       REAL NOT NULL CHECK(hours > 0),
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// ── Migrations ────────────────────────────────────────────────────────────────
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`)
  }
}
ensureColumn('clients',            'workspace_id',         'INTEGER REFERENCES workspaces(id)')
ensureColumn('contacts',           'workspace_id',         'INTEGER REFERENCES workspaces(id)')
ensureColumn('contacts',           'phone',                'TEXT')
ensureColumn('requestors',         'workspace_id',         'INTEGER REFERENCES workspaces(id)')
ensureColumn('projects',           'workspace_id',         'INTEGER REFERENCES workspaces(id)')
ensureColumn('projects',           'project_type_id',      'INTEGER REFERENCES project_types(id)')
ensureColumn('projects',           'budgeted_hours',       'REAL')
ensureColumn('projects',           'requestor_contact_id', 'INTEGER REFERENCES contacts(id)')
ensureColumn('timesheet_entries',  'user_id',              'INTEGER REFERENCES users(id)')
ensureColumn('projects',           'report_initiated',     'DATE')
ensureColumn('projects',           'report_delivered',     'DATE')
ensureColumn('users',              'global_role',          "TEXT DEFAULT NULL")
ensureColumn('workspaces',         'code_prefix',          "TEXT DEFAULT 'WRI'")
ensureColumn('projects',           'description',          'TEXT')
ensureColumn('project_types',      'description',          'TEXT')
ensureColumn('project_members',    'is_spoc',              'INTEGER NOT NULL DEFAULT 0')

// ── Seed defaults ─────────────────────────────────────────────────────────────
db.exec(`INSERT OR IGNORE INTO workspaces (id, name, slug)
         VALUES (1, 'Research & Insights', 'research-insights')`)

for (const t of ['clients', 'contacts', 'requestors', 'projects']) {
  db.exec(`UPDATE "${t}" SET workspace_id = 1 WHERE workspace_id IS NULL`)
}

// One-time cleanup: revoke workspace access that was granted only because of the
// removed auto-join-to-workspace-1 fallback, for an account outside the configured tenant.
db.exec(`DELETE FROM workspace_members WHERE user_id IN (
  SELECT id FROM users WHERE email = 'noble.mavely@nativeworld.com'
)`)

// Migrate old employee_id timesheet entries → user_id via email match (only if employees table exists)
const employeesExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='employees'`).get()
if (employeesExists) {
  const hasEmployeeId = db.prepare(`PRAGMA table_info(timesheet_entries)`).all().some(c => c.name === 'employee_id')
  if (hasEmployeeId) {
    db.exec(`
      UPDATE timesheet_entries
      SET user_id = (
        SELECT u.id FROM users u
        JOIN employees e ON e.email = u.email
        WHERE e.id = timesheet_entries.employee_id
      )
      WHERE user_id IS NULL AND employee_id IS NOT NULL
    `)
  }
}

// ── Session helpers ───────────────────────────────────────────────────────────
function createSession(userId, workspaceId) {
  const id = randomUUID()
  const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0]
  db.prepare('INSERT INTO sessions (id, user_id, workspace_id, expires_at) VALUES (?, ?, ?, ?)').run(id, userId, workspaceId ?? null, exp)
  return id
}

function getSession(id) {
  if (!id) return null
  return db.prepare(`
    SELECT s.*, u.name AS user_name, u.email AS user_email, u.global_role AS user_global_role,
           w.name AS workspace_name, w.slug AS workspace_slug
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(id) ?? null
}

function getUserWorkspaces(userId) {
  return db.prepare(`
    SELECT w.*, wm.role FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ? ORDER BY w.name
  `).all(userId)
}

function upsertUser({ microsoftOid, email, name }) {
  if (microsoftOid) {
    const existing = db.prepare('SELECT * FROM users WHERE microsoft_oid = ?').get(microsoftOid)
    if (existing) {
      db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, existing.id)
      return existing
    }
  }
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (byEmail) {
    db.prepare('UPDATE users SET name = ?, microsoft_oid = COALESCE(microsoft_oid, ?) WHERE id = ?').run(name, microsoftOid ?? null, byEmail.id)
    return byEmail
  }
  const r = db.prepare('INSERT INTO users (microsoft_oid, email, name) VALUES (?, ?, ?)').run(microsoftOid ?? null, email, name)
  return { id: r.lastInsertRowid, email, name }
}

function ensureWorkspaceMember(userId, workspaceId, role = 'member') {
  db.prepare('INSERT OR IGNORE INTO workspace_members (user_id, workspace_id, role) VALUES (?, ?, ?)').run(userId, workspaceId, role)
}

function maybeElevateSuperAdmin(user) {
  if (!SUPER_ADMIN_EMAILS.size) return
  if (SUPER_ADMIN_EMAILS.has((user.email || '').toLowerCase())) {
    db.prepare("UPDATE users SET global_role = 'super_admin' WHERE id = ? AND (global_role IS NULL OR global_role != 'super_admin')").run(user.id)
  }
}

function setSessionCookie(res, id) {
  res.cookie('wtt_session', id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json())
app.use(cookieParser())

// ── Public ────────────────────────────────────────────────────────────────────
app.get('/api/config', (_, res) => res.json({ msAuthEnabled: MS_AUTH }))

// ── Auth: Microsoft SSO ───────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
  if (!MS_AUTH) return res.redirect('/?dev-login=1')
  const state = randomBytes(16).toString('hex')
  res.cookie('ms_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 })
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID, response_type: 'code',
    redirect_uri: REDIRECT_URI, response_mode: 'query',
    scope: 'openid profile email User.Read', state,
  })
  res.redirect(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`)
})

app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) return res.redirect(`/?login-error=${encodeURIComponent(error)}`)
  if (!code || state !== req.cookies?.ms_state) return res.redirect('/?login-error=invalid_state')
  res.clearCookie('ms_state')
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID, client_secret: process.env.AZURE_CLIENT_SECRET,
        code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (tokens.error) throw new Error(tokens.error_description || tokens.error)
    const profile = await (await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })).json()
    const email = profile.mail || profile.userPrincipalName
    // Defense-in-depth: reject guest/external accounts whose email domain doesn't
    // match the configured tenant, even if Entra ID authenticated them (e.g. B2B guests).
    if (TENANT.includes('.')) {
      const tenantDomain = TENANT.toLowerCase()
      const emailDomain = (email || '').split('@')[1]?.toLowerCase()
      if (emailDomain !== tenantDomain) {
        console.error(`MS auth rejected: email domain "${emailDomain}" does not match tenant "${tenantDomain}"`)
        return res.redirect(`/?login-error=${encodeURIComponent('tenant_not_allowed')}`)
      }
    }
    const user = upsertUser({ microsoftOid: profile.id, email, name: profile.displayName })
    maybeElevateSuperAdmin(user)
    const ws = getUserWorkspaces(user.id)
    const sessionId = createSession(user.id, ws.length === 1 ? ws[0].id : null)
    setSessionCookie(res, sessionId)
    res.redirect('/')
  } catch (err) {
    console.error('MS auth error:', err)
    res.redirect(`/?login-error=${encodeURIComponent(err.message)}`)
  }
})

app.post('/auth/dev-login', (req, res) => {
  if (MS_AUTH) return res.status(403).json({ error: 'Dev login disabled' })
  const { email, name } = req.body
  if (!email || !name) return res.status(400).json({ error: 'Email and name required' })
  const user = upsertUser({ microsoftOid: null, email, name })
  maybeElevateSuperAdmin(user)
  const ws = getUserWorkspaces(user.id)
  const sessionId = createSession(user.id, ws.length === 1 ? ws[0].id : null)
  setSessionCookie(res, sessionId)
  res.json({ ok: true })
})

app.post('/auth/logout', (req, res) => {
  const sid = req.cookies?.wtt_session
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid)
  res.clearCookie('wtt_session')
  res.json({ ok: true })
})

// ── /api/auth — unprotected ───────────────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.json(null)
  const wm = s.workspace_id
    ? db.prepare('SELECT role FROM workspace_members WHERE user_id = ? AND workspace_id = ?').get(s.user_id, s.workspace_id)
    : null
  res.json({
    userId: s.user_id, userName: s.user_name, userEmail: s.user_email,
    workspaceId: s.workspace_id, workspaceName: s.workspace_name, workspaceSlug: s.workspace_slug,
    role: wm?.role ?? 'member',
    globalRole: s.user_global_role ?? null,
  })
})

app.post('/api/auth/select-workspace', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  const { workspaceId } = req.body
  const ok = db.prepare('SELECT 1 FROM workspace_members WHERE user_id = ? AND workspace_id = ?').get(s.user_id, workspaceId)
  if (!ok) return res.status(403).json({ error: 'Not a member' })
  db.prepare('UPDATE sessions SET workspace_id = ? WHERE id = ?').run(workspaceId, s.id)
  res.json({ ok: true })
})

app.get('/api/auth/workspaces', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  res.json(getUserWorkspaces(s.user_id))
})

// Workspaces the user isn't a member of yet, but that already have at least one
// member sharing their email domain — lets a new sign-up join their org's existing
// workspace instead of only being able to create a new one.
app.get('/api/auth/joinable-workspaces', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  const domain = (s.user_email || '').split('@')[1]?.toLowerCase()
  if (!domain) return res.json([])
  const rows = db.prepare(`
    SELECT DISTINCT w.id, w.name, w.slug, w.code_prefix,
      (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspace_id = w.id) AS member_count
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    JOIN users u              ON u.id = wm.user_id
    WHERE LOWER(SUBSTR(u.email, INSTR(u.email, '@') + 1)) = ?
      AND w.id NOT IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
    ORDER BY w.name
  `).all(domain, s.user_id)
  res.json(rows)
})

app.post('/api/auth/join-workspace', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  const { workspaceId } = req.body
  const domain = (s.user_email || '').split('@')[1]?.toLowerCase()
  if (!domain) return res.status(400).json({ error: 'Could not determine your email domain' })
  const match = db.prepare(`
    SELECT 1 FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND LOWER(SUBSTR(u.email, INSTR(u.email, '@') + 1)) = ?
  `).get(workspaceId, domain)
  if (!match) return res.status(403).json({ error: 'This workspace is not open to your email domain' })
  ensureWorkspaceMember(s.user_id, workspaceId, 'member')
  db.prepare('UPDATE sessions SET workspace_id = ? WHERE id = ?').run(workspaceId, s.id)
  res.json({ ok: true })
})

// Any authenticated user can create a workspace, even before joining one —
// registered ahead of the workspace-membership guard below for that reason.
app.post('/api/admin/workspaces', (req, res) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  const { name, code_prefix } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Workspace name is required' })
  if (!code_prefix?.trim()) return res.status(400).json({ error: 'Code prefix is required' })
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const prefix = code_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  try {
    const r = db.prepare('INSERT INTO workspaces (name, slug, code_prefix) VALUES (?, ?, ?)').run(name.trim(), slug, prefix)
    ensureWorkspaceMember(s.user_id, r.lastInsertRowid, 'admin')
    res.json({ id: r.lastInsertRowid, name: name.trim(), slug, code_prefix: prefix })
  } catch { res.status(400).json({ error: 'Workspace name or slug already exists' }) }
})

// Super admins manage workspaces globally, so these routes must work even before
// the caller has selected (or joined) any workspace — registered ahead of the
// workspace-membership guard below for that reason, same as workspace creation.
function requireSuperAdminSession(req, res) {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return null }
  if (s.user_global_role !== 'super_admin') { res.status(403).json({ error: 'Super admin only' }); return null }
  return s
}

app.get('/api/admin/workspaces', (req, res) => {
  if (!requireSuperAdminSession(req, res)) return
  res.json(db.prepare(`
    SELECT w.*,
      COUNT(DISTINCT wm.user_id) AS member_count,
      COUNT(DISTINCT p.id)       AS project_count
    FROM workspaces w
    LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
    LEFT JOIN projects p           ON p.workspace_id  = w.id
    GROUP BY w.id ORDER BY w.name
  `).all())
})

app.put('/api/admin/workspaces/:id', (req, res) => {
  if (!requireSuperAdminSession(req, res)) return
  const { name, code_prefix } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Workspace name is required' })
  const prefix = (code_prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  db.prepare('UPDATE workspaces SET name = ?, code_prefix = ? WHERE id = ?').run(name.trim(), prefix || 'WRI', req.params.id)
  res.json({ success: true })
})

app.delete('/api/admin/workspaces/:id', (req, res) => {
  if (!requireSuperAdminSession(req, res)) return
  const counts = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE workspace_id = ?').get(req.params.id)
  if (counts.c > 0) return res.status(400).json({ error: 'Cannot delete a workspace that has projects. Archive all projects first.' })
  try {
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ error: 'Cannot delete a workspace that has clients, contacts, or requestors. Remove them first.' })
  }
})

// ── Auth guard ────────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  if (!s.workspace_id) return res.status(403).json({ error: 'No workspace selected' })
  const wm = db.prepare('SELECT role FROM workspace_members WHERE user_id = ? AND workspace_id = ?').get(s.user_id, s.workspace_id)
  if (!wm) return res.status(403).json({ error: 'Not a member of this workspace' })
  req.userId      = Number(s.user_id)
  req.userEmail   = s.user_email ?? null
  req.userName    = s.user_name ?? null
  req.workspaceId = Number(s.workspace_id)
  req.globalRole  = s.user_global_role ?? null
  req.userRole    = wm.role
  next()
})

// ── PROJECT TYPES ─────────────────────────────────────────────────────────────

app.get('/api/project-types', (req, res) => {
  res.json(db.prepare('SELECT * FROM project_types WHERE workspace_id = ? ORDER BY name').all(req.workspaceId))
})

app.post('/api/project-types', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, description } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const r = db.prepare('INSERT INTO project_types (workspace_id, name, description) VALUES (?, ?, ?)').run(req.workspaceId, name.trim(), description || null)
    res.json({ id: r.lastInsertRowid, name: name.trim(), description: description || null, active: 1 })
  } catch { res.status(400).json({ error: 'Type name already exists' }) }
})

app.put('/api/project-types/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, description, active } = req.body
  db.prepare('UPDATE project_types SET name = ?, description = ?, active = ? WHERE id = ? AND workspace_id = ?')
    .run(name, description || null, active ?? 1, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/project-types/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  try {
    db.prepare('DELETE FROM project_types WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
    res.json({ success: true })
  } catch { res.status(400).json({ error: 'Cannot delete — this type is in use by one or more projects' }) }
})

// ── CLIENTS ───────────────────────────────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, COUNT(DISTINCT p.id) as project_count
    FROM clients c LEFT JOIN projects p ON p.client_id = c.id
    WHERE c.workspace_id = ? GROUP BY c.id ORDER BY c.name
  `).all(req.workspaceId))
})

app.post('/api/clients', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const r = db.prepare('INSERT INTO clients (workspace_id, name) VALUES (?, ?)').run(req.workspaceId, name.trim())
    res.json({ id: r.lastInsertRowid, name: name.trim(), project_count: 0 })
  } catch { res.status(400).json({ error: 'Client name already exists' }) }
})

app.put('/api/clients/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  db.prepare('UPDATE clients SET name = ? WHERE id = ? AND workspace_id = ?').run(req.body.name, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/clients/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  try {
    db.prepare('DELETE FROM clients WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
    res.json({ success: true })
  } catch { res.status(400).json({ error: 'Cannot delete — this client is in use by one or more projects' }) }
})

// ── CONTACTS ──────────────────────────────────────────────────────────────────

app.get('/api/clients/:id/contacts', (req, res) => {
  res.json(db.prepare(`
    SELECT ct.* FROM contacts ct JOIN clients c ON c.id = ct.client_id
    WHERE ct.client_id = ? AND c.workspace_id = ? ORDER BY ct.name
  `).all(req.params.id, req.workspaceId))
})

app.post('/api/clients/:id/contacts', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, email, phone, role } = req.body
  if (!name?.trim())  return res.status(400).json({ error: 'Full name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' })
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!client) return res.status(404).json({ error: 'Client not found' })
  const r = db.prepare('INSERT INTO contacts (workspace_id, client_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.workspaceId, req.params.id, name.trim(), email.trim(), phone.trim(), role || null
  )
  res.json({ id: r.lastInsertRowid, name: name.trim(), email: email.trim(), phone: phone.trim(), role })
})

app.put('/api/contacts/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, email, phone, role } = req.body
  if (!name?.trim())  return res.status(400).json({ error: 'Full name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' })
  db.prepare('UPDATE contacts SET name = ?, email = ?, phone = ?, role = ? WHERE id = ? AND workspace_id = ?')
    .run(name.trim(), email.trim(), phone.trim(), role || null, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/contacts/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  try {
    db.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
    res.json({ success: true })
  } catch { res.status(400).json({ error: 'Cannot delete — this contact is in use as a project requestor' }) }
})

// ── REQUESTORS ────────────────────────────────────────────────────────────────

app.get('/api/requestors', (req, res) => {
  res.json(db.prepare('SELECT * FROM requestors WHERE workspace_id = ? ORDER BY name').all(req.workspaceId))
})

app.post('/api/requestors', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, email } = req.body
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email required' })
  try {
    const r = db.prepare('INSERT INTO requestors (workspace_id, name, email) VALUES (?, ?, ?)').run(req.workspaceId, name.trim(), email.trim())
    res.json({ id: r.lastInsertRowid, name: name.trim(), email: email.trim(), active: 1 })
  } catch { res.status(400).json({ error: 'Email already exists' }) }
})

app.put('/api/requestors/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, email, active } = req.body
  db.prepare('UPDATE requestors SET name = ?, email = ?, active = ? WHERE id = ? AND workspace_id = ?')
    .run(name, email, active ?? 1, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/requestors/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  db.prepare('DELETE FROM requestors WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
})

// ── WORKSPACE USERS (was Employees) ──────────────────────────────────────────

app.get('/api/workspace-users', (req, res) => {
  res.json(db.prepare(`
    SELECT u.*, wm.role,
      COUNT(DISTINCT pm.project_id) as project_count
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
    LEFT JOIN project_members pm ON pm.user_id = u.id
    GROUP BY u.id ORDER BY u.name
  `).all(req.workspaceId))
})

app.post('/api/workspace-users', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  const { name, email, role } = req.body
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email required' })
  try {
    const user = upsertUser({ microsoftOid: null, email: email.trim(), name: name.trim() })
    ensureWorkspaceMember(user.id, req.workspaceId, role || 'member')
    res.json({ ...user, role: role || 'member' })
  } catch { res.status(400).json({ error: 'Could not add user' }) }
})

app.put('/api/workspace-users/:userId/role', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  db.prepare('UPDATE workspace_members SET role = ? WHERE user_id = ? AND workspace_id = ?')
    .run(req.body.role, req.params.userId, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/workspace-users/:userId', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Workspace admin only' })
  db.prepare('DELETE FROM workspace_members WHERE user_id = ? AND workspace_id = ?').run(req.params.userId, req.workspaceId)
  res.json({ success: true })
})

// ── PROJECTS ──────────────────────────────────────────────────────────────────

function nextProjectCode(workspaceId) {
  const ws = db.prepare('SELECT code_prefix FROM workspaces WHERE id = ?').get(workspaceId)
  const prefix = (ws?.code_prefix || 'WRI').toUpperCase()
  const offset = prefix.length + 2 // e.g. "WRI-" = 4, so SUBSTR starts at 5
  const last = db.prepare(
    `SELECT project_code FROM projects WHERE workspace_id = ? AND project_code LIKE ?
     ORDER BY CAST(SUBSTR(project_code, ?) AS INTEGER) DESC LIMIT 1`
  ).get(workspaceId, `${prefix}-%`, offset)
  if (!last) return `${prefix}-001`
  return `${prefix}-${String(parseInt(last.project_code.slice(prefix.length + 1)) + 1).padStart(3, '0')}`
}

app.get('/api/projects', (req, res) => {
  const assignedOnly = req.query.assigned === 'true'
  let sql = `
    SELECT p.*,
      pt.name  AS type_name,  pt.color AS type_color,
      ct.name  AS requestor_name, ct.email AS requestor_email, ct.phone AS requestor_phone,
      c.name   AS client_name,
      COALESCE(SUM(te.hours), 0)          AS total_hours,
      COUNT(DISTINCT te.id)               AS entry_count,
      COUNT(DISTINCT pm.user_id)          AS member_count,
      ROUND(COALESCE(SUM(te.hours),0) * 100.0 / NULLIF(p.budgeted_hours,0), 1) AS budget_pct,
      (SELECT GROUP_CONCAT(mu.name, '||') FROM project_members pm2
         JOIN users mu ON mu.id = pm2.user_id WHERE pm2.project_id = p.id) AS users_assigned
    FROM projects p
    LEFT JOIN project_types pt        ON pt.id  = p.project_type_id
    LEFT JOIN contacts ct             ON ct.id  = p.requestor_contact_id
    LEFT JOIN clients c               ON c.id   = p.client_id
    LEFT JOIN timesheet_entries te    ON te.project_id = p.id
    LEFT JOIN project_members pm      ON pm.project_id = p.id
    WHERE p.workspace_id = ?
  `
  const params = [req.workspaceId]
  if (assignedOnly) {
    sql += ' AND p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)'
    params.push(req.userId)
  }
  sql += ' GROUP BY p.id ORDER BY p.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/projects', async (req, res) => {
  const { name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, report_initiated, report_delivered, description, member_ids, spoc_user_id } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' })
  if (budgeted_hours !== undefined && budgeted_hours !== null && budgeted_hours !== '') {
    const bh = Number(budgeted_hours)
    if (isNaN(bh) || bh < 0) return res.status(400).json({ error: 'Budgeted hours must be a positive number' })
  }
  const code = nextProjectCode(req.workspaceId)
  const r = db.prepare(
    'INSERT INTO projects (workspace_id, project_code, name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, report_initiated, report_delivered, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.workspaceId, code, name.trim(), project_type_id || null, request_date || null, requestor_contact_id || null, client_id || null, budgeted_hours || null, report_initiated || null, report_delivered || null, description || null)
  const projectId = r.lastInsertRowid

  const client       = client_id ? db.prepare('SELECT name FROM clients WHERE id = ?').get(client_id) : null
  const requestorRow = requestor_contact_id ? db.prepare('SELECT name FROM contacts WHERE id = ?').get(requestor_contact_id) : null

  if (Array.isArray(member_ids) && member_ids.length > 0) {
    for (const uid of member_ids) {
      const numUid  = Number(uid)
      const isSPOC  = spoc_user_id && numUid === Number(spoc_user_id) ? 1 : 0
      db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, is_spoc) VALUES (?, ?, ?)').run(projectId, numUid, isSPOC)
      if (numUid !== req.userId) {
        const assignedUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(numUid)
        if (assignedUser?.email) {
          sendAssignmentEmail({
            fromEmail:     req.userEmail,
            fromName:      req.userName,
            toEmail:       assignedUser.email,
            toName:        assignedUser.name,
            project:       { name: name.trim(), description: description || '', status: 'active', senderName: req.userName },
            requestorName: requestorRow?.name || null,
            clientName:    client?.name || null,
          })
        }
      }
    }
    // Ensure admin creator is always a member (without SPOC unless explicitly set)
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, is_spoc) VALUES (?, ?, 0)').run(projectId, req.userId)
  } else {
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, is_spoc) VALUES (?, ?, 0)').run(projectId, req.userId)
  }

  res.json({ id: projectId, project_code: code, name: name.trim() })
})

app.put('/api/projects/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Admin only' })
  const { name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, status, report_initiated, report_delivered, description } = req.body
  if (budgeted_hours !== undefined && budgeted_hours !== null && budgeted_hours !== '') {
    const bh = Number(budgeted_hours)
    if (isNaN(bh) || bh < 0) return res.status(400).json({ error: 'Budgeted hours must be a positive number' })
  }
  db.prepare(
    'UPDATE projects SET name=?, project_type_id=?, request_date=?, requestor_contact_id=?, client_id=?, budgeted_hours=?, status=?, report_initiated=?, report_delivered=?, description=? WHERE id=? AND workspace_id=?'
  ).run(name, project_type_id || null, request_date || null, requestor_contact_id || null, client_id || null, budgeted_hours || null, status || 'active', report_initiated || null, report_delivered || null, description || null, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.patch('/api/projects/:id/status', (req, res) => {
  const { status } = req.body
  const VALID_STATUSES = ['active', 'completed', 'on_hold', 'cancelled']
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') {
    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!isMember) return res.status(403).json({ error: 'You are not assigned to this project' })
  }
  db.prepare('UPDATE projects SET status = ? WHERE id = ? AND workspace_id = ?').run(status, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/projects/:id', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Admin only' })
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM timesheet_entries WHERE project_id = ?').run(req.params.id)
  db.prepare('DELETE FROM projects WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
})

// ── PROJECT MEMBERS ───────────────────────────────────────────────────────────

app.get('/api/projects/:id/members', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json(db.prepare(`
    SELECT u.*, pm.added_at, pm.is_spoc FROM users u
    JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY pm.is_spoc DESC, u.name
  `).all(req.params.id))
})

app.post('/api/projects/:id/members', (req, res) => {
  const { userId } = req.body
  const project = db.prepare(`
    SELECT p.*, ct.name AS requestor_name, c.name AS client_name
    FROM projects p
    LEFT JOIN contacts ct ON ct.id = p.requestor_contact_id
    LEFT JOIN clients c   ON c.id  = p.client_id
    WHERE p.id = ? AND p.workspace_id = ?
  `).get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const numUid = Number(userId)
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(req.params.id, numUid)
  if (numUid !== req.userId) {
    const assignedUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(numUid)
    if (assignedUser?.email) {
      sendAssignmentEmail({
        fromEmail:     req.userEmail,
        fromName:      req.userName,
        toEmail:       assignedUser.email,
        toName:        assignedUser.name,
        project:       { name: project.name, description: project.description || '', status: project.status, senderName: req.userName },
        requestorName: project.requestor_name || null,
        clientName:    project.client_name || null,
      })
    }
  }
  res.json({ success: true })
})

app.delete('/api/projects/:id/members/:userId', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.id, req.params.userId)
  res.json({ success: true })
})

app.patch('/api/projects/:id/members/:userId/spoc', (req, res) => {
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') return res.status(403).json({ error: 'Admin only' })
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('UPDATE project_members SET is_spoc = 0 WHERE project_id = ?').run(req.params.id)
  db.prepare('UPDATE project_members SET is_spoc = 1 WHERE project_id = ? AND user_id = ?').run(req.params.id, req.params.userId)
  res.json({ success: true })
})

// ── PROJECT DOCUMENTS ─────────────────────────────────────────────────────────

app.get('/api/projects/:id/documents', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json(db.prepare(`
    SELECT pd.*, u.name AS uploader_name
    FROM project_documents pd
    JOIN users u ON u.id = pd.user_id
    WHERE pd.project_id = ?
    ORDER BY pd.created_at DESC
  `).all(req.params.id))
})

app.post('/api/projects/:id/documents', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    next()
  })
}, (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const { description } = req.body
  const { filename, originalname, mimetype, size } = req.file
  const r = db.prepare(
    'INSERT INTO project_documents (project_id, user_id, filename, original_name, mime_type, size, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, req.userId, filename, originalname, mimetype, size, description || null)
  res.json({ id: r.lastInsertRowid, original_name: originalname, mime_type: mimetype, size, description })
})

app.get('/api/projects/:id/documents/:docId/download', (req, res) => {
  const doc = db.prepare(`
    SELECT pd.* FROM project_documents pd
    JOIN projects p ON p.id = pd.project_id AND p.workspace_id = ?
    WHERE pd.id = ? AND pd.project_id = ?
  `).get(req.workspaceId, req.params.docId, req.params.id)
  if (!doc) return res.status(404).json({ error: 'Not found' })
  res.download(join(UPLOAD_DIR, doc.filename), doc.original_name)
})

app.delete('/api/projects/:id/documents/:docId', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM project_documents WHERE id = ? AND project_id = ?').run(req.params.docId, req.params.id)
  res.json({ success: true })
})

// ── TIMESHEET ENTRIES ─────────────────────────────────────────────────────────

app.get('/api/timesheets', (req, res) => {
  const { project_id, from, to, user_id } = req.query
  const showAll = req.query.all === 'true'
  let sql = `
    SELECT te.*, p.project_code, p.name AS project_name, c.name AS client_name,
           u.name AS user_name
    FROM timesheet_entries te
    JOIN  projects p ON p.id = te.project_id AND p.workspace_id = ?
    LEFT JOIN users u ON u.id = te.user_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE ${showAll ? '1=1' : 'te.user_id = ?'}
  `
  const params = showAll ? [req.workspaceId] : [req.workspaceId, req.userId]
  if (showAll && user_id) { sql += ' AND te.user_id = ?'; params.push(user_id) }
  if (project_id) { sql += ' AND te.project_id = ?'; params.push(project_id) }
  if (from)       { sql += ' AND te.date >= ?';       params.push(from) }
  if (to)         { sql += ' AND te.date <= ?';       params.push(to) }
  sql += ' ORDER BY te.date DESC, te.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/timesheets', (req, res) => {
  const { project_id, date, hours, description } = req.body
  if (!project_id || !date || !hours) return res.status(400).json({ error: 'Project, date, and hours are required' })
  const today = new Date().toISOString().split('T')[0]
  if (date > today) return res.status(400).json({ error: 'Time entries cannot be logged for future dates' })
  const parsedHours = parseFloat(hours)
  if (isNaN(parsedHours) || parsedHours < 0.25 || parsedHours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0.25 and 24' })
  }
  const project = db.prepare('SELECT id, report_initiated, report_delivered FROM projects WHERE id = ? AND workspace_id = ?').get(project_id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.report_initiated && date < project.report_initiated) {
    return res.status(400).json({ error: 'Date cannot be before the project Report Initiated date' })
  }
  if (project.report_delivered && date > project.report_delivered) {
    return res.status(400).json({ error: 'Date cannot be after the project Report Delivered date' })
  }
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') {
    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(project_id, req.userId)
    if (!isMember) return res.status(403).json({ error: 'You are not assigned to this project' })
  }
  const r = db.prepare(
    'INSERT INTO timesheet_entries (project_id, user_id, date, hours, description) VALUES (?, ?, ?, ?, ?)'
  ).run(project_id, req.userId, date, parsedHours, description || null)
  res.json({ id: r.lastInsertRowid })
})

app.put('/api/timesheets/:id', (req, res) => {
  const { project_id, date, hours, description } = req.body
  const today = new Date().toISOString().split('T')[0]
  if (date > today) return res.status(400).json({ error: 'Time entries cannot be logged for future dates' })
  const parsedHours = parseFloat(hours)
  if (isNaN(parsedHours) || parsedHours < 0.25 || parsedHours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0.25 and 24' })
  }
  const entry = db.prepare(`
    SELECT te.id FROM timesheet_entries te
    JOIN projects p ON p.id = te.project_id
    WHERE te.id = ? AND te.user_id = ? AND p.workspace_id = ?
  `).get(req.params.id, req.userId, req.workspaceId)
  if (!entry) return res.status(404).json({ error: 'Timesheet entry not found' })
  const project = db.prepare('SELECT id, report_initiated, report_delivered FROM projects WHERE id = ? AND workspace_id = ?').get(project_id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  if (project.report_initiated && date < project.report_initiated) {
    return res.status(400).json({ error: 'Date cannot be before the project Report Initiated date' })
  }
  if (project.report_delivered && date > project.report_delivered) {
    return res.status(400).json({ error: 'Date cannot be after the project Report Delivered date' })
  }
  if (req.userRole !== 'admin' && req.globalRole !== 'super_admin') {
    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(project_id, req.userId)
    if (!isMember) return res.status(403).json({ error: 'You are not assigned to this project' })
  }
  db.prepare('UPDATE timesheet_entries SET project_id=?, date=?, hours=?, description=? WHERE id=? AND user_id=?')
    .run(project_id, date, parsedHours, description || null, req.params.id, req.userId)
  res.json({ success: true })
})

app.delete('/api/timesheets/:id', (req, res) => {
  const entry = db.prepare(`
    SELECT te.id FROM timesheet_entries te
    JOIN projects p ON p.id = te.project_id
    WHERE te.id = ? AND te.user_id = ? AND p.workspace_id = ?
  `).get(req.params.id, req.userId, req.workspaceId)
  if (!entry) return res.status(404).json({ error: 'Timesheet entry not found' })
  db.prepare('DELETE FROM timesheet_entries WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
  res.json({ success: true })
})

// ── REPORTS ───────────────────────────────────────────────────────────────────

app.get('/api/reports/by-project', (req, res) => {
  const { from, to } = req.query
  const dateFilter = from && to ? 'AND te.date BETWEEN ? AND ?' : from ? 'AND te.date >= ?' : to ? 'AND te.date <= ?' : ''
  const dateParams = from && to ? [from, to] : from ? [from] : to ? [to] : []
  const rows = db.prepare(`
    SELECT p.project_code, p.name AS project_name, p.budgeted_hours,
           p.report_initiated, p.report_delivered,
           c.name AS client_name, pt.name AS type_name, pt.color AS type_color,
           COALESCE(SUM(te.hours), 0) AS total_hours,
           ROUND(COALESCE(SUM(te.hours),0) * 100.0 / NULLIF(p.budgeted_hours,0), 1) AS budget_pct,
           (SELECT GROUP_CONCAT(mu.name, '||') FROM project_members pm
              JOIN users mu ON mu.id = pm.user_id WHERE pm.project_id = p.id) AS users_assigned
    FROM projects p
    LEFT JOIN clients c            ON c.id  = p.client_id
    LEFT JOIN project_types pt     ON pt.id = p.project_type_id
    LEFT JOIN timesheet_entries te ON te.project_id = p.id ${dateFilter}
    WHERE p.workspace_id = ?
    GROUP BY p.id ORDER BY total_hours DESC
  `).all(...dateParams, req.workspaceId)
  res.json(rows)
})

app.get('/api/reports/by-user', (req, res) => {
  const { from, to } = req.query
  const dateFilter = from && to ? 'AND te.date BETWEEN ? AND ?' : from ? 'AND te.date >= ?' : to ? 'AND te.date <= ?' : ''
  const dateParams = from && to ? [from, to] : from ? [from] : to ? [to] : []
  res.json(db.prepare(`
    SELECT u.name AS user_name, u.email,
           COALESCE(SUM(te.hours), 0)    AS total_hours,
           COUNT(DISTINCT te.id)         AS entry_count,
           COUNT(DISTINCT te.project_id) AS project_count
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
    LEFT JOIN timesheet_entries te ON te.user_id = u.id
    LEFT JOIN projects p ON p.id = te.project_id ${dateFilter}
    GROUP BY u.id ORDER BY total_hours DESC
  `).all(req.workspaceId, ...dateParams))
})

app.get('/api/reports/by-client', (req, res) => {
  const { from, to } = req.query
  const dateFilter = from && to ? 'AND te.date BETWEEN ? AND ?' : from ? 'AND te.date >= ?' : ''
  const dateParams = from && to ? [from, to] : from ? [from] : []
  res.json(db.prepare(`
    SELECT c.id AS client_id, c.name AS client_name,
           COUNT(DISTINCT p.id) AS project_count,
           COALESCE(SUM(te.hours), 0) AS total_hours,
           COUNT(DISTINCT te.user_id) AS user_count
    FROM clients c
    JOIN projects p ON p.client_id = c.id AND p.workspace_id = ?
    LEFT JOIN timesheet_entries te ON te.project_id = p.id ${dateFilter}
    WHERE c.workspace_id = ?
    GROUP BY c.id ORDER BY total_hours DESC
  `).all(req.workspaceId, ...dateParams, req.workspaceId))
})

app.get('/api/reports/summary', (req, res) => {
  const year = new Date().getFullYear().toString()
  const yearMonth = new Date().toISOString().slice(0, 7)
  const totalRequested = db.prepare(`
    SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ? AND strftime('%Y', request_date) = ?
  `).get(req.workspaceId, year).n
  const totalCompleted = db.prepare(`
    SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ? AND strftime('%Y', report_delivered) = ?
  `).get(req.workspaceId, year).n
  const topClient = db.prepare(`
    SELECT c.name, COUNT(p.id) AS n
    FROM clients c JOIN projects p ON p.client_id = c.id AND p.workspace_id = ?
    WHERE strftime('%Y-%m', p.request_date) = ?
    GROUP BY c.id ORDER BY n DESC LIMIT 1
  `).get(req.workspaceId, yearMonth)
  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT te.user_id) AS n
    FROM timesheet_entries te
    JOIN projects p ON p.id = te.project_id AND p.workspace_id = ?
  `).get(req.workspaceId).n
  res.json({ year: parseInt(year), totalRequested, totalCompleted, topClient: topClient?.name || null, activeUsers })
})

// ── Static + SPA ──────────────────────────────────────────────────────────────
const distPath = join(__dirname, 'dist')
if (existsSync(distPath)) app.use(express.static(distPath))

app.get('*', (req, res) => {
  const index = join(__dirname, 'dist', 'index.html')
  existsSync(index)
    ? res.sendFile(index)
    : res.status(404).send('Run `npm run build` or `npm run dev`.')
})

app.listen(PORT, () => {
  console.log(`\n  Woven Time Tracking  →  http://localhost:${PORT}`)
  console.log(`  Auth: ${MS_AUTH ? `Microsoft SSO (${TENANT})` : 'Dev login'}\n`)
})
