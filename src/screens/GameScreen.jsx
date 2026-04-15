import { useEffect, useMemo, useState } from 'react'
import { useTeam } from '../hooks/useTeam'

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '3-4-3']

export default function GameScreen() {
  const { games, players, createGame, addSubstitution, loadSubstitutions, substitutions, finishGame } = useTeam()
  const [opponent, setOpponent] = useState('')
  const [formation, setFormation] = useState(FORMATIONS[0])
  const [minute, setMinute] = useState(10)
  const [playerInId, setPlayerInId] = useState('')
  const [playerOutId, setPlayerOutId] = useState('')
  const [position, setPosition] = useState('MID')

  const liveGame = useMemo(() => games.find((game) => game.status === 'live'), [games])
  const playerNameById = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.playerName])),
    [players]
  )

  useEffect(() => {
    if (liveGame?.id) {
      loadSubstitutions(liveGame.id)
    }
  }, [liveGame?.id, loadSubstitutions])

  async function handleCreateGame(event) {
    event.preventDefault()
    await createGame({
      opponent,
      formation,
      availablePlayerIds: players.map((player) => player.id)
    })
    setOpponent('')
  }

  async function handleSub(event) {
    event.preventDefault()
    await addSubstitution(liveGame.id, {
      minute: Number(minute),
      playerInId,
      playerOutId,
      position
    })
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 text-xl font-semibold">Game setup</h2>
        {!liveGame && (
          <form onSubmit={handleCreateGame} className="space-y-3">
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="Opponent"
              value={opponent}
              onChange={(event) => setOpponent(event.target.value)}
              required
            />
            <select className="w-full rounded border border-slate-300 px-3 py-2" value={formation} onChange={(event) => setFormation(event.target.value)}>
              {FORMATIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <button className="rounded bg-pitch-700 px-4 py-2 text-white" type="submit" disabled={players.length < 7}>
              Start game
            </button>
          </form>
        )}
        {liveGame && (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">Live vs {liveGame.opponent}</p>
            <button type="button" className="rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => finishGame(liveGame.id)}>
              Finish game
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 text-xl font-semibold">Live substitutions</h2>
        {!liveGame && <p className="text-sm text-slate-500">Start a game to log substitutions.</p>}
        {liveGame && (
          <>
            <form onSubmit={handleSub} className="space-y-2">
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                type="number"
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
                min={0}
                max={120}
                required
              />
              <select className="w-full rounded border border-slate-300 px-3 py-2" value={playerOutId} onChange={(event) => setPlayerOutId(event.target.value)} required>
                <option value="">Player out</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.playerName}
                  </option>
                ))}
              </select>
              <select className="w-full rounded border border-slate-300 px-3 py-2" value={playerInId} onChange={(event) => setPlayerInId(event.target.value)} required>
                <option value="">Player in</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.playerName}
                  </option>
                ))}
              </select>
              <select className="w-full rounded border border-slate-300 px-3 py-2" value={position} onChange={(event) => setPosition(event.target.value)}>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="ATK">ATK</option>
              </select>
              <button className="rounded bg-pitch-700 px-4 py-2 text-white" type="submit">
                Log substitution
              </button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {substitutions.map((event) => (
                <li key={event.id} className="rounded border border-slate-200 px-3 py-2">
                  {event.minute}' · {playerNameById[event.playerOutId] || event.playerOutId} ⟶{' '}
                  {playerNameById[event.playerInId] || event.playerInId} ({event.position})
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
