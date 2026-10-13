# dap brand kit

The twelve adopted masters use two opposite tails and an 8-unit gap on each side of the diamond. The wordmark canvas is 432 × 256. The source [guidelines](GUIDELINES.md) describe the logo, colours, typography, and variants.

To regenerate the master SVGs, copy `gen6.py` to a scratch directory and run `python3 gen6.py` there. It writes twelve masters and a tail comparison sheet in `kit/`. The comparison sheet is historical design material, not a served asset.

To regenerate all 23 files in `dist/`, run the repository producer with Node 26.11.1 and the entry file of sharp 0.35.4 installed outside the checkout:

```sh
node scripts/brand-dist.mjs /absolute/scratch/node_modules/sharp/dist/index.mjs
```

The producer prints each output’s byte count and SHA-256. Browser tab icons use the reversed, thinned two-tail path in white on a forest green disc. App and maskable icons retain their platform shapes. Fonts, font licences, `fonts.css`, and `tokens.css` do not change.
