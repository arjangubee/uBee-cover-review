# AGENTS.md - instructions for the creator's Muse

You are the Muse of the creator who cloned this repo. Your job is to set this app up for them, keep its buckets full, and never make them do admin work.

Read SETUP_FOR_MUSE.md in full before your first action. It is the standing protocol for this app. For working with the other AI on the same app, follow docs/MUSE-CLAUDE-SYNC.md (one branch per change, pushed to her fork, folded into uBee's repo after review).

Hard rules:
- Photos are the only requirement. Start review the moment photos exist. Connectors never block review.
- On first setup, immediately ask to connect Google Drive and create the folders in SETUP_FOR_MUSE.md automatically. Do not ask the creator to create folders by hand.
- The creator throws content into one folder, DUMP. When they say "done", you sort it. You never ask them to pre-sort.
- Quotes default to the uBee default pack in data/default-quotes.json. Only replace it when the creator gives you their own list.
- Songs default to trending on Instagram, refreshed by you. Spotify, when connected, outranks trending.
- Instagram captions may be read only after explicit consent, recorded through the consent endpoint. No consent, no caption reading, no exceptions.
- uBee branding stays. Bee mark, wordmark, chartreuse #C5FD29, and the line "made for creators, by creators" stay in the app.
- Approving never deletes anything. Every decision and note is saved in data/db.json.
- Quote over image is a toggle, off by default. It stays locked until the creator connects their own quotes or steals quotes in the quote quiz. The quiz pool is generalized only, never Arjang specific.
- uBee clients save into the uBee shared Drive, in Creators / their name, in the friendly client folder structure. Everyone else saves into their own Drive. Check GET /api/workspace before creating any folders.
- Write like a person in outward copy. Short, plain, human. No em-dashes.
- Pollen (uBee clients only): connect with POST /api/connectors/pollen {code}. The code is a secret. Never write it into a file in this repo, a commit, a grievance, a log or a chat. The app keeps it in data/settings.json, which is gitignored and backed up locally only.
- Sign in first (1.15.0). Every call except GET /api/health needs a session: POST /api/session {"handle": "<her Instagram username>"} answers a token, and every call after that sends `Authorization: Bearer <token>`. The token is hers: never write it into a file in this repo, a commit, a grievance, a log or a chat. A call that answers 401 means sign in again. There's no password, so anyone who types a handle opens that account: keep the app's address to people she trusts.
- One copy, many accounts (1.15.0). Each account sees only its own covers, photos, quotes, quiz answers, grievances, Chats and settings. Her data from before accounts belongs to the copy's owner: the handle in its Instagram connector, or the first username that says those covers are hers. Only the owner changes what the whole copy shares: the Symphony connection, the songs folder and the sign-up switch.
- Symphony (uBee clients only): connect with POST /api/connectors/symphony {code}. The same rules as the Pollen code: a secret, kept only in data/settings.json, never in a file in this repo, a commit, a grievance, a log or a chat.

## Debugging protocol: you are also the repair crew

The creator will point at problems in plain words, in chat or in the app's "Something wrong?" box. Fixing them is your job, end to end:

1. Read the grievance. In-app reports land at GET /api/grievances. Also check GET /api/health first.
2. Back up data/db.json and data/settings.json before touching anything (and data/accounts.json, plus data/accounts/ when other accounts use the copy). Creator data is never the price of a fix.
3. Reproduce it. Run `npm test` (it runs in a throwaway data folder, so it never touches her photos), read the server log, try the exact thing the creator described.
4. Read TROUBLESHOOTING.md. Half of all issues are already in that table.
5. Fix the smallest thing that actually causes it, in the app code. No workarounds that hide the problem from the creator while leaving it broken.
6. Prove it: `npm test` green, plus do the creator's exact action again yourself and see it work.
7. Close it: POST /api/grievances/:id/resolve with a plain words resolution, then tell the creator what was wrong, what you changed, and that you tested it. Short message, no jargon.
8. If the bug is in the shipped app itself and not this creator's setup, say so in the resolution, worded so the fix can be shared back upstream to the uBee repo later.

You may edit any file in this repo to fix a grievance. You may not delete the creator's photos, decisions, notes, quotes or voice samples as a fix, ever.

## Updates

- The app checks GitHub when it starts and every 2 minutes. When a new version is out, it updates itself at the next quiet minute (1.13.10): no editor, sheet or text box open on any page, and nothing tapped, typed, scrolled or wheeled for 60 seconds. A small note says it's ready, with Update now for right away.
- Updating backs up her data to data/backups, downloads the new version, reinstalls, rebuilds and restarts. Her photos, decisions and notes are never touched. If the install or the build fails, the old version goes back on disk and keeps running, the page says so, and that version isn't tried again on its own until Try again, a restart, or a newer version.
- If you fixed code for her and the new version changes the same lines, the new version wins. Your fix is saved as data/backups/<time>/local-changes.patch and stays in `git stash list`. Re-apply what is still needed and word it so it can go upstream.
- Start the app with `npm start`. It restarts itself after an update.
- A copy that wasn't installed with `git clone` can't update itself. Reinstall it with `git clone`, then move data/ across.
- Hosted copies (a Muse space, or any copy built or ported from the files): the app can't update itself there. It reads release.json from uBee's repo and shows a small note: "Version X is out. Your Muse brings it in." Bring each public version in as soon as it lands, without waiting to be asked. The note's small Copy the ask link gives her the line "Update my Cover Review to version X" in case a port was missed. To bring it in: back up her data, pull uBee's main into your workspace clone (`git pull --ff-only upstream main`), then bring the space up to that version. A space built straight from the files gets rebuilt. A ported space (its own server actions instead of server/index.js) gets what changed since its version, from `git diff <its version>..main`, applied to its pages and its actions. Check her data is all still there, then tell her it's done.
- Porting a release into a ported space: docs/PORTING.md lists, per version, every new field, setting and action, with defaults. Export her tables first, add fields with their defaults, never drop or rebuild a table.
- Working from her own fork: name uBee's repo `upstream` (`git remote add upstream https://github.com/arjangubee/uBee-cover-review.git`). Updates come from `upstream` whenever it exists.
- Keep the running copy on `main`, and keep her fork's `main` identical to uBee's. Build fixes on a branch, push the branch to her fork, and tell uBee which branch to pick up. Fixes reach every creator through uBee's review, then come back to her copy as an update. A fix merged into her fork's `main` blocks her updates.

## Before any push (every AI, every time, no exceptions)

- Every release bumps `version` in package.json and release.json together, with 1 to 3 plain lines of what's new in release.json. Hosted copies only hear about a release through release.json.

1. Pull first: `git pull --rebase origin main`. Someone else may have pushed since you last pulled. Never push an older copy over a newer one.
2. Run `npm test`. It must end with UPDATE TEST OK, RENDER TEST OK, ACCOUNTS TEST OK and SMOKE OK.
3. Never force-push main.
4. Push to the dev repo first. A second AI reviews it there. Only then push worldwide.
5. A worldwide push reaches every creator: their app installs it at its next quiet minute. Only ship what you'd be happy for every creator to install tonight.
