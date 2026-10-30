import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PDFDocument, StandardFonts, degrees} from '../app/vendor/pdf-lib.esm.js';
import {buildPdfMarks, createMarkedPdf, PDF_MARK_STYLE} from '../app/pdf-markup.mjs';
import {makeDocument} from '../app/core.mjs';
import {planAmendments} from '../app/amendment-planner.mjs';

const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function fixture(texts = ['The agency prepares a report, upon request.', 'A copy shall be retained by the agency.', 'The old reporting requirement is retained', 'until the close of the reporting period.', 'The notice is due within 30 days after the', 'close of the prior reporting period.'], {crop = false, rotation = 0, noMargin = false} = {}) {
  const pdf = await PDFDocument.create(), page = pdf.addPage([612, 792]), font = await pdf.embedFont(StandardFonts.Helvetica), size = 10, pages = [{page: 1, view: crop ? [25, 40, 587, 752] : [0, 0, 612, 792], rotation, lines: []}];
  if (crop) page.setCropBox(25, 40, 562, 712);
  if (rotation) page.setRotation(degrees(rotation));
  const strings = []; let offset = 0;
  for (let i = 0; i < texts.length; i++) {
    const body = texts[i], number = String(i + 1), prefix = noMargin ? '' : 'line ' + number + ' ', value = prefix + body, baseline = 700 - i * 18, start = offset, glyphs = [];
    if (!noMargin) page.drawText(number, {x: 42, y: baseline, size, font});
    page.drawText(body, {x: 76, y: baseline, size, font});
    let x = 76;
    for (let j = 0; j < body.length; j++) {const width = font.widthOfTextAtSize(body[j], size);glyphs.push({start: start + prefix.length + j, end: start + prefix.length + j + 1, x, y: baseline - 2.2, width, height: 10});x += width;}
    const margin = noMargin ? null : {start, end: start + prefix.length, text: number, number: i + 1, x: 42, y: baseline - 2.2, width: font.widthOfTextAtSize(number, size), height: 10};
    pages[0].lines.push({start, end: start + value.length, baseline, left: 76, right: x, height: 10, margin, glyphs});strings.push(value);offset += value.length + 1;
  }
  return {doc: {text: strings.join('\n')}, pages, bytes: await pdf.save({useObjectStreams: false})};
}
const range = (entry, text) => {const start = entry.doc.text.indexOf(text);assert.ok(start >= 0, text);return {start, end: start + text.length};};
const plan = amendments => ({ready: true, issues: [], amendments});
const originalStreams = (pdf, page) => {
  const content = page.node.Contents();return (content?.asArray?.() ?? (content ? [content] : [])).map(ref => pdf.context.lookup(ref)?.contents).filter(Boolean).map(bytes => Buffer.from(bytes).toString('base64'));
};

test('all four approved markings use only original margin digits and complete physical source geometry', async () => {
  const previous = await fixture(), first = range(previous, 'report,').end, redA = range(previous, 'old reporting requirement is retained'), redB = range(previous, 'until the close of the reporting period.'), blueA = range(previous, '30 days after the'), blueB = range(previous, 'close of the prior reporting period.');
  const marks = buildPdfMarks({previous, plan: plan([
    {number: 1, action: 'insert', insertion: {offset: first}},
    {number: 2, action: 'insert', between: {page: 1, above: 1, below: 2}},
    {number: 3, action: 'delete', sourceRanges: [redA, redB]},
    {number: 4, action: 'replace', sourceRanges: [blueA, blueB]},
  ])});
  assert.equal(marks.ready, true, marks.issues.join('\n'));assert.equal(marks.amendments.length, 4);
  const [after, between, strike, replacement] = marks.amendments;
  assert.deepEqual(after.margin.map(m => m.lineNumber), [1]);assert.equal(after.insertions[0].direction, 'up');
  const commaGlyph = previous.pages[0].lines[0].glyphs.find(g => g.end === first);assert.ok(Math.abs(after.insertions[0].x - commaGlyph.x - commaGlyph.width) < 0.001);
  assert.deepEqual(between.margin.map(m => m.lineNumber), [1, 2]);assert.equal(between.insertions.length, 1);assert.equal(between.insertions[0].direction, 'right');
  const center = l => l.margin.y + l.margin.height / 2;assert.ok(Math.abs(between.insertions[0].y - (center(previous.pages[0].lines[0]) + center(previous.pages[0].lines[1])) / 2) < 0.001);
  assert.deepEqual(strike.strikes.map(s => [s.sourceStart, s.sourceEnd]), [[redA.start, redA.end], [redB.start, redB.end]]);assert.equal(strike.insertions.length, 0);
  assert.equal(replacement.strikes.length, 2);assert.equal(replacement.insertions.length, 1);const final = replacement.strikes.at(-1), arrow = replacement.insertions[0];assert.ok(arrow.x + PDF_MARK_STYLE.arrowWidth / 2 < final.x2);assert.ok(arrow.x - arrow.length >= final.x1 - 0.001);assert.equal(arrow.y, final.y2);
  assert.ok(marks.amendments.flatMap(a => a.margin).every(m => m.rect.x + m.rect.width < 76));
  assert.ok(marks.labels.every((a, i) => marks.labels.every((b, j) => i === j || a.page !== b.page || a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)));
  assert.deepEqual(PDF_MARK_STYLE.red, [0.79, 0.12, 0.19]);assert.deepEqual(PDF_MARK_STYLE.blue, [0.08, 0.36, 0.82]);
});

test('replacement arrows stay within the struck word and larger insertion arrows respect available line spacing', async () => {
  const previous = await fixture(['their own wording remains.', 'a neighboring word remains.', 'The report, upon request, is available.', 'The next row stays clear.']);
  for (const target of ['their', 'a']) {
    const selection = range(previous, target==='a'?'a neighboring':target);if(target==='a')selection.end=selection.start+1;
    const marks = buildPdfMarks({previous, plan:plan([{number:1, action:'replace', sourceRanges:[selection]}])});
    assert.equal(marks.ready, true, marks.issues.join('\n'));const arrow=marks.amendments[0].insertions[0], strike=marks.amendments[0].strikes[0];
    assert.ok(arrow.x + PDF_MARK_STYLE.arrowWidth / 2 < strike.x2);assert.ok(arrow.x - arrow.length >= strike.x1 - 0.001);
    const next=previous.pages[0].lines.flatMap(l=>l.glyphs).find(g=>g.start>selection.end&&!/\s/.test(previous.doc.text.slice(g.start,g.end)));
    assert.ok(next.x>arrow.x+PDF_MARK_STYLE.arrowWidth/2);await createMarkedPdf({previous,marks});
  }
  const after=range(previous,'report,').end,marks=buildPdfMarks({previous,plan:plan([{number:2,action:'insert',insertion:{offset:after}}])});assert.equal(marks.ready,true);assert.ok(marks.amendments[0].insertions[0].length>7);
});

test('every complete strikeout character is required; missing, partial OCR and out-of-page glyphs block output', async () => {
  const base = await fixture(), target = range(base, 'old reporting requirement');
  for (const change of ['missing', 'outside', 'partial', 'unmapped-run']) {
    const previous = structuredClone(base), line = previous.pages[0].lines[2];
    if (change === 'missing') line.glyphs = line.glyphs.filter(g => g.start !== target.start + 6);
    if (change === 'outside') line.glyphs.find(g => g.start === target.start).x = -10;
    if (change === 'partial') {const g = line.glyphs.find(g => g.start === target.start);g.start -= 1;}
    if (change === 'unmapped-run') {line.runs = [{start: target.start, end: target.end, x: 90, y: line.baseline - 2.2, width: 120, height: 10}];line.glyphs = [];}
    const marks = buildPdfMarks({previous, plan: plan([{number: 1, action: 'delete', sourceRanges: [target]}])});assert.equal(marks.ready, false, change);assert.ok(marks.issues.length);await assert.rejects(createMarkedPdf({previous, marks}), /not ready/);
  }
  const previous = structuredClone(base), line = previous.pages[0].lines[0], word = range(base, 'report,');line.glyphs = line.glyphs.filter(g => !(g.start >= word.start && g.end <= word.end));line.glyphs.push({start: word.start, end: word.end, x: 160, y: line.baseline - 2.2, width: 30, height: 10});
  assert.equal(buildPdfMarks({previous, plan: plan([{number: 1, action: 'insert', insertion: {offset: word.start + 2}}])}).ready, false);
});

test('multiple insertions and replacement patches retain every location and one arrow per actual replacement', async () => {
  const previous = await fixture(['The old rule is retained.', 'The old rule is repeated.', 'This separate text is removed.']), a = range(previous, 'old rule is retained'), b = range(previous, 'old rule is repeated'), c = range(previous, 'separate text is removed');
  const replacing = buildPdfMarks({previous, plan: plan([{number: 7, action: 'replace', sourceRanges: [a, b, c], insertions: [{offset: a.end}, {offset: b.end}], patches: [{sourceRanges: [a], insertion: {offset: a.end}}, {sourceRanges: [b], insertion: {offset: b.end}}, {sourceRanges: [c], insertion: null}]}])});
  assert.equal(replacing.ready, true, replacing.issues.join('\n'));assert.equal(replacing.amendments[0].strikes.length, 3);assert.equal(replacing.amendments[0].insertions.length, 2);assert.equal(replacing.labels.length, 3);
  assert.deepEqual(replacing.amendments[0].insertions.map(i => i.y), replacing.amendments[0].strikes.slice(0, 2).map(s => s.y2));
  const inserting = buildPdfMarks({previous, plan: plan([{number: 8, action: 'insert', insertions: [{offset: a.end}, {offset: b.end}]}])});assert.equal(inserting.ready, true);assert.equal(inserting.amendments[0].insertions.length, 2);assert.equal(inserting.labels.length, 2);
});

test('between-line marks require both unique consecutive printed numbers and correct physical order', async () => {
  const base = await fixture();
  for (const between of [{page: 1, above: 6, below: 7}, {page: 1, above: 1, below: 3}, {page: 2, above: 1, below: 2}]) assert.equal(buildPdfMarks({previous: base, plan: plan([{number: 2, action: 'insert', between}])}).ready, false);
  const duplicate = structuredClone(base);duplicate.pages[0].lines[2].margin.number = 2;assert.equal(buildPdfMarks({previous: duplicate, plan: plan([{number: 2, action: 'insert', between: {page: 1, above: 1, below: 2}}])}).ready, false);
  const reversed = structuredClone(base);reversed.pages[0].lines[1].baseline = 710;assert.equal(buildPdfMarks({previous: reversed, plan: plan([{number: 2, action: 'insert', between: {page: 1, above: 1, below: 2}}])}).ready, false);
});

test('original unnumbered heading targets get a small source badge without invented margin highlights', async () => {
  const previous = await fixture(['An act relating to public reporting.'], {noMargin: true}), target = range(previous, 'public reporting');
  const marks = buildPdfMarks({previous, plan: plan([{number: 2, action: 'delete', sourceRanges: [target]}])});assert.equal(marks.ready, true, marks.issues.join('\n'));assert.deepEqual(marks.amendments[0].margin, []);assert.equal(marks.labels.length, 1);assert.ok(marks.labels[0].x + marks.labels[0].width < 76);
});

test('combined labels stay outside the printed digits and avoid neighboring between-line labels', async () => {
  const previous = await fixture(), end = range(previous, 'report,').end;
  const marks = buildPdfMarks({previous, plan: plan([{number: 1, action: 'insert', insertion: {offset: end}}, {number: 2, action: 'insert', insertion: {offset: end}}, {number: 3, action: 'insert', between: {page: 1, above: 1, below: 2}}])});
  assert.equal(marks.ready, true, marks.issues.join('\n'));assert.equal(marks.labels.length, 2);assert.equal(marks.labels[0].text, '1,2');assert.ok(marks.labels.every(l => l.x + l.width < 42));
});

test('a tightly cropped left edge uses only the clear gutter between digits and body for its number badge', async () => {
  const previous = await fixture(), target = range(previous, 'old reporting requirement');previous.pages[0].view = [40, 40, 587, 752];
  const marks = buildPdfMarks({previous, plan: plan([{number: 3, action: 'delete', sourceRanges: [target]}])});assert.equal(marks.ready, true, marks.issues.join('\n'));
  const label = marks.labels[0], margin = previous.pages[0].lines[2].margin;assert.ok(label.x > margin.x + margin.width);assert.ok(label.x + label.width < 76);
});

test('export leaves original bytes and embedded source content intact and preserves crop/media boxes', async () => {
  const previous = await fixture(undefined, {crop: true}), before = hash(previous.bytes), rawBefore = await PDFDocument.load(previous.bytes), sourceContent = originalStreams(rawBefore, rawBefore.getPages()[0]), target = range(previous, 'old reporting requirement');
  const marks = buildPdfMarks({previous, plan: plan([{number: 3, action: 'delete', sourceRanges: [target]}])});assert.equal(marks.ready, true, marks.issues.join('\n'));
  const bytes = await createMarkedPdf({previous, marks, title: 'Amends In AB 1982 March 25, 2026'}), output = await PDFDocument.load(bytes);
  assert.equal(hash(previous.bytes), before);assert.equal(output.getPageCount(), rawBefore.getPageCount());assert.deepEqual(output.getPages()[0].getCropBox(), rawBefore.getPages()[0].getCropBox());assert.deepEqual(output.getPages()[0].getMediaBox(), rawBefore.getPages()[0].getMediaBox());assert.equal(output.getTitle(), 'Amends In AB 1982 March 25, 2026');
  const afterContent = originalStreams(output, output.getPages()[0]);assert.ok(sourceContent.every(content => afterContent.includes(content)));assert.ok(bytes.length > previous.bytes.length);
});

test('unsupported rotated layout is blocked before marking and low-level export rejects malformed draw plans', async () => {
  const previous = await fixture(undefined, {rotation: 90}), target = range(previous, 'old reporting requirement');
  assert.equal(buildPdfMarks({previous, plan: plan([{number: 3, action: 'delete', sourceRanges: [target]}])}).ready, false);
  const good = await fixture(), valid = buildPdfMarks({previous: good, plan: plan([{number: 3, action: 'delete', sourceRanges: [range(good, 'old reporting requirement')]}])});
  for (const mutate of [m => {m.amendments[0].strikes[0].page = 2;}, m => {m.amendments[0].strikes[0].x2 = NaN;}, m => {m.amendments[0].margin[0].rect.x = -5;}, m => {m.labels = [];}]) {const broken = structuredClone(valid);mutate(broken);await assert.rejects(createMarkedPdf({bytes: good.bytes, marks: broken}));}
  const direct = await createMarkedPdf({bytes: previous.bytes, marks: valid}), output = await PDFDocument.load(direct);assert.equal(output.getPages()[0].getRotation().angle, 90);
});

test('the extracted amendment planner and PDF exporter integrate across all four original instruction forms', async () => {
  const previous = await fixture(['The report, upon request, is available.', 'Before the insertion.', 'After the insertion.', 'The obsolete wording applies.', 'The period is 30 days.']);previous.doc = makeDocument([previous.doc.text], 'Previous');
  const instructions = {doc: makeDocument(['Amendment 1\nOn page 1, in line 1, after the first comma insert:\nin writing,\nAmendment 2\nOn page 1, between lines 2 and 3, insert:\nAdditional text.\nAmendment 3\nOn page 1, in line 4, strike out “obsolete wording”.\nAmendment 4\nOn page 1, in line 5, strike out “30 days” and insert:\n45 days'], 'Amendments')};
  const analyzed = planAmendments({previous, instructions});assert.equal(analyzed.ready, true, JSON.stringify(analyzed.issues));
  const marks = buildPdfMarks({previous, plan: analyzed});assert.equal(marks.ready, true, JSON.stringify(marks.issues));assert.deepEqual(marks.amendments.map(m => m.action), ['insert', 'insert', 'delete', 'replace']);assert.equal(marks.amendments[3].insertions.length, 1);
  const output = await createMarkedPdf({previous, plan: analyzed, title: 'Amends In AB 1982 March 25, 2026'});assert.equal((await PDFDocument.load(output)).getPageCount(), 1);
});

test('printed leading zeroes are preserved but canonical duplicate amendment numbers are rejected', async () => {
  const previous = await fixture(), target = range(previous, 'old reporting requirement');
  const marks = buildPdfMarks({previous, plan: plan([{number: '001', action: 'delete', sourceRanges: [target]}])});assert.equal(marks.ready, true);assert.equal(marks.labels[0].text, '001');await createMarkedPdf({previous, marks});
  assert.equal(buildPdfMarks({previous, plan: plan([{number: '001', action: 'delete', sourceRanges: [target]}, {number: '1', action: 'delete', sourceRanges: [target]}])}).ready, false);
});
