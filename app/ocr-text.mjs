const connectors=new Set('a an the and or if of to in on at by for from with under over after before this that these those is are was were shall must may be not'.split(' '));
export function ocrDictionary(text,expandedWords=[]){return new Set([...connectors,...text.split(/\r?\n/).slice(1).map(line=>line.split('/')[0].trim().toLowerCase()),...Array.from(expandedWords,word=>word.toLowerCase())].filter(word=>/^[a-z]+$/.test(word)));}
export function repairOcrSpacing(text,words){
 return text.replace(/\b[A-Za-z]{4,}\b/g,word=>{
  const lower=word.toLowerCase();if(words.has(lower))return word;
  if(lower.length>60)return word;
  let solutions=[],best=7,bestConnectors=-1;
  const split=(start,cuts)=>{
   if(start===lower.length){
    let from=0;const score=cuts.reduce((n,end)=>{const part=lower.slice(from,end);from=end;return n+Number(connectors.has(part));},0);
    if(cuts.length>1&&(cuts.length<best||cuts.length===best&&score>=bestConnectors)){
     if(cuts.length<best||score>bestConnectors){best=cuts.length;bestConnectors=score;solutions=[];}
     if(solutions.length<2)solutions.push(cuts);
    }
    return;
   }
   if(cuts.length>=Math.min(best,6))return;
   for(let end=start+1;end<=lower.length;end++){
    const part=lower.slice(start,end);
    if(words.has(part)&&(part.length>=3||connectors.has(part)))split(end,[...cuts,end]);
   }
  };
  split(0,[]);
  if(solutions.length!==1)return word;
  let start=0;return solutions[0].map(end=>{const part=word.slice(start,end);start=end;return part;}).join(' ');
 });
}
export function isOcrStyle(style){return /GlyphLessFont/i.test(style?.name||'')||(['sans-serif','monospace'].includes(style?.fontFamily)&&style?.ascent===1&&Math.abs(style?.descent||0)<.01);}

// Repair OCR only in editorial directives; quoted payload wording stays literal.
export function repairOcrDirective(styled){
 let text=typeof styled==='string'?styled:styled.text;
 let strikes=typeof styled==='string'?[]:styled.strikes.map(r=>({...r}));
 const replace=(pattern,replacement)=>{
  const edits=[...text.matchAll(pattern)].map(m=>({start:m.index,end:m.index+m[0].length,value:replacement(...m)}));
  for(const edit of edits.reverse()){
   const delta=edit.value.length-(edit.end-edit.start);
   const map=offset=>offset<=edit.start?offset:offset>=edit.end?offset+delta:edit.start+Math.min(offset-edit.start,edit.value.length);
   strikes=strikes.map(r=>({start:map(r.start),end:map(r.end)}));
   text=text.slice(0,edit.start)+edit.value+text.slice(edit.end);
  }
 };
 replace(/\b(On)page(?=\s*\d)/gi,m=>m.replace(/page/i,' page'));
 replace(/\b(page|line)(?=\d)/gi,m=>m+' ');
 replace(/\binline(?=\s*\d)/gi,()=> 'in line');
 replace(/\bbetweenlines?(?=\s*\d)/gi,m=>m.replace(/lines?/i,' $&'));
 replace(/\blines?\s+[|Il](?=\s+(?:to|through|and)\s+\d)/g,m=>m.slice(0,-1)+'1');
 // A closing apostrophe before the next deletion clause is an OCR delimiter,
 // while apostrophes inside the quoted wording are preserved.
 replace(/“([^“”\n]*)[’'](?=\s*,\s*strike\s+out\b)/g,(_,body)=>'“'+body+'”');
 // Some OCR layers lose the outer closing quote around a quoted definition.
 replace(/“([^“”\n]*“[^“”\n]*”)(?=\s*and\s*insert\b)/g,(_,body)=>'“'+body+'”');
 replace(/([,;”])(?=[A-Za-z])/g,m=>m+' ');
 return typeof styled==='string'?text:{text,strikes};
}
export function repairOcrInstructions(text){
 return text.replace(/((?:^|\n)\s*Amendment\s*\d+\s*\n)([\s\S]*?)(?=(?:\n\s*Amendment\s*\d+\s*(?:\n|$))|$)/gi,(_,heading,body)=>{
  const marker=/\b(?:and\s*)?insert\s*:\s*/i.exec(body),end=marker?marker.index+marker[0].length:body.length;
  return heading+repairOcrDirective(body.slice(0,end))+body.slice(end);
 });
}
