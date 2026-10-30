import {readPdfFile,renderPdfPage,readingWarnings,confirmPdfReading} from './pdf-intake.mjs';
import {analyzeBatch,classifyEntry} from './batch.mjs';
import {buildPdfMarks,createMarkedPdf} from './pdf-markup.mjs';

const $=id=>document.getElementById(id);
const state={entries:[],groups:[],assignments:{},selectedId:null,previewEntryId:null,sourceExplicit:false,checked:new Set(),failures:[],folder:null,reading:false,exporting:false,controller:null,revision:0,previewSequence:0,page:1,marked:new Map()};
const message=error=>error instanceof Error?error.message:typeof error==='string'?error:'This operation could not be completed.';
const group=()=>state.groups.find(g=>g.id===state.selectedId)||null;
const busy=()=>state.reading||state.exporting;
const pageCount=entry=>entry?.pages?.length||Number(entry?.doc?.pages)||0;
const readyGroups=()=>state.groups.filter(g=>g.ready&&state.checked.has(g.id));
function element(tag,{text,...attrs}={},children=[]){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);for(const [key,value]of Object.entries(attrs)){if(key in node&&typeof value!=='object')node[key]=value;else if(value!==false&&value!==undefined&&value!==null)node.setAttribute(key,String(value));}node.append(...children);return node;}
function status(text){$('app-status').textContent=text;}
function labelDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return 'Amendment date needs review';const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==date)return 'Amendment date needs review';return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(d);}
function entryName(entry,fallback='Not selected'){return entry?.name||fallback;}
function issueText(issue){return typeof issue==='string'?issue:issue?.message||issue?.reason||issue?.code||'The source needs review.';}
function controls(){
  $('choose-files').disabled=busy();$('clear-batch').disabled=busy()||!state.entries.length&&!state.failures.length;$('review-files').disabled=busy()||!state.entries.length;
  const selected=readyGroups();$('create-pdfs').disabled=busy()||!selected.length;$('create-pdfs').textContent=state.exporting?'Creating PDFs…':'Create '+selected.length+' PDF'+(selected.length===1?'':'s');
  $('output-folder').disabled=busy();const ready=state.groups.filter(g=>g.ready);$('select-ready').disabled=busy()||!ready.length;$('select-ready').checked=ready.length>0&&ready.every(g=>state.checked.has(g.id));$('select-ready').indeterminate=ready.some(g=>state.checked.has(g.id))&&!$('select-ready').checked;
  for(const node of document.querySelectorAll('#assignment-form input,#assignment-form select,#assignment-form button,.file-label-form input,.file-label-form select,.file-label-form button,.reading-warning input,.reading-warning button'))node.disabled=busy();
  for(const node of document.querySelectorAll('.group-row>input')){const g=state.groups.find(g=>g.id===node.dataset.groupId);node.disabled=busy()||!g?.ready;}
}
function summary(){const ready=state.groups.filter(g=>g.ready).length,review=state.groups.length-ready;$('batch-summary').textContent=state.entries.length?`${state.entries.length} file${state.entries.length===1?'':'s'} · ${state.groups.length} batch${state.groups.length===1?'':'es'} · ${ready} ready${review?' · '+review+' need review':''}`:'No files loaded.';controls();}
function renderFailures(){const list=$('import-error-list');list.replaceChildren();for(const row of state.failures)list.append(element('li',{text:row.name+': '+row.error}));$('import-errors').hidden=!state.failures.length;}
function renderGroups(){
  const list=$('group-list');list.replaceChildren();
  if(!state.groups.length)list.append(element('p',{className:'empty-message',text:'Your bills will appear here.'}));
  for(const g of state.groups){
    const row=element('div',{className:'group-row'+(g.id===state.selectedId?' active':'')});row.dataset.groupId=g.id;row.dataset.status=g.ready?'ready':'needs-review';
    const input=element('input',{type:'checkbox',checked:g.ready&&state.checked.has(g.id),disabled:busy()||!g.ready});input.dataset.groupId=g.id;input.setAttribute('aria-label','Include '+(g.billId||'this batch')+' '+(g.dateLabel||labelDate(g.date))+' output');
    input.addEventListener('change',()=>{if(input.checked&&g.ready)state.checked.add(g.id);else state.checked.delete(g.id);$('save-results').hidden=true;controls();});
    const button=element('button',{type:'button',className:'group-select'});button.setAttribute('aria-pressed',String(g.id===state.selectedId));button.append(element('strong',{text:g.billId||g.instructions?.name||g.entries?.[0]?.name||'Unclassified files'}),element('span',{className:'group-meta',text:g.dateLabel||labelDate(g.date)}));
    const amendments=g.plan?.amendments?.length??0;button.append(element('span',{className:'group-meta',text:(g.entries?.length||0)+' file'+((g.entries?.length||0)===1?'':'s')+(amendments?' · '+amendments+' amendment'+(amendments===1?'':'s'):'' )}),element('span',{className:'group-state'+(g.ready?'':' needs-review'),text:g.ready?'✓ Ready to create':'! Needs review'}));
    button.addEventListener('click',()=>selectGroup(g.id));row.append(input,button);list.append(row);
  }
  summary();
}
function selectOptions(select,entries,selected,{optional=false,label='Select a file'}={}){select.replaceChildren(element('option',{value:'',text:optional?'None / not supplied':label}));for(const entry of entries)select.append(element('option',{value:entry.id,text:entry.name}));select.value=selected||'';}
function renderAssignment(g){const files=g.entries||[];$('assignment-bill').value=g.assignment?.billId||g.billId||'';$('assignment-date').value=g.assignment?.date||g.date||'';selectOptions($('assignment-previous'),files,g.assignment?.previousId||g.previous?.id);selectOptions($('assignment-current'),files,g.assignment?.currentId||g.current?.id,{optional:true});selectOptions($('assignment-instructions'),files,g.assignment?.instructionsId||g.instructions?.id);$('assignment-details').open=!g.ready&&(!g.previous||!g.instructions||!g.date||!g.billId);}
function renderIssues(g){const list=$('group-issue-list');list.replaceChildren();for(const issue of [...(g.issues||[]),...(g.plan?.warnings||[])]){const li=element('li',{text:issueText(issue)});const n=Number(issue?.page);if(Number.isInteger(n)&&n>0&&n<=pageCount(g.previous)){const button=element('button',{type:'button',className:'secondary',text:'Open page '+n});button.addEventListener('click',()=>{state.page=n;renderPreview();});li.append(document.createTextNode(' '),button);}list.append(li);}$('group-issues-title').textContent=g.ready?'Current-version cross-check notes':'This bill needs review';$('group-issues').hidden=!list.children.length;}
function renderAmendments(g){const list=$('amendment-list');list.replaceChildren();const rows=g.plan?.amendments||[];$('amendment-count').textContent=rows.length+' amendment'+(rows.length===1?'':'s');for(const a of rows){const row=element('div',{className:'amendment-row'}),p=element('p',{text:a.directive||a.rule?.directive||a.message||a.action||'Source amendment'});const label=element('span',{text:'Amendment '+a.number});row.append(label,p);list.append(row);}}
function sourceEntries(g){return [...new Map([g.previous,g.current,g.instructions,...(!g.previous&&!g.current&&!g.instructions?g.entries||[]:[])].filter(Boolean).map(e=>[e.id,e])).values()];}
function previewEntry(g){return sourceEntries(g).find(e=>e.id===state.previewEntryId)||g.previous||null;}
function renderSources(g){const list=$('preview-source'),sources=sourceEntries(g);list.replaceChildren();for(const entry of sources){const role=entry.id===g.previous?.id?'Previous':entry.id===g.current?.id?'Current':entry.id===g.instructions?.id?'Amendments':'Source';list.append(element('option',{value:entry.id,text:role+' · '+entry.name}));}if(!sources.some(e=>e.id===state.previewEntryId))state.previewEntryId=g.previous?.id||sources[0]?.id||null;list.value=state.previewEntryId||'';}
function renderReadings(g){const list=$('reading-review-list');list.replaceChildren();let total=0;for(const candidate of sourceEntries(g)){const entry=state.entries.find(e=>e.id===candidate.id)||candidate;const warnings=readingWarnings(entry)||[];if(!warnings.length)continue;const heading=element('h3',{text:entry.name});list.append(heading);for(const warning of warnings){total++;const form=element('form',{className:'reading-warning'}),boundEntry=entry,boundDoc=entry.doc,input=element('input',{type:'text',value:warning.text||'',required:true});const label=element('label',{text:'Page '+warning.page+' · uncertain reading'},[input]);const open=element('button',{type:'button',className:'secondary',text:'Open page '+warning.page}),confirm=element('button',{type:'submit',text:'Confirm reading'}),reason=element('p',{className:'form-note',text:warning.reason||warning.message||'Check the exact wording in the original PDF before confirming.'});open.addEventListener('click',()=>{if(!form.isConnected||state.entries.find(e=>e.id===boundEntry.id)!==boundEntry)return;state.previewEntryId=boundEntry.id;state.sourceExplicit=true;state.page=Number(warning.page)||1;$('preview-source').value=boundEntry.id;$('preview-mode').value='original';renderPreview();});form.append(label,open,confirm,reason);form.addEventListener('submit',async event=>{event.preventDefault();if(busy())return;if(!form.isConnected||state.entries.find(e=>e.id===boundEntry.id)!==boundEntry||boundEntry.doc!==boundDoc){status('This PDF reading changed. Use the current source review form.');return;}confirm.disabled=true;try{const corrected=await confirmPdfReading(boundEntry,warning,input.value);if(!form.isConnected||state.entries.find(e=>e.id===boundEntry.id)!==boundEntry||boundEntry.doc!==boundDoc){status('The loaded source changed before the confirmation finished. Nothing was applied.');return;}const at=state.entries.findIndex(e=>e.id===boundEntry.id);state.entries[at]=corrected;await rebuild();status('Reading confirmed for '+boundEntry.name+', page '+warning.page+'. All amendment locations were rechecked.');}catch(error){status('Reading could not be confirmed: '+message(error));}finally{if(form.isConnected)confirm.disabled=busy();}});list.append(form);}}
  $('reading-review').hidden=!total;$('reading-review-count').textContent='Review '+total+' uncertain PDF reading'+(total===1?'':'s');if(total)$('reading-review').open=true;
}
function renderSelected(){
  const g=group();$('empty-state').hidden=!!g;$('group-review').hidden=!g;
  if(!g){state.previewSequence++;$('preview-canvas').width=0;$('preview-canvas').height=0;$('output-filename').textContent='Amends In [Bill Number] [Amendment Date].pdf';return;}
  $('selected-bill').textContent=g.billId||'Review file labels';$('selected-date').textContent=g.dateLabel||labelDate(g.date);$('group-status').textContent=g.ready?'Ready to create':'Needs review';$('group-status').className='status-badge'+(g.ready?'':' needs-review');
  const files=$('group-files');files.replaceChildren();for(const [name,entry,fallback]of [['Previous',g.previous,'Select the original version'],['Current',g.current,'Not supplied (optional cross-check)'],['Amendments',g.instructions,'Select the amendment instructions']])files.append(element('dt',{text:name}),element('dd',{text:entryName(entry,fallback)}));
  $('output-filename').textContent=g.outputFilename||'Confirm the bill number and amendment date.';if(g.ready&&!state.sourceExplicit){state.previewEntryId=g.previous?.id;$('preview-mode').value='marked';}renderAssignment(g);renderIssues(g);renderAmendments(g);renderSources(g);renderReadings(g);
  $('preview-mode').querySelector('option[value=marked]').disabled=!g.ready||state.previewEntryId!==g.previous?.id;if(!g.ready||state.previewEntryId!==g.previous?.id)$('preview-mode').value='original';
  const pages=pageCount(previewEntry(g));state.page=Math.max(1,Math.min(state.page,pages||1));$('page-total').textContent=String(pages);$('page-number').max=String(pages||1);$('page-number').value=String(state.page);controls();renderPreview();
}
function selectGroup(id){if(state.selectedId!==id){state.selectedId=id;state.previewEntryId=null;state.sourceExplicit=false;state.page=1;$('preview-mode').value='marked';}renderGroups();renderSelected();}
async function rebuild(){
  const revision=++state.revision;state.marked.clear();const old=new Map(state.groups.map(g=>[g.id,g]));
  try{
    const result=await analyzeBatch(state.entries,state.assignments);if(revision!==state.revision)return;
    const groups=Array.isArray(result)?result:result.groups||[];
    for(const g of groups){g.issues=[...(g.issues||[])];if(g.ready){try{const marks=await buildPdfMarks({plan:g.plan,previous:g.previous});if(revision!==state.revision)return;g.marks=marks;if(!marks.ready){g.ready=false;g.status='needs-review';g.issues.push(...(marks.issues?.length?marks.issues:[{message:'The original page geometry could not be verified.'}]));}}catch(error){g.ready=false;g.status='needs-review';g.issues.push({code:'geometry-error',message:message(error)});}}
      if(g.ready&&(!old.has(g.id)||!old.get(g.id).ready))state.checked.add(g.id);if(!g.ready)state.checked.delete(g.id);
    }
    state.groups=groups;for(const id of [...state.checked])if(!groups.some(g=>g.id===id&&g.ready))state.checked.delete(id);if(!groups.some(g=>g.id===state.selectedId))state.selectedId=groups[0]?.id||null;
    renderGroups();renderSelected();
  }catch(error){if(revision!==state.revision)return;state.groups=[];state.checked.clear();state.selectedId=null;renderGroups();renderSelected();status('The batch could not be analyzed: '+message(error));}
}
async function markedBytes(g){if(!g?.ready||!g.previous||!g.marks?.ready)throw Error('This batch still has unresolved source or geometry questions.');if(state.marked.has(g.id))return state.marked.get(g.id);const revision=state.revision,bytes=await createMarkedPdf({bytes:g.previous.bytes,marks:g.marks,title:(g.outputFilename||'Amends In').replace(/\.pdf$/i,'')});if(revision!==state.revision)throw Error('The batch changed while its PDF was being prepared.');state.marked.set(g.id,bytes);return bytes;}
async function renderPreview(){
  const g=group(),sequence=++state.previewSequence,revision=state.revision,canvas=$('preview-canvas'),selectedSource=g&&previewEntry(g);
  if(!selectedSource){canvas.width=0;canvas.height=0;$('preview-status').textContent=g?'Select a source PDF to preview its original pages.':'';for(const id of ['previous-page','next-page','page-number','preview-source','preview-mode','preview-zoom'])$(id).disabled=true;return;}
  const count=pageCount(selectedSource);state.page=Math.max(1,Math.min(state.page,count||1));$('page-number').value=String(state.page);$('page-total').textContent=String(count);$('previous-page').disabled=state.page<=1;$('next-page').disabled=state.page>=count;for(const id of ['page-number','preview-source','preview-mode','preview-zoom'])$(id).disabled=false;
  const marked=$('preview-mode').value==='marked'&&g.ready&&selectedSource.id===g.previous?.id;$('preview-mode').querySelector('option[value=marked]').disabled=!g.ready||selectedSource.id!==g.previous?.id;$('preview-status').textContent=marked?'Preparing the marked previous-version PDF…':'Reading original source page…';
  try{
    const bytes=marked?await markedBytes(g):selectedSource.bytes;if(sequence!==state.previewSequence||revision!==state.revision)return;
    const entry=marked?{bytes,id:g.id+'-marked-'+revision,name:g.outputFilename}:selectedSource,temporary=document.createElement('canvas');
    let scale=Number($('preview-zoom').value);if(!scale){const p=selectedSource.pages?.[state.page-1],view=p?.view,width=view?Math.abs(view[2]-view[0]):612;const rotation=(p?.rotation||0)%180;const naturalWidth=rotation&&view?Math.abs(view[3]-view[1]):width;scale=Math.max(.25,Math.min(2.5,($('canvas-scroll').clientWidth-34)/Math.max(1,naturalWidth)));}
    await renderPdfPage(entry,state.page,temporary,{scale});if(sequence!==state.previewSequence||revision!==state.revision)return;
    canvas.width=temporary.width;canvas.height=temporary.height;canvas.getContext('2d').drawImage(temporary,0,0);canvas.setAttribute('aria-label',(marked?'Marked previous-version PDF':'Original '+selectedSource.name)+', page '+state.page);
    $('preview-status').textContent=(marked?'Amendment marks on the previous PDF':'Original '+selectedSource.name)+' · page '+state.page+(g.ready?'':' · export waits for source review');
  }catch(error){if(sequence!==state.previewSequence||revision!==state.revision)return;canvas.width=0;canvas.height=0;$('preview-status').textContent='The page could not be displayed: '+message(error);}
}
async function importFiles(files){
  if(busy()){status('Finish the current operation before adding more PDFs.');return;}
  const input=Array.from(files||[]);if(!input.length)return;
  state.reading=true;state.controller=new AbortController();$('import-progress').hidden=false;$('save-results').hidden=true;controls();let loaded=0,duplicates=0;
  try{
    for(let index=0;index<input.length;index++){
      if(state.controller.signal.aborted)break;const file=input[index];$('read-progress').max=input.length;$('read-progress').value=index;$('import-status').textContent=`${index+1} of ${input.length} · ${file.name}`;
      if(!/\.pdf$/i.test(file.name)){state.failures.push({name:file.name,error:'Choose a PDF file.'});continue;}
      try{
        const entry=await readPdfFile(file,{signal:state.controller.signal,onProgress:progress=>{$('import-status').textContent=`${index+1} of ${input.length} · ${file.name} · ${typeof progress==='string'?progress:progress?.message||'Reading PDF…'}`;}});
        if(state.controller.signal.aborted)break;
        entry.uiFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',entry.bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(state.entries.some(e=>e.id===entry.id||e.uiFingerprint===entry.uiFingerprint)){duplicates++;continue;}
        state.entries.push(entry);loaded++;await rebuild();
      }catch(error){if(state.controller.signal.aborted)break;state.failures.push({name:file.name,error:message(error)});renderFailures();}
      $('read-progress').value=index+1;
    }
    status((state.controller.signal.aborted?'Reading cancelled. ':'')+loaded+' PDF'+(loaded===1?'':'s')+' loaded'+(duplicates?'; '+duplicates+' duplicate'+(duplicates===1?'':'s')+' already in this batch':'')+'.');
  }finally{state.reading=false;state.controller=null;$('import-progress').hidden=true;$('file-input').value='';renderFailures();await rebuild();if(!$('file-labels').hidden)renderFileLabels();controls();}
}
function renderFileLabels(){const list=$('file-label-list');list.replaceChildren();for(const entry of state.entries){let meta;try{meta=classifyEntry(entry);}catch{meta=entry.metadata||{};}const form=element('form',{className:'file-label-form'}),name=element('div',{className:'file-label-name',text:entry.name});name.append(element('span',{text:entry.manualMetadata?'User-confirmed file labels':'Read from document and filename'}));
    const bill=element('input',{type:'text',value:meta.billId||'',placeholder:'AB 1982',maxLength:14}),kind=element('select'),date=element('input',{type:'date',value:meta.date||''});for(const [value,text]of [['unknown','Needs classification'],['bill','Bill version'],['amendments','Amendments'],['digest','Replacement digest']])kind.append(element('option',{value,text}));kind.value=meta.kind||'unknown';
    const field=(text,input)=>element('label',{text},[input]),actions=element('div',{className:'file-label-actions'}),remove=element('button',{type:'button',className:'secondary',text:'Remove'});remove.setAttribute('aria-label','Remove '+entry.name);remove.addEventListener('click',async()=>{if(busy())return;state.entries=state.entries.filter(e=>e.id!==entry.id);for(const [key,value]of Object.entries(state.assignments))if(key==='amendments:'+entry.id||[value.previousId,value.currentId,value.instructionsId].includes(entry.id))delete state.assignments[key];await rebuild();renderFileLabels();status('Removed '+entry.name+' from this batch. The original PDF is unchanged.');});actions.append(element('button',{type:'submit',className:'secondary',text:'Confirm labels'}),remove);form.append(name,field('Bill number',bill),field('Document type',kind),field('Document date',date),actions);
    form.addEventListener('submit',async event=>{event.preventDefault();if(busy())return;const billId=bill.value.trim().toUpperCase().replace(/^(AB|SB)\s*(\d+)$/,'$1 $2');if(billId&&!/^(AB|SB) [1-9]\d{0,4}$/.test(billId)){status('Use a bill number such as AB 1982 or SB 879.');bill.focus();return;}entry.manualMetadata={billId,kind:kind.value,date:date.value||null};state.assignments={};await rebuild();renderFileLabels();status('File labels confirmed for '+entry.name+'.');});list.append(form);
  }controls();}
async function chooseFolder(){if(!window.amendsIn?.chooseOutputFolder){status('Open Amends In Maker as the desktop application to choose an output folder.');return null;}try{const folder=await window.amendsIn.chooseOutputFolder();if(folder){state.folder=typeof folder==='string'?folder:folder.path;$('output-folder-name').textContent=state.folder||'Choose a folder when ready.';}return state.folder;}catch(error){status('The output folder could not be selected: '+message(error));return null;}}
async function savePdfs(){
  if(busy())return;const groups=readyGroups();if(!groups.length){status('Select a ready bill first.');return;}if(!window.amendsIn?.saveBatch){status('Open Amends In Maker as the desktop application to create PDFs.');return;}
  const folder=state.folder||await chooseFolder();if(!folder)return;state.exporting=true;controls();$('save-results').hidden=true;
  try{
    const files=[];for(let index=0;index<groups.length;index++){const g=groups[index];status(`Preparing ${index+1} of ${groups.length}: ${g.outputFilename}`);files.push({name:g.outputFilename,bytes:await markedBytes(g)});}
    status('Saving '+files.length+' marked PDF'+(files.length===1?'':'s')+'…');const result=await window.amendsIn.saveBatch({folder,files});if(result?.error)throw Error(result.error);const saved=result?.saved||[],skipped=result?.skipped||[],errors=result?.errors||[];const list=$('save-result-list');list.replaceChildren();for(const [rows,prefix,cls]of [[saved,'Created: ','save-ok'],[skipped,'Skipped: ',''],[errors,'Could not create: ','save-failed']])for(const item of rows){const text=typeof item==='string'?item:item.name||item.path||item.filename||'PDF';list.append(element('li',{className:cls,text:prefix+text+(item?.error?' · '+item.error:item?.reason?' · '+item.reason:'')}));}
    $('save-results').hidden=false;status(`${saved.length} PDF${saved.length===1?'':'s'} created${skipped.length?', '+skipped.length+' skipped':''}${errors.length?', '+errors.length+' failed':''}. Existing files are never overwritten.`);
  }catch(error){status('PDF creation could not be completed: '+message(error));}finally{state.exporting=false;controls();}
}
$('choose-files').addEventListener('click',()=>$('file-input').click());$('file-input').addEventListener('change',event=>importFiles(event.target.files));
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();if(!busy())$('drop-zone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');});
$('drop-zone').addEventListener('drop',event=>importFiles(event.dataTransfer.files));document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>event.preventDefault());
$('cancel-import').addEventListener('click',()=>{state.controller?.abort();$('import-status').textContent='Cancelling PDF reading…';});
$('clear-batch').addEventListener('click',()=>{if(busy())return;state.revision++;state.previewSequence++;state.entries=[];state.groups=[];state.assignments={};state.selectedId=null;state.previewEntryId=null;state.sourceExplicit=false;state.checked.clear();state.failures=[];state.marked.clear();$('file-labels').hidden=true;$('save-results').hidden=true;renderFailures();renderGroups();renderSelected();status('Batch cleared. Original and created PDFs remain unchanged.');});
$('review-files').addEventListener('click',()=>{$('file-labels').hidden=!$('file-labels').hidden;if(!$('file-labels').hidden)renderFileLabels();});$('close-file-labels').addEventListener('click',()=>{$('file-labels').hidden=true;});
$('assignment-form').addEventListener('submit',async event=>{event.preventDefault();if(busy())return;const g=group();if(!g)return;state.assignments[g.id]={previousId:$('assignment-previous').value,currentId:$('assignment-current').value,instructionsId:$('assignment-instructions').value,date:$('assignment-date').value,billId:$('assignment-bill').value.trim()};await rebuild();status('File pairing updated. Every target and page location has been rechecked.');});
$('select-ready').addEventListener('change',()=>{for(const g of state.groups)if(g.ready){if($('select-ready').checked)state.checked.add(g.id);else state.checked.delete(g.id);}renderGroups();});
$('previous-page').addEventListener('click',()=>{state.page--;renderPreview();});$('next-page').addEventListener('click',()=>{state.page++;renderPreview();});$('page-form').addEventListener('submit',event=>{event.preventDefault();state.page=Number($('page-number').value)||1;renderPreview();});$('preview-mode').addEventListener('change',()=>{state.sourceExplicit=true;renderPreview();});$('preview-zoom').addEventListener('change',renderPreview);
$('preview-source').addEventListener('change',()=>{state.previewEntryId=$('preview-source').value;state.sourceExplicit=true;state.page=1;const g=group();$('preview-mode').value=g?.ready&&state.previewEntryId===g.previous?.id?'marked':'original';renderPreview();});
$('output-folder').addEventListener('click',chooseFolder);$('create-pdfs').addEventListener('click',savePdfs);
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(group()&&$('preview-zoom').value==='fit')renderPreview();},180);});
summary();renderSelected();


