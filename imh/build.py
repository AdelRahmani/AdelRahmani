#!/usr/bin/env python3
"""Assemble imh/src/ en une page autonome : imh/index.html (à ouvrir tel quel) et imh/dist/page.html (corps seul, pour la publication)."""
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
read = lambda n: (src / n).read_text(encoding="utf-8")

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap">'
page = "\n".join([
    "<title>Chiffrage IMH</title>",
    '<meta name="claude:viewport-fit-sides" content="cover">',
    FONTS,
    "<style>\n" + read("app.css") + "</style>",
    read("body.html"),
    "<script>\n" + read("gammes.js") + "</script>",
    "<script>\n" + read("calc.js") + "</script>",
    "<script>\n" + read("app.js") + "</script>",
])

(root / "dist").mkdir(exist_ok=True)
(root / "dist" / "page.html").write_text(page, encoding="utf-8")
(root / "index.html").write_text(
    '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
    + page + "\n</body>\n</html>\n", encoding="utf-8")
print("imh/index.html et imh/dist/page.html générés")
