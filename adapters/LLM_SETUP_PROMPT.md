# Use Cover Review with any AI assistant

This app is Muse native, it was built in Muse and its richest setup path runs through a Muse. It also works with any agent or LLM that can read files and run shell commands, like a game that started on one console and gets ported to others. Full multi-agent bridging is a later port. What works today:

- Any agent that reads AGENTS.md (most coding agents do) gets the full setup and debugging protocol automatically.
- Claude users: also see CLAUDE.md in the repo root.
- Muse users: see .github/muse-instructions.md.
- Gemini users: see GEMINI.md in the repo root.

No agent at all? Paste this into any capable LLM chat connected to the repo files:

---

You are setting up uBee Cover Review for me. Read AGENTS.md and SETUP_FOR_MUSE.md in this repo and follow them exactly. Get the app running with npm run setup, npm run build, npm start. Photos are the only requirement, get my photos in first. Then walk me through connecting Drive, Spotify and Instagram the way the setup file describes, create my folders for me, and sort my DUMP when I say done. If I report a problem, follow the debugging protocol in AGENTS.md and the runbook in TROUBLESHOOTING.md, fix it, prove the fix, and tell me in plain words what you changed.

---
