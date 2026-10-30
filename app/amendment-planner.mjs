import {amendmentPlan,parseAmendments} from './amendments.mjs';
import {repairOcrInstructions} from './ocr-text.mjs';
import {instructionLocations,instructionIssueContext,instructionSourceText} from './amendment-issues.mjs';

const documentOf=value=>value?.doc||value;
const issue=(code,message,extra={})=>({code,message,...extra});
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;

export function documentReadingIssues(value,label='Source'){
 const doc=documentOf(value);if(!doc)return [];
 const rows=[],source=label==='Amendments'?'instructions':label==='Previous Version'?'previous':'reference',context={source,...(value?.id?{entryId:value.id}:{})};
 for(const quality of doc.scanQuality||[])for(const warning of quality.uncertain||[]){
  const pageOffset=(doc.rawPages||[]).slice(0,quality.page-1).reduce((n,text)=>n+text.length+1,0),start=pageOffset+warning.start,end=pageOffset+warning.end;
  const matching=source==='instructions'&&Number.isInteger(start)&&Number.isInteger(end)?instructionLocations(value).filter(r=>overlaps(r,{start,end})):[];
  rows.push(issue('PDF_READING_UNCERTAIN',`${label} page ${quality.page}: confirm the PDF reading${warning.text?' “'+warning.text+'”':''} against its original page.`,{...context,...(matching.length===1?instructionIssueContext(value,matching[0].number):{}),page:quality.page,warning,...(Number.isInteger(start)&&Number.isInteger(end)?{readingStart:start,readingEnd:end}:{})}));
 }
 for(const warning of [...(doc.readingProblems||[]),...(value!==doc?value?.readingProblems||[]:[])])rows.push(issue('PDF_READING_PROBLEM',`${label}: ${typeof warning==='string'?warning:warning?.reason||warning?.message||'original text reading requires review'}.`,{...context,...(Number.isInteger(warning?.page)?{page:warning.page}:{})}));
 return rows;
}

function sourceRanges(doc,tokens,patch){
 if(patch.start===patch.end)return [];
 const selected=tokens.slice(patch.start,patch.end);if(!selected.length)throw Error('The source patch has no readable original tokens.');
 const first=selected[0].start,last=selected.at(-1).end,ranges=[];
 for(const block of doc.blocks||[]){
  if(block.ignored||block.end<=first||block.start>=last)continue;
  const start=Math.max(first,block.start+(block.margin?.length||0)),end=Math.min(last,block.end);
  if(start>=end)continue;
  let parts=[{start,end}];
  for(const exclusion of [...(doc.struck||[]),...(doc.excluded||[])])parts=parts.flatMap(part=>!overlaps(part,exclusion)?[part]:[{start:part.start,end:Math.min(part.end,exclusion.start)},{start:Math.max(part.start,exclusion.end),end:part.end}].filter(r=>r.end>r.start));
  ranges.push(...parts.filter(r=>doc.text.slice(r.start,r.end).trim()).map(r=>({...r,page:block.page,text:doc.text.slice(r.start,r.end)})));
 }
 if(!ranges.length)throw Error('No intact physical source text remains for this strikeout.');
 return ranges;
}

export function planAmendments({previous,instructions,digest=null,externalDocs={}}={}){
 const prev=documentOf(previous),inst=documentOf(instructions),issues=[],warnings=[];
 if(!prev?.text||!Array.isArray(prev.tokens))issues.push(issue('PREVIOUS_REQUIRED','Choose a readable Previous Version PDF.'));
 if(!inst?.text)issues.push(issue('INSTRUCTIONS_REQUIRED','Choose the corresponding instructional amendment PDF.'));
 if(digest)issues.push(issue('DIGEST_MARKUP_UNSUPPORTED','Replacement Digest PDFs are not instructional amendments. This version marks only the explicit amendment instructions on the previous bill.'));
 issues.push(...documentReadingIssues(previous,'Previous Version'),...documentReadingIssues(instructions,'Amendments'));
 const external=Object.fromEntries(Object.entries(externalDocs).map(([key,value])=>[key,documentOf(value)]));
 for(const [key,value]of Object.entries(externalDocs))issues.push(...documentReadingIssues(value,'Referenced '+key));
 if(issues.length)return {ready:false,amendments:[],issues,warnings,verification:[]};
 const active=instructionSourceText(inst),text=inst.ocr?repairOcrInstructions(active):active;
 if(!text.trim())return {ready:false,amendments:[],issues:[issue('NO_AMENDMENTS_FOUND','No active amendment instructions were found in this PDF.',{source:'instructions',...(instructions?.id?{entryId:instructions.id}:{})})],warnings,verification:[]};
 const parsed=parseAmendments(text),seen=new Set();
 for(const rule of parsed){const n=String(rule.number),canonical=n.replace(/^0+(?=\d)/,'');if(!/^\d{1,5}$/.test(n)||canonical==='0')issues.push(issue('AMENDMENT_NUMBER_INVALID','An amendment number is missing or cannot fit a safe numbered PDF marker.',instructionIssueContext(instructions,n)));if(seen.has(canonical))issues.push(issue('AMENDMENT_NUMBER_DUPLICATE',`Amendment ${n} occurs more than once. Confirm the instruction set before making marks.`,instructionIssueContext(instructions,n)));seen.add(canonical);}
 if(issues.length)return {ready:false,amendments:[],issues,warnings,verification:[]};
 let plan;try{plan=amendmentPlan(text,prev,prev,external);}catch(error){return {ready:false,amendments:[],issues:[issue('PLAN_FAILED',error.message,{source:'instructions',...(instructions?.id?{entryId:instructions.id}:{})})],warnings,verification:[]};}
 if(!plan.compiled.length)return {ready:false,amendments:[],issues:[issue('NO_AMENDMENTS_FOUND','No active amendment instructions were found in this PDF.',{source:'instructions',...(instructions?.id?{entryId:instructions.id}:{})})],warnings,verification:[]};
 const amendments=plan.compiled.map(rule=>{
  const row={...instructionIssueContext(instructions,rule.number),number:String(rule.number),action:rule.action,directive:rule.directive,insertText:rule.insertText,sourceRanges:[],insertion:null,insertions:[],between:rule.between?{page:rule.page,above:rule.between[0],below:rule.between[1]}:null,lineInsertion:null,patches:[],ready:true,issues:[]};
  const reject=(code,message)=>{row.ready=false;const value=issue(code,message,instructionIssueContext(instructions,row.number));row.issues.push(value);issues.push(value);};
  if(rule.error)reject('SOURCE_LOCATION_UNRESOLVED',rule.error);
  if(rule.attachmentWarning)reject('DRAFTING_ATTACHMENT_REQUIRED',rule.attachmentWarning);
  if(!rule.error&&!rule.patches.length)reject('EMPTY_AMENDMENT_PLAN','The amendment has no source location that can be marked.');
  if(!row.ready)return row;
  try{
   for(const patch of rule.patches){
    const ranges=sourceRanges(prev,plan.previous,patch);row.sourceRanges.push(...ranges);
    if(patch.lineInsertion){if(row.lineInsertion&&JSON.stringify(row.lineInsertion)!==JSON.stringify(patch.lineInsertion))throw Error('This amendment has incompatible relative-line insertion locations.');row.lineInsertion={...patch.lineInsertion};}
    let offset=null;
    if(patch.start===patch.end){offset=patch.sourceOffset??plan.previous[patch.start]?.start??plan.previous.at(-1)?.end;if(!Number.isInteger(offset)||offset<0||offset>prev.text.length)throw Error('The insertion point cannot be bound to an exact original source offset.');}
    else if(rule.action==='replace'&&patch.replacement.length)offset=ranges.at(-1).end;
    if(offset!==null)row.insertions.push({offset,page:patch.lineInsertion?.page??rule.page,kind:patch.lineInsertion?'line-'+patch.lineInsertion.position:rule.between?'between-lines':rule.position||'after',finalInsertion:!!patch.finalInsertion,...(patch.lineInsertion?{lineInsertion:{...patch.lineInsertion}}:{})});
    row.patches.push({sourceRanges:ranges,insertion:offset===null?null:{offset},replacement:patch.replacement,tokenStart:patch.start,tokenEnd:patch.end,...(patch.lineInsertion?{lineInsertion:{...patch.lineInsertion}}:{})});
   }
   row.insertion=row.insertions.length===1?row.insertions[0]:null;
   if(rule.action==='replace'&&!row.insertions.length)throw Error('A strike-and-insert instruction has no final replacement endpoint.');
  }catch(error){reject('SOURCE_RANGE_UNRESOLVED',error.message);}
  return row;
 });
 return {ready:issues.length===0&&amendments.length>0&&amendments.every(a=>a.ready),amendments,issues,warnings,verification:[],instructionText:text};
}
