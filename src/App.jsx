import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import Projects from './pages/Projects.jsx'
import Timesheets from './pages/Timesheets.jsx'
import Reports from './pages/Reports.jsx'
import Calendar from './pages/Calendar.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import WorkspaceSelect from './pages/WorkspaceSelect.jsx'

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

const PATH_BY_PAGE = {
  projects: '/projects', timesheets: '/timesheets', reports: '/reports',
  calendar: '/calendar', settings: '/settings',
}
const PAGE_BY_PATH = Object.fromEntries(Object.entries(PATH_BY_PAGE).map(([page, path]) => [path, page]))
function pageFromPath(pathname) { return PAGE_BY_PATH[pathname] || 'projects' }

function MainApp() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname))
  const [logTimeProjectId, setLogTimeProjectId] = useState(null)

  useEffect(() => {
    function onPopState() { setPage(pageFromPath(window.location.pathname)) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function goTo(p) {
    setPage(p)
    const path = PATH_BY_PAGE[p] || '/projects'
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
  }

  function handleLogTime(projectId) {
    setLogTimeProjectId(projectId)
    goTo('timesheets')
  }

  function handleNav(p) {
    setLogTimeProjectId(null)
    goTo(p)
  }

  const pages = {
    projects:   <Projects onLogTime={handleLogTime} />,
    timesheets: <Timesheets initialProjectId={logTimeProjectId} />,
    reports:    <Reports />,
    calendar:   <Calendar />,
    settings:   <Admin />,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar current={page} onNav={handleNav} />
      <main style={{ flex: 1, overflow: 'auto', padding: '36px 40px', background: '#F8F7EF' }}>
        {pages[page]}
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
