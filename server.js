import express from 'express'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID, randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const MS_AUTH    = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
const TENANT     = process.env.AZURE_TENANT_ID || 'woventalent.in'
const REDIRECT_URI = process.env.AUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`

// ── Upload dir ────────────────────────────────────────────────────────────────
const UPLOAD_DIR = join(__dirname, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) => cb(null, `${randomUUID()}-${file.originalname.replace(/[^\w._-]/g, '_')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
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

// ── Seed defaults ─────────────────────────────────────────────────────────────
db.exec(`INSERT OR IGNORE INTO workspaces (id, name, slug)
         VALUES (1, 'Research & Insights', 'research-insights')`)

for (const t of ['clients', 'contacts', 'requestors', 'projects']) {
  db.exec(`UPDATE "${t}" SET workspace_id = 1 WHERE workspace_id IS NULL`)
}

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
    SELECT s.*, u.name AS user_name, u.email AS user_email,
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
    const user = upsertUser({ microsoftOid: profile.id, email: profile.mail || profile.userPrincipalName, name: profile.displayName })
    if (getUserWorkspaces(user.id).length === 0) ensureWorkspaceMember(user.id, 1)
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
  if (getUserWorkspaces(user.id).length === 0) ensureWorkspaceMember(user.id, 1)
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

// ── Auth guard ────────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const s = getSession(req.cookies?.wtt_session)
  if (!s) return res.status(401).json({ error: 'Not authenticated' })
  if (!s.workspace_id) return res.status(403).json({ error: 'No workspace selected' })
  req.userId      = Number(s.user_id)
  req.workspaceId = Number(s.workspace_id)
  const wm = db.prepare('SELECT role FROM workspace_members WHERE user_id = ? AND workspace_id = ?').get(req.userId, req.workspaceId)
  req.userRole = wm?.role ?? 'member'
  next()
})

// ── PROJECT TYPES ─────────────────────────────────────────────────────────────

app.get('/api/project-types', (req, res) => {
  res.json(db.prepare('SELECT * FROM project_types WHERE workspace_id = ? ORDER BY name').all(req.workspaceId))
})

app.post('/api/project-types', (req, res) => {
  const { name, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const r = db.prepare('INSERT INTO project_types (workspace_id, name, color) VALUES (?, ?, ?)').run(req.workspaceId, name.trim(), color || '#64748b')
    res.json({ id: r.lastInsertRowid, name: name.trim(), color: color || '#64748b', active: 1 })
  } catch { res.status(400).json({ error: 'Type name already exists' }) }
})

app.put('/api/project-types/:id', (req, res) => {
  const { name, color, active } = req.body
  db.prepare('UPDATE project_types SET name = ?, color = ?, active = ? WHERE id = ? AND workspace_id = ?')
    .run(name, color || '#64748b', active ?? 1, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/project-types/:id', (req, res) => {
  db.prepare('DELETE FROM project_types WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
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
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const r = db.prepare('INSERT INTO clients (workspace_id, name) VALUES (?, ?)').run(req.workspaceId, name.trim())
    res.json({ id: r.lastInsertRowid, name: name.trim(), project_count: 0 })
  } catch { res.status(400).json({ error: 'Client name already exists' }) }
})

app.put('/api/clients/:id', (req, res) => {
  db.prepare('UPDATE clients SET name = ? WHERE id = ? AND workspace_id = ?').run(req.body.name, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
})

// ── CONTACTS ──────────────────────────────────────────────────────────────────

app.get('/api/clients/:id/contacts', (req, res) => {
  res.json(db.prepare(`
    SELECT ct.* FROM contacts ct JOIN clients c ON c.id = ct.client_id
    WHERE ct.client_id = ? AND c.workspace_id = ? ORDER BY ct.name
  `).all(req.params.id, req.workspaceId))
})

app.post('/api/clients/:id/contacts', (req, res) => {
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
  const { name, email, phone, role } = req.body
  if (!name?.trim())  return res.status(400).json({ error: 'Full name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' })
  db.prepare('UPDATE contacts SET name = ?, email = ?, phone = ?, role = ? WHERE id = ? AND workspace_id = ?')
    .run(name.trim(), email.trim(), phone.trim(), role || null, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
})

// ── REQUESTORS ────────────────────────────────────────────────────────────────

app.get('/api/requestors', (req, res) => {
  res.json(db.prepare('SELECT * FROM requestors WHERE workspace_id = ? ORDER BY name').all(req.workspaceId))
})

app.post('/api/requestors', (req, res) => {
  const { name, email } = req.body
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email required' })
  try {
    const r = db.prepare('INSERT INTO requestors (workspace_id, name, email) VALUES (?, ?, ?)').run(req.workspaceId, name.trim(), email.trim())
    res.json({ id: r.lastInsertRowid, name: name.trim(), email: email.trim(), active: 1 })
  } catch { res.status(400).json({ error: 'Email already exists' }) }
})

app.put('/api/requestors/:id', (req, res) => {
  const { name, email, active } = req.body
  db.prepare('UPDATE requestors SET name = ?, email = ?, active = ? WHERE id = ? AND workspace_id = ?')
    .run(name, email, active ?? 1, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/requestors/:id', (req, res) => {
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
  const { name, email, role } = req.body
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email required' })
  try {
    const user = upsertUser({ microsoftOid: null, email: email.trim(), name: name.trim() })
    ensureWorkspaceMember(user.id, req.workspaceId, role || 'member')
    res.json({ ...user, role: role || 'member' })
  } catch { res.status(400).json({ error: 'Could not add user' }) }
})

app.put('/api/workspace-users/:userId/role', (req, res) => {
  db.prepare('UPDATE workspace_members SET role = ? WHERE user_id = ? AND workspace_id = ?')
    .run(req.body.role, req.params.userId, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/workspace-users/:userId', (req, res) => {
  db.prepare('DELETE FROM workspace_members WHERE user_id = ? AND workspace_id = ?').run(req.params.userId, req.workspaceId)
  res.json({ success: true })
})

// ── PROJECTS ──────────────────────────────────────────────────────────────────

function nextProjectCode(workspaceId) {
  const last = db.prepare(`SELECT project_code FROM projects WHERE workspace_id = ? AND project_code LIKE 'WRI-%'
    ORDER BY CAST(SUBSTR(project_code,5) AS INTEGER) DESC LIMIT 1`).get(workspaceId)
  if (!last) return 'WRI-001'
  return `WRI-${String(parseInt(last.project_code.slice(4)) + 1).padStart(3, '0')}`
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
      ROUND(COALESCE(SUM(te.hours),0) * 100.0 / NULLIF(p.budgeted_hours,0), 1) AS budget_pct
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

app.post('/api/projects', (req, res) => {
  const { name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, report_initiated, report_delivered } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' })
  const code = nextProjectCode(req.workspaceId)
  const r = db.prepare(
    'INSERT INTO projects (workspace_id, project_code, name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, report_initiated, report_delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.workspaceId, code, name.trim(), project_type_id || null, request_date || null, requestor_contact_id || null, client_id || null, budgeted_hours || null, report_initiated || null, report_delivered || null)
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, req.userId)
  res.json({ id: r.lastInsertRowid, project_code: code, name: name.trim() })
})

app.put('/api/projects/:id', (req, res) => {
  const { name, project_type_id, request_date, requestor_contact_id, client_id, budgeted_hours, status, report_initiated, report_delivered } = req.body
  db.prepare(
    'UPDATE projects SET name=?, project_type_id=?, request_date=?, requestor_contact_id=?, client_id=?, budgeted_hours=?, status=?, report_initiated=?, report_delivered=? WHERE id=? AND workspace_id=?'
  ).run(name, project_type_id || null, request_date || null, requestor_contact_id || null, client_id || null, budgeted_hours || null, status || 'active', report_initiated || null, report_delivered || null, req.params.id, req.workspaceId)
  res.json({ success: true })
})

app.delete('/api/projects/:id', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM projects WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId)
  res.json({ success: true })
})

// ── PROJECT MEMBERS ───────────────────────────────────────────────────────────

app.get('/api/projects/:id/members', (req, res) => {
  res.json(db.prepare(`
    SELECT u.*, pm.added_at FROM users u
    JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY u.name
  `).all(req.params.id))
})

app.post('/api/projects/:id/members', (req, res) => {
  const { userId } = req.body
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(req.params.id, userId)
  res.json({ success: true })
})

app.delete('/api/projects/:id/members/:userId', (req, res) => {
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.id, req.params.userId)
  res.json({ success: true })
})

// ── PROJECT DOCUMENTS ─────────────────────────────────────────────────────────

app.get('/api/projects/:id/documents', (req, res) => {
  res.json(db.prepare(`
    SELECT pd.*, u.name AS uploader_name
    FROM project_documents pd
    JOIN users u ON u.id = pd.user_id
    WHERE pd.project_id = ?
    ORDER BY pd.created_at DESC
  `).all(req.params.id))
})

app.post('/api/projects/:id/documents', upload.single('file'), (req, res) => {
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
  db.prepare('DELETE FROM project_documents WHERE id = ? AND project_id = ?').run(req.params.docId, req.params.id)
  res.json({ success: true })
})

// ── TIMESHEET ENTRIES ─────────────────────────────────────────────────────────

app.get('/api/timesheets', (req, res) => {
  const { project_id, from, to } = req.query
  let sql = `
    SELECT te.*, p.project_code, p.name AS project_name, c.name AS client_name,
           u.name AS user_name
    FROM timesheet_entries te
    JOIN  projects p ON p.id = te.project_id AND p.workspace_id = ?
    LEFT JOIN users u ON u.id = te.user_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE te.user_id = ?
  `
  const params = [req.workspaceId, req.userId]
  if (project_id) { sql += ' AND te.project_id = ?'; params.push(project_id) }
  if (from)       { sql += ' AND te.date >= ?';       params.push(from) }
  if (to)         { sql += ' AND te.date <= ?';       params.push(to) }
  sql += ' ORDER BY te.date DESC, te.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/timesheets', (req, res) => {
  const { project_id, date, hours, description } = req.body
  if (!project_id || !date || !hours) return res.status(400).json({ error: 'Project, date, and hours are required' })
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').get(project_id, req.workspaceId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const r = db.prepare(
    'INSERT INTO timesheet_entries (project_id, user_id, date, hours, description) VALUES (?, ?, ?, ?, ?)'
  ).run(project_id, req.userId, date, hours, description || null)
  res.json({ id: r.lastInsertRowid })
})

app.put('/api/timesheets/:id', (req, res) => {
  const { project_id, date, hours, description } = req.body
  db.prepare('UPDATE timesheet_entries SET project_id=?, date=?, hours=?, description=? WHERE id=? AND user_id=?')
    .run(project_id, date, hours, description || null, req.params.id, req.userId)
  res.json({ success: true })
})

app.delete('/api/timesheets/:id', (req, res) => {
  db.prepare('DELETE FROM timesheet_entries WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
  res.json({ success: true })
})

// ── REPORTS ───────────────────────────────────────────────────────────────────

app.get('/api/reports/by-project', (req, res) => {
  const { from, to } = req.query
  const dateFilter = from && to ? 'AND te.date BETWEEN ? AND ?' : from ? 'AND te.date >= ?' : ''
  const dateParams = from && to ? [from, to] : from ? [from] : []
  res.json(db.prepare(`
    SELECT p.project_code, p.name AS project_name, p.budgeted_hours,
           p.report_initiated, p.report_delivered,
           c.name AS client_name, pt.name AS type_name, pt.color AS type_color,
           COALESCE(SUM(te.hours), 0) AS total_hours,
           ROUND(COALESCE(SUM(te.hours),0) * 100.0 / NULLIF(p.budgeted_hours,0), 1) AS budget_pct,
           GROUP_CONCAT(DISTINCT u.name) AS users_assigned
    FROM projects p
    LEFT JOIN clients c            ON c.id  = p.client_id
    LEFT JOIN project_types pt     ON pt.id = p.project_type_id
    LEFT JOIN timesheet_entries te ON te.project_id = p.id ${dateFilter}
    LEFT JOIN users u              ON u.id  = te.user_id
    WHERE p.workspace_id = ?
    GROUP BY p.id ORDER BY total_hours DESC
  `).all(...dateParams, req.workspaceId))
})

app.get('/api/reports/by-user', (req, res) => {
  const { from, to } = req.query
  const dateFilter = from && to ? 'AND te.date BETWEEN ? AND ?' : from ? 'AND te.date >= ?' : ''
  const dateParams = from && to ? [from, to] : from ? [from] : []
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
