import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import Projects from './pages/Projects.jsx'
import Timesheets from './pages/Timesheets.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import WorkspaceSelect from './pages/WorkspaceSelect.jsx'

const PAGES = {
  projects:   <Projects />,
  timesheets: <Timesheets />,
  reports:    <Reports />,
  settings:   <Admin />,
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f172a',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>Woven</div>
        <div style={{ fontSize: 13, color: '#475569' }}>Loading…</div>
      </div>
    </div>
  )
}

function MainApp() {
  const [page, setPage] = useState('projects')
  const params = new URLSearchParams(window.location.search)
  const loginError = params.get('login-error')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar current={page} onNav={setPage} />
      <main style={{ flex: 1, overflow: 'auto', padding: '36px 40px', background: '#f8fafc' }}>
        {PAGES[page]}
      </main>
    </div>
  )
}

function AppContent() {
  const { user, workspace } = useAuth()

  // Check URL for login error to pass to Login page
  const params = new URLSearchParams(window.location.search)
  const loginError = params.get('login-error')

  if (user === undefined) return <LoadingScreen />
  if (!user) return <Login errorMsg={loginError} />
  if (!workspace) return <WorkspaceSelect />
  return <MainApp />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
