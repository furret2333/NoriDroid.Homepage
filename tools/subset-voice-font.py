#!/usr/bin/env python3
"""
生成 assets/fonts/wenkai-voice.woff2 —— 霞鹜文楷（LXGW WenKai）的子集，只包含「Nori 的台词」用到的字。

收集范围：
  * index.html / 404.html 里 class 含 `voice` 的元素中的全部文字
  * assets/js/main.js 里 `@voice-start` 与 `@voice-end` 之间的字符串字面量
  * 基本拉丁字符与常用中文标点（兜底）

用法（需要 Python 3.9+ 与 fonttools、brotli：pip install fonttools brotli）：
  python tools/subset-voice-font.py <LXGWWenKai-Regular.ttf 的路径>

字体源文件约 25 MB，不放进仓库，请从 https://github.com/lxgw/LxgwWenKai/releases 下载。
许可：SIL OFL 1.1（见 assets/fonts/OFL-LXGWWenKai.txt）。作者的附加许可允许为网页分发而子集化 / 转成 WOFF2。
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "assets" / "fonts" / "wenkai-voice.woff2"
HTML_FILES = ["index.html", "404.html"]
JS_FILE = SITE / "assets" / "js" / "main.js"
BASE = "".join(chr(c) for c in range(0x20, 0x7F)) + "，。、；：？！…—「」『』（）《》·“”‘’～　"


class VoiceCollector(HTMLParser):
	VOID = {"br", "img", "input", "meta", "link", "hr", "source", "wbr", "use", "path", "circle"}

	def __init__(self):
		super().__init__(convert_charrefs=True)
		self.stack = []  # 每层是否是 voice
		self.text = []

	def handle_starttag(self, tag, attrs):
		if tag in self.VOID:
			return
		cls = dict(attrs).get("class") or ""
		self.stack.append("voice" in cls.split())

	def handle_endtag(self, tag):
		if tag in self.VOID:
			return
		if self.stack:
			self.stack.pop()

	def handle_data(self, data):
		if any(self.stack):
			self.text.append(data)


def collect() -> str:
	chunks = []
	for name in HTML_FILES:
		path = SITE / name
		if not path.exists():
			continue
		p = VoiceCollector()
		p.feed(path.read_text(encoding="utf-8"))
		chunks.append("".join(p.text))
	js = JS_FILE.read_text(encoding="utf-8")
	m = re.search(r"@voice-start(.*?)@voice-end", js, re.S)
	if m:
		chunks.extend(re.findall(r'"([^"\n]*)"', m.group(1)))
	return "".join(chunks)


def main() -> int:
	if len(sys.argv) < 2:
		print(__doc__)
		return 2
	src = Path(sys.argv[1])
	from fontTools import subset

	text = collect()
	chars = sorted(set(text + BASE) - set("\n\r\t"))
	cjk = [c for c in chars if ord(c) > 0x2E7F]
	opts = subset.Options()
	opts.flavor = "woff2"
	opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "palt", "halt"]
	opts.hinting = False
	opts.desubroutinize = True
	opts.name_IDs = ["*"]
	opts.notdef_outline = True
	font = subset.load_font(str(src), opts)
	sub = subset.Subsetter(opts)
	sub.populate(text="".join(chars))
	sub.subset(font)
	OUT.parent.mkdir(parents=True, exist_ok=True)
	subset.save_font(font, str(OUT), opts)
	print(f"{len(chars)} chars ({len(cjk)} CJK) -> {OUT.relative_to(SITE)} ({OUT.stat().st_size / 1024:.1f} KB)")
	return 0


if __name__ == "__main__":
	sys.exit(main())
