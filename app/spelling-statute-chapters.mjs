// GPO 2016, rule9.38, PDF245/printed231 lists ch., chs. for publication
// parts in parentheses/brackets followed by identifiers. This narrow spelling
// path recognizes complete chapter-and-statute-year citations only. Whether
// an abbreviation is appropriate prose remains a separate style decision.
const chapters='[1-9]\\d*(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|(?:and|or|through|to)\\s+|[-–]\\s*)[1-9]\\d*)*';
const citation=new RegExp('(?<open>[([])\\s*(?<abbr>Chs?\\.|chs?\\.)\\s+'+chapters+'\\s*,\\s*(?:Stats\\.|Statutes)\\s+\\d{4}\\s*(?<close>[)\\]])','gu');
const overlap=(r,start,end)=>r.start<end&&r.end>start;
const knownHead=b=>b.runningHead||b.ignored&&b.formatting?.headerParts?.length;
export function statuteChapterSpellingRanges(doc){
 const chars=doc.text.split(''),safe=[];
 for(const b of doc.blocks||[]){
  const end=knownHead(b)?b.end:b.start+(b.margin?.length||0);
  if(end>b.start)safe.push({start:b.start,end});
  for(let at=b.start;at<end;at++)if(chars[at]!=='\n')chars[at]=' ';
 }
 const source=chars.join(''),ranges=[];
 for(const m of source.matchAll(citation)){
  const evidenceStart=m.index,evidenceEnd=m.index+m[0].length;
  if(m.groups.open==='('&&m.groups.close!==')'||m.groups.open==='['&&m.groups.close!==']')continue;
  if((doc.struck||[]).some(r=>overlap(r,evidenceStart,evidenceEnd)))continue;
  if((doc.excluded||[]).some(r=>overlap(r,evidenceStart,evidenceEnd)&&!safe.some(s=>s.start<=r.start&&s.end>=r.end)))continue;
  if((doc.blocks||[]).some(b=>b.ignored&&overlap(b,evidenceStart,evidenceEnd)&&!knownHead(b)))continue;
  const start=m.index+m[0].indexOf(m.groups.abbr),end=start+m.groups.abbr.length;
  ranges.push({start,end,abbreviation:m.groups.abbr,evidenceStart,evidenceEnd});
 }
 return ranges;
}
