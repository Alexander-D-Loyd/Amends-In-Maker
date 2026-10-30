// Extend the existing literal-source safeguard to bounded straight quotes
// split by PDF rows. Only adjacent quote marks with explicit opening/closing
// boundaries establish a pair; never seek a later closing mark after a failed
// candidate. Large, incomplete or ambiguous quotations remain manual.
export function wrappedStraightQuotes(source,rangeBlocked){
 const marks=[];for(let n=0;n<source.length;n++)if(source[n]==='"')marks.push(n);
 const ranges=[];
 for(let n=0;n+1<marks.length;n++){
  const start=marks[n],end=marks[n+1]+1,content=source.slice(start+1,end-1);
  if(end-start>4096||!content.includes('\n')||!/[\p{L}\p{N}]/u.test(content))continue;
  // A quote immediately following a digit/word is commonly a measurement
  // or closing mark. An unmatched opening cannot consume a later opening.
  if(start&&!/[\s([{:;,=—–-]/u.test(source[start-1]))continue;
  if(!content||/\s/.test(content.at(-1))||end<source.length&&!/[\s.,;:!?)}\]’']/u.test(source[end]))continue;
  if(rangeBlocked(start,end))continue;
  ranges.push({start,end});n++;
 }
 return ranges;
}
