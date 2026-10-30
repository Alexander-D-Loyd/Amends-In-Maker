// Share immutable context only within one synchronous review. Never retain it
// across reviews: loaded documents can gain strikeouts or corrected text.
import {wrappedStraightQuotes} from './style-wrapped-quotes.mjs';
import {styleTechnicalLiteralRanges}from './style-technical-literals.mjs';
import {styleDocumentType,isOpinionStyleDocument}from './style-document-type.mjs';
const reviewContexts=new WeakMap();
const reviewMemos=new WeakMap();
// Derived source data lives only as long as the current synchronous review.
// Alternate supplied contexts and asynchronous work never share this memo.
export function memoizeStyleReview(doc,suppliedContext,key,calculate){
 const context=reviewContexts.get(doc),memo=reviewMemos.get(doc);
 if(!context||!memo||suppliedContext!==null&&suppliedContext!==context)return calculate();
 if(memo.has(key))return memo.get(key);
 const value=calculate();
 if(!value||typeof value.then!=='function')memo.set(key,value);
 return value;
}
export function styleRangeBlocked(doc,start,end){
 if((doc.struck||[]).some(r=>r.start<end&&r.end>start))return true;
 // Reader-identified interior running heads are masked in the style source.
 // Other ignored content and endpoints inside a head remain protected.
 return doc.blocks.some(b=>b.ignored&&b.start<end&&b.end>start&&(!b.formatting?.headerParts?.length||b.start<=start||b.end>=end));
}
export function withStyleContext(doc,review){
 const prior=reviewContexts.get(doc),context=prior||styleContext(doc);
 const priorMemo=reviewMemos.get(doc),memo=priorMemo||new Map();
 reviewContexts.set(doc,context);
 reviewMemos.set(doc,memo);
 try{return review();}finally{if(prior)reviewContexts.set(doc,prior);else reviewContexts.delete(doc);if(priorMemo)reviewMemos.set(doc,priorMemo);else{memo.clear();reviewMemos.delete(doc);}}
}
export function styleSource(doc){
  if(reviewContexts.has(doc))return reviewContexts.get(doc).source;
  const chars=doc.text.split('');
  const runningHeads=doc.blocks.filter(b=>!b.margin&&/^Item\s+Amount$/.test(b.text.trim())&&b.formatting?.headerParts?.length>=2).map(b=>({start:b.start,end:b.end}));
  for(const r of [...(doc.excluded||[]),...(doc.struck||[]),...runningHeads])for(let i=r.start;i<r.end;i++)if(chars[i]!=='\n')chars[i]=' ';
  return chars.join('').replace(/[\u2010-\u2015]/g,'-');
}
export function styleContext(doc){
  if(reviewContexts.has(doc))return reviewContexts.get(doc);
  // Opinion and cover-letter numerals inherit the Bill base under LCB21.
  // Their explicit type owns the money/citation exceptions separately.
  const source=styleSource(doc),documentType=styleDocumentType(doc),nonbill=isOpinionStyleDocument(doc),digest=nonbill?null:/legislative\s+counsel[’']s\s+digest/i.exec(source),enact=nonbill?null:/do\s+enact\s+as\s+follows\s*:/i.exec(source);
  const wrappedLiteralRanges=wrappedStraightQuotes(source,(start,end)=>styleRangeBlocked(doc,start,end));
  const literalRanges=[...[...source.matchAll(/“[^”]*”|"[^"\n]*"/g)].map(m=>({start:m.index,end:m.index+m[0].length})),...wrappedLiteralRanges];
  const technicalRanges=styleTechnicalLiteralRanges(source,doc.text),technicalAt=(start,end=start+1)=>technicalRanges.some(r=>r.start<end&&r.end>start);
  const literalAt=(start,end=start+1)=>literalRanges.some(r=>r.start<end&&r.end>start)||technicalAt(start,end);
  const at=offset=>enact&&offset>=enact.index+enact[0].length?'Bill':digest&&offset>=digest.index&&(!enact||offset<enact.index)?'Digest':digest||enact?'Heading':'Bill';
  const sentences=[];let begin=enact?enact.index+enact[0].length:0;
  // Scan the digest independently and preserve original offsets throughout.
  let start=0;
  for(let i=0;i<source.length;i++){
    if(!/[.!?]/.test(source[i]))continue;
    if(source[i]==='.'&&((/\d/.test(source[i-1]||'')&&/\d/.test(source[i+1]||''))||/\b(?:SEC|Sec|No|Mr|Mrs|Ms|Dr|St|U|S|a|p|m|e|g|i)\.$/.test(source.slice(Math.max(0,i-10),i+1))))continue;
    sentences.push({start,end:i+1});start=i+1;
  }
  sentences.push({start,end:source.length});
  const sentenceAt=offset=>{
    let lo=0,hi=sentences.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(sentences[mid].end<=offset)lo=mid+1;else hi=mid;}
    const sentence=sentences[lo];return {...sentence,start:offset>=begin?Math.max(begin,sentence.start):sentence.start};
  };
  const budget=/\bBudget Act of\s+\d{4}/i.test(source);
  const month='(?:January|February|March|April|May|June|July|August|September|October|November|December)',calendarContinuation=new RegExp('\\b(?:until|on|by|before|after|through|beginning|ending|commencing|effective|as\\s+of)\\s+'+month+'\\s+(?:[1-9]|[12]\\d|3[01]),\\s*$','i');
  const previousBody=index=>{for(let n=index-1;n>=0;n--){
    const block=doc.blocks[n],start=block.start+block.margin.length,text=source.slice(start,block.end).trim(),original=doc.text.slice(start,block.end);
    const removedYear=!text&&!block.ignored&&/^[1-9]\d{3}\.?$/.test(original.trim())&&[...original.matchAll(/\S/gu)].every(m=>(doc.struck||[]).some(r=>r.start<=start+m.index&&r.end>start+m.index));
    if(!text&&(block.runningHead||block.ignored&&block.formatting?.headerParts?.length||removedYear))continue;
    return text;
  }return '';};
  const tableRanges=doc.blocks.filter((b,index)=>{
    const body=source.slice(b.start+b.margin.length,b.end).trim();
    const next=doc.blocks[index+1],nextBody=next?source.slice(next.start+next.margin.length,next.end):'';
    const wrappedLabel=budget&&/\.{3,}/.test(nextBody)&&body.split(/\s+/).length<=12&&!/[.;:!?]/.test(body);
    // A year completing an explicit prose date or statutory citation is not
    // an amount column merely because it is printed on its own budget line.
    // Recognized running heads can bridge pages; bare date-shaped labels and
    // actual geometry/leader rows retain their table treatment.
    const yearContinuation=/^[1-9]\d{3}\.?$/.test(body)&&(calendarContinuation.test(previousBody(index))||/\b(?:Statutes\s+of|Stats\.?|Budget\s+Act\s+of)\s*$/i.test(previousBody(index)));
    return b.formatting?.headerGaps?.length>=2||/\.{3,}/.test(body)||wrappedLabel||(budget&&body&&!yearContinuation&&/^[\d\s,$().+%−—–-]+$/.test(body));
  });
  const tableAt=offset=>{let lo=0,hi=tableRanges.length;while(lo<hi){const mid=(lo+hi)>>1;if(tableRanges[mid].end<=offset)lo=mid+1;else hi=mid;}return !!tableRanges[lo]&&tableRanges[lo].start<=offset;};
  return {source,documentType,at,sentenceAt,tableAt,literalRanges,wrappedLiteralRanges,literalAt,technicalRanges,technicalAt};
}
