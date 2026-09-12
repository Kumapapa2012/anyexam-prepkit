#!/usr/bin/env python3
"""サンプル試験の画像素材（SVG）を生成する。

使い方:
    python cartridges/sample-exam/tools/make_images.py
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets"


def _pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def _minor(a1, a2):
    """2つの角度から、常に劣角（180°未満）側になるよう始点・終点・中間角を返す。
    atan2 は (-180, 180] を返すため、単純な差では ±180° をまたぐ角を取り違える。"""
    d = (a2 - a1) % 360
    if d > 180:
        a1, a2, d = a2, a1, 360 - d
    return a1, a2, a1 + d / 2


def arc(cx, cy, r, a1, a2, color):
    """角の印。角度は SVG 座標系（y 下向き）で atan2(dy, dx) の度数。"""
    a1, a2, _ = _minor(a1, a2)
    x1, y1 = _pt(cx, cy, r, a1)
    x2, y2 = _pt(cx, cy, r, a2)
    return ('<path d="M%.1f %.1f A%d %d 0 0 1 %.1f %.1f" stroke="%s" '
            'stroke-width="2.5" fill="none"/>' % (x1, y1, r, r, x2, y2, color))


def label(cx, cy, r, a1, a2, text, color):
    _, _, mid = _minor(a1, a2)
    x, y = _pt(cx, cy, r, mid)
    return ('<text x="%.1f" y="%.1f" font-size="15" fill="%s" text-anchor="middle" '
            'font-family="sans-serif">%s</text>' % (x, y + 5, color, text))


def street(traffic_light, car_color, coat_color, umbrella, dog):
    """同じ街角の風景。信号・車・外套の色などを差し替えて「よく似た2枚」を作る。"""
    lights = {"red": ("#e02020", "#3a3a3a", "#3a3a3a"),
              "green": ("#3a3a3a", "#3a3a3a", "#26c281")}
    r, y, g = lights[traffic_light]
    # 傘は頭の上に。人物の外套が隠れないようにする
    umb = ('<path d="M466 250 a30 30 0 0 1 60 0 z" fill="#d23c6a"/>'
           '<line x1="496" y1="250" x2="496" y2="292" stroke="#5a4632" stroke-width="3"/>'
           ) if umbrella else ""
    dg = ('<ellipse cx="360" cy="352" rx="16" ry="9" fill="#8a6a45"/>'
          '<circle cx="376" cy="343" r="7" fill="#8a6a45"/>'
          '<line x1="352" y1="358" x2="352" y2="366" stroke="#8a6a45" stroke-width="3"/>'
          '<line x1="368" y1="358" x2="368" y2="366" stroke="#8a6a45" stroke-width="3"/>'
          ) if dog else ""
    win_a = "".join('<rect x="%d" y="%d" width="16" height="20" fill="#5b6b78"/>' % (x, y0)
                    for x in (34, 62, 90, 118) for y0 in (108, 148, 188))
    win_b = "".join('<rect x="%d" y="%d" width="14" height="18" fill="#41525f"/>' % (x, y0)
                    for x in (162, 190, 218) for y0 in (70, 106, 142, 178))
    win_c = "".join('<rect x="%d" y="%d" width="18" height="22" fill="#56646f"/>' % (x, y0)
                    for x in (436, 470, 504, 538) for y0 in (90, 130, 170))
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380" width="600" height="380">
  <rect width="600" height="380" fill="#cfe6f5"/>
  <rect y="250" width="600" height="130" fill="#8f9296"/>
  <rect y="250" width="600" height="14" fill="#d8dade"/>
  <rect x="20" y="90" width="120" height="160" fill="#b9a58c"/>
  <rect x="150" y="50" width="100" height="200" fill="#9aa7b5"/>
  <rect x="258" y="120" width="90" height="130" fill="#c8b49a"/>
  <rect x="420" y="70" width="150" height="180" fill="#a2917c"/>
  {win_a}{win_b}{win_c}
  <rect x="368" y="150" width="26" height="66" rx="6" fill="#2f3640"/>
  <line x1="381" y1="216" x2="381" y2="264" stroke="#2f3640" stroke-width="6"/>
  <circle cx="381" cy="166" r="8" fill="{r}"/>
  <circle cx="381" cy="184" r="8" fill="{y}"/>
  <circle cx="381" cy="202" r="8" fill="{g}"/>
  <rect x="60" y="292" width="120" height="38" rx="10" fill="{car}"/>
  <rect x="86" y="268" width="70" height="30" rx="8" fill="{car}"/>
  <rect x="94" y="274" width="24" height="18" fill="#cfe6f5"/>
  <rect x="124" y="274" width="24" height="18" fill="#cfe6f5"/>
  <circle cx="90" cy="332" r="13" fill="#2b2b2b"/><circle cx="156" cy="332" r="13" fill="#2b2b2b"/>
  <circle cx="496" cy="272" r="12" fill="#f0c9a4"/>
  <rect x="483" y="286" width="26" height="42" rx="8" fill="{coat}"/>
  <rect x="486" y="328" width="8" height="22" fill="#3c3c3c"/>
  <rect x="498" y="328" width="8" height="22" fill="#3c3c3c"/>
  {umb}{dg}
</svg>""".format(win_a=win_a, win_b=win_b, win_c=win_c, r=r, y=y, g=g,
                 car=car_color, coat=coat_color, umb=umb, dg=dg)


def geometry_parallel():
    """平行線にはさまれた折れ線。x = 34 + 46 = 80°（P を通る平行線を引いて錯角）。"""
    qx, qy = 120.0, 60.0
    px, py = 260.0, 154.0
    rx, ry = 177.0, 240.0
    a_q = math.degrees(math.atan2(py - qy, px - qx))          # Q から P へ
    a_r = math.degrees(math.atan2(py - ry, px - rx))          # R から P へ
    a_pq = math.degrees(math.atan2(qy - py, qx - px))         # P から Q へ
    a_pr = math.degrees(math.atan2(ry - py, rx - px))         # P から R へ
    marks = (arc(qx, qy, 34, 0, a_q, "#1cb0f6")
             + label(qx, qy, 50, 0, a_q, "34°", "#1cb0f6")
             + arc(rx, ry, 34, a_r, 0, "#58cc02")
             + label(rx, ry, 52, a_r, 0, "46°", "#46a302")
             + arc(px, py, 30, a_pr, a_pq, "#ff4b4b")
             + label(px, py, 48, a_pr, a_pq, "x", "#e63838"))
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 300" width="460" height="300">
  <rect width="460" height="300" fill="#ffffff"/>
  <g stroke="#3c3c3c" stroke-width="2.5" fill="none">
    <line x1="40" y1="60" x2="430" y2="60"/>
    <line x1="40" y1="240" x2="430" y2="240"/>
    <line x1="120" y1="60" x2="260" y2="154"/>
    <line x1="177" y1="240" x2="260" y2="154"/>
  </g>
  <text x="404" y="50" font-size="16" fill="#777" font-family="sans-serif">l</text>
  <text x="404" y="262" font-size="16" fill="#777" font-family="sans-serif">m</text>
  <text x="112" y="48" font-size="15" fill="#3c3c3c" font-family="sans-serif">Q</text>
  <text x="270" y="160" font-size="15" fill="#3c3c3c" font-family="sans-serif">P</text>
  <text x="170" y="262" font-size="15" fill="#3c3c3c" font-family="sans-serif">R</text>
  {marks}
  <text x="40" y="285" font-size="14" fill="#777" font-family="sans-serif">l // m</text>
</svg>""".format(marks=marks)


def geometry_circle():
    """円周角の定理。中心角 116° に対する円周角 x = 58°。"""
    ox, oy, r = 210.0, 160.0, 120.0
    half = 58.0                       # 中心角 116° の半分
    ax, ay = _pt(ox, oy, r, 90 + half)   # 下向きから左へ 58°
    bx, by = _pt(ox, oy, r, 90 - half)   # 下向きから右へ 58°
    pxx, pyy = _pt(ox, oy, r, -90)       # 円の最上部
    a_oa = math.degrees(math.atan2(ay - oy, ax - ox))
    a_ob = math.degrees(math.atan2(by - oy, bx - ox))
    a_pa = math.degrees(math.atan2(ay - pyy, ax - pxx))
    a_pb = math.degrees(math.atan2(by - pyy, bx - pxx))
    marks = (arc(ox, oy, 36, a_ob, a_oa, "#1cb0f6")
             + label(ox, oy, 56, a_ob, a_oa, "116°", "#1cb0f6")
             + arc(pxx, pyy, 34, a_pa, a_pb, "#ff4b4b")
             + label(pxx, pyy, 52, a_pa, a_pb, "x", "#e63838"))
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 320" width="420" height="320">
  <rect width="420" height="320" fill="#ffffff"/>
  <circle cx="210" cy="160" r="120" stroke="#3c3c3c" stroke-width="2.5" fill="none"/>
  <circle cx="210" cy="160" r="3.5" fill="#3c3c3c"/>
  <g stroke="#3c3c3c" stroke-width="2.5">
    <line x1="210" y1="160" x2="{ax:.1f}" y2="{ay:.1f}"/>
    <line x1="210" y1="160" x2="{bx:.1f}" y2="{by:.1f}"/>
    <line x1="{ax:.1f}" y1="{ay:.1f}" x2="{px:.1f}" y2="{py:.1f}"/>
    <line x1="{bx:.1f}" y1="{by:.1f}" x2="{px:.1f}" y2="{py:.1f}"/>
  </g>
  <text x="226" y="176" font-size="15" fill="#3c3c3c" font-family="sans-serif">O</text>
  <text x="{ax:.0f}" y="{aly:.0f}" font-size="15" fill="#3c3c3c" text-anchor="end" font-family="sans-serif">A</text>
  <text x="{bx:.0f}" y="{aly:.0f}" font-size="15" fill="#3c3c3c" font-family="sans-serif">B</text>
  <text x="{px:.0f}" y="{ply:.0f}" font-size="15" fill="#3c3c3c" text-anchor="middle" font-family="sans-serif">P</text>
  {marks}
</svg>""".format(ax=ax, ay=ay, bx=bx, by=by, px=pxx, py=pyy,
                 aly=ay + 24, ply=pyy - 12, marks=marks)


def bar_chart():
    """月別売上の棒グラフ。読み取り問題用。"""
    data = [("1月", 42), ("2月", 35), ("3月", 58), ("4月", 51), ("5月", 67), ("6月", 49)]
    bars = []
    for i, (label, v) in enumerate(data):
        x = 70 + i * 62
        h = v * 3
        bars.append('<rect x="%d" y="%d" width="40" height="%d" fill="#1cb0f6"/>'
                    '<text x="%d" y="278" font-size="13" fill="#3c3c3c" text-anchor="middle" '
                    'font-family="sans-serif">%s</text>' % (x, 260 - h, h, x + 20, label))
    grid = "".join('<line x1="60" y1="%d" x2="450" y2="%d" stroke="#e5e5e5" stroke-width="1"/>'
                   '<text x="52" y="%d" font-size="11" fill="#777" text-anchor="end" '
                   'font-family="sans-serif">%d</text>'
                   % (260 - v * 3, 260 - v * 3, 265 - v * 3, v) for v in (20, 40, 60, 80))
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 300" width="470" height="300">
  <rect width="470" height="300" fill="#ffffff"/>
  <text x="60" y="28" font-size="15" font-weight="bold" fill="#3c3c3c" font-family="sans-serif">月別売上（万円）</text>
  {grid}
  <line x1="60" y1="260" x2="450" y2="260" stroke="#3c3c3c" stroke-width="2"/>
  <line x1="60" y1="40" x2="60" y2="260" stroke="#3c3c3c" stroke-width="2"/>
  {bars}
</svg>""".format(grid=grid, bars="".join(bars))


def flowchart():
    """条件分岐のあるフローチャート。"""
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 400" width="420" height="400">
  <rect width="420" height="400" fill="#ffffff"/>
  <g font-family="sans-serif" font-size="14" fill="#3c3c3c" text-anchor="middle">
    <rect x="140" y="20" width="140" height="42" rx="21" fill="#d7ffb8" stroke="#46a302" stroke-width="2"/>
    <text x="210" y="47">開始</text>
    <rect x="130" y="92" width="160" height="44" fill="#e8f7ff" stroke="#1cb0f6" stroke-width="2"/>
    <text x="210" y="120">数値 n を入力</text>
    <path d="M210 166 L300 206 L210 246 L120 206 Z" fill="#fff6d6" stroke="#e0a800" stroke-width="2"/>
    <text x="210" y="212">n は 10 以上？</text>
    <rect x="16" y="278" width="150" height="44" fill="#e8f7ff" stroke="#1cb0f6" stroke-width="2"/>
    <text x="91" y="306">「小」と表示</text>
    <rect x="254" y="278" width="150" height="44" fill="#e8f7ff" stroke="#1cb0f6" stroke-width="2"/>
    <text x="329" y="306">「大」と表示</text>
    <rect x="140" y="344" width="140" height="42" rx="21" fill="#ffdfe0" stroke="#e63838" stroke-width="2"/>
    <text x="210" y="371">終了</text>
  </g>
  <g stroke="#3c3c3c" stroke-width="2" fill="none">
    <line x1="210" y1="62" x2="210" y2="92"/>
    <line x1="210" y1="136" x2="210" y2="166"/>
    <line x1="120" y1="206" x2="91" y2="206"/><line x1="91" y1="206" x2="91" y2="278"/>
    <line x1="300" y1="206" x2="329" y2="206"/><line x1="329" y1="206" x2="329" y2="278"/>
    <line x1="91" y1="322" x2="91" y2="365"/><line x1="91" y1="365" x2="140" y2="365"/>
    <line x1="329" y1="322" x2="329" y2="365"/><line x1="329" y1="365" x2="280" y2="365"/>
  </g>
  <text x="72" y="198" font-size="12" fill="#777" font-family="sans-serif">いいえ</text>
  <text x="310" y="198" font-size="12" fill="#777" font-family="sans-serif">はい</text>
</svg>"""


def circuit():
    """並列回路。合成抵抗を問う。"""
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" width="420" height="260">
  <rect width="420" height="260" fill="#ffffff"/>
  <g stroke="#3c3c3c" stroke-width="2.5" fill="none">
    <path d="M60 130 L60 60 L150 60"/><path d="M270 60 L360 60 L360 130"/>
    <path d="M60 130 L60 200 L150 200"/><path d="M270 200 L360 200 L360 130"/>
    <path d="M20 130 L60 130"/><path d="M360 130 L400 130"/>
    <rect x="150" y="44" width="120" height="32" fill="#ffffff"/>
    <rect x="150" y="184" width="120" height="32" fill="#ffffff"/>
  </g>
  <g font-family="sans-serif" font-size="16" fill="#3c3c3c" text-anchor="middle">
    <text x="210" y="66">6 Ω</text>
    <text x="210" y="206">3 Ω</text>
  </g>
  <text x="14" y="124" font-size="15" fill="#3c3c3c" font-family="sans-serif">A</text>
  <text x="392" y="124" font-size="15" fill="#3c3c3c" font-family="sans-serif">B</text>
</svg>"""


def shapes():
    """4つの図形。線対称でないもの（平行四辺形）を選ばせる。"""
    def poly(cx, cy, r, n, rot):
        pts = [_pt(cx, cy, r, rot + i * 360.0 / n) for i in range(n)]
        return " ".join("%.1f,%.1f" % p for p in pts)

    tri = poly(60, 74, 40, 3, -90)
    pent = poly(400, 72, 40, 5, -90)
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 170" width="460" height="170">
  <rect width="460" height="170" fill="#ffffff"/>
  <g stroke="#3c3c3c" stroke-width="2.5" fill="#eef4f8">
    <polygon points="{tri}"/>
    <polygon points="146,102 182,42 240,42 204,102"/>
    <rect x="256" y="44" width="72" height="56"/>
    <polygon points="{pent}"/>
  </g>
  <g font-family="sans-serif" font-size="16" fill="#3c3c3c" text-anchor="middle">
    <text x="60" y="152">ア</text><text x="193" y="152">イ</text>
    <text x="292" y="152">ウ</text><text x="400" y="152">エ</text>
  </g>
</svg>""".format(tri=tri, pent=pent)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        # 「よく似た2枚」その1: 信号の色と車の色が違う
        "street-1a.svg": street("red", "#d94f4f", "#3f5f8f", umbrella=False, dog=False),
        "street-1b.svg": street("green", "#3f7fd9", "#3f5f8f", umbrella=False, dog=False),
        # 「よく似た2枚」その2: 傘と犬の有無が違う
        "street-2a.svg": street("green", "#e8b53a", "#7a3f8f", umbrella=True, dog=False),
        "street-2b.svg": street("green", "#e8b53a", "#7a3f8f", umbrella=False, dog=True),
        "geo-parallel.svg": geometry_parallel(),
        "geo-circle.svg": geometry_circle(),
        "chart-sales.svg": bar_chart(),
        "flowchart.svg": flowchart(),
        "circuit.svg": circuit(),
        "shapes.svg": shapes(),
    }
    for name, body in files.items():
        (OUT / name).write_text(body, encoding="utf-8")
        print("  %-20s %5d bytes" % (name, len(body.encode("utf-8"))))
    print("✓ 画像 %d 件 → %s" % (len(files), OUT))


if __name__ == "__main__":
    main()
