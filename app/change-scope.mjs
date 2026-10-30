export function digestRange(doc){
 const heading=/legislative\s+counsel[’']s\s+digest/i.exec(doc.text);
 if(!heading)return null;
 const following=doc.text.slice(heading.index);
 const end=/The people of the State of California do enact as follows\s*:/i.exec(following);
 return {start:heading.index,end:end?heading.index+end.index:doc.text.length};
}
export function outsideDigest(doc,ranges){
 const digest=digestRange(doc);if(!digest)return ranges;
 return ranges.flatMap(r=>r.end<=digest.start||r.start>=digest.end?[r]:[
  {...r,end:Math.min(r.end,digest.start)},{...r,start:Math.max(r.start,digest.end)}
 ].filter(p=>p.end>p.start));
}
export function isBudgetRunningHead(doc,block){
 return /\bBudget Act of\s+\d{4}/i.test(doc.text.slice(0,6000))&&!block.margin&&/^Item\s+Amount$/.test(block.text.trim())&&block.formatting?.headerParts?.length>=2;
}
