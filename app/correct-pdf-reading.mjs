import {makeDocument} from './core.mjs';
export function correctPdfReading(doc,reading,replacement,words=null){
 if(typeof replacement!=='string'||replacement.length>200||/[\r\n]/.test(replacement))throw Error('Enter up to 200 characters on one line.');
 const pageIndex=reading.page-1,page=doc.rawPages[pageIndex];
 if(!Number.isInteger(reading.page)||!Number.isInteger(reading.start)||!Number.isInteger(reading.end)||!page||reading.start<0||reading.end<=reading.start||reading.end>page.length||/[\r\n]/.test(reading.text)||page.slice(reading.start,reading.end)!==reading.text||!doc.scanQuality?.some(q=>q.page===reading.page&&q.uncertain?.some(r=>r.start===reading.start&&r.end===reading.end&&r.text===reading.text)))throw Error('This reading has changed. Reopen PDF reading review.');
 const delta=replacement.length-(reading.end-reading.start),map=x=>x<=reading.start?x:x>=reading.end?x+delta:reading.start+Math.min(x-reading.start,replacement.length);
 const pages=[...doc.rawPages];pages[pageIndex]=page.slice(0,reading.start)+replacement+page.slice(reading.end);
 const pageStrikes=[],formatting=[];let offset=0;
 for(const [index,source] of doc.rawPages.entries()){
  pageStrikes.push(doc.struck.filter(r=>r.start<offset+source.length&&r.end>offset).map(r=>({start:Math.max(0,r.start-offset),end:Math.min(source.length,r.end-offset)})).map(r=>index===pageIndex?{start:map(r.start),end:map(r.end)}:r));
  let lineOffset=0;formatting.push(source.split('\n').map((line,i)=>{
   const sourceFormatting=doc.blocks.find(b=>b.id===`${index+1}-${i}`)?.formatting;
   const f=sourceFormatting?structuredClone(sourceFormatting):sourceFormatting;
   const start=lineOffset;lineOffset+=line.length+1;
   if(!f||index!==pageIndex||reading.start<start||reading.start>start+line.length)return f;
   const shift=x=>map(start+x)-start;
   return {...f,runs:(f.runs||[]).map(r=>({...r,start:shift(r.start),end:shift(r.end)}))};
  }));offset+=source.length+1;
 }
 const updated=makeDocument(pages,doc.name,pageStrikes,formatting,words);
 // These notices came from original annotations or ignored source pages,
 // so rebuilding retained text cannot discover them. Bill-source notices,
 // including their shifted offsets, must come from the fresh document.
 const sourceNotices=(doc.jrBoxes||[]).filter(n=>n.source==='annotation'||n.source==='flattened');
 if(sourceNotices.length){
  updated.jrBoxes=[...(updated.jrBoxes||[])];
  for(const notice of sourceNotices)if(!updated.jrBoxes.some(n=>n.page===notice.page&&n.text===notice.text))updated.jrBoxes.push(structuredClone(notice));
 }
 for(const key of ['ocr','sourcePages','ignoredFromPage','endMarkerPage'])updated[key]=doc[key];
 updated.scanQuality=doc.scanQuality.map(q=>q.page!==reading.page?structuredClone(q):{...structuredClone(q),uncertain:q.uncertain.filter(r=>r.start<reading.start||r.end>reading.end).map(r=>{const start=map(r.start),end=map(r.end);return {...structuredClone(r),start,end,text:pages[pageIndex].slice(start,end)};})});
 updated.readingCorrections=[...(doc.readingCorrections||[]),{page:reading.page,original:reading.text,replacement}];
 return updated;
}
