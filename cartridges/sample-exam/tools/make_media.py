#!/usr/bin/env python3
"""サンプル試験の音声・動画素材を生成する。

音声は Windows の読み上げ（System.Speech）で合成し、ffmpeg で mp3 にする。
ニュース映像は手元の動画を軽量化して取り込む（既定で 2MB 以下になるようにする）。

使い方:
    python cartridges/sample-exam/tools/make_media.py
    python cartridges/sample-exam/tools/make_media.py --news "C:/path/to/news.mp4"
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets"

FEMALE = "Microsoft Zira Desktop"
MALE = "Microsoft David Desktop"

# 会話・アナウンスの台本。(話者, セリフ) の並び。
SCRIPTS = {
    "conv-office": [
        (FEMALE, "Good morning, Tom. Did you finish the sales report?"),
        (MALE, "Not yet, Anna. I still need the figures from the Osaka branch."),
        (FEMALE, "The meeting is on Thursday, so we need it by Wednesday evening."),
        (MALE, "Understood. I will call Osaka this afternoon and finish it tomorrow."),
        (FEMALE, "Thanks. Please send it to me before you leave."),
    ],
    "conv-travel": [
        (MALE, "Are we still going to the mountains this weekend?"),
        (FEMALE, "Yes, but the forecast says it will be cold on Sunday morning."),
        (MALE, "Then I will bring my heavy jacket and the thermos."),
        (FEMALE, "Good idea. I will pack the map and some sandwiches."),
        (MALE, "Let us leave at six so we can arrive before the sunrise."),
    ],
    "ann-train": [
        (FEMALE, "Attention please. The nine forty express to Sendai "
                 "will depart from platform five, not platform three. "
                 "Passengers on platform three, please move to platform five."),
    ],
    "ann-store": [
        (MALE, "Thank you for shopping with us. The store will close at eight p.m. today. "
               "The bakery on the first floor closes thirty minutes earlier."),
    ],
    "weather": [
        (FEMALE, "Here is the weekly forecast. Monday will be sunny and warm. "
                 "Tuesday, rain in the afternoon. Wednesday stays cloudy all day. "
                 "Thursday, heavy rain and strong wind. Friday will be clear again."),
    ],
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("失敗: %s\n%s" % (" ".join(map(str, cmd))[:120], r.stderr[-400:]))
    return r


def speak(voice: str, text: str, out_wav: Path):
    """1行ぶんを読み上げて WAV に保存する。"""
    safe = text.replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.SelectVoice('%s'); "
        "$s.Rate = -1; "
        "$s.SetOutputToWaveFile('%s'); "
        "$s.Speak('%s'); "
        "$s.Dispose()" % (voice, out_wav.as_posix(), safe)
    )
    run(["powershell", "-NoProfile", "-Command", ps])


def build_audio(name: str, lines, tmp: Path):
    """行ごとに合成し、0.6秒の間をはさんで連結して mp3 にする。"""
    parts = []
    for i, (voice, text) in enumerate(lines):
        w = tmp / ("%s-%02d.wav" % (name, i))
        speak(voice, text, w)
        parts.append(w)
        if i < len(lines) - 1:
            gap = tmp / ("%s-%02d-gap.wav" % (name, i))
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
                 "-t", "0.6", str(gap)])
            parts.append(gap)

    listing = tmp / ("%s.txt" % name)
    listing.write_text("".join("file '%s'\n" % p.as_posix() for p in parts), encoding="utf-8")
    dst = OUT / ("%s.mp3" % name)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "concat", "-safe", "0", "-i", str(listing),
         "-ar", "22050", "-ac", "1", "-b:a", "48k", str(dst)])
    return dst


def build_news(src: Path):
    """ニュース映像を 2MB 以下に再エンコードする（解像度はそのまま）。"""
    dst = OUT / "news.mp4"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(dst)])
    # 先頭フレームをポスター画像に
    poster = OUT / "news-poster.jpg"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(dst),
         "-ss", "0.5", "-frames:v", "1", "-q:v", "4", str(poster)])
    return dst, poster


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--news", default=str(Path.home() / "Downloads" /
                                         "grok-video-68837bf1-fafe-4091-beef-b1efcae048c3 (1).mp4"),
                    help="取り込むニュース映像のパス")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for name, lines in SCRIPTS.items():
            dst = build_audio(name, lines, tmp)
            print("  %-18s %6d KB" % (dst.name, dst.stat().st_size // 1024))

    src = Path(args.news)
    if src.is_file():
        video, poster = build_news(src)
        print("  %-18s %6d KB" % (video.name, video.stat().st_size // 1024))
        print("  %-18s %6d KB" % (poster.name, poster.stat().st_size // 1024))
    else:
        print("⚠ ニュース映像が見つかりません: %s" % src)

    print("✓ 音声・動画 → %s" % OUT)


if __name__ == "__main__":
    main()
