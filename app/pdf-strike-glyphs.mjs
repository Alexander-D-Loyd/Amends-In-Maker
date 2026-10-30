const matrix=a=>a?.length===1&&(Array.isArray(a[0])||ArrayBuffer.isView(a[0]))?Array.from(a[0]):a;
const horizontal=m=>m?.length===6&&m.every(Number.isFinite)&&m[0]>=.75&&m[0]<=1.5&&Math.abs(m[1])+Math.abs(m[2])<1e-6&&Math.abs(m[3]-1)<1e-6;
const identity=m=>horizontal(m)&&Math.abs(m[0]-1)+Math.abs(m[4])+Math.abs(m[5])<1e-6;

// PDF.js can merge separately drawn words into one item. A short strike then
// may cross part of an item instead of the entire run. Recover glyphs only
// for those eligible items, with complete native text/origin/width evidence.
export function partialStrikeGlyphEvidence(items,operators,OPS,strokes){
 const partial=items.filter(i=>i.str?.trim()&&!i.sourceGlyphs&&strokes.some(s=>{
  const x=i.transform[4],y=i.transform[5],overlap=Math.min(x+i.width,s.x2)-Math.max(x,s.x1);
  return s.y-y>i.height*.15&&s.y-y<i.height*.65&&overlap>0&&overlap<i.width-.25;
 }));
 if(!partial.length)return items;
 const glyphs=nativeGlyphs(operators,OPS),replacements=new Map();
 for(const item of partial){
  if(!(item.height>=6&&item.height<=30)||Math.abs(item.transform[1])+Math.abs(item.transform[2])>1e-6)continue;
  if(items.filter(i=>i.str?.trim()&&i.fontName===item.fontName&&Math.abs(i.transform[4]-item.transform[4])<.1&&Math.abs(i.transform[5]-item.transform[5])<.1).length!==1)continue;
  const x=item.transform[4],y=item.transform[5],end=x+item.width;
  const found=glyphs.filter(g=>g.font===item.fontName&&Math.abs(g.y-y)<.1&&g.x+g.width>x+.05&&g.x<end-.05).sort((a,b)=>a.x-b.x||a.order-b.order);
  if(!found.length||found.some(g=>Math.abs(g.size-item.height)>.1||Math.abs(item.transform[0]-g.size*g.scaleX)>.1||Math.abs(item.transform[3]-g.size)>.1))continue;
  if(Math.abs(found[0].x-x)>.1||Math.abs(found.at(-1).x+found.at(-1).width-end)>.25||found.map(g=>g.text).join('')!==item.str)continue;
  if(found.some((g,n)=>n&&(g.order<=found[n-1].order||g.x<found[n-1].x+found[n-1].width-.5)))continue;
  let offset=0;replacements.set(item,{...item,sourceGlyphs:found.map(g=>{const start=offset;offset+=g.text.length;return {text:g.text,x:g.x,width:g.width,start,end:offset};})});
 }
 return items.map(i=>replacements.get(i)||i);
}

function nativeGlyphs(operators,OPS){
 let state={font:null,size:0,spacing:0,wordSpacing:0,mode:0,white:false,tm:null,supported:true};const stack=[],out=[];let order=0;
 const clone=s=>({...s,tm:s.tm&&[...s.tm]});
 for(let i=0;i<operators.fnArray.length;i++){
  const op=operators.fnArray[i],a=operators.argsArray[i];
  if(op===OPS.save){stack.push(clone(state));continue;}
  if(op===OPS.restore){state=stack.pop()||{...state,tm:null,supported:false};continue;}
  if(op===OPS.paintFormXObjectBegin){stack.push(clone(state));if(a[0]&&!identity(a[0]))state.supported=false;continue;}
  if(op===OPS.paintFormXObjectEnd){state=stack.pop()||{...state,tm:null,supported:false};continue;}
  if(op===OPS.transform){if(!identity(a))state.supported=false;continue;}
  if(op===OPS.setFont){state.font=a[0];state.size=a[1];continue;}
  if(op===OPS.setCharSpacing){state.spacing=a[0];continue;}
  if(op===OPS.setWordSpacing){state.wordSpacing=a[0];continue;}
  if(op===OPS.setTextRenderingMode){state.mode=a[0];continue;}
  if(op===OPS.setFillRGBColor){state.white=typeof a[0]==='string'?/^#(?:fff|ffffff)$/i.test(a[0]):a.length===3&&a.every(v=>v===1);continue;}
  if(op===OPS.setFillGray){state.white=a[0]===1;continue;}
  if(op===OPS.setFillCMYKColor){state.white=a.length===4&&a.every(v=>v===0);continue;}
  if([OPS.setFillColor,OPS.setFillColorN,OPS.setGState].includes(op)){state.supported=false;continue;}
  if(op===OPS.setHScale&&a[0]!==100){state.supported=false;continue;}
  if(op===OPS.beginText){state.tm=null;continue;}
  if(op===OPS.setTextMatrix){state.tm=matrix(a);continue;}
  if([OPS.moveText,OPS.setLeadingMoveText,OPS.nextLine].includes(op)){state.tm=null;continue;}
  if(op!==OPS.showText)continue;
  const s=state,shown=a[0];
  if(!s.supported||!horizontal(s.tm)||!s.font||!(s.size>=6&&s.size<=30)||!Number.isFinite(s.spacing)||s.spacing<0||s.spacing>30||!Number.isFinite(s.wordSpacing)||!Array.isArray(shown)||shown.some(g=>typeof g==='number'?!Number.isFinite(g)||Math.abs(g)>100:typeof g?.unicode!=='string'||!Number.isFinite(g.width)||g.width<0)){state.tm=null;continue;}
  let x=s.tm[4];const scaleX=s.tm[0],y=s.tm[5];
  for(const g of shown){
   if(typeof g==='number'){x-=g*s.size*scaleX/1000;continue;}
   const width=g.width*s.size*scaleX/1000;
   if(s.mode===0&&!s.white)out.push({text:g.unicode,x,y,width,font:s.font,size:s.size,scaleX,order:order++});
   x+=(g.width*s.size/1000+s.spacing+(/^\s+$/.test(g.unicode)?s.wordSpacing:0))*scaleX;
  }
  state.tm=[...s.tm.slice(0,4),x,y];
 }
 return out;
}
