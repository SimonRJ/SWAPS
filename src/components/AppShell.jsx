import { NavLink, Outlet } from 'react-router-dom'
import { useTeam } from '../hooks/useTeam'

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-pitch-700 text-white' : 'bg-white text-slate-700'}`

export default function AppShell() {
  const { team, disconnectTeam } = useTeam()

  return (
    <div className="mx-auto min-h-screen max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between rounded-xl bg-pitch-900 px-4 py-3 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-pitch-50">SWAPS synced</p>
          <h1 className="text-lg font-semibold">{team?.teamName || 'Soccer Subs'}</h1>
        </div>
        <button type="button" className="rounded bg-white px-3 py-2 text-sm text-pitch-900" onClick={disconnectTeam}>
          Disconnect
        </button>
      </header>

      <nav className="mb-4 flex gap-2">
        <NavLink to="/team" className={navClass}>
          Team
        </NavLink>
        <NavLink to="/game" className={navClass}>
          Game
        </NavLink>
        <NavLink to="/stats" className={navClass}>
          Stats
        </NavLink>
      </nav>

      <Outlet />
    </div>
  )
}
