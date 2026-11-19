---
name: uBee Cover Review
description: A phone review tool that reads like the post it will become.
colors:
  true-black: "#000000"
  surface: "#1C1C1E"
  surface-raised: "#2C2C2E"
  hairline: "#262626"
  hairline-strong: "#3A3A3C"
  text: "#F5F5F5"
  text-secondary: "#D1D1D6"
  muted: "#8E8E93"
  off: "#48484A"
  bee-chartreuse: "#C5FD29"
  action-blue: "#0B63CE"
  link-blue: "#3797F0"
  focus-blue: "#0A84FF"
  pass-green: "#34C759"
  check-green: "#16A34A"
  remove-red: "#FF453A"
  error-red: "#FF6961"
  heart-red: "#FF3040"
  slider-cyan: "#32ADE6"
  play-green: "#1ED760"
typography:
  cover-quote:
    fontFamily: "'TikTok Sans', system-ui, sans-serif"
    fontSize: "31.9px"
    fontWeight: 500
    lineHeight: 1
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 700
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  body-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  sheet: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  lg: "20px"
  target: "44px"
components:
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    size: "44px"
  queue-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 8px 0 7px"
  mode-switch:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    height: "42px"
  mode-switch-on:
    backgroundColor: "{colors.true-black}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "42px"
  stepper:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    height: "52px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.true-black}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    height: "52px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    height: "52px"
    padding: "0 18px"
  link-button:
    backgroundColor: "transparent"
    textColor: "{colors.link-blue}"
    height: "44px"
    padding: "0 4px"
  field:
    backgroundColor: "{colors.true-black}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  tag:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  verdict-pass:
    backgroundColor: "#0F2E1A"
    textColor: "{colors.pass-green}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  slide-count:
    backgroundColor: "rgba(0, 0, 0, 0.6)"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  toast:
    backgroundColor: "{colors.text}"
    textColor: "{colors.true-black}"
    rounded: "{rounded.pill}"
    padding: "12px 18px"
---

# Design System: uBee Cover Review

## Overview

**Creative North Star: "The Post Before It Posts"**

The cover is the screen. The review tool reads like the Instagram post it will become: a true black ground, the cover full width at its posting ratio, and under it a row of thin line icons in Instagram's own order. A creator sees the cover exactly as it will post, decides with one tap, fixes the text right on the image, and checks the compose verdict before it goes out.

Everything around the cover is quiet. White type in the platform sans, rows split by hairlines instead of boxed in cards, color spent only where a platform already taught its meaning: blue to save and post, green to pass a check, red to remove or mark a like, chartreuse for the uBee bee and wordmark. Density is phone density: one column, 44 px targets, short labels.

The cover itself is drawn by the same code that makes the posted image, so its type and layout live in the renderer, not in the stylesheet.

**Key Characteristics:**
- True black ground, white platform sans, no decorative surfaces.
- The cover runs full bleed at 4:5 with a 1/N slide counter.
- One authored line icon set, one stroke weight.
- Segmented pills on the dark surface gray; the selected pill turns black with a white outline.
- Hairline dividers between content rows.
- Chartreuse is the brand mark, not the interface color.

## Colors

A near monochrome dark interface where every saturated color carries a platform meaning.

### Primary
- **Bee Chartreuse** (bee-chartreuse): The uBee bee in the header, the wordmark in the footer, the caret, text selection (at 35% alpha), the approved queue dot, approved badges and checks in the grid, success receipts, the update banner, and the Pollen scheduling actions in sheets. It marks the brand and the approved state.

### Secondary
- **Action Blue** (action-blue): The filled Add photos and Steal it buttons, and the pick hint on the cover. The one filled call to action on a screen. The editor has none: it saves as she goes.
- **Link Blue** (link-blue): Text actions such as Post on the note row and Save on the caption.
- **Focus Blue** (focus-blue): Keyboard focus rings and the selected text swatch ring.

### Tertiary
- **Pass Green** (pass-green): The queue dot, the PASS verdict text and every YES in the compose check.
- **Check Green** (check-green): Filled check dots in the compose check and the on state of switches.
- **Remove Red** (remove-red): Remove slide, delete text box, the passed queue dot and passed badges.
- **Error Red** (error-red): Error and problem text, the FAIL verdict and NO answers. Softer than Remove Red so it reads as text.
- **Heart Red** (heart-red): The liked heart in the action row, Instagram's own like red.
- **Slider Cyan** (slider-cyan): The filled part of every range slider track.
- **Play Green** (play-green): The round song play button, the music platform's own green.

### Neutral
- **True Black** (true-black): The page, the stage, selected segmented pills, fields and secondary buttons.
- **Surface Gray** (surface): Unselected segmented pills, the queue pill, steppers, tags and missing cover tiles.
- **Raised Gray** (surface-raised): Stepper inner dividers, pressed pills and count badges.
- **Hairline** (hairline): The 1 px dividers between rows and under the header.
- **Strong Hairline** (hairline-strong): Field and outline button borders, slider tracks at rest.
- **Text White** (text): Primary text and icons.
- **Secondary Text** (text-secondary): Quotes, tags, editor labels and longer reading text.
- **Muted Gray** (muted): Hints, meta lines, the cover count and uppercase step labels. Holds above 6:1 on black.
- **Off Gray** (off): Disabled icons and controls only. Never for readable text.

### Named Rules
**The Platform Color Rule.** Each saturated color keeps the meaning its platform taught: blue saves and posts, green passes, red removes or likes, the music green plays. A new color needs a platform reason.

**The Brand Mark Rule.** Chartreuse marks the bee, the wordmark, the approved state and scheduling. Save and Post stay blue.

## Typography

**Interface Font:** the platform sans (with Helvetica Neue, Helvetica, Arial fallbacks)
**Cover Font:** TikTok Sans (self hosted at 400, 500 and 700, with system-ui fallback)

**Character:** The interface speaks in the phone's own voice so the review screen feels native to the platform. The cover speaks in TikTok Sans so the quote looks the same on every device and in the posted image.

### Hierarchy
- **Cover Quote** (500, 31.9 px at a 494 px wide cover, line height 1): The quote on the image. The size is 55% of the Size slider (58 by default, never under 14 px) and scales with cover width over 494. Defaults come from the renderer: white, centered, 84% box width, 100% line height.
- **Headline** (700, 21 px): The library heading and empty state titles.
- **Title** (700, 19 px): The compose check heading and sheet headings. Check names sit one step below at 18 px.
- **Body Large** (400, 17 px, 1.35): Inputs, the note row, the song owner (700) and primary buttons (700).
- **Body** (400, 16 px, 1.4): Captions, quotes, reading text and outline buttons (600).
- **Meta** (400, 14 px, 1.4): Hints, check details and tags. The cover count in the header sits one step smaller, at 13 px.
- **Label** (700, 13 px, 0.08em, uppercase): Step labels such as Slides and Posts. Verdict chips and YES answers use the same size heavier (800) with slightly tighter tracking (0.04em to 0.06em).

### Named Rules
**The One Layout Rule.** Cover type is set by the renderer's defaults and drawn to canvas. Never restyle cover text in CSS; the preview and the posted image share one layout.

**The Tabular Count Rule.** Counts and slider values use tabular figures so they do not jitter as they change.

## Layout

One centered column, at most 560 px wide, with a 16 px gutter. The cover stage breaks out of the gutter to run edge to edge, and its height is always five fourths of its width. The header is a sticky 56 px row: back, queue pill, info, cover count, undo, redo, bee. Under the cover sits the six icon action row, then the Slides stepper and the Posts row, then the note, title, caption, compose check, reasons and ratings as hairline rows.

The editor is a sheet on the bottom edge, 56% of the screen tall at rest and 88% swiped up, and 760 px wide, with a 1.5% black background so the review screen shows through it, the way the original does. Its top carries a drag handle with a small save status at its right (Saves as you go, Saving, Saved), then New text box and Face mosaic, then the stretch sliders, all over the lower part of the cover. There is no button bar: its content scrolls clear of the host app's tab bar (92 px on touch screens). Toasts float above that bar.

The header fits a 375 px phone with the bee and every 44 px target, and no control ever shares its box with another that does something else: the queue pill tucks 4 px under the back button's empty edge (both open all covers), and the cover count may run 6 px into info's empty right edge and 4 px into undo's empty left edge while letting taps through to them. Undo and redo sit side by side, 44 px apart. Below 420 px the font and align controls stack. Below 390 px the queue pill drops its words and keeps the dot and count. Grids go from three to four columns at 520 px. Sheets rise from the bottom on a phone and center at 700 px and up.

### Named Rules
**The Cover Is The Screen Rule.** The cover takes the full width at 4:5 and nothing covers it except the slide counter and, while editing, its own tools.

**The 44 Rule.** Every tap target is at least 44 px square, including stars, swatches and stepper buttons.

## Elevation & Depth

The system is flat. Depth comes from tone (black ground, gray pills) and from hairlines. Shadows appear only on things that float over content: the toast, the selection bar, slider thumbs and the like burst. The header and the editor's tool buttons use backdrop blur so the cover stays visible underneath. Text in the see-through editor sheet carries a soft shadow (`0 1px 3px rgba(0, 0, 0, 0.75)`) so labels read over a bright photo.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55)`): The toast and the selection bar.
- **Thumb** (`box-shadow: 0 1px 5px rgba(0, 0, 0, 0.55)`): Slider thumbs and switch knobs.
- **Burst** (`filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.45))`): The heart that pops on a like.

### Named Rules
**The Flat Ground Rule.** Rows and controls never cast shadows at rest. Only floating layers do.

## Shapes

Corners follow the control's job. Icon buttons and segmented pills round at 12 px, fields, steppers and buttons at 14 px, outline buttons at 16 px, sheets at 20 px. Status and counting elements are full pills: the queue pill, tags, verdicts, the slide counter and the toast. Swatches, the play button and check dots are circles. Grid tiles keep square corners and a 3 px gap so the grid reads like a profile.

Icons are authored on a 24 px grid with a 1.75 stroke, round caps and round joins. Action row icons render at 28 px, stepper icons at 22 px.

### Named Rules
**The One Stroke Rule.** Every icon is a drawn line path from the app's own set at the same stroke weight. Fills appear only for state (a liked heart, the play triangle).

## Components

### Buttons
- **Shape:** Rounded rectangles (14 px), outline buttons slightly softer (16 px).
- **Primary:** Action Blue fill, white 17 px bold text, 52 px tall. Used for Add photos and Steal it.
- **Secondary:** Black fill with an Off Gray border, white text, same size. Used for See all covers and the info sheet's actions.
- **Outline:** Transparent with a Strong Hairline border, 16 px semibold, icon plus words. Used for Randomize layout and similar one off actions.
- **Link:** Link Blue bold text with no box, 44 px tall. Disabled turns a dark blue.
- **Press:** Icon buttons scale to 0.94 on press; hover adds a faint dark fill only on hover capable screens.

### Chips
- **Queue pill:** Surface Gray pill with a status dot (green queue, chartreuse approved, red passed) and the count, 14 px semibold. While the editor is open it locks like back and info: text and dot turn Off Gray.
- **Tags:** Surface Gray pills with Secondary Text.
- **Verdict:** Small uppercase pill, tinted by result: green on deep green for PASS, soft red on deep red for FAIL, muted on gray when idle.

### Cards / Containers
- **Rows, not cards:** Title, caption, note, image info and ratings sit on hairline dividers.
- **Compose check:** The one framed panel on the review screen. A 1 px border whose color is the verdict (deep green, deep red or Strong Hairline), 18 px corners, 16 px padding.
- **Sheets:** Dark panel rising from the bottom with 20 px top corners over a 66% black backdrop.

### Inputs / Fields
- **Style:** Black fill, Strong Hairline border, 14 px corners, 17 px text, chartreuse caret.
- **Focus:** The border lifts to Muted Gray. The note row is an underline field whose hairline lifts the same way.
- **Sliders:** 5 px track filled Slider Cyan up to the value, with a white 34 by 24 px pill thumb.
- **Switches:** 54 by 32 px, Strong Hairline off, Check Green on, with a sliding white knob.

### Navigation
- **Header:** Sticky 56 px row on 94% black with blur and a hairline under it. All icon buttons 44 px, the bee a 26 px mark at the right end. The cover count is muted, 13 px and right aligned; when the row is tight it drops the word Cover ("12 of 172").
- **Mode switch:** Two or three equal segmented pills. Unselected is Surface Gray with muted text; selected is black with a white 1 px outline and white text.
- **Steppers:** A Surface Gray capsule of 44 px buttons split by Raised Gray lines; the remove button turns red.

### Action Row
The signature row under the cover: like, repost, download, dislike, comment, edit, in that order, as 28 px line icons in 44 px targets set side by side with no gap, so the row stays a tight cluster at the left like Instagram's. No labels on screen, full labels for screen readers. Like fills Heart Red when the cover is approved.

### Cover Stage
The 4:5 canvas drawn by the posting renderer, with a dark translucent 1/N counter pill in the top right. While editing it sits above the sheet's outside-tap layer, so dragging moves the text directly and taps pick boxes, mosaics and colors.

### Magnifier
A 44 px glass in a dark translucent circle at the top left of the cover, the twin of the 1/N counter at the top right. It flies the photo up edge to edge over rgba(0, 0, 0, 0.72) with an 18 px backdrop blur, in 320 ms (none with reduced motion). Zoomed, a Reset zoom pill sits above the host app's tab bar.

### Editor Sheet
Bottom-anchored, two stops: 56% at rest and 88% swiped up, moving between them in 260 ms (none with reduced motion). The handle is a 44 by 5 px white bar in a full-width 30 px strip, with the save status in 13 px semibold Secondary Text at its right (Not saved yet in Error Red). A swipe up a quarter of the way to 88% goes there, and a swipe down a quarter of the way back returns to 56%; it never rests between them. From 56%, a drag past max(96 px, 16% of the screen) closes it. A tap on the handle, a tap off the sheet (the cover's empty frame included) or Escape closes it too, and every way of closing keeps the edits. The review screen behind it is inert while it is open.

Color swatches are 44 px circles. The 11 palette colors come first; Black 50% and White 50% sit in their own row under them, showing their tone at half strength over a gray checkerboard with 50% printed in 12 px bold, white on the black one and black on the white one. Custom colors sit in their own panel; Remove colors puts a white 20 px x badge on each swatch's top right corner, and a tap removes that color until Done.

## Do's and Don'ts

### Do:
- **Do** keep the cover full width at 4:5 and above everything else on the review screen.
- **Do** separate content rows with 1 px Hairline dividers.
- **Do** draw new icons on the 24 px grid at a 1.75 stroke with round caps and joins.
- **Do** use Action Blue for the one filled save or post action on a screen.
- **Do** keep every tap target at 44 px or more, and give every icon only control a screen reader label.
- **Do** use tabular figures for counts and values.
- **Do** honor reduced motion: the stylesheet turns every animation and transition off.

### Don't:
- **Don't** wrap review content (title, quote, caption, notes, ratings) in cards; frames are for status and controls.
- **Don't** style cover text in CSS; change the renderer defaults so preview and post stay one layout.
- **Don't** use emoji or text glyphs as icons.
- **Don't** bring in colors outside this palette, including other uBee brand colors.
- **Don't** use Off Gray for text anyone needs to read.
- **Don't** use gradient text.
