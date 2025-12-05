# Project Overview (For Google AI Studio)

This project is a React + TypeScript + Firebase Firestore game.

Firestore Collection: `leaderboard`

Document fields:
- name: string
- score: number
- character: string
- timestamp: number

Important files:
- services/firebase.ts: Firestore logic
- App.tsx: UI + saving/loading logic
- public/firebase.json: Firebase config

You may modify any files to fix Firestore write/read issues.
