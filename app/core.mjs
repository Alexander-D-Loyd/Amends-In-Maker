import {isBudgetRunningHead,digestRange} from './change-scope.mjs';
import {historyTokens} from './history-rows.mjs';
import {budgetContext,budgetLeaderRanges} from './budget-layout.mjs';
import guideSpellings from './data/lcb-spelling-words.json' with {type:'json'};
import {guidePhraseSpellingRanges} from './spelling-guide-phrases.mjs';
import {statuteChapterSpellingRanges} from './spelling-statute-chapters.mjs';
import {numberedSubchapterSpellingRanges} from './spelling-lcb-numbered-subchapter.mjs';
import {billJrBoxes} from './amendment-jr-box.mjs';
const guideCompounds=guideSpellings.words.filter(r=>r.word.includes('-')).map(r=>r.word);
const compoundPattern=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+guideCompounds.map(word=>word.split('-').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[-\\u2010\\u2011]')).join('|')+')(?:[’\']s)?(?![\\p{L}\\p{N}_])','giu');
export function classify(text) {
  const trimmed = text.trim().replace(/^(?:[-•]\s+|\d+[.)]\s+)/, '');
  // Prefer explicit editorial language; general obligations remain content.
  const direct = /^(?:(?:editor(?:ial)?|revision|editing|reviewer)\s*(?:note|instruction)s?\s*[:\-]\s*)?(?:please\s+)?(delete|remove|omit|insert|add|replace|change|revise|rewrite|move|retain|keep)\b/i.exec(trimmed);
  const indirect = /\b(?:paragraph|sentence|section|heading|word|phrase|text|clause|line|bullet|page)\b.{0,90}\b(?:should|must|needs? to)\s+be\s+(deleted|removed|omitted|inserted|added|replaced|changed|revised|rewritten|moved|retained)\b/i.exec(trimmed);
  const contextual = /\b(?:delete|remove|omit|insert|add|replace|change|revise|rewrite|move|retain|keep)\b.{0,100}\b(?:paragraph|sentence|section|heading|word|phrase|text|clause|line|bullet|page|quotation|caption)\b/i.exec(trimmed);
  const quoteAction = direct && /["“”‘’]/.test(trimmed);
  const marked = /^(?:editor(?:ial)?|revision|editing|reviewer)\s*(?:note|instruction)s?\s*[:\-]/i.test(trimmed);
  const targetMention = /\b(?:paragraph|sentence|section|heading|word|phrase|text|clause|line|bullet|page|quotation|caption)\b/i.test(trimmed);
  // "Add sugar" and "Keep records for seven years" are ordinary content.
  const targetFirst = /^(?:in|at|after|before|for)\s+(?:the\s+)?(?:paragraph|sentence|section|heading|line|page)\b.{0,60}[,:]\s*(?:please\s+)?(?:delete|remove|insert|add|replace|change|revise|rewrite|move)\b/i.test(trimmed);
  const likely = !!(indirect || marked || targetFirst || (direct && (targetMention || quoteAction || /^(?:replace|rewrite|revise|omit)\b/i.test(direct[1]))));
  const found = direct?.[1] || indirect?.[1] || contextual?.[0]?.match(/delete|remove|omit|insert|add|replace|change|revise|rewrite|move|retain|keep/i)?.[0];
  const action = found ? found.toLowerCase().replace(/deleted/, 'delete').replace(/removed/, 'remove').replace(/replaced/, 'replace').replace(/changed/, 'change').replace(/inserted/, 'insert').replace(/added/, 'add').replace(/revised/, 'revise').replace(/rewritten/, 'rewrite').replace(/moved/, 'move').replace(/omitted/, 'omit').replace(/retained/, 'retain') : 'review';
  const target = trimmed.match(/\b(?:paragraph|sentence|section|heading|word|phrase|text|clause|line|bullet|page)\s+(?:\d+(?:\.\d+)*|["“][^"”]+["”]|[A-Z](?=\b))/i)?.[0] || '';
  const replacement = trimmed.match(/\b(?:with|insert|add)\s+["“]([^"”]+)["”]/i)?.[1] || '';
  return { kind: likely ? 'instruction' : 'content', action, target, replacement, reason: likely ? 'Editorial wording detected; confirm the label.' : 'No explicit editing direction detected.' };
}
export function makeBlocks(pages) {
  return pages.flatMap((text, page) => text.split(/\n+/).filter(line => line.trim()).map((text, i) => ({ id: `${page + 1}-${i}`, text: text.trim(), page: page + 1, ...classify(text) })));
}
export function contentText(doc, includeInstructions = false) {
  return doc.blocks.filter(b => includeInstructions || b.kind === 'content').map(b => b.text).join('\n');
}
export function wordCount(text) { return (text.match(/\S+/g) || []).length; }
// Compare lexical text across the whole document. Layout whitespace has no tokens.
// Offsets refer to each source independently so rendering keeps accurate page refs.
export function comparisonTokens(text) {
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}_]+|[^\s\u200b\u00ad]/gu), match => ({ value: match[0], start: match.index, end: match.index + match[0].length }));
}
export function substantiveTokens(text,context=text){
  return outsideRanges(comparisonTokens(text),budgetLeaderRanges(text,budgetContext(text)?text:context));
}
function outsideRanges(tokens,ranges){
  let index=0;
  return tokens.filter(token=>{
    while(index<ranges.length&&ranges[index].end<=token.start)index++;
    const range=ranges[index];return !range||token.end<=range.start||token.start>=range.end;
  });
}
export function extractPageLines(items) {
  const rows = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let row = rows.find(row => Math.abs(row.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.sort((a,b) => b.y - a.y).map(row => {
    let text = '', end = null;
    for (const item of row.items.sort((a,b) => a.transform[4] - b.transform[4])) {
      const gap = end === null ? 0 : item.transform[4] - end;
      if (text && gap > Math.max(1.5, item.height * .16) && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      text += item.str;
      end = item.transform[4] + item.width;
    }
    return text.trim();
  }).filter(Boolean);
}
function layoutLines(pages) {
  // Only explicit "line N" prefixes and recognizable, repeated page labels.
  // Numeric clauses, headings, dates and body content are retained.
  const labels = new Map();
  const firstHead=(pages[0]||'').split('\n').slice(0,2).map(s=>s.trim()),billLabel=/^(?:AB|SB)\s*\d+$/i,folioLabel=/^[—–-]\s*\d+\s*[—–-]$/;
  // Extracted later bill pages lack the original masthead. Require an exact
  // bill/folio running head, together or in two top rows, before excluding
  // legislative version/revision footers. A bill mention alone is insufficient.
  const combinedBillHead=/^(?:(?:AB|SB)\s*\d+\s*[—–-]\s*\d+\s*[—–-]|[—–-]\s*\d+\s*[—–-]\s*(?:AB|SB)\s*\d+)$/i;
  const billDocument=/\b(?:ASSEMBLY|SENATE)\s+BILL\s+(?:No\.?\s*)?\d+/i.test(pages[0]||'')||firstHead.some(s=>combinedBillHead.test(s))||(firstHead.some(s=>billLabel.test(s))&&firstHead.some(s=>folioLabel.test(s)));
  const pageLabel = text => /^(?:\d+|[—–-]\s*\d+\s*[—–-]|(?:[—–-]\s*\d+\s*[—–-]\s*)?(?:AB|SB)\s*\d+(?:\s*[—–-]\s*\d+\s*[—–-])?)$/i.test(text.trim());
  for (const page of pages) {
    const lines = page.split('\n');
    for (const text of new Set([...lines.slice(0,2), ...lines.slice(-2)].filter(pageLabel))) labels.set(text.trim(), (labels.get(text.trim()) || 0) + 1);
  }
  return pages.map(page => page.split('\n').map((text, i, lines) => {
    const atEdge = i < 2 || i >= lines.length - 2;
    const corrected=/^Corrected\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\d{2}\s*$/i.test(text.trim());
    const revised=/^Revised\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*[—–-]\s*See\s+last\s+page\.\s*(?:\d{2})?\s*$/i.test(text.trim());
    const ignored = atEdge && ((pageLabel(text) && ((labels.get(text.trim()) || 0) > 1 || /[—–-]/.test(text) || billDocument&&/^\d{2}$/.test(text.trim()))) || billDocument&&(corrected||revised));
    const margin = text.match(/^line\s*\d+(?:\s+|$)/i)?.[0] || '';
    return {text, ignored, margin, layoutLabel:ignored};
  }));
}
export function cleanLayoutLabels(pages) {
  return layoutLines(pages).map(lines => lines.filter(line => !line.ignored).map(line => line.text.slice(line.margin.length)).join('\n'));
}
export function makeDocument(pages, name, pageStrikes=[], pageFormatting=[], words=null) {
  let offset = 0;
  const blocks = [], excluded = [];
  layoutLines(pages).forEach((lines, page) => lines.forEach((line, i) => {
    if (!line.text.trim()) {offset+=line.text.length+1;return;}
    const block = {...line, formatting:pageFormatting[page]?.[i], id:`${page+1}-${i}`, page:page+1, start:offset, end:offset+line.text.length, kind:'content'};
    blocks.push(block);
    if (line.ignored || line.margin) excluded.push({start:offset, end:offset+(line.ignored ? line.text.length : line.margin.length)});
    offset = block.end + 1;
  }));
  const text = pages.join('\n');
  const jrBoxes=billJrBoxes(blocks,pages);
  for(const notice of jrBoxes)for(const range of notice.ranges){
    const block=blocks.find(b=>b.start===range.start&&b.end===range.end);
    block.ignored=true;block.jrBox=true;
    for(let i=excluded.length-1;i>=0;i--)if(excluded[i].start>=range.start&&excluded[i].end<=range.end)excluded.splice(i,1);
    excluded.push({...range});
  }
  const lastContent=blocks.findLast(b=>!b.ignored),finalLine=blocks.findLast(b=>b.margin&&b.text.slice(b.margin.length).trim());
  if(lastContent&&finalLine&&lastContent.start>finalLine.end&&/^[0O]$/.test(lastContent.text.trim())){
    lastContent.ignored=true;lastContent.layoutLabel=true;excluded.push({start:lastContent.start,end:lastContent.end});
  }
  // Use the document's printed text column on short pages as well. A sparse
  // final page must not infer its column from a single indented body line.
  const columnBlocks=blocks.filter(b=>!b.jrBox&&b.formatting&&b.text.slice(b.margin.length).trim()&&
    (b.margin||(b.text.length>40&&b.formatting.right-b.formatting.x>b.formatting.pageWidth*.4)));
  const columns=new Map();
  for(const b of columnBlocks){
    const f=b.formatting,c=columns.get(f.pageWidth)||{left:f.x,right:f.right};
    c.left=Math.min(c.left,f.x);c.right=Math.max(c.right,f.right);columns.set(f.pageWidth,c);
  }
  const digest=digestRange({text}),digestColumns=new Map();
  // A wide table or a differently positioned enacted body must not shift
  // every digest paragraph. Preserve paragraph-relative source indentation.
  for(const b of columnBlocks.filter(b=>digest&&!b.ignored&&!b.margin&&b.start>=digest.start&&b.end<=digest.end)){
    const f=b.formatting,left=digestColumns.get(f.pageWidth);digestColumns.set(f.pageWidth,left===undefined?f.x:Math.min(left,f.x));
  }
  for(const b of blocks){
    const f=b.formatting,c=f&&columns.get(f.pageWidth);if(!c)continue;
    f.columnLeft=c.left;f.columnRight=c.right;
    f.indent=Math.max(0,(f.x-c.left)/Math.max(1,c.right-c.left));
    if(digest&&!b.margin&&!b.ignored&&b.start>=digest.start&&b.end<=digest.end&&digestColumns.has(f.pageWidth))f.indent=Math.max(0,(f.x-digestColumns.get(f.pageWidth))/Math.max(1,c.right-c.left));
    if(!b.margin){
      const width=c.right-c.left,center=(c.left+c.right)/2;
      f.centered=(Math.abs((f.x+f.right)/2-center)<width*.015||Math.abs((f.x+f.right)/2-f.pageWidth/2)<f.pageWidth*.01)&&(f.right-f.x<width*.97||f.runs.some(r=>r.bold||r.smallCaps));
      // A left-column Digest line can happen to have a centered bounding
      // box. Centering that prose also centers each newly wrapped short line.
      // Preserve its actual paragraph indent; keep the Digest heading and
      // genuinely inset headings available to the normal layout inference.
      const digestLeft=digestColumns.get(f.pageWidth);
      if(digest&&b.start>digest.start&&b.end<=digest.end&&digestLeft!==undefined&&f.x>=digestLeft&&f.x-digestLeft<=Math.max(1,f.bodyHeight||f.height)*2)f.centered=false;
    }
    if(f.headerGaps?.length||b.ignored){
      // A JR notice is still a numbered source row. Its line label and
      // number are rendered in the gutter, not in its positioned body.
      const contentStart=b.jrBox?b.margin.length:0;
      const gaps=f.headerGaps||[],cuts=[contentStart,...gaps.flatMap(g=>[g.start,g.end]).filter(at=>at>=contentStart),b.text.length].sort((a,b)=>a-b);
      f.headerParts=[];
      for(let i=0;i<cuts.length-1;i++){
        const start=cuts[i],end=cuts[i+1];
        if(start===end||!b.text.slice(start,end).trim()||gaps.some(g=>g.start<=start&&g.end>=end))continue;
        const runs=f.runs.filter(r=>!r.space&&r.start<end&&r.end>start);if(!runs.length)continue;
        const left=runs[0].x,right=runs.at(-1).x+runs.at(-1).width,width=c.right-c.left;
        const center=(left+right)/2;
        const anchor=b.jrBox?'left':Math.abs(center-(c.left+c.right)/2)<width*.03?'center':Math.abs(right-c.right)<width*.03?'right':'left';
        f.headerParts.push({start,end,anchor,position:anchor==='center'?(center-c.left)/width:anchor==='right'?(c.right-right)/width:(left-c.left)/width});
      }
    }
  }
  // Table running heads can occur between the two fragments of a divided
  // word. They stay visible, but are never word continuations or body tokens.
  for(const block of blocks)if(isBudgetRunningHead({text},block)){
    block.runningHead=true;excluded.push({start:block.start,end:block.end});
  }
  excluded.sort((a,b)=>a.start-b.start);
  // Comparison-only layout exclusions must not erase leaders from style input:
  // the style checker uses their presence to recognize budget table rows.
  const comparisonExcluded=[...excluded,...budgetLeaderRanges(text)].sort((a,b)=>a.start-b.start);
  const rawTokens=outsideRanges(comparisonTokens(text),comparisonExcluded);
  // Join discretionary line-end hyphens only for recognized words. Keep the
  // original characters and offsets for PDF rendering and genuine compounds.
  const wrappedWords=[];
  const continuationStarts=new Set();
  for(let i=0;i<blocks.length-1;i++){
    const a=blocks[i];if(a.ignored||a.runningHead||continuationStarts.has(i))continue;
    const left=/([\p{L}]+)[-\u00ad\u2010]\s*$/u.exec(a.text);if(!left)continue;
    const start=a.start+left.index,parts=[left[1]],spans=[{start,end:start+left[1].length}];
    let j=i+1;
    while(parts.length<16){
      while(blocks[j]?.ignored||blocks[j]?.runningHead)j++;
      const b=blocks[j];if(!b)break;
      const body=b.text.slice(b.margin.length),right=/^\s*([\p{L}]+)/u.exec(body);if(!right)break;
      const partStart=b.start+b.margin.length+right.index+right[0].length-right[1].length;
      parts.push(right[1]);spans.push({start:partStart,end:partStart+right[1].length});
      // A continuation can itself occupy a complete divided line. Consume it
      // once, rather than emitting overlapping two-fragment spelling issues.
      if(!/^[-\u00ad\u2010]\s*$/u.test(body.slice(right[0].length)))break;
      continuationStarts.add(j);j++;
    }
    if(parts.length<2)continue;
    const word=parts.join(''),lower=word.toLowerCase();
    const compound=guideCompounds.some(c=>c.toLowerCase()===parts.join('-').toLowerCase());
    const recognized=!compound&&words&&(words.has(lower)||words.has(lower.replace(/s$/,''))||words.has(lower.replace(/ed$/,''))||words.has(lower.replace(/ing$/,''))||words.has(lower.replace(/ing$/,'e')));
    const end=spans.at(-1).end;
    wrappedWords.push({word:compound?parts.join('-'):word,start,end,recognized:!!recognized,parts,spans});
  }
  let tokens=[];let rawIndex=0;
  for(const wrap of wrappedWords.filter(w=>w.recognized)){
    while(rawIndex<rawTokens.length&&rawTokens[rawIndex].start<wrap.start)tokens.push(rawTokens[rawIndex++]);
    tokens.push({value:wrap.word,start:wrap.start,end:wrap.end});
    while(rawIndex<rawTokens.length&&rawTokens[rawIndex].start<wrap.end)rawIndex++;
  }
  // Large bills can exceed the engine's argument-count limit even though
  // their text is within the PDF limits. Append without a variadic call.
  while(rawIndex<rawTokens.length)tokens.push(rawTokens[rawIndex++]);
  tokens=historyTokens(tokens,blocks);
  let pageOffset=0;const struck=[];
  pages.forEach((page,i)=>{for(const span of pageStrikes[i] || [])struck.push({start:pageOffset+span.start,end:pageOffset+span.end});pageOffset+=page.length+1;});
  const orderedStrikes=[...struck].sort((a,b)=>a.start-b.start),mergedStrikes=[];
  for(const span of orderedStrikes){const last=mergedStrikes.at(-1);if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);else mergedStrikes.push({...span});}
  let strikeIndex=0;
  const effectiveTokens=tokens.filter(token=>{
    while(strikeIndex<mergedStrikes.length&&mergedStrikes[strikeIndex].end<=token.start)strikeIndex++;
    const span=mergedStrikes[strikeIndex];return !span||span.start>=token.end;
  });
  return {name, pages:pages.length, rawPages:pages, blocks, text, tokens, effectiveTokens, struck, excluded, comparisonExcluded, wrappedWords, spelling:[], changeLocations:{},...(jrBoxes.length?{jrBoxes}:{})};
}
export function spellingCandidates(doc) {
  let rangeIndex=0;
  const guidePhrases=[...guidePhraseSpellingRanges(doc),...statuteChapterSpellingRanges(doc),...numberedSubchapterSpellingRanges(doc)].sort((a,b)=>a.start-b.start);let phraseIndex=0;
  // Alphabetic clause labels are structural identifiers, not spelling words.
  // Require a leading marker sequence or an explicit legal reference label;
  // ordinary prose and parenthetical words retain their spelling checks.
  const clauseMarkers=new Set();
  const addMarkers=(text,start)=>{for(const m of text.matchAll(/\(([a-z]{1,2})\)/g))clauseMarkers.add(start+m.index+1);};
  for(const block of doc.blocks){
    const start=block.start+(block.margin?.length||0),body=doc.text.slice(start,block.end);
    const leading=/^\s*(?:\((?:\d+|[A-Za-z]{1,2}|[ivxIVX]+)\)\s*)+/.exec(body);
    if(leading)addMarkers(leading[0],start);
  }
  const referenceParts=[];let referenceCursor=0;
  for(const range of doc.excluded){referenceParts.push(doc.text.slice(referenceCursor,range.start),' '.repeat(range.end-range.start));referenceCursor=range.end;}
  referenceParts.push(doc.text.slice(referenceCursor));
  for(const m of referenceParts.join('').matchAll(/\b(?:subdivisions?|subparagraphs?|paragraphs?|clauses?)\s+\([a-z]{1,2}\)(?:\s*(?:,\s*(?:(?:and|or)\s+)?|(?:and|or|to|through)\s+)\([a-z]{1,2}\))*/gi))addMarkers(m[0],m.index);
  // PDF small-cap headings may extract as lowercase. Exempt only CALIFORNIA
  // in the legislature masthead, leaving ordinary occurrences checkable.
  const mastheadWords=doc.blocks.filter(b=>b.page===1).slice(0,8).flatMap(block=>{
    if(block.margin||!/^california\s+legislature\b/i.test(block.text))return [];
    const end='california'.length,runs=block.formatting?.runs||[];
    if(!Array.from({length:end},(_,i)=>i).every(i=>runs.some(r=>r.smallCaps&&r.start<=i&&r.end>i)))return [];
    return [{start:block.start,end:block.start+end}];
  });
  const wraps=doc.wrappedWords||[];
  const compounds=Array.from(doc.text.matchAll(compoundPattern),m=>({word:m[0],start:m.index,end:m.index+m[0].length}));
  let wrapIndex=0;
  let compoundIndex=0;
  const candidates=[...wraps,...compounds,...Array.from(doc.text.matchAll(/\p{L}+(?:[’']\p{L}+)*/gu), match => ({word:match[0], start:match.index, end:match.index+match[0].length})).filter(w=>{
    while(wrapIndex<wraps.length&&wraps[wrapIndex].end<=w.start)wrapIndex++;
    while(compoundIndex<compounds.length&&compounds[compoundIndex].end<=w.start)compoundIndex++;
    const r=wraps[wrapIndex],c=compounds[compoundIndex];return (!r||r.start>=w.end)&&(!c||c.start>=w.end);
  })].sort((a,b)=>a.start-b.start);
  return candidates.filter(word => {
    while(phraseIndex<guidePhrases.length&&guidePhrases[phraseIndex].end<=word.start)phraseIndex++;
    const phrase=guidePhrases[phraseIndex];
    if(phrase&&word.start>=phrase.start&&word.end<=phrase.end)return false;
    if(clauseMarkers.has(word.start))return false;
    // A correct numeric ordinal's suffix is not a separately spelled word.
    // Keep standalone letters, embedded codes and malformed suffixes reviewable.
    if(/^(?:st|nd|rd|th)$/i.test(word.word)){
      const number=/(?<![\p{L}\p{N}_])\d+$/u.exec(doc.text.slice(Math.max(0,word.start-30),word.start));
      if(number){
        const lastTwo=Number(number[0].slice(-2)),last=lastTwo%10;
        const suffix=lastTwo>=11&&lastTwo<=13?'th':({1:'st',2:'nd',3:'rd'}[last]||'th');
        if(word.word.toLowerCase()===suffix)return false;
      }
    }
    while (rangeIndex<doc.excluded.length && doc.excluded[rangeIndex].end<=word.start) rangeIndex++;
    const range=doc.excluded[rangeIndex];
    return (!range || word.end<=range.start || word.start>=range.end || word.parts&&word.start<range.start) && !(word.word.length>1 && word.word===word.word.toUpperCase()) && !mastheadWords.some(r=>r.start===word.start&&r.end===word.end);
  });
}
export function activeText(doc){
  const ranges=[...(doc.struck||[])].sort((a,b)=>a.start-b.start);
  let cursor=0,result='';
  for(const range of ranges){
    const start=Math.max(cursor,range.start),end=Math.min(doc.text.length,range.end);
    if(end<=start)continue;
    result+=doc.text.slice(cursor,start)+doc.text.slice(start,end).replace(/[^\n]/g,' ');cursor=end;
  }
  return result+doc.text.slice(cursor);
}

