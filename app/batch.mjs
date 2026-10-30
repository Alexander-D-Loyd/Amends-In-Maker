import {planAmendments} from './amendment-planner.mjs';

const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthPattern=MONTHS.join('|');
const KIND=new Set(['bill','amendments','digest','unknown']);
const issue=(code,message,extra={})=>({code,message,...extra});
const docOf=e=>e?.doc||e;
const own=(o,key)=>Object.prototype.hasOwnProperty.call(o||{},key);

export function normalizeBillId(value){
 const m=/^(AB|SB)\s*(?:NO\.?\s*)?0*(\d{1,5})$/i.exec(String(value||'').trim());
 return m&&Number(m[2])>0?m[1].toUpperCase()+' '+Number(m[2]):null;
}
export function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);if(year<1800||year>2199)return false;
 const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
const iso=(year,month,day)=>{const value=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');return validDate(value)?value:null;};
export function formatAmendmentDate(value){if(!validDate(value))return '';const [y,m,d]=value.split('-').map(Number);return MONTHS[m-1]+' '+d+', '+y;}
export function outputFilename(billId,date){const bill=normalizeBillId(billId);if(!bill||!validDate(date))return '';const [,month,day]=date.split('-').map(Number);return bill+' '+MONTHS[month-1]+' '+day+' AMENDS IN.pdf';}

function billCodes(text){
 const found=[];
 for(const m of String(text).matchAll(/\b(AB|SB)\s*(?:NO\.?\s*)?(\d{1,5})(?!\d)|\b(ASSEMBLY|SENATE)\s*BILL\s*(?:NO\.?\s*)?(\d{1,5})(?!\d)/gi)){
  const bill=normalizeBillId((m[1]||(m[3].toUpperCase()==='ASSEMBLY'?'AB':'SB'))+' '+(m[2]||m[4]));if(bill&&!found.includes(bill))found.push(bill);
 }
 return found;
}
function dates(text){
 const values=[];
 for(const m of String(text).matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)){const d=iso(+m[1],+m[2],+m[3]);if(d)values.push({date:d,source:m[0]});}
 for(const m of String(text).matchAll(new RegExp('\\b('+monthPattern+')\\s*([0-3]?\\d)(?:[ ,_\\-]+(\\d{4}))?(?=\\D|$)','gi'))){const month=MONTHS.findIndex(x=>x.toLowerCase()===m[1].toLowerCase())+1,day=+m[2];if(m[3]){const d=iso(+m[3],month,day);if(d)values.push({date:d,source:m[0]});}else if(day>=1&&day<=31)values.push({date:null,month,day,source:m[0]});}
 for(const m of String(text).matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g)){if(m[3].length===4){const d=iso(+m[3],+m[1],+m[2]);if(d)values.push({date:d,source:m[0]});}else if(+m[1]>=1&&+m[1]<=12&&+m[2]>=1&&+m[2]<=31)values.push({date:null,month:+m[1],day:+m[2],shortYear:+m[3],source:m[0]});}
 return values;
}

export function classifyEntry(entry){
 const meta=entry?.metadata||{},manual=entry?.manualMetadata||{},doc=docOf(entry),name=String(entry?.name||doc?.name||''),firstPage=String(meta.firstPageText||doc?.rawPages?.[0]||doc?.text?.slice(0,6000)||''),issues=[];
 if(entry?.error)issues.push(issue('PDF_LOAD_FAILED',typeof entry.error==='string'?entry.error:entry.error.message||'This PDF could not be read.'));
 const headerEnd=firstPage.search(/(?:^|\n)\s*(?:An\s+act\b|LEGISLATIVE\s+COUNSEL|The\s+people\b)/i),cover=firstPage.slice(0,headerEnd<0?1800:headerEnd);
 const headerLines=cover.split('\n').filter(line=>/^\s*(?:(?:AMENDMENTS?\s*TO|PROPOSED\s+AMENDMENTS?\s*TO)\s*)?(?:(?:ASSEMBLY|SENATE)\s*BILL(?=\s|NO\.?|$)|[AS]B\s*\d)/i.test(line));
 const identityHeaders=headerLines.map(line=>line.replace(/^\s*(?:(?:PROPOSED\s*)?AMENDMENTS?\s*TO)\s*/i,''));
 const headerIds=billCodes(identityHeaders.join('\n')),nameIds=billCodes(name.replaceAll('_',' ')),explicit=normalizeBillId(meta.billId),manualKeys=Object.keys(manual).filter(k=>['billId','kind','date'].includes(k));
 let billId=null;
 if(own(manual,'billId')){billId=normalizeBillId(manual.billId);if(!billId)issues.push(issue('BILL_ID_INVALID','Enter a bill identifier such as AB 1982 or SB 879.'));}
 else{
  const candidates=[...new Set([...nameIds,...headerIds,...(explicit?[explicit]:[])])];billId=nameIds.length===1?nameIds[0]:candidates.length===1?candidates[0]:null;if(candidates.length>1)issues.push(issue('BILL_ID_CONFLICT','The filename and source heading identify different bills. Confirm the bill before grouping this file.'));else if(!billId)issues.push(issue('BILL_ID_REQUIRED','The bill number could not be read. Choose its bill identifier.'));
 }
 let kind='unknown';
 if(own(manual,'kind')){if(KIND.has(manual.kind))kind=manual.kind;else issues.push(issue('DOCUMENT_KIND_INVALID','Choose Bill, Amendments, Digest, or Unclassified.'));}
 else{
  const amendmentHeading=/(?:^|\n)\s*Amendment\s*\d+\s*(?:\n|$)/i.test(firstPage)||headerLines.some(l=>/^\s*(?:PROPOSED\s*)?AMENDMENTS?\s*TO/i.test(l)),amendmentName=/\b(?:amends|amendments?|instructions?)\b/i.test(name.replaceAll('_',' ')),digestName=/\bdigest\b/i.test(name),billHeading=headerLines.some(l=>/^\s*(?:(?:ASSEMBLY|SENATE)\s*BILL(?=\s|NO\.?|$)|[AS]B\s*\d)/i.test(l));
  const namedKind=digestName?'digest':amendmentName?'amendments':null,headingKind=amendmentHeading?'amendments':billHeading?'bill':null;
  kind=namedKind||headingKind||(KIND.has(meta.kind)&&meta.kind!=='unknown'?meta.kind:null)||(KIND.has(meta.kindHint)&&meta.kindHint!=='unknown'?meta.kindHint:null)||(nameIds.length===1?'bill':'unknown');
  if(namedKind&&headingKind&&namedKind!==headingKind||namedKind&&KIND.has(meta.kind)&&meta.kind!=='unknown'&&namedKind!==meta.kind)issues.push(issue('DOCUMENT_KIND_CONFLICT','The filename and source identify different document types. Confirm this file’s type.'));
 }
 if(kind==='unknown')issues.push(issue('DOCUMENT_KIND_REQUIRED','Choose whether this file is a bill version or instructional amendments.'));
 const instructionStart=firstPage.search(/(?:^|\n)\s*(?:Amendment\s*\d+\b|On\s+page\s*\d+\b|In\s+the\s+(?:title|heading)\b)/i);
 const instructionCover=firstPage.slice(0,instructionStart<0?1000:instructionStart);
 // A drafting timestamp is not necessarily the adopted amendment date; an
 // AS AMENDED IN heading identifies the previous bill being amended.
 const priorVersionRows=instructionCover.split('\n').filter(l=>/^\s*AS\s*AMENDED\s*IN\b/i.test(l));
 const productionRows=instructionCover.split('\n').filter(l=>/^\s*\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\s+\d{1,2}:\d{2}\b/.test(l));
 const instructionDateRows=instructionCover.split('\n').filter(l=>!priorVersionRows.includes(l)&&!productionRows.includes(l)).join('\n');
 const sourceVersionDates=dates(priorVersionRows.join('\n')).map(d=>d.date).filter(Boolean).sort();
 const productionDateParts=dates(productionRows.join('\n'));
 const sourceDates=dates(kind==='bill'?cover:instructionDateRows),nameDates=dates(name.replaceAll('_',' ')),fullSource=[...new Set(sourceDates.map(d=>d.date).filter(Boolean))].sort(),fullName=[...new Set(nameDates.map(d=>d.date).filter(Boolean))].sort();
 let date=null,dateParts=null,dateSource='';
 if(own(manual,'date')){if(validDate(manual.date)){date=manual.date;dateSource='human-confirmed';}else issues.push(issue('DATE_INVALID','Enter a complete valid amendment date, including its year.'));}
 else if(meta.date){if(validDate(meta.date)){date=meta.date;dateSource=meta.dateSource||'document-metadata';}else issues.push(issue('DATE_INVALID','The supplied document date is invalid. Confirm the date from the source.'));}
 else if(fullSource.length){date=fullSource.at(-1);dateSource='source-cover';if(kind!=='bill'&&fullSource.length>1)issues.push(issue('DATE_CONFLICT','More than one full date appears in the amendment heading. Confirm the amendment-set date.'));}
 else if(fullName.length===1){date=fullName[0];dateSource='filename';}else if(fullName.length>1)issues.push(issue('DATE_CONFLICT','More than one date appears in this filename. Confirm its amendment-set date.'));
 if(date&&fullName.length===1&&date!==fullName[0]&&!own(manual,'date'))issues.push(issue('DATE_CONFLICT','The document and filename dates disagree. Confirm the amendment-set date.'));
 if(date&&!own(manual,'date')){const [year,month,day]=date.split('-').map(Number);if(nameDates.filter(d=>!d.date).some(d=>d.month!==month||d.day!==day||d.shortYear!==undefined&&year%100!==d.shortYear))issues.push(issue('DATE_CONFLICT','The filename’s short date disagrees with the complete source date. Confirm the amendment-set date.'));}
 if(!date&&!own(manual,'date')){const namedParts=[...sourceDates,...nameDates].filter(d=>!d.date),parts=namedParts.length?namedParts:productionDateParts.filter(d=>!d.date);if(parts.length){const days=[...new Set(parts.map(d=>d.month+'-'+d.day))],compatibleProduction=productionDateParts.filter(d=>!d.date&&d.month===parts[0].month&&d.day===parts[0].day),years=[...new Set([...parts,...compatibleProduction].map(d=>d.shortYear).filter(y=>y!==undefined))];if(days.length===1&&years.length<=1)dateParts={month:parts[0].month,day:parts[0].day,...(years.length?{shortYear:years[0]}:{})};else issues.push(issue('DATE_CONFLICT','The short source dates disagree. Confirm their complete amendment date.'));}}
 if(kind==='amendments'&&!date&&!issues.some(i=>i.code.startsWith('DATE_')))issues.push(issue('AMENDMENT_DATE_REQUIRED','Confirm the amendment date printed on the instruction set. File modification time is never used.'));
 const versionLabel=/\bv(\d{1,4})\b/i.exec(name)?.[0]||meta.versionLabel||null;
 return {...meta,billId,kind,date,dateLabel:formatAmendmentDate(date),dateParts,dateSource,sourceVersionDate:sourceVersionDates.at(-1)||null,productionDateParts,versionLabel,manualKeys,issues};
}

function completePartialDates(entries){
 return entries.map(entry=>{
  const m=entry.metadata;if(m.kind!=='amendments'||m.date||!m.dateParts||!m.billId)return entry;
  const part=m.dateParts,billDates=entries.filter(e=>e.metadata.billId===m.billId&&e.metadata.kind==='bill'&&validDate(e.metadata.date)).map(e=>e.metadata.date),matching=[...new Set(billDates.filter(d=>{const [y,mo,day]=d.split('-').map(Number);return mo===part.month&&day===part.day&&(part.shortYear===undefined||y%100===part.shortYear);}))];
  const productionYears=(m.productionDateParts||[]).map(p=>p.date?+p.date.slice(0,4):null).filter(Boolean),years=[...new Set([...billDates,...(validDate(m.sourceVersionDate)?[m.sourceVersionDate]:[])].map(d=>+d.slice(0,4)).concat(productionYears))];
  const shortYears=[...new Set([part.shortYear,...(m.productionDateParts||[]).map(p=>p.shortYear)].filter(y=>y!==undefined))];
  const compatibleYears=years.filter(y=>shortYears.every(short=>y%100===short));
  const date=matching.length===1&&shortYears.every(short=>+matching[0].slice(0,4)%100===short)?matching[0]:matching.length===0&&compatibleYears.length===1?iso(compatibleYears[0],part.month,part.day):null;
  if(!date)return entry;return {...entry,metadata:{...m,date,dateLabel:formatAmendmentDate(date),dateSource:matching.length?'matching-bill-cover-date':'same-bill-source-year',issues:m.issues.filter(i=>i.code!=='AMENDMENT_DATE_REQUIRED')}};
 });
}

function automaticRoles(bills,instructions,date){
 const result=previous=>({previous,current:null,issues:[]}),priorDate=instructions.metadata.sourceVersionDate;
 if(!bills.length)return {previous:null,current:null,issues:[issue('PREVIOUS_REQUIRED','Upload the bill PDF to mark with these amendments.')]};
 const namedPrevious=bills.filter(e=>/\b(?:previous|prior|old|before)\b/i.test(e.name.replaceAll('_',' ')));
 if(namedPrevious.length>1)return {previous:null,current:null,issues:[issue('VERSION_ASSIGNMENT_REQUIRED','More than one bill filename identifies the previous version. Choose the bill to mark.')]};
 if(namedPrevious.length===1)return result(namedPrevious[0]);
 if(bills.length===1)return result(bills[0]);
 if(priorDate){const matches=bills.filter(e=>e.metadata.date===priorDate);if(matches.length===1)return result(matches[0]);}
 if(date&&bills.every(e=>validDate(e.metadata.date))){const before=bills.filter(e=>e.metadata.date<date).sort((a,b)=>b.metadata.date.localeCompare(a.metadata.date));if(before.length&&before.filter(e=>e.metadata.date===before[0].metadata.date).length===1)return result(before[0]);}
 return {previous:null,current:null,issues:[issue('VERSION_ASSIGNMENT_REQUIRED','Multiple bill PDFs match this bill number. Choose the previous bill to mark; version counters alone do not establish which file the instructions amend.')]};
}

export function analyzeBatch(inputEntries,assignments={}){
 if(!Array.isArray(inputEntries))throw TypeError('Batch entries must be an array.');
 const normalized=inputEntries.map((entry,index)=>({...entry,id:String(entry.id??'file-'+index),name:String(entry.name||entry.doc?.name||'PDF '+(index+1)),metadata:classifyEntry(entry)}));
 if(new Set(normalized.map(e=>e.id)).size!==normalized.length)throw Error('Each uploaded file needs a distinct identity. Remove duplicated file identifiers and reload them.');
 const entries=completePartialDates(normalized),groups=[];
 for(const instruction of entries.filter(e=>e.metadata.kind==='amendments')){
  const id='amendments:'+instruction.id,a=assignments[id]||{},billId=own(a,'billId')?normalizeBillId(a.billId):instruction.metadata.billId;
  const candidates=entries.filter(e=>e.id===instruction.id||billId&&e.metadata.billId===billId&&e.metadata.kind==='bill'),bills=candidates.filter(e=>e.metadata.kind==='bill');
  const localIssues=[...instruction.metadata.issues];if(own(a,'billId')&&!billId)localIssues.push(issue('BILL_ID_INVALID','Enter a valid bill identifier.'));
  if(own(a,'billId')&&billId)for(let i=localIssues.length-1;i>=0;i--)if(localIssues[i].code.startsWith('BILL_ID_'))localIssues.splice(i,1);
  const date=own(a,'date')?(validDate(a.date)?a.date:null):instruction.metadata.date;
  if(own(a,'date')){for(let i=localIssues.length-1;i>=0;i--)if(localIssues[i].code.startsWith('DATE_')||localIssues[i].code==='AMENDMENT_DATE_REQUIRED')localIssues.splice(i,1);if(!date)localIssues.push(issue('DATE_INVALID','Choose a valid complete amendment date.'));}
  if(!date&&!localIssues.some(i=>i.code.includes('DATE')))localIssues.push(issue('AMENDMENT_DATE_REQUIRED','Confirm the complete amendment-set date before generating its filename.'));
  const selectedInstruction=instruction;
  if(own(a,'instructionsId')&&a.instructionsId!==instruction.id)localIssues.push(issue('INSTRUCTIONS_ASSIGNMENT_INVALID','This group belongs to its own instruction set. Remove a duplicate set or correct the file classification.'));
  let roles=automaticRoles(bills,instruction,date);
  if(own(a,'previousId')){
   const byId=new Map(bills.map(e=>[e.id,e]));
   const previous=byId.get(a.previousId)||null;
   roles={previous,current:null,issues:[]};if(!previous)roles.issues.push(issue('PREVIOUS_REQUIRED','Choose the bill to mark from this bill number’s uploaded files.'));
  }
  localIssues.push(...roles.issues);
  if(roles.previous){const previous=roles.previous,priorDate=instruction.metadata.sourceVersionDate;if(priorDate&&previous.metadata.date&&priorDate!==previous.metadata.date)localIssues.push(issue('PREVIOUS_EDITION_CONFLICT','The instruction heading names a different previous bill date than the selected bill. Confirm the correct bill.',{entryId:previous.id}));if(/\b(?:current|latest|new)\b/i.test(previous.name.replaceAll('_',' ')))localIssues.push(issue('PREVIOUS_FILENAME_CONFLICT','The selected filename identifies a newer bill version. Confirm its file classification before using it as the previous bill.',{entryId:previous.id}));}
  for(const e of bills)localIssues.push(...e.metadata.issues.filter(i=>i.code!=='AMENDMENT_DATE_REQUIRED').map(i=>({...i,entryId:e.id})));
  let plan=null;if(roles.previous&&localIssues.length===0){plan=planAmendments({previous:roles.previous,instructions:selectedInstruction});localIssues.push(...plan.issues);}
  const filename=outputFilename(billId,date),ready=!!filename&&!!plan?.ready&&localIssues.length===0;
  groups.push({id,billId,date,dateLabel:formatAmendmentDate(date),outputFilename:filename,previous:roles.previous,current:null,instructions:selectedInstruction,entries:candidates,status:ready?'ready':'needs-review',ready,issues:localIssues,plan,assignment:{billId,date:date||'',previousId:roles.previous?.id||'',instructionsId:instruction.id}});
 }
 const instructionBills=new Set(groups.map(e=>e.billId).filter(Boolean));
 const orphanBills=new Set(entries.filter(e=>e.metadata.kind==='bill'&&e.metadata.billId&&!instructionBills.has(e.metadata.billId)).map(e=>e.metadata.billId));
 for(const billId of orphanBills){const candidates=entries.filter(e=>e.metadata.billId===billId&&e.metadata.kind==='bill');groups.push({id:'unmatched:'+billId,billId,date:null,dateLabel:'',outputFilename:'',previous:null,current:null,instructions:null,entries:candidates,status:'needs-review',ready:false,issues:[issue('INSTRUCTIONS_REQUIRED','Upload this bill’s instructional amendment PDF.')],plan:null,assignment:{billId,date:'',previousId:'',instructionsId:''}});}
 for(const entry of entries.filter(e=>e.metadata.kind==='unknown'||e.metadata.kind==='digest'||!e.metadata.billId)){
  if(entry.metadata.kind==='amendments'&&groups.some(g=>g.instructions?.id===entry.id))continue;
  if(groups.some(g=>g.entries.some(e=>e.id===entry.id)))continue;
  groups.push({id:'unclassified:'+entry.id,billId:entry.metadata.billId,date:entry.metadata.date,dateLabel:entry.metadata.dateLabel,outputFilename:'',previous:null,current:null,instructions:null,entries:[entry],status:'needs-review',ready:false,issues:entry.metadata.kind==='digest'?[issue('DIGEST_NOT_INSTRUCTION_SET','A replacement Digest is not an amendment instruction set. Remove it from this batch or correct its file classification.')]:entry.metadata.issues.length?entry.metadata.issues:[issue('CLASSIFICATION_REQUIRED','Confirm this PDF’s bill number and document type.')],plan:null,assignment:{billId:entry.metadata.billId||'',date:entry.metadata.date||'',previousId:'',instructionsId:''}});
 }
 const collisions=new Map();for(const g of groups)if(g.outputFilename){const key=g.outputFilename.toLowerCase();if(!collisions.has(key))collisions.set(key,[]);collisions.get(key).push(g);}
 for(const rows of collisions.values())if(rows.length>1)for(const group of rows){group.ready=false;group.status='needs-review';group.issues.push(issue('OUTPUT_FILENAME_COLLISION','Multiple instruction sets have the same bill and month/day output name. Remove a duplicate set or process these sets separately into different output folders.'));}
 return groups;
}
