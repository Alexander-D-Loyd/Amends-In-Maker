// Independent integrity checks within a decoded page. Never infer a correction
// from the comparison document or change the source to make an amendment fit.
const chars=text=>text.normalize('NFKC').replace(/[\s\u200b\u00ad]/gu,'');
function counts(text){const map=new Map();for(const c of chars(text))map.set(c,(map.get(c)||0)+1);return map;}
export function pageTextIntegrity(items,layout){
 const source=items.filter(i=>typeof i.str==='string'&&!(/^(?:SECURED\s*COPY|SECURED|COPY)$/i.test(i.str.trim())&&Math.abs(i.transform?.[1])>Math.abs(i.transform?.[0])*.1)).map(i=>i.str).join('');
 const original=counts(source),shown=counts(layout.text),preserved=original.size===shown.size&&[...original].every(([c,n])=>shown.get(c)===n);
 const unsupported=[...layout.text.matchAll(/[\uD800-\uDFFF\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu)].map(m=>({start:m.index,end:m.index+m[0].length}));
 const invalidGeometry=items.some(i=>typeof i.str==='string'&&i.str.trim()&&(!(Array.isArray(i.transform)||ArrayBuffer.isView(i.transform))||i.transform.length!==6||!i.transform.every(Number.isFinite)||!Number.isFinite(i.width)||!Number.isFinite(i.height)));
 return {sourceCharacters:chars(source).length,layoutCharacters:chars(layout.text).length,preservedCharacters:preserved,unsupportedCharacters:unsupported,invalidGeometry};
}
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function largeRasterCoverage(operators,OPS,width,height,view=[0,0,width,height]){
 if(!(width>0&&height>0))return 0;
 let matrix=[1,0,0,1,0,0],largest=0;const stack=[];
 const images=[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintJpegXObject].filter(Number.isInteger);
 for(let n=0;n<operators.fnArray.length;n++){
  const op=operators.fnArray[n],args=operators.argsArray[n];
  if(op===OPS.save){stack.push([...matrix]);continue;}
  if(op===OPS.restore){matrix=stack.pop()||[1,0,0,1,0,0];continue;}
  if(op===OPS.transform){if(args?.length===6&&args.every(Number.isFinite))matrix=multiply(matrix,args);continue;}
  if(op===OPS.paintFormXObjectBegin){stack.push([...matrix]);if(args?.[0]?.length===6&&Array.from(args[0]).every(Number.isFinite))matrix=multiply(matrix,args[0]);continue;}
  if(op===OPS.paintFormXObjectEnd){matrix=stack.pop()||[1,0,0,1,0,0];continue;}
  if(!images.includes(op))continue;
  // Image drawing uses a unit square in the current PDF coordinate matrix.
  // Bounding boxes are intentionally conservative for rotated scan pages.
  const xs=[matrix[4],matrix[0]+matrix[4],matrix[2]+matrix[4],matrix[0]+matrix[2]+matrix[4]],ys=[matrix[5],matrix[1]+matrix[5],matrix[3]+matrix[5],matrix[1]+matrix[3]+matrix[5]];
  const w=Math.max(0,Math.min(view[2],Math.max(...xs))-Math.max(view[0],Math.min(...xs))),h=Math.max(0,Math.min(view[3],Math.max(...ys))-Math.max(view[1],Math.min(...ys)));
  largest=Math.max(largest,w*h/(width*height));
 }
 return largest;
}
export function pageReadingProblems(layout,operators,OPS,width,height,{end=layout.text.length,ocr=false,view}={}){
 const q=layout.readingQuality,problems=[];
 if(q&&!q.preservedCharacters)problems.push('text-layout disagreement');
 if(q?.unsupportedCharacters.some(r=>r.start<end))problems.push('unreadable encoded characters');
 if(q?.invalidGeometry)problems.push('invalid text positions');
 if(!ocr&&largeRasterCoverage(operators,OPS,width,height,view)>=.35&&chars(layout.text).length<300)problems.push('large scanned image with too little readable text');
 return problems;
}
