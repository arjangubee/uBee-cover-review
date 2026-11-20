# Troubleshooting runbook, for the creator's AI

Work grievances from this runbook first. The full debugging protocol is in AGENTS.md.

First checks, always:
1. `GET /api/health` - app version, item counts, connector states, open grievances.
2. `GET /api/grievances` - what the creator reported, in their words.
3. `npm test` - the updater test plus the smoke test (setup, quotes, quiz lock, connectors, Drive plan, workspace, consent gate, upload and approve, the full editor, trending, updates, health and grievances). It runs in a throwaway data folder.

Common issues:

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| App will not start, port busy | Another copy is already running | Find the process on PORT in .env, stop it or change PORT, restart |
| Page loads blank | Client not built | Run `npm run build`, restart the server |
| Bee or wordmark missing | Brand PNGs did not survive a file copy | Run `node scripts/restore-brand.mjs` |
| Quote toggle refuses to turn on | Working as designed: quotes are locked | Creator connects their quotes with POST /api/quotes/connect, or steals at least one quote in the quiz |
| Quiz quote feels Arjang specific | The generalized filter is keyword based, a borderline quote slipped through | Remove that text from data/quiz-quotes.json, note it in the grievance resolution |
| Songs look stale | Trending seed was never refreshed | Refresh through the Instagram connector, POST /api/trending/refresh |
| No note button next to the song, or the Songs screen says the code doesn't work | Symphony isn't connected, or uBee replaced the code | GET /api/connectors/symphony shows which. Ask uBee for the code and POST /api/connectors/symphony {code}. Never paste the code anywhere else |
| A Symphony song won't play | Symphony can't be reached, or the song left Symphony's feed | GET /api/connectors/symphony shows any message. Check the internet, then shuffle the song or pick another in the Songs screen |
| Drive folders exist only as a plan | No Google API credentials in .env, plan mode is expected | Create the folders through your Drive connector, confirm ids with POST /api/drive/folders/confirm |
| A uBee client's files landed in their personal Drive | Workspace mode is own_drive | POST /api/workspace/configure with mode ubee_shared and the client name, then rebuild their folders inside the uBee shared Drive under Creators / their name |
| Photos approved but creator cannot find them | Decisions live in data/db.json and the app tabs | Show them the Approved tab. If Drive is connected, mirror approvals into the Approved folder |
| Data looks wrong after an edit | A fix touched data files | Restore data/db.json from the backup the protocol told you to make before fixing |
| The app never updates itself | The copy wasn't installed with git, GitHub can't be reached, or it never sits quiet for a minute | Run `git status` in the app folder. No git: reinstall with `git clone` and move data/ across. Otherwise tap Update now in the note |
| Update says it went back to the old version | The new version downloaded but install or build failed, so the app put the old one back (1.13.10) | Check data/backups and the error, run `npm run setup` and `npm run build` on the new version by hand, then `npm start` |
| Update note says a local fix clashed | Your code fix and the new version changed the same lines | Open data/backups/<time>/local-changes.patch, re-apply what is still needed |
| Data looks wrong right after an update | Rare, but backups exist | Every update first copies the data files to data/backups/<time>/ |

Never fix by deleting creator data. Back up data/db.json and data/settings.json before any repair, and say in the resolution what you changed and how you verified it.
