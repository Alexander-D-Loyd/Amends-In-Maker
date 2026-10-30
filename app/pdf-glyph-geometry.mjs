// Native PDF text advances, before any amendment text is considered.
const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export function nativePdfGlyphs(operators,OPS){
 let state={ctm:identity(),tm:identity(),line:identity(),font:null,size:0,hscale:1,char:0,word:0,leading:0,rise:0,mode:0},stack=[],out=[];
 const clone=s=>({...s,ctm:[...s.ctm],tm:[...s.tm],line:[...s.line]});
 const move=(x,y)=>{state.line=multiply(state.line,[1,0,0,1,x,y]);state.tm=[...state.line];};
 for(let i=0;i<operators.fnArray.length;i++){
  const op=operators.fnArray[i],a=operators.argsArray[i]||[];
  if(op===OPS.save){stack.push(clone(state));continue;}
  if(op===OPS.restore){state=stack.pop()||state;continue;}
  if(op===OPS.transform){if(a.length===6)state.ctm=multiply(state.ctm,a);continue;}
  if(op===OPS.paintFormXObjectBegin){stack.push(clone(state));if(a[0]?.length===6)state.ctm=multiply(state.ctm,a[0]);continue;}
  if(op===OPS.paintFormXObjectEnd){state=stack.pop()||state;continue;}
  if(op===OPS.beginText){state.tm=identity();state.line=identity();continue;}
  if(op===OPS.setTextMatrix){const m=a.length===1&&a[0]?.length===6?a[0]:a;if(m.length===6&&m.every(Number.isFinite)){state.tm=Array.from(m);state.line=Array.from(m);}continue;}
  if(op===OPS.moveText){move(a[0],a[1]);continue;}
  if(op===OPS.setLeadingMoveText){state.leading=-a[1];move(a[0],a[1]);continue;}
  if(op===OPS.nextLine){move(0,-state.leading);continue;}
  if(op===OPS.setLeading){state.leading=a[0];continue;}
  if(op===OPS.setFont){state.font=a[0];state.size=a[1];continue;}
  if(op===OPS.setHScale){state.hscale=a[0]/100;continue;}
  if(op===OPS.setCharSpacing){state.char=a[0];continue;}
  if(op===OPS.setWordSpacing){state.word=a[0];continue;}
  if(op===OPS.setTextRise){state.rise=a[0];continue;}
  if(op===OPS.setTextRenderingMode){state.mode=a[0];continue;}
  if(op!==OPS.showText||!Array.isArray(a[0]))continue;
  for(const glyph of a[0]){
   if(typeof glyph==='number'){state.tm=multiply(state.tm,[1,0,0,1,-glyph*state.size*state.hscale/1000,0]);continue;}
   if(typeof glyph?.unicode!=='string'||!Number.isFinite(glyph.width))continue;
   const m=multiply(state.ctm,state.tm),p=point(m,0,state.rise),advance=glyph.width*state.size/1000,q=point(m,advance*state.hscale,state.rise),height=Math.abs(state.size*m[3]);
   // Unsupported character orientation is deliberately left without a glyph box.
   if(state.mode!==3&&Math.abs(m[1])+Math.abs(m[2])<1e-5&&q.x>=p.x&&height>0&&[p.x,p.y,q.x,height].every(Number.isFinite))out.push({text:glyph.unicode,x:p.x,y:p.y-height*.22,width:q.x-p.x,height,baseline:p.y,fontName:state.font,source:'native-pdf-advance'});
   const spacing=state.char+((glyph.isSpace||/^\s+$/u.test(glyph.unicode))?state.word:0);
   state.tm=multiply(state.tm,[1,0,0,1,(advance+spacing)*state.hscale,0]);
  }
 }
 return out;
}

export function mapLayoutGeometry(layout,pageNumber,pageOffset,view,nativeGlyphs=[],{ocr=false}={}){
 const texts=layout.text.split('\n'),lines=[];let cursor=0;
 for(let index=0;index<texts.length;index++){
  const text=texts[index],f=layout.lines[index];if(!f){cursor+=text.length+1;continue;}
  const start=pageOffset+cursor,end=start+text.length,baseline=f.baseline,height=f.height||12,marginMatch=/^line\s*(\d+)(?:\s|$)/i.exec(text),glyphs=[],runs=[];
  for(const run of f.runs||[]){
   const raw=text.slice(run.start,run.end),globalStart=start+run.start,globalEnd=start+run.end;
   const candidates=nativeGlyphs.filter(g=>Math.abs(g.baseline-baseline)<=Math.max(2,height*.12)&&g.x>=run.x-.6&&g.x+g.width<=run.x+run.width+.9).sort((a,b)=>a.x-b.x);
   let at=0,mapped=[];
   for(const g of candidates){while(at<raw.length&&/\s/u.test(raw[at])&&!/^\s/u.test(g.text))at++;if(raw.slice(at,at+g.text.length)!==g.text){mapped=[];break;}mapped.push({...g,start:globalStart+at,end:globalStart+at+g.text.length});at+=g.text.length;}
   if(raw.slice(at).trim())mapped=[];
   if(!mapped.length&&ocr&&raw.trim()&&!/^line\s*\d+\s*$/i.test(raw))mapped=[{start:globalStart,end:globalEnd,text:raw,x:run.x,y:baseline-height*.22,width:run.width,height,baseline,source:'ocr-whole-word'}];
   glyphs.push(...mapped);runs.push({...run,start:globalStart,end:globalEnd,y:baseline-height*.22,baseline});
  }
  let margin=null;
  if(marginMatch){
   const digits=marginMatch[1],digitStart=text.indexOf(digits),digitEnd=digitStart+digits.length;
   let g=glyphs.filter(g=>g.start<start+digitEnd&&g.end>start+digitStart);
   if(!g.length){const physical=nativeGlyphs.filter(g=>Math.abs(g.baseline-baseline)<2&&g.x+g.width<f.x-2&&/^\d$/u.test(g.text)).sort((a,b)=>a.x-b.x);if(physical.map(g=>g.text).join('')===digits)g=physical;}
   const digitRuns=(f.runs||[]).filter(r=>text.slice(r.start,r.end).trim().replace(/^line\s*/i,'')===digits&&r.x+r.width<f.x-2);
   const box=g.length?{x:Math.min(...g.map(g=>g.x)),width:Math.max(...g.map(g=>g.x+g.width))-Math.min(...g.map(g=>g.x)),height:Math.max(...g.map(g=>g.height))}:digitRuns.length===1?{x:digitRuns[0].x,width:digitRuns[0].width,height:digitRuns[0].height||height}:null;
   if(box)margin={...box,y:baseline-box.height*.22,text:digits,number:Number(digits),start:start+digitStart,end:start+digitEnd};
  }
  // Virtual accessibility labels and visible line digits never become body glyphs.
  const marginEnd=marginMatch?start+marginMatch[0].length:start;
  lines.push({page:pageNumber,start,end,text,baseline,height,left:f.x,right:f.right,margin,runs,glyphs:glyphs.filter(g=>g.end>marginEnd),geometrySource:ocr?'ocr-whole-word':'native-pdf-advance'});
  cursor+=text.length+1;
 }
 return {page:pageNumber,view:Array.from(view),rotation:0,lines};
}
