import {styleContext,memoizeStyleReview} from './style-context.mjs';
const originalBodyKey=Symbol('original-body-style-context');
export const cutsOriginalStyleWord=(doc,index)=>/[\p{L}\p{N}\p{M}_]$/u.test(doc.text.slice(Math.max(0,index-2),index))&&/^[\p{L}\p{N}\p{M}_]/u.test(doc.text.slice(index,index+2));
// Restore uncertain body characters only for conservative evidence checks.
// Recognized margin/header exclusions remain masked; callers must never use
// this context to manufacture a positive finding from removed source text.
export function originalBodyStyleContext(doc){
 return memoizeStyleReview(doc,null,originalBodyKey,()=>{
 const structural=doc.blocks.flatMap(b=>b.margin?[{start:b.start,end:b.start+b.margin.length}]:b.ignored&&b.formatting?.headerParts?.length?[{start:b.start,end:b.end}]:[]);
 const contained=r=>{let lo=0,hi=structural.length;while(lo<hi){const mid=(lo+hi)>>1;if(structural[mid].end<=r.start)lo=mid+1;else hi=mid;}return lo<structural.length&&structural[lo].start<=r.start&&structural[lo].end>=r.end;};
 const excluded=(doc.excluded||[]).filter(contained);if(!(doc.struck||[]).length&&excluded.length===(doc.excluded||[]).length)return null;
 return styleContext({...doc,struck:[],excluded});
 });
}
// Validate complete grammatical/identity evidence without changing the source.
// Excluded characters cannot become whitespace evidence except actual margin
// prefixes and reader-identified, wholly interior layout/running-head blocks.
export function styleEvidenceGuard(doc,ctx=styleContext(doc)){
 const blocksAt=(start,end)=>{let lo=0,hi=doc.blocks.length;while(lo<hi){const mid=(lo+hi)>>1;if(doc.blocks[mid].end<=start)lo=mid+1;else hi=mid;}const out=[];for(let n=lo;n<doc.blocks.length&&doc.blocks[n].start<end;n++)out.push(doc.blocks[n]);return out;};
 const knownHead=b=>b.runningHead||b.layoutLabel||(b.ignored&&b.formatting?.headerParts?.length);
 const unknownExcluded=(doc.excluded||[]).filter(r=>!blocksAt(r.start,r.end).some(b=>(b.margin&&r.start>=b.start&&r.end<=b.start+b.margin.length)||(knownHead(b)&&r.start===b.start&&r.end===b.end)));
 return (start,end)=>!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>doc.text.length||end<=start||ctx.literalAt(start,end)||(doc.struck||[]).some(r=>r.start<end&&r.end>start)||unknownExcluded.some(r=>r.start<end&&r.end>start)||blocksAt(start,end).some(b=>ctx.tableAt(b.start)||(b.ignored&&(!knownHead(b)||b.start<=start||b.end>=end)));
}
