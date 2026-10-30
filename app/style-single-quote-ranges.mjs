// Conservative single-quotation enclosure evidence. Internal apostrophes in
// words never close a quotation. These ranges protect existing literal text;
// they do not establish meaning or resolve every apostrophe/quote ambiguity.
export function styleSingleQuoteRanges(source){
 const stack=[],ranges=[],word=c=>/[\p{L}\p{N}\p{M}_]/u.test(c||'');
 for(let n=0;n<source.length;n++){const c=source[n];if(c!=='‘'&&c!=='’'&&c!=="'")continue;if(word(source[n-1])&&word(source[n+1]))continue;
  if(c==='‘')stack.push({quote:c,start:n});
  else if(c==='’'){if(stack.at(-1)?.quote==='‘'){const q=stack.pop();ranges.push({start:q.start,end:n+1});}}
  else if(stack.at(-1)?.quote==="'"){const q=stack.pop();ranges.push({start:q.start,end:n+1});}
  else if(!word(source[n-1]))stack.push({quote:c,start:n});
 }return ranges;
}
