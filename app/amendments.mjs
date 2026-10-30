import {externalBillReference,resolveExternalPayload} from './external-amendments.mjs';
import {digestRule,digestBodyRange,digestPayload,digestSourceDeletionRanges} from './digest-amendment.mjs';
import {repairOcrDirective} from './ocr-text.mjs';
import {substantiveTokens} from './core.mjs';
import {diffArrays} from './vendor/diff/diff/array.js';
import {sequenceDiff} from './sequence-diff.mjs';
import {amendmentDiscrepancies} from './amendment-discrepancies.mjs';
import {amendmentWordDiff} from './amendment-word-diff.mjs';
import {digestChangedRanges} from './digest-delta.mjs';
import {splitHistoryChanges} from './history-rows.mjs';
import {isAmendmentMetadataLine as metadataLine} from './amendment-metadata.mjs';
import {periodInsertionAnchor} from './amendment-period-anchor.mjs';
import {commaInsertionAnchor} from './amendment-comma-anchor.mjs';
import {applyExternalReferenceReadingWarnings,billReadingWarnings} from './bill-ocr-policy.mjs';
const canonical=value=>value.normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
const values=tokens=>tokens.map(t=>canonical(t.value));
const phrase=(text,context=text)=>values(substantiveTokens(text,context));
const equals=(a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
const quotedSource=String.raw`““[^”]+””|“[^“”]*“[^“”]*”[^“”]*”|“[^”]+”|"[^"]+"|‘[^’]+’|'[^']+'`;
const quotes=text=>Array.from(text.matchAll(new RegExp(quotedSource,'g')),m=>m[0].slice(1,-1));
// Some instruction PDFs append an annotated copy of the whole bill.
const proposedHeading=/(?:^|\n)[ \t]*PROPOSED[ \t]+AMENDMENTS(?:[ \t]*(?=\n|$)|[ \t]+(?:TO\b|RN\b))/i;
export function instructionsEnd(text){
  const ends=[text.search(proposedHeading),text.search(/(?:^|\n)[ \t]*[-–—][ \t]*0[ \t]*[-–—][ \t]*(?=\r?\n|$)/)];
  const found=ends.filter(n=>n>=0);return found.length?Math.min(...found):-1;
}
export function isProposedAmendmentsPage(text){return proposedHeading.test(text);}
function trimFooter(text){return text.split('\n').filter(line=>!metadataLine(line)).join('\n').trim();}
function instructionSpacing(text){
  // Normalize only editorial wording outside quotations; never rewrite payload.
  return text.split(/(“[^”]*”|"[^"]*"|‘[^’]*’|'[^']*')/g).map((part,i)=>i%2?part:part
    .replace(/\bOn(?=page\s*\d)/gi,'On ')
    .replace(/\bpage(?=\d)/gi,'page ')
    .replace(/\bin(?=line\s*\d)/gi,'in ')
    .replace(/\bline(?=\d)/gi,'line ')
    .replace(/\bbetween(?=lines?\s*\d)/gi,'between ')
    .replace(/\bstrikeout\b/gi,'strike out')
    .replace(/\bandinsert\b/gi,'and insert')
    .replace(/([”"’])(?=and\s*insert)/g,'$1 ')).join('');
}
// Keep source formatting for display independently of the active verification text.
export function amendmentDisplays(doc){
  const appendix=instructionsEnd(doc.text),limit=appendix<0?doc.text.length:appendix;
  const headings=[...doc.text.slice(0,limit).matchAll(/(?:^|\n)\s*Amendment\s*(\d+)\s*(?=\n|$)/gi)];
  const sections=headings.length?headings.map((m,i)=>({number:m[1],start:m.index+m[0].length,end:headings[i+1]?.index??limit})):[{number:'1',start:0,end:limit}];
  return sections.map(section=>{
    let text='',cursor=section.start;const strikes=[];
    for(const line of doc.text.slice(section.start,section.end).split('\n')){
      if(!metadataLine(line)){
        if(text)text+='\n';const offset=text.length;text+=line;
        for(const range of doc.struck||[]){
          const start=Math.max(cursor,range.start),end=Math.min(cursor+line.length,range.end);
          if(end>start)strikes.push({start:offset+start-cursor,end:offset+end-cursor});
        }
      }
      cursor+=line.length+1;
    }
    function part(start,end){
      const raw=text.slice(start,end),leading=raw.length-raw.trimStart().length,value=raw.trim();
      const from=start+leading,to=from+value.length;
      return {text:value,strikes:strikes.filter(r=>r.end>from&&r.start<to).map(r=>({start:Math.max(from,r.start)-from,end:Math.min(to,r.end)-from}))};
    }
    const marker=/\b(?:and\s*)?insert\s*:\s*/i.exec(text),boundary=marker?marker.index+marker[0].length:text.length;
    const directive=part(0,boundary);
    return {number:section.number,directive:doc.ocr?repairOcrDirective(directive):directive,payload:part(boundary,text.length)};
  });
}
export function parseAmendments(text){
  const appendix=instructionsEnd(text);if(appendix>=0)text=text.slice(0,appendix);
  const headings=[...text.matchAll(/(?:^|\n)\s*Amendment\s*(\d+)\s*(?=\n|$)/gi)];
  const sections=headings.length?headings.map((m,i)=>({number:m[1],source:text.slice(m.index+m[0].length,headings[i+1]?.index??text.length)})):[{number:'1',source:text}];
  return sections.map(section=>{
    const source=trimFooter(section.source);
    const marker=/\b(?:and\s*)?insert\s*:\s*/i.exec(source);
    const directive=instructionSpacing(marker?source.slice(0,marker.index+marker[0].length):source).replace(/\s+/g,' ').trim();
    const insertText=marker?source.slice(marker.index+marker[0].length).trim():'';
    const deleting=/\b(?:strike\s+out|delete|remove)\b/i.test(directive);
    const inserting=/\binsert\b/i.test(directive);
    const action=deleting?(inserting?'replace':'delete'):(inserting?'insert':'unsupported');
    const between=/between\s+lines?\s+(\d+)\s+and\s+(\d+)/i.exec(directive);
    const beforeLine=/\bbefore\s+(?:the\s+)?line\s+(\d+)\b/i.exec(directive);
    const afterLine=/\bafter\s+(?:the\s+)?(?:last\s+)?line\s+(\d+)\b/i.exec(directive);
    const relativeLine=/\b(above|below)\s+(?:the\s+)?line\s+(\d+)\b/i.exec(directive);
    const billEnd=/\b(?:at\s+(?:the\s+)?end\s+of\s+(?:the\s+)?bill|after\s+(?:the\s+)?(?:last|final)\s+line(?:\s+of\s+(?:the\s+)?bill)?(?=\s*[,;:]|\s+insert\b))\b/i.test(directive);
    const lines=/\blines?\s+(\d+)(?:\s*(?:to|through|and|[-–—])\s*(\d+))?/i.exec(directive);
    const page=/\bpage\s+(\d+)/i.exec(directive);
    const title=/\bin\s+the\s+title\b/i.test(directive);
    const heading=/\bin\s+the\s+heading\b/i.test(directive);
    const anchor=/\b(after|before)\s+(?:(?:the\s+)?(?:first|second|third|fourth|fifth|last)\s+)?(“[^”]+”|"[^"]+"|‘[^’]+’|'[^']+')/i.exec(directive);
    const deletion=/\b(?:strike\s+out|delete|remove)\s+([\s\S]*?)(?:\band\s+insert|$)/i.exec(directive);
    const ordinal=/\b(first|second|third|fourth|fifth|last)\b/i.exec(deletion?.[1] || anchor?.[0] || '')?.[1]?.toLowerCase();
    const occurrence=ordinal?({first:1,second:2,third:3,fourth:4,fifth:5,last:-1}[ordinal]):null;
    const externalReference=externalBillReference(insertText);
    let error='';
    if(/\[\s*insert\s+(?:contents?|text|body)\s+of\b/i.test(insertText))error='This amendment references an external document. Verify only its legislative body, excluding title, digest and headers; additional attached drafting material must also be supplied. The bracketed instruction is not literal insertion text.';
    if(action==='unsupported')error='Instruction wording is not supported. Review this amendment manually.';
    if(inserting && !marker)error='The insertion text is not clearly separated by “insert:”.';
    if(inserting && !insertText)error='No insertion text was found after “insert:”.';
    return {number:section.number,source,directive,insertText,action,page:page?Number(page[1]):null,title,heading,lineStart:lines?Number(lines[1]):null,lineEnd:lines?Number(lines[2]||lines[1]):null,between:between?[Number(between[1]),Number(between[2])]:null,beforeLine:beforeLine?Number(beforeLine[1]):null,afterLine:afterLine?Number(afterLine[1]):null,relativeLine:relativeLine?{position:relativeLine[1].toLowerCase(),line:Number(relativeLine[2])}:null,billEnd,anchor:anchor?quotes(anchor[2])[0]:null,position:anchor?.[1]?.toLowerCase()||null,deleteText:quotes(deletion?.[1]||''),occurrence,all:/\ball\s+occurrences\b/i.test(directive),externalReference,error};
  });
}
function scopedBlocks(rule,doc){
  let blocks=doc.blocks.filter(b=>!b.ignored);
  if(rule.title||rule.heading){
    const start=blocks.findIndex(b=>(rule.heading?/^Introduced\s+by\b/i:/^An\s+act\b/i).test(b.text.slice(b.margin.length)));
    if(start<0)throw Error(`The bill ${rule.heading?'heading':'title'} could not be located in the Previous Version.`);
    const found=[];
    for(let i=start;i<blocks.length && blocks[i].page===blocks[start].page;i++){
      const body=blocks[i].text.slice(blocks[i].margin.length);
      if(rule.heading&&i>start&&(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b|^An\s+act\b/i.test(body)))break;
      if(i>start && (/legislative\s+counsel|^AB\s+\d+,|^SB\s+\d+,|^The people\b/i.test(body)||blocks[i].margin))break;
      found.push(blocks[i]);
    }
    if(rule.lineStart&&(rule.lineStart<1||rule.lineEnd>found.length))throw Error(`The referenced ${rule.heading?'heading':'title'} line range was not found.`);
    blocks=rule.lineStart?found.slice(rule.lineStart-1,rule.lineEnd):found;
  }else{
    if(rule.page)blocks=blocks.filter(b=>b.page===rule.page);
    if(rule.lineStart && !rule.between && rule.beforeLine===null && rule.afterLine==null){
      blocks=blocks.filter(b=>{const n=Number(b.margin.match(/\d+/)?.[0]);return n>=rule.lineStart&&n<=rule.lineEnd;});
      if(!blocks.some(b=>Number(b.margin.match(/\d+/)?.[0])===rule.lineStart)||!blocks.some(b=>Number(b.margin.match(/\d+/)?.[0])===rule.lineEnd))throw Error('The complete printed margin-line range was not found.');
    }
  }
  if(!blocks.length)throw Error('The referenced page or printed margin line was not found in the Previous Version.');
  return blocks;
}
function occurrences(tokens,target,indices){
  const matches=[];
  for(let i=0;i<indices.length;i++){
    const first=indices[i];
    if(target.every((word,j)=>indices[i+j]===first+j && canonical(tokens[first+j]?.value||'')===word))matches.push({start:first,end:first+target.length});
  }
  return matches;
}
function choose(matches,rule){
  if(!matches.length)throw Error('The quoted source text was not found at the referenced location in the Previous Version.');
  if(rule.all)return matches;
  if(rule.occurrence){const match=rule.occurrence===-1?matches.at(-1):matches[rule.occurrence-1];if(!match)throw Error('The specified occurrence of the quoted text was not found.');return [match];}
  if(matches.length!==1)throw Error('The source text occurs more than once at this location. Its intended occurrence needs review.');
  return [matches[0]];
}
function compile(rule,doc){
  if(rule.error)throw Error(rule.error);
  if(rule.digest){
    const range=digestBodyRange(doc),tokens=doc.effectiveTokens||doc.tokens;
    const indices=tokens.map((t,i)=>t.start>=range.start&&t.end<=range.end?i:-1).filter(i=>i>=0);
    if(!indices.length)throw Error('The Previous Version has no readable digest text.');
    return [{start:indices[0],end:indices.at(-1)+1,replacement:phrase(rule.insertText,doc.text),sourceOffset:tokens[indices[0]].start,digest:true}];
  }
  if(!rule.title&&(/\bstrike\s+out\s+pages?\s+\d+/i.test(rule.directive)||(rule.directive.match(/\b(?:strike\s+out|delete|remove)\b/gi)||[]).length>1))return compileCompound(rule,doc);
  const tokens=doc.effectiveTokens||doc.tokens,blocks=scopedBlocks(rule,doc);
  const indices=tokens.map((token,i)=>blocks.some(b=>token.start>=b.start+b.margin.length && token.start<b.end)&&blocks.some(b=>token.end>b.start+b.margin.length && token.end<=b.end)?i:-1).filter(i=>i>=0);
  const replacement=phrase(rule.insertText,doc.text);
  // Heading/title instructions count their physical text rows, not the
  // enacted body's printed margin numbers. Keep this resolution scoped to
  // the identified heading/title and a single explicit relative line.
  if(rule.relativeLine||(rule.heading||rule.title)&&(rule.beforeLine!=null||rule.afterLine!=null)){
    if(rule.action!=='insert'||!(rule.heading||rule.title)||rule.heading&&rule.title||rule.between||rule.anchor)throw Error('A heading/title relative-line instruction must identify one insertion line.');
    const locations=[...rule.directive.matchAll(/\b(?:above|below|before|after)\s+(?:the\s+)?line\s+\d+\b/gi)];
    if(locations.length!==1||blocks.length!==1||!rule.lineStart||rule.lineStart!==rule.lineEnd||rule.page&&rule.page!==blocks[0].page)throw Error('The heading/title insertion line is ambiguous or outside its identified scope.');
    const before=rule.relativeLine?rule.relativeLine.position==='above':rule.beforeLine!=null;
    const sourceOffset=before?blocks[0].start+blocks[0].margin.length:blocks[0].end;
    const next=tokens.findIndex(t=>t.start>=sourceOffset),boundary=next<0?tokens.length:next;
    return [{start:boundary,end:boundary,replacement,sourceOffset}];
  }
  // Only the final legislative line may stand in for an unprinted following
  // line. Never guess a missing line on an intermediate page.
  const final=doc.blocks.findLast(b=>!b.ignored&&!b.runningHead&&b.margin&&b.text.slice(b.margin.length).trim());
  const atFinalLine=block=>block===final&&doc.blocks.filter(b=>b.start>=block.end&&!b.ignored&&!b.runningHead&&(!b.margin||b.text.slice(b.margin.length).trim())).every(b=>/^[-–—]?\s*[0Oo]\s*[-–—]?$/.test(b.text.trim()));
  const afterBlock=block=>{
    const sourceOffset=block.end,next=tokens.findIndex(t=>t.start>=sourceOffset),boundary=next<0?tokens.length:next;
    return [{start:boundary,end:boundary,replacement,sourceOffset,finalInsertion:atFinalLine(block)}];
  };
  const finalPeriod=t=>!!final&&t.value==='.'&&t.start>=final.start+final.margin.length&&t.end<=final.end&&!tokens.some(next=>next.start>=t.end&&next.start<final.end)&&atFinalLine(final);
  const periodAnchor=rule.action==='insert'&&!rule.anchor?periodInsertionAnchor(rule.directive):null;
  const commaAnchor=rule.action==='insert'?commaInsertionAnchor(rule.directive):null;
  if(commaAnchor){
    if(commaAnchor.ambiguous||rule.anchor||periodAnchor||rule.between||rule.beforeLine!=null||rule.afterLine!=null||rule.relativeLine||rule.title||rule.heading||rule.billEnd||rule.all)throw Error('The comma insertion combines incompatible or ambiguous source locations.');
    const matches=indices.filter(i=>tokens[i].value===','&&!(/\d/u.test(doc.text[tokens[i].start-1]||'')&&/\d/u.test(doc.text[tokens[i].end]||''))).map(i=>({start:i,end:i+1}));
    return choose(matches,{...rule,all:false,occurrence:commaAnchor.occurrence}).map(match=>{
      const token=tokens[match.start],after=commaAnchor.position==='after',boundary=after?match.end:match.start;
      return {start:boundary,end:boundary,replacement,sourceOffset:after?token.end:token.start};
    });
  }
  if(periodAnchor){
    if(periodAnchor.ambiguous||rule.between||rule.beforeLine!=null||rule.afterLine!=null||rule.relativeLine||rule.title||rule.heading)throw Error('The period insertion combines incompatible source locations.');
    const matches=indices.filter(i=>tokens[i].value==='.'&&!(/\d/u.test(doc.text[tokens[i].start-1]||'')&&/\d/u.test(doc.text[tokens[i].end]||''))).map(i=>({start:i,end:i+1}));
    const selected=choose(matches,{...rule,all:false,occurrence:periodAnchor.occurrence});
    return selected.map(match=>{
      const token=tokens[match.end-1],isFinal=finalPeriod(token);
      if((periodAnchor.billFinal||rule.billEnd)&&!isFinal)throw Error('The final sentence period could not be confirmed at the end of the bill.');
      return {start:match.end,end:match.end,replacement,sourceOffset:token.end,finalInsertion:isFinal};
    });
  }
  if(rule.billEnd){
    if(rule.action!=='insert'||!final||rule.page&&rule.page!==final.page||!atFinalLine(final))throw Error('The final legislative line and end of the bill could not be confirmed.');
    return afterBlock(final);
  }
  if(rule.afterLine!=null){
    if(rule.action!=='insert'||!rule.page)throw Error('An after-line insertion must specify a page and printed margin line.');
    const targets=blocks.filter(b=>Number(b.margin.match(/\d+/)?.[0])===rule.afterLine);
    if(targets.length!==1)throw Error('The referenced printed margin line must be present and unique.');
    return afterBlock(targets[0]);
  }
  if(rule.beforeLine!==null){
    if(rule.action!=='insert'||rule.title||rule.heading)throw Error('A before-line instruction must specify an insertion before a printed margin line.');
    const targets=blocks.filter(b=>Number(b.margin.match(/\d+/)?.[0])===rule.beforeLine);
    if(targets.length!==1)throw Error('The referenced printed margin line must be present and unique. Specify its page when the line occurs on multiple pages.');
    const sourceOffset=targets[0].start+targets[0].margin.length;
    const next=tokens.findIndex(t=>t.start>=sourceOffset),boundary=next<0?tokens.length:next;
    return [{start:boundary,end:boundary,replacement,sourceOffset}];
  }
  if(rule.between){
    if(rule.action!=='insert')throw Error('A between-lines instruction must clearly specify an insertion.');
    if(!rule.page)throw Error('The page for the between-lines insertion is not specified.');
    const before=blocks.filter(b=>Number(b.margin.match(/\d+/)?.[0])===rule.between[0]);
    const after=blocks.filter(b=>Number(b.margin.match(/\d+/)?.[0])===rule.between[1]);
    if(before.length===1&&(!after.length||after.length===1&&!after[0].text.slice(after[0].margin.length).trim())&&rule.between[1]===rule.between[0]+1&&atFinalLine(before[0]))return afterBlock(before[0]);
    if(before.length!==1||after.length!==1)throw Error('Both printed margin lines must be present and unique on the referenced page, unless the insertion follows the final legislative line.');
    const boundary=tokens.findIndex(t=>t.start>=after[0].start+after[0].margin.length);
    const previous=tokens[boundary-1];
    if(boundary<0||!previous||previous.end>before[0].end||previous.start<before[0].start)throw Error('The two referenced lines are not adjacent in the extracted source text.');
    return [{start:boundary,end:boundary,replacement}];
  }
  if(rule.action==='insert'){
    if(rule.anchor){return choose(occurrences(tokens,phrase(rule.anchor,doc.text),indices),rule).map(match=>({start:rule.position==='before'?match.start:match.end,end:rule.position==='before'?match.start:match.end,replacement,sourceOffset:rule.position==='before'?tokens[match.start].start:tokens[match.end-1].end,finalInsertion:rule.position==='after'&&finalPeriod(tokens[match.end-1])}));}
    if(!indices.length)throw Error('No text could be resolved at the insertion location.');
    if(/\bat\s+(?:the\s+)?(?:end|beginning|start)\b/i.test(rule.directive)){
      const atEnd=/\bat\s+(?:the\s+)?end\b/i.test(rule.directive),boundary=atEnd?indices.at(-1)+1:indices[0];return [{start:boundary,end:boundary,replacement,sourceOffset:atEnd?tokens[indices.at(-1)].end:tokens[indices[0]].start,finalInsertion:atEnd&&!!final&&tokens[indices.at(-1)].end===final.end&&atFinalLine(final)}];
    }
    throw Error('An insertion must identify an anchor, adjacent margin lines, or an explicit beginning/end location.');
  }
  if(rule.deleteText.length){
    if(rule.action==='replace'&&rule.deleteText.length!==1)throw Error('A replacement with multiple quoted targets needs manual review.');
    return rule.deleteText.flatMap(text=>choose(occurrences(tokens,phrase(text,doc.text),indices),rule).map(match=>({...match,replacement:rule.action==='replace'?replacement:[]})));
  }
  if(/\b(?:strike\s+out|delete|remove)\s+(?:the\s+)?lines?\s+\d+/i.test(rule.directive)&&rule.lineStart&&indices.length){
    return [{start:indices[0],end:indices.at(-1)+1,replacement:rule.action==='replace'?replacement:[]}];
  }
  throw Error('The text to strike out is not explicitly quoted or identified as a margin-line range.');
}
function compileCompound(rule,doc){
  const tokens=doc.effectiveTokens||doc.tokens;
  const events=[...rule.directive.matchAll(new RegExp(String.raw`\bon\s+page\s+\d+|\bin\s+lines?\s+\d+(?:\s*(?:to|through|and|[-–—])\s*\d+)?|\bstrike\s+out\s+pages?\s+\d+(?:\s*(?:to|through|and|[-–—])\s*\d+)?|\bstrike\s+out\s+lines?\s+\d+(?:\s*(?:to|through|and|[-–—])\s*\d+)?|\bstrike\s+out\s+(?:the\s+(?:first|second|third|fourth|fifth|last)\s+)?(?:${quotedSource})`,'gi'))];
  const patches=[];let page=null,lineStart=null,lineEnd=null;
  for(const match of events){
    const text=match[0],numbers=[...text.matchAll(/\d+/g)].map(m=>Number(m[0]));
    if(/^on\s+page/i.test(text)){page=numbers[0];lineStart=lineEnd=null;continue;}
    if(/^in\s+line/i.test(text)){lineStart=numbers[0];lineEnd=numbers[1]||lineStart;continue;}
    if(/strike\s+out\s+(?:pages?|lines?)\s+\d/i.test(text)){
      const pages=/strike\s+out\s+pages?/i.test(text),first=numbers[0],last=numbers[1]||first;
      if(last<first||(!pages&&!page&&!rule.heading))throw Error('A deletion range has no valid page scope.');
      const selected=rule.heading?scopedBlocks({...rule,lineStart:first,lineEnd:last},doc):doc.blocks.filter(b=>!b.ignored&&b.margin&&(pages?b.page>=first&&b.page<=last:b.page===page&&Number(b.margin.match(/\d+/)?.[0])>=first&&Number(b.margin.match(/\d+/)?.[0])<=last));
      if(!selected.length||(pages&&(first<1||last>doc.pages)))throw Error('A referenced page or margin-line deletion range was not found.');
      if(!pages&&!rule.heading&&(!selected.some(b=>Number(b.margin.match(/\d+/)?.[0])===first)||!selected.some(b=>Number(b.margin.match(/\d+/)?.[0])===last)))throw Error('The complete printed margin-line deletion range was not found.');
      const indices=tokens.map((t,i)=>selected.some(b=>t.start>=b.start+b.margin.length&&t.start<b.end)&&selected.some(b=>t.end>b.start+b.margin.length&&t.end<=b.end)?i:-1).filter(i=>i>=0);
      if(!indices.length)throw Error('A deletion range contains no active text.');
      patches.push({start:indices[0],end:indices.at(-1)+1,replacement:[]});
    }else{
      if((!page&&!rule.heading)||!lineStart)throw Error('A quoted replacement in a compound instruction needs an explicit page and line.');
      const ordinal=/\b(first|second|third|fourth|fifth|last)\b/i.exec(text)?.[1]?.toLowerCase();
      patches.push(...compile({...rule,directive:text,page,lineStart,lineEnd,action:'delete',insertText:'',deleteText:quotes(text),occurrence:ordinal?({first:1,second:2,third:3,fourth:4,fifth:5,last:-1}[ordinal]):null,between:null},doc));
    }
  }
  if(!patches.length)throw Error('The compound instruction could not be resolved.');
  // Every strike-out must be consumed; never silently verify only its final clause.
  if(events.filter(m=>/^strike\s+out/i.test(m[0])).length!==(rule.directive.match(/\b(?:strike\s+out|delete|remove)\b/gi)||[]).length)throw Error('Part of this compound instruction is not supported.');
  if(rule.action==='replace')patches.at(-1).replacement=phrase(rule.insertText,doc.text);
  const ordered=patches.sort((a,b)=>a.start-b.start),merged=[];
  for(const patch of ordered){
    const last=merged.at(-1);
    if(last&&last.end>patch.start)throw Error('Deletion ranges in this instruction overlap.');
    if(last&&last.end===patch.start&&!last.replacement.length){last.end=patch.end;last.replacement=patch.replacement;}
    else merged.push({...patch});
  }
  return merged;
}
function alignment(previous,current){
  const changes=amendmentWordDiff(values(previous),values(current));
  if(!changes)throw Error('These versions differ too much to align reliably. Compare shorter sections.');
  const map=new Array(previous.length).fill(null);let old=0,now=0;
  for(const change of changes){if(change.added){now+=change.count;}else if(change.removed){old+=change.count;}else{for(let j=0;j<change.count;j++)map[old++]=now++;}}
  return map;
}
function textOf(doc,tokens,start,end){
  if(start>=end)return '';
  return tokens.slice(start,end).map(t=>t.value).join(' ');
}
function testPatch(patch,expectedTokens,origins,map,previous,current,prevDoc,currentDoc){
  let left=patch.expectedStart-1,right=patch.expectedEnd;
  while(left>=0&&map[left]===null&&patch.expectedStart-left<=128)left--;
  while(right<map.length&&map[right]===null&&right-patch.expectedEnd<=128)right++;
  if(!patch.digest&&((left>=0&&map[left]===null)||(right<map.length&&map[right]===null)||patch.expectedStart-left>128||right-patch.expectedEnd>128))throw Error('Nearby unchanged text could not be matched reliably in the Current Version.');
  let currentStart=left<0?0:map[left]+1,currentEnd=right>=map.length?current.length:map[right];
  const digestRange=patch.digest?digestBodyRange(currentDoc):null;
  if(digestRange){
    left=patch.expectedStart-1;right=patch.expectedEnd;
    const next=current.findIndex(t=>t.start>=digestRange.start),after=current.findIndex(t=>t.start>=digestRange.end);
    currentStart=next<0?current.length:next;currentEnd=after<0?current.length:after;
  }
  if(currentEnd<currentStart)throw Error('The surrounding text alignment is ambiguous.');
  // An unrelated edit to a neighboring word can widen the unchanged anchors.
  // For a pure insertion, an exact contiguous payload with one immediate
  // unchanged boundary still proves the inserted wording. Keep the neighboring
  // edit outside its evidence so Changes can display that edit independently.
  // Do not use this shortcut for replacements/deletions or unmatched payloads.
  if(patch.start===patch.end&&patch.expectedEnd>patch.expectedStart&&
    (left<patch.expectedStart-1||right>patch.expectedEnd)){
    const mapped=map.slice(patch.expectedStart,patch.expectedEnd),first=mapped[0],last=mapped.at(-1);
    const contiguous=first!==null&&mapped.every((at,i)=>at===first+i);
    const immediateLeft=patch.expectedStart===0?first===0:map[patch.expectedStart-1]===first-1;
    const immediateRight=patch.expectedEnd===map.length?last===current.length-1:map[patch.expectedEnd]===last+1;
    if(contiguous&&(immediateLeft||immediateRight)){
      currentStart=first;currentEnd=last+1;left=patch.expectedStart-1;right=patch.expectedEnd;
    }
  }
  const expected=values(expectedTokens.slice(left+1,right));
  let oldStart=patch.start,oldEnd=patch.end;
  for(const origin of origins.slice(left+1,right)){oldStart=Math.min(oldStart,origin.start);oldEnd=Math.max(oldEnd,origin.end);}
  const actual=values(current.slice(currentStart,currentEnd)),original=values(previous.slice(oldStart,oldEnd));
  let status=equals(expected,actual)?'implemented':equals(original,actual)?'not-implemented':'incorrect';
  const previousOffset=patch.sourceOffset??previous[Math.min(patch.start,previous.length-1)]?.start??0;
  const previousEndOffset=patch.end>patch.start?previous[patch.end-1].end:previousOffset;
  const currentOffset=current[Math.min(currentStart,current.length-1)]?.start??0;
  const block=currentDoc.blocks.find(b=>b.end>=currentOffset)||currentDoc.blocks.at(-1);
  const currentEndOffset=currentEnd>currentStart?current[currentEnd-1].end:(current[currentStart]?.end??currentOffset);
  const endMarker=patch.finalInsertion&&currentDoc.blocks.findLast(b=>!b.margin&&/^[-–—]?\s*[0Oo]\s*[-–—]?$/.test(b.text.trim()));
  const orderingViolation=!!endMarker&&currentEnd>currentStart&&currentEndOffset>endMarker.start;
  if(orderingViolation)status='incorrect';
  let actualIndex=currentStart;
  const expectedParts=[],actualParts=[],differenceRanges=[],missingPoints=[];
  const wordingDiff=amendmentWordDiff(expected,actual);
  if(!wordingDiff)throw Error('The requested and current wording could not be compared reliably.');
  for(const [changeIndex,change] of wordingDiff.entries()){
    const part={text:change.value.join(' '),different:!!(change.added||change.removed)};
    if(!change.added)expectedParts.push(part);
    if(!change.removed){actualParts.push(part);if(change.added)differenceRanges.push({start:current[actualIndex].start,end:current[actualIndex+change.count-1].end});actualIndex+=change.count;}
    // Adjacent removal/addition is a replacement, not absent text. Highlight
    // the actual replacement and the expected wording in the bottom pane.
    // Reserve missing markers for deletions that have no replacement tokens.
    else if(!wordingDiff[changeIndex-1]?.added&&!wordingDiff[changeIndex+1]?.added){
      missingPoints.push({offset:current[actualIndex]?.start??current[current.length-1]?.end??0,text:part.text});
    }
  }
  const currentDeletionRanges=[];
  const requestedDigestChanges=patch.digest?digestChangedRanges(previous.slice(patch.start,patch.end),expectedTokens.slice(patch.expectedStart,patch.expectedEnd)):null;
  const displayedDigestChanges=patch.digest?digestChangedRanges(previous.slice(patch.start,patch.end),current.slice(currentStart,currentEnd)):null;
  if(patch.end>patch.start){
    const from=digestRange?.start??(left<0?0:current[map[left]].end),to=digestRange?.end??(right>=map.length?currentDoc.text.length:current[map[right]].start);
    const deleted=(requestedDigestChanges?.removed??previous.slice(patch.start,patch.end)).map(t=>canonical(t.value));
    const candidates=(currentDoc.tokens||[]).map((t,index)=>({...t,index})).filter(t=>t.start>=from&&t.end<=to);
    const crossed=t=>(currentDoc.struck||[]).some(r=>r.start<t.end&&r.end>t.start);
    const collect=tokens=>{
      const diff=diffArrays(deleted,tokens.map(t=>canonical(t.value)),{timeout:2000,maxEditLength:30000});
      let at=0,lastIndex=-2;
      const add=token=>{
        const last=currentDeletionRanges.at(-1);
        if(last&&token.index===lastIndex+1)last.end=token.end;
        else currentDeletionRanges.push({start:token.start,end:token.end});
        lastIndex=token.index;
      };
      if(!diff){
        // Long deleted sections can exceed the display diff's time budget.
        // Keep matching local word sequences visible without borrowing text
        // outside the amendment's unchanged boundary anchors.
        const pairs=new Set(deleted.slice(1).map((word,i)=>JSON.stringify([deleted[i],word])));
        const values=tokens.map(t=>canonical(t.value));
        for(let i=0;i<tokens.length;i++)if(deleted.length===1?values[i]===deleted[0]:
          (i>0&&pairs.has(JSON.stringify([values[i-1],values[i]])))||(i+1<tokens.length&&pairs.has(JSON.stringify([values[i],values[i+1]]))))add(tokens[i]);
        return;
      }
      for(const change of diff){
        if(change.removed)continue;
        if(!change.added)for(const token of tokens.slice(at,at+change.count))add(token);
        at+=change.count;
      }
    };
    // Original PDF strike-outs are absent from the active verification stream,
    // but remain visible and need their own localized deletion highlights.
    if(patch.digest)currentDeletionRanges.push(...digestSourceDeletionRanges(currentDoc,digestRange));
    else if(deleted.length)collect(candidates.filter(crossed));
    if(deleted.length&&(!patch.replacement.length||status==='not-implemented'))collect(candidates.filter(t=>!crossed(t)));
    currentDeletionRanges.sort((a,b)=>a.start-b.start);
  }
  return {status,orderingViolation,previousOffset,previousEndOffset,currentOffset,currentEndOffset,currentDeletionRanges,...(patch.digest?{previousDeletionRanges:requestedDigestChanges.previousRanges,previousInsertionPoints:requestedDigestChanges.previousInsertionPoints,currentAdditionRanges:displayedDigestChanges.currentRanges}:{}),currentPage:block?.page,currentLine:block?.margin?.trim()||'',expected:expected.join(' '),actual:textOf(currentDoc,current,currentStart,currentEnd),original:textOf(prevDoc,previous,oldStart,oldEnd),expectedParts,actualParts,differenceRanges,missingPoints,discrepancies:amendmentDiscrepancies(wordingDiff,current,currentStart)};
}
export function amendmentPlan(instructionText,prevDoc,currentDoc,externalDocs={},digestDoc=null){
  const instructions=instructionText.trim()?parseAmendments(instructionText):[];
  const ordered=digestDoc?[digestRule(digestDoc),...instructions]:instructions;
  const rules=ordered.map(rule=>{
    if(rule.digest){try{digestBodyRange(prevDoc);digestBodyRange(currentDoc);digestPayload(digestDoc);return rule;}catch(e){return {...rule,error:e.message};}}
    if(!rule.externalReference)return rule;
    const ref=rule.externalReference,doc=externalDocs[ref.bill];
    if(!doc)return {...rule,error:'Upload '+ref.bill+' to resolve this referenced insertion. Only its legislative body is used.'};
    try{
      const resolved=resolveExternalPayload(rule.insertText,ref,doc);
      if(ref.additional)return {...rule,insertText:resolved,referenceLoaded:doc.name,error:'',attachmentWarning:'The uploaded '+ref.bill+' body is checked below. Additional attached LCB drafting material is still required to verify the complete instruction.'};
      return {...rule,insertText:resolved,referenceLoaded:doc.name,error:''};
    }catch(e){return {...rule,error:e.message};}
  }),compiled=rules.map(rule=>{
    try{return {...rule,patches:compile(rule,prevDoc)};}catch(error){return {...rule,patches:[],error:error.message};}
  });
  const all=compiled.flatMap(rule=>rule.patches.map(p=>({...p,rule:rule.number})));
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j];
    if((a.start<b.end&&b.start<a.end)||(a.start===a.end&&b.start===b.end&&a.start===b.start)){
      for(const rule of compiled)if(rule.number===a.rule||rule.number===b.rule)rule.error='These amendment targets overlap. Their combined effect needs manual review.';
    }
  }
  const previous=prevDoc.effectiveTokens||prevDoc.tokens,current=currentDoc.effectiveTokens||currentDoc.tokens;
  const patches=all.filter(edit=>!compiled.find(r=>r.number===edit.rule)?.error).sort((a,b)=>a.start-b.start||a.end-b.end);
  const expectedTokens=[],origins=[];let cursor=0;
  const copy=until=>{for(;cursor<until;cursor++){expectedTokens.push(previous[cursor]);origins.push({start:cursor,end:cursor+1});}};
  for(const patch of patches){
    copy(patch.start);patch.expectedStart=expectedTokens.length;
    for(const value of patch.replacement){expectedTokens.push({value});origins.push({start:patch.start,end:patch.end,amendment:true});}
    patch.expectedEnd=expectedTokens.length;cursor=patch.end;
  }
  copy(previous.length);
  return {compiled,previous,current,patches,expectedTokens,origins};
}
export function verifyAmendments(instructionText,prevDoc,currentDoc,externalDocs={},digestDoc=null){
  const {compiled,previous,current,patches,expectedTokens,origins}=amendmentPlan(instructionText,prevDoc,currentDoc,externalDocs,digestDoc);
  let map,error='';try{map=alignment(expectedTokens,current);}catch(e){error=e.message;}
  const unresolvedBoundaries=compiled.filter(r=>r.externalReference&&(r.error||r.attachmentWarning||billReadingWarnings(externalDocs[r.externalReference.bill]).length)).flatMap(r=>{try{return compile({...r,error:''},prevDoc).map(p=>p.start);}catch{return [];}});
  const results=compiled.map(rule=>{
    if(rule.error||error)return {...rule,status:'needs-review',message:rule.error||error,evidence:[]};
    try{
      if(rule.action==='delete'&&rule.patches.some(p=>unresolvedBoundaries.includes(p.start)||unresolvedBoundaries.includes(p.end)))throw Error('This deletion shares its location with an unresolved referenced insertion. Review the deletion alongside the referenced bill and additional drafting attachments.');
      const evidence=patches.filter(p=>p.rule===rule.number).map(p=>testPatch(p,expectedTokens,origins,map,previous,current,prevDoc,currentDoc));
      const status=evidence.every(e=>e.status==='implemented')?'implemented':evidence.some(e=>e.status==='incorrect')?'incorrect':'not-implemented';
      const message=status==='implemented'?'The requested text change matches at the specified location.':status==='not-implemented'?'The requested change is absent; the previous wording remains at this location.':'The text at the specified location differs from the requested amendment.';
      if(rule.attachmentWarning){
        const missing=evidence.some(e=>(e.expectedParts||[]).some(p=>p.different));
        return {...rule,status:missing?'incorrect':'needs-review',message:(missing?'The referenced bill body has discrepancies in the Current Version. ':'')+rule.attachmentWarning,evidence};
      }
      return {...rule,status,message:evidence.some(e=>e.orderingViolation)?'The inserted text appears after the bill’s end marker; it must precede that marker.':message,evidence};
    }catch(e){return {...rule,status:'needs-review',message:e.message,evidence:[]};}
  });
  return applyExternalReferenceReadingWarnings(results,externalDocs);
}

// Compare the expected amended revision with actual active wording. A raw
// Previous/Current diff can borrow repeated SEC. tokens from another section.
export function nonAmendmentEdits(instructionText,prevDoc,currentDoc,results,externalDocs={},digestDoc=null){
  if(results.some(r=>r.externalReference&&(r.status==='needs-review'||r.attachmentWarning)))return {ranges:[[],[]],locations:[{},{}],uncertain:true,reason:'Non-amendment changes cannot be classified until the referenced bill insertion and any additional drafting attachments are resolved.'};
  const {previous,current,expectedTokens,origins}=amendmentPlan(instructionText,prevDoc,currentDoc,externalDocs,digestDoc);
  const diff=splitHistoryChanges(sequenceDiff(values(expectedTokens),values(current)));
  if(!diff)throw Error('Non-amendment changes could not be aligned reliably.');
  const ranges=[[],[]],locations=[{},{}];let old=0,now=0,group=-1,inEdit=false;
  const targets=side=>results.flatMap(r=>r.evidence.map(e=>({start:side?e.currentOffset:e.previousOffset,end:side?e.currentEndOffset:e.previousEndOffset}))).filter(r=>r.end>r.start);
  const covered=[targets(0),targets(1)];
  const add=(side,token,kind)=>{if(token&&!covered[side].some(r=>r.start<token.end&&r.end>token.start))ranges[side].push({start:token.start,end:token.end,kind,group});};
  for(const change of diff){
    if(change.added||change.removed){
      if(!inEdit||change.history){group++;locations[0][group]=previous[origins[old]?.start]?.start??previous.at(-1)?.end??0;locations[1][group]=current[now]?.start??current.at(-1)?.end??0;}
      inEdit=!change.history;
      if(change.added){for(let i=0;i<change.count;i++)add(1,current[now+i],'added');now+=change.count;}
      else{for(let i=0;i<change.count;i++){const origin=origins[old+i];if(origin&&!origin.amendment)for(let j=origin.start;j<origin.end;j++)add(0,previous[j],'removed');}old+=change.count;}
    }else{inEdit=false;old+=change.count;now+=change.count;}
  }
  return {ranges,locations};
}

