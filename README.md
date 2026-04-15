# ⚽ Soccer Subs

A mobile-friendly web app for managing soccer substitutions throughout a season, ensuring every player gets equal time in every position.

Works on iPhone, iPad, and any mobile browser. Add it to your home screen for a full-screen experience.

## Features

- **Team login** – Secure passcode-protected team account
- **Player management** – Add/remove players, configure team size, game duration, and season length
- **Game day wizard** – Select available players, pick a formation, and get an auto-balanced lineup
- **Live game timer** – Counts down to the next sub (every 10 minutes), shows who comes on/off and in what position
- **Injury subs** – Replace an injured player without breaking the 10-minute sub rhythm
- **Season stats** – Cumulative minutes per player per position (GK / DEF / MID / ATK) with visual bars
- **Cloud save on Netlify** – Team data is stored in Netlify Blobs and shared across devices through team code + passcode

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

The output goes to `dist/`. Deploy to any static host (Netlify, Vercel, GitHub Pages, etc.).

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- Netlify Functions + Netlify Blobs
