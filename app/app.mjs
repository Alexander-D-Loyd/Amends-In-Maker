import {readPdfBytes,readPdfFile,renderPdfPage,readingWarnings,confirmPdfReading} from './pdf-intake.mjs';
import {analyzeBatch,classifyEntry} from './batch.mjs';
import {createMarkedPdf} from './pdf-markup.mjs';
import {instructionLocation} from './amendment-issues.mjs';
import {prepareOutput,outputAttemptKey} from './output-workflow.mjs';
import {createPdfReviewViewer} from './pdf-review-viewer.mjs';

const $=id=>document.getElementById(id);
const state={entries:[],groups:[],assignments:{},failures:[],folder:null,reading:false,exporting:false,choosing:false,booting:true,controller:null,revision:0,results:new Map(),runtimeIssues:new Map(),marked:new Map(),issueIndex:0,issuePage:1,issueSequence:0,previewGroup:null,previewPage:1,previewSequence:0};
const message=e=>e instanceof Error?e.message:typeof e==='string'?e:'This operation could not be completed.';
const issueText=i=>typeof i==='string'?i:i?.message||i?.reason||i?.code||'This source needs review.';
const busy=()=>state.booting||state.reading||state.exporting||state.choosing;
const pageCount=e=>e?.metadata?.sourcePageCount||e?.doc?.sourcePages||e?.pages?.length||0;
const status=text=>{$('app-status').textContent=text;};
let issueViewer=null,previewViewer=null;
function element(tag,{text,...attrs}={},children=[]){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);for(const[k,v]of Object.entries(attrs)){if(k in n&&typeof v!=='object')n[k]=v;else if(v!==undefined&&v!==null&&v!==false)n.setAttribute(k,String(v));}n.append(...children);return n;}
const key=g=>outputAttemptKey(g,state.folder);
const resultFor=g=>{const r=state.results.get(g.id);return r?.key===key(g)?r:null;};
function controls(){for(const id of ['choose-files','output-folder','review-files','retry-output','clear-batch'])$(id).disabled=busy();$('retry-output').disabled=busy()||!state.groups.some(g=>g.output.exportable&&!resultFor(g));for(const n of document.querySelectorAll('.pairing-form input,.pairing-form select,.pairing-form button,.file-label-form input,.file-label-form select,.file-label-form button,.reading-warning input,.reading-warning button'))n.disabled=busy();$('output-folder').textContent=state.folder?'Change folder':'Choose folder';}
function updateFolder(){ $('output-folder-name').textContent=state.folder||'Choose a folder when you add your first batch.';controls(); }
function queue(){const items=[];for(const g of state.groups){const seen=new Set();for(const i of [...g.output.issues,...(state.runtimeIssues.get(g.id)||[])]){const issue=typeof i==='string'?{message:i}:i,signature=JSON.stringify([issue.code,issue.number,issue.entryId,issueText(issue)]);if(seen.has(signature))continue;seen.add(signature);items.push({group:g,issue});}}for(const failure of state.failures)items.push({group:null,issue:{code:'PDF_LOAD_FAILED',message:failure.name+': '+failure.error},failure});return items;}
function render(){
  $('batch-results').hidden=!state.entries.length&&!state.failures.length;
  $('empty-results').hidden=!$('batch-results').hidden;
  const results=new Map(state.groups.map(g=>[g.id,resultFor(g)])),created=[...results.values()].filter(r=>r?.kind==='saved').length,skipped=[...results.values()].filter(r=>r?.kind==='skipped').length;
  $('batch-summary').textContent=created+' PDF'+(created===1?'':'s')+' created'+(skipped?' · '+skipped+' existing file'+(skipped===1?'':'s')+' skipped':'');
  const items=queue();
  $('attention-notice').hidden=!items.length;$('attention-title').textContent=items.length+' issue'+(items.length===1?' needs':'s need')+' attention';
  const list=$('group-list');list.replaceChildren();
  for(const g of state.groups){
    const result=results.get(g.id);if(!result)continue;
    const row=element('li',{className:'group-card'});row.dataset.groupId=g.id;row.dataset.status=result.kind;row.dataset.markedCount=String(g.output.markedCount);row.dataset.totalCount=String(g.output.totalCount);row.dataset.unmarkedCount=String(g.output.unmarkedCount);
    const identity=element('div',{className:'batch-identity'},[element('strong',{text:g.billId||'Unmatched file'}),element('time',{text:g.dateLabel||'Date unavailable',dateTime:g.date||''})]);
    const view=element('button',{type:'button',className:'secondary view-pdf',text:'View PDF'});view.addEventListener('click',()=>openPreview(g));
    row.append(element('div',{className:'batch-row-content'},[identity,element('div',{className:'card-actions'},[view])]));list.append(row);
  }
  const failures=$('import-error-list');failures.replaceChildren();for(const f of state.failures)failures.append(element('li',{text:f.name+': '+f.error}));$('import-errors').hidden=!state.failures.length;controls();
}
function pairingForm(g){
  const form=element('form',{className:'pairing-form'}),bill=element('input',{type:'text',value:g.billId||'',placeholder:'AB 1982',required:true}),date=element('input',{type:'date',value:g.date||'',required:true}),previous=element('select');
  previous.append(element('option',{value:'',text:'Select the bill PDF to mark'}));for(const e of g.entries||[])if(e.id!==g.instructions?.id)previous.append(element('option',{value:e.id,text:e.name}));previous.value=g.previous?.id||'';
  const field=(text,input,wide=false)=>element('label',{text,className:wide?'wide':''},[input]);form.append(field('Bill number',bill),field('Amendment date',date),field('Bill PDF to mark',previous,true),element('button',{type:'submit',text:'Apply and retry'}));
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy()||!form.isConnected)return;state.assignments[g.id]={billId:bill.value.trim(),date:date.value,previousId:previous.value};rebuild();await processOutputs();});return form;
}
function rebuild(){state.revision++;state.marked.clear();state.runtimeIssues.clear();state.groups=analyzeBatch(state.entries,state.assignments).map(g=>({...g,output:prepareOutput(g)}));render();}
async function markedBytes(g){const cacheKey=outputAttemptKey(g,'');if(state.marked.has(cacheKey))return state.marked.get(cacheKey);if(!g.output.exportable)throw Error('This bill has no safely located amendment marks.');const revision=state.revision,bytes=await createMarkedPdf({bytes:g.previous.bytes,marks:g.output.marks,title:g.outputFilename.replace(/\.pdf$/i,'')});if(revision!==state.revision)throw Error('The uploaded files changed while creating this PDF.');state.marked.set(cacheKey,bytes);return bytes;}
async function chooseFolder(){
  if(!window.amendsIn?.chooseOutputFolder){status('Open the Windows application to choose an output folder.');return null;}
  state.choosing=true;controls();try{const folder=await window.amendsIn.chooseOutputFolder();if(!folder)return null;state.folder=typeof folder==='string'?folder:folder.path;updateFolder();return state.folder;}catch(e){status('The output folder could not be selected: '+message(e));return null;}finally{state.choosing=false;controls();}
}
async function processOutputs({notify=true}={}){
  await initialized;if(busy())return;
  const pending=state.groups.filter(g=>g.output.exportable&&!resultFor(g));
  if(pending.length){
    const folder=state.folder||await chooseFolder();if(!folder){status('No PDFs were saved. Choose an output folder to continue.');render();if(notify&&queue().length)openIssue(0);return;}
    state.exporting=true;for(const g of pending)state.runtimeIssues.delete(g.id);controls();
    try{
      const files=[],byName=new Map();
      for(const g of pending){try{status('Creating '+g.outputFilename+'…');files.push({name:g.outputFilename,bytes:await markedBytes(g)});byName.set(g.outputFilename,g);}catch(e){state.runtimeIssues.set(g.id,[{code:'PDF_CREATION_FAILED',message:message(e)}]);}}
      if(files.length){const result=await window.amendsIn.saveBatch({folder,files});if(result?.error)throw Error(result.error);
        for(const [rows,kind]of [[result.saved||[],'saved'],[result.skipped||[],'skipped']])for(const item of rows){const g=byName.get(item.name);if(g){state.runtimeIssues.delete(g.id);state.results.set(g.id,{...item,kind,key:key(g)});}}
        for(const item of result.errors||[]){const g=byName.get(item.name);if(g)state.runtimeIssues.set(g.id,[{code:'PDF_SAVE_FAILED',message:item.message||item.error||'The PDF could not be saved. Choose a writable output folder and retry.'}]);}
      }
    }catch(e){for(const g of pending)if(!resultFor(g))state.runtimeIssues.set(g.id,[{code:'OUTPUT_FOLDER_ERROR',message:message(e)}]);status('PDFs could not be saved: '+message(e)+' Change the output folder or retry.');}
    finally{state.exporting=false;render();}
  }
  const created=state.groups.filter(g=>resultFor(g)?.kind==='saved').length,skipped=state.groups.filter(g=>resultFor(g)?.kind==='skipped').length,issues=queue();
  status(`${created} PDF${created===1?'':'s'} created${skipped?', '+skipped+' existing PDF'+(skipped===1?'':'s')+' skipped':''}.${issues.length?' '+issues.length+' issue'+(issues.length===1?' needs':'s need')+' attention.':' Your batch is complete.'}`);
  render();if(notify&&issues.length)openIssue(0);
}
async function importFiles(files){
  await initialized;if(busy()){status('Wait for the current files to finish before adding more.');return;}const input=Array.from(files||[]);if(!input.length)return;
  $('issue-dialog').close();state.reading=true;state.controller=new AbortController();$('import-progress').hidden=false;controls();let loaded=0,duplicates=0;
  try{for(let i=0;i<input.length;i++){
    if(state.controller.signal.aborted)break;const file=input[i];$('read-progress').max=input.length;$('read-progress').value=i;
    try{$('import-status').textContent=`${i+1} of ${input.length} · ${file.name} · Checking PDF…`;const preparedBytes=await readPdfBytes(file,{signal:state.controller.signal}),fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',preparedBytes)),b=>b.toString(16).padStart(2,'0')).join('');if(state.controller.signal.aborted)break;
      if(state.entries.some(e=>e.uiFingerprint===fingerprint)){duplicates++;continue;}
      const entry=await readPdfFile(file,{preparedBytes,signal:state.controller.signal,onProgress:p=>{$('import-status').textContent=`${i+1} of ${input.length} · ${file.name} · ${p.message||'Reading PDF…'}`;}});if(state.controller.signal.aborted)break;
      entry.uiFingerprint=fingerprint;state.entries.push(entry);state.failures=state.failures.filter(f=>f.name!==file.name);loaded++;
    }catch(e){if(state.controller.signal.aborted)break;state.failures.push({name:file.name,error:message(e)});}
    $('read-progress').value=i+1;
  }}finally{const cancelled=state.controller.signal.aborted;state.reading=false;state.controller=null;$('import-progress').hidden=true;$('file-input').value='';rebuild();if(!$('file-labels').hidden)renderFileLabels();status(`${loaded} PDFs loaded${duplicates?'; '+duplicates+' duplicates skipped':''}.${cancelled?' Remaining files cancelled.':''}`);if(!cancelled)await processOutputs();controls();}
}
function renderFileLabels(){const list=$('file-label-list');list.replaceChildren();for(const entry of state.entries){const meta=classifyEntry(entry),form=element('form',{className:'file-label-form'}),bill=element('input',{type:'text',value:meta.billId||'',placeholder:'AB 1982'}),kind=element('select'),date=element('input',{type:'date',value:meta.date||''});
  for(const[value,text]of [['bill','Bill PDF to mark'],['amendments','Amendment instructions'],['unknown','Unclassified']])kind.append(element('option',{value,text}));kind.value=meta.kind==='digest'?'unknown':meta.kind||'unknown';
  const field=(text,input)=>element('label',{text},[input]),remove=element('button',{type:'button',className:'secondary',text:'Remove'}),save=element('button',{type:'submit',className:'secondary',text:'Apply'});form.append(element('div',{className:'file-label-name',text:entry.name}),field('Bill number',bill),field('File type',kind),field('Amendment / bill date',date),element('div',{className:'file-label-actions'},[save,remove]));
  remove.addEventListener('click',async()=>{if(busy())return;state.entries=state.entries.filter(e=>e!==entry);state.assignments={};rebuild();renderFileLabels();await processOutputs();});
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy()||!form.isConnected)return;entry.manualMetadata={billId:bill.value.trim(),kind:kind.value,...(date.value?{date:date.value}:{})};state.assignments={};rebuild();renderFileLabels();await processOutputs();});list.append(form);
}for(const g of state.groups)if(g.instructions){const details=element('details',{className:'file-pairing-review'});details.append(element('summary',{text:(g.billId||'Unmatched bill')+' · '+(g.dateLabel||'Review amendment date')}),pairingForm(g));list.append(details);}controls();}
function sourceFor(item){const g=item.group,i=item.issue;return state.entries.find(e=>e.id===i.entryId)||(i.source==='previous'?g?.previous:g?.instructions)||g?.instructions||g?.previous||g?.entries?.[0]||null;}
function locationFor(item,entry){return item.group?.instructions?.id===entry?.id&&item.issue.number?instructionLocation(entry,item.issue.number):null;}
function openIssue(index=0){const items=queue();if(!items.length)return;state.issueIndex=Math.max(0,Math.min(index,items.length-1));const item=items[state.issueIndex],entry=sourceFor(item),location=locationFor(item,entry);state.issuePage=location?.page||item.issue.instructionPage||(item.issue.warning?item.issue.page:1)||1;if(!$('issue-dialog').open)$('issue-dialog').showModal();renderIssue();}
function renderReading(item,entry){const list=$('issue-reading');list.replaceChildren();if(!entry||!item.issue.warning)return;const source=state.entries.find(e=>e.id===entry.id);if(!source)return;const warning=readingWarnings(source).find(w=>w.page===item.issue.page&&w.start===item.issue.warning.start&&w.end===item.issue.warning.end);if(!warning)return;
  const form=element('form',{className:'reading-warning'}),bound=source,boundDoc=source.doc,input=element('input',{type:'text',value:warning.text||'',required:true}),confirm=element('button',{type:'submit',text:'Confirm and retry'});form.append(element('label',{text:'Check this reading against the original PDF'},[input]),confirm,element('p',{text:'Confirm unchanged wording or correct it with the same character count. Larger corrections need a readable replacement PDF.'}));
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy())return;if(!form.isConnected||state.entries.find(e=>e.id===bound.id)!==bound||bound.doc!==boundDoc){status('This source review has changed. Open its latest issue.');return;}try{const corrected=await confirmPdfReading(bound,warning,input.value);if(!form.isConnected||state.entries.find(e=>e.id===bound.id)!==bound)return;state.entries[state.entries.indexOf(bound)]=corrected;$('issue-dialog').close();rebuild();await processOutputs();}catch(error){$('issue-reason').textContent=message(error);}});list.append(form);controls();
}
function transformRect(rect,m){const points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
async function renderIssue(){
  const items=queue(),item=items[state.issueIndex];if(!item||!$('issue-dialog').open)return;issueViewer?.destroy();issueViewer=null;const entry=sourceFor(item),location=locationFor(item,entry),sequence=++state.issueSequence,canvas=$('issue-canvas');
  $('issue-title').textContent=item.issue.number?'Amendment '+item.issue.number+' could not be marked':'Files need attention';$('issue-bill').textContent=item.group?.billId||'Uploaded files';$('issue-reason').textContent=issueText(item.issue);$('issue-source').textContent=entry?'Original source: '+entry.name:'The required PDF has not been supplied.';$('issue-position').textContent=(state.issueIndex+1)+' of '+items.length;$('previous-issue').disabled=state.issueIndex===0;$('next-issue').disabled=state.issueIndex===items.length-1;renderReading(item,entry);
  canvas.width=0;canvas.height=0;canvas.dataset.highlightCount='0';$('issue-highlight-note').textContent='';$('issue-pdf-status').textContent='';
  const count=pageCount(entry),input=$('issue-page-input');input.setCustomValidity('');input.disabled=!entry||!count;$('issue-page-go').disabled=input.disabled;input.max=String(count||1);input.value=String(state.issuePage);$('issue-page-total').textContent='of '+count;
  if(!entry||!count){$('issue-page-label').textContent='No source PDF available';$('issue-previous-page').disabled=true;$('issue-next-page').disabled=true;$('issue-pdf-status').textContent='Add the missing PDF, then the batch will be matched and processed again.';return;}
  const geometries=new Map((entry.pages||[]).map(p=>[p.page,p])),active=()=>sequence===state.issueSequence&&$('issue-dialog').open;
  try{issueViewer=createPdfReviewViewer({container:$('issue-pdf-scroll'),count,initialPage:state.issuePage,
   pageSize:number=>{const page=geometries.get(number)||entry.pages?.[0],view=page?.view||[0,0,612,792],width=Math.abs(view[2]-view[0]),height=Math.abs(view[3]-view[1]);return page?.rotation%180?{width:height,height:width}:{width,height};},
   onPageChange:number=>{if(!active())return;state.issuePage=number;$('issue-page-label').textContent='Page '+number+' of '+count;if(document.activeElement!==input)input.value=String(number);$('issue-previous-page').disabled=number<=1;$('issue-next-page').disabled=number>=count;$('issue-highlight-note').textContent=(location?.rects||[]).some(r=>r.page===number)?'Yellow = instruction needing attention':location?'The highlighted instruction is on page '+location.pages.join(', ')+'.':'This issue applies to the file as a whole.';},
   onStatus:text=>{if(active())$('issue-pdf-status').textContent=text;},
   renderPage:async(number,temporary,options)=>{const rendered=await renderPdfPage(entry,number,temporary,options),rectangles=(location?.rects||[]).filter(r=>r.page===number),ctx=temporary.getContext('2d'),boxes=[];
    if(rendered.transform)for(const rect of rectangles){const b=transformRect(rect,rendered.transform);boxes.push(b);ctx.fillStyle='rgba(255,210,35,0.32)';ctx.fillRect(b.x,b.y,b.width,b.height);ctx.strokeStyle='rgba(177,112,0,0.9)';ctx.lineWidth=1;ctx.strokeRect(b.x,b.y,b.width,b.height);}
    temporary.dataset.highlightCount=String(boxes.length);temporary.dataset.amendmentNumber=item.issue.number||'';temporary.dataset.page=String(number);
    return {boxes,label:'Original '+entry.name+', page '+number+(boxes.length?', amendment '+item.issue.number+' highlighted':''),message:boxes.length?'Showing the original amendment instruction. The yellow highlight is for review only.':'Showing the original source PDF.'};}
  });}catch(e){if(active())$('issue-pdf-status').textContent='This PDF page could not be displayed: '+message(e);}
}
function jumpIssuePage(value){const item=queue()[state.issueIndex];if(!issueViewer||!item||!$('issue-dialog').open)return;const input=$('issue-page-input'),count=pageCount(sourceFor(item)),text=String(value).trim(),number=/^\d+$/.test(text)?Number(text):NaN;if(!Number.isSafeInteger(number)||number<1||number>count){const problem='Choose a whole page number from 1 to '+count+'.';input.setCustomValidity(problem);input.reportValidity();$('issue-pdf-status').textContent=problem;return;}input.setCustomValidity('');if(issueViewer.goToPage(number))input.value=String(number);}
async function openPreview(g){state.previewGroup=g;state.previewPage=1;$('preview-title').textContent=g.outputFilename;if(!$('preview-dialog').open)$('preview-dialog').showModal();await renderPreview();}
async function renderPreview(){
 const g=state.previewGroup,sequence=++state.previewSequence;previewViewer?.destroy();previewViewer=null;if(!g||!$('preview-dialog').open)return;
 const count=pageCount(g.previous),input=$('preview-page-input'),active=()=>sequence===state.previewSequence&&$('preview-dialog').open;
 state.previewPage=Math.max(1,Math.min(count,state.previewPage));input.value=String(state.previewPage);input.max=String(count||1);input.setCustomValidity('');input.disabled=true;$('preview-page-go').disabled=true;$('preview-page-total').textContent='of '+count;$('preview-status').textContent='Loading marked PDF…';
 try{const bytes=await markedBytes(g);if(!active())return;const geometries=new Map((g.previous.pages||[]).map(p=>[p.page,p])),saved=resultFor(g),note=saved?.kind==='saved'?'These are the same PDF bytes saved to your output folder.':saved?.kind==='skipped'?'Preview only. The existing PDF was skipped and has not been updated.':'Preview only. This PDF has not been saved yet.',description=note+(g.output.partial?' '+g.output.unmarkedCount+' amendments could not be marked. Open Review issues to see their original instructions.':'');
  input.disabled=false;$('preview-page-go').disabled=false;
  previewViewer=createPdfReviewViewer({container:$('preview-scroll'),count,initialPage:state.previewPage,canvasId:'preview-canvas',documentLabel:'Marked PDF',canvasLabel:'Marked output PDF',
   pageSize:number=>{const page=geometries.get(number)||g.previous.pages?.[0],view=page?.view||[0,0,612,792],width=Math.abs(view[2]-view[0]),height=Math.abs(view[3]-view[1]);return page?.rotation%180?{width:height,height:width}:{width,height};},
   onPageChange:number=>{if(!active())return;state.previewPage=number;$('preview-page-label').textContent='Page '+number+' of '+count;if(document.activeElement!==input)input.value=String(number);$('preview-previous').disabled=number<=1;$('preview-next').disabled=number>=count;},
   onStatus:text=>{if(active())$('preview-status').textContent=text;},
   renderPage:async(number,canvas,options)=>{await renderPdfPage({bytes},number,canvas,options);return {label:g.outputFilename+', page '+number,message:description};}
  });
 }catch(e){if(active())$('preview-status').textContent=message(e);}
}
function jumpPreviewPage(value){if(!previewViewer||!state.previewGroup||!$('preview-dialog').open)return;const input=$('preview-page-input'),count=pageCount(state.previewGroup.previous),text=String(value).trim(),number=/^\d+$/.test(text)?Number(text):NaN;if(!Number.isSafeInteger(number)||number<1||number>count){const problem='Choose a whole page number from 1 to '+count+'.';input.setCustomValidity(problem);input.reportValidity();$('preview-status').textContent=problem;return;}input.setCustomValidity('');if(previewViewer.goToPage(number))input.value=String(number);}


$('choose-files').addEventListener('click',()=>$('file-input').click());$('file-input').addEventListener('change',e=>importFiles(e.target.files));
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();if(!busy())$('drop-zone').classList.add('dragging');});for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');});$('drop-zone').addEventListener('drop',e=>importFiles(e.dataTransfer.files));document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('output-folder').addEventListener('click',async()=>{if(busy())return;if(await chooseFolder())await processOutputs({notify:false});});$('retry-output').addEventListener('click',()=>processOutputs());$('cancel-import').addEventListener('click',()=>state.controller?.abort());
$('clear-batch').addEventListener('click',()=>{if(busy())return;state.revision++;state.issueSequence++;state.previewSequence++;state.entries=[];state.groups=[];state.failures=[];state.assignments={};state.results.clear();state.runtimeIssues.clear();state.marked.clear();state.previewGroup=null;state.previewPage=1;state.issueIndex=0;state.issuePage=1;$('file-input').value='';$('file-label-list').replaceChildren();$('issue-reading').replaceChildren();for(const id of ['preview-canvas','issue-canvas']){$(id).width=0;$(id).height=0;}$('file-labels').hidden=true;$('issue-dialog').close();$('preview-dialog').close();render();status('Cache cleared. Ready for new files.');});
$('review-files').addEventListener('click',()=>{$('file-labels').hidden=!$('file-labels').hidden;if(!$('file-labels').hidden)renderFileLabels();});$('close-file-labels').addEventListener('click',()=>{$('file-labels').hidden=true;});$('review-issues').addEventListener('click',()=>openIssue(0));$('close-issue').addEventListener('click',()=>$('issue-dialog').close());$('issue-dialog').addEventListener('close',()=>{if(!$('issue-dialog').open){state.issueSequence++;issueViewer?.destroy();issueViewer=null;}});
$('previous-issue').addEventListener('click',()=>openIssue(state.issueIndex-1));$('next-issue').addEventListener('click',()=>openIssue(state.issueIndex+1));$('issue-previous-page').addEventListener('click',()=>jumpIssuePage(state.issuePage-1));$('issue-next-page').addEventListener('click',()=>jumpIssuePage(state.issuePage+1));$('issue-add-files').addEventListener('click',()=>{$('issue-dialog').close();$('file-input').click();});
$('issue-page-form').addEventListener('submit',event=>{event.preventDefault();if(!$('issue-page-input').disabled)jumpIssuePage($('issue-page-input').value);});$('issue-page-input').addEventListener('input',()=>$('issue-page-input').setCustomValidity(''));
$('close-preview').addEventListener('click',()=>$('preview-dialog').close());$('preview-dialog').addEventListener('close',()=>{if(!$('preview-dialog').open){state.previewSequence++;previewViewer?.destroy();previewViewer=null;}});$('preview-previous').addEventListener('click',()=>{jumpPreviewPage(state.previewPage-1);});$('preview-next').addEventListener('click',()=>{jumpPreviewPage(state.previewPage+1);});
$('preview-page-form').addEventListener('submit',event=>{event.preventDefault();if(!$('preview-page-input').disabled)jumpPreviewPage($('preview-page-input').value);});$('preview-page-input').addEventListener('input',()=>$('preview-page-input').setCustomValidity(''));
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if($('issue-dialog').open)renderIssue();if($('preview-dialog').open)renderPreview();},180);});
const initialized=(async()=>{try{const folder=await window.amendsIn?.getOutputFolder?.();state.folder=typeof folder==='string'?folder:folder?.path||null;}catch(e){status('Choose an output folder to continue: '+message(e));}finally{state.booting=false;updateFolder();render();}})();
