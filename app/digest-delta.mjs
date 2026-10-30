import {amendmentWordDiff} from './amendment-word-diff.mjs';
const canonical=value=>value.normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
// Verification still compares the complete active digest. These ranges are
// presentation only: common words are never a replacement highlight.
export function digestChangedRanges(previous,current){
 const changes=amendmentWordDiff(previous.map(t=>canonical(t.value)),current.map(t=>canonical(t.value)));
 if(!changes)throw Error('The digest changes could not be aligned reliably.');
 const removed=[],added=[],previousRanges=[],currentRanges=[],previousInsertionPoints=[];let oldAt=0,newAt=0;
 const collect=(tokens,at,count,selected,ranges)=>{const part=tokens.slice(at,at+count);selected.push(...part);if(part.length)ranges.push({start:part[0].start,end:part.at(-1).end});};
 for(const change of changes){
  if(change.removed)collect(previous,oldAt,change.count,removed,previousRanges);
  if(change.added){collect(current,newAt,change.count,added,currentRanges);previousInsertionPoints.push({offset:oldAt?previous[oldAt-1].end:previous[0]?.start??0});}
  if(!change.added)oldAt+=change.count;
  if(!change.removed)newAt+=change.count;
 }
 return {removed,added,previousRanges,currentRanges,previousInsertionPoints};
}
