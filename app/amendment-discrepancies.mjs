// Adjacent removed/added tokens describe one discrepancy, including replacements.
export function amendmentDiscrepancies(changes,current,currentStart){
 const issues=[];let actual=currentStart,expected=0,open=null;
 for(const change of changes){
  if(!change.added&&!change.removed){actual+=change.count;expected+=change.count;open=null;continue;}
  if(!open){open={expectedStart:expected,expectedEnd:expected,currentStart:current[actual]?.start??current.at(-1)?.end??0,currentEnd:current[actual]?.start??current.at(-1)?.end??0,expectedText:'',actualText:''};issues.push(open);}
  if(change.removed){expected+=change.count;open.expectedEnd=expected;open.expectedText+=(open.expectedText?' ':'')+change.value.join(' ');}
  if(change.added){open.actualText+=(open.actualText?' ':'')+change.value.join(' ');open.currentEnd=current[actual+change.count-1]?.end??open.currentStart;actual+=change.count;}
 }
 return issues;
}
