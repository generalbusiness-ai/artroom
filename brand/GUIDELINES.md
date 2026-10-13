# dap logo guidelines

One page, for people who are not designers. More do than don't.

## 1. The logo

- **Idea.** The word is the logo. Its a is a sharp diamond with two opposite tails: the seed of a record, and the same 45 degree cut that the d and the p carry. The a alone is the symbol.
- **Versions.** Wordmark (primary), symbol (the a) for icons and avatars.
- **Files.** `dap-*.svg` are the masters. `dist/` holds the one-colour versions, the square avatar, the favicon and the web icon set. Use SVG wherever you can; use the PNGs where you cannot.

| Use | File |
|---|---|
| README, website header, documents | `dap-wordmark-green.svg`, or `dist/dap-wordmark-white.svg` on green or ink |
| Avatar, social profile | `dist/dap-symbol-square.svg` on bone, or `dist/dap-symbol-app-icon.svg` |
| Browser tab | `dist/favicon.svg` and `dist/favicon.ico` |
| App icon, PWA | `dist/apple-touch-icon.png`, `dist/icon-192.png`, `dist/icon-512.png`, `dist/maskable-512.png`, `dist/site.webmanifest`, `dist/head-snippet.html` |
| Dark backgrounds | `dap-symbol-reversed.svg` (thinned), `dap-wordmark-on-green.svg`, `dap-wordmark-on-ink.svg` |

## 2. Clear space

Keep a clear zone equal to the a's tail (the side of the small triangle) on all sides of any version. The zone scales with the logo. Never use a fixed distance.

## 3. Minimum size

| Version | Screen | Print |
|---|---|---|
| Wordmark | 72 px wide | 18 mm wide |
| Symbol | 16 px tall | 5 mm tall |

The small cut in `dap-symbol-small.svg` has less padding and a lighter stroke. Browser tab icons use that thinned path in white (#FFFFFF) on a forest green (#123F2B) disc, with transparent corners. At 16 pixels, check that both tails remain distinct before using the icon.

## 4. Colour

| Name | HEX | RGB | Use |
|---|---|---|---|
| Forest green | #123F2B | 18 63 43 | The logo, links, primary actions |
| Ink | #16180F | 22 24 15 | Text, dark surfaces |
| Bone | #F3F1EA | 243 241 234 | Light surfaces |
| White | #FFFFFF | 255 255 255 | Reversed logo on green or ink |
| Garnet | #7A1F2E | 122 31 46 | Refusals and removals only; never the logo |

CMYK and Pantone matches are to be chosen at the first print job; the HEX values are the reference until then.

Approved pairs: green on bone, green on white, white on green, white on ink, ink on bone, black on white. Contrast of green on bone is 10.5 to 1 and of white on green is 11.9 to 1, both above the AA threshold for text.

Cyan and amber are reserved for woah and keep. Do not use them with the dap logo.

## 5. Typography

- **Wordmark.** Constructed paths, not a font. Never type it.
- **Interface and documents.** Open Runde (400, 500, 600, 700) for text and headings: a softly rounded cut of Inter, SIL Open Font License, self-hosted from `fonts/`. Fallback stack: `system-ui, -apple-system, Helvetica, Arial, sans-serif`.
- **Labels and receipts.** Teletype33 for eyebrows, chips, receipts and the "dap." line: the Teletype Model 33 typewheel with lowercase, CC0, self-hosted from `fonts/`. The kit uses `Teletype33-Narrow.ttf`, a derivative with the advance width set to 540 units from the original 614 (`fonts/narrow_teletype.py` makes it); the original stays in `fonts/` for terminal emulation only. Use it at 13 px or larger and without extra letter spacing. Fallback: `ui-monospace, Menlo, monospace`.
- **Code and data.** Sometype Mono (400, 500) for code blocks, hashes and tables, SIL Open Font License, from Google Fonts or self-hosted. Fallback: `ui-monospace, Menlo, monospace`.
- **Voice.** "dap." is the one-word acknowledgement the room returns when an act takes effect: the last line of the CLI, the toast, the receipt.

## 6. Don't

Don't stretch, squash, rotate or slant it. Don't recolour outside the palette. Don't add shadows, outlines, gradients or effects. Don't separate either tail from the a or move it. Don't put the tails on entry markers; they belong to the logo. Don't put it on a busy background without the tile. Don't retype the wordmark.

## 7. Masters and construction

`gen6.py` regenerates the master SVGs from the construction: a 256 grid with an 8 unit module; letters built from rings of radius 60 and stems of width 26 on an x-height of 120, with the ascender of d (170) and the descender of p (48) cut at 45 degrees. The a is a diamond outline of half diagonal 72, twelve units past the x-height so it sits even with the round letters, with a perpendicular stroke of 26. Its tail is a halved square of side 36 that sits on the baseline, its cut parallel to the diamond's lower-right edge at a perpendicular gap of 12; that places its right edge seven units inside the diamond's right vertex. The second tail is the first rotated 180 degrees about the diamond’s centre. Letter spacing is 8 on either side of the a. The wordmark canvas is 432 × 256; keep its displayed height when replacing the earlier 440 × 256 drawing.
