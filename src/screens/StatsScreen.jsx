import { useMemo } from 'react'
import { useTeam } from '../hooks/useTeam'

export default function StatsScreen() {
  const { stats } = useTeam()

  const sorted = useMemo(() => [...stats].sort((a, b) => b.totalMinutes - a.totalMinutes), [stats])

  return (
    <section className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-3 text-xl font-semibold">Season stats</h2>
      <div className="space-y-3">
        {sorted.map((entry) => (
          <article key={entry.id} className="rounded border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-800">{entry.playerName}</h3>
            <p className="text-sm text-slate-600">Games: {entry.gamesPlayed} · Minutes: {entry.totalMinutes}</p>
            <p className="text-xs text-slate-500">
              GK {entry.positionMinutes?.GK || 0} · DEF {entry.positionMinutes?.DEF || 0} · MID {entry.positionMinutes?.MID || 0} · ATK {entry.positionMinutes?.ATK || 0}
            </p>
          </article>
        ))}
      </div>
      {sorted.length === 0 && <p className="text-sm text-slate-500">Stats are generated from team activity.</p>}
    </section>
  )
}
