import {compoundSourceBoundaryBlocked} from './style-compound-source-boundaries.mjs';
import {styleSingleQuoteRanges} from './style-single-quote-ranges.mjs';

// Exact source spellings can appear inside intact quoted literals. Treat
// balanced single-quote enclosure marks as punctuation for this spelling
// acceptance path only; possessives, removed marks and technical word joins
// retain the original negative boundaries.
export function spellingSourceBoundaryGuard(doc,source){
 const normalized=source.replace(/[\u2010-\u2015]/gu,'-');let original=source;
 if(/['‘’]/u.test(source)){
  let chars=null;
  const active=at=>!(doc.struck||[]).some(r=>r.start<=at&&r.end>at)&&!(doc.excluded||[]).some(r=>r.start<=at&&r.end>at);
  for(const r of styleSingleQuoteRanges(source))if(active(r.start)&&active(r.end-1)){
   chars ||= source.split('');chars[r.start]=' ';chars[r.end-1]=' ';
  }
  if(chars)original=chars.join('');
 }
 return (start,end)=>compoundSourceBoundaryBlocked(doc.text,normalized,original,start,end);
}
