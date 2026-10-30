import {isAmendmentMetadataLine} from './amendment-metadata.mjs';
export function amendmentReadingWarnings(doc){
 if(!doc)return [];
 const headings=[...doc.text.matchAll(/(?:^|\n)\s*Amendment\s*(\d+)\s*(?=\n|$)/gi)];
 const warnings=[];let pageOffset=0;
 for(const [index,page] of doc.rawPages.entries()){
  for(const item of doc.scanQuality?.find(q=>q.page===index+1)?.uncertain||[]){
   if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end<=item.start||item.end>page.length)continue;
   const lineStart=page.lastIndexOf('\n',item.start-1)+1,nextLine=page.indexOf('\n',item.end);
   // A low-confidence page number/RN header belongs to the administrative
   // row, not the amendment that happened to end on the preceding page.
   if(isAmendmentMetadataLine(page.slice(lineStart,nextLine<0?page.length:nextLine)))continue;
   const offset=pageOffset+item.start;
   const section=headings.findLast(h=>h.index<=offset);if(!section)continue;
   warnings.push({...item,page:index+1,number:section[1]});
  }
  pageOffset+=page.length+1;
 }
 return warnings;
}
export function applyAmendmentReadingWarnings(results,warnings){
 return results.map(result=>{
  const readings=result.digest?[]:warnings.filter(w=>w.number===String(result.sourceNumber??result.number));
  if(!readings.length)return result;
  const pages=[...new Set(readings.map(w=>w.page))].join(', '),examples=[...new Set(readings.map(w=>w.text))].slice(0,4).map(t=>'“'+t+'”').join(', ');
  return {...result,status:'needs-review',readingWarnings:readings,message:`PDF reading needs review on amendment page${pages.includes(',')?'s':''} ${pages}: ${examples}. Open the Instructional Amendments PDF to confirm these characters. Text discrepancies remain highlighted; an uncertain OCR reading is not a confirmed amendment error.`};
 });
}
