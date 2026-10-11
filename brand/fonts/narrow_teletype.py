#!/usr/bin/env python3
"""Derive Teletype33-Narrow.ttf from Teletype33.ttf: every advance width set to 540 units (from 614),
glyphs re-centred in the narrower cell. The original is CC0; this derivative is too.
Run: python3 narrow_teletype.py   (needs fonttools: pip install fonttools, in a scratch venv)"""
from fontTools.ttLib import TTFont
ADV = 540
f = TTFont('Teletype33.ttf'); hm = f['hmtx']; glyf = f['glyf']
for g in f.getGlyphOrder():
    adv, lsb = hm[g]; shift = (adv - ADV) // 2
    gl = glyf[g] if g in glyf else None
    if gl is not None and gl.numberOfContours:
        if gl.isComposite():
            for c in gl.components: c.x -= shift
        else:
            gl.coordinates.translate((-shift, 0))
        gl.recalcBounds(glyf); hm[g] = (ADV, lsb - shift)
    else:
        hm[g] = (ADV, 0)
f['hhea'].advanceWidthMax = ADV; f['OS/2'].xAvgCharWidth = ADV
for rec in f['name'].names:
    try: s = rec.toUnicode()
    except Exception: continue
    if 'Teletype33' in s: rec.string = s.replace('Teletype33', 'Teletype33 Narrow')
f.save('Teletype33-Narrow.ttf'); print('wrote Teletype33-Narrow.ttf')
