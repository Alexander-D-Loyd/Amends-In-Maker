import test from 'node:test';
import assert from 'node:assert/strict';
import {labelScannedBillMargins} from '../app/bill-ocr-policy.mjs';

const item=(str,x,y,width,height=12)=>({str,width,height,transform:[height,0,0,height,x,y]});
function page(numbers,{right=48,bodyLeft=78,step=20,height=12,text='Original legislative wording retained.',top=700}={}){
 return numbers.flatMap((n,i)=>{const value=String(n),w=value.length*6;return [item(value,right-w,top-i*step,w,height),...(text===null?[]:[item(text,bodyLeft,top-i*step,text.length*5,height)])];});
}
const labels=items=>items.filter(i=>i.structuralMargin).map(i=>i.str);
function calibration(){const state={columns:[]};assert.equal(labels(labelScannedBillMargins(page([1,2,3,4,5,6]),612,state)).length,6);return state;}

test('a previous confirmed column identifies genuine one-, two- and three-line later pages',()=>{
 const state=calibration();assert.equal(state.columns.length,1);assert.deepEqual(state.columns[0],{width:612,right:48,bodyLeft:78,height:12,cadence:20,evidenceRows:6});
 for(const numbers of [[1],[1,2],[1,2,3]]){const original=page(numbers),before=structuredClone(original),result=labelScannedBillMargins(original,612,state);assert.deepEqual(labels(result),numbers.map(n=>'line '+n));assert.deepEqual(original,before);assert.deepEqual(result.filter(i=>!i.structuralMargin).map(i=>i.str),original.filter((_,i)=>i%2).map(i=>i.str));}
 assert.equal(state.columns.length,1);
});

test('sparse pages cannot teach a column or inherit evidence from another PDF',()=>{
 for(const numbers of [[1],[1,2],[1,2,3]]){const state={columns:[]};assert.deepEqual(labels(labelScannedBillMargins(page(numbers),612,state)),[]);assert.deepEqual(state.columns,[]);assert.deepEqual(labels(labelScannedBillMargins(page(numbers),612)),[]);}
 const first=calibration(),second={columns:[]};assert.deepEqual(labels(labelScannedBillMargins(page([1,2,3]),612,second)),[]);assert.equal(first.columns.length,1);assert.deepEqual(second.columns,[]);
});

test('learned digits align by right edge, including later two-digit line numbers',()=>{
 const state=calibration();assert.deepEqual(labels(labelScannedBillMargins(page([10,11,12]),612,state)),['line 10','line 11','line 12']);assert.deepEqual(labels(labelScannedBillMargins(page([10,11,12],{right:52}),612,state)),[]);
});

test('different page widths, body columns, font sizes and row cadence do not inherit a margin',()=>{
 const state=calibration();for(const [items,width]of [[page([1,2,3]),600],[page([1,2,3],{bodyLeft:84}),612],[page([1,2,3],{right:42}),612],[page([1,2,3],{height:16}),612],[page([1,2,3],{step:30}),612],[page([1,3]),612],[page([1,2,4,5,7]),612]])assert.deepEqual(labels(labelScannedBillMargins(items,width,state)),[],JSON.stringify({width,items}));
});

test('numbered prose, punctuated numbers and number-only blank rows are not promoted from nearby columns',()=>{
 const state=calibration();for(const items of [page(['1.','2.','3.']),page([1,2,3],{right:74,bodyLeft:80}),page([1,2,3],{bodyLeft:110}),page([1,2,3],{text:null})])assert.deepEqual(labels(labelScannedBillMargins(items,612,state)),[]);
 const blankMiddle=page([1,2,3]);blankMiddle.splice(3,1);assert.deepEqual(labels(labelScannedBillMargins(blankMiddle,612,state)),[]);
});

test('short body wording is recognized only with a previously evidenced column',()=>{
 const state=calibration(),short=page([1,2,3],{text:'End.'});assert.deepEqual(labels(labelScannedBillMargins(short,612,state)),['line 1','line 2','line 3']);assert.deepEqual(labels(labelScannedBillMargins(short,612,{columns:[]})),[]);
});

test('irregular four-row layouts keep legacy behavior but cannot calibrate later sparse pages',()=>{
 const state={columns:[]},items=page([1,2,3,4],{step:80});assert.equal(labels(labelScannedBillMargins(items,612,state)).length,4);assert.deepEqual(state.columns,[]);assert.deepEqual(labels(labelScannedBillMargins(page([1,2,3]),612,state)),[]);
});

test('calibration for a different page size must be established independently',()=>{
 const state=calibration();assert.deepEqual(labels(labelScannedBillMargins(page([1,2,3]),700,state)),[]);labelScannedBillMargins(page([1,2,3,4]),700,state);assert.equal(state.columns.length,2);assert.deepEqual(labels(labelScannedBillMargins(page([1,2,3]),700,state)),['line 1','line 2','line 3']);
});
