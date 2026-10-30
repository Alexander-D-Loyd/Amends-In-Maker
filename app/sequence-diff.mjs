import {diffArrays} from './vendor/diff/diff/array.js';

// Match unique passages in text order, independently of PDF pages and lines.
function anchors(a,b,width){
  const positions=tokens=>{
    const map=new Map();
    for(let i=0;i<=tokens.length-width;i++){
      const key=JSON.stringify(tokens.slice(i,i+width));
      map.set(key,map.has(key)?-1:i);
    }
    return map;
  };
  const left=positions(a),right=positions(b),pairs=[];
  for(const [key,i] of left){const j=right.get(key);if(i>=0&&j>=0)pairs.push({i,j});}
  pairs.sort((x,y)=>x.i-y.i);
  const tails=[],parents=new Array(pairs.length).fill(-1);
  for(let k=0;k<pairs.length;k++){
    let lo=0,hi=tails.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(pairs[tails[mid]].j<pairs[k].j)lo=mid+1;else hi=mid;}
    if(lo)parents[k]=tails[lo-1];tails[lo]=k;
  }
  const chain=[];for(let k=tails.at(-1);k!==undefined&&k>=0;k=parents[k])chain.push(pairs[k]);chain.reverse();
  const result=[];
  for(const pair of chain){const last=result.at(-1);if(last&&pair.i<last.i+last.count&&pair.j<last.j+last.count){
    if(pair.i-last.i===pair.j-last.j)last.count=Math.max(last.count,pair.i-last.i+width);
  }else if(!last||pair.i>=last.i+last.count&&pair.j>=last.j+last.count)result.push({...pair,count:width});}
  return result;
}
export function sequenceDiff(left,right){
  // Retain existing alignment choices when a full minimal diff is inexpensive.
  const direct=diffArrays(left,right,{timeout:250,maxEditLength:30000});
  if(direct)return direct;
  const result=[];
  const emit=(value,kind='')=>{
    if(!value.length)return;
    let last=result.at(-1);
    if(last&&!!last.added===(kind==='added')&&!!last.removed===(kind==='removed')){
      for(const word of value)last.value.push(word);last.count+=value.length;
    }else result.push({value:[...value],count:value.length,...(kind?{[kind]:true}:{})});
  };
  const walk=(a,b,level=0)=>{
    let prefix=0;while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
    emit(a.slice(0,prefix));
    let suffix=0;while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
    const tail=suffix?a.slice(a.length-suffix):[];
    a=a.slice(prefix,a.length-suffix);b=b.slice(prefix,b.length-suffix);
    if(!a.length)emit(b,'added');
    else if(!b.length)emit(a,'removed');
    else{
      // Small gaps keep the established minimal word diff. Large revisions
      // are divided before attempting an expensive global edit-distance pass.
      const diff=a.length+b.length<=8000?diffArrays(a,b,{timeout:150,maxEditLength:2048}):null;
      if(diff)for(const part of diff)emit(part.value,part.added?'added':part.removed?'removed':'');
      else{
        const width=[12,6,3,1][level],matches=width?anchors(a,b,width):[];
        if(matches.length){
          let old=0,now=0;
          for(const match of matches){walk(a.slice(old,match.i),b.slice(now,match.j),level+1);emit(a.slice(match.i,match.i+match.count));old=match.i+match.count;now=match.j+match.count;}
          walk(a.slice(old),b.slice(now),level+1);
        }else if(level<3)walk(a,b,level+1);
        else{emit(a,'removed');emit(b,'added');}
      }
    }
    emit(tail);
  };
  walk(left,right);return result;
}
