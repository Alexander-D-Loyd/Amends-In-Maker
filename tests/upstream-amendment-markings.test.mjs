import test from 'node:test';
import assert from 'node:assert/strict';
import {printedAmendmentItems} from '../app/amendment-markings.mjs';
import {extractPageLayout} from '../app/pdf-strikes.mjs';
import {parseAmendments,amendmentDisplays} from '../app/amendments.mjs';
import {makeDocument} from '../app/core.mjs';
const item=(str,x,y,width=80,height=12,fontName='ocr')=>({str,transform:[height,0,0,height,x,y],width,height,fontName});
const styles={ocr:{fontFamily:'sans-serif',ascent:1,descent:-.000488},print:{name:'Times-Roman'},hand:{name:'SegoeScript'}};
test('stamp on an amendment heading, barcode and OCR handwriting footer do not enter instructions or payload',()=>{
 const items=[item('Amendment1',260,620),item('AUG 21 2026',460,620),item('Onpage2, inline1, strikeout “old” andinsert:',115,600,330),item('New printed text.',80,120,250),item('RN2621222',575,125,50),item('| re',68,60,30,15),item('lf crn U6! ~ becker',328,60,195,15),item('SECRETARY OF SENATE',430,590,110)];
 const kept=printedAmendmentItems(items,styles),layout=extractPageLayout(kept,{fnArray:[],argsArray:[]},{},styles);
 assert.deepEqual(kept.map(i=>i.str),['Amendment1','Onpage2, inline1, strikeout “old” andinsert:','New printed text.']);
 const rules=parseAmendments(layout.text);assert.equal(rules.length,1);assert.equal(rules[0].page,2);assert.equal(rules[0].lineStart,1);assert.equal(rules[0].insertText,'New printed text.');assert.deepEqual(rules[0].deleteText,['old']);
 const display=amendmentDisplays(makeDocument([layout.text],'instructions'));assert.equal(display.length,1);assert.equal(display[0].payload.text,'New printed text.');
});
test('ordinary text, quoted stamp words, dates and low printed payloads remain intact',()=>{
 const items=[item('Amendment 1',260,620,80,12,'print'),item('On page 1, insert:',115,600,100,12,'print'),item('ADOPTED and SECRETARY OF SENATE are content.',80,580,410,12,'print'),item('AUG 21 2026',80,560,100,12,'print'),item('Retain this text near the bottom.',80,50,220,12,'print')];
 assert.deepEqual(printedAmendmentItems(items,styles),items);
 const handwriting=item('Amendment 999 insert handwritten words',80,500,200,12,'hand');assert.deepEqual(printedAmendmentItems([handwriting,...items],styles),items);
});
