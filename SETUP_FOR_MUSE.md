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
3. Pull their saved tracks or their chosen playlists through your Spotify connector and send them with `POST /api/connectors/spotify/sync-library` as tracks with title and artist.
4. From then on, song suggestions come from their library first.

## 5. Instagram: trending by default, captions only with consent

Trending, no consent needed:
1. Through your Instagram connector, check what songs are trending on Instagram right now for their niche.
2. Send them with `POST /api/trending/refresh` as songs with title and artist, plus a source note. Refresh this about weekly, or when they ask what is trending.
3. Until your first refresh lands, the app uses the seed file and says so honestly.

Voice profile, consent required:
1. Ask in plain words: can I read your previous Instagram captions so this app drafts captions that sound like you? Nothing gets posted, it only learns your voice.
2. Only on a clear yes, record it with `POST /api/connectors/instagram/consent` with captionConsent true and their handle.
3. Pull their recent captions through your Instagram connector and send them with `POST /api/voice/samples` as samples, with source set to instagram.
4. Tell them their voice profile is live and captions will now draft in their voice. They can paste extra writing samples the same way with source set to manual.

## 5b. uBee clients save in the uBee shared Drive (Damiana first)

Most creators save in their own Drive. A uBee client is different:

1. Set the workspace with `POST /api/workspace/configure`, mode ubee_shared, clientName set to their name.
2. Read the plan with `GET /api/drive/plan`. It points inside the uBee shared Drive, at Creators / their name / Cover Review, with friendly folders: "Start Here", "DUMP", "New To Review", "Images", "Videos", "Quotes", "Music", "Voice Profile", "Captions", "Approved - Her Picks", "Posted".
3. Create those folders in the shared Drive through the agency's Drive access, and keep them tidy for her to browse. Her approvals go in "Approved - Her Picks", finished work in "Posted", fresh work in "New To Review".
4. Never put a client's working files in their personal Drive, and never put one client's files in another client's folder.

## 6. Quotes

- The app ships with the uBee default pack: data/default-quotes.json, Arjang's Copy 2 stock, 397 quotes. Use it by default.
- If the creator drops their own quote list in DUMP, convert it to data/quotes.json as an array of strings or objects with a text field. That file outranks the default pack automatically.
- Never invent quotes and present them as stock. Generated captions are captions, stock quotes are stock.
- Quote over image starts OFF and locked. Offer the creator two ways to unlock it: connect their own quote list (POST /api/quotes/connect), or take the quote quiz in the app. The quiz pool (data/quiz-quotes.json) is generalized quotes only, Arjang specific quotes were filtered out before shipping, so what they steal sounds like them. If a creator flags a quiz quote as too specific, remove it from the pool and log it in the grievance resolution.

## 7. Ongoing jobs for you

- When new photos land in DUMP or "Images", queue them for review.
- When the creator approves in the app, mirror approved photos into the Drive "Approved" folder if Drive is connected.
- Keep trending fresh, keep the voice profile current as they post, and surface their saved notes back to them when they edit. A note like a body note or a crop note is an instruction for the edit, keep it attached to that photo.
- Report in short messages. One topic per message.
