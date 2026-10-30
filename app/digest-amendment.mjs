import {digestRange} from './change-scope.mjs';
import {isAmendmentMetadataLine} from './amendment-metadata.mjs';
import {digestChangedRanges} from './digest-delta.mjs';
export const amendmentName=result=>result.digest?'Digest':`Amendment ${result.number}`;

// A digest is a replacement of front matter only. The enactment line is the
// required right boundary in a bill, even when the digest spans several pages.
export function digestBodyRange(doc){
 const range=digestRange(doc);
 if(!range||!/^The people of the State of California do enact as follows\s*:/i.test(doc.text.slice(range.end)))throw Error('The digest heading and enactment boundary could not be confirmed.');
 const heading=/legislative\s+counsel[’']s\s+digest/i.exec(doc.text.slice(range.start,range.end));
 return {start:range.start+heading[0].length,end:range.end};
}
// The current PDF's physical strikeouts describe removed copies of words,
// including words retained elsewhere in the active digest. A text diff alone
// cannot own those copies: repeated "Existing law" must not lose its color.
// This is presentation evidence only; the active-token verification is unchanged.
export function digestSourceDeletionRanges(doc,range=digestBodyRange(doc)){
 const ranges=[];
 for(const block of doc.blocks){
  if(block.ignored||block.runningHead||isAmendmentMetadataLine(block.text)||block.start>=range.end||block.end<=range.start)continue;
  const from=Math.max(range.start,block.start+block.margin.length),to=Math.min(range.end,block.end);
  const strikes=(doc.struck||[]).filter(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start<to&&r.end>from).map(r=>({start:Math.max(from,r.start),end:Math.min(to,r.end)})).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start||a.end-b.end);
  let last=null;
  for(const r of strikes){
   if(last&&(r.start<=last.end||!doc.text.slice(last.end,r.start).trim()))last.end=Math.max(last.end,r.end);
   else {last={...r};ranges.push(last);}
  }
 }
 return ranges;
}
export function digestPayload(doc){
 const heading=/legislative\s+counsel[’']s\s+digest/i.exec(doc.text);
 const enactment=/The people of the State of California do enact as follows\s*:/i.exec(doc.text);
 if(enactment&&!heading)throw Error('The Digest upload includes a legislative body without an identifiable digest heading. Upload replacement digest text only.');
 const start=heading?heading.index+heading[0].length:0,end=enactment?.index??doc.text.length;
 const metadata=doc.blocks.filter(b=>isAmendmentMetadataLine(b.text));
 const tokens=(doc.effectiveTokens||doc.tokens).filter(t=>t.start>=start&&t.end<=end&&!metadata.some(b=>b.start<t.end&&b.end>t.start));
 if(!tokens.length)throw Error('No replacement digest text was found.');
 return {text:tokens.map(t=>t.value).join(' '),tokens,start,end};
}
export function digestRule(doc){
 let insertText='',error='';try{insertText=digestPayload(doc).text;}catch(e){error=e.message;}
 return {number:'Digest',digest:true,source:insertText,directive:'Apply the changes shown in the uploaded Digest to the legislative counsel’s digest.',insertText,action:'replace',title:false,heading:false,beforeLine:null,between:null,page:null,lineStart:null,lineEnd:null,deleteText:[],error};
}
export function digestDisplay(doc,previousDoc=null){
 const {start,end,tokens:sourceTokens}=digestPayload(doc),lines=[];const strikes=[],segments=[];
 for(const block of doc.blocks.filter(b=>!b.ignored&&!b.runningHead&&!isAmendmentMetadataLine(b.text)&&b.start<end&&b.end>start)){
  const from=Math.max(start,block.start+block.margin.length),to=Math.min(end,block.end),raw=doc.text.slice(from,to),leading=raw.length-raw.trimStart().length,text=raw.trim();if(!text)continue;
  const at=lines.join('\n').length+(lines.length?1:0);
  segments.push({from:from+leading,to:from+leading+text.length,at});
  for(const r of doc.struck||[]){const a=Math.max(from+leading,r.start),b=Math.min(from+leading+text.length,r.end);if(b>a)strikes.push({start:at+a-from-leading,end:at+b-from-leading});}
  lines.push(text);
 }
 const offset=(value,ending=false)=>{const s=segments.find(s=>ending?value>s.from&&value<=s.to:value>=s.from&&value<s.to);return s?s.at+value-s.from:null;};
 const tokens=sourceTokens.map(t=>({...t,start:offset(t.start),end:offset(t.end,true)})).filter(t=>t.start!==null&&t.end!==null);
 const additions=previousDoc?digestChangedRanges(digestPayload(previousDoc).tokens,tokens).currentRanges:[];
 return {directive:{text:digestRule(doc).directive,strikes:[]},payload:{text:lines.join('\n'),strikes,tokens,additions}};
}
