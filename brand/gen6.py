#!/usr/bin/env python3
"""dap identity, final generator. The symbol is the a: a sharp diamond with a halved-square tail
set in the corner of the diamond's bounding square, so the tail is symmetric about the diamond's
lower-right diagonal. No rune.

Grid: 256 canvas, 8 unit module. Wordmark: x-height 120, stroke 26, rings of radius 60,
ascender 170, descender 48. The a: diamond half-diagonal 70 (10 past the x-height), tail side TAIL.
"""
import os, math, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kit')
os.makedirs(OUT, exist_ok=True)

INK, GREEN, BONE = '#16180F', '#123F2B', '#F3F1EA'
XH, ST, RO, ASC, DESC, GAP = 120, 26, 60, 170, 48, 24
RI = RO - ST
A_H, A_GAP = 72, 12
TAIL, TAIL_GAP = 36, 12   # tail side; perpendicular gap from the tail's cut to the diamond's edge

def f1(v): return f'{v:.1f}'.rstrip('0').rstrip('.')

def svg(w, h, title, body, bg=None):
    rect = f'  <rect width="{w}" height="{h}" fill="{bg}"/>\n' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t">\n'
            f'  <title id="t">{title}</title>\n{rect}{body}</svg>\n')

def path(d, fill=INK):
    return f'  <path fill="{fill}" d="{d}"/>\n'

def ring(cx, cy, ro, ri):
    return (f'M{cx-ro} {cy} A{ro} {ro} 0 1 1 {cx+ro} {cy} A{ro} {ro} 0 1 1 {cx-ro} {cy} Z '
            f'M{cx-ri} {cy} A{ri} {ri} 0 1 0 {cx+ri} {cy} A{ri} {ri} 0 1 0 {cx-ri} {cy} Z')

def rhombus(cx, cy, h):
    return f'M{f1(cx)} {f1(cy-h)} L{f1(cx+h)} {f1(cy)} L{f1(cx)} {f1(cy+h)} L{f1(cx-h)} {f1(cy)} Z'

def a_glyph(x, base, h=A_H, tail=TAIL, gap=TAIL_GAP, stroke=ST, pin=False):
    """Diamond outline centred on the x-height, half-diagonal h (overshooting the x-height by h - 60).
    Tail: a halved square of side `tail` sitting on the baseline, its cut parallel to the diamond's
    lower-right edge at perpendicular distance `gap`. pin=True ignores gap and puts the tail's right
    edge on the diamond's right vertex. Returns (path, advance)."""
    cx, cy = x + h, base - XH / 2
    t = stroke * math.sqrt(2)
    outer = rhombus(cx, cy, h)
    inner = f'M{f1(cx)} {f1(cy-(h-t))} L{f1(cx-(h-t))} {f1(cy)} L{f1(cx)} {f1(cy+(h-t))} L{f1(cx+(h-t))} {f1(cy)} Z'
    if pin:
        sx = cx + h - tail
    else:
        # cut line x + y = (cx + cy + h) + gap*sqrt2 ; it meets the baseline at sx
        sx = cx + cy + h + gap * math.sqrt(2) - base
    tri = f'M{f1(sx)} {f1(base)} L{f1(sx+tail)} {f1(base-tail)} L{f1(sx+tail)} {f1(base)} Z'
    return f'{outer} {inner} {tri}', 2 * h

def letter(ch, x, base):
    cy = base - XH / 2
    if ch == 'd':
        cx = x + RO; sx = cx + RO - ST; top = base - ASC
        stem = f'M{sx} {top+ST} L{sx+ST} {top} L{sx+ST} {base} L{sx} {base} Z'
        return ring(cx, cy, RO, RI) + ' ' + stem, 2 * RO
    if ch == 'p':
        cx = x + RO; sx = x; bot = base + DESC
        stem = f'M{sx} {base-XH} L{sx+ST} {base-XH} L{sx+ST} {bot-ST} L{sx} {bot} Z'
        return stem + ' ' + ring(cx, cy, RO, RI), 2 * RO
    if ch == 'a':
        return a_glyph(x, base)
    raise ValueError(ch)

def wordmark(x0, base, **kw):
    d, x = [], x0
    pd, adv = letter('d', x, base); d.append(pd); x += adv + A_GAP
    pa, adv = a_glyph(x, base, **kw); d.append(pa); x += adv + A_GAP
    pp, adv = letter('p', x, base); d.append(pp); x += adv
    return ' '.join(d), x - x0

WM_W = 4 * RO + 2 * A_H + 2 * A_GAP   # 404

# ---- symbol: the a alone, scaled into the 256 box ----
def symbol(fill=INK, pad=0.08, stroke_scale=1.0, tail=TAIL):
    """The a glyph as a square symbol. Its bounding square is 2h wide; scale it to the canvas minus padding."""
    size = 256 * (1 - 2 * pad); s = size / (2 * A_H)
    d, _ = a_glyph(0, XH / 2 + A_H, tail=tail, stroke=ST * stroke_scale)   # bbox: x 0..140, y 0..140
    return f'  <g transform="translate({f1(128 - A_H * s)} {f1(128 - A_H * s)}) scale({f1(s)})"><path fill="{fill}" d="{d}"/></g>\n'

def write(name, content):
    p = os.path.join(OUT, name); open(p, 'w').write(content); print('wrote', p)

if __name__ == '__main__':
    base = 188
    wm, w = wordmark(16, base)
    write('dap-wordmark.svg', svg(int(w + 32), 256, 'dap wordmark', path(wm)))
    write('dap-wordmark-green.svg', svg(int(w + 32), 256, 'dap wordmark', path(wm, GREEN)))
    write('dap-wordmark-on-green.svg', svg(int(w + 32), 256, 'dap wordmark on green', path(wm, BONE), bg=GREEN))
    write('dap-wordmark-on-ink.svg', svg(int(w + 32), 256, 'dap wordmark on ink', path(wm, BONE), bg=INK))
    write('dap-symbol.svg', svg(256, 256, 'dap symbol', symbol()))
    write('dap-symbol-green.svg', svg(256, 256, 'dap symbol', symbol(GREEN)))
    write('dap-symbol-small.svg', svg(256, 256, 'dap symbol, small sizes', symbol(stroke_scale=0.92, pad=0.04)))
    write('dap-symbol-reversed.svg', svg(256, 256, 'dap symbol, reversed (thinned)', symbol('#FFFFFF', stroke_scale=0.92)))
    write('dap-symbol-on-green.svg', svg(256, 256, 'dap symbol on green', symbol(BONE, stroke_scale=0.92), bg=GREEN))
    for name, hexv in (('garnet', '#7A1F2E'), ('violet', '#3E3A8C'), ('ink', INK)):
        write(f'alt-wordmark-{name}.svg', svg(int(w + 32), 256, f'dap wordmark, {name}', path(wm, hexv)))
    # tail comparison sheet
    rows = ''; y = 40
    for label, kw in (('T1 tail 36 pinned to the vertex, gap 17', dict(tail=36, pin=True)),
                      ('T2 tail 36, gap 12 (right edge 7 inside the vertex)', dict(tail=36, gap=12)),
                      ('T3 tail 32, gap 12 (right edge 11 inside)', dict(tail=32, gap=12)),
                      ('T4 tail 36, gap 10', dict(tail=36, gap=10)),
                      ('T5 tail 40, gap 12 (right edge 3 inside)', dict(tail=40, gap=12))):
        d, w = wordmark(0, 188, **kw)
        rows += f'<g transform="translate(60 {y})">{path(d, GREEN)}</g><line x1="60" x2="480" y1="{y+188}" y2="{y+188}" stroke="#bbb" stroke-width="1" stroke-dasharray="4 4"/><text x="520" y="{y+150}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="{INK}">{label}</text>'
        y += 280
    write('tail-sheet.svg', svg(900, y, 'tail sizes', rows, bg=BONE))
