# Porting a release into a ported space

A ported space runs its own server actions instead of server/index.js (for example, a Muse space). It doesn't
update itself, so its Muse brings each release in by hand. This file lists what each release adds, so nothing is
missed and nothing is lost.

Rules for every port:

1. Export every table first, as rows, and check the row counts.
2. Add new fields with their defaults. Never drop, rename or rebuild a table.
3. Old rows must read exactly as before: a missing field means its default.
4. Bring the client over whole (client/src, built with `npm --prefix client run build`), then map its calls to the space's actions.
5. Check her data is all still there, then post screenshots of the cover screen and the editor.

## 1.20.0: the text editor round of the Big Edit

Arjang's Big Edit list (Nov 23, room #877), items 1 to 9, 11, 17 and 19, as Quill batched them in #883. The reach of
item 1 is Arjang's answer in #886: every cover in the queue.

1. **One font and one color for the queue (item 1).** A font or a color picked on any queued cover is the whole queue's:
   every text box on every queued cover draws with it at once. It's kept as the queue's text lock, `textLock:
   { textFont, textColor }` in settings. Each cover keeps its own values on disk, and the lock draws over them while it
   waits in the queue. A cover that leaves the queue (approved, passed, or passed with Reject and revise) keeps the look
   it had: the lock is written into it and into its text boxes at that moment. Undo takes a pick back off the queue and
   redo puts it back. Approved and passed covers never change. The editor says so under the colors on a queued cover:
   "Font and color change on every cover in your queue."
2. **Her colors first (item 2).** Up to 12 colors of her own, set by her Muse, come first in the color row in her
   order, then the 11. A color in both shows once, as hers. One of them can be her default: until she picks a color,
   it's the queue's color. Picking one of hers doesn't add it to her custom colors.
3. **The editor opens on the photo she's on (item 3).** On a carousel photo it holds that photo's own text boxes, up to 5
   like the cover, and starts with none: "No text on this photo yet" and New text box. The text draws on that photo only,
   in the deck and in the magnifier, and a tap on it opens the editor on it. Face mosaic and Image contrast stay with the
   cover. Carousels still post as the cover alone, so a photo's text shows in the app for now.
   - On a computer, a click on the photo away from the text closes the editor. A tap on a phone doesn't, as before:
     there her thumb often lands just off the text while she works.
4. **Her own fonts (item 4).** A font file her Muse adds (TTF, OTF, WOFF or WOFF2, up to 8 MB) joins the font menu under
   its name, one face per weight. The files live in her data folder's `fonts/`, which git ignores, and open only signed
   in, like her photos. A font of hers draws under its own family name, so it never mixes with a font of the same name
   on her phone.
5. **Light works (item 5).** The weights are Light, Regular, Medium and Bold, and TikTok Sans Light now loads with the app.
   A font with no Light face greys Light out and says so, since it would draw as Regular.
6. **Justify width (item 6).** With Justify on, a Justify width slider moves both sides of the column in and out: the
   box's `textWidth`, 20 to 100%.
7. **Line spacing (item 7).** A Line spacing slider on every text box: the box's `textHeight`, 60 to 200% of the size.
8. **A color after a 50% preset (item 8).** Any color picked after White 50% or Black 50% brings the text back to 100%,
   however it's picked. An opacity set by hand on the slider stays.
9. **Hold and drag (item 9).** On the review screen, holding a text box lifts it and a ring shows around it. Her thumb, or
   the mouse, places it, and letting go saves the spot as one undo step ("Move text"). The editor doesn't open, and the
   page doesn't scroll while she places it. A hold let go without moving is still a tap (1.13.6) and opens the editor. In
   the editor, a press on any text box picks it and drags it at once.
10. **The last justified line (item 11).** Every justified row of two or more words runs edge to edge, the last row too.
    A row of one word starts at the left edge.
11. **Letting go of the zoom (item 17).** In the magnifier a pinch, or a trackpad pinch, zooms while it's held, and letting
    go puts the photo back to its normal framing, like Instagram. A double tap still zooms in and stays until the next.
12. **Text on the previews (item 19).** With the text overlay on, every preview in All covers (Queue, Approved and Passed)
    shows its text the way its cover draws it, the queue's look included. Hidden quotes are hidden there too. A preview
    draws its text once it's near the screen.

### Server

| Where | Change |
| --- | --- |
| server/brand.js (new) | The 11 colors and six fonts (moved from full.js, unchanged), her colors, the text lock, her fonts, and the routes for them |
| server/full.js | Text boxes keep `slide` and hold 5 on each photo; a font of hers is a font; Reject and revise writes the lock into the cover it passes |
| server/index.js | Decide writes the lock into a cover that leaves the queue; registers brand.js |
| server/store.js | `fontsDir`: her data folder's `fonts/` |
| .gitignore | `data/fonts/` |

What a space maps, new or changed:

- `GET /api/palette` also answers `brandColors`, `lock` (as she set it: `{ textFont, textColor }`, each null until she
  picks one) and `customFonts` (`[{ id, label, faces: [{ weight, url }] }]`). `fonts` lists her fonts' ids after the six.
- `POST /api/palette/brand { colors: [{ name, hex, default? }] }`: up to 12, each a name and a #RRGGBB, at most one
  default. An empty list takes them away.
- `POST /api/text-lock { textFont?, textColor? }`: only the fields sent change, and null takes one back (undo does that).
  A color that isn't one of the 11 or hers joins her custom colors, as before.
- `POST /api/fonts`, multipart: the `font` file, `label` (its name in the menu) and `weight` (100, 200 and so on to 900).
  The same name with another weight adds a face, and the same weight replaces it. Its id is `custom-` and the name as a
  slug. `GET /api/fonts/:file` sends the file, signed in.
- Decide, and Reject and revise: a cover leaving the queue gets the queue's font and color written into it and its text
  boxes (the lock as it draws: her last pick, or her default color).
- A text box may carry `slide`: the place of its carousel photo in the cover's `slides`. A box on a photo that isn't there
  is dropped, and each photo holds up to 5.

### Client

| Where | Change |
| --- | --- |
| renderCover.js | `lookOf`, `withLook`, `registerFonts`, `colorPatch` and `hasFace`; `textBoxes`, `drawCover` and `textHitBoxes` take `slideAt`; the justify rule |
| App.jsx | The queue's look on screen, lock changes in the undo stack, the editor on the photo she's on, hold and drag |
| CoverEditor.jsx | Light, Justify width, Line spacing, her colors first, the lock line, a carousel photo's own boxes and its empty state |
| CoverStage.jsx | Carousel photos drawn as canvases, taps and drags on any photo, a click off on a computer, hold and drag |
| CoverCanvas.jsx | `slideAt`: a carousel photo with its own text |
| ZoomView.jsx | Letting go puts the framing back; a carousel photo with its text |
| TileCover.jsx (new), LibraryView.jsx, ApprovedGrid.jsx | The previews' text |
| main.jsx | TikTok Sans Light |
| styles.css | The greyed Light, the lock line, the empty photo line, the lift ring, the previews' text |

### Data steps (her space, never the repo)

Her own colors and her own font are data. Her Muse sets them in her space: her colors with `POST /api/palette/brand`
(her default marked `default: true`), and her font with `POST /api/fonts`, once for each weight. Nothing else moves:
the covers' rows keep their own values, and the queue's look draws over them.

Checks after the port: the counts don't change. Settings gain `brandColors`, `textLock` and `customFonts` only when they
are set.

## 1.19.0: open calls as cards on the Beeline screen

Built by Claude (Beeline chat), room #861; folded in as 1.19.0 per Quill's #854 and #862. Client only: no server
actions, data, settings or tables, so the counts don't move.

1. **Open calls are cards.** Each decision waiting on Arjang shows as a card in its call's color: who opened it, how long
   ago, its title, and a description cut to two lines. A tap on the words shows the whole call and a link to the latest
   message about it.
2. **His answer.** Approve and Reject take two taps. Edit starts from the call's title, all selected, and Send posts his
   own words. × closes a call without an answer, also with two taps. Beeline posts the answer in the room as him
   ("Approved call N", "Rejected call N", or "Changed call N" with his words), closes the call and pokes the agent that
   opened it. An answered call stays off the cards while Beeline catches up.
3. **Hide** folds the cards into their numbers. The fold holds on that browser (`beeline.callsFolded`), and a number opens
   the cards at its call.
4. **It talks to Beeline itself**, like the rest of the screen (1.16.0): `POST /app/ask/decide` with `{ n, outcome, text }`,
   outcome approved, rejected or edited, sent with the device key. Nothing goes through this app's server or a space's
   actions.

### Client

| Where | Change |
| --- | --- |
| beeline/BeelineScreen.jsx | Calls and CallCard replace the old ask chips. Approve, Reject, Edit, × and Hide |
| beeline/beelineApi.js | decide, and callsFolded and setCallsFolded |
| beeline/beelineText.js | The decide route's refusals in plain words |
| beeline/beeline.css | The cards, scoped to .blRoot as before |

Checks after the port: the counts don't change. The screen brings over whole with the rest of client/src, and a space
whose pages can reach Beeline shows the cards once a device key connects it.

## 1.18.0: Chats labels follow her account, and Windows usernames

Arjang in the build chat and in room #840: "Everything and approve all open calls including Sync Chat labels, Windows
username fix, and everything else." It lifts the holds from Quill's #826 items 2 and 3.

1. **Chats labels follow her account.** A chat's label (Flag, Booked, Lead, Ordered, Paid or Shipped) is saved with the
   chat on the server, so every device and browser shows the same labels. Before 1.18.0 each browser kept its own.
2. **Old labels move up once.** The first time the Chats screen loads on a device, the labels that browser kept are sent
   up in one call. Each lands only on a chat with no label yet, so a saved label stays, and a chat that's gone or a label
   that isn't one of the six is skipped. Then the browser's copy goes. If the call fails, the next load tries again.
3. **Windows usernames.** Windows can't make a folder named after a device: con, prn, aux, nul, com0 to com9, lpt0 to lpt9,
   alone or before a dot. Such an account keeps its data in that name with a "~" after the device part (con~, lpt1~.studio),
   which no username can contain. A copy that already keeps one under the plain name (made on a Mac or Linux before 1.18.0)
   keeps using that folder. Everywhere the copy lists its accounts, the folder reads back as the username.
4. **The rest of the open list.** Upstream's reject and revise never adds " (remix)", so there's nothing to cap there (#830
   item 1 stands for a space's own copy). Cover 2's saved check reads in stock on its next verify (#830 item 2). The fork
   check is in the 1.18.0 report.

### Chats actions

| Action | Change |
| --- | --- |
| dm_listitems | Each item carries `label`: one of the six, or null |
| dm_setlabel | New. `{ id, label }`: one of Flag, Booked, Lead, Ordered, Paid, Shipped, or null or "" to clear. Answers `{ ok: true, label }`. 400 "label is missing." without the key, 400 for any other label, 404 for a chat that's gone |
| dm_importlabels | New. `{ labels: { <chat id>: <label> } }`, at most 5000. Fills only chats with no label, skips the rest, and answers `{ ok: true, imported }` |

Data: add a `label` column (text, may be empty) to dm_practice_items. No row is rewritten: every old chat reads as no
label until she sets one or a device moves its labels up.

### Server

| Where | Change |
| --- | --- |
| server/dm.js | LABELS, `label` on each item, setlabel and importlabels |
| server/store.js | folderOf and handleOfFolder; spaceDir uses the safe folder, and knownSpaces answers usernames. A space keeps data in tables, not folders, so item 3 has nothing to port there |

### Client

| Where | Change |
| --- | --- |
| dm/App.jsx | The inbox and the chat read `item.label`. Saving a label calls dm_setlabel, shows at once and goes back if the save fails. The Chats screen moves the browser's old labels up once after its first load. The label sheet says labels are saved with her account |
| dm/dmApi.js | setlabel and importlabels |

Checks after the port: the counts don't change. dm_practice_items has the new empty label column. On a test account
only: a label set on one device shows on another, clearing it there clears it here, and a browser's old labels move up
once onto chats with none.

## 1.17.1: the quote stock check reads quotes the original's way

Quill's #826, items 1 and 4. Server only: no client, data, settings or tables change, so the counts don't move.

1. **The stock check.** QUOTE_IN_STOCK compares the cover's quote with her stock the way the original's
   normalizeForStockCheck does (composeVerification.ts): lower case, curly quotes made straight, anything but a-z, 0-9
   and spaces made a space, runs of spaces made one, then trimmed. A stock entry with a double space, curly quotes or other
   punctuation now counts as it does in the original. It's one helper for the compose check and the remix pick's gate, so
   every copy of the stock test in a space should read quotes this way.
2. **The remix pick** reads her stock the same way: it never picks the quote the cover already has, however that quote is
   written, and it counts each quote once.
3. **A remix of a remix** keeps one " (remix)" on its title instead of adding another (#826 item 4).
4. Saved compose checks keep their result until they're checked again. Nothing is rechecked in bulk, and no row is rewritten.

### Server

| Where | Change |
| --- | --- |
| server/full.js | New: normalizeForStockCheck, exported. quoteInStock uses it, so verifyItem and the remix gate both do |
| server/remix.js | The quote pick leaves out the cover's own quote and repeats by the same reading. A remix title keeps one " (remix)" |

Checks after the port: the counts don't change, and the gate on covers 1 and 7 reads as before. Prove the double space
case on a test account only: a stock entry with two spaces between words, and a cover with the same words and one space,
reads in stock.

## 1.17.0: the remix menu

Rose's #796 and #797, Quill's #798 and #811. Remix opens a menu instead of making an instant copy.

1. **The menu.** The remix icon opens "Remix this cover": New quote and New song, each a button with a small prompt box
   under it, then Cancel and Submit. Submit stays off until one is ticked. Typing in a box ticks its button. Unticking
   keeps the words but leaves them out. Prompts are optional, 300 characters at most. While quotes are locked, New
   quote can't be ticked. Escape, Cancel and a tap off the menu close it and make nothing.
2. **The work runs in the background.** Submit closes the menu, and the cover she's on stays exactly as it is. A line
   under the icons says the remix is on its way and comes next, so she can go on and complete the next post.
3. **The pick, with no model (#811).** New quote: her prompt (counts 3), what the photo shows (2) and the cover's quote
   (1), word by word, against her own quote stock only, never the cover's current quote. New song: her prompt (3), the
   quote (2) and what the photo shows (1) against the songs folder (or Symphony online) with her hidden songs left out
   and her saved songs winning ties, else her Spotify library, else trending, never the cover's current song. Both
   ticked: the quote first, then the song against the new quote. Words are compared in lower case, without accents,
   common words or plain endings (s, ing, ed, e). With nothing to match, picks take turns. A space with a model may make
   the same pick with it, under the same stock, pool and hidden rules and the same gate.
4. **The gate.** A pick lands only when it passes its part of the compose gate: QUOTE_IN_STOCK for a new quote,
   SONG_IN_POOL for a new song. The new cover itself starts unchecked, like any new cover.
5. **The new cover.** A new queue row with the same photo: revision plus one, parent the cover she remixed, the title
   with " (remix)", and everything the old instant remix copied (layout, text style and color, slides, photo edits, her
   note), plus the picks. What was about the old quote or song doesn't carry: why it matches, and the stars of the part
   that changed. A new quote gets a fresh offline caption draft (captionSource placeholder), and it shows, even where
   she had turned the old cover's quote off. No Pollen booking and no compose check carry over, as before.
6. **Next in the queue (#797).** It lands right after the cover she remixed. When the page sees it done, it moves it
   right after the cover she's on (to the front of the queue when she's off the queue screen), so it comes next even
   when she completed another post while it was made, and she stays where she is.
7. **When it can't pick.** No row lands and the slot is free. The page says why, and the cover she remixed keeps a note
   until her next remix of it.

### Server

| Action | Change |
| --- | --- |
| POST /api/items/:id/remix | Now `{ quote: { on, prompt }, song: { on, prompt } }` with at least one on: 400 "Tick New quote, New song or both." when none is, 400 for a ticked prompt over 300 characters, 404 for a cover that isn't there. Answers `{ remix }` (status pending) right away and makes it in the background. The old instant copy is gone |
| GET /api/remixes | New. `{ remixes }`: the ones the page hasn't placed or shown, each `{ id, sourceId, quote, song, status, itemId, error, createdAt, finishedAt }` with status pending, done or failed. One a restart left pending starts again here |
| POST /api/remixes/:id/ack | New. `{ after }`: a done remix's cover moves right after that cover, or to the front of the queue when after is null or not there; a failed one has been shown. Either way it leaves the list. 409 while it's still pending, 404 when it isn't waiting. Answers `{ remix }` with placed |

Data: add a `remixes` table (id, account, source_id, quote and song as json, status, item_id, error, created_at,
finished_at); done and failed rows go once acked. Add `last_remix` (json, may be empty) to photos: `{ status: "failed",
error, at, remixId }`, set by a remix that can't pick and cleared by the next remix of that cover. No existing row is
rewritten. Upstream these live in server/remix.js, and full.js now exports revisionOf, quoteInStock and songInPool
(verifyItem uses the same two tests). A space whose actions can't run work after answering may make the pick inside the
remix action and answer it already done: the page places it the same way.

### Client

| Where | Change |
| --- | --- |
| RemixSheet.jsx | New. The menu |
| App.jsx | Remix opens the menu. While a remix is made, the page asks GET /api/remixes every 1.2 seconds, acks each finished one with the cover on screen, then reloads in place. The line under the icons, and the note on a cover whose remix didn't land |
| CoverDetails.jsx | The remix button is named "Remix this cover" and opens the menu |
| styles.css | The menu, the line and the note |

Checks after the port: the counts don't change from the port itself. Then prove, on a test account or a copy of her
space and never with her rows (every remix is a new photos row, #798 step 7): Submit stays off with nothing ticked,
typing ticks its button, New quote, New song and both each land right after the cover, and the remix comes next even
after she completes another post while it's made.

## 1.16.0: the Beeline screen

Arjang's ask of Nov 20 (09:23), Quill's #772, #774 and #778. Client only: no server actions, data, settings or tables,
so the counts don't move.

1. **A third screen.** The switch reads Covers, Chats, Beeline. Beeline loads the first time it's opened, stays
   mounted like Chats, and makes no calls while another screen shows or the page is hidden.
2. **It talks to Beeline itself.** The screen calls Beeline's /app routes straight from the browser
   (client/src/beeline/beelineApi.js), with a device key Arjang makes on his Beeline page. The key lives in that
   browser's storage only, saved for the account signed in there (`beeline.device:<handle>`, 1.15.0), so another
   account on the same browser gets the Connect card and never the key. It never goes to this app's server, its data
   files or a space's actions. Photo, video and file links are signed by Beeline for an hour or two and carry no key.
3. **Every copy has it.** Until a key connects it, the screen is a card that says how to connect. A space brings the
   screen over with the rest of client/src and maps nothing, since no call goes through the space.
4. **The room.** Who's in and what each one is doing, the messages with their photos, videos and files, reactions,
   highlights (yellow for his name and for words marked for him, each open ask in its own color until it closes), the
   open asks, pokes, and posting words, photos, videos and files. Pausing, closing, invites and key resets stay on his
   Beeline page.
5. **The bottom of the screen.** It ends above the Muse app's tab bar on a phone (--host-bar), like the rest of the app.

### Client

| Where | Change |
| --- | --- |
| client/src/beeline/ | New. BeelineScreen.jsx, beelineApi.js (the /app calls and the key), beelineText.js (highlights, asks and poke wording) and beeline.css, scoped to .blRoot |
| main.jsx | the third switch button and the lazy Beeline screen |
| icons.jsx | attach and file |

Checks after the port: the counts don't change, the switch shows Covers first with Chats and Beeline after it, and
Beeline shows its Connect card. A space whose pages can't reach https://evmqkvnclbqcijlyezrr.supabase.co (its fetch
or CSP rules) shows "Can't reach the Beeline." on Connect; report that rather than routing the calls through the
space. With a key from Arjang's Beeline page, the room loads. Also: App.jsx no longer imports useLayoutEffect, as
her space already has it (Rose #803).

## 1.15.0: sign in by Instagram username, and each account's own data

Room #735, ruled in #742 with Arjang's #739 and Symphony's #737. A sign-in screen comes first: one field, her Instagram
username, and Continue. No password: anyone who types a handle opens that account. That is fine for a closed test and
is not real security. Every account sees only its own covers, photos, quotes, quiz answers, grievances, Chats and
settings. Everyone gets the copy's shared music library, with their own Save and Hide on top.

1. **No row is rewritten.** Export every table and count (rule 1). Add an `accounts` table (handle, unique; created_at;
   owner, true on one row) and a `sessions` table (token_hash, unique; handle; created_at; last_seen_at). Add an
   `account` column that may be empty to photos, my_quotes, quiz_verdicts, grievances, settings and the dm_ tables. A row
   with an empty account belongs to the owner, and rows made after the port carry their account. In her space the owner
   is the handle Arjang named in #739: add it to her space's accounts with owner true. It goes in her data only, never in
   a repo. Undo: drop the new tables and the new column; the old rows were never touched.
2. **Counts after the port**, all under the owner, and another handle sees none of them: photos 173 (queue 170,
   approved 2, rejected 1), my_quotes 78, quiz_verdicts 66, grievances 1, settings her space's live count,
   dm_practice_items 8.
3. **The session actions.** `GET /api/session` answers `{ signedIn, handle, owner, restrictSignups }` and renews the
   cookie. `POST /api/session { handle, claim? }` signs in and answers the same with `token`, making the account on its
   first sign-in. `DELETE /api/session` ends the sessions it carries and clears the cookie; nothing of hers is deleted.
   The handle is cleaned the way Instagram has it: no @, lower case, 1 to 30 letters, numbers, periods or underscores,
   no period at either end and never two in a row. Anything else answers 400 with "That isn't an Instagram username.
   Use 1 to 30 letters, numbers, periods or underscores."
4. **The token.** 32 random bytes, base64url. Keep only its sha256 hash. The cookie is `cr_session_<port>`, named for the
   copy's port so two copies on one computer never share it (Path=/, Max-Age 400 days, HttpOnly, SameSite=Lax, Secure
   on https), renewed by every visit, so a used session never runs out. The
   page keeps a copy in its storage (`cr-session`) and sends it as `Authorization: Bearer <token>`, which is what keeps
   her signed in on a host where cookies don't get through.
5. **The owner of what was saved before accounts.** Upstream: the handle in that data's Instagram connector; else, when
   there are old covers or quotes, the first new handle answers `{ needsClaim: true, counts: { photos, quotes } }` and
   the page asks "This copy has N photos and M quotes saved before accounts. Are they yours?" (claim true makes the
   owner, false an empty account); on a copy with nothing saved, the first sign-in is the owner. Her space already has
   its owner from 1, so the question never shows there.
6. **Sign-ups.** Open by default. `POST /api/accounts/signups { restrict }` is the owner's switch: on, a handle the copy
   doesn't know answers 403 with "This copy isn't taking new sign-ups. Ask its owner." Store it with the accounts.
7. **Every action scoped.** Every read and write of personal data goes through the signed-in account, and a photo's
   address opens only for its own account. Without a session every action answers 401
   `{ error: "Sign in first, with your Instagram username.", signedIn: false }`, except the session actions, the update
   status, the page's activity, and a health check that says nothing personal.
8. **What the copy shares.** The quote pack, the quiz pool, the trending list, the Symphony connection, the songs
   folder, the updater and the 1.13.9 recheck tally are the copy's, read from the owner's rows for everyone. Only the
   owner changes the Symphony connection and the songs folder (403 "Only this copy's owner can change that."). A
   trending refresh by any other account is that account's own list on top of the shared one.
9. **Save and Hide** (Symphony #737). Per account, keyed by Symphony's song id (`^[a-z0-9][a-z0-9-]{0,119}$`), a song
   is saved or hidden, never both. `GET /api/music` answers `{ saved, hidden }`; `POST /api/music/save` and
   `/api/music/hide` take `{ id, on }` and answer the same; `GET /api/symphony` adds `music`. Picks: a hidden song is
   never picked. A new cover takes one of her saved songs in turn (by cover number) when she has any, else picks as
   before. Shuffle with saved songs takes the song after the cover's own in her saved songs then the rest, each in the
   feed's order, and starts over after the last; without saved songs it picks as before.
10. **Client.** Bring client/src over whole: session.js, SignIn.jsx, the gate in main.jsx, the header in api.js, the
    Account section of the info sheet (Log out, and the owner's sign-up switch), and Save, Hide, Saved and Hidden on
    the Songs screen. Chats keeps the owner's labels on this device under the same key as before.
11. **Check after the port**: the counts in 2, then screenshots of the sign-in screen, the cover screen after signing
    in, the Account section and the Songs screen's Hidden list.
## 1.14.1: the cover edge to edge, the magnifier by the pencil, play without moving the cover, Color lock

Arjang's #790, ruled in Quill's #793. Client only: no new field, setting or action, so no data moves and the counts
stay as they are.

1. **Edge to edge.** The 1.13.4 phone fit is gone (the `pointer: coarse` rule on `.stage` and the page's `--fit-h`
   measurement). The cover fills the app column at 4:5 on every screen.
2. **The magnifier.** Its button left the photo and sits in the action row, right before the pencil, with the same
   label ("Zoom in on the photo") and the same zoom. Nothing sits on the photo.
3. **Play.** The Spotify card opens right above the song row (absolutely placed in `.songWrap`), and while it's open
   the header and the Review deck / Story view switch move up and out (`.away`, inert). Nothing in the page's flow
   changes, so the cover keeps its exact place and the page doesn't scroll. 1.13.7's scroll that held the row in place
   is gone.
4. **Color lock** sits on Randomize layout, on by default: a randomize changes the layout only. Off, each randomize also
   picks a new text color from the 11 palette colors, never the one already on the cover. Tapping Color lock only
   switches it. It's kept for the page's session.
5. **Check after the port**: screenshots of the cover screen at a phone's width (the cover edge to edge, the glass left
   of the pencil), the same with the Spotify card open (the cover in the same place), and Randomize with Color lock off.

## 1.14.0: Chats, the DM reply simulator

Arjang's #570 and #575, Quill's #581 and #584, built from Rose's #580 scrub spec, rebased onto 1.13.10, with the
standalone simulator's fixes folded in (Quill #725, Rose #738 and #770). The Reply Practice Simulator is
upstream now: a Covers or Chats switch above both screens, and the Chats screen with its inbox, chat view, Ready to
Publish, Add, Training and Voice tabs. Upstream ships it empty: no voice, offers, people, photos or messages. Her Muse
fills them in.

1. **The routes.** One `POST /api/dm/<name>` per action, with the same names, arguments and answers as a space's dm_
   actions (listitems, createitem, generatedraft, savereview, publishitem, confirmpublish, revealactual, deleteitem,
   exporttraining, getvoiceprofile, savevoiceprofile, resetvoiceprofile). The space's seed and one-thread fix actions
   held its own messages, so they aren't here.
2. **No model.** generatedraft marks the item as waiting (`draft_wanted` on the item, `wanted: true` in the answer),
   and her Muse drafts it through draftswanted and savedraft. A space with a model drafts in generatedraft as before:
   it never sets draft_wanted, and the screen reads a missing draft_wanted as false.
3. **Send hands off.** publishitem saves her answer and marks it publishing, like the space's action, without starting
   anything. Her Muse sends it through publishwanted and reports with confirmpublish. A space that hands the text to
   its own agent in publishitem keeps doing that.
4. **Her voice is data.** The condensed rules and the Voice tab's starting sections live in settings (savevoicesource,
   getvoicesource), empty by default. A space whose rules are constants in its code keeps them there.
5. **The account.** getaccount answers the handle the Ready to Publish screen names, from the Instagram connector, or
   null.
6. **The client.** client/src/dm/App.jsx is the space's dm/App.tsx without its types, its calls go through
   client/src/dm/dmApi.js, and client/src/main.jsx is the switch shell. The Chats screen's Tailwind classes are
   compiled into client/src/dm/dm-tw.css (scripts/dm-css.mjs, Tailwind 4.1.13), scoped to .dm-root. Chats loads the
   first time it's opened. No profile photos ship: avatars are the monogram, and profiles are empty.
7. **The version and the update notes sit above both screens** (1.13.10's, moved up into main.jsx's switch), so Chats
   shows the version and the notes too. Covers says when its editor or a sheet is open through client/src/busy.js; a
   text box with the cursor in it counts as busy on either screen.
8. **The voice's version.** Each draft is stamped with the version of her voice it was written under
   (draftVoiceVersion): djb2 over JSON.stringify of the Voice tab's sections as saved (else the starting profile),
   written v plus 8 hex (voiceVersion in server/dmRules.js). Items answer draft_voice_version and voice_stale.
9. **Drafted again on opening, once.** openthread `{ id }` answers `{ item, regenerated, wanted }`. A pending,
   unpublished draft written under an older voice is drafted again in her voice as it is now: here her Muse is asked
   (draft_wanted, variant fresh) and the old draft shows until the new one lands; a space with a model redrafts at
   once and answers regenerated: true. Approved, edited and published drafts never change on their own: the chat
   shows "Voice changed since this draft", and Again in Advanced redrafts one on purpose. The inbox never drafts.
10. **The ending cap.** A draft's endings are held to the !! rule her voice states (bangRuleOf and capEndings in
   server/dmRules.js), when the draft is saved (savedraft here; generatedraft in a space with a model). The first line
   holding "!!" is the rule, "N in M" on it the rate (1 in 5 when none is given). An ending is a run of two or more !,
   or with a rule, a run of emoji after words. floor(lines x N / M) of them keep their mark, never every line of a
   longer draft, the earliest first; the rest lose the mark with nothing in its place. With no rule, every !! ending
   goes and emoji stay. Her own revisions and sent texts are never changed.
11. **Story replies.** When the last message from them is a story reply with words, those words are the incoming
   message. With no words and "replied to your story" as the message, the item is flagged story_reply_not_captured:
   the chat shows "They replied to your story. The words of that reply weren't captured when this chat was imported,
   so there is no message text to show here." in place of the bubble, and the draft prompt says the words weren't
   captured instead of passing the placeholder off as theirs. updatethread `{ id, thread_messages }` takes a later
   import, which recovers the words when it carries them. The standalone's note has a long dash; here it's two
   sentences, by the house rule.

For a space that already has the simulator, its bridge maps `/api/dm/<name>` to `dm_<name>` with one rule, and the
dm/ client files come over whole like the rest of client/src. Its own people (profile photos, profiles, the handle the
screen names) are its data and stay space-only as a standing adaptation. Its dm_ tables and their rows don't change.

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/dm/listitems ... resetvoiceprofile | New. The twelve actions above, the same arguments and answers. Items also carry `draft_wanted` |
| POST /api/dm/getaccount | New. `{ handle }`, the Instagram connector's handle without the @, or null |
| POST /api/dm/getvoicesource, savevoicesource | New. Her condensed rules and the Voice tab's starting sections, for her Muse |
| POST /api/dm/draftswanted, savedraft | New. Drafts waiting for her Muse, with the exact system and prompt text, and her Muse's draft back |
| POST /api/dm/publishwanted | New. Approved texts waiting for her Muse to send, the order she tapped Send |
| POST /api/dm/openthread | New. `{ id }`, called when a chat opens; answers `{ item, regenerated, wanted }` |
| POST /api/dm/updatethread | New. `{ id, thread_messages }`, a later import of a thread, for her Muse |
| POST /api/dm/savedraft, createitem, listitems | savedraft caps endings and stamps the voice; createitem keeps a story reply's words; items carry draft_voice_version, voice_stale, story_reply_not_captured |

### Data

| Where | Change |
| --- | --- |
| data/db.json | New dmItems (the items) and dmNextId; items gain draftVoiceVersion and storyReplyNotCaptured |
| data/settings.json | New dmVoice (rules and starting sections) and dmVoiceProfile (her Voice tab edits) |

Checks after the port: the counts don't change, the switch shows Covers first, Chats lists her items as before, a
draft and a send work end to end, and the Voice tab shows her saved sections. For a space that already has the
simulator, its dm_ items gain the two fields at their defaults (no stamp reads as stale, so her pending drafts are drafted
again as she opens them); report how many pending drafts are stale before and after, and that approved, edited and
published drafts are unchanged.

## 1.13.10: the app updates itself, and the version shows at the top

Arjang's #729, Quill's #703, #733, #745 and #746. No new fields, settings or tables. One new action and client changes.

1. **The version at the top.** BUILT_VERSION, plain x.y.z from package.json at build time, shows small at the top right
   of the app column on every screen: the cover screen, the editor, Covers and Songs. It's words only, so presses go
   through it. An open sheet, the magnifier or the song screen covers it like the rest of the page.
2. **A git copy updates itself at a quiet moment.** When GitHub has a new version, the app installs it once no page has
   an editor, a sheet or a text box open, and nothing was tapped, typed, scrolled or wheeled on any page for 60
   seconds. A page with something open says so at once, then every 20 seconds, and each word holds for 45 seconds. The
   minute starts when the app starts, so an open page can speak up first. The app looks for that moment every 15
   seconds. The steps are UPDATE NOW's: back up the data files to data/backups (the last 10 are kept), set a Muse's
   local changes aside, pull, reinstall, rebuild and restart. An open page follows it and reloads itself once the new
   version answers, or right after she closes what she has open. Meanwhile a small note says the version is ready,
   with Update now.
3. **A failed update.** If the install or the build fails, the old version goes back on disk (the old commit, the
   Muse's local changes from the saved patch, then reinstalled and rebuilt) and keeps running. The page says
   "Couldn't update to X. You're still on Y, and nothing was lost." with the reason and Try again. That version isn't
   tried again on its own: Try again, a restart of the app, or a newer version tries again. A failure to reach GitHub
   changes nothing on disk.
4. **A copy without git** (her space) says "Version X is out. Your Muse brings it in.", with a small Copy the ask link
   in case a port was missed. The big UPDATE NOW banner and the line to copy are gone: her Muse brings each public
   version in on arrival (Quill #733).

### Server actions

| Action | Change |
| --- | --- |
| POST /api/activity | New. `{ busy, idleMs }` from the page: busy counts only when it's exactly true, and odd values only put an update off |
| GET /api/update | also answers boot (a new id on every start) and failed: `{ from, to, commit, at, auto }`, or null |
| POST /api/update/apply | a tap always tries, even a version that failed on its own |

The page sends activity only when /api/update answers git: true, so a ported space needs no new action.

### Client

| Where | Change |
| --- | --- |
| App.jsx | the version tag; inUse (the editor, the info sheet or the schedule sheet open) for UpdateBanner |
| UpdateBanner.jsx | small notes in place of the big banner; activity; following an update and reloading when she's free; the hosted note with Copy the ask |
| styles.css | .versionTag, .srOnly and the note variants |

**For her space:** no data changes. After the port, the version shows at the top, and a new public version shows the
small note until it's ported. Re-verify the counts unchanged.

## 1.13.9: the T icon, quotes on by default

Arjang's direction in Rose's #693 and #694, Quill's #695, #696, #707, #719 and #725. One new field on the cover
(beaconsVersion), one new setting (beaconRecheck) and two new actions, for the one-time recheck. Everything else reuses
showQuote and showQuoteSet on the cover and 1.13.3's quoteOverlay setting. Only saved compose checks are rewritten.

1. **The rule** (quoteOverlay.js, read by the server too). Every post shows its quote unless she turned it off for that
   post: an unmarked post (no showQuoteSet) shows it, whatever its showQuote says. Global hide (quoteOverlay false) hides
   every quote and never writes a post. Unset brings each post's own choice back. True is still taken but no longer
   forces quotes on, so a post she turned off stays off.
2. **The T icon** sits left of the pencil. On: the T in a green circle. Off: the T with a slash, grey like the others. A
   tap turns this post's quote off or on, marked, for this post only. It's a cover edit, so undo puts back exactly what
   was there, mark included. A hold of 1000 ms (HOLD_MS in CoverDetails.jsx, the original's deck and quote holds)
   toggles global hide, and a shorter press is a tap. A hold never also counts as a tap, isn't a step for undo, and
   Shift+Enter does it from a keyboard. A tap under global hide still sets that post's own choice, and the screen stays
   hidden until the hold lifts.
3. **What's gone.** The editor's "Quote on all covers" switch, and 1.13.0's carry-over: the default is fixed on, never
   learned. The server drops quoteDefault from quotes/status, and an old page's `{ from: "default" }` call changes
   nothing.
4. **The toast** lets a press go through it, so it never sits on top of the T icon.
5. **The one-time recheck.** A compose check saved before 1.13.9 was made when every post started with its quote off,
   so an unmarked post can carry QUOTE_IN_STOCK null (NOT NEEDED) for a quote it shows now. New field
   **beaconsVersion** (number; a missing field reads as 0): every check now stamps 1. Each cover with saved beacons and
   no stamp, whatever its status, is checked once more: idle, one cover at a time, the one on screen last. Beacons
   only, never showQuote or any other choice of hers, the way 1.13.3's switch rechecks: a cover that stays verified
   keeps its composeAttestedAt. Only a cover whose check changed is patched on the page. A cover that fails keeps its
   saved check and is tried on the next load. The tally, **beaconRecheck** in settings, counts the covers rechecked,
   the covers whose check changed and the beacon values that changed.
6. **The quote lock on the server.** Until she connects quotes or keeps one from the quiz, the page draws no quote, so
   the server reads none as shown: QUOTE_IN_STOCK is null and the caption prompt reads no text on the cover. Unlocking
   (the first connect, or the first quote she keeps) checks every checked cover again, beacons only.

### Server actions

| Action | Change |
| --- | --- |
| POST /api/items/:id/quote-toggle | `{ showQuote, set }`: set false takes the mark off (undo). `from: "default"` answers `{ applied: false }`; `from: "switch"` saves no default |
| GET /api/quotes/status | no quoteDefault |
| POST /api/settings/quote-overlay | unchanged; false is global hide, null unsets it |
| POST /api/items/:id/verify | also stamps beaconsVersion 1; a quote counts only when quotes are unlocked |
| GET /api/beacons/wanted | New. `{ ids, recheck }`: covers with saved beacons and no stamp, by id, and the tally `{ rechecked, coversChanged, valuesChanged }` |
| POST /api/items/:id/recheck | New. `{ rechecked: true, changed, item }`, changed naming the beacons that changed; `{ rechecked: false, reason: "done", item }` for a stamped cover or one with no check |
| POST /api/quotes/connect, /api/quiz/decide | when they unlock quotes, every checked cover is checked again |
| GET /api/items/:id/caption-prompt | a quote counts only when quotes are unlocked |
| POST /api/items/:id/remix | the copy carries no beaconsVersion, like no beacons |

### Client

| Where | Change |
| --- | --- |
| quoteOverlay.js | the rule: globalHide, ownQuote, quoteShown |
| CoverDetails.jsx | QuoteButton (the T icon) in the action row, HOLD_MS 1000 |
| App.jsx | tap and hold handlers; the recheck pass (recheckSavedChecks, run before the placement pass); the carry-over and the editor switch's undo path are gone |
| CoverEditor.jsx | the switch is gone; the locked hint stays |
| icons.jsx | textOff |
| styles.css | .quoteBtn and .quoteMark; .toast lets presses through |

### Data

| Where | Change |
| --- | --- |
| data/db.json | items gain beaconsVersion when they're checked or rechecked |
| data/settings.json | New beaconRecheck, the tally |

**For her space:** her space has 1.13.3's switch and no 1.13.0, and her quotes are unlocked, so the lock changes
nothing there. After the port, every cover she never toggled shows its quote, and the recheck runs once over every
cover with a saved check. Report that display effect, the tally (rechecked, coversChanged, valuesChanged), and the
counts re-verified unchanged.

## 1.13.8: default text placement, from the original

Arjang's #559 item 6, Quill's #685, #687 and #689. One new field, four new actions, and client changes. Read all of it
before porting: the drawing changes on every cover, and the pass can move text on every cover in her queue.

1. **Lines on Auto.** lineCount 0 now draws the original's estimate as balanced rows: her typed line count when she
   typed more than one line, otherwise the characters / 20, rounded, at least 1 and never more than the words. Her
   typed breaks are balanced like any space. This changes the drawing of every cover on Auto, approved ones too (the
   original has no freeze), and the posted JPEG follows.
2. **The deck's safe hold.** On the cover screen, the magnifier, Download and the posted JPEG, a text box she hasn't
   dragged on this cover this session is held inside the safe rectangle: its column clamped by its half extents, and
   scaled down, never up, when it's too big. The story view never holds. The stored position isn't rewritten.
3. **Free for the session.** A drag past 3px lets that box go: the photo's edge is its only limit until the cover
   changes or the page reloads. Nothing is saved for this (the original's positionedTextIds).
4. **Crossing locks.** While she drags, a block's edge catches on a safe edge only when it crosses it, holds until she
   pulls 8px past, then lets go. A drag that starts with an edge within 1.5px of a safe edge starts caught.
5. **The placement pass.** New field **textPlacementVersion** (number, default 0; a missing field reads as 0). Each
   queue cover with no stamp gets one pass: idle, one cover at a time, off-screen covers first, the one on screen
   last. A model looks at the photo and answers where the quote goes. The client fits the answer with the real text
   sizes and saves it, which stamps the cover with 1, even when nothing needed to change. Only the center, the
   alignment, the size and the line count ever change. An open draft is never touched. A cover that fails is tried
   again on the next load. Approved covers are never part of the pass.

### Server actions

| Action | What it does |
| --- | --- |
| GET /api/placements/wanted | ids of queue covers whose textPlacementVersion is under 1 |
| GET /api/items/:id/placement-prompt | the rules for a model, the photo's address, and whether the cover is wanted |
| POST /api/items/:id/placement-fill | upstream answers `{ placed: false, reason: "no-model" }`, or `"done"` for a cover that isn't wanted |
| POST /api/items/:id/placement | `{ fields }` or `{ fields: null }`: saves only horizontalPosition and verticalPosition (0 to 100), textAlign, fontSize (8 to 110) and lineCount (1 to 8), then stamps 1. A cover that isn't wanted answers `{ saved: false, reason: "done" }` |

**In her space,** map placement-fill to her Muse's model call: send the photo with placement-prompt's prompt, and answer
`{ reason: "answer", answer: { needsChange, horizontalPosition, verticalPosition, textAlign, fontSize, lineCount }, item }`.
Without that mapping, her covers keep the drawing in points 1 and 2 and nothing is stamped. Once it's mapped, every
cover in her queue with no stamp gets a pass. If her queue needs staging at port time, that's a port-time call.

### Client

| Where | Change |
| --- | --- |
| renderCover.js | estimatedLineCount; coverLayout draws Auto as balanced rows and takes `{ safe }`; drawCover, textHitBoxes and renderCover take the hold; normalizePlacement; wrapText removed |
| safeLock.js | new: the crossing locks |
| CoverStage.jsx | the hold on the deck, crossing locks while dragging, a drag past 3px frees the box |
| CoverCanvas.jsx, ZoomView.jsx | pass the hold through |
| CoverEditor.jsx | the Auto count without a canvas is the same estimate |
| App.jsx | the placement loop, and the session's freed boxes, cleared on another cover |

Checks after the port: the counts don't change, and no cover is stamped until placement-fill answers. Covers on Auto
redraw in even lines, and text near an edge sits inside the safe area on the cover screen.

## 1.13.7: play opens the Spotify player above the song row

Arjang's #559 item 5, Quill's #681. Layout only: no new fields, settings or actions, and play, close and what the
player does inside are unchanged.

1. **Above the song row.** Spotify's card now sits above the song row instead of between it and the cover.
2. **The song and the cover stay put.** When the card opens, the page scrolls by its height (90px with its margin),
   so the song row and the cover stay where they were on screen and the area above moves up. The header still
   sticks, so the card's top can sit under it. Closing the card, or moving to another cover while it's open,
   scrolls back the same way. A small HoldPlace wrapper in CoverTop.jsx does this: it reads where the song row sits
   just before the change and scrolls by however far it moved.
3. **The cover keeps its size.** On a phone, the 1.13.4 fit leaves the card out, so play no longer shrinks the cover.

### Client

| Where | Change |
| --- | --- |
| CoverTop.jsx | HoldPlace; the card renders above the song row |
| App.jsx | the phone fit leaves the Spotify card out |
| styles.css | a repeated `.app.editing .topbar` line from 1.13.5 removed (same rule, no change) |

Checks after the port: the counts don't change. With a Spotify song on a phone, play opens the card above the song
row, and the song row and the cover don't move or shrink.

## 1.13.6: holding the cover selects nothing

Arjang's #559 item 4, Quill's #676. One CSS rule: no new fields, settings or actions, and no code change.

1. **The cover and the magnifier.** `.stage`, `.zoomView` and everything inside them get `user-select: none` (with
   its `-webkit-` form) and `-webkit-touch-callout: none`. Holding down on the cover, a photo slide, the slide counter
   or the zoomed photo no longer selects anything blue or opens the iPhone's callout menu.
2. **Taps and gestures don't change.** A hold that lifts without moving is still a tap: on the quote it opens the
   editor. Dragging a text box or a Face mosaic box, swiping the slides, the color picker, and the magnifier's pinch,
   drag and double tap all work as before.
3. **Fields keep selection.** The rule stays on the cover and the magnifier. The editor sheet, the caption and the
   note sit outside both, so their fields select and edit as before. No rule covers the whole page.

### Client

| Where | Change |
| --- | --- |
| styles.css | `.stage, .stage *, .zoomView, .zoomView *` select nothing and open no callout menu |

Checks after the port: the counts don't change. On her phone, holding the cover or a photo slide turns nothing blue
and opens no menu, a held tap on the quote still opens the editor, and text in the editor still selects.

## 1.13.5: undo and redo inside the editor

Arjang's #559 item 3, Quill's #670. The editor sheet has its own Undo and Redo at its top left, on the same stack as
the header's. No new fields, settings or actions, and what a change records is unchanged.

1. **One stack.** The sheet's buttons call the same step("undo") and step("redo") as the header's. There is no second
   history. Both pairs read canUndo and canRedo from the same stack, so they always show the same state.
2. **With the editor open.** step() used to wait until the editor closed. Now her change still waiting to save is saved
   first, so it's the step that comes off. A step for the cover being edited runs in place, and the editor shows the
   cover as it now is. A step for another cover, or a decision (like or pass), closes the editor first and runs the
   way it always did.
3. **The header.** Its Undo and Redo follow the stack with the editor open too, and sit above the sheet's backdrop so
   they can be tapped. Back, the queue pill and info still wait for the editor to close. Keyboard shortcuts don't
   change: they still wait for the editor to close.
4. **The history** gains peek(direction): the step undo or redo would take next, without taking it.

### Client

| Where | Change |
| --- | --- |
| undo.js | peek(direction) |
| App.jsx | step() works with the editor open; applyChange answers the item it changed; editorCopy and refreshDraft; the sheet gets history |
| EditorSheet.jsx | Undo and Redo at the top left (.sheetHistory), from its history prop |
| CoverTop.jsx | Undo and Redo follow the stack, not the editor |
| styles.css | .sheetHistory; the sheet's handle is 44px tall; .app.editing .topbar above the backdrop |

Checks after the port: the counts don't change. In the editor, a change then the sheet's Undo takes it back and the
editor stays open; the header's Redo puts it back; both pairs show the same state the whole time.

## 1.13.4: one row under the cover, and Randomize layout on a phone's first screen

Arjang's #559 item 2, Quill's #660. Layout only: no new fields, settings or actions, and slides and covers move exactly
as before.

1. **One row.** The Slides row and the Posts row are one row: the cover arrows (Previous cover, Next cover) at the two
   ends, and the slides stepper (Previous slide, Add a slide, Remove this slide, Next slide) centered between them.
   Steppers in CoverDetails.jsx, .navRow in styles.css.
2. **The first screen on a phone.** The page measures the room above the cover and the rows under it down to Randomize
   layout, and on a phone (pointer: coarse) the cover sizes itself so Randomize layout ends above the Muse tab bar
   (--host-bar). It keeps 4:5, stays centered, and never gets narrower than 260px, so on a very small phone Randomize
   can still sit below the first screen. On a computer the cover keeps its full width. The measuring is a layout
   effect in App.jsx that sets --fit-h on .app, and the rule is .stage under pointer: coarse in styles.css.
3. **Randomize layout** is a little shorter (46px) with less space above it. Its action doesn't change.

### Client

| Where | Change |
| --- | --- |
| CoverDetails.jsx | Steppers is one .navRow: cover arrows at the ends, the slides stepper centered |
| App.jsx | Measures the room for the cover (--fit-h on .app); Randomize layout gets a ref and the randomize class |
| styles.css | .navRow replaces .stepRow, .stepLabel and .postsRow; .outlineBtn.randomize; the .stage rule for phones |

Checks after the port: the counts don't change. On her phone, the cover arrows and the slides stepper share one row,
and Randomize layout shows without scrolling, above the tab bar.

## 1.13.3: one switch for every cover's quote

Arjang's #621 and #630, Quill's #624. The quote switch in the editor shows or hides the quote on every cover at once.
It starts unset, so landing it changes nothing on screen until she uses it.

1. **The setting.** quoteOverlay: true, false, or not set. `GET /api/quotes/status` answers it as quoteOverlay, null
   when it isn't set.
2. **What shows.** Set, it decides for every cover. Not set, each cover's own showQuote decides, with 1.13.0's
   carry-over default underneath, unchanged. The rule is quoteShown(item, overlay) in client/src/quoteOverlay.js,
   used by the review screen, the editor and the schedule sheet (so a cover posts the way it shows).
3. **The switch.** "Quote on all covers" in the editor posts `POST /api/settings/quote-overlay` with `{ on }`. Undo and
   redo step it back and forth, and undo from its first use takes it back to not set.
4. **Her covers stay hers.** The switch never writes showQuote or showQuoteSet. While it's set, a `from: "default"`
   toggle changes no cover. Unsetting it brings every cover's own choice back exactly.
5. **The checks follow it.** The compose check (QUOTE_IN_STOCK) and the caption prompt read the same rule. A change
   reruns the check on covers that already have one. Only a cover whose result changes is saved and sent back, and a
   cover that stays verified keeps its composeAttestedAt.

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/settings/quote-overlay | New. `{ on: true \| false \| null }`. Answers the quote status plus `items`, the covers whose check changed. 403 when quotes are locked and on is true, 400 for anything else |
| GET /api/quotes/status | Adds quoteOverlay |
| POST /api/items/:id/quote-toggle | `from: "default"` applies nothing while the switch is set |
| POST /api/items/:id/verify, GET /api/items/:id/caption-prompt | Read the switch, then the cover's own choice |

### Data

| Where | Change |
| --- | --- |
| data/settings.json | New quoteOverlay, only once she uses the switch. Nothing else is written until then |

Checks after the port: with the switch not set, every cover shows as before and the counts don't change. Set it on and
off once on one cover, check the other covers follow, check no cover's showQuote changed, then undo back to not set.

## 1.13.2: a clip plays from the address the server gives

Rose's #594, Symphony's #595, Claude's #597 and #618. A space's host may serve only its page, assets, blobs and
actions, so a page request for /api/symphony/clips/<id> can't reach the space's code, and an audio element can't go
through api.js. Now the page asks the server where a Symphony clip plays from before it plays it. No new fields or
settings.

1. **The question.** GET /api/symphony/clip-url?id=<id>&part=<N> answers `{ found: true, url }` when the feed has that
   part's clip, plus `expiresAt` when that address stops working at a known time: milliseconds since 1970, or an ISO
   date string (Quill #641). A value that is neither counts as no expiresAt, so the address is kept for the visit.
   Otherwise it answers 404 with `{ found: false, url: "", error: "clip not found" }`. The `error` is the plain-words
   reason api.js shows for any failed answer, as on every other route. Here the url is this app's own clip address,
   /api/symphony/clips/<id> (`?part=N` for part N). It doesn't expire, so this app's answer has no expiresAt. It is
   never the code or a signed link.
2. **The Songs screen** asks before it plays a part's clip. An address that comes back is kept for the visit, so a
   replay or a seek starts at once. One with expiresAt is asked for again from two minutes before that time. A paused
   clip resumes where it stopped while its loaded address is still good. Once that address has expired, the part
   starts again from where it began, on a fresh address. App previews play as before.
3. **The song row** asks as soon as a cover with a Symphony song (songFile `symphony:<id>`) shows, and reads the kept
   address again on every tap, so an expired one is asked for again. An answer that comes back after a newer tap, or
   after the cover changed, doesn't start. songPreviewUrl stays the stable address in the data, so nothing stored
   changes.
4. **iOS.** A tap is the only moment an audio element may start. When the address isn't known yet, the tap starts a
   silent sound on the same element, and the clip starts once its address is back. The players skip the silent
   sound's own events.

A ported space maps GET /api/symphony/clip-url to an action that answers the same shape with an address its own host
can play, so the client files stay identical to upstream's. Rose's symphonyclipurl answers the current signed link
and stores nothing (#615). When 1.13.2 ports, it also answers expiresAt from the feed's linksExpireAt, and the bridge
passes it through (Quill #622). A space that resolved clips on its own before this (Rose's #598: SongsView.jsx and
CoverTop.jsx, with the address built in songsData.js) takes all three files whole from here: its own resolve blocks
go, and its bridge answers clip-url instead of the clip address. Resolution stays at play time, and nothing stored on
a cover changes.

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| GET /api/symphony/clip-url | New. `{ found, url }`, plus expiresAt when the address can expire, as in item 1. 404 when there's no code, no such song, no clip for that part, or a bad id or part |

### Client

| Where | Change |
| --- | --- |
| songs/clipSource.js | New. clipSource and clipNow (ask and keep; an address with expiresAt is asked for again two minutes before it), unlockAudio and isSilent (the tap's silent sound) |
| songs/songsData.js | sourceFor names a clip's song and part; symphonyIdOf reads a cover's songFile |
| songs/SongsView.jsx | Plays a clip from its asked-for address; a later tap wins over an answer still on its way; a resume after the address expired starts the part again |
| CoverTop.jsx | The song row plays a Symphony cover's clip from the address it reads on each tap |

Checks after the port: disconnected, clip-url answers 404 and the Songs tab is empty with no error. Connected, a tap on
a hook in New hot plays it on the phone, the song screen's back and next play other parts, Use on this cover, and the
song row plays the clip. In a space whose links expire, a clip played again after its link's time plays, not "That
audio didn't load." No response, log or screenshot shows the code. Upstream's answers never show a signed link; in a
no-copy space only the clip-url answer carries one. The counts don't change.

## 1.13.1: undo keeps a "manual" song source

Quill's #590, Rose's #587. A ported space can keep covers whose songSource is "manual", which upstream never writes.
The edit action only takes back a source that's on its list, so undo would leave a "manual" cover with the wrong
source. "manual" is on the list now. Nothing else changes: no new fields, no new settings, and the counts hold.

## 1.13.0: the quote switch carries over

Arjang via Rose's #559 and #567, Quill's #562 and #569. Her last choice on "Quote on the cover" carries over to the
covers she hasn't set yet, so it no longer looks like it resets between covers. Slides are part of their cover, so they
follow it.

1. **Her default.** A new setting, quoteDefault (true, false or empty), set only by her own switch in the editor
   (undo and redo too): `quote-toggle` with `from: "switch"`. A toggle sent without from (her Muse, a data step)
   leaves it alone.
2. **A cover she has set.** A new field, showQuoteSet. Any explicit toggle sets it, and a cover with it keeps its own
   choice. Old rows have none, so they read as not set.
3. **Carrying it over.** When she opens a cover (the editor closed) while her default is on, quotes are unlocked and
   the cover's quote is off and not set, the page sends `quote-toggle` with `from: "default"`. The server turns the
   quote on and marks it set, and answers `{ item, applied }`. It only ever turns a quote on, since a new cover
   starts with it off, so a quote she or her Muse turned on is never taken away. It isn't a step for undo.
4. GET /api/quotes/status now also answers quoteDefault, and every `quote-toggle` answers it with the item.
5. The switch has the accessible name "Quote on the cover".

### New setting

| Setting | Type | Default | What it is |
| --- | --- | --- | --- |
| quoteDefault | true or false | none | Her last choice on the switch. Adds one settings row the first time she flips it |

### New field on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| showQuoteSet | true or empty | empty | Someone chose this cover's quote toggle, so the default leaves it alone |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/items/:id/quote-toggle | Marks the cover set. from "switch" also saves her default. from "default" applies the default as above |
| GET /api/quotes/status | Answers quoteDefault |

### Client

| Where | Change |
| --- | --- |
| App.jsx | Toggles from the editor, undo and redo send from "switch"; opening a cover she hasn't set applies her default |
| CoverEditor.jsx | aria-label "Quote on the cover" on the switch |

Checks after the port: with no default yet, nothing changes on any cover. Turn the quote on in the editor on a cover,
close it and open the next cover she hasn't set: its quote comes up on. Turn it off on another and go back: the first
keeps its quote. A toggle from her Muse doesn't change her default. Counts: settings goes up by one after her first
flip, and nothing else changes.

## 1.12.0: songs from Symphony

Arjang's #477, #480 and #483, Quill's #497 and #500, Symphony's #496. Symphony's songs, online, inside Cover Review:
New hot, the library and every song's hook, in Spotify's hierarchy, with Use on this cover. Additive: until a Symphony
code is connected nothing changes, and no note button shows.

1. **The code.** A new setting, symphony: `{ code, connectedAt }`, set by her Muse with the Symphony code from uBee. It
   is a secret, like the Pollen code: data/settings.json only, never in the repo, a log, a grievance or a chat, and no
   action answers with it. Connecting reads the feed with it once. A code that doesn't work is refused with the reason
   and nothing is stored. A code that stops working later (Symphony answers 401) becomes `{ revoked: true, revokedAt }`,
   and the app says to ask uBee for a new one. Sending null disconnects.
2. **The feed.** The server reads `GET https://evmqkvnclbqcijlyezrr.supabase.co/functions/v1/symphony/feed` with
   `Authorization: Bearer <code>` and keeps it for 30 minutes, so the code never reaches the page. It reads it again
   first when the feed's clip links (good for a day) are within 10 minutes of expiring. A failed read keeps the last
   good one. Only https links are kept, and a clip link has to be on Symphony's own storage.
3. **Clips.** A cover's Symphony clip is stored as songFile `symphony:<id>` (the id is lowercase letters, digits and
   dashes). Its address is /api/symphony/clips/<id> (`?part=N` for the song's other popular parts), which redirects to
   the signed link. A cover never stores a link that expires.
4. **Picking.** With no songs folder connected, the downloaded list is Symphony's songs that have a hook clip, New hot
   first. New covers, Shuffle, a typed song, the Compose check and Pollen use it exactly like the folder's list. A
   connected folder still wins.
5. **The Songs screen.** With Symphony connected, a note button in the song row (and one in the covers header) opens
   Symphony's screens: New hot, Search and Library tabs, a mini player, the song screen (the hook in green on the
   progress bar, back and next between popular parts, hook lyrics, where each app's preview starts, YouTube's most
   replayed moment, US charts today, the data behind it, Watch on YouTube) and a share sheet. Opened from a cover it
   adds Use on this cover: the song whole, with its clip and hook, as one Song step that undo takes back.
6. **Pollen.** Once the Bee Hive takes songs, a Symphony clip goes like a folder clip: the app downloads it from
   Symphony and uploads it with the cover. A cover whose Symphony clip isn't in the feed right now is flagged in the
   check and refused before anything is sent.

### New setting

| Setting | Type | Default | What it is |
| --- | --- | --- | --- |
| symphony | { code, connectedAt }, or { revoked, revokedAt } | none | The Symphony code (secret) and when it was connected. Adds one settings row once her Muse connects it |

### New values in existing fields (photos table)

| Field | Change |
| --- | --- |
| songFile | Can hold `symphony:<id>`, a Symphony clip |
| songPreviewUrl | Reads /api/symphony/clips/<id> for a Symphony clip |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| GET /api/connectors/symphony | New. { connected, revoked, songs, withClips, updatedAt, day, checkedAt, message }. Never the code |
| POST /api/connectors/symphony | New. { code } connects (400 when it isn't a code, 401 when Symphony refuses it, 502 when Symphony can't be reached, and nothing is stored); { code: null } disconnects |
| GET /api/symphony | New. The status above plus stale, hot: { date, rows: [{ id, badges: [{ text }] }] } and songs: [{ id, artist, title, artwork, genre, durationSec, addedAt, analyzed, error, popularity, watch, isrc, links: { apple, spotify, youtube }, today, hook: { start, end, label, level, parts, lines } or null, previewStart, previewUrl: { apple, spotify }, replayPeak, replay, depth, chorusCount, views, clips: [true or false per part] }] |
| GET /api/symphony/clips/:id | New. 302 to the clip's signed link, `?part=N` for part N. 404 when there's no code, no such song, or no clip |
| GET /api/songs | Adds source: folder, symphony or null. With no folder, songs are Symphony's |
| POST /api/items/:id/edit | songFile may be `symphony:<id>` (undo, and Use on this cover). Any other songFile that isn't a clip path in the folder answers 400 and changes nothing |
| POST /api/items/upload, POST /api/items/enqueue, POST /api/items/:id/verify | As in 1.11, from Symphony's list when no folder is connected |
| POST /api/pollen/check, POST /api/pollen/schedule | Symphony clips, as in item 6 |
| GET /api/health | Adds symphony: { connected, revoked } |
| GET /api/setup/status | Adds requirements.symphony |
| GET /api/connectors | Lists Symphony with its Muse steps |

### Client

| Where | Change |
| --- | --- |
| songs/ (new folder) | SongsView.jsx, SongsTabs.jsx, SongsPlayer.jsx, SongsSheets.jsx, SongsRow.jsx, songsData.js, artColor.js and songs.css (every class starts with sym, so nothing touches the review screen) |
| App.jsx | The Songs view; the Symphony status loads with the rest; Use on this cover is a recorded Song edit |
| CoverTop.jsx | The note button in the song row, only with Symphony connected |
| LibraryView.jsx | The note button in the covers header, only with Symphony connected |
| icons.jsx | The icons the Songs screen uses |
| styles.css | The covers header fits the note button |

A ported space maps GET /api/symphony and the clip address to actions that read the feed on the server with the
stored code. A space whose actions can't redirect may answer a clip address with the clip's bytes instead, fetched
from the signed link on the server. Either way the page never sees the code or a signed link.

Checks after the port: with no code, nothing changes and no note shows. Connect the code: the note shows in the song
row; New hot plays its hooks; Use on this cover gives the cover the song with its clip, the song row plays the hook,
and undo takes it back; no screen, response, log or screenshot shows the code. Disconnect: the note goes, and covers
keep their songs. Then the counts (one more settings row once connected).

## 1.11.0: downloaded songs

Arjang's #477 and #480, Quill's #482 and #492, Symphony's #481 and #491. Covers can take their song from a folder of
licensed downloads, with Symphony's hook clips, instead of Spotify. Additive: until a folder is connected nothing
changes, and a cover without a clip keeps its Spotify player or preview exactly as before.

1. **The folder.** A new setting, songsFolder: a full path on the machine the app runs on, empty by default, set by
   her Muse. Connecting checks the folder has manifest.json at its top. The app reads the manifest again whenever it
   changes, so a new export shows up without a restart. Sending null disconnects it, and covers keep their song names.
2. **The manifest (Symphony's).** `{ songs: [ { id, artist, title, hookStart, hookEnd, previewStart: { apple, deezer,
   spotify }, replayPeak, hookFile, songFile, spotifyUrl } ] }`. Times are seconds of song time. id is Symphony's
   stable song key; hookFile is hooks/<id>.m4a; songFile (the licensed full file) and spotifyUrl are optional. Extra
   fields (updatedAt, isrc, hookLabel) are ignored, and snake_case names are read too. A song is left out when it has
   no artist or title, its hook end isn't after its start, or its hook clip isn't an audio file inside the folder.
3. **A cover's song.** Two new optional fields: songFile (the hook clip's path in the folder) and songHook ({ start,
   end }). songSource can now read downloaded. The song's name stays in song (a name she typed keeps her spelling).
   The clip's address is /api/songs/clips/<songFile>, kept in songPreviewUrl, so a copy of a cover plays it too.
4. **Picking.** With a folder connected, new covers and Shuffle pick from its songs first. Covers made before keep
   their songs until shuffled. A song typed or set by her Muse (also through a Drive import) that matches a downloaded
   song's "Artist - Title" in any case gets its clip; any other song drops it. The Compose check counts downloaded
   songs as in the pool.
5. **Playback.** A cover with a clip plays it with the song row's play button ("Play the hook"), ahead of any
   Spotify link. Every other cover plays as before.
6. **Undo.** A song steps back whole: its name, preview, Spotify link, clip, hook and source. Before this, undoing a
   Shuffle also dropped the song's Spotify link; that's fixed with it.
7. **Pollen.** The Bee Hive's hello can now say `features: { songs: true }`, and the app keeps it with her channels.
   Until it does, a cover with a clip goes out as before, and the Schedule sheet says covers with a downloaded song
   go out without it for now. Once it does, a cover with a clip also uploads that exact clip (`upload_url` with
   `kind: "song"` and its `content_type`) and submits `song: { path, artist, title, hook_start, hook_end,
   content_type }`. A cover whose clip is missing is flagged in the check and refused before anything is sent.

### What the Bee Hive and Pollen need before songs go out (a separate step, not in this repo)

- Bee Hive: hello answers `features: { songs: true }`; upload_url with `kind: "song"` hands out its own path for the
  clip (never the cover's); submit keeps `song`; cover_lease hands Pollen a link to the clip with the name and hook.
- Pollen: what a cover with a song posts as is still to be decided. A photo post can't carry a song through the
  platforms' APIs, and a file baked into a post skips the platforms' music libraries (Symphony #481), so this is a
  test path until Arjang says it replaces anything.

### New setting

| Setting | Type | Default | What it is |
| --- | --- | --- | --- |
| songsFolder | text | none | The songs folder's full path. Adds one settings row once her Muse connects it |

### New fields on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| songFile | text or empty | empty | The hook clip's path inside the songs folder |
| songHook | { start, end } or empty | empty | The hook, in seconds of song time |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| GET /api/songs | New. { connected, folder, songs }: the songs it can play, each with id, artist, title, hookStart, hookEnd, hookFile, clipUrl, spotifyUrl |
| POST /api/songs/folder | New. { folder } connects (400 with the reason when it can't use it), { folder: null } disconnects |
| GET /api/songs/clips/* | New. Serves a hook clip from the folder, with ranges, and nothing else: anything outside the folder, not audio, or missing answers 404 |
| POST /api/items/upload | New covers pick from the downloaded songs first |
| POST /api/items/enqueue | A song that matches the list gets its clip |
| POST /api/items/:id/edit | song: matches the list as above. song with songFile and songHook (undo) puts them back; a songFile that isn't a clip path, or comes without a hook, answers 400 and changes nothing. songSource comes back with undo. shuffleSong picks from the list first |
| POST /api/items/:id/verify | SONG_IN_POOL counts downloaded songs |
| POST /api/pollen/check | Answers hasSongClip and songGoes, and flags a missing clip when the Bee Hive takes songs |
| POST /api/pollen/schedule | Sends the clip with the cover once the Bee Hive takes songs (above) |
| GET /api/connectors | Lists the songs folder with its Muse steps |

### Client

| Where | Change |
| --- | --- |
| CoverTop.jsx | SongRow plays a cover's hook clip ("Play the hook") ahead of its Spotify link |
| App.jsx | Shuffle, a typed song and a typed song saved on the way out all step back whole (songOf) |
| ScheduleSheet.jsx | The "go out without the song for now" hint |

Checks after the port: with no folder, nothing changes. Connect a test folder: GET /api/songs lists its songs; a new
cover gets a downloaded song with its clip and plays it; Shuffle picks from the list and undo puts the clip back; a
typed song on the list gets its clip and any other drops it; a clip outside the folder answers 404; the Compose check
counts a downloaded song. Disconnect it, and the settings count goes back down by one.

## 1.10.1: Comment CTA, and off hides it

Arjang's #453, Quill's #455 and #458. No new fields or settings. Three changes:

1. **The switch is called "Comment CTA".** Its label, its line in the undo history, and every message that names it:
   "That comment CTA isn't on your list. Ask your Muse to add it.", "Leave the comment CTA out. The switch under the
   caption adds it." and "Keep it to 6 comment CTAs or fewer."
2. **Off hides a call written into the caption.** Captions drafted before 1.10 have the call in their text, so off
   still showed it. Now a call in the caption text is left out wherever the caption shows and out of what posts: one
   of her saved lines, anywhere, in any case, or a "Comment WORD" sentence at the start (WORD in capitals, up to the
   first !, . or … that a space or the end follows, or the end of the line). Every other word stays, and the gap
   closes with the space or line break that was there. Off: the plain caption. On: her line once, then the plain
   caption, so an old caption that already starts with her line no longer shows it twice. Nothing stored is
   rewritten: tapping a caption to edit it opens the plain text, so saving takes the old call out of what's stored.
3. **The voiced prompt takes #453's standard.** It asks the caption to reference something specific in the photo in a
   way that invents subtext and opens curiosity loops, questions the reader can't answer yet, the more the better.
   The no-voice prompt stays the original's.

One helper decides what shows and what posts: client/src/captionCall.js (ctaFor, plainCaption, postedCaption). The
server imports the same file, so the page and Pollen can't drift. Port plainCaption with exactly these rules.

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/pollen/check | Answers with what posts: the plain caption when off, her line once and then the plain caption when on |
| POST /api/pollen/schedule | Sends that same caption |
| POST /api/items/:id/edit | A keyword not on her list answers 400 with "That comment CTA isn't on your list. Ask your Muse to add it." |
| GET /api/items/:id/caption-prompt | The voiced prompt carries the new standard (above) |
| POST /api/items/:id/caption-draft | The refusal reads "Leave the comment CTA out. The switch under the caption adds it." |
| POST /api/settings/caption-ctas | Over six answers "Keep it to 6 comment CTAs or fewer." |

### Client

| Where | Change |
| --- | --- |
| captionCall.js | New. ctaFor, plainCaption and postedCaption, shared with the server |
| CoverDetails.jsx | The switch reads "Comment CTA"; the caption shows plainCaption, and the edit box opens it |
| App.jsx | The undo history line is "Comment CTA"; her calls go to the Schedule sheet |
| ScheduleSheet.jsx | Until the Pollen check answers, each cover shows postedCaption |

Checks after the port: the switch reads "Comment CTA" and is off on every cover. A cover whose stored caption starts
with her line shows the caption without it when off, in the caption row and in the Schedule sheet, and the Pollen
check answers with that plain caption. On, her line shows once. Tapping the caption opens the plain text. Stored
captions are unchanged until one is edited or redrafted. The voiced caption-prompt carries the new standard. The
counts don't change.

## 1.10.0: the comment call switch

Arjang's #435, Quill's #438. A ManyChat-style comment call ("Comment WORD and I'll send you ...") used to get written
into the caption itself. Now it's a switch, off by default:

1. **Her calls live in her space.** A new setting, captionCtas: a list of { keyword, line }, set by her Muse. Upstream
   ships none, so nothing of hers is in this repo. Each keyword is one word (kept in capitals), each line has to say
   its keyword and pass Pollen's caption rules, one line per keyword, six at most. An empty list clears them.
2. **A switch on every cover.** A new field, cta: the keyword whose line leads the caption, or nothing (off, the
   default). The switch sits in the empty space under "Instagram caption". With more than one call she picks which
   one under the switch. A space with no calls shows no switch.
3. **The caption is stored without the call.** What posts is the call's line, a space, then the caption. Pollen gets
   that, and the 2,200 limit and the caption rules check that. A cover switched to a keyword that has since left her
   list posts its caption alone.
4. **No call in a draft.** caption-draft refuses a draft with a comment call in it (one of her lines, "Comment
   KEYWORD" for one of her keywords, or "Comment WORD" in capitals at the start), so the switch stays the only way in.
5. **The photo, always.** With a voice, the prompt now always carries what the photo shows and asks the caption to
   allude to it, text covers included, and to leave the call out. So a voiced draft needs the description on every
   cover: needsDescription no longer skips covers that show text. The no-voice prompt stays the original's.

### New setting

| Setting | Type | Default | What it is |
| --- | --- | --- | --- |
| captionCtas | list of { keyword, line } | none (empty list) | Her comment calls. Adds one settings row once her Muse sets it |

### New field on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| cta | text or empty | empty (off) | The keyword of the call that leads this cover's caption |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| GET /api/settings/caption-ctas | New. Answers { ctas } |
| POST /api/settings/caption-ctas | New. { ctas: [{ keyword, line }] } sets the list. A bad list answers 400 with the reason and changes nothing |
| POST /api/items/:id/edit | Takes cta: a keyword on her list turns the switch on (any case), null turns it off. A keyword not on her list answers 400 and the whole edit is refused. Undo sends the old value back the same way |
| POST /api/pollen/check | Checks what posts, and answers with it as caption |
| POST /api/pollen/schedule | Sends what posts: the call's line, then the caption |
| GET /api/items/:id/caption-prompt | The voiced prompt carries the photo on every cover; needsDescription holds whenever a voice is set and the description is empty |
| POST /api/items/:id/caption-draft | Refuses a draft with a comment call in it, with reason rules |

### Client

| Where | Change |
| --- | --- |
| App.jsx | Loads the calls with the rest; the switch is a recorded edit ("Comment call"), so undo and redo step through it |
| CoverDetails.jsx | CaptionRow: the switch and the keyword picks under the label, and the call's line above the caption when it's on |
| ScheduleSheet.jsx | Shows the caption as it posts, from the Pollen check |
| styles.css | The switch, the keyword picks and the call's line |

Captions written before this release with a call already in them keep it, since nothing rewrites stored captions. A
redraft writes them without it, and her switch adds it back where she wants one.

Checks after the port: with no calls set, no switch shows. Her Muse sets her calls; a cover's switch is off until she
turns it on; on, the line leads the caption on screen and in the Schedule sheet; undo turns it back off; a draft with
a call in it is refused; a cover that shows text and has no description asks for one before a voiced draft. Then the
counts (one more settings row once her calls are set).

## 1.9.2: a cover with no text gets a caption about its photo

Quill's #327. In 1.9.0 a cover that showed no text fell back to its hidden quote as the caption's topic, so captions
were about text nobody sees, and often about lines that aren't hers. Now:

1. **Only text that shows counts.** overlaidText returns the quote when it's turned on, then her text boxes, and
   nothing else. A hidden quote is never a caption's topic.
2. **No text, so the photo.** With a voice and no text on the cover, captionPrompt has the caption reflect on what the
   photo shows, from the cover's description, in her voice. With text showing, the text stays the topic.
3. **Written as her.** With a voice, the prompt says to write as her, in the first person, so her words and her story
   stay hers instead of landing on the reader.
4. **The description.** A new field, description: what the photo shows, in plain words, recorded by her Muse. A voiced
   caption for a cover with no text needs it: caption-prompt says needsDescription, and caption-draft refuses with
   reason no-description until it's there. caption-prompt also returns the photo's address (imageUrl).

The no-voice prompt stays the original's, word for word (it reads the quote and the image description, as the
original does).

### New field on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| description | text | "" | What the photo shows, in plain words, from her Muse. At most 1,000 characters |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/items/:id/description | New. { text } sets the description |
| GET /api/items/:id/caption-prompt | Adds imageUrl, description and needsDescription |
| POST /api/items/:id/caption-draft | Refuses with reason no-description while needsDescription holds |

Checks after the port: a cover with no text and a voice set asks for a description first; once it has one, its prompt
is about the photo and never shows its quote; a cover with text showing keeps the text as the topic. Then the counts.

## 1.9.1: remove a custom color

Arjang's yes to #282. Her custom colors can come off her list: in the editor, open Custom colors, tap Remove colors,
then tap a color to remove it, and Done to finish. Covers that use a removed color keep it; only the shortcut goes.
The 11 palette colors can't be removed. No new fields.

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/palette/custom-colors/remove | New. { hex: "#RRGGBB" } takes it off settings.customColors and answers the palette like GET /api/palette. Removing a color that isn't there changes nothing; anything that isn't #RRGGBB answers 400 |

Client: CoverEditor.jsx (Remove colors and Done in the Custom colors panel), App.jsx, styles.css.

Checks after the port: a color she picked shows in Custom colors; Remove colors, then tapping it, takes it off; the
cover that uses it keeps its color. Then the counts.

## 1.9.0: captions in the space's own voice

Quill's #269, #276, #284, #292 and #296, from Arjang's #265, #267, #270, #272 and #274. The original drafts every
blank caption with a model before she sees the cover, and never replaces a caption someone typed. This release brings
that over, in each space's own voice.

1. **Where a caption came from.** A new field, captionSource: "placeholder" (the offline draft, the quote as
   written), "model" or "human". Upload, Drive import, the caption action and Redo set placeholder. A typed caption
   sets human. A saved model draft sets model. Old rows have no source. A blank caption, or one equal to the offline
   draft of the cover's current quote, reads as a placeholder. Anything else reads as human, so words of unknown
   origin are never replaced.
2. **What a model may draft** (canDraft in server/captionDrafts.js): a queue or approved cover whose caption is blank,
   or a placeholder on a cover made since drafting started. Model and human captions are never redrafted.
3. **The gate.** A new setting, captionFillFrom: when 1.9.0 first ran in this copy. Placeholders on covers made before
   it wait. Backfill sets it to 0, which lets a model redraft the placeholders already in the deck. That is the
   owner's call. Never turn it on as part of a port. A space that knows some differing captions are offline
   leftovers leaves them as they read (human) until the owner decides.
4. **The prompt** (captionPrompt). With no voice it is the original's generateInstagramCaption prompt, word for word,
   with the cover's quote and an image description. That draft must fit the original's output schema: 1 to 80
   characters, at most 8 words, no hashtags, no emoji, no not-this-but-that. With a voice, the prompt keeps the
   caption on topic of the text on the cover (the quote when it shows, then her text boxes, or the quote when
   nothing shows), in that voice, with no length rule of its own. Every draft also meets Pollen's caption rules.
   draftProblems checks both.
5. **The voice.** A new setting, captionVoice: text her Muse sets with POST /api/settings/caption-voice. It lives in
   the space's own data, never in the repo. A creator's specifics, such as her spellings and her angle, belong in it,
   not in the code.
6. **The fill loop** (client, App.jsx). After each load it asks GET /api/captions/wanted, then calls
   POST /api/items/:id/caption-fill for each, off-screen covers first. Upstream's own server has no model: a blank
   caption gets the offline placeholder, and a placeholder answers no-model, which stops the loop for the session.

### New field on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| captionSource | text | none, read as in item 1 | placeholder, model or human |

### New settings

| Setting | Type | Default | What it is |
| --- | --- | --- | --- |
| captionVoice | text | "" | The space's caption voice. Empty means none |
| captionFillFrom | number (ms) | set the first time 1.9.0 runs | Placeholders on covers made before it wait for backfill |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| Upload, Drive import, POST /api/items/:id/caption | Set captionSource placeholder |
| POST /api/items/:id/edit | A caption sets human. With captionSource (placeholder, model or human) it sets that instead, and null removes the field, so undo puts a caption's source back with its words. regenerateCaption sets placeholder |
| GET /api/captions/wanted | New. { ids } of covers a model may draft, queue first |
| GET /api/items/:id/caption-prompt | New. { prompt, voice, basedOn, canDraft }; basedOn is the caption as it stands |
| POST /api/items/:id/caption-draft | New. { caption, basedOn }. Saves as model only while canDraft holds and the caption still equals basedOn, and the draft passes draftProblems. Otherwise { saved: false, reason: locked, changed or rules } |
| POST /api/items/:id/caption-fill | New. Upstream: a blank caption gets the placeholder ({ drafted: true, reason: "offline" }); a placeholder answers { drafted: false, reason: "no-model" }; anything else is locked |
| GET, POST /api/settings/caption-voice | New. { voice } sets the voice, { backfill: true } sets captionFillFrom to 0. Both answer { voice, fillFrom } |

Redo (New caption) asks for a fresh draft because she asked, so a space with a model may map regenerateCaption to a model draft saved as model. A space whose actions can call a model maps caption-fill to that call: when canDraft holds, take the caption as it
stands, draft from captionPrompt(cover, captionVoice) with the cover's image description, check it with
draftProblems, and save it as model only if the caption still equals what it was when drafting began. A space whose
actions can't call a model keeps upstream's caption-fill, and its Muse can draft with caption-prompt and caption-draft.

Checks after the port: counts; captionFillFrom is the port time, so no cover already in the deck is redrafted; with a
voice set, a new cover's placeholder gets a draft in that voice; a typed caption is never replaced; with no model, the
fill loop makes one try per session and stops.

## 1.8.1: the landscape safe zone and Opacity 25 to 100

Quill's #283 answers to two 1.8.0 questions. Port it on top of 1.8.0. No new fields, and no saved cover is rewritten.

1. **Landscape safe zone.** Randomize now uses the original's landscape formula (safeBoundsForGeometry) for every cover
   wider than square. The original works in the 4:5 frame, with the photo across it: inset 5% across (6% from 1.7:1),
   and top and bottom by the larger of 2% of the frame and 6% of the photo's height (8% from 1.7:1). This app lays
   text out in the photo's own frame, so in % of the photo that is: across 5 (6 from 1.7:1), down the larger of
   2.5 x (width / height) and 6 (8 from 1.7:1). 4:3 and 3:2 keep left 5, top 6, width 90, height 88 of the photo,
   the same as 1.8.0. 16:9 becomes 6, 8, 88, 84. A cover just wider than square, which 1.8.0 gave the square zone,
   now gets the landscape one. Portrait and square covers don't change. Client only: safeZoneFor in renderCover.js.
2. **Opacity runs 25 to 100**, like the original's slider and updateCoverStyle. The slider starts at 25, and the
   server saves a new value under 25 as 25 and over 100 as 100. A cover or text box saved under 25 before this keeps
   its number while she edits other things, and the slider shows that number. The floor applies the next time her
   opacity itself changes. That covers the text box list too: the server compares each box with the box saved in the
   same place, so a box's old value stays when only another field changed. Undoing an opacity change on such a cover
   brings back 25, since that is a new opacity for the server.
   Server: new server/styleRules.js (nextOpacity, OPACITY_RANGE); full.js (setNumbers applies it, and cleanTextBoxes
   takes the stored boxes). Client: CoverEditor.jsx (the slider's min).

Checks after the port: Randomize on a 16:9 cover stays 6% in from the sides and 8% from the top and bottom; the Opacity
slider starts at 25; a cover saved at 22 still reads 22% after a color change. Then the counts.

## 1.8.0: the editor bundle

Arjang's #242 to #246, #255, #258 and #263, built to Quill's rulings #249, #251, #260 to #262 and #269, as one release.
No new fields, no new tables, and no saved cover is rewritten.

1. **It saves as she goes.** The Save and Cancel buttons are gone. Every change shows on the cover at once and saves
   600 ms after the last change, through the same edit call Randomize uses. A small status at the top right of the
   sheet reads "Saves as you go", "Saving…", "Saved" or "Not saved yet". Every way of closing (a tap on the handle, a
   drag down, a tap off the sheet, Escape) saves anything still waiting first, and none of them throws an edit away.
   If that last save fails, the sheet comes back open with "Not saved yet".
   Undo is per change, like the original's one command per change: each save is one undo step, so changes made within
   600 ms of each other (one slider drag) undo together. Closing adds no step of its own.
   Deliberate deviation, ruled by Quill (#249, #251): the original's sheet saves only on Save, and Cancel throws the
   edit away. Here nothing is thrown away; undo is the way back.
2. **Two stops.** The sheet rests at 56svh as before. A swipe up on the handle, or up from the top of the sheet's
   content, takes it to 88svh. A swipe down from 88 goes back to 56, and a swipe down from 56 closes it; there is no
   jump from 88 straight to closed. A quarter of the way to the other stop is enough to go there, and it never rests
   between them.
3. **A tap off closes it and keeps the edits** (Arjang #258). That covers a tap above the sheet, beside the cover, and
   on the dark bars inside the cover's frame around a wide photo. Taps on the photo itself still move and pick text.
4. **TikTok Sans, Regular for new text.** The menu now says "TikTok Sans" for the default font. The letters are the same
   face as before (the bundled TikTok Sans); only the label changes. New covers, new Drive covers and new text boxes
   start at weight 400 (Regular). Saved covers keep their stored weight (500) and look the same (Quill #261, option a).
5. **Randomize layout, the original's six layouts, inside the safe zone.** One of the six from
   createRandomizedEditorialDraft at even odds (Quill #260): centered hero, left pillar, right pillar, justified center,
   small left column, monoline, each with its own size, Lines and position ranges. Here the justified center is
   textAlign "justify". Lines never asks for more rows than the words allow (at most 8; half the words for justify).
   The whole drawn block (fit and stretch included) must sit inside the safe zone for the cover's shape, 2 px in. It
   draws again up to 10 times; if nothing fits, it keeps the centered hero's draw and shrinks only the size until it
   fits. It changes align, size, Lines and position only, never the color, the opacity, the font or the weight. The
   Horizontal and Vertical sliders and dragging the text still use the whole photo, as before.
   Safe zones, as % of the cover, for the shape nearest the cover's own: 9:16 left 5, top 15.6 (300 of 1920), 90 wide,
   62.5 tall (1200 of 1920); 3:4 and 1:1, 6 all round; 4:5, left 5, top 6, 90 wide, 88 tall. Landscape covers use
   left 5, top 6, 90 wide, 88 tall here; 1.8.1 replaces that with the original's formula.
   Deliberate deviation, ruled by Quill (#249, #260): the original has no safe zone check, no second draw and no shrink.
6. **Black 50% and White 50%** (Arjang #263, Quill #269). Two presets in their own row under the 11 colors. Each sets
   the color and the opacity together (#000000 or #FFFFFF, at 50). They are not palette colors: the palette stays 11
   and her saved custom colors don't change. A palette color picked after sets the color only, and the opacity slider
   stays hers to move. Randomize never touches either.
7. **The update line copies.** On a copy that can't update itself, UPDATE NOW shows the line for her Muse, as before.
   Tapping the line now copies it, like COPY IT. Copying tries the clipboard, then the browser's older copy command,
   then selects the line. She always sees a result: "Copied. Paste it to your Muse." or "Press and hold the line to
   copy it, then paste it to your Muse." (Quill #261.)

Server: store.js (a new cover starts at fontWeight 400) and full.js (styleDefaults: new text boxes and new Drive covers
start at 400). Client: EditorSheet.jsx, App.jsx, CoverEditor.jsx, CoverStage.jsx, UpdateBanner.jsx, renderCover.js
(FONT_LABELS, HALF_PRESETS and presetOn, the safe zones and randomizeLayout), reviewMath.js (RANDOM_LAYOUTS and
randomEditorialLayout replace randomLayout), styles.css.

Checks after the port: the sheet stops at 56 and 88; edit, tap off, reopen, and the edit is still there, with no Save
tap; new text says TikTok Sans, Regular; Randomize, tapped many times, never changes the color, the opacity or the
font, and never lands outside the safe zone; Black 50% and White 50% set both values, and White after Black 50% keeps
50; tapping the update line shows Copied or the press and hold note. Then the counts. No decisions, notes, ratings,
quotes, songs or saved styling change.

## 1.7.0: the magnifier

Arjang's spec, built on the original's display zoom. A glass at the top left of the cover flies the photo up, edge to
edge, over a dark (rgba(0, 0, 0, 0.72)), blurred (18 px) background. Pinch zooms like Apple Photos, 1 to 4, centered
where the pinch starts. Letting go under 1.08 snaps back to 1, as in the original. A drag moves a zoomed photo, a
double tap zooms in or back out, and Reset zoom shows while zoomed. A tap on the dark background, or Escape, flies it
back to its place. On a computer, a trackpad pinch or ctrl + wheel zooms, and a plain wheel moves a zoomed photo.
It works on the cover screen and in the editor. Closing it never closes the editor, and another cover starts unzoomed.

Client only. No new fields, no server change.

New file: ZoomView.jsx. Changed: CoverStage.jsx (the glass, hidden in Story view and on a video slide), CoverCanvas.jsx
(detail: draws the flown-up cover sharper, up to the photo's own pixels and at most 2048 across), App.jsx (the zoom
state, and the review screen is inert while the photo is up), reviewMath.js (zoomTo, zoomSettle, zoomPan on the
original's { scale, x, y } state), icons.jsx (zoom), styles.css.

Checks after the port: the glass flies the photo up, a pinch zooms, a tap off flies it back, and the glass flies it up
again, on the cover screen and in the editor. No decisions, notes, ratings, quotes, songs or styling change.

## 1.6.0: the Spotify player

The song row's play button works like the original's: it opens Spotify's own player for this cover's song, and she
taps play inside it. That keeps iOS happy about audio. Closing it removes the player, so playback stops, and moving
to another cover closes it too. A song with no Spotify link but a preview still plays the preview, as in 1.4.

### New field on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| songSpotifyUrl | text | "" | The song's Spotify link: https://open.spotify.com/track/<id> (an intl-xx part is fine), or spotify:track:<id>. Episodes work too |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/connectors/spotify/sync-library | Each track may carry spotifyUrl |
| POST /api/trending/refresh | Each song may carry spotifyUrl |
| New covers, shuffleSong | The suggested song brings its spotifyUrl along as songSpotifyUrl |
| POST /api/items/:id/edit | A typed song drops the link unless songSpotifyUrl comes with it. songSpotifyUrl on its own attaches a link without changing the song |

### Client

Changed: CoverTop.jsx (SongRow), reviewMath.js (spotifyEmbedUrl), styles.css (.spotifyEmbed). spotifyEmbedUrl only
builds https://open.spotify.com/embed/<track or episode>/<22-character id>, so the player can never load another site.
The iframe exists only while the player is open, keyed by the cover and its link.

Checks after the port: play opens the player for the cover's own song, close stops it, switching covers doesn't
carry playback over, and no song, quote or styling data changed.

## 1.5.3: the original's fit

The text block now fits and stretches exactly like the original (SafeQuote fitInsideSafeZone in Quill's
client/src/App.tsx). Client only: coverLayout and drawCover in client/src/renderCover.js. No new fields, no server change.

1. Measure the block unstretched: its natural width is the column (textWidth, 84% by default) or its widest row,
   whichever is wider; its natural height is rows times line height.
2. Fit: scale = min(1, available width / (natural width x widthScale/30), available height / (natural height x
   heightScale/30)). Available is the photo less 2 px on each side, at the 494 px preview width (it scales with
   the image).
3. Clamp the center by the stretched half-extents: it stays at least half the stretched block plus 2 px from each edge.
4. Draw: scale(fit x widthScale/30, fit x heightScale/30) around that center. The letters themselves stretch.

This runs at 30/30 too, so some existing covers move:
- With the default 84% column, the column's center can only sit between about 42% and 58% across. A Horizontal
  outside that draws at the nearest end. Randomize layout picks Horizontal from 30 to 70, so covers it placed
  off-center move toward the middle.
- A block near the top or bottom pulls in to sit 2 px inside the photo, and a block taller than the photo shrinks.
  Before, those ran off the edge.
- A Text width above about 36 makes the stretched column wider than the photo, so the whole block shrinks to fit.
  This matches the original.

Checks after the port: the screen and the posted image still match. Covers whose Horizontal sits between 42 and 58,
with text inside the photo, draw exactly as before. Count the covers that moved, and post one before and after.

Deliberate deviation, ruled by Quill: the original's main editor fits text she hasn't moved yet to a safe zone (for
4:5, left 5%, top 6%, 90% wide and 88% tall), while its cover view, grid, carousel and preview use the image frame.
Here every view, the editor included, uses the image frame, so what she sees while editing is what posts. Covers
she hasn't positioned lose that extra safe-zone pull-in on their first edit. The image-frame clamp above still applies.

## 1.5.2: covers with the quote off skip the stock check

One deliberate change from the original, ruled by Quill: a cover with its quote off draws no quote, so the Compose
check no longer asks for a quote in stock. No new fields.

| Where | Change |
| --- | --- |
| verifyItem (server/full.js) | With showQuote off, QUOTE_IN_STOCK is null (not applicable) instead of true or false. STEPS_VERIFIED then needs only the image and the song: QUOTE_IN_STOCK not false, SONG_IN_POOL, and an image |
| POST /api/items/:id/quote-toggle | Re-runs the check when the cover was already checked, so its beacons match the new toggle. A cover nobody checked stays unchecked |
| Client (CoverDetails.jsx, styles.css) | The Compose card shows a null beacon as NOT NEEDED, with "The quote is off on this cover." |

Checks after the port: re-run verify on every cover that was checked before. Quote-off covers then read NOT NEEDED
for the quote instead of CHECK, and nothing else about them changes.

## 1.5.1: replace her quote list

Connecting quotes could only add to her list. Now it can replace it. No new fields, no client change.

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/quotes/connect | Takes replace: true. With it, her list becomes exactly the quotes sent (trimmed, duplicates dropped, in the order sent). Without it, quotes still join her list as before. Quiz verdicts and the quote unlock stay as they are. An empty list is refused either way, so nothing gets wiped by accident |

Covers that already carry a quote that's no longer on her list will fail QUOTE_IN_STOCK in the Compose check until
their quote changes. POST /api/items/:id/edit with shuffleQuote: true picks a new one from the current list.

Checks after the port: back up her quote list first. After a replace, the quote count equals the number of distinct
quotes sent, and the quiz verdicts count hasn't moved.

## 1.5.0: the original's editor

The editor is a sheet like the original's, the two stretch sliders are back, Lines has no cap, and Auto-detect AI
text is archived from the editor. Dislike moves to second and repost to fourth in the icon row. Server changes are
small and additive.

### New fields on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| widthScale | number, 10 to 50 | 30 | Text width: stretches the text sideways. 30 is no stretch, lower squeezes, higher widens |
| heightScale | number, 10 to 50 | 30 | Text height: stretches the text up and down, the same way |

Each box in extraTexts takes the same two fields. An old row without them reads 30 and draws exactly as before.
textWidth (wrap width) and textHeight (line spacing) stay as they are; the editor no longer shows them.

Fields that already existed but now take more values:

- lineCount: 0 is still Auto. Any count up to 99 saves (it was capped at 4). The editor's stepper shows Auto's
  estimate as "N lines · auto", writes the estimate plus or minus one on the first tap, never goes below 1 or past
  the word count, and never writes 0.

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/items/:id/style | Also takes widthScale and heightScale (10 to 50), on the cover and in each extraTexts box. lineCount clamps to 0 to 99 instead of 0 to 4 |
| New covers (server/store.js) | Start with widthScale 30 and heightScale 30 |

POST /api/items/:id/embedded-text stays, but the editor no longer calls it.

### Client

New file: EditorSheet.jsx. Changed: App.jsx, CoverEditor.jsx, CoverStage.jsx, CoverDetails.jsx, renderCover.js,
styles.css. drawCover in renderCover.js applies the stretch, so the screen and the posted image still match; never
stretch with CSS.

The sheet: bottom-anchored, at most 56% of the screen tall, at most 760 px wide, background rgba(0, 0, 0, 0.015).
A transparent layer behind it closes it like Cancel when tapped; the cover sits above that layer and stays live.
Dragging the handle down past max(96 px, 16% of the screen), a tap on the handle, Escape and Cancel all close it
without saving; Save is the only way to keep edits. New text box and Face mosaic sit at the top of the sheet.

Checks after the port: an old cover opens with Text width and Text height at 30 and looks the same; stretching
the text and saving posts the same image the screen shows; dragging the sheet down keeps nothing.

## 1.4.0: the Quill look

The review screen is new: the cover is the screen, the editor opens on the cover, and the screen and the posted
image are drawn by the same code (client/src/renderCover.js). Server changes are small and additive.

### New fields on each cover (photos table)

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| textWidth | number, 20 to 100 | 84 | Wrap box width, % of the cover |
| textHeight | number, 60 to 200 | 100 | Line spacing, % of the text size |
| extraTexts | JSON array, at most 5 | [] | Her own text boxes. Each has quote (up to 300 characters) and the same style fields as the cover: textColor, textFont, textAlign, fontSize, fontWeight, opacity, horizontalPosition, verticalPosition, lineCount, textWidth, textHeight |
| why | JSON or null | null | Why it matches: { text (up to 1,200 characters), tags (up to 8, 40 characters each), audience and source (up to 200 characters each), recordedAt } |
| songPreviewUrl | text | "" | A song preview to play, when the song pool has one |

Fields that already existed but now take more values:

- lineCount: 0 means automatic wrap; 1 to 4 sets the rows (the text size gives way so the widest row fits the box).
- textAlign: "justify" joins "left", "center" and "right".
- textColor: any #RRGGBB, not only the 11 palette colors.
- imageEdit (JSON): keeps contrast ("normal", "high" or "bw") and mosaics (up to 12 boxes of { x, y, w, h } in % of the photo), next to whatever it held before.

### New setting

| Key | Default | What it is |
| --- | --- | --- |
| customColors | [] | Her custom text colors, newest first, at most 24. A palette color never joins it |

### Actions

| Endpoint in this repo | Change |
| --- | --- |
| POST /api/items/:id/style | Also takes textWidth, textHeight, lineCount (0 to 4), "justify", any #RRGGBB (and remembers it in customColors) and extraTexts (cleaned, at most 5) |
| POST /api/items/:id/image-edit | Keeps contrast and mosaics clean; other keys merge as before |
| POST /api/items/:id/rate | null clears a rating (undo uses it) |
| POST /api/items/:id/edit | A typed song clears songPreviewUrl unless one is sent with it |
| POST /api/items/:id/why | New. Her Muse records why the photo, quote and song belong together. Empty text is refused |
| POST /api/items/enqueue | Each item may carry why |
| GET /api/palette | Adds customColors |
| GET /api/setup/status | Adds counts { queue, approved, rejected } |
| GET /api/items/:id/image | Now required by the cover screen: every cover on screen, Download and the posted render load the photo through it. It must serve the photo from the space's own origin (proxy a Drive or remote photo, never redirect to another site), or the photo won't show and the eyedropper, contrast and Download fail |
| POST /api/connectors/spotify/sync-library | Each track may carry previewUrl |
| POST /api/items/:id/remix | A remix is a deep copy: its slides and image edits are its own, and it carries no Pollen booking and no compose check |

Unchanged and still used by the new screen: decide (like is approved, dislike is rejected, undo sends queue),
remix, slides add, remove and restore, story-framing, verify, swap-photo, restore-original, quote-toggle,
embedded-text, grievances, the quote quiz, Pollen.

### Client

New files: api.js, icons.jsx, reviewMath.js, undo.js, CoverCanvas.jsx, CoverStage.jsx, CoverEditor.jsx, CoverTop.jsx,
CoverDetails.jsx, LibraryView.jsx, InfoSheet.jsx. Changed: App.jsx, renderCover.js, styles.css, main.jsx.
The client now bundles TikTok Sans from @fontsource/tiktok-sans (SIL Open Font License). The root `npm run build`
installs the client's packages first (with dev packages), so the build works even where npm skips them.

Auto-detect AI text doesn't read the photo itself. It hands her a line for her Muse, and shows the result once the
Muse records it with POST /api/items/:id/embedded-text.
