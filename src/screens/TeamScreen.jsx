import { useMemo, useState } from 'react'
import { useTeam } from '../hooks/useTeam'

export default function TeamScreen() {
  const { players, addPlayer } = useTeam()
  const [name, setName] = useState('')

  const activePlayers = useMemo(() => players.filter((player) => player.active !== false), [players])

  async function handleAdd(event) {
    event.preventDefault()
    await addPlayer(name.trim())
    setName('')
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-3 text-xl font-semibold">Players</h2>
      <form className="mb-4 flex gap-2" onSubmit={handleAdd}>
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          placeholder="Player name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button className="rounded bg-pitch-700 px-4 py-2 text-white" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      <ul className="space-y-2">
        {activePlayers.map((player) => (
          <li key={player.id} className="rounded border border-slate-200 px-3 py-2">
            {player.playerName}
          </li>
        ))}
      </ul>
      {activePlayers.length === 0 && <p className="text-sm text-slate-500">Add players to get started.</p>}
    </section>
  )
}
