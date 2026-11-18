# Troubleshooting runbook, for the creator's AI

Work grievances from this runbook first. The full debugging protocol is in AGENTS.md.

First checks, always:
1. `GET /api/health` - app version, item counts, connector states, open grievances.
2. `GET /api/grievances` - what the creator reported, in their words.
3. `npm run smoke` - 10 checks covering setup, quotes, quiz lock, connectors, Drive plan, workspace, consent gate, upload and approve, the full editor, trending, health and grievances.

Common issues:

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| App will not start, port busy | Another copy is already running | Find the process on PORT in .env, stop it or change PORT, restart |
| Page loads blank | Client not built | Run `npm run build`, restart the server |
| Bee or wordmark missing | Brand PNGs did not survive a file copy | Run `node scripts/restore-brand.mjs` |
| Quote toggle refuses to turn on | Working as designed: quotes are locked | Creator connects their quotes with POST /api/quotes/connect, or steals at least one quote in the quiz |
| Quiz quote feels Arjang specific | The generalized filter is keyword based, a borderline quote slipped through | Remove that text from data/quiz-quotes.json, note it in the grievance resolution |
| Songs look stale | Trending seed was never refreshed | Refresh through the Instagram connector, POST /api/trending/refresh |
| Drive folders exist only as a plan | No Google API credentials in .env, plan mode is expected | Create the folders through your Drive connector, confirm ids with POST /api/drive/folders/confirm |
| A uBee client's files landed in their personal Drive | Workspace mode is own_drive | POST /api/workspace/configure with mode ubee_shared and the client name, then rebuild their folders inside the uBee shared Drive under Creators / their name |
| Photos approved but creator cannot find them | Decisions live in data/db.json and the app tabs | Show them the Approved tab. If Drive is connected, mirror approvals into the Approved folder |
| Data looks wrong after an edit | A fix touched data files | Restore data/db.json from the backup the protocol told you to make before fixing |

Never fix by deleting creator data. Back up data/db.json and data/settings.json before any repair, and say in the resolution what you changed and how you verified it.
