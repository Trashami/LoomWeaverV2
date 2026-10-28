"""Build original numeral-only fantasy faces. Requires fonttools and brotli.

No game or film font assets are used. Outlines are authored here, so the fonts
can be shipped, modified, and rebuilt with the application.
"""
from pathlib import Path
import math
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = Path(__file__).resolve().parents[1] / 'frontend/public/dice-fonts'

# Legible Arabic numerals, carved with long strokes and chisel terminals.
RUNE = [
    [[(300, 720), (480, 550), (480, 170), (300, 0), (120, 170), (120, 550), (300, 720)]],
    [[(170, 525), (315, 700), (315, 0)], [(180, 0), (430, 0)]],
    [[(125, 560), (300, 720), (475, 550), (475, 430), (125, 0), (480, 0)]],
    [[(130, 690), (455, 690), (280, 370), (455, 210), (455, 90), (290, 0), (130, 90)]],
    [[(425, 0), (425, 720), (110, 250), (500, 250)]],
    [[(475, 700), (135, 700), (135, 390), (335, 390), (475, 240), (475, 130), (290, 0), (110, 115)]],
    [[(440, 700), (280, 600), (120, 350), (120, 140), (300, 0), (480, 145), (480, 315), (300, 440), (120, 315)]],
    [[(100, 700), (495, 700), (240, 0)], [(250, 350), (460, 350)]],
    [[(300, 720), (470, 560), (300, 365), (120, 165), (300, 0), (480, 165), (300, 365), (130, 560), (300, 720)]],
    [[(470, 390), (290, 270), (115, 420), (115, 560), (290, 710), (470, 560), (470, 350), (310, 100), (145, 0)]],
]

# Cubic pen strokes. Each tuple after the first is (control1, control2, end).
ELVEN = [
    [(300, 710), ((45, 680), (60, 40), (275, 0)), ((530, -40), (550, 670), (300, 710))],
    [(140, 515), ((260, 560), (320, 700), (345, 710)), ((260, 470), (310, 170), (275, 15)), ((245, -20), (170, -20), (120, 10))],
    [(100, 550), ((130, 795), (560, 755), (465, 490)), ((420, 340), (130, 200), (110, 15)), ((220, 80), (460, -60), (500, 70))],
    [(100, 620), ((290, 830), (560, 650), (345, 385)), ((630, 350), (410, -180), (100, 50))],
    [(410, 10), ((380, 270), (430, 560), (435, 720))],
    [(480, 710), ((380, 630), (230, 710), (145, 680)), ((155, 560), (120, 455), (110, 365)), ((430, 540), (610, 195), (350, 25)), ((240, -55), (125, -5), (95, 65))],
    [(450, 720), ((120, 700), (20, 100), (245, 15)), ((530, -90), (600, 410), (345, 405)), ((220, 410), (150, 280), (160, 240))],
    [(90, 660), ((210, 810), (365, 615), (510, 710)), ((355, 485), (220, 150), (265, 0))],
    [(305, 360), ((-80, 480), (185, 890), (420, 665)), ((580, 500), (270, 340), (160, 200)), ((-10, -40), (510, -115), (495, 155)), ((490, 270), (345, 335), (305, 360))],
    [(445, 450), ((500, 810), (105, 775), (95, 505)), ((65, 270), (365, 245), (445, 450)), ((500, 230), (330, -40), (120, 0))],
]

def cubic_points(path):
    points = [path[0]]
    for c1, c2, end in path[1:]:
        start = points[-1]
        for i in range(1, 19):
            t = i / 18
            points.append(tuple((1-t)**3*start[k] + 3*(1-t)**2*t*c1[k] + 3*(1-t)*t*t*c2[k] + t**3*end[k] for k in (0, 1)))
    return points

def outline(pen, points, width, curved=False, ring=False):
    left, right = [], []
    for i, (x, y) in enumerate(points):
        before, after = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        dx, dy = after[0]-before[0], after[1]-before[1]
        length = max(1, math.hypot(dx, dy))
        # Broad-nib contrast and taper give the flowing faces calligraphic weight.
        w = width * (0.32 + 0.68 * abs(dy)/length) if curved else width
        if curved: w *= 0.55 + 0.45 * math.sin(math.pi * i / max(1, len(points)-1))
        x += y * (0.035 if ring else 0.14) if curved else 0
        left.append((round(x-dy/length*w/2), round(y+dx/length*w/2)))
        right.append((round(x+dy/length*w/2), round(y-dx/length*w/2)))
    polygon = left + list(reversed(right))
    pen.moveTo(polygon[0])
    for point in polygon[1:]: pen.lineTo(point)
    pen.closePath()

def build(style, family):
    glyphs = {}; names = ['.notdef', 'space', 'period'] + ['digit'+str(i) for i in range(10)]
    for name in names:
        pen = TTGlyphPen(None)
        if name.startswith('digit'):
            n = int(name[-1])
            if style == 'nordic-runes':
                for path in RUNE[n]: outline(pen, path, 58)
                # Diamond-ended incised strokes, no substitute rune characters.
                for path in RUNE[n]:
                    for x, y in (path[0], path[-1]):
                        outline(pen, [(x-34, y-27), (x+34, y+27)], 19)
            else:
                outline(pen, cubic_points(ELVEN[n]), 90 if style == 'ring-script' else 66, True, style == 'ring-script')
                if n == 4:
                    outline(pen, cubic_points([(350, 690), ((260, 440), (140, 370), (100, 235)), ((200, 195), (410, 280), (510, 290))]), 65, True)
                if style == 'ring-script':
                    for x, y in [ELVEN[n][0], ELVEN[n][-1][-1]]:
                        outline(pen, [(x-30,y-10),(x,y+16),(x+30,y-10)], 24, True)
        elif name == 'period': outline(pen, [(250, 30), (300, 30)], 55)
        glyphs[name] = pen.glyph()
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({32:'space', 46:'period', **{48+i:'digit'+str(i) for i in range(10)}})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name:(650, 50) for name in names})
    fb.setupHorizontalHeader(ascent=820, descent=-180)
    fb.setupNameTable({'familyName':family, 'styleName':'Regular', 'uniqueFontIdentifier':family+' 1.0',
                      'fullName':family, 'psName':family.replace(' ', ''), 'version':'Version 1.0',
                      'copyright':'Original LoomWeaver numeral designs. Copyright 2026 LoomWeaver.'})
    fb.setupOS2(sTypoAscender=820, sTypoDescender=-180, usWinAscent=850, usWinDescent=180, sxHeight=700, sCapHeight=720)
    fb.setupPost(); fb.setupMaxp(); fb.font.flavor = 'woff2'
    OUT.mkdir(parents=True, exist_ok=True); fb.save(OUT / (style+'.woff2'))

if __name__ == '__main__':
    for name, family in [('nordic-runes','Loom Nordic Runes'), ('elven-script','Loom Elven'), ('ring-script','Loom Ring Script')]:
        build(name, family)
    print('Built three original fantasy numeral fonts.')
