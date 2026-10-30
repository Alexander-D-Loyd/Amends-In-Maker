import {isAmendmentMetadataLine} from './amendment-metadata.mjs';
// This administrative note identifies where omitted strikeout matter can be
// found. It is not insertion text. Recognize its whole dated sentence, never
// a substring inside an amendment's quoted or legislative payload.
const month='(?:January|February|March|April|May|June|July|August|September|October|November|December)';
const wording=new RegExp('^All (?:matter|material|text) (?:deleted|omitted) (?:in|from) this (?:version of the )?bill (?:appears|is (?:contained|shown)) in (?:the )?bill as amended (?:in|by) the (Assembly|Senate),? ('+month+' \\d{1,2},? \\d{4})\\.?(?: \\(JR\\s*(\\d{1,3})\\))?$','i');
export function jrBoxDetails(text){
  if(typeof text!=='string'||text.length>1000)return null;
  const normalized=text.replace(/\s+/g,' ').trim(),match=wording.exec(normalized);
  return match?{text:normalized,chamber:match[1],date:match[2],...(match[3]?{code:'JR'+match[3]}:{})}:null;
}
const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function jrBoxRectangles(operators,OPS){
  let matrix=identity();const stack=[],edges=[];
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    if(op===OPS.save){stack.push([...matrix]);continue;}
    if(op===OPS.restore){matrix=stack.pop()||identity();continue;}
    if(op===OPS.transform){matrix=multiply(matrix,args);continue;}
    if(op===OPS.paintFormXObjectBegin){stack.push([...matrix]);if(args[0])matrix=multiply(matrix,args[0]);continue;}
    if(op===OPS.paintFormXObjectEnd){matrix=stack.pop()||identity();continue;}
    if(op!==OPS.constructPath||![OPS.fill,OPS.eoFill].includes(args[0])||!args[2]||Math.abs(matrix[1])>.01||Math.abs(matrix[2])>.01)continue;
    const [x0,y0,x1,y1]=args[2],xs=[matrix[0]*x0+matrix[4],matrix[0]*x1+matrix[4]],ys=[matrix[3]*y0+matrix[5],matrix[3]*y1+matrix[5]];
    const edge={left:Math.min(...xs),right:Math.max(...xs),bottom:Math.min(...ys),top:Math.max(...ys)};
    const width=edge.right-edge.left,height=edge.top-edge.bottom;
    if(width>=60&&height>0&&height<=3)edges.push({...edge,horizontal:true});
    else if(height>=20&&width>0&&width<=3)edges.push({...edge,horizontal:false});
  }
  const boxes=[];
  for(const bottom of edges.filter(e=>e.horizontal))for(const top of edges.filter(e=>e.horizontal&&e.bottom-bottom.top>=20)){
    if(Math.abs(bottom.left-top.left)>3||Math.abs(bottom.right-top.right)>3)continue;
    const left=edges.find(e=>!e.horizontal&&Math.abs(e.left-bottom.left)<=3&&Math.abs(e.bottom-bottom.bottom)<=3&&Math.abs(e.top-top.top)<=3);
    const right=edges.find(e=>!e.horizontal&&Math.abs(e.right-bottom.right)<=3&&Math.abs(e.bottom-bottom.bottom)<=3&&Math.abs(e.top-top.top)<=3);
    if(left&&right)boxes.push({left:left.left,right:right.right,bottom:bottom.bottom,top:top.top});
  }
  return boxes;
}
export function markJrBoxGeometry(layout,operators,OPS){
  const boxes=jrBoxRectangles(operators,OPS);
  for(const line of layout.lines){
    if(!line)continue;
    const box=boxes.find(b=>line.x>=b.left-1&&line.right<=b.right+1&&line.baseline>=b.bottom&&line.baseline+line.height<=b.top+1);
    if(box)line.jrBoxRect={...box};
  }
  return layout;
}
export function billJrBoxes(blocks,pages){
  const text=pages.join('\n');if(!/\b(?:ASSEMBLY|SENATE)\s+BILL\s+(?:No\.?\s*)?\d+/i.test(text))return [];
  const notices=[],body=b=>b.text.slice(b.margin.length).trim();
  for(let i=0;i<blocks.length;i++){
    if(blocks[i].page!==pages.length||!/^All (?:matter|material|text) (?:deleted|omitted)\b/i.test(body(blocks[i])))continue;
    const rows=[];let details=null,j=i;
    for(;j<blocks.length&&j<i+8&&blocks[j].page===pages.length;j++){
      if(blocks[j].ignored||!body(blocks[j]))break;
      rows.push(blocks[j]);details=jrBoxDetails(rows.map(body).join(' '));
      if(details&&!/^\(JR\s*$/i.test(body(blocks[j+1]||{text:'',margin:''})))break;
    }
    if(!details)continue;
    // A code may wrap to the following row. Include it in the same notice.
    if(/^\(JR\s*\d{1,3}\)$/.test(body(blocks[j+1]||{text:'',margin:''}))){rows.push(blocks[++j]);details=jrBoxDetails(rows.map(body).join(' '));}
    const tail=blocks.slice(j+1).filter(b=>!b.ignored&&body(b));
    if(tail.length!==1||!/^[-–—]?\s*[0O]\s*[-–—]?$/.test(body(tail[0])))continue;
    const boxes=rows.map(b=>b.formatting?.jrBoxRect),sameBox=boxes.every(b=>b&&JSON.stringify(b)===JSON.stringify(boxes[0]));
    if(!details.code&&!sameBox)continue;
    notices.push({...details,page:pages.length,source:'bill',ranges:rows.map(b=>({start:b.start,end:b.end})),...(sameBox?{rect:boxes[0]}:{})});
  }
  return notices;
}
export function jrBoxPageNotices({text='',annotations=[],page}){
  const notices=[];
  for(const annotation of annotations){
    if(!['FreeText','Text'].includes(annotation.subtype))continue;
    const details=jrBoxDetails(annotation.contentsObj?.str??annotation.contents);
    if(details)notices.push({...details,page,source:'annotation',...(Array.isArray(annotation.rect)?{rect:[...annotation.rect]}:{})});
  }
  // A flattened note is safely outside instruction prose only beyond its
  // own printed end marker. Content before the marker remains untouched.
  const marker=/(?:^|\n)[ \t]*[-–—][ \t]*0[ \t]*[-–—][ \t]*(?=\r?\n|$)/.exec(text);
  if(marker){
    const tail=text.slice(marker.index+marker[0].length).split(/\r?\n/).filter(line=>!isAmendmentMetadataLine(line)).join(' '),details=jrBoxDetails(tail);
    if(details&&!notices.some(n=>n.text===details.text))notices.push({...details,page,source:'flattened'});
  }
  return notices;
}
export function jrBoxMetadata(notices=[]){
  if(!notices.length)return '';
  const pages=[...new Set(notices.map(n=>n.page))].sort((a,b)=>a-b);
  return ` · JR Box noted on page${pages.length===1?'':'s'} ${pages.join(', ')} · excluded from amendments`;
}
