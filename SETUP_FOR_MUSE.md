# Setup protocol for the creator's Muse

Follow this in order the first time a creator opens this repo with you. Steps 2 to 5 are offers you make and work you do. Step 1 is the only gate.

## 1. Get it running, get photos in

1. Run `npm run setup`, then `npm start`. Open http://localhost:4173 with the creator.
2. If the creator already has photos on their phone or computer, have them tap "Add photos" in the app. Review can start right there. Everything below runs alongside review, never before it.

## 2. Connect Drive, create the folders automatically

Immediately ask, in plain words: want me to hook up your Drive so everything backs up and sorts itself?

On yes:
1. Walk them through connecting "Google Drive" in Muse "Settings" > "Connectors". Wait for the connection to show healthy.
2. Create this folder system in their Drive yourself, through your Drive connector or by calling `POST /api/drive/folders` when API credentials are in .env:

   - "uBee Cover Review" (root)
     - "DUMP"
     - "Images"
     - "Videos"
     - "Quotes"
     - "Music"
     - "Voice Profile"
     - "Captions"
     - "Approved"
     - "Rejected"

3. If you created the folders through your connector, record the ids with `POST /api/drive/folders/confirm` with a JSON body of rootFolderId and folders.
4. Tell the creator, exactly this idea in your own words: I made you one folder that matters, it is called DUMP. Throw everything in there. Photos, videos, songs, voice notes, quote lists, all of it. Do not sort it. When you are done, just say done.

## 3. When the creator says "done", sort DUMP

1. Call `POST /api/dump/sort` for anything dumped locally, and mirror the same sorting in Drive: use the classification in server/services.js (classifyFile) as the rule set.
   - Images go to "Images" and enter the review queue.
   - Videos go to "Videos".
   - Audio that sounds like a voice note or memo goes to "Voice Profile". Other audio goes to "Music".
   - Text, docs and lists go to "Quotes", unless the name says caption, then "Captions".
   - Anything unclear goes to "Other" and you ask the creator about it in one short message, later. Sorting never stalls on one weird file.
2. Report back in one short message: how many of each bucket, and that review is ready.

## 4. Spotify, for their own songs

Ask if they want songs from their own Spotify. On yes:
1. Walk them through connecting "Spotify" in Muse "Settings" > "Connectors".
2. Set SPOTIFY_CLIENT_ID and related values in .env from the app they create at developer.spotify.com, send them to `GET /api/connectors/spotify/auth-url`, and finish the OAuth with them.
3. Pull their saved tracks or their chosen playlists through your Spotify connector and send them with `POST /api/connectors/spotify/sync-library` as tracks with title and artist, plus spotifyUrl (the track's open.spotify.com link) so the play button can open Spotify's player.
4. From then on, song suggestions come from their library first.

Downloaded songs, only when the owner gives you a songs folder (1.11):
1. The folder holds Symphony's manifest.json at its top and the hook clips it lists (hooks/<id>.m4a).
2. Connect it with `POST /api/songs/folder` as `{ "folder": "/full/path/to/the/folder" }`. It answers with the songs it can play, or the reason it can't use the folder.
3. From then on, new covers and Shuffle pick from those songs, each with its hook clip, and a song you set that's on the list gets its clip. Covers keep their songs until they're shuffled or changed.
4. To stop, send `{ "folder": null }`. Covers keep their song names.

Symphony, uBee clients only (1.12):
1. Ask uBee for the Symphony code. It is a secret: never write it into a file in this repo, a commit, a grievance, a log or a chat.
2. Connect it with `POST /api/connectors/symphony` as `{ "code": "..." }`. It answers with how many songs Symphony has and how many have hook clips, or the reason the code didn't work.
3. Tell the creator: the note next to a cover's song opens Symphony's songs. New hot plays what's rising in the US, and Use on this cover puts a song on that cover with its hook. With no songs folder connected, new covers and Shuffle pick Symphony's songs too.
4. To stop, send `{ "code": null }`. Covers keep their songs.

## 5. Instagram: trending by default, captions only with consent

Trending, no consent needed:
1. Through your Instagram connector, check what songs are trending on Instagram right now for their niche.
2. Send them with `POST /api/trending/refresh` as songs with title and artist, plus a source note. Add spotifyUrl when you can find the song on Spotify, so the play button works. Refresh this about weekly, or when they ask what is trending.
3. Until your first refresh lands, the app uses the seed file and says so honestly.

Voice profile, consent required:
1. Ask in plain words: can I read your previous Instagram captions so this app drafts captions that sound like you? Nothing gets posted, it only learns your voice.
2. Only on a clear yes, record it with `POST /api/connectors/instagram/consent` with captionConsent true and their handle.
3. Pull their recent captions through your Instagram connector and send them with `POST /api/voice/samples` as samples, with source set to instagram.
4. Tell them their voice profile is live and captions will now draft in their voice. They can paste extra writing samples the same way with source set to manual.

Caption voice, for drafting with a model (1.9):
1. Write their caption voice as plain text: how they write, how long their captions run, their own spellings, the words they reach for and the ones they never use. Get it from their own writing, and let them read it.
2. Save it with `POST /api/settings/caption-voice` as `{ "voice": "..." }`. It stays in this copy's data. Send an empty voice to remove it.
3. New covers start with the quote as a placeholder caption. If your space can call a model, draft placeholders and blank captions with `GET /api/items/:id/caption-prompt`, then save each draft with `POST /api/items/:id/caption-draft` and the basedOn it gave you. A caption they typed is never replaced.
   A cover with no text on it gets a caption about its photo. When the prompt says needsDescription, look at the photo (imageUrl) and record what it shows with `POST /api/items/:id/description` first. Never write about a hidden quote.
   Every voiced caption references something specific in the photo, invents subtext around it and opens curiosity loops (1.10.1), so every cover needs its description first, covers with text on them too.
4. Covers already in the deck keep their captions. Only redraft those (`{ "backfill": true }`) when the owner says to.

Comment CTAs, if they run ManyChat-style keyword DMs (1.10, named Comment CTA in 1.10.1):
1. Save each call with its keyword with `POST /api/settings/caption-ctas` as `{ "ctas": [{ "keyword": "WORD", "line": "Comment WORD and I'll send you ..." }] }`. Use their exact lines and only keywords their DM automation really answers. They stay in this copy's data. Send an empty list to remove them.
2. Each cover gets a "Comment CTA" switch under "Instagram caption", off by default. Off, the caption shows and posts plain: a call written into an older caption is left out. On, the call's line leads the caption once. That's their switch to flip, cover by cover.
3. Never write a call into a caption. A draft with one in it is refused; the switch is the only way in.

## 5b. uBee clients save in the uBee shared Drive (client mode)

Most creators save in their own Drive. A uBee client is different:

1. Set the workspace with `POST /api/workspace/configure`, mode ubee_shared, clientName set to their name.
2. Read the plan with `GET /api/drive/plan`. It points inside the uBee shared Drive, at Creators / their name / Cover Review, with friendly folders: "Start Here", "DUMP", "New To Review", "Images", "Videos", "Quotes", "Music", "Voice Profile", "Captions", "Approved - Her Picks", "Posted".
3. Create those folders in the shared Drive through the agency's Drive access, and keep them tidy for her to browse. Her approvals go in "Approved - Her Picks", finished work in "Posted", fresh work in "New To Review".
4. Never put a client's working files in their personal Drive, and never put one client's files in another client's folder.

## 6. Quotes

- The app ships with the uBee default pack: data/default-quotes.json, Arjang's Copy 2 stock, 397 quotes. Use it by default.
- If the creator drops their own quote list in DUMP, convert it to data/quotes.json as an array of strings or objects with a text field. That file outranks the default pack automatically.
- Never invent quotes and present them as stock. Generated captions are captions, stock quotes are stock.
- A toggle you send with `POST /api/items/:id/quote-toggle` sets that cover and leaves her default alone. Only her own switch in the app sets the default that carries over to covers she hasn't set (1.13).
- Quote over image starts OFF and locked. Offer the creator two ways to unlock it: connect their own quote list (POST /api/quotes/connect; add replace: true to swap her whole list for the one sent), or take the quote quiz in the app. The quiz pool (data/quiz-quotes.json) is generalized quotes only, Arjang specific quotes were filtered out before shipping, so what they steal sounds like them. If a creator flags a quiz quote as too specific, remove it from the pool and log it in the grievance resolution.

## 7. Ongoing jobs for you

- When new photos land in DUMP or "Images", queue them for review.
- When the creator approves in the app, mirror approved photos into the Drive "Approved" folder if Drive is connected.
- Keep trending fresh, keep the voice profile current as they post, and surface their saved notes back to them when they edit. A note like a body note or a crop note is an instruction for the edit, keep it attached to that photo.
- Report in short messages. One topic per message.
