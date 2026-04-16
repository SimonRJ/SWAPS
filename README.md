# ⚽ SWAPS — Soccer Subs

**🚀 Live app → [swaps-app.netlify.app](https://swaps-app.netlify.app)**

A mobile-first web app for managing soccer substitutions across an entire season, ensuring every player gets fair and equal time in every position.

Works on iPhone, iPad, Android, and any mobile browser. Add it to your home screen for a native full-screen experience.

## Features

### Team Management
- **Secure team accounts** – Each team gets a unique code and passcode-protected login; data is shared across any device with the same credentials.
- **Player roster** – Add, remove, and manage players throughout the season.
- **Season configuration** – Set field size, game duration, number of rounds, and season schedule with opponents and dates.
- **Club logos** – Upload a custom team logo or auto-fetch opponent badges from TheSportsDB.

### Game Day
- **Game day wizard** – Mark absent players, review the auto-balanced team sheet, and start the game with one tap.
- **Smart substitution algorithm** – Automatically generates lineups that balance each player's cumulative minutes across GK, DEF, MID, and ATK positions over the whole season.
- **Formation support** – Supports formations for 6v6 through to 11v11 (e.g. 3-3-2, 4-3-3, and more).
- **Live game timer** – Full-screen pitch view with a countdown to the next substitution window, showing who comes on/off and in which position.
- **Injury substitutions** – Replace an injured player mid-game without disrupting the substitution schedule.
- **Bench rotation fairness** – Tracks how often each player starts on the bench and protects those who sat out most recently.

### Stats & Reporting
- **Season statistics** – Cumulative minutes per player per position (GK / DEF / MID / ATK) with colour-coded visual bars and target tracking.
- **Game history** – View results, scores, and opponent details for every completed round.
- **PDF round sheets** – Generate and download printable team sheets for any round via jsPDF.

### Cloud & Sync
- **Cloud persistence** – Team data is stored in Netlify Blobs, so it persists across sessions and devices.
- **Admin panel** – List all team codes and delete teams with an admin password.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) on your phone or browser.

## Build for Production

```bash
npm run build
```

The output goes to `dist/`. The app is deployed automatically to Netlify on every push.

## Linting

```bash
npm run lint
```

## Tech Stack

- [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Netlify Functions](https://docs.netlify.com/functions/overview/) + [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
- [jsPDF](https://github.com/parallax/jsPDF) for printable round sheets
- [TheSportsDB API](https://www.thesportsdb.com/) for opponent logo lookups

## Repository Protection

> ⚠️ **Do not delete this repository.** To prevent accidental loss:
> - The repository owner should restrict the **Delete this repository** option under **GitHub → Settings → General → Danger Zone** to confirmed admin access only.
> - Consider transferring ownership to a GitHub Organisation for additional safeguards.
>
> For branch protection, configure rulesets under **Settings → Rules → Rulesets** to require pull request reviews and status checks before merging to `main`.
