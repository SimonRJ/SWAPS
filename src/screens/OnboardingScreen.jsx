import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../hooks/useTeam'

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const { createNewTeam, joinExistingTeam, loading, error } = useTeam()
  const [teamName, setTeamName] = useState('')
  const [joinTeamId, setJoinTeamId] = useState('')
  const [joinPasscode, setJoinPasscode] = useState('')
  const [createdCreds, setCreatedCreds] = useState(null)

  async function handleCreate(event) {
    event.preventDefault()
    const credentials = await createNewTeam(teamName.trim())
    setCreatedCreds(credentials)
    setTeamName('')
  }

  async function handleJoin(event) {
    event.preventDefault()
    try {
      await joinExistingTeam(joinTeamId, joinPasscode)
      navigate('/team')
    } catch {
      // context exposes the message
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Welcome to SWAPS</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={handleCreate} className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-2 text-lg font-semibold">Create Team</h2>
          <label className="mb-2 block text-sm font-medium">Team name</label>
          <input
            className="mb-3 w-full rounded border border-slate-300 px-3 py-2"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            required
            maxLength={60}
          />
          <button className="rounded bg-pitch-700 px-4 py-2 text-white" type="submit" disabled={loading || !teamName.trim()}>
            {loading ? 'Creating…' : 'Create team'}
          </button>
          {createdCreds && (
            <div className="mt-3 space-y-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
              <p>Team code: {createdCreds.teamId}</p>
              <p>Passcode: {createdCreds.passcode}</p>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1 text-xs text-white"
                onClick={() => navigate('/team')}
              >
                Continue to team
              </button>
            </div>
          )}
        </form>

        <form onSubmit={handleJoin} className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-2 text-lg font-semibold">Join Team</h2>
          <label className="mb-2 block text-sm font-medium">Team code</label>
          <input
            className="mb-3 w-full rounded border border-slate-300 px-3 py-2 uppercase"
            value={joinTeamId}
            onChange={(event) => setJoinTeamId(event.target.value)}
            required
          />
          <label className="mb-2 block text-sm font-medium">Passcode</label>
          <input
            className="mb-3 w-full rounded border border-slate-300 px-3 py-2 uppercase"
            value={joinPasscode}
            onChange={(event) => setJoinPasscode(event.target.value)}
            required
          />
          <button className="rounded bg-pitch-700 px-4 py-2 text-white" type="submit" disabled={loading}>
            {loading ? 'Joining…' : 'Join team'}
          </button>
        </form>
      </div>
      {error && <p className="mt-3 rounded bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>}
    </main>
  )
}
