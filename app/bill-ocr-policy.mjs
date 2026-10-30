// Structural OCR labels are inferred only from a repeated, consecutive margin
// column. They are internal layout markers, never inferred legislative words.
export function labelScannedBillMargins(items,width){
 const rows=[];for(const item of items){if(!item.str?.trim())continue;let row=rows.find(r=>Math.abs(r.y-item.transform[5])<2);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);}
 const candidates=rows.map(r=>{const [n,...body]=r.items.sort((a,b)=>a.transform[4]-b.transform[4]);const text=body.map(w=>w.str).join(' ');return {n,body,text,y:r.y,right:n.transform[4]+n.width};}).filter(r=>/^(?:[1-9]|[1-9]\d)$/u.test(r.n.str)&&r.n.transform[4]<width*.16&&r.body.length&&r.body[0].transform[4]-r.right>=Math.max(18,r.n.height*1.2)&&r.text.length>=15&&/\p{L}/u.test(r.text)).sort((a,b)=>b.y-a.y);
 const selected=new Set();for(const first of candidates){const peers=candidates.filter(r=>Math.abs(r.right-first.right)<2&&Math.abs(r.body[0].transform[4]-first.body[0].transform[4])<8);let run=[];for(const row of peers){if(run.length&&Number(row.n.str)!==Number(run.at(-1).n.str)+1){if(run.length>=4)run.forEach(r=>selected.add(r.n));run=[];}run.push(row);}if(run.length>=4)run.forEach(r=>selected.add(r.n));}
 return items.map(w=>selected.has(w)?{...w,str:'line '+w.str,structuralMargin:true}:w);
}
export function billReadingWarnings(doc){
 return (doc?.scanQuality||[]).flatMap(q=>(q.uncertain||[]).map(w=>({...w,page:q.page})));
}
export function billReadingSummary(doc){
 if(!doc?.ocr)return '';const readings=billReadingWarnings(doc),pages=[...new Set(readings.map(w=>w.page))];
 return readings.length?`Local OCR: ${readings.length} uncertain reading(s) on page${pages.length===1?'':'s'} ${pages.slice(0,10).join(', ')}${pages.length>10?'…':''}. Confirm these pages in the original PDF; OCR differences are not confirmed bill errors.`:'Local OCR completed. Confirm critical text against the original PDF; OCR confidence is not proof of complete accuracy.';
}
export function applyBillReadingWarnings(results,docs){
 const readings=docs.flatMap((doc,side)=>billReadingWarnings(doc).map(w=>({...w,version:side===0?'Previous':'Current'})));
 if(!readings.length)return results;const locations=[...new Set(readings.map(w=>w.version+' page '+w.page))].slice(0,10).join(', ');
 return results.map(r=>({...r,status:'needs-review',versionReadingWarnings:readings.slice(0,100),versionReadingWarningCount:readings.length,message:r.message+' Bill PDF reading also needs review: '+locations+'. Confirm source characters before concluding whether this amendment is implemented or incorrect.'}));
}
// An inserted external bill is another source of the expected wording. Its
// disputed OCR cannot become a certified amendment merely by matching Current.
export function applyExternalReferenceReadingWarnings(results,externalDocs={}){
 return results.map(result=>{
  const bill=result.externalReference?.bill,doc=bill&&externalDocs[bill],readings=billReadingWarnings(doc);
  if(!readings.length)return result;
  const locations=[...new Set(readings.map(w=>'Referenced '+bill+', page '+w.page))].slice(0,10).join('; ');
  return {...result,status:'needs-review',referenceReadingWarnings:readings.slice(0,100).map(w=>({...w,bill,sourceName:doc.name})),referenceReadingWarningCount:readings.length,message:result.message+' Referenced bill PDF reading needs review: '+locations+'. Confirm the original referenced PDF before concluding whether this amendment is implemented or incorrect.'};
 });
}
