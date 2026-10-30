// Printed dot leaders align descriptions with an amount; their length changes
// with PDF layout. Keep them in displayed/source text and in style-table context,
// but omit them from substantive comparison only in an identified budget bill.
export function budgetContext(text){
 return /\bBudget Act of\s+\d{4}/i.test(text.slice(0,6000));
}
export function budgetLeaderRanges(text,context=text){
 if(!budgetContext(context))return [];
 const ranges=[];
 const amount=String.raw`(?:[-−–]?\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?|\(\s*[-−–]?\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\s*\))`;
 const terminal=new RegExp(String.raw`^[ \t]*${amount}[ \t]*$`);
 for(const match of text.matchAll(/\.{4,}/g)){
  const end=match.index+match[0].length,lineEnd=text.indexOf('\n',end),tail=text.slice(end,lineEnd<0?text.length:lineEnd);
  if(terminal.test(tail))ranges.push({start:match.index,end});
 }
 return ranges;
}
