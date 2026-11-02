/** Continuous original-PDF review, with at most five resident page canvases. */
export function createPdfReviewViewer({container,count,initialPage=1,pageSize,renderPage,onPageChange,onStatus,canvasId='issue-canvas'}){
 if(!Number.isSafeInteger(count)||count<1)throw Error('The original PDF has no available pages.');
 const rows=[],controller=new AbortController();let current=0,disposed=false,running=false,scrollFrame=0;
 const blankCanvas=()=>{const canvas=document.createElement('canvas');canvas.id=canvasId;canvas.width=0;canvas.height=0;canvas.setAttribute('aria-label','Original amendment PDF with the issue highlighted');return canvas;};
 const fragment=document.createDocumentFragment();
 for(let n=1;n<=count;n++){
  const size=pageSize(n),width=Number.isFinite(size?.width)&&size.width>0?size.width:612,height=Number.isFinite(size?.height)&&size.height>0?size.height:792;
  const scale=Math.max(.6,Math.min(1.8,(container.clientWidth-28)/width));
  const element=document.createElement('section');element.className='pdf-review-page';element.dataset.pdfPage=String(n);element.setAttribute('aria-label','Original PDF page '+n);
  const label=document.createElement('p');label.className='pdf-review-page-label';label.textContent='Page '+n;
  const surface=document.createElement('div');surface.className='pdf-review-surface';surface.style.width=Math.ceil(width*scale)+'px';surface.style.height=Math.ceil(height*scale)+'px';
  const canvas=document.createElement('canvas');canvas.width=0;canvas.height=0;canvas.hidden=true;canvas.dataset.page=String(n);canvas.dataset.highlightCount='0';canvas.setAttribute('aria-label','Original PDF page '+n);
  const note=document.createElement('p');note.className='pdf-review-loading';note.textContent='Page '+n;
  surface.append(canvas,note);element.append(label,surface);fragment.append(element);rows.push({n,element,surface,canvas,note,scale,status:'idle',message:'',highlight:false,boxes:[]});
 }
 container.replaceChildren(fragment);container.scrollTop=0;
 const status=row=>onStatus?.(row.status==='ready'?row.message:row.status==='error'?row.message:'Loading page '+row.n+' of '+count+'…');
 function activate(n){
  if(disposed||n===current)return;
  if(current)rows[current-1].canvas.removeAttribute('id');current=n;rows[n-1].canvas.id=canvasId;
  onPageChange?.(n,count);status(rows[n-1]);
 }
 function evict(){for(const row of rows)if(Math.abs(row.n-current)>2&&row.status==='ready'){
  row.canvas.width=0;row.canvas.height=0;row.canvas.hidden=true;row.canvas.dataset.highlightCount='0';row.note.hidden=false;row.note.textContent='Page '+row.n;row.status='idle';row.boxes=[];
 }}
 function revealHighlight(row){
  if(!row.highlight||row.n!==current)return;row.highlight=false;
  if(row.boxes.length)container.scrollTop+=row.surface.getBoundingClientRect().top-container.getBoundingClientRect().top+Math.max(0,row.boxes[0].y-65);
 }
 async function drain(){
  if(running||disposed)return;running=true;
  try{while(!disposed){
   evict();const wanted=[current,current-1,current+1].filter(n=>n>0&&n<=count),row=wanted.map(n=>rows[n-1]).find(r=>r.status==='idle');if(!row)break;
   row.status='loading';row.note.textContent='Loading page '+row.n+'…';const temporary=document.createElement('canvas');
   try{
    const renderer=renderPage,result=await renderer(row.n,temporary,{scale:row.scale,signal:controller.signal});
    if(disposed)break;
    if(Math.abs(row.n-current)>2){row.status='idle';continue;}
    const priorHeight=row.surface.offsetHeight,above=row.element.offsetTop+row.element.offsetHeight<container.scrollTop;
    row.surface.style.width=temporary.width+'px';row.surface.style.height=temporary.height+'px';
    if(above)container.scrollTop+=row.surface.offsetHeight-priorHeight;
    row.canvas.width=temporary.width;row.canvas.height=temporary.height;row.canvas.getContext('2d',{alpha:false}).drawImage(temporary,0,0);
    for(const [name,value]of Object.entries(temporary.dataset))row.canvas.dataset[name]=value;
    row.canvas.dataset.page=String(row.n);row.canvas.hidden=false;row.note.hidden=true;row.status='ready';row.message=result?.message||'Showing original PDF page '+row.n+'.';row.boxes=result?.boxes||[];
    if(result?.label)row.canvas.setAttribute('aria-label',result.label);
    if(row.n===current){revealHighlight(row);status(row);}
   }catch(error){if(!disposed){row.status='error';row.message='This PDF page could not be displayed: '+(error?.message||String(error));row.note.textContent=row.message;if(row.n===current)status(row);}}
   finally{temporary.width=0;temporary.height=0;}
  }}finally{running=false;}
 }
 function goToPage(n,{highlight=false}={}){
  if(disposed||!Number.isSafeInteger(n)||n<1||n>count)return false;
  activate(n);const row=rows[n-1];row.highlight=highlight;
  container.scrollTop=Math.max(0,row.element.offsetTop-12);
  if(row.status==='ready')revealHighlight(row);status(row);drain();return true;
 }
 function scrolled(){
  if(disposed||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{
   scrollFrame=0;if(disposed)return;
   let n=count;
   if(container.scrollTop+container.clientHeight<container.scrollHeight-2){
    const at=container.scrollTop+20;let low=0,high=rows.length-1;
    while(low<high){const mid=(low+high)>>1;if(rows[mid].element.offsetTop+rows[mid].element.offsetHeight>at)high=mid;else low=mid+1;}n=low+1;
   }
   activate(n);drain();
  });
 }
 container.addEventListener('scroll',scrolled,{passive:true});
 goToPage(Math.max(1,Math.min(count,initialPage)),{highlight:true});
 return {goToPage,get currentPage(){return current;},destroy(){
  if(disposed)return;disposed=true;controller.abort();if(scrollFrame)cancelAnimationFrame(scrollFrame);container.removeEventListener('scroll',scrolled);
  for(const row of rows){row.canvas.width=0;row.canvas.height=0;row.boxes=[];}
  rows.length=0;renderPage=null;onPageChange=null;onStatus=null;pageSize=null;container.replaceChildren(blankCanvas());container.scrollTop=0;
 }};
}
