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
