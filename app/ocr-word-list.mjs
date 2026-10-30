import Typo from './vendor/typo-ocr.mjs';
import guide from './data/lcb-spelling-words.json' with {type:'json'};
import {ocrDictionary} from './ocr-text.mjs';
export function expandedOcrWordList(dic,aff){const checker=new Typo('en_US',aff,dic,{platform:'any'});return ocrDictionary(dic,[...checker.dictionaryTable.keys(),...guide.words.map(r=>r.word)]);}
let wordsPromise;
export function loadOcrWordList(){return wordsPromise??=Promise.all(['index.dic','index.aff'].map(async name=>{const response=await fetch(new URL('./vendor/en_US/'+name,import.meta.url));if(!response.ok)throw Error('A bundled OCR word-spacing asset is missing. Re-extract the complete application folder.');return response.text();})).then(([dic,aff])=>expandedOcrWordList(dic,aff));}
