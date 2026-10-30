// A separate pixel reading prevents whole-page OCR from treating the narrow
// line-number column as a vertical word. No legislative wording is inferred.
export async function readBillMarginColumn(canvas,worker,data,scale,checkCancelled=()=>{}){
 const width=Math.floor(canvas.width*.16),crop=document.createElement('canvas');crop.width=width;crop.height=canvas.height;crop.getContext('2d').drawImage(canvas,0,0,width,canvas.height,0,0,width,canvas.height);
 let reread;try{await worker.setParameters({tessedit_pageseg_mode:'6'});reread=(await worker.recognize(crop,{}, {text:true,blocks:true})).data;checkCancelled();}finally{await worker.setParameters({tessedit_pageseg_mode:'3'});crop.width=crop.height=0;}
 const lines=d=>(d.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
 const body=lines(data).filter(l=>l.bbox.x0>=width&&l.text.trim().length>=15&&Math.abs(l.baseline.y1-l.baseline.y0)<scale*2);
 const candidates=lines(reread).filter(l=>/^(?:[1-9]|[1-9]\d)$/u.test(l.text.trim())&&l.words?.length===1&&l.words[0].confidence>=85).map(l=>({line:l,n:Number(l.text.trim()),body:body.find(b=>Math.abs(b.baseline.y0-l.baseline.y0)<scale*3&&b.bbox.x0-l.bbox.x1>=18*scale)})).filter(r=>r.body).sort((a,b)=>a.line.baseline.y0-b.line.baseline.y0);
 const selected=[];let run=[];for(const r of candidates){if(run.length&&(r.n!==run.at(-1).n+1||Math.abs(r.line.bbox.x1-run.at(-1).line.bbox.x1)>scale*2)){if(run.length>=4)selected.push(...run);run=[];}run.push(r);}if(run.length>=4)selected.push(...run);
 if(!selected.length)return data;
 const remove=w=>w.bbox.x1<width&&selected.some(r=>Math.max(0,Math.min(w.bbox.y1,r.line.bbox.y1)-Math.max(w.bbox.y0,r.line.bbox.y0))>0);
 const blocks=(data.blocks||[]).map(b=>({...b,paragraphs:(b.paragraphs||[]).map(p=>({...p,lines:(p.lines||[]).map(l=>({...l,words:(l.words||[]).filter(w=>!remove(w))})).filter(l=>l.words.length)}))}));
 const marginLines=selected.map(r=>({...r.line,baseline:{...r.body.baseline},words:r.line.words.map(w=>({...w,text:String(r.n)}))}));
 return {...data,blocks:[...blocks,{paragraphs:[{lines:marginLines}]}]};
}
