# uBee Cover Review (portable)

Review your covers the way they'll post: like to approve, pass to skip, fix the text right on the cover. Built for uBee creators, made for creators, by creators.

This is the portable edition of the Cover Review app that started inside Arjang's Muse. It runs anywhere Node runs, with no Muse-only parts. Clone it, run it, review. Your Muse sets up the rest with you.

## The short version

- Photos are the only thing it needs. Add photos and start reviewing.
- Approve, pass, rate, and leave a note on every photo. Nothing gets deleted when you approve, your choice is saved.
- Every photo gets a quote from the uBee default pack, a song suggestion, and a caption draft.
- Songs default to what is trending on Instagram. Connect Spotify and your own library goes first.
- Captions draft in your voice once your Muse learns it from your previous Instagram captions, with your consent.

## Run it

```bash
npm run setup
npm start
```

Open http://localhost:4173

For development with hot reload, run the server with `npm run dev` and the client with `npm --prefix client run dev`.

## Updates

The app checks for a new version when it starts and every 2 minutes. When there is one, a big UPDATE NOW button shows at the top. One tap backs up your data, updates, and restarts the app. Your photos, decisions and notes are never touched. Install with `git clone` so updates work.

## Let your Muse set it up

Open this repo in Muse and say: set up Cover Review for me.

Your Muse follows SETUP_FOR_MUSE.md. It will:

1. Get the app running and get your photos in.
2. Ask to connect your Google Drive, then create a folder called "uBee Cover Review" for you, with a folder called "DUMP" inside it.
3. Tell you to throw everything into DUMP. Photos, videos, songs, voice notes, lists, all of it, no sorting.
4. When you say "done", it sorts DUMP into Images, Videos, Quotes, Music, Voice Profile and Captions, and queues your images for review.
5. Ask about Spotify for your own songs, and about Instagram for trending songs and, with your consent, learning your caption voice.

You can skip every connector and just review photos. The app says what is connected and what is not, honestly, on the setup card.

## Buckets

| Bucket | What lands there |
| --- | --- |
| Images | Photos, queued for review |
| Videos | Clips and B-roll |
| Quotes | Quote and hook lists. Yours replaces the default pack |
| Music | Songs and audio for edits |
| Voice Profile | Voice notes and memos, plus caption samples |
| Captions | Caption drafts and lists |
| Approved / Rejected | Your decisions, mirrored from the app |

## Defaults that ship in the box

- Quotes: data/default-quotes.json, the uBee default pack from Arjang's Copy 2 stock, 397 quotes. Add data/quotes.json with your own list to override.
- Trending: data/trending-instagram.json is a seed. Your Muse refreshes it through its Instagram connector.
- Branding: uBee bee and wordmark in public/brand, chartreuse #C5FD29. Branding stays on every creator copy.

## Quotes: off until they are yours

Quote over image is a toggle, and it starts off and locked. Two ways to turn it on:

- Connect your own quote list, in the app or through your Muse.
- Take the quote quiz. The app shows you generalized quotes from the uBee pack, one at a time. Steal the ones that sound like you, skip the rest. Stolen quotes become your list. The pack was sorted before shipping: every Arjang specific quote (his name, his rugs, his modeling story) is out of the quiz. What is left works for anyone.

## Something wrong? Your AI fixes it

There is a "Something wrong?" box in the app. Type what hurts, in your own words, and tell your Muse or AI assistant: fix my Cover Review grievance.

Yes, that works, and it is by design. This repo is plain code with a debugging protocol in AGENTS.md and a runbook in TROUBLESHOOTING.md. Your AI reads your grievance (it is saved in the app with context), checks the app health endpoint, reproduces the problem, backs up your data, fixes the smallest real cause, runs the built in smoke test to prove it, and tells you in plain words what changed. Your photos, decisions and notes are never the price of a fix.

## uBee clients

Normal creators save in their own Drive. uBee clients save inside the uBee shared Drive, in their own designated creator folder, organized for them to browse: "Start Here", "New To Review", "Approved - Her Picks", "Posted", and the usual buckets. The first uBee creator is the model for this. Her Muse sets her workspace to client mode and the folder plan changes itself.

### Schedule with Pollen

uBee clients can send approved covers straight to Pollen, uBee's publisher. Paste the Pollen code from uBee into Setup (or have your Muse do it), then in Approved tap Select, pick covers and tap Schedule with Pollen.

- Your channels are listed with every photo channel on. Substack starts off. Switch off anything you don't want.
- Each cover is drawn exactly as the review deck shows it, quote and all, and that picture is what posts.
- Pollen books each cover on the first day with no photo post, starting a week out. One photo post a day, never two. Reels don't count.
- Each cover shows its booked day ("Booked Tue Nov 24"). If uBee's computer is asleep, your covers wait safely and book as soon as it wakes up.
- Captions with emoji, dashes used as a pause, or a few banned words get flagged before anything is sent, with what to fix.

The code stays in data/settings.json on your computer and never goes into a commit, a grievance or a chat. Without a code, none of this shows.

## Any AI assistant

Muse native first, since that is where it was built. It also works with any agent that can read files and run commands: AGENTS.md carries the protocol, and adapters/LLM_SETUP_PROMPT.md has a copy paste prompt for any other LLM, plus pointer files for Claude, Gemini and Copilot. Wider bridging to other agents comes later, like a game porting to new consoles after launch.

## For Arjang: the two push commands

- "worldwide git push" means ship the current build to the public repo, github.com/arjangubee/ubee-cover-review, for everyone. Previous versions stay in that repo's history, like backups normally work on GitHub.
- "dev git push" means push to the private developer repo, ubee-cover-review-dev, the testing grounds. Nothing goes public from there until a worldwide push.

Say either phrase to Quill and it happens, with a reminder of which one you used. Creators never need these commands, they are the publisher's side of the fence.

Every AI follows the same rule before any push: pull first, run `npm test`, never force-push, dev first, a second AI reviews, then worldwide. A worldwide push shows UPDATE NOW on every creator's copy within 2 minutes. The full rule is in AGENTS.md.

## The review screen

Since 1.4.0 the cover is the screen, the way Quill's Cover Review looks:

- Header: back to all covers, the queue count, setup and help, "Cover 1 of 17", undo and redo.
- The cover as it will post, in a 4:5 frame. The screen and the posted image are drawn by the same code, so what she approves is what posts.
- Icons under the cover: like (approve), repost (remix into a new version), download, dislike (pass), note, edit.
- Slides: swipe the cover or use the Slides stepper to move through them, add one with +, remove one with minus. Posts steps between covers.
- Randomize layout tries a fresh look from her palette and fonts. Undo takes it back.
- Tap the text (or the pencil) and the editor opens on the cover: text width and height, the quote, Lines 1 to 4, color (the 11 palette colors first, plus custom colors and an eyedropper), font, align (left, center, right, justify), weight, image contrast, size, opacity, position, a note for the next revision, then Cancel or Save. New text box adds her own text; Face mosaic hides a face.
- Below: her note with Post, the title with the quote and version, the Instagram caption, the Compose check (QUOTE_IN_STOCK, SONG_IN_POOL, STEPS_VERIFIED), Why it matches (once her Muse records it), Image info with photo swap, and star ratings.
- Story view is the only 9:16 in the app, with pan framing that saves.
- Setup, the quote quiz, Pollen and "Something wrong?" sit behind the info button.
- Fonts: TikTok Sans ships with the app (SIL Open Font License), so the text looks the same on every phone.

## How it is built

- Client: React + Vite in client/, plain CSS. The cover is a canvas drawn by client/src/renderCover.js, the same code that makes the posted image. Arrow keys move between covers on a computer.
- Server: Express in server/, zero native dependencies. State lives in data/db.json and data/settings.json, photos in data/uploads, sorted buckets in data/library. That keeps a clone running in seconds on any laptop. For a bigger deployment, the store in server/store.js is the one file to swap for SQLite or Postgres.
- Connectors: server/connectors.js is the registry your Muse reads. Each connector lists what it is for, what it needs, and the exact steps Muse walks you through.

## For the first creator

This portable build exists so the first uBee creator gets the app Arjang promised her: approving is one tap and a note, never deleting a photo to say yes.
