import {activeText} from './core.mjs';
import {isBudgetRunningHead} from './change-scope.mjs';
export function externalBillReference(text){
 const match=/\[\s*insert\s+(?:contents?|text|body)\s+of\s+(AB|SB)\s*(\d+)\b([^\]]*)\]/i.exec(text);
 return match?{bill:match[1].toUpperCase()+' '+Number(match[2]),placeholder:match[0],additional:/\b(?:plus|and)\s+additional|attached\s+(?:LCB|RN)|additional\s+attached/i.test(match[3]),description:match[3].replace(/^[,\s]+/,'').trim()}:null;
}
export function legislativeBody(doc,bill){
 const prefix=bill.startsWith('SB ')?'SENATE':'ASSEMBLY',number=bill.split(' ')[1];
 const first=doc.blocks.filter(b=>b.page===1).map(b=>b.text).join(' ');
 if(!new RegExp('\\b'+prefix+'\\s+BILL\\s+(?:No\\.?\\s*)?'+number+'\\b','i').test(first))throw Error('Upload '+bill+'; the PDF identifies a different bill or has no readable bill heading.');
 const start=doc.blocks.findIndex(b=>/The people of the State of California do enact as follows:/i.test(b.text));
 if(start<0)throw Error('The legislative body could not be identified. Upload a bill with its enactment heading and readable text.');
 const active=activeText(doc);
 const blocks=doc.blocks.slice(start+1).filter(b=>!b.ignored&&!isBudgetRunningHead(doc,b));
 const wraps=(doc.wrappedWords||[]).filter(w=>w.recognized),starts=new Set(),ends=new Set();let bi=0;for(const w of wraps){while(bi<blocks.length&&blocks[bi].end<=w.start)bi++;if(blocks[bi])starts.add(blocks[bi].start);let j=bi+1;while(j<blocks.length&&blocks[j].end<w.end)j++;if(blocks[j])ends.add(blocks[j].start);}
 const body=blocks.map(b=>{
  let text=active.slice(b.start+b.margin.length,b.end);
  if(starts.has(b.start))text=text.replace(/[-\u00ad\u2010]\s*$/u,'');
  return text;
 }).map((text,i)=>i&&ends.has(blocks[i].start)?text:((i?'\n':'')+text)).join('').trim();
 if(!/^SECTION\s+\d/i.test(body))throw Error('The referenced bill body does not begin with a recognizable SECTION. Review the source PDF.');
 return body;
}
export function resolveExternalPayload(payload,reference,doc){
 const body=legislativeBody(doc,reference.bill);
 const prefix=payload.slice(0,payload.indexOf(reference.placeholder)).trim();
 const suffix=payload.slice(payload.indexOf(reference.placeholder)+reference.placeholder.length).trim();
 // A SECTION label immediately before the placeholder is a drafting label.
 // The referenced body supplies its own section numbering (including 1.00).
 return [(/^SECTION\s+\d+\.?(?:\d+\.)?$/i.test(prefix)?'':prefix),body,suffix].filter(Boolean).join('\n');
}

