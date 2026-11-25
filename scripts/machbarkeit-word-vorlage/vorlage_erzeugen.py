#!/usr/bin/env python3
"""
Machbarkeitstest Word-Vorlage (Vorhaben Drucklayout, 25.11.2026): Wegwerf-Code des Tests, kein Teil der App.

Erzeugt zwei Word-Dateien mit Platzhaltern:
  startvorlage-klassisch.docx   so, wie die App eine Vorlage zum Herunterladen anbieten würde
  frei-umgebaut.docx            dieselben Platzhalter, aber frei angeordnet, als Stellvertreter für das,
                                was jemand in Word daraus macht: Textfeld, frei platziertes Foto,
                                Kopf- und Fußzeile mit Seitenzahl, andere Schriften und Farben

Platzhalter: {titel} {autor_und_datum} {kulinarik} {zeit} {portionen} {schwierigkeit}
             {zutaten_ueberschrift} {zutaten} {zubereitung}
Fotos:       Bilder mit dem Alternativtext „Foto 1“ bis „Foto 4“

Aufruf: python3 vorlage_erzeugen.py <ausgabeordner>
"""
import copy
import io
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def placeholder_image(label, size=(1600, 900), color=(233, 229, 223)):
    """Graues Platzhalterbild mit Beschriftung, als JPEG."""
    img = Image.new('RGB', size, color)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size[1] // 8)
    except OSError:
        font = ImageFont.load_default()
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(((size[0] - box[2]) / 2, (size[1] - box[3]) / 2), label, fill=(120, 110, 100), font=font)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=85)
    buf.seek(0)
    return buf


def set_alt_text(inline_or_anchor, text):
    doc_pr = inline_or_anchor.find(qn('wp:docPr'))
    doc_pr.set('descr', text)
    doc_pr.set('name', text)


def paragraph_border(paragraph, sides=('top', 'bottom'), color='999999'):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement('w:pBdr')
    for side in sides:
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '6')
        el.set(qn('w:space'), '4')
        el.set(qn('w:color'), color)
        borders.append(el)
    p_pr.append(borders)


def no_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'nil')
        borders.append(el)
    tbl_pr.append(borders)


def base_document(font='Cambria'):
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(section, side, Cm(1.5))
    styles = doc.styles
    styles['Normal'].font.name = font
    styles['Normal'].font.size = Pt(11)
    styles['Normal'].element.rPr.rFonts.set(qn('w:eastAsia'), font)
    title = styles['Title']
    title.font.name, title.font.size, title.font.bold = font, Pt(24), True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(8)
    # python-docx gibt „Title“ eine Linie darunter mit; die Vorlage „Klassisch“ hat keine
    for border in title.element.pPr.findall(qn('w:pBdr')):
        title.element.pPr.remove(border)
    heading = styles['Heading 1']
    heading.font.name, heading.font.size, heading.font.bold = font, Pt(14), True
    heading.font.color.rgb = RGBColor(0, 0, 0)
    heading.paragraph_format.space_before = Pt(0)
    heading.paragraph_format.space_after = Pt(6)
    return doc


def add_ingredients_and_steps(cell_left, cell_right):
    cell_left.paragraphs[0].style = 'Heading 1'
    cell_left.paragraphs[0].add_run('{zutaten_ueberschrift}')
    paragraph_border(cell_left.paragraphs[0], sides=('bottom',), color='333333')
    cell_left.add_paragraph('{zutaten}', style='List Bullet')
    cell_right.paragraphs[0].style = 'Heading 1'
    cell_right.paragraphs[0].add_run('Zubereitung')
    paragraph_border(cell_right.paragraphs[0], sides=('bottom',), color='333333')
    cell_right.add_paragraph('{zubereitung}', style='List Number')
    # In einer Tabellenzelle kein „nicht vom nächsten Absatz trennen“: LibreOffice schiebt sonst die ganze
    # Tabelle auf die nächste Seite, statt sie auf der laufenden zu beginnen (Machbarkeitstest 25.11.2026)
    for cell in (cell_left, cell_right):
        cell.paragraphs[0].paragraph_format.keep_with_next = False


def starter():
    """Vorlage „Klassisch“: Titel, breites Foto, Infos, Zutaten und Zubereitung nebeneinander."""
    doc = base_document()
    doc.add_paragraph('{titel}', style='Title')

    photo = doc.add_paragraph()
    photo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = photo.add_run()
    shape = run.add_picture(placeholder_image('Foto 1'), width=Cm(18))
    set_alt_text(shape._inline, 'Foto 1')

    author = doc.add_paragraph()
    author.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = author.add_run('{autor_und_datum}')
    r.font.size, r.font.color.rgb = Pt(9), RGBColor(0x55, 0x55, 0x55)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.add_run('{kulinarik}     {zeit}     {portionen}     {schwierigkeit}')
    paragraph_border(meta)

    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    no_table_borders(table)
    table.columns[0].width, table.columns[1].width = Cm(7), Cm(11)
    for cell, width in zip(table.rows[0].cells, (Cm(7), Cm(11))):
        cell.width = width
    add_ingredients_and_steps(*table.rows[0].cells)
    doc.save(OUT / 'startvorlage-klassisch.docx')


TEXTBOX_XML = """
<w:r %(ns)s>
  <mc:AlternateContent>
    <mc:Choice Requires="wps">
      <w:drawing>
        <wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264"
                   behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
          <wp:simplePos x="0" y="0"/>
          <wp:positionH relativeFrom="page"><wp:posOffset>%(x)d</wp:posOffset></wp:positionH>
          <wp:positionV relativeFrom="page"><wp:posOffset>%(y)d</wp:posOffset></wp:positionV>
          <wp:extent cx="%(cx)d" cy="%(cy)d"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:wrapSquare wrapText="bothSides"/>
          <wp:docPr id="%(id)d" name="Textfeld %(id)d"/>
          <wp:cNvGraphicFramePr/>
          <a:graphic>
            <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:wsp>
                <wps:cNvSpPr txBox="1"/>
                <wps:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="%(cx)d" cy="%(cy)d"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  <a:solidFill><a:srgbClr val="%(fill)s"/></a:solidFill>
                  <a:ln w="9525"><a:solidFill><a:srgbClr val="%(line)s"/></a:solidFill></a:ln>
                </wps:spPr>
                <wps:txbx><w:txbxContent>%(content)s</w:txbxContent></wps:txbx>
                <wps:bodyPr rot="0" vert="horz" wrap="square" lIns="144000" tIns="108000" rIns="144000" bIns="108000" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr>
              </wps:wsp>
            </a:graphicData>
          </a:graphic>
        </wp:anchor>
      </w:drawing>
    </mc:Choice>
  </mc:AlternateContent>
</w:r>
"""
NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
)
EMU_PER_CM = 360000


def textbox_run(content_paragraphs_xml, x_cm, y_cm, w_cm, h_cm, shape_id, fill='F1E6D8', line='C8B8A2'):
    return parse_xml(TEXTBOX_XML % {
        'ns': NS, 'x': int(x_cm * EMU_PER_CM), 'y': int(y_cm * EMU_PER_CM),
        'cx': int(w_cm * EMU_PER_CM), 'cy': int(h_cm * EMU_PER_CM), 'id': shape_id,
        'fill': fill, 'line': line, 'content': content_paragraphs_xml,
    })


def inline_to_anchor(inline, x_cm, y_cm, relative='page'):
    """Macht aus einem Bild im Text ein frei platziertes Bild (Textumbruch: Quadrat)."""
    anchor = OxmlElement('wp:anchor')
    for key, value in (('distT', '0'), ('distB', '0'), ('distL', '114300'), ('distR', '114300'), ('simplePos', '0'),
                       ('relativeHeight', '251658240'), ('behindDoc', '0'), ('locked', '0'), ('layoutInCell', '1'),
                       ('allowOverlap', '1')):
        anchor.set(key, value)
    simple = OxmlElement('wp:simplePos')
    simple.set('x', '0')
    simple.set('y', '0')
    anchor.append(simple)
    for tag, value in (('wp:positionH', x_cm), ('wp:positionV', y_cm)):
        pos = OxmlElement(tag)
        pos.set('relativeFrom', relative)
        offset = OxmlElement('wp:posOffset')
        offset.text = str(int(value * EMU_PER_CM))
        pos.append(offset)
        anchor.append(pos)
    children = {child.tag: child for child in inline}
    anchor.append(copy.deepcopy(children[qn('wp:extent')]))
    effect = OxmlElement('wp:effectExtent')
    for side in 'ltrb':
        effect.set(side, '0')
    anchor.append(effect)
    wrap = OxmlElement('wp:wrapSquare')
    wrap.set('wrapText', 'bothSides')
    anchor.append(wrap)
    anchor.append(copy.deepcopy(children[qn('wp:docPr')]))
    anchor.append(copy.deepcopy(children[qn('wp:cNvGraphicFramePr')]))
    anchor.append(copy.deepcopy(children[qn('a:graphic')]))
    inline.getparent().replace(inline, anchor)
    return anchor


def add_field(paragraph, instruction):
    """Feld wie „PAGE“ oder „NUMPAGES“ (Seitenzahl)."""
    for kind in ('begin', None, 'end'):
        run = paragraph.add_run()
        if kind:
            char = OxmlElement('w:fldChar')
            char.set(qn('w:fldCharType'), kind)
            run._r.append(char)
        else:
            text = OxmlElement('w:instrText')
            text.set(qn('xml:space'), 'preserve')
            text.text = f' {instruction} '
            run._r.append(text)


def free():
    """Frei umgebaut: Titel links in Farbe, Foto frei rechts oben, Zutaten in einem Textfeld am linken Rand,
    Zubereitung fließt daneben, Kopfzeile mit Schriftzug, Fußzeile mit Titel und Seitenzahl."""
    doc = base_document(font='Calibri')
    section = doc.sections[0]
    section.left_margin = Cm(8.2)  # Platz für das Textfeld mit den Zutaten
    section.header_distance = Cm(0.8)
    section.footer_distance = Cm(0.8)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = header.add_run('brouBook · {kulinarik}')
    r.font.size, r.font.color.rgb, r.italic = Pt(9), RGBColor(0xA6, 0x58, 0x00), True

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run('{titel} · Seite ').font.size = Pt(9)
    add_field(footer, 'PAGE')
    footer.add_run(' von ').font.size = Pt(9)
    add_field(footer, 'NUMPAGES')

    title = doc.add_paragraph('{titel}', style='Title')
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for run in title.runs:
        run.font.color.rgb = RGBColor(0xA3, 0x3A, 0x26)
        run.font.size = Pt(28)

    # Textfeld am linken Rand: Zutaten, am ersten Absatz verankert
    box_content = (
        '<w:p %(ns)s><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>{zutaten_ueberschrift}</w:t></w:r></w:p>'
        '<w:p %(ns)s><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>{zutaten}</w:t></w:r></w:p>'
    ) % {'ns': NS}
    title._p.append(textbox_run(box_content, x_cm=1.2, y_cm=2.2, w_cm=6.4, h_cm=16, shape_id=10))

    info = doc.add_paragraph()
    r = info.add_run('{autor_und_datum}')
    r.font.size, r.font.color.rgb = Pt(9), RGBColor(0x55, 0x55, 0x55)

    # Foto frei platziert rechts oben, der Text fließt herum
    photo = doc.add_paragraph()
    run = photo.add_run()
    shape = run.add_picture(placeholder_image('Foto 1', size=(1200, 1200)), width=Cm(5.5))
    set_alt_text(shape._inline, 'Foto 1')
    inline_to_anchor(shape._inline, x_cm=14, y_cm=4.2)
    meta = photo.add_run('{zeit} · {portionen} · {schwierigkeit}')
    meta.bold = True

    heading = doc.add_paragraph('Zubereitung', style='Heading 1')
    paragraph_border(heading, sides=('bottom',), color='A33A26')
    doc.add_paragraph('{zubereitung}', style='List Number')
    doc.save(OUT / 'frei-umgebaut.docx')


starter()
free()
print('geschrieben:', ', '.join(sorted(p.name for p in OUT.glob('*.docx'))))
