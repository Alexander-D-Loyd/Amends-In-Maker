// Negative source boundaries for already selected finite compound rules.
// Intact ordinary possessives and live narrative punctuation retain their
// existing prose role; removed marks cannot create either exception. This
// helper establishes no noun role, word spelling, name or grammatical rule.
export function compoundSourceBoundaryBlocked(text,source,original,start,end){
 let before=original.slice(Math.max(0,start-2),start),after=original.slice(end,end+5);
 const narrativeDash=at=>/[\u2013-\u2015]/u.test(text[at]||'')&&source[at]==='-';
 if(narrativeDash(start-1))before=before.slice(0,-1)+' ';
 if(narrativeDash(end))after=' '+after.slice(1);
 else if(text[end]===':'&&source[end]===':'&&/^(?:\s|$)/u.test(text.slice(end+1,end+2)))after=' '+after.slice(1);
 else{
  const suffix=/^[’'][sS](?=$|[\s,.;!?)]|:(?=\s|$))/u.exec(text.slice(end,end+8))||/[sS]$/u.test(text.slice(start,end))&&/^[’'](?=$|[\s,.;!?)]|:(?=\s|$))/u.exec(text.slice(end,end+8));
  if(suffix&&source.slice(end,end+suffix[0].length)===suffix[0]&&original.slice(end,end+suffix[0].length)===suffix[0])after=original.slice(end+suffix[0].length,end+suffix[0].length+5);
 }
 return /[\p{L}\p{N}\p{M}_.’'\-\u2010-\u2015/:\\#@]$/u.test(before)||/^[\p{L}\p{N}\p{M}_’'\-\u2010-\u2015/:\\#@]/u.test(after)||/^\.[\p{L}\p{N}\p{M}_]/u.test(after);
}
