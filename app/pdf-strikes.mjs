import {sourceTextEvidence} from './pdf-text-evidence.mjs';
import {partialStrikeGlyphEvidence} from './pdf-strike-glyphs.mjs';
import {pageTextIntegrity} from './pdf-page-quality.mjs';
import {knownPdfRunItalic} from './pdf-font-style.mjs';
const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export function horizontalStrokes(operators,OPS){
  let matrix=identity(),width=1;const stack=[],lines=[];
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    if(op===OPS.save){stack.push({matrix:[...matrix],width});continue;}
    if(op===OPS.restore){const state=stack.pop();if(state){matrix=state.matrix;width=state.width;}continue;}
    if(op===OPS.transform){matrix=multiply(matrix,args);continue;}
    if(op===OPS.setLineWidth){width=args[0];continue;}
    if(op===OPS.paintFormXObjectBegin){stack.push({matrix:[...matrix],width});if(args[0])matrix=multiply(matrix,args[0]);continue;}
    if(op===OPS.paintFormXObjectEnd){const state=stack.pop();if(state){matrix=state.matrix;width=state.width;}continue;}
    if(op!==OPS.constructPath || ![OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(args[0]) || width>2.5)continue;
    const path=args[1]?.[0];if(!Array.isArray(path) && !ArrayBuffer.isView(path))continue;
    let previous=null;
    for(let p=0;p<path.length;){
      const command=path[p++];
      if(command===0 || command===1){
        const next=point(matrix,path[p++],path[p++]);
        if(command===1 && previous && Math.abs(next.y-previous.y)<.8 && Math.abs(next.x-previous.x)>2)lines.push({x1:Math.min(next.x,previous.x),x2:Math.max(next.x,previous.x),y:(next.y+previous.y)/2});
        previous=next;
      }else if(command===2){p+=6;previous=null;}
      else if(command===3){p+=4;previous=null;}
      else if(command===4)previous=null;
      else break;
    }
  }
  return lines;
}
// Some struck legislative references use separate text matrices with a real
// word gap smaller than PDF.js's ordinary synthetic-space threshold. Preserve
// only an independently separated Roman article/suffix reference to the
// California Constitution. An unbroken item, zero/kerning gap, tracked glyph
// fragments, another font/baseline or a valid continued Roman numeral cannot
// establish this boundary. This does not rewrite arbitrary Roman strings.
const canonicalArticleRoman=/^(?=.)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u;
function separatedConstitutionArticleSuffix(previous,item,text,gap){
 if(!previous||!(gap>Math.max(.5,item.height*.04))||gap>Math.max(1.5,item.height*.16)||typeof item.fontName!=='string'||!item.fontName||previous.fontName!==item.fontName||!Number.isFinite(item.height)||!Number.isFinite(previous.height)||item.height<6||item.height>30||Math.abs(previous.height-item.height)>.1||!Number.isFinite(previous.width)||!Number.isFinite(item.width)||!(previous.width>0)||!(item.width>0)||previous.sourceCharSpacing!==undefined||item.sourceCharSpacing!==undefined)return false;
 const a=previous.transform,b=item.transform;if(!Array.isArray(a)||!Array.isArray(b)||a.length!==6||b.length!==6||![...a,...b].every(Number.isFinite)||a[0]<=0||a[3]<=0||b[0]<=0||b[3]<=0||Math.abs(a[1])+Math.abs(a[2])+Math.abs(b[1])+Math.abs(b[2])>1e-6||Math.abs(a[0]-b[0])>.1||Math.abs(a[3]-b[3])>.1||Math.abs(a[5]-b[5])>.1)return false;
 const roman=/(?<![\p{L}\p{N}\p{M}_])Article\s+([MDCLXVI]+)$/u.exec(text),suffix=/^([A-Z])\s+of\s+the\s+California\s+Constitution(?![\p{L}\p{N}\p{M}_])/u.exec(item.str);
 return !!roman&&!!suffix&&canonicalArticleRoman.test(roman[1])&&!canonicalArticleRoman.test(roman[1]+suffix[1]);
}
export function extractPageLayout(items,operators,OPS,styles={},pageWidth=612){
  items=sourceTextEvidence(items,operators,OPS);
  const strokes=horizontalStrokes(operators,OPS),rows=[];
  items=partialStrikeGlyphEvidence(items,operators,OPS,strokes);
  for(const item of items){
    if(!('str' in item) || !item.str.length)continue;
    // Secured-copy stamps are rotated independently of the bill text.
    if(/^(?:SECURED\s*COPY|SECURED|COPY)$/i.test(item.str.trim())&&Math.abs(item.transform[1])>Math.abs(item.transform[0])*.1)continue;
    const y=item.transform[5];let row=rows.find(row=>Math.abs(row.y-y)<=2);
    if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);
  }
  // Some small-cap fonts position an apostrophe below the word's baseline.
  // Join only isolated apostrophes that physically touch text on a nearby row;
  // keep separate numbered lines and genuinely standalone punctuation intact.
  for(const row of [...rows]){
    const glyphs=row.items.filter(item=>item.str.trim());
    if(!glyphs.length||!glyphs.every(item=>/^[’‘']+$/.test(item.str.trim())))continue;
    const target=rows.filter(other=>other!==row&&glyphs.every(glyph=>{
      const tolerance=Math.max(2,glyph.height*.35);
      return Math.abs(other.y-row.y)<=tolerance&&other.items.some(item=>
        /[\p{L}\p{N}]/u.test(item.str)&&
        Math.max(item.transform[4]-(glyph.transform[4]+glyph.width),glyph.transform[4]-(item.transform[4]+item.width),0)<=tolerance);
    })).sort((a,b)=>Math.abs(a.y-row.y)-Math.abs(b.y-row.y))[0];
    if(target){target.items.push(...row.items);rows.splice(rows.indexOf(row),1);}
  }
  // A typeset fraction's numerator has its own raised baseline. Join it only
  // when a smaller digit physically touches a slash on a nearby text row.
  // Page numbers, footnotes and separate numbered lines have no such evidence.
  for(const row of [...rows]){
    const glyphs=row.items.filter(item=>item.str.trim());
    if(!glyphs.length||!glyphs.every(item=>/^\d+$/.test(item.str.trim())))continue;
    const target=rows.filter(other=>other!==row&&glyphs.every(glyph=>{
      const height=Math.max(...other.items.map(item=>item.height));
      return glyph.height<height*.85&&row.y>other.y&&row.y-other.y<=height*.7&&other.items.some(item=>
        /^[⁄/]\d*/.test(item.str.trim())&&Math.abs(glyph.transform[4]+glyph.width-item.transform[4])<=Math.max(1.5,height*.15));
    })).sort((a,b)=>Math.abs(a.y-row.y)-Math.abs(b.y-row.y))[0];
    if(target){target.items.push(...row.items);rows.splice(rows.indexOf(row),1);}
  }
  const lines=[],strikes=[],formatting=[];let pageOffset=0;
  // Some accessible bill PDFs position their nonprinting "line" label after
  // the visible margin number, overlapping the body. Recover its order only
  // when other numbered rows establish the same right-aligned margin column.
  const visible=row=>row.items.filter(item=>item.str.trim()).sort((a,b)=>a.transform[4]-b.transform[4]);
  const margins=rows.map(visible).filter(g=>g[0]?.str.trim()==='line'&&/^\d+$/.test(g[1]?.str.trim()||'')&&g[2]).map(g=>({right:g[1].transform[4]+g[1].width,bodyLeft:g[2].transform[4]}));
  if(margins.length>=2)for(const row of rows){
    const [number,label,body]=visible(row);
    if(!number||!body||!/^\d+$/.test(number.str.trim())||label.str.trim()!=='line')continue;
    const right=number.transform[4]+number.width;
    const peers=margins.filter(m=>Math.abs(m.right-right)<1.5);
    if(peers.length<2||label.transform[4]<=number.transform[4])continue;
    const inGutter=label.transform[4]<Math.min(...peers.map(m=>m.bodyLeft))-1;
    const overlapsBody=label.transform[4]+label.width>body.transform[4]+1;
    if(!inGutter&&!overlapsBody)continue;
    row.items=row.items.map(item=>item===label?{...item,transform:[...item.transform.slice(0,4),number.transform[4]-label.width-1,item.transform[5]]}:item===number?{...item,spaceBefore:true}:item);
  }
  const ordered=rows.sort((a,b)=>b.y-a.y),gaps=ordered.slice(1).map((r,i)=>ordered[i].y-r.y).filter(g=>g>3&&g<35).sort((a,b)=>a-b);
  const regularGap=gaps.map(value=>({value,count:gaps.filter(g=>Math.abs(g-value)<1).length})).sort((a,b)=>b.count-a.count||a.value-b.value)[0]?.value||18;
  for(const [rowIndex,row] of ordered.entries()){
    let text='',end=null,previousItem=null;const spans=[],runs=[];
    for(const item of row.items.sort((a,b)=>a.transform[4]-b.transform[4])){
      const x=item.transform[4],y=item.transform[5],gap=end===null?0:x-end;
      if(text && (item.spaceBefore||gap>Math.max(1.5,item.height*.16)||separatedConstitutionArticleSuffix(previousItem,item,text,gap)) && !/\s$/.test(text) && !/^\s/.test(item.str))text+=' ';
      const start=text.length;text+=item.str;end=x+item.width;
      const rowHeight=Math.max(...row.items.map(glyph=>glyph.height));
      const fractionDigit=/^\d+$/.test(item.str.trim())&&item.height<rowHeight*.85&&row.items.some(glyph=>/^[⁄/]\d*/.test(glyph.str.trim())&&Math.min(Math.abs(x+item.width-glyph.transform[4]),Math.abs(x-(glyph.transform[4]+glyph.width)))<=Math.max(1.5,rowHeight*.15));
      const style=styles[item.fontName]||{};
      runs.push({start,end:text.length,x,width:item.width,height:item.height,space:!item.str.trim(),font:styles[item.fontName]?.fontFamily||'serif',bold:!!styles[item.fontName]?.bold,italic:!!styles[item.fontName]?.italic,italicKnown:knownPdfRunItalic(style)!==null,fontStyleConflict:style.fontStyleConflict===true,fontStyleProvenance:style.fontStyleProvenance||null,smallCaps:!!(styles[item.fontName]?.ascent>0&&styles[item.fontName]?.ascent<.5),...(fractionDigit?{fractionOffset:y-row.y}: {}),...(item.sourceCharSpacing!==undefined?{sourceCharSpacing:item.sourceCharSpacing}: {})});
      if(item.sourceGlyphs){
        for(const glyph of item.sourceGlyphs)if(item.ocrStruck||strokes.some(line=>line.y-y>item.height*.15&&line.y-y<item.height*.65&&Math.max(0,Math.min(glyph.x+glyph.width,line.x2)-Math.max(glyph.x,line.x1))>=glyph.width*.7))spans.push({start:start+glyph.start,end:start+glyph.end});
      }else{
        const crossed=!!item.ocrStruck||!!item.str.trim()&&strokes.some(line=>line.y-y>item.height*.15 && line.y-y<item.height*.65 && Math.max(0,Math.min(end,line.x2)-Math.max(x,line.x1))>=item.width*.7);
        if(crossed)spans.push({start,end:text.length});
      }
      previousItem=item;
    }
    const leading=text.length-text.trimStart().length;text=text.trim();
    if(!text)continue;
    for(const span of spans){const start=Math.max(0,span.start-leading),end=Math.min(text.length,span.end-leading);if(start<end)strikes.push({start:pageOffset+start,end:pageOffset+end});}
    const margin=text.match(/^line\s*\d+(?:\s+|$)/i)?.[0]||'',bodyStart=leading+margin.length;
    const run=runs.find(r=>r.end>bodyStart)||runs[0],last=runs.at(-1);
    const x=run.x+run.width*Math.max(0,bodyStart-run.start)/Math.max(1,run.end-run.start);
    const right=last.x+last.width,height=Math.max(...runs.map(r=>r.height));
    formatting.push({x,right,pageWidth,height,font:run.font,runs:runs.map(r=>({...r,start:Math.max(0,r.start-leading),end:Math.min(text.length,r.end-leading)})),baseline:row.y,ruleCandidates:strokes.filter(l=>l.y<row.y-2&&l.y>(ordered[rowIndex+1]?.y??row.y-70)+2),centered:!margin&&right-x<pageWidth*.85&&Math.abs((x+right)/2-pageWidth/2)<pageWidth*.065,gapBefore:rowIndex?Math.max(0,ordered[rowIndex-1].y-row.y-regularGap):0,leading:regularGap});
    lines.push(text);pageOffset+=text.length+1;
  }
  const bodyLines=formatting.filter((r,i)=>/^line\s*\d+\s+\S/i.test(lines[i])||(lines[i].length>40&&r.right-r.x>pageWidth*.4));
  const basis=bodyLines.length?bodyLines:formatting;
  const bodyX=Math.min(...basis.map(r=>r.x)),bodyRight=Math.max(...basis.map(r=>r.right));
  const bodyWidth=Math.max(1,bodyRight-bodyX),center=(bodyX+bodyRight)/2;
  const heights=bodyLines.map(r=>r.height).sort((a,b)=>a-b),bodyHeight=heights[Math.floor(heights.length/2)]||12;
  for(const [i,f] of formatting.entries()){
    const margin=/^line\s*\d+(?:\s+|$)/i.test(lines[i]);
    if(/^line\s*\d+$/i.test(lines[i])){f.x=bodyX;f.right=bodyX;}
    f.centered=!margin&&(Math.abs((f.x+f.right)/2-center)<bodyWidth*.01||Math.abs((f.x+f.right)/2-pageWidth/2)<pageWidth*.01)&&(f.right-f.x<bodyWidth*.97||f.runs.some(r=>r.bold||r.smallCaps));
    f.indent=Math.max(0,(f.x-bodyX)/bodyWidth);f.bodyHeight=bodyHeight;
    f.headerGaps=!margin?[...f.runs.slice(1).map((r,j)=>({start:f.runs[j].end,end:r.start,gap:r.x-(f.runs[j].x+f.runs[j].width)})),...f.runs.filter(r=>r.space).map(r=>({start:r.start,end:r.end,gap:r.width}))].filter(r=>r.gap>bodyHeight*3):[];
    // A rule must occupy whitespace. Long strike-outs on the following row
    // otherwise look like separators between the two baselines.
    f.rules=f.ruleCandidates.filter(l=>l.x2-l.x1>bodyWidth*.8&&!ordered.some(row=>row.items.some(item=>{
      const x=item.transform[4],y=item.transform[5];
      return l.y>y+item.height*.1&&l.y<y+item.height*.9&&l.x2>x&&l.x1<x+item.width;
    })));
    if(f.rules.length){const y=f.rules[0].y;f.rules=f.rules.filter(l=>Math.abs(l.y-y)<=3);}
  }
  const layout={text:lines.join('\n'),strikes,lines:formatting};
  layout.readingQuality=pageTextIntegrity(items,layout);
  return layout;
}

export function hasVisiblePdfContent(operators,OPS){
 const paint=new Set(Object.entries(OPS).filter(([name])=>/^(?:paint|showText|showSpacedText|nextLineShowText|nextLineSetSpacingShowText|shadingFill|stroke$|closeStroke$|fill$|eoFill$|fillStroke$|eoFillStroke$|closeFillStroke$|closeEOFillStroke$)/.test(name)).map(([,code])=>code));
 return operators.fnArray.some((code,i)=>paint.has(code)||(code===OPS.constructPath&&paint.has(operators.argsArray[i]?.[0])));
}
