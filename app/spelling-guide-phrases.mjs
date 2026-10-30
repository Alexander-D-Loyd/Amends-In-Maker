import guidePhrases from './data/guide-spelling-phrases.json' with {type:'json'};
import {spellingSourceBoundaryGuard} from './spelling-source-boundaries.mjs';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const forms=guidePhrases.phrases.flatMap(({phrase})=>[phrase,phrase[0].toUpperCase()+phrase.slice(1)]);
// A discretionary line division is accepted only inside a complete printed
// phrase. Its component words never enter the spelling dictionary.
const division='(?:[-\\u00ad\\u2010][ \\t]*\\n\\s{0,4096})?';
const wordPattern=word=>[...word].map((c,n,chars)=>escape(c)+(n<chars.length-1&&/\p{L}/u.test(c)&&/\p{L}/u.test(chars[n+1])?division:'')).join('');
const pattern=new RegExp('(?<![\\p{L}\\p{N}\\p{M}_])(?:'+[...new Set(forms)].map(p=>p.split(' ').map(wordPattern).join('\\s{1,4096}')).join('|')+')(?![\\p{L}\\p{N}\\p{M}_])','gu');
export function guidePhraseSpellingRanges(doc){
 const chars=doc.text.split(''),safe=[];
 const knownHead=b=>b.runningHead||b.ignored&&b.formatting?.headerParts?.length;
 for(const b of doc.blocks){
  const end=knownHead(b)?b.end:b.start+(b.margin?.length||0);
  if(end>b.start)safe.push({start:b.start,end});
  for(let at=b.start;at<end;at++)if(chars[at]!=='\n')chars[at]=' ';
 }
 const source=chars.join(''),boundary=spellingSourceBoundaryGuard(doc,source),ranges=[];
 for(const m of source.matchAll(pattern)){
  const start=m.index,end=start+m[0].length;
  if((doc.struck||[]).some(r=>r.start<end&&r.end>start))continue;
  if((doc.excluded||[]).some(r=>r.start<end&&r.end>start&&!safe.some(s=>s.start<=r.start&&s.end>=r.end)))continue;
  if(doc.blocks.some(b=>b.ignored&&b.start<end&&b.end>start&&(!knownHead(b)||b.start<=start||b.end>=end)))continue;
  if(boundary(start,end))continue;
  ranges.push({start,end,phrase:m[0].replace(/[-\u00ad\u2010][ \t]*\n\s*/gu,'').replace(/\s+/g,' ')});
 }
 return ranges;
}
