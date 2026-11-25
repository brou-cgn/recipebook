#!/usr/bin/env node
/**
 * Machbarkeitstest Word-Vorlage (Vorhaben Drucklayout, 25.11.2026): Wegwerf-Code des Tests, kein Teil der App.
 * Füllt eine Word-Vorlage mit einem Rezept. Kommt mit JSZip und einem XML-Parser aus, damit derselbe
 * Code später im Browser laufen könnte (dort DOMParser statt @xmldom/xmldom, Canvas statt sharp).
 *
 *   Felder:  {titel} {autor_und_datum} {kulinarik} {zeit} {portionen} {schwierigkeit} {zutaten_ueberschrift}
 *            auch wenn Word sie über mehrere Textläufe verteilt hat, in Textfeldern, Kopf- und Fußzeilen
 *   Blöcke:  {zutaten} {zubereitung}: der Absatz mit dem Platzhalter wird je Zeile wiederholt, mit seiner
 *            Formatierung (Aufzählung, Nummerierung); Zwischenüberschriften fett und ohne Aufzählung
 *   Fotos:   Bilder mit dem Alternativtext „Foto 1“ bis „Foto 4“ behalten Platz, Größe und Umbruch und
 *            bekommen das Rezeptfoto, auf das Seitenverhältnis des Rahmens beschnitten; ohne Foto entfallen sie
 *
 * Aufruf: node fuellen.js <vorlage.docx> <rezept.json> <ausgabe.docx>
 * Ausgabe auf stdout: JSON mit dem, was ersetzt wurde, und unbekannten Platzhaltern.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const sharp = require('sharp');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const TAG = /\{([a-z_0-9]+)\}/g;
const BLOCKS = ['zutaten', 'zubereitung'];

const isEl = (node, ns, name) => node.nodeType === 1 && node.namespaceURI === ns && node.localName === name;
const children = (node) => Array.from(node.childNodes || []);
const descendants = (node, ns, name, out = []) => {
  children(node).forEach((child) => {
    if (child.nodeType !== 1) return;
    if (isEl(child, ns, name)) out.push(child);
    descendants(child, ns, name, out);
  });
  return out;
};

/** Die Textknoten (w:t) eines Absatzes, ohne die der Absätze in einem Textfeld darin. */
function ownTextNodes(paragraph, out = []) {
  children(paragraph).forEach((child) => {
    if (child.nodeType !== 1 || isEl(child, W, 'p')) return;
    if (isEl(child, W, 't')) out.push(child);
    else ownTextNodes(child, out);
  });
  return out;
}
const ownText = (paragraph) => ownTextNodes(paragraph).map((t) => t.textContent).join('');

/** Ersetzt {feld} im Absatz, auch wenn der Platzhalter über mehrere Textläufe verteilt ist. */
function replaceFields(paragraph, data, report) {
  const nodes = ownTextNodes(paragraph);
  if (nodes.length === 0) return;
  const parts = nodes.map((t) => t.textContent);
  const full = parts.join('');
  const matches = [...full.matchAll(TAG)];
  if (matches.length === 0) return;
  const starts = [];
  parts.reduce((offset, part) => { starts.push(offset); return offset + part.length; }, 0);
  const locate = (pos) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > pos) i -= 1;
    return [i, pos - starts[i]];
  };
  matches.reverse().forEach((match) => {
    const name = match[1];
    if (!(name in data)) { report.unbekannt.add(name); return; }
    const [i, a] = locate(match.index);
    const [j, b] = locate(match.index + match[0].length - 1);
    if (i !== j) report.verteilt += 1;
    const value = String(data[name] ?? '');
    if (i === j) parts[i] = parts[i].slice(0, a) + value + parts[i].slice(b + 1);
    else {
      parts[i] = parts[i].slice(0, a) + value;
      for (let k = i + 1; k < j; k += 1) parts[k] = '';
      parts[j] = parts[j].slice(b + 1);
    }
    report.felder[name] = (report.felder[name] || 0) + 1;
  });
  nodes.forEach((node, index) => {
    while (node.firstChild) node.removeChild(node.firstChild);
    node.appendChild(node.ownerDocument.createTextNode(parts[index]));
    node.setAttribute('xml:space', 'preserve');
  });
}

function ensureChild(parent, name, first = false) {
  let el = children(parent).find((c) => isEl(c, W, name));
  if (!el) {
    el = parent.ownerDocument.createElementNS(W, `w:${name}`);
    if (first && parent.firstChild) parent.insertBefore(el, parent.firstChild); else parent.appendChild(el);
  }
  return el;
}

/** Zwischenüberschrift in einer Liste: fett, ohne Aufzählungszeichen und Einzug. */
function makeHeading(paragraph) {
  const doc = paragraph.ownerDocument;
  const pPr = ensureChild(paragraph, 'pPr', true);
  children(pPr).filter((c) => isEl(c, W, 'numPr') || isEl(c, W, 'ind')).forEach((c) => pPr.removeChild(c));
  const numPr = doc.createElementNS(W, 'w:numPr');
  const ilvl = doc.createElementNS(W, 'w:ilvl'); ilvl.setAttributeNS(W, 'w:val', '0');
  const numId = doc.createElementNS(W, 'w:numId'); numId.setAttributeNS(W, 'w:val', '0');
  numPr.appendChild(ilvl); numPr.appendChild(numId);
  const ind = doc.createElementNS(W, 'w:ind');
  ind.setAttributeNS(W, 'w:left', '0'); ind.setAttributeNS(W, 'w:firstLine', '0');
  // Reihenfolge der Kinder von w:pPr ist im Schema festgelegt: keepNext, numPr, …, ind
  const style = children(pPr).find((c) => isEl(c, W, 'pStyle'));
  const after = style ? style.nextSibling : pPr.firstChild;
  // Überschrift bei ihrer ersten Zeile halten, aber nicht in Tabellenzellen: LibreOffice schiebt sonst die
  // ganze Tabelle auf die nächste Seite (Machbarkeitstest 25.11.2026)
  let inTable = false;
  for (let n = paragraph.parentNode; n; n = n.parentNode) if (isEl(n, W, 'tc')) inTable = true;
  if (!inTable) pPr.insertBefore(doc.createElementNS(W, 'w:keepNext'), after);
  pPr.insertBefore(numPr, after);
  const jc = children(pPr).find((c) => isEl(c, W, 'jc') || isEl(c, W, 'rPr'));
  pPr.insertBefore(ind, jc || null);
  children(paragraph).filter((c) => isEl(c, W, 'r')).forEach((run) => {
    const rPr = ensureChild(run, 'rPr', true);
    if (!children(rPr).some((c) => isEl(c, W, 'b'))) rPr.insertBefore(doc.createElementNS(W, 'w:b'), rPr.firstChild);
  });
}

/** Wiederholt den Absatz mit {zutaten} bzw. {zubereitung} je Zeile. */
function expandBlocks(root, data, report) {
  descendants(root, W, 'p').forEach((paragraph) => {
    const text = ownText(paragraph);
    const block = BLOCKS.find((name) => text.includes(`{${name}}`));
    if (!block || !paragraph.parentNode) return;
    const lines = data[block] || [];
    lines.forEach((line) => {
      const clone = paragraph.cloneNode(true);
      replaceFields(clone, { [block]: line.text }, { unbekannt: new Set(), felder: {}, verteilt: 0 });
      if (line.type === 'heading') makeHeading(clone);
      paragraph.parentNode.insertBefore(clone, paragraph);
    });
    paragraph.parentNode.removeChild(paragraph);
    report.bloecke[block] = (report.bloecke[block] || 0) + lines.length;
  });
}

async function fill(templatePath, recipe, outPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const report = { felder: {}, bloecke: {}, fotos: [], unbekannt: new Set(), verteilt: 0, teile: [] };
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const partNames = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  const contentTypesDoc = parser.parseFromString(await zip.file('[Content_Types].xml').async('string'), 'text/xml');
  let mediaCounter = 0;

  for (const partName of partNames) {
    const doc = parser.parseFromString(await zip.file(partName).async('string'), 'text/xml');
    const root = doc.documentElement;
    report.teile.push(partName);

    // 1) Fotos: Bilder mit Alternativtext „Foto n“
    const relsName = partName.replace(/^word\//, 'word/_rels/') + '.rels';
    const relsFile = zip.file(relsName);
    const relsDoc = relsFile ? parser.parseFromString(await relsFile.async('string'), 'text/xml') : null;
    const drawings = [...descendants(root, WP, 'inline'), ...descendants(root, WP, 'anchor')];
    for (const drawing of drawings) {
      const docPr = children(drawing).find((c) => isEl(c, WP, 'docPr'));
      const match = /^Foto ([1-4])$/.exec((docPr && (docPr.getAttribute('descr') || docPr.getAttribute('title'))) || '');
      if (!match) continue;
      const photo = (recipe.fotos || [])[Number(match[1]) - 1];
      const run = (() => { let n = drawing; while (n && !isEl(n, W, 'r')) n = n.parentNode; return n; })();
      if (!photo) {
        // kein Foto für diesen Platz: Bild entfernen, den Absatz auch, wenn sonst nichts darin steht
        const paragraph = run.parentNode;
        paragraph.removeChild(run);
        if (ownText(paragraph).trim() === '' && descendants(paragraph, W, 'drawing').length === 0 && paragraph.parentNode) {
          const siblings = children(paragraph.parentNode).filter((c) => isEl(c, W, 'p'));
          if (siblings.length > 1) paragraph.parentNode.removeChild(paragraph);
        }
        report.fotos.push({ platz: match[0], foto: null });
        continue;
      }
      const extent = children(drawing).find((c) => isEl(c, WP, 'extent'));
      const cx = Number(extent.getAttribute('cx'));
      const cy = Number(extent.getAttribute('cy'));
      // Rahmen in Pixeln bei rund 200 dpi (914400 EMU je Zoll), Foto füllt den Rahmen (beschnitten, nicht verzerrt)
      const width = Math.round((cx / 914400) * 200);
      const height = Math.round((cy / 914400) * 200);
      const bytes = await sharp(path.resolve(path.dirname(recipe.__file), photo)).resize(width, height, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
      mediaCounter += 1;
      const mediaName = `media/rezeptfoto${mediaCounter}.jpeg`;
      zip.file(`word/${mediaName}`, bytes);
      const relId = `rIdRezept${mediaCounter}`;
      const rel = relsDoc.createElementNS(REL, 'Relationship');
      rel.setAttribute('Id', relId); rel.setAttribute('Type', IMAGE_REL); rel.setAttribute('Target', mediaName);
      relsDoc.documentElement.appendChild(rel);
      descendants(drawing, A, 'blip').forEach((blip) => blip.setAttributeNS(R, 'r:embed', relId));
      report.fotos.push({ platz: match[0], foto: photo, rahmen: `${width}x${height}` });
    }
    if (relsDoc) zip.file(relsName, serializer.serializeToString(relsDoc));

    // 2) Blöcke, dann Felder
    expandBlocks(root, recipe, report);
    descendants(root, W, 'p').forEach((paragraph) => replaceFields(paragraph, recipe.felder, report));
    zip.file(partName, serializer.serializeToString(doc));
  }

  // JPEG als Inhaltstyp anmelden, falls die Vorlage nur PNG kannte
  const defaults = children(contentTypesDoc.documentElement).filter((c) => c.nodeType === 1 && c.localName === 'Default');
  if (mediaCounter > 0 && !defaults.some((d) => d.getAttribute('Extension').toLowerCase() === 'jpeg')) {
    const el = contentTypesDoc.createElementNS(contentTypesDoc.documentElement.namespaceURI, 'Default');
    el.setAttribute('Extension', 'jpeg'); el.setAttribute('ContentType', 'image/jpeg');
    contentTypesDoc.documentElement.insertBefore(el, contentTypesDoc.documentElement.firstChild);
    zip.file('[Content_Types].xml', serializer.serializeToString(contentTypesDoc));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { ...report, unbekannt: [...report.unbekannt] };
}

if (require.main === module) {
  const [templatePath, recipePath, outPath] = process.argv.slice(2);
  const recipe = { ...JSON.parse(fs.readFileSync(recipePath, 'utf8')), __file: recipePath };
  const started = process.hrtime.bigint();
  fill(templatePath, recipe, outPath).then((report) => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({ ausgabe: path.basename(outPath), ms: Math.round(ms), ...report }));
  }).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { fill };
