import {PDFDocument, StandardFonts, rgb} from './vendor/pdf-lib.esm.js';

export const PDF_MARK_STYLE = Object.freeze({
  yellow: [1, 0.91, 0.12], blue: [0.08, 0.36, 0.82], red: [0.79, 0.12, 0.19],
  strikeWidth: 1.25, arrowWidth: 1.3, arrowLength: 9, arrowHead: 4, labelHeight: 10, labelFontSize: 6.8,
});
const finite = n => Number.isFinite(n);
const integer = n => Number.isSafeInteger(n);
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const round = n => Math.round(n * 10000) / 10000;
const numberText = value => {
  const text = String(value ?? '');
  if (!/^\d{1,5}$/u.test(text) || Number(text) === 0) throw Error('An amendment needs a valid printed amendment number.');
  return text;
};
const lineNumber = line => {
  const raw = line.margin?.number ?? line.margin?.text ?? line.number;
  return /^\s*\d+\s*$/u.test(String(raw ?? '')) ? Number(raw) : null;
};
function pageBox(page) {
  const view = page.view ?? (finite(page.width) && finite(page.height) ? [0, 0, page.width, page.height] : null);
  if (!Array.isArray(view) || view.length !== 4 || !view.every(finite) || view[2] <= view[0] || view[3] <= view[1]) throw Error('The original PDF page bounds could not be established.');
  return {x: view[0], y: view[1], width: view[2] - view[0], height: view[3] - view[1]};
}
const inside = (box, x, y, tolerance = 0.02) => finite(x) && finite(y) && x >= box.x - tolerance && y >= box.y - tolerance && x <= box.x + box.width + tolerance && y <= box.y + box.height + tolerance;
function validRect(rect, box) {
  return rect && [rect.x, rect.y, rect.width, rect.height].every(finite) && rect.width > 0 && rect.height > 0 && inside(box, rect.x, rect.y) && inside(box, rect.x + rect.width, rect.y + rect.height);
}
function requireLine(line, page) {
  if (!integer(line.start) || !integer(line.end) || line.start < 0 || line.end <= line.start || !finite(line.baseline) || !finite(line.height) || line.height <= 0 || !finite(line.left) || !finite(line.right) || line.right <= line.left) throw Error('A target line has incomplete source geometry.');
  const box = pageBox(page);
  if (!inside(box, line.left, line.baseline) || !inside(box, line.right, line.baseline)) throw Error('A target line falls outside the original PDF page.');
  if (line.margin && !validRect(line.margin, box)) throw Error('A printed margin number has incomplete source geometry.');
  return box;
}
function records(previous) {
  if (!previous || !Array.isArray(previous.pages) || !previous.pages.length) throw Error('The previous PDF needs its original page geometry.');
  const seen = new Set();
  return previous.pages.flatMap(page => {
    if (!integer(page.page) || page.page < 1 || seen.has(page.page)) throw Error('The previous PDF has invalid or duplicate physical page numbers.');
    seen.add(page.page); pageBox(page);
    return (page.lines || []).filter(line => !line.ignored).map(line => ({line, page}));
  });
}
function exactRanges(amendment, text) {
  const ranges = amendment.sourceRanges ?? [];
  if (!Array.isArray(ranges)) throw Error('The amendment source ranges are invalid.');
  const sorted = ranges.map(range => {
    if (!integer(range.start) || !integer(range.end) || range.start < 0 || range.end <= range.start || range.end > text.length) throw Error('An amendment source selection is outside the previous PDF text.');
    return {start: range.start, end: range.end};
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({...range});
  }
  return merged;
}
function lineGlyphs(line) {
  const glyphs = (line.glyphs ?? []).filter(g => !g.space && integer(g.start) && integer(g.end) && g.end > g.start && [g.x, g.y, g.width, g.height].every(finite) && g.width > 0 && g.height > 0);
  return glyphs.sort((a, b) => a.start - b.start || a.end - b.end);
}
function rangeSegment(range, line, page, text) {
  requireLine(line, page);
  const start = Math.max(range.start, line.margin?.end ?? line.start), end = Math.min(range.end, line.end);
  if (start >= end || !text.slice(start, end).trim()) return null;
  const glyphs = lineGlyphs(line).filter(g => g.start < end && g.end > start && (!line.margin || g.start >= line.margin.end));
  if (!glyphs.length || glyphs.some(g => g.start < start || g.end > end)) throw Error('The complete strikeout cannot be mapped to original PDF glyph boundaries.');
  for (let i = start; i < end; i++) if (!/\s/u.test(text[i]) && !glyphs.some(g => g.start <= i && i < g.end)) throw Error('A character within the strikeout has no original PDF position.');
  const box = pageBox(page);
  if (glyphs.some(g => !validRect(g, box))) throw Error('A strikeout glyph falls outside the original PDF page.');
  // Reversed, vertical or unrelated columns cannot be joined by one horizontal stroke.
  if (glyphs.some((g, i) => i && g.x + 0.5 < glyphs[i - 1].x) || glyphs.some(g => Math.abs((g.y + g.height * 0.22) - line.baseline) > Math.max(2, line.height * 0.35))) throw Error('This strikeout has unsupported text orientation or source ordering.');
  const x1 = Math.min(...glyphs.map(g => g.x)), x2 = Math.max(...glyphs.map(g => g.x + g.width));
  return {page: page.page, x1: round(x1), y1: round(line.baseline + line.height * 0.28), x2: round(x2), y2: round(line.baseline + line.height * 0.28), sourceStart: start, sourceEnd: end};
}
function marginMark(line, page) {
  if (!line.margin) return null; // Title/heading rows have no invented line number.
  const box = requireLine(line, page), n = lineNumber(line);
  if (n === null) throw Error('The printed margin-line number is unreadable.');
  const m = line.margin, pad = 1.1;
  const rect = {x: Math.max(box.x, m.x - pad), y: Math.max(box.y, m.y - pad), width: Math.min(box.x + box.width, m.x + m.width + pad) - Math.max(box.x, m.x - pad), height: Math.min(box.y + box.height, m.y + m.height + pad) - Math.max(box.y, m.y - pad)};
  if (!validRect(rect, box) || rect.x + rect.width >= line.left - 0.25) throw Error('A margin highlight would overlap bill text.');
  return {page: page.page, lineNumber: n, sourceLineStart: line.start, rect};
}
function markerFor(line, page, number, key = '') {
  const box = requireLine(line, page);let right = (line.margin?.x ?? line.left) - 4, minX = box.x + 2;
  if (right - minX < 10 && line.margin) {minX = line.margin.x + line.margin.width + 3;right = line.left - 3;}
  if (right - minX < 10) throw Error('There is not enough blank margin for the amendment number.');
  return {page: page.page, number, x: right - 5.5, y: line.baseline + line.height * 0.28, right, minX, sourceLineStart: line.start, key: key || 'line:' + line.start};
}
function insertionPoint(offset, rows) {
  if (!integer(offset) || offset < 0) throw Error('The insertion location is not an exact source offset.');
  const matches = rows.filter(({line}) => line.start <= offset && offset <= line.end && offset >= (line.margin?.end ?? line.start));
  if (matches.length !== 1) throw Error('The insertion point has no unique original PDF line.');
  const {line, page} = matches[0]; requireLine(line, page);
  const glyphs = lineGlyphs(line).filter(g => !line.margin || g.start >= line.margin.end);
  const before = glyphs.filter(g => g.end <= offset).at(-1), after = glyphs.find(g => g.start >= offset);
  if (glyphs.some(g => g.start < offset && offset < g.end)) throw Error('The insertion would split an unresolved PDF glyph.');
  let x;
  if (before?.end === offset) x = before.x + before.width;
  else if (after?.start === offset) x = after.x;
  else throw Error('The insertion point cannot be resolved to an exact PDF text boundary.');
  const tipY = line.baseline + Math.min(1.2, line.height * 0.1);
  const below = rows.filter(r => r.page.page === page.page && r.line.baseline < line.baseline).sort((a, b) => b.line.baseline - a.line.baseline)[0]?.line;
  const room = below ? tipY - (below.baseline + below.height * 0.8) - 0.6 : 10;
  const length = Math.min(PDF_MARK_STYLE.arrowLength, room);
  if (length < 3.2) throw Error('The original line spacing leaves no clear space for the insertion arrow.');
  return {line, page, insertion: {page: page.page, x: round(x), y: round(tipY), direction: 'up', length: round(length)}};
}
function normalizedLabels(amendments, pages) {
  const grouped = new Map();
  for (const amendment of amendments) for (const marker of amendment.markers) {
    const key = marker.page + ':' + marker.key;
    if (!grouped.has(key)) grouped.set(key, {...marker, numbers: new Set()});
    grouped.get(key).numbers.add(marker.number);
  }
  const labels = [];
  for (const item of [...grouped.values()].sort((a, b) => a.page - b.page || b.y - a.y)) {
    const page = pages.find(p => p.page === item.page), box = pageBox(page), text = [...item.numbers].sort((a, b) => Number(a) - Number(b)).join(',');
    const width = Math.max(10, text.length * 3.8 + 4), height = PDF_MARK_STYLE.labelHeight;
    let x = item.right - width, y = item.y - height / 2;
    while (labels.some(r => r.page === item.page && x < r.x + r.width + 2 && x + width + 2 > r.x && y < r.y + r.height + 1 && y + height + 1 > r.y)) x -= width + 3;
    if (x < item.minX || !inside(box, x, y) || !inside(box, x + width, y + height)) throw Error('Overlapping amendment numbers cannot fit in the original blank margin.');
    labels.push({page: item.page, text, numbers: [...item.numbers], x: round(x), y: round(y), width: round(width), height});
  }
  return labels;
}

/** Build the shared preview/export geometry. No coordinates are inferred from a text-only PDF. */
export function buildPdfMarks({plan, previous} = {}) {
  const issues = [], amendments = [];
  if (plan?.ready !== true) return {ready: false, issues: [...(plan?.issues || []), 'Resolve all amendment instructions before creating a marked PDF.'], amendments, labels: []};
  try {
    const rows = records(previous), text = previous.doc?.text ?? previous.text;
    if (typeof text !== 'string') throw Error('The original source text is missing.');
    if (!Array.isArray(plan.amendments) || !plan.amendments.length) throw Error('No resolved amendments were found.');
    const numbers = new Set();
    for (const amendment of plan.amendments) {
      const number = numberText(amendment.number);
      if (numbers.has(Number(number))) throw Error('Duplicate amendment numbers need separate unambiguous instruction sets.');
      numbers.add(Number(number));
      try {
        if (!['insert', 'delete', 'replace'].includes(amendment.action)) throw Error('This amendment action has no supported PDF marking.');
        const mark = {number, action: amendment.action, margin: [], strikes: [], insertions: [], markers: []}, touched = [], markerRows = [];
        if (amendment.action !== 'insert') {
          const ranges = exactRanges(amendment, text);
          if (!ranges.length) throw Error('The strikeout has no complete source selection.');
          for (const range of ranges) {
            const targetRows = rows.filter(({line}) => overlaps(line, range));
            if (!targetRows.length) throw Error('A strikeout range has no original page line.');
            for (const row of targetRows) {
              const segment = rangeSegment(range, row.line, row.page, text);
              if (segment) {mark.strikes.push(segment); touched.push(row);}
            }
          }
          if (!mark.strikes.length) throw Error('The strikeout has no visible source glyphs.');
          mark.strikes.sort((a, b) => a.sourceStart - b.sourceStart);
          const patches = amendment.patches?.length ? amendment.patches : [{sourceRanges: ranges}];
          for (const patch of patches) {
            const patchRows = touched.filter(({line}) => (patch.sourceRanges || []).some(range => overlaps(line, range)));
            const seenPages = new Set();for (const row of patchRows) if (!seenPages.has(row.page.page)) {markerRows.push(row);seenPages.add(row.page.page);}
          }
          if (amendment.action === 'replace') {
            const insertions = amendment.insertions?.length ? amendment.insertions : amendment.insertion ? [amendment.insertion] : !amendment.patches?.length ? [{offset: mark.strikes.at(-1).sourceEnd}] : [];
            if (!insertions.length) throw Error('The strike-and-insert instruction has no resolved replacement endpoint.');
            for (const insertion of insertions) {
              const ends = mark.strikes.filter(s => s.sourceEnd === insertion.offset);
              if (ends.length !== 1) throw Error('A replacement arrow has no unique complete strikeout endpoint.');
              const last = ends[0], page = previous.pages.find(p => p.page === last.page), box = pageBox(page);
              // The arrow lies over the final struck segment. Reserve room for
              // its painted stroke so the point cannot enter the following word.
              const x = last.x2 - PDF_MARK_STYLE.arrowWidth / 2 - 0.25;
              const length = Math.min(PDF_MARK_STYLE.arrowLength, x - last.x1);
              if (length < 0.5 || !inside(box, x, last.y2)) throw Error('There is no room within the strikeout endpoint for its replacement arrow.');
              mark.insertions.push({page: last.page, x: round(x), y: last.y2, direction: 'right', length: round(length), replacementEnd: true});
            }
          }
        } else if (amendment.between) {
          const {page: pageNumber, above, below} = amendment.between;
          if (!integer(pageNumber) || !integer(above) || !integer(below) || below !== above + 1) throw Error('A between-line insertion needs consecutive printed margin numbers.');
          const upper = rows.filter(r => r.page.page === pageNumber && lineNumber(r.line) === above), lower = rows.filter(r => r.page.page === pageNumber && lineNumber(r.line) === below);
          if (upper.length !== 1 || lower.length !== 1 || !upper[0].line.margin || !lower[0].line.margin) throw Error('Both printed margin numbers are required for a between-line insertion.');
          const a = upper[0], b = lower[0]; requireLine(a.line, a.page); requireLine(b.line, b.page);
          if (a.line.baseline <= b.line.baseline || a.line.start >= b.line.start) throw Error('The between-line source order is unsupported.');
          const center = m => m.y + m.height / 2, y = (center(a.line.margin) + center(b.line.margin)) / 2;
          const tipX = Math.min(Math.max(a.line.margin.x + a.line.margin.width, b.line.margin.x + b.line.margin.width) + 7, Math.min(a.line.left, b.line.left) - 3);
          const length = Math.min(18, tipX - Math.min(a.line.margin.x, b.line.margin.x));
          if (length < 5) throw Error('The original margin has no clear space for the between-line arrow.');
          mark.insertions.push({page: pageNumber, x: round(tipX), y: round(y), direction: 'right', length: round(length), between: {above, below}});
          const marker = markerFor(a.line, a.page, number, 'between:' + above + ':' + below);marker.y = y;mark.markers.push(marker);touched.push(a, b);
        } else {
          const insertions = amendment.insertions?.length ? amendment.insertions : amendment.insertion ? [amendment.insertion] : [];
          if (!insertions.length) throw Error('The insertion has no resolved original source location.');
          for (const insertion of insertions) {const found = insertionPoint(insertion.offset, rows);mark.insertions.push(found.insertion);touched.push(found);markerRows.push(found);}
        }
        const distinct = [...new Map(touched.map(r => [r.page.page + ':' + r.line.start, r])).values()].sort((a, b) => a.line.start - b.line.start);
        for (const {line, page} of distinct) {
          if ((page.rotation ?? 0) % 360 !== 0) throw Error('Rotate this PDF to an upright source copy before placing amendment marks.');
          const margin = marginMark(line, page);if (margin) mark.margin.push(margin);
        }
        if (!amendment.between) for (const {line, page} of [...new Map(markerRows.map(r => [r.page.page + ':' + r.line.start, r])).values()]) mark.markers.push(markerFor(line, page, number));
        if (!mark.markers.length) throw Error('The amendment has no safe location for its printed number.');
        amendments.push(mark);
      } catch (error) {issues.push('Amendment ' + number + ': ' + error.message);}
    }
    let labels = [];
    try {labels = normalizedLabels(amendments, previous.pages);} catch (error) {issues.push(error.message);}
    return {ready: issues.length === 0 && amendments.length === plan.amendments.length, issues, amendments, labels};
  } catch (error) {return {ready: false, issues: [error.message], amendments, labels: []};}
}

function checkedPage(pages, number) {
  if (!integer(number) || number < 1 || number > pages.length) throw Error('A marking refers to a missing physical PDF page.');
  return pages[number - 1];
}
function arrowSegments(insertion) {
  const {x, y, direction, length = PDF_MARK_STYLE.arrowLength} = insertion;
  if (!['up', 'right'].includes(direction) || !finite(length) || length < (insertion.replacementEnd ? 0.5 : 2) || length > 24) throw Error('An insertion arrow has invalid geometry.');
  const ux = direction === 'right' ? 1 : 0, uy = direction === 'up' ? 1 : 0, head = Math.min(PDF_MARK_STYLE.arrowHead, length * 0.5), half = Math.min(2.6, head * 0.65);
  return [[x - ux * length, y - uy * length, x, y], [x, y, x - ux * head - uy * half, y - uy * head + ux * half], [x, y, x - ux * head + uy * half, y - uy * head - ux * half]];
}

/** A new PDF with the original page content/bounds and the same marks shown in preview. */
export async function createMarkedPdf({bytes, marks, title = 'Amends In', previous, plan} = {}) {
  marks ??= buildPdfMarks({previous, plan});bytes ??= previous?.bytes;
  if (marks?.ready !== true || marks.issues?.length || !marks.amendments?.length) throw Error('This bill is not ready for export. ' + (marks?.issues || []).join(' '));
  const input = bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes instanceof ArrayBuffer ? new Uint8Array(bytes.slice(0)) : null;
  if (!input?.length) throw Error('The original PDF bytes are missing.');
  let pdf;try {pdf = await PDFDocument.load(input, {updateMetadata: false});} catch {throw Error('The previous PDF is damaged or password-protected and cannot be marked.');}
  const pages = pdf.getPages(), font = await pdf.embedFont(StandardFonts.Helvetica), color = value => rgb(...value), yellow = color(PDF_MARK_STYLE.yellow), blue = color(PDF_MARK_STYLE.blue), red = color(PDF_MARK_STYLE.red);
  const crop = page => page.getCropBox();
  const highlights = new Set();
  for (const amendment of marks.amendments) {
    numberText(amendment.number);
    if (!['insert', 'delete', 'replace'].includes(amendment.action)) throw Error('An amendment action is invalid.');
    if (amendment.action !== 'insert' && !amendment.strikes?.length || amendment.action !== 'delete' && !amendment.insertions?.length || !marks.labels?.some(label => label.numbers?.map(String).includes(String(amendment.number)))) throw Error('An amendment is missing its complete visible PDF marking.');
    for (const highlight of amendment.margin || []) {
      const page = checkedPage(pages, highlight.page), key = highlight.page + ':' + JSON.stringify(highlight.rect);
      if (!validRect(highlight.rect, crop(page))) throw Error('A margin highlight falls outside the PDF crop box.');
      if (!highlights.has(key)) {page.drawRectangle({...highlight.rect, color: yellow, opacity: 0.38, borderWidth: 0});highlights.add(key);}
    }
    for (const strike of amendment.strikes || []) {
      const page = checkedPage(pages, strike.page), box = crop(page);
      if (![strike.x1, strike.y1, strike.x2, strike.y2].every(finite) || strike.x2 <= strike.x1 || Math.abs(strike.y1 - strike.y2) > 0.01 || !inside(box, strike.x1, strike.y1) || !inside(box, strike.x2, strike.y2)) throw Error('A strikeout has invalid or out-of-page geometry.');
      page.drawLine({start: {x: strike.x1, y: strike.y1}, end: {x: strike.x2, y: strike.y2}, thickness: PDF_MARK_STYLE.strikeWidth, lineCap: 0, color: amendment.action === 'replace' ? blue : red});
    }
    for (const insertion of amendment.insertions || []) {
      const page = checkedPage(pages, insertion.page), box = crop(page);
      for (const [x1, y1, x2, y2] of arrowSegments(insertion)) {
        if (!inside(box, x1, y1) || !inside(box, x2, y2)) throw Error('An insertion arrow falls outside the PDF crop box.');
        page.drawLine({start: {x: x1, y: y1}, end: {x: x2, y: y2}, thickness: PDF_MARK_STYLE.arrowWidth, lineCap: 0, color: blue});
      }
    }
  }
  for (const label of marks.labels || []) {
    const page = checkedPage(pages, label.page);
    if (!validRect(label, crop(page)) || !/^\d{1,5}(?:,\d{1,5})*$/u.test(label.text) || label.text.split(',').some(n => Number(n) === 0)) throw Error('An amendment number label has invalid geometry or text.');
    const borderColor = rgb(0.38, 0.43, 0.5), white = rgb(1, 1, 1), ink = rgb(0.08, 0.12, 0.18), size = Math.min(PDF_MARK_STYLE.labelFontSize, (label.width - 3) / Math.max(1, font.widthOfTextAtSize(label.text, 1)));
    if (size < 5.5) throw Error('An amendment label would be too small to read.');
    if (label.width <= label.height + 0.1) page.drawCircle({x: label.x + label.width / 2, y: label.y + label.height / 2, size: label.height / 2, borderWidth: 0.6, borderColor, color: white});
    else page.drawRectangle({x: label.x, y: label.y, width: label.width, height: label.height, borderWidth: 0.6, borderColor, color: white});
    page.drawText(label.text, {x: label.x + (label.width - font.widthOfTextAtSize(label.text, size)) / 2, y: label.y + (label.height - size) / 2 + 0.8, size, font, color: ink});
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 240 || /[\u0000-\u001f]/u.test(title)) throw Error('The PDF output title is invalid.');
  pdf.setTitle(title);
  pdf.setSubject('Amendment locations on the previous-version PDF. Source page content and layout are retained.');
  return pdf.save({useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false});
}
