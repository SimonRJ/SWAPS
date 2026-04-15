# Firestore schema for SWAPS

## teams/{teamId}

```json
{
  "teamId": "ABCD2345",
  "teamName": "U12 Sharks",
  "passcodeHash": "sha256(teamId:passcode)",
  "gameDurationMinutes": 60,
  "subIntervalMinutes": 10,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

## teams/{teamId}/players/{playerId}

```json
{
  "playerName": "Alex",
  "active": true,
  "createdAt": "timestamp"
}
```

## teams/{teamId}/games/{gameId}

```json
{
  "opponent": "Strikers",
  "formation": "4-4-2",
  "availablePlayerIds": ["playerA", "playerB"],
  "status": "live | complete",
  "startedAt": "timestamp",
  "endedAt": "timestamp|null",
  "createdAt": "timestamp"
}
```

## teams/{teamId}/games/{gameId}/substitutions/{substitutionId}

```json
{
  "minute": 30,
  "playerInId": "playerA",
  "playerOutId": "playerB",
  "position": "MID",
  "createdAt": "timestamp"
}
```

## teams/{teamId}/stats/{playerId}

```json
{
  "playerId": "playerA",
  "playerName": "Alex",
  "gamesPlayed": 4,
  "totalMinutes": 220,
  "positionMinutes": {
    "GK": 20,
    "DEF": 60,
    "MID": 120,
    "ATK": 20,
    "BENCH": 20
  }
}
```

## Security rules

- No user accounts are used.
- Team access is app-level controlled by `teamId + passcode`.
- Passcodes are never stored in plain text.
- Rules enforce basic schema constraints and deny collection-wide reads.

See `/firestore.rules`.

> Important: without Firebase Auth, absolute server-enforced identity is limited. For stronger protection, add anonymous auth or callable Cloud Functions for challenge/response.
