// Require a nearly solid stroke in the middle of a text row. Underlines,
// letter crossbars and page separators are not deletion evidence.
export function scannedStrokeGeometry(layout,image,pageHeight,scale){
 const {data,width,height}=image,ink=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return false;const i=(y*width+x)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114<170;};
 const lines=layout.text.split('\n'),strokes=[];
 for(const [index,f] of layout.lines.entries()){
  if(f.height>16||lines[index].length<15)continue;
  const found=[];
  for(let y=Math.round((pageHeight-f.baseline-f.height*.65)*scale);y<(pageHeight-f.baseline-f.height*.2)*scale;y++){
   let start=null,last=null,hits=0;
   const flush=()=>{if(start!==null&&last-start>=20*scale&&hits/(last-start+1)>.97)found.push({left:start/scale,right:last/scale,y:pageHeight-y/scale});start=null;};
   for(let x=Math.floor(width*.06);x<=Math.floor(width*.94);x++){
    if(ink(x,y)){if(start===null){start=x;hits=0;}last=x;hits++;}else if(start!==null&&x-last>1)flush();
   }
   flush();
  }
  found.sort((a,b)=>a.left-b.left);const merged=[];
  for(const s of found){const last=merged.at(-1);if(last&&s.left<=last.right+2){last.right=Math.max(last.right,s.right);last.minY=Math.min(last.minY,s.y);last.maxY=Math.max(last.maxY,s.y);}else merged.push({...s,minY:s.y,maxY:s.y});}
  strokes.push(...merged.map(s=>({...s,baseline:f.baseline,height:f.height})));
 }
 return strokes;
}
export function maskScannedStrikeouts(context,strokes,pageHeight,scale){
 const image=context.getImageData(0,0,context.canvas.width,context.canvas.height),original=image.data.slice(),{width,height,data}=image;
 const dark=(x,y)=>{const i=(y*width+x)*4;return original[i]+original[i+1]+original[i+2]<510;};
 for(const s of strokes){
  const top=Math.max(1,Math.floor((pageHeight-s.maxY)*scale)-1),bottom=Math.min(height-2,Math.ceil((pageHeight-s.minY)*scale)+1);
  for(let x=Math.max(0,Math.floor(s.left*scale));x<=Math.min(width-1,Math.ceil(s.right*scale));x++){
   const vertical=dark(x,top-1)&&dark(x,bottom+1);
   for(let y=top;y<=bottom;y++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=vertical?0:255;data[i+3]=255;}
  }
 }
 context.putImageData(image,0,0);
}
export function ocrPageItems(data,pageHeight,scale){
 const items=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
  const baseline=pageHeight-line.baseline.y0/scale,rawHeight=(line.bbox.y1-line.bbox.y0)/scale,height=line.text.trim().length>30?Math.min(12,rawHeight):rawHeight;
  for(const word of line.words||[]){
   const {x0,x1}=word.bbox;
   items.push({str:word.text,transform:[height,0,0,height,x0/scale,baseline],width:(x1-x0)/scale,height,fontName:'offlineOcr',confidence:word.confidence,readingDisagreement:word.readingDisagreement,symbols:word.symbols,spaceBefore:true});
  }
 }
 return items;
}
export function deletedOcrItems(items,strokes,scale){
 const deleted=[];
 for(const item of items){
  const lineStrokes=strokes.filter(s=>Math.abs(s.baseline-item.transform[5])<2);
  if(!lineStrokes.length)continue;
  // A stroke may join the crossbar of an adjacent letter. Normal words
  // require deletion evidence over most of the word, not one end glyph.
  // Damaged joins with separators retain symbol-level classification.
  if(/^[\p{L}]+$/u.test(item.str)&&!lineStrokes.some(s=>Math.max(0,Math.min(item.transform[4]+item.width,s.right)-Math.max(item.transform[4],s.left))>=item.width*.6))continue;
  const symbols=item.symbols||[],selected=symbols.map(symbol=>lineStrokes.some(s=>{
   const left=symbol.bbox.x0/scale,right=symbol.bbox.x1/scale;
   return Math.max(0,Math.min(right,s.right)-Math.max(left,s.left))>=Math.max(1,right-left)*.6;
  }));
  // A punctuation glyph attached to damaged, crossed-out text can be part of
  // the stroke itself. The second OCR pass reads the surviving prefix afresh.
  for(let i=0;i<selected.length;i++)if(!selected[i]&&/^[\-_+]+$/.test(symbols[i].text)&&item.confidence<70&&(selected[i-1]||selected[i+1]))selected[i]=true;
  let start=0;
  while(start<symbols.length){if(!selected[start]){start++;continue;}let end=start+1;while(selected[end])end++;
   const group=symbols.slice(start,end),left=Math.min(...group.map(s=>s.bbox.x0))/scale,right=Math.max(...group.map(s=>s.bbox.x1))/scale;
   deleted.push({...item,str:group.map(s=>s.text).join(''),transform:[...item.transform.slice(0,4),left,item.transform[5]],width:right-left,ocrStruck:true});start=end;
  }
 }
 return deleted;
}
export function markDeletedOcrItems(items,strokes,scale){
 const deleted=deletedOcrItems(items,strokes,scale);
 return items.flatMap(item=>{
  const spans=deleted.filter(d=>Math.abs(d.transform[5]-item.transform[5])<2&&d.transform[4]<item.transform[4]+item.width&&d.transform[4]+d.width>item.transform[4]);
  if(!spans.length)return [item];
  if(spans.some(d=>Math.max(0,Math.min(d.transform[4]+d.width,item.transform[4]+item.width)-Math.max(d.transform[4],item.transform[4]))>=item.width*.7))return [{...item,ocrStruck:true}];
  const symbols=item.symbols||[],selected=symbols.map(s=>spans.some(d=>Math.max(0,Math.min(s.bbox.x1/scale,d.transform[4]+d.width)-Math.max(s.bbox.x0/scale,d.transform[4]))>=(s.bbox.x1-s.bbox.x0)/scale*.6));
  const pieces=[];let start=0;
  while(start<symbols.length){let end=start+1;while(end<symbols.length&&selected[end]===selected[start])end++;
   const group=symbols.slice(start,end),left=Math.min(...group.map(s=>s.bbox.x0))/scale,right=Math.max(...group.map(s=>s.bbox.x1))/scale;
   pieces.push({...item,str:group.map(s=>s.text).join(''),transform:[...item.transform.slice(0,4),left,item.transform[5]],width:right-left,ocrStruck:selected[start],spaceBefore:start===0&&item.spaceBefore});start=end;
  }
  return pieces.length?pieces:[item];
 });
}
