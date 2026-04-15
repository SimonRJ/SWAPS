import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { hashPasscode } from '../lib/teamCode'
import { initialStats } from '../lib/stats'

const teamsCollection = collection(db, 'teams')

export async function createTeam({ teamId, passcode, teamName }) {
  const passcodeHash = await hashPasscode(teamId, passcode)
  const teamRef = doc(teamsCollection, teamId)
  await setDoc(teamRef, {
    teamId,
    teamName,
    passcodeHash,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    gameDurationMinutes: 60,
    subIntervalMinutes: 10
  })
  return { teamId, passcode, passcodeHash }
}

export async function joinTeam({ teamId, passcode }) {
  const teamRef = doc(teamsCollection, teamId)
  const snapshot = await getDoc(teamRef)
  if (!snapshot.exists()) throw new Error('Team not found')

  const passcodeHash = await hashPasscode(teamId, passcode)
  if (snapshot.data().passcodeHash !== passcodeHash) {
    throw new Error('Invalid passcode')
  }

  return {
    teamId,
    passcodeHash
  }
}

export async function addPlayer({ teamId, playerName }) {
  const playerRef = doc(collection(db, 'teams', teamId, 'players'))
  const statsRef = doc(collection(db, 'teams', teamId, 'stats'), playerRef.id)
  const batch = writeBatch(db)

  batch.set(playerRef, {
    playerName,
    createdAt: serverTimestamp(),
    active: true
  })
  batch.set(statsRef, initialStats(playerRef.id, playerName))
  await batch.commit()
}

export async function createGame({ teamId, opponent, formation, availablePlayerIds }) {
  const gamesRef = collection(db, 'teams', teamId, 'games')
  return addDoc(gamesRef, {
    opponent,
    formation,
    availablePlayerIds,
    status: 'live',
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    endedAt: null
  })
}

export async function addSubstitution({ teamId, gameId, minute, playerInId, playerOutId, position }) {
  const substitutionsRef = collection(db, 'teams', teamId, 'games', gameId, 'substitutions')
  await addDoc(substitutionsRef, {
    minute,
    playerInId,
    playerOutId,
    position,
    createdAt: serverTimestamp()
  })

  const inStatsRef = doc(db, 'teams', teamId, 'stats', playerInId)
  const inStatsDoc = await getDoc(inStatsRef)
  if (inStatsDoc.exists()) {
    const current = inStatsDoc.data()
    await updateDoc(inStatsRef, {
      totalMinutes: (current.totalMinutes || 0) + 10,
      [`positionMinutes.${position}`]: (current.positionMinutes?.[position] || 0) + 10
    })
  }
}

export async function finishGame({ teamId, gameId }) {
  await updateDoc(doc(db, 'teams', teamId, 'games', gameId), {
    status: 'complete',
    endedAt: serverTimestamp()
  })
}

export function subscribeToTeam(teamId, onData, onError) {
  const teamRef = doc(db, 'teams', teamId)
  const playersQuery = query(collection(db, 'teams', teamId, 'players'), orderBy('createdAt', 'asc'))
  const gamesQuery = query(collection(db, 'teams', teamId, 'games'), orderBy('createdAt', 'desc'))
  const statsQuery = query(collection(db, 'teams', teamId, 'stats'))

  const state = { team: null, players: [], games: [], stats: [] }
  const notify = () => onData({ ...state })

  const unsubscribers = [
    onSnapshot(teamRef, (snapshot) => {
      state.team = snapshot.data() || null
      notify()
    }, onError),
    onSnapshot(playersQuery, (snapshot) => {
      state.players = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      notify()
    }, onError),
    onSnapshot(gamesQuery, (snapshot) => {
      state.games = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      notify()
    }, onError),
    onSnapshot(statsQuery, (snapshot) => {
      state.stats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      notify()
    }, onError)
  ]

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
}

export async function listSubstitutions({ teamId, gameId }) {
  const subQuery = query(collection(db, 'teams', teamId, 'games', gameId, 'substitutions'), orderBy('minute', 'asc'))
  const snapshot = await getDocs(subQuery)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}
