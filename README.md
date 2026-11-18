# uBee Cover Review (portable)

Swipe to approve your photos. Built for uBee creators, made for creators, by creators.

This is the portable edition of the Cover Review app that started inside Arjang's Muse. It runs anywhere Node runs, with no Muse-only parts. Clone it, run it, review. Your Muse sets up the rest with you.

## The short version

- Photos are the only thing it needs. Add photos and start swiping.
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

Normal creators save in their own Drive. uBee clients save inside the uBee shared Drive, in their own designated creator folder, organized for them to browse: "Start Here", "New To Review", "Approved - Her Picks", "Posted", and the usual buckets. Damiana, the first uBee creator, is the model for this. Her Muse sets her workspace to client mode and the folder plan changes itself.

## Any AI assistant

Muse native first, since that is where it was built. It also works with any agent that can read files and run commands: AGENTS.md carries the protocol, and adapters/LLM_SETUP_PROMPT.md has a copy paste prompt for any other LLM, plus pointer files for Claude, Gemini and Copilot. Wider bridging to other agents comes later, like a game porting to new consoles after launch.

## For Arjang: the two push commands

- "worldwide git push" means ship the current build to the public repo, github.com/arjangubee/ubee-cover-review, for everyone. Previous versions stay in that repo's history, like backups normally work on GitHub.
- "dev git push" means push to the private developer repo, ubee-cover-review-dev, the testing grounds. Nothing goes public from there until a worldwide push.

Say either phrase to Quill and it happens, with a reminder of which one you used. Creators never need these commands, they are the publisher's side of the fence.

## The full editor

The lean swipe flow is the default. The full Cover Review editor is one tap away on every cover:

- Live text overlay on the photo, exactly where it will sit
- Text color from the 11 color palette only: Cream, Lemon Lime, White, Spotify Green, Yellow, Icy Aqua, Pure Red, Black, Cherry Blossom, Baby Blue Ice, Hot Fuchsia
- Fonts: TikTok, Avenir, Serif, Condensed, Papyrus. Regular, Medium and Bold. Size, opacity, alignment, horizontal and vertical position, black or white bars, negative toggle
- Rate the parts separately: photo quality, song, quote
- Carousel slides: add, remove, restore, reorder. First slide sets the ratio for the post
- Story view: the only 9:16 in the app, with per photo pan framing that saves
- Swap the photo and keep the quote, song and styling. Restore the original any time
- Remix a cover into a new revision, or reject and revise with a note
- Compose verification on every cover: QUOTE_IN_STOCK, SONG_IN_POOL, STEPS_VERIFIED
- Drive enqueue with the quality gate: blurry or quarantined photos never enter the queue, and no cover ever sits in the queue without a quote

## How it is built

- Client: React + Vite in client/, plain CSS, swipe plus buttons plus arrow keys.
- Server: Express in server/, zero native dependencies. State lives in data/db.json and data/settings.json, photos in data/uploads, sorted buckets in data/library. That keeps a clone running in seconds on any laptop. For a bigger deployment, the store in server/store.js is the one file to swap for SQLite or Postgres.
- Connectors: server/connectors.js is the registry your Muse reads. Each connector lists what it is for, what it needs, and the exact steps Muse walks you through.

## For Damiana, first creator

This portable build exists so the first uBee creator gets the swipe app Arjang promised her: an app you can swipe on, where approving is a swipe and a note, never deleting a photo to say yes.
