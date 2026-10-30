import {sequenceDiff} from './sequence-diff.mjs';

// Keep a comma-grouped number or decimal indivisible during alignment. Shared
// commas and trailing digits are weak anchors inside a changed amount. Expand
// the result back to original token counts/values for exact source offsets.
function units(values){
 const result=[];
 for(let i=0;i<values.length;){
  const start=i,first=values[i++];
  if(/^\d+$/.test(first)){
   if(/^\d{1,3}$/.test(first))while(values[i]===','&&/^\d{3}$/.test(values[i+1]||''))i+=2;
   if(values[i]==='.'&&/^\d+$/.test(values[i+1]||''))i+=2;
  }
  const parts=values.slice(start,i);
  result.push({key:(parts.length>1?'number:':'token:')+parts.join(''),parts});
 }
 return result;
}
export function amendmentWordDiff(previous,current){
 const old=units(previous),now=units(current),diff=sequenceDiff(old.map(u=>u.key),now.map(u=>u.key));
 if(!diff)return null;
 let oldAt=0,nowAt=0;
 return diff.map(change=>{
  const side=change.added?now:old,at=change.added?nowAt:oldAt,value=[];
  for(let i=at;i<at+change.count;i++)value.push(...side[i].parts);
  if(!change.added)oldAt+=change.count;
  if(!change.removed)nowAt+=change.count;
  return {...change,value,count:value.length};
 });
}
