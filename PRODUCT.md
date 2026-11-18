# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Confirmed: the primary user is a creator reviewing her own covers on her phone, inside the Muse app (the app runs in her Muse space or as a hosted copy). She reviews one cover at a time, often in short sessions, and decides fast: keep it, pass on it, or fix the text and keep it.

Inferred from the repo: the creator's Muse (an AI agent) sets the app up, imports photos, records checks such as embedded text, and ports each release into her space. The uBee team reviews on a laptop sometimes; desktop must work but is second.

## Product Purpose

Cover Review turns a pile of creator photos into ready-to-post covers. Each photo arrives with a quote, a song and a caption draft. The creator approves, passes, rates and leaves notes, and edits the quote's look on the cover itself. What she approves is what posts: the preview and the posted image share one layout.

Success: she clears her queue quickly, trusts that the cover she approved is the cover that posts, and never loses a decision or a note.

## Positioning

The portable edition of the Cover Review app that started inside Quill, the uBee founder's Muse. Any creator's Muse can run it, set it up, keep it updated, and fix it from in-app grievances. uBee clients can schedule approved covers through Pollen, uBee's own publisher.

## Operating Context

- Runs in a Muse space (a ported copy with platform server actions), as a hosted page, or as a Node app with a self-updater.
- Releases ship from uBee's public repo with release.json; hosted and ported copies show UPDATE NOW and apply each release's diff.
- Covers move through queue, approved and rejected. Approved covers can be scheduled with Pollen.
- Slides make a carousel post; the cover is slide one.

## Capabilities and Constraints

- Photos are the only hard requirement. Drive, Spotify, Instagram and Pollen are optional and never block review.
- Quote over image stays locked until the creator connects her own quotes or takes the quote quiz.
- Text color: the 11-color palette comes first; custom colors are allowed (confirmed for the Quill-style rebuild).
- Captions never use emoji or dashes for uBee clients.
- Data changes are additive only: new fields get defaults, nothing is dropped or rebuilt.
- Nothing creator-specific (names, photos, handles) ships in the public repo.

## Brand Commitments

- uBee bee and wordmark in chartreuse #C5FD29 stay on every creator copy (README).
- Visual reference for the review screen: Quill's Cover Review, screens 1 to 10 of the founder's screen recording (Nov 18, 2026). Confirmed binding: "look and work like Quill's version."

## Evidence on Hand

- Quill screen recording stills (10 screens), posted in the Beeline room on Nov 18, 2026.
- The uBee default quote pack (data/default-quotes.json) and the quiz pool (data/quiz-quotes.json).
- No real creator photos ship in the repo; demonstrations use synthetic images.

## Product Principles

1. What she approves is what posts. One layout drives the preview and the posted image.
2. The cover leads. Everything else is one tap away, never in the way.
3. Never lose her work. Decisions, notes and edits persist, and undo is always there.
4. Her Muse does the heavy lifting. Setup, imports and vision checks hand off to her Muse in plain words.

## Accessibility & Inclusion

Phone-first touch targets (44 px minimum), readable contrast on a dark screen, and every icon-only control carries a text label for screen readers.
