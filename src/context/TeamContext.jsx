import { useEffect, useMemo, useState } from 'react'
import {
  addPlayer,
  addSubstitution,
  createGame,
  createTeam,
  finishGame,
  joinTeam,
  listSubstitutions,
  subscribeToTeam
} from '../services/teamService'
import { createTeamCredentials } from '../lib/teamCode'
import { TeamContext } from './teamContextValue'

const TEAM_STORAGE_KEY = 'swaps.activeTeam'

export function TeamProvider({ children }) {
  const [teamId, setTeamId] = useState(() => localStorage.getItem(TEAM_STORAGE_KEY) || '')
  const [passcode, setPasscode] = useState('')
  const [teamData, setTeamData] = useState({ team: null, players: [], games: [], stats: [] })
  const [substitutions, setSubstitutions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!teamId) return undefined
    setLoading(true)
    const unsubscribe = subscribeToTeam(
      teamId,
      (next) => {
        setTeamData(next)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [teamId])

  const teamActions = useMemo(
    () => ({
      async createNewTeam(teamName) {
        setError('')
        setLoading(true)
        try {
          const generated = createTeamCredentials()
          const credentials = await createTeam({ teamId: generated.teamId, passcode: generated.passcode, teamName })
          setTeamId(credentials.teamId)
          setPasscode(credentials.passcode)
          localStorage.setItem(TEAM_STORAGE_KEY, credentials.teamId)
          setError('')
          return credentials
        } catch (err) {
          setError(err.message)
          throw err
        } finally {
          setLoading(false)
        }
      },
      async joinExistingTeam(nextTeamId, nextPasscode) {
        setError('')
        setLoading(true)
        try {
          await joinTeam({ teamId: nextTeamId.trim().toUpperCase(), passcode: nextPasscode.trim().toUpperCase() })
          setTeamId(nextTeamId.trim().toUpperCase())
          setPasscode(nextPasscode.trim().toUpperCase())
          localStorage.setItem(TEAM_STORAGE_KEY, nextTeamId.trim().toUpperCase())
          setError('')
        } catch (err) {
          setError(err.message)
          throw err
        } finally {
          setLoading(false)
        }
      },
      async addPlayer(playerName) {
        await addPlayer({ teamId, playerName })
      },
      async createGame(payload) {
        await createGame({ teamId, ...payload })
      },
      async addSubstitution(gameId, payload) {
        await addSubstitution({ teamId, gameId, ...payload })
      },
      async loadSubstitutions(gameId) {
        const rows = await listSubstitutions({ teamId, gameId })
        setSubstitutions(rows)
      },
      async finishGame(gameId) {
        await finishGame({ teamId, gameId })
      },
      disconnectTeam() {
        setTeamId('')
        setPasscode('')
        setTeamData({ team: null, players: [], games: [], stats: [] })
        setSubstitutions([])
        localStorage.removeItem(TEAM_STORAGE_KEY)
      }
    }),
    [teamId]
  )

  return (
    <TeamContext.Provider
      value={{
        teamId,
        passcode,
        loading,
        error,
        ...teamData,
        substitutions,
        ...teamActions
      }}
    >
      {children}
    </TeamContext.Provider>
  )
}
