import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import OnboardingScreen from './screens/OnboardingScreen'
import TeamScreen from './screens/TeamScreen'
import GameScreen from './screens/GameScreen'
import StatsScreen from './screens/StatsScreen'
import { useTeam } from './hooks/useTeam'

function TeamRoute({ children }) {
  const { teamId } = useTeam()
  if (!teamId) return <Navigate to="/onboarding" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route
        path="/"
        element={
          <TeamRoute>
            <AppShell />
          </TeamRoute>
        }
      >
        <Route index element={<Navigate to="team" replace />} />
        <Route path="team" element={<TeamScreen />} />
        <Route path="game" element={<GameScreen />} />
        <Route path="stats" element={<StatsScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
