#!/usr/bin/env python3
"""Derive Teletype33-Narrow.ttf from Teletype33.ttf: glyphs condensed 3% horizontally, every advance
width set to 528 units (from 614), glyphs re-centred in the narrower cell. The original is CC0; so is this.
Run in a scratch venv with fonttools: python3 narrow_teletype.py"""
from fontTools.ttLib import TTFont
ADV, XSCALE = 528, 0.97
f = TTFont('Teletype33.ttf'); hm = f['hmtx']; glyf = f['glyf']
for g in f.getGlyphOrder():
    adv, lsb = hm[g]; gl = glyf[g] if g in glyf else None
    if gl is not None and gl.numberOfContours:
        if not gl.isComposite():
            gl.coordinates.transform(((XSCALE, 0), (0, 1)))
        shift = int(round((adv * XSCALE - ADV) / 2))
        if gl.isComposite():
            for c in gl.components: c.x -= shift
        else:
            gl.coordinates.translate((-shift, 0))
        gl.recalcBounds(glyf); hm[g] = (ADV, gl.xMin)
    else:
        hm[g] = (ADV, 0)
f['hhea'].advanceWidthMax = ADV; f['OS/2'].xAvgCharWidth = ADV
for rec in f['name'].names:
    try: s = rec.toUnicode()
    except Exception: continue
    if 'Teletype33' in s: rec.string = s.replace('Teletype33', 'Teletype33 Narrow')
f.save('Teletype33-Narrow.ttf'); print('wrote Teletype33-Narrow.ttf')
