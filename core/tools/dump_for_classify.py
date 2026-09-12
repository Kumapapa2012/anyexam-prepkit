#!/usr/bin/env python3
"""分類用に、指定 quiz の各問を1行コンパクト表示する。
使い方: python scripts/dump_for_classify.py data/questions/quiz-01.json [expl_chars]
"""
import json
import sys
from pathlib import Path


def oneline(s, n=None):
    s = " ".join((s or "").split())
    return s[:n] if n else s


def main():
    src = Path(sys.argv[1])
    ec = int(sys.argv[2]) if len(sys.argv) > 2 else 220
    data = json.loads(src.read_text(encoding="utf-8"))
    qs = data["questions"]
    print(f"### {src.stem}  ({len(qs)}問)")
    for q in qs:
        ch = " / ".join(oneline(c["text"]) for c in q["choices"])
        print(f"[{q['id']}] Q: {oneline(q['question'])}")
        print(f"   A: {ch}")
        print(f"   E: {oneline(q['explanation'], ec)}")


if __name__ == "__main__":
    main()
