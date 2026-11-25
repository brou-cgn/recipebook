#!/usr/bin/env python3
"""
Machbarkeitstest Word-Vorlage (Vorhaben Drucklayout, 25.11.2026): Wegwerf-Code des Tests, kein Teil der App.

Legt die Testdaten an: drei Rezepte als JSON (kurz, lang für den Seitenumbruch, ohne Foto) und zwei
Testfotos mit dunklen Eckmarken, an denen ein falscher Zuschnitt auffällt.

Aufruf: python3 testdaten_erzeugen.py <ausgabeordner>
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def foto(name, size, grund, teller):
    img = Image.new('RGB', size, grund)
    draw = ImageDraw.Draw(img)
    w, h = size
    r = int(min(w, h) * 0.36)
    draw.ellipse([w // 2 - r, h // 2 - r, w // 2 + r, h // 2 + r], fill=(245, 240, 235))
    r2 = int(r * 0.72)
    draw.ellipse([w // 2 - r2, h // 2 - r2, w // 2 + r2, h // 2 + r2], fill=teller)
    for x, y in [(0, 0), (w - 60, 0), (0, h - 60), (w - 60, h - 60)]:
        draw.rectangle([x, y, x + 60, y + 60], fill=(40, 40, 40))
    img.save(OUT / name, quality=88)


foto('foto-quer.jpg', (1600, 1200), (176, 104, 74), (205, 165, 60))
foto('foto-hoch.jpg', (1200, 1600), (84, 120, 96), (190, 70, 60))

kurz = {
    'felder': {
        'titel': 'Spaghetti Bolognese', 'autor_und_datum': 'Von Anna erstellt am 2.1.2025', 'kulinarik': 'Italienisch',
        'zeit': '45 Min.', 'portionen': '4 Portionen', 'schwierigkeit': 'Schwierigkeit 2/5',
        'zutaten_ueberschrift': 'Zutaten für 4 Portionen',
    },
    'zutaten': [
        {'type': 'heading', 'text': 'Sauce'}, {'text': '500 g Hackfleisch'}, {'text': '2 Zwiebeln'},
        {'text': '2 EL Olivenöl'}, {'text': '400 g Tomaten'}, {'type': 'heading', 'text': 'Pasta'},
        {'text': '400 g Spaghetti'}, {'text': 'Salz'},
    ],
    'zubereitung': [
        {'text': 'Zwiebeln würfeln und im Öl glasig anbraten.'}, {'text': 'Hackfleisch zugeben und krümelig braten.'},
        {'type': 'heading', 'text': 'Fertigstellen'}, {'text': 'Tomaten zugeben und 30 Minuten köcheln lassen.'},
        {'text': 'Spaghetti in Salzwasser garen und mit der Sauce servieren.'},
    ],
    'fotos': ['foto-quer.jpg'],
}

zutaten, schritte = [], []
for g, (name, n) in enumerate([('Teig', 9), ('Füllung', 11), ('Guss', 7), ('Zum Servieren', 5)]):
    zutaten.append({'type': 'heading', 'text': name})
    zutaten += [{'text': f'{(i + 1) * 25} g Zutat {g + 1}.{i + 1} mit einer etwas längeren Bezeichnung'} for i in range(n)]
    schritte.append({'type': 'heading', 'text': name})
    schritte += [{
        'text': f'Schritt {g + 1}.{i + 1}: Die vorbereiteten Zutaten gründlich vermengen, dann bei mittlerer Hitze unter '
                'Rühren garen, bis die Masse bindet und sich vom Topfboden löst. Kurz ruhen lassen.',
    } for i in range(6)]
lang = {
    'felder': {
        'titel': 'Große Festtagstorte mit einem sehr langen Namen, der umbricht',
        'autor_und_datum': 'Von Testkoch erstellt am 15.11.2026', 'kulinarik': 'Deutsch', 'zeit': '180 Min.',
        'portionen': '12 Portionen', 'schwierigkeit': 'Schwierigkeit 4/5', 'zutaten_ueberschrift': 'Zutaten für 12 Portionen',
    },
    'zutaten': zutaten, 'zubereitung': schritte, 'fotos': ['foto-hoch.jpg', 'foto-quer.jpg'],
}
ohne = json.loads(json.dumps(kurz))
ohne['fotos'] = []
ohne['felder']['titel'] = 'Spaghetti ohne Foto'

for name, rezept in [('kurz', kurz), ('lang', lang), ('ohne-foto', ohne)]:
    (OUT / f'{name}.json').write_text(json.dumps(rezept, ensure_ascii=False, indent=1), encoding='utf-8')
print('geschrieben:', ', '.join(sorted(p.name for p in OUT.iterdir())))
