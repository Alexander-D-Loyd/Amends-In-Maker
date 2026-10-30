// Compare readings of the SAME original PDF, never the other bill version.
// Alignment supplies uncertainty evidence and exact source witnesses, not an
// answer key. Keep strikeout identity distinct from surviving wording.
const quote=c=>/[‘’]/u.test(c)?"'":/[“”]/u.test(c)?'"':c;
function quotedRanges(text){
 const ranges=[];
 for(const [open,close]of [['“','”'],['‘','’'],['"','"'],["'","'"]]){
  let start=0,depth=0;
  for(const m of text.matchAll(new RegExp('['+open+close+']','gu'))){
   const c=m[0],before=/[\p{L}\p{N}\p{M}]/u.test(text[m.index-1]||''),after=/[\p{L}\p{N}\p{M}]/u.test(text[m.index+1]||'');
   if((c==="'"||c==='’')&&before&&after)continue;
   if(c===close&&depth){if(!--depth)ranges.push([start,m.index+1]);}
   else if(c===open&&!(c==="'"&&before)){if(!depth)start=m.index;depth++;}
  }
 }
 return ranges;
}
function tokens(source,compareStrikeStates,{instructions=false}={}){
 const text=typeof source==='string'?source:source.text,strikes=source.strikes||[],skip=[];
 // PDF OCR layers can fuse the structural directive opener. Introduce only
 // this virtual boundary after an explicit amendment heading (and optional
 // printed date stamp); quoted deletion wording and payload remain literal.
 const boundaries=new Set();
 if(instructions){
  const quoted=quotedRanges(text);
  for(const m of text.matchAll(/((?:^|\n)[ \t]*Amendment[ \t]*\d+(?:[ \t]+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[ \t]*\d{1,2}[ \t]*\d{4})?[ \t]*\r?\n[ \t]*On)page(?=[ \t]*\d)/giu)){
   const heading=m.index+m[0].search(/Amendment/iu),boundary=m.index+m[1].length;
   if(!quoted.some(([start,end])=>heading>=start&&heading<end||boundary>=start&&boundary<end))boundaries.add(boundary);
  }
 }
 for(const m of text.matchAll(/^line\s*\d+\s*/gimu))skip.push([m.index,m.index+m[0].length]);
 for(const m of text.matchAll(/[-\u00ad\u2010][ \t]*\r?\n\s*(?:line\s*\d+\s+)?/giu))skip.push([m.index,m.index+m[0].length]);
 skip.sort((a,b)=>a[0]-b[0]);let normalized='',starts=[],ends=[],range=0;
 for(let i=0;i<text.length;){
  while(range<skip.length&&skip[range][1]<=i)range++;
  if(range<skip.length&&skip[range][0]<=i){i=skip[range][1];continue;}
  if(boundaries.has(i)){normalized+=' ';starts.push(i);ends.push(i);}
  let end=i+String.fromCodePoint(text.codePointAt(i)).length;
  while(end<text.length&&/\p{M}/u.test(String.fromCodePoint(text.codePointAt(end))))end+=String.fromCodePoint(text.codePointAt(end)).length;
  const value=[...text.slice(i,end).normalize('NFKC')].map(quote).join('');
  normalized+=value;for(let j=0;j<value.length;j++){starts.push(i);ends.push(end);}i=end;
 }
 return [...normalized.matchAll(/\p{L}[\p{L}\p{M}]*(?:['-][\p{L}\p{M}]+)*|\d+(?:[,.]\d+)*|[^\s\u200b\u00ad]/gu)].map(m=>{
  const start=starts[m.index],end=ends[m.index+m[0].length-1],struck=compareStrikeStates&&strikes.some(r=>r.start<end&&r.end>start);
  return {value:m[0],start,end,struck,key:JSON.stringify([m[0],struck])};
 });
}
// Bound edit distance, rather than allocating a page-size squared matrix.
// If readings are radically different, retain the entire unresolved middle.
function matchingPairs(a,b){
 const same=(x,y)=>x>=0&&y>=0&&x<a.length&&y<b.length&&a[x].key===b[y].key;
 let x=0;while(same(x,x))x++;
 if(x===a.length&&x===b.length)return Array.from({length:x},(_,i)=>[i,i]);
 let frontier=new Map([[1,0]]);const trace=[];
 for(let d=0;d<=Math.min(128,a.length+b.length);d++){
  trace.push(new Map(frontier));const next=new Map();
  for(let k=-d;k<=d;k+=2){
   let old=k===-d||k!==d&&(frontier.get(k-1)??-Infinity)<(frontier.get(k+1)??-Infinity)?frontier.get(k+1)??0:(frontier.get(k-1)??0)+1;
   let current=old-k;while(same(old,current)){old++;current++;}next.set(k,old);
   if(old>=a.length&&current>=b.length){
    const pairs=[];let px=a.length,py=b.length;
    for(let level=d;level>=0;level--){
     const v=trace[level],diagonal=px-py,prior=diagonal===-level||diagonal!==level&&(v.get(diagonal-1)??-Infinity)<(v.get(diagonal+1)??-Infinity)?diagonal+1:diagonal-1;
     const previousX=v.get(prior)??0,previousY=previousX-prior;
     while(px>previousX&&py>previousY){pairs.push([--px,--py]);}
     px=previousX;py=previousY;
    }
    return pairs.reverse();
   }
  }
  frontier=next;
 }
 const pairs=Array.from({length:x},(_,i)=>[i,i]);let endA=a.length,endB=b.length;
 while(endA>x&&endB>x&&a[endA-1].key===b[endB-1].key){endA--;endB--;}
 for(let i=endA,j=endB;i<a.length;i++,j++)pairs.push([i,j]);return pairs;
}
const witness=(text,ts,start,end)=>start<end?{start:ts[start].start,end:ts[end-1].end,text:text.slice(ts[start].start,ts[end-1].end)}:{start:start<ts.length?ts[start].start:text.length,end:start<ts.length?ts[start].start:text.length,text:''};
// All OCR confirmation spans share the product's single-line, 200-character
// limit. Preserve every disputed character and exact UTF-16 source offsets.
export function readingWarningSpans(text,start,end){
 const spans=[];
 for(const m of text.slice(start,end).matchAll(/[^\r\n]+/gu))for(let offset=0;offset<m[0].length;){
  const from=start+m.index+offset;let count=Math.min(200,m[0].length-offset);
  if(count===200&&/[\uD800-\uDBFF]/u.test(m[0][offset+count-1])&&/[\uDC00-\uDFFF]/u.test(m[0][offset+count]||''))count--;
  const to=from+count;offset+=count;if(text.slice(from,to).trim())spans.push({start:from,end:to,text:text.slice(from,to)});
 }
 return spans;
}
export function embeddedOcrReadingWarnings(embedded,ocr,options={}){
 const embeddedText=typeof embedded==='string'?embedded:embedded.text,ocrText=typeof ocr==='string'?ocr:ocr.text;
 // A glyphless layer can carry wording without deletion formatting. Absence
 // of native stroke metadata cannot contradict a pixel-detected strikeout.
 const compareStrikeStates=Boolean(embedded.strikes?.length&&ocr.strikes?.length);
 const a=tokens(embedded,compareStrikeStates,options),b=tokens(ocr,compareStrikeStates,options),pairs=[...matchingPairs(a,b),[a.length,b.length]],warnings=[];let priorA=0,priorB=0;
 for(const [nextA,nextB]of pairs){
  if(nextA>priorA||nextB>priorB){
   const sourceWitness=witness(embeddedText,a,priorA,nextA),ocrWitness=witness(ocrText,b,priorB,nextB);
   const kind=nextA===priorA?'ocr-insertion':nextB===priorB?'ocr-omission':'reading-substitution';
   // A missing token has no OCR span. Anchor to real adjacent output text so
   // the reader can open/confirm that location without invented characters.
   const anchor=nextB>priorB?ocrWitness:b.length?witness(ocrText,b,Math.min(priorB,b.length-1),Math.min(priorB,b.length-1)+1):null;
   if(anchor)for(const span of readingWarningSpans(ocrText,anchor.start,anchor.end))warnings.push({...span,confidence:null,kind,sourceWitness,ocrWitness,embeddedText:sourceWitness.text,disagreement:'Embedded text and local pixel OCR disagree; confirm both readings against the original PDF'});
  }
  priorA=nextA+1;priorB=nextB+1;
 }
 return warnings;
}
// Compatibility summary for callers that only display differing text.
export function embeddedOcrDisagreements(embeddedText,ocrText){
 return embeddedOcrReadingWarnings(embeddedText,ocrText).map(w=>w.sourceWitness.text||w.ocrWitness.text);
}

// Confidence and another occurrence elsewhere on the row do not settle a
// conflicting original-pixel reading. Preserve the conflict across rereads.
export function rereadDisagreement(before,after,previous){
 const normalize=s=>[...s.normalize('NFKC')].map(quote).join('').replace(/\s/gu,'');
 return normalize(before)!==normalize(after)?[previous,`${before} / ${after}`].filter(Boolean).join('; '):previous;
}
