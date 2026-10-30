// Only the dated history rows in a bill's front matter are compared as rows.
const history=/^AMENDED\s+IN\s+(?:SENATE|ASSEMBLY)\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},\s+\d{4}$/i;
export const isHistoryValue=value=>history.test(value);
export function historyTokens(tokens,blocks){
 const front=blocks.filter(b=>b.page===1),masthead=front.find(b=>/^california\s+legislature\b/i.test(b.text.trim()));
 const bill=front.find(b=>/^(?:ASSEMBLY|SENATE)\s+BILL\b/i.test(b.text.trim()));
 if(!bill)return tokens;
 // Some budget front pages omit the legislature masthead. Dated rows above
 // the bill heading still belong to its history; never extend into its body.
 const boundary=Math.min(bill.start,masthead?.start??bill.start);
 const rows=front.filter(b=>b.start<boundary&&!b.margin&&history.test(b.text.trim()));
 if(!rows.length)return tokens;
 const output=[];let index=0;
 for(const row of rows){
  while(index<tokens.length&&tokens[index].start<row.start)output.push(tokens[index++]);
  const first=tokens[index];
  while(index<tokens.length&&tokens[index].start<row.end)index++;
  if(first&&first.start<row.end)output.push({value:row.text.trim().replace(/\s+/g,' '),start:row.start,end:row.end,history:true});
 }
 return output.concat(tokens.slice(index));
}
// Split edits at row boundaries so each changed history row has its own target.
export function splitHistoryChanges(changes){
 return changes?.flatMap(change=>{
  if(!change.added&&!change.removed)return [change];
  const result=[];let body=[];
  const flush=()=>{if(body.length){result.push({...change,value:body,count:body.length});body=[];}};
  for(const value of change.value){if(isHistoryValue(value)){flush();result.push({...change,value:[value],count:1,history:true});}else body.push(value);}
  flush();return result;
 });
}
