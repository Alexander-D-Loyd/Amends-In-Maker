// Sequence evidence only identifies candidates; it never supplies the answer.
// Correct a confusable marker only when two isolated original-pixel readings
// independently identify lowercase l between the source's own k and m clauses.
export function ambiguousClauseMarkers(data){
 const markers=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
  const word=(line.words||[])[0];if(word&&/^\([a-zA-Z1|]\)$/.test(word.text))markers.push(word);
 }
 return markers.filter((word,i)=>/^\([JI1|]\)$/.test(word.text)&&markers[i-1]?.text==='(k)'&&markers[i+1]?.text==='(m)');
}
export function corroboratedLowercaseL(readings){
 return readings.length===2&&readings.every(r=>r.text.trim()==='l'&&r.confidence>=50)&&readings.some(r=>r.confidence>=80);
}
// Row rereads can shift the symbol box into a parenthesis. Preserve the first
// whole-page geometry only when it describes the same physical marker.
export function originalMarkerGlyphBox(word,originals){
 const overlap=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
 const area=b=>(b.x1-b.x0)*(b.y1-b.y0);
 if(!word.bbox||area(word.bbox)<=0)return null;
 const match=originals.find(w=>w.bbox&&area(w.bbox)>0&&overlap(w.bbox,word.bbox)>=Math.max(area(w.bbox),area(word.bbox))*.8);
 const glyph=match?.symbols?.find(s=>/^[JI1|]$/.test(s.text));
 if(!glyph?.bbox||area(glyph.bbox)<=0||overlap(glyph.bbox,match.bbox)<area(glyph.bbox))return null;
 return glyph.bbox;
}
