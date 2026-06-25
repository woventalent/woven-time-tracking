import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

export default function Login({ errorMsg }) {
  const { msAuth, refresh } = useAuth()

  const [form,    setForm]    = useState({ name: '', email: '' })
  const [error,   setError]   = useState(errorMsg || '')
  const [loading, setLoading] = useState(false)

  async function devLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Login failed')
      }
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F8F7EF',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '44px 48px',
        width: 400, boxShadow: '0 32px 80px rgba(0,0,0,0.15)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#00259C', letterSpacing: '-0.5px' }}>Woven</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Time Tracking</div>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#00259C', marginBottom: 6 }}>Sign in</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          {msAuth ? 'Use your Woven Microsoft account to continue.' : 'Development mode — enter any name and email.'}
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {msAuth ? (
          <a
            href="/auth/login"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              width: '100%', padding: '12px 20px', borderRadius: 8,
              background: '#0f172a', color: '#fff',
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'background 0.15s',
            }}
          >
            <MicrosoftLogo />
            Sign in with Microsoft
          </a>
        ) : (
          <form onSubmit={devLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Full Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alex Chen"
                required autoFocus
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. alex@woven.com"
                required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '11px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {!msAuth && (
          <p style={{ fontSize: 11.5, color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
            Dev mode · Configure <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>AZURE_CLIENT_ID</code> in .env for Microsoft SSO
          </p>
        )}
      </div>
    </div>
  )
}
