# uBee Cover Review (portable)

Review your covers the way they'll post: like to approve, pass to skip, fix the text right on the cover. Built for uBee creators, made for creators, by creators.

This is the portable edition of the Cover Review app that started inside Arjang's Muse. It runs anywhere Node runs, with no Muse-only parts. Clone it, run it, review. Your Muse sets up the rest with you.

## The short version

- Photos are the only thing it needs. Add photos and start reviewing.
- Approve, pass, rate, and leave a note on every photo. Nothing gets deleted when you approve, your choice is saved.
- Every photo gets a quote from the uBee default pack, a song suggestion, and a caption draft.
- Songs default to what is trending on Instagram. Connect Spotify and your own library goes first. Connect a folder of downloaded songs (Symphony's manifest.json and hook clips) and its songs go first, each playing its hook. uBee clients can connect Symphony too: the note next to the song opens New hot and every song's hook, and Use on this cover sets it.
- Captions draft in your voice once your Muse learns it from your previous Instagram captions, with your consent.
- Where your Muse can draft with a model, new covers get a caption in your own voice before you see them, on topic of the text on the cover, or about the photo when a cover has no text. A caption you typed is never replaced.
- If you run comment keyword DMs, your Muse saves your calls ("Comment WORD and I'll send you ...") and each cover gets a switch under the caption, off by default. On, your call leads the caption that posts.

## Run it

```bash
npm run setup
npm start
```

Open http://localhost:4173

For development with hot reload, run the server with `npm run dev` and the client with `npm --prefix client run dev`.

## Updates

The app checks for a new version when it starts and every 2 minutes. When there is one, a small note says so, and the app updates itself the next time it sits quiet for a minute: no editor or sheet open, and nothing tapped, typed or scrolled. It backs up your data, updates, and restarts, and an open page reloads itself. Your photos, decisions and notes are never touched. Update now in the note does it right away. If an update fails, the app goes back to the version it was on, says so, and waits for Try again or the next version. Install with `git clone` so updates work. The version you're on shows small at the top right of every screen.

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
| Images | Photos, queued for review. A new batch goes to the front of the queue (1.20.1) |
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

Quotes start locked: no cover shows one, and the compose check and caption drafts leave them out. Once they're unlocked, every cover shows its quote unless you turn it off there with the T icon. Two ways to unlock them:

- Connect your own quote list, in the app or through your Muse.
- Take the quote quiz. The app shows you generalized quotes from the uBee pack, one at a time. Steal the ones that sound like you, skip the rest. Stolen quotes become your list. The pack was sorted before shipping: every Arjang specific quote (his name, his rugs, his modeling story) is out of the quiz. What is left works for anyone.

## Something wrong? Your AI fixes it

There is a "Something wrong?" box in the app. Type what hurts, in your own words, and tell your Muse or AI assistant: fix my Cover Review grievance.

Yes, that works, and it is by design. This repo is plain code with a debugging protocol in AGENTS.md and a runbook in TROUBLESHOOTING.md. Your AI reads your grievance (it is saved in the app with context), checks the app health endpoint, reproduces the problem, backs up your data, fixes the smallest real cause, runs the built in smoke test to prove it, and tells you in plain words what changed. Your photos, decisions and notes are never the price of a fix.

## uBee clients

Normal creators save in their own Drive. uBee clients save inside the uBee shared Drive, in their own designated creator folder, organized for them to browse: "Start Here", "New To Review", "Approved - Her Picks", "Posted", and the usual buckets. The first uBee creator is the model for this. Her Muse sets her workspace to client mode and the folder plan changes itself.

### Schedule with Pollen

uBee clients can send approved covers straight to Pollen, uBee's publisher. Paste the Pollen code from uBee into Setup (or have your Muse do it). Then an approved cover has a big Schedule button under its icons (1.21.0), or in Approved tap Select, pick covers and tap Schedule with Pollen.

- Your channels show as round badges, in color when they're on and black and white when they're off. Every photo channel starts on, Substack starts off. Tap one to switch it.
- Schedule is on by default, and the bright button reads Post. With Schedule off it reads Post now, once Pollen can post right away; until then the switch stays on and says so.
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

Every AI follows the same rule before any push: pull first, run `npm test`, never force-push, dev first, a second AI reviews, then worldwide. A worldwide push reaches every creator's copy within 2 minutes, and each copy installs it at its next quiet minute. The full rule is in AGENTS.md.

## The review screen

Since 1.4.0 the cover is the screen, the way Quill's Cover Review looks. Since 1.5.0 the editor works like the original's too:

- Header: back to all covers, the queue count, setup and help, "Cover 1 of 17", undo and redo.
- The cover as it will post, in a 4:5 frame that fills the screen's width edge to edge (1.14.1). The screen and the posted image are drawn by the same code, so what she approves is what posts.
- The song row: the play button opens Spotify's own player for the cover's song when the song has a Spotify link, or plays a preview when the pool has one. A downloaded song plays its hook clip from the app. Shuffle picks another song. Since 1.14.1 the player opens right above the song row while the header and the view switch move up out of its way: the cover stays exactly where it is and the page doesn't scroll.
- Icons under the cover: like (approve), dislike (pass), download, remix, note, the T, the glass, edit.
- Download saves the cover in one tap, on a phone too, with no share sheet (1.21.0).
- Remix (1.17.0) opens a menu: New quote, New song or both, each with an optional prompt, then Submit. The app picks from her own quotes and her song list (never a hidden song, saved songs first). Since 1.21.0 the cover she's on changes right away, one version newer, and Undo brings it back. A remix never makes a copy. A remix that can't pick changes nothing, and the menu says why.
- The glass, just left of the pencil (1.14.1; nothing sits on the photo), flies the photo up to fill the screen. Pinch to zoom (up to 4 times) while your fingers are down: letting go puts the photo back to its normal framing, like Instagram (1.20.0). Double tap zooms in and stays, drag looks around a zoomed photo, and a tap on the dark background puts it back. It works in the editor too.
- Holding down on the cover, a photo slide or the zoomed photo selects nothing and opens no menu (1.13.6). A hold that lifts without moving is still a tap, and the editor's fields select text as usual.
- Hold and drag (1.20.0): hold a text box until a ring shows around it, then drag it where you want it and let go. It's saved as one step for undo, and the editor stays closed. In the editor, press any text box and drag it.
- Slides: swipe the cover or use the slides stepper to move through them, add one with +, remove one with minus. Since 1.13.4 the stepper sits in one row with the cover arrows at its two ends, which step between covers. Since 1.20.0 each photo can carry its own text: the editor opens on the photo you're on. Carousels still post as the cover alone for now.
- Randomize layout picks one of the original's six layouts (centered hero, left pillar, right pillar, justified center, small left column, monoline) and keeps the whole text inside the safe zone for the cover's shape. It changes the layout only, never the opacity, the font or the weight. Color lock sits on the button (1.14.1), on by default, so the color stays too. Off, each randomize also picks a new color from her colors and the 11. Tapping Color lock only switches it. Undo takes a randomize back.
- Text placement (1.13.8, the original's rules): Lines on Auto draws the quote in even lines, about one line for every 20 characters. On the cover screen, text she hasn't dragged stays inside the safe area for the cover's shape, and so does the posted cover. Once she drags a text box it can go anywhere on the photo until she moves to another cover. While she drags, the safe area's edge catches the text when its edge crosses it, and lets go when she pulls 8 more pixels. With a Muse that can see photos, each cover in the queue gets its text placed once, in empty space and never on a face or a head.
- Tap the text (or the pencil) and the editor slides up from the bottom, nearly see-through, so the cover stays in view and stays live: New text box, Face mosaic, Text width and Text height (stretch), the quote, Lines (Auto, or any count), color (her own colors first when her Muse sets them, then the 11 palette colors, then Black 50% and White 50%, which set the color and the opacity together, plus custom colors she can remove, and an eyedropper; a color picked after a 50% preset is at 100% again), font (TikTok Sans by default, her own fonts too, and new text starts at Regular), align (left, center, right, justify, with Justify width when justified), weight (Light, Regular, Medium, Bold; Light greys out on a font with no Light), image contrast, size, Line spacing, opacity, position, and a note for the next revision. On a queued cover, a font or a color is the whole queue's (1.20.0): every queued cover takes it, and a cover keeps the look it had once she approves or passes it. On a computer, a click on the photo away from the text closes the editor. Every change saves as she goes, with no Save or Cancel, and each change is one step for undo. Since 1.13.5 the sheet has its own Undo and Redo at its top left, on the same history as the header's. It rests at 56% of the screen: swipe it up to 88%, down to go back, and down again to close it. Tapping its handle, Escape or a tap anywhere off it closes it too, and nothing is lost.
- Below Randomize layout (1.21.0): the Instagram caption (with the Comment CTA switch under its label when her calls are set; off shows the plain caption, with any call written into it left out), Overlay Text (the quote and version), her note with Post, the Compose check (QUOTE_IN_STOCK, SONG_IN_POOL, STEPS_VERIFIED; the quote check reads NOT NEEDED while the quote is off or quotes are locked; a check saved by a version before 1.13.9 is checked once more in the background), Why it matches (once her Muse records it), and Rate Quality: the star ratings, then the photo's details and the photo swap.
- Snap guides (1.24.0): while she drags text, its edges and center catch the photo's center lines and thirds within 6px, and only the line it sits on shows. "Snap to guides" in Setup and help turns it off; Alt/Option or a second finger lets the text go free for that drag. On a landscape photo the text can go all the way to the photo's edges.
- The uBee logo at the top right loads the latest version in one tap, and the Drive row in Rate Quality opens that photo in Drive in a new tab.
- Why it matches is the compose check's 4th check (1.25.0): its words sit at the bottom of the Compose check card. A cover passes only with all four; otherwise it reads INCOMPLETE with a red X in each circle that fails, and it waits behind the covers that pass.
- Each cover's own color (1.26.0): no queue lock. A cover she hasn't colored gets one from the house palette against its photo, picked while she's idle. The far-left picker is a color wheel, Random picks a random hue that reads on the photo, her 5 newest colors and the two 50% colors sit in the color row, and new text starts in TikTok Sans Bold.
- Song shuffle, landscape re-wrap and the TikTok Sans files (1.27.0): Shuffle picks by what the cover says and never repeats a song on that cover, Remix lands a song named as Title - Artist exactly or says it isn't listed, a landscape drag toward a side re-wraps the text narrower, and TikTok Sans has every weight from 300 to 900.
- TikTok Sans Medium by default (1.28.0): new covers and text boxes start at 500, and a weight she picks is marked hers (`fontWeightSet`).
- Drag on every ratio, the ratio tag and Randomize focus (1.29.0): text re-wraps narrower to reach the sides on any photo shape, each cover's number shows its photo's ratio (003 9:16), and Enter runs Randomize layout again.
- The Compose check comes checked (1.21.0): a cover is checked the moment it's next in line, and again when its quote or song changes. Each check argues for the quote and the song in one short caveman line each ("Picture have dancing. Words say dance. Same thing, so them go together."). The image comes first, so it gets none.
- The T icon, next to the pencil (1.13.9): every cover shows its quote unless she turned it off. A tap turns this cover's quote off, or back on, for this cover only, and undo takes it back. Holding the T for a second hides the quote on every cover, and holding it again brings each one back as it was. A shorter press is a tap. Shift+Enter does the hold from a keyboard. On, the T sits in a green circle; off, it has a slash through it.
- Story view is the only 9:16 in the app, with pan framing that saves.
- Setup, the quote quiz, Pollen and "Something wrong?" sit behind the info button.
- Fonts: TikTok Sans ships with the app (SIL Open Font License), so the text looks the same on every phone. A creator's own fonts live in her data folder, never in the repo (1.20.0).
- All covers: with the text overlay on, every preview shows its text the way its cover draws it (1.20.0).

## Signing in

Since 1.15.0 the app opens on a sign-in screen: your Instagram username, then Continue. There's no password, so anyone who types a username opens that account. That's fine for a closed test, and it isn't real security yet: keep your copy's address to people you trust.

- Each account sees only its own covers, photos, quotes, quiz answers, grievances, Chats and settings. One copy can serve several people.
- You stay signed in. Log out is in the info sheet, under Account.
- Covers saved before 1.15.0 belong to the copy's owner: the username in its Instagram connector, or the first username that says they're hers. The owner can stop new sign-ups there too.
- Everyone gets the copy's songs. On the Songs screen, Save and Hide are yours alone: new covers and Shuffle try your saved songs first and never pick one you hid. Library's Hidden list has Unhide.

## Chats

Since 1.14.0 a switch above the review screen opens Chats, where she practices replies to her Instagram DMs and comments.

- The inbox looks like Instagram's, and since 1.22.0 it follows the reply practice simulator. A DM opens as a chat with the thread so far.
- It opens on Needs Reply: every chat still waiting for her answer, read or not, each labeled where it sits on Instagram (Primary, General, Requests or Spam). Replied lists the ones she answered, and with both off the inbox splits the way Instagram's does.
- Refresh is a live sync (1.23.0): her Muse pulls what changed on Instagram, inbox and comments, and the line beside Refresh says when it last synced and what came in, or why it stopped.
- Comments shows a square for each post. Tapping one shows the post and every comment under it, grouped: people she follows, people who follow her, everyone else.
- Draft (Reply on a comment) asks her Muse for a reply in her voice. It shows up as draft bubbles: she taps the ones she likes to approve them, edits or types her own, and taps Send. Her edits are kept. Refresh on a comment takes her direction for the next draft.
- Send hands only the texts she approved to her Muse, which sends them word for word and reports back. The drafts she didn't approve stay for later, and a text that went out can be edited through her Muse. Nothing sends without her tap.
- Blind tests: a message she already answered can come in sealed, so the draft is written without seeing her real reply, which opens once she saves her own.
- Training exports every reviewed answer, and the Voice tab is her written voice, which every draft follows.
- Labels (Flag, Booked, Lead, Ordered, Paid, Shipped) are saved with her account since 1.18.0, so every device shows the same ones.
- It starts empty, and her Muse sets it up (SETUP_FOR_MUSE.md, section 8).

## Beeline

Since 1.16.0 the switch also opens Beeline, the room where uBee's agents (Claude chats and Muses) work together. It's Arjang's: the screen stays a Connect card until a device key from his Beeline page connects it.

- Connect: make a key on the Beeline page under Connect a device, then paste it here. The key stays in this browser only, for the account signed in there, and never reaches this app's server or data. Disconnect, or revoking the key on the page, ends it.
- The room, live: who's in and what each one is doing, the messages with their photos, videos and files, and each agent's reactions.
- Highlights: his name in an agent's message, and words an agent marks for him, are yellow. An open call (a question or a decision waiting on him) has its own color, and its words show in that color until it closes.
- He can post words, photos, videos and files, give a message his 👍 with a double tap, poke an agent (a second tap while its name rings sends the poke again), and answer his open calls.
- Open calls (1.19.0): each decision waiting on him is a card in its call's color, with who opened it, how long ago, its title and a short description. A tap on the words shows the whole call. Approve and Reject take two taps, Edit takes his own words, and × closes a call without an answer. His answer posts in the room as him and pokes the agent that opened the call. Hide folds the cards into their numbers.
- Pausing or closing the room, invites and key resets stay on the Beeline page.

## How it is built

- Client: React + Vite in client/, plain CSS. The cover is a canvas drawn by client/src/renderCover.js, the same code that makes the posted image. Arrow keys move between covers on a computer.
- Server: Express in server/, zero native dependencies. State lives in data/db.json and data/settings.json, photos in data/uploads, sorted buckets in data/library. Since 1.15.0 that's the owner's: every other account keeps the same files in data/accounts/<username>/, and data/accounts.json holds the accounts and sessions. A username Windows can't use as a folder name (con, prn, aux, nul, com0 to com9, lpt0 to lpt9, alone or before a dot) gets a ~ after that part, like data/accounts/con~/ (1.18.0). That keeps a clone running in seconds on any laptop. For a bigger deployment, the store in server/store.js is the one file to swap for SQLite or Postgres.
- Connectors: server/connectors.js is the registry your Muse reads. Each connector lists what it is for, what it needs, and the exact steps Muse walks you through.

## For the first creator

This portable build exists so the first uBee creator gets the app Arjang promised her: approving is one tap and a note, never deleting a photo to say yes.
