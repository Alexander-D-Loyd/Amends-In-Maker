// Embedded and bundled-standard fonts can omit the PDF.js boolean style
// flags. Their exported source face name is still evidence of a named style.
// Do not infer style from a generated font ID, family name, or the words drawn.
// These two original LCB faces are serif, but their embedded descriptors
// declare only the Symbolic flag. PDF.js consequently reports sans-serif.
const lcbSerifFaces=new Set(['TimesLDC','MinionPC']);
// This finite source-face table supplies conditional text-style evidence only.
// It does not certify the appearance of glyphs or change renderer decisions.
const sourceItalic=new Map([
 ['Times-Roman',false],['Times-Bold',false],['Times-Italic',true],['Times-BoldItalic',true],
 ['Helvetica',false],['Helvetica-Bold',false],['Helvetica-Oblique',true],['Helvetica-BoldOblique',true],
 ['Courier',false],['Courier-Bold',false],['Courier-Oblique',true],['Courier-BoldOblique',true]
]);
const nullableBool=value=>typeof value==='boolean'?value:null;
function fontStyleEvidence(font){
 const original=typeof font.name==='string'?font.name.replace(/^[A-Z]{6}\+/,''):null;
 const sourceFace=sourceItalic.has(original)?original:null,faceItalic=sourceFace===null?null:sourceItalic.get(sourceFace);
 const provenance=Object.freeze({version:1,sourceFace,faceItalic,italicFlag:nullableBool(font.italic),missingFile:nullableBool(font.missingFile),isType3Font:nullableBool(font.isType3Font),isInvalidPDFjsFont:nullableBool(font.isInvalidPDFjsFont)});
 const fontStyleConflict=faceItalic!==null&&provenance.italicFlag!==null&&faceItalic!==provenance.italicFlag;
 const italicKnown=faceItalic!==null&&!fontStyleConflict&&!provenance.missingFile&&!provenance.isType3Font&&!provenance.isInvalidPDFjsFont;
 return {italicKnown,fontStyleConflict,fontStyleProvenance:provenance};
}

// Validate the finite original-source record afresh. A legacy default false,
// a family name, a renderer boolean or italicKnown alone supplies no proof.
export function knownPdfRunItalic(run){
 const p=run?.fontStyleProvenance;
 if(run?.italicKnown!==true||run.fontStyleConflict!==false||typeof run.italic!=='boolean'||!p||p.version!==1||!sourceItalic.has(p.sourceFace))return null;
 if(['italicFlag','missingFile','isType3Font','isInvalidPDFjsFont'].some(key=>p[key]!==null&&typeof p[key]!=='boolean'))return null;
 const expected=sourceItalic.get(p.sourceFace);
 if(p.faceItalic!==expected||p.italicFlag!==null&&p.italicFlag!==expected||p.missingFile||p.isType3Font||p.isInvalidPDFjsFont||run.italic!==expected)return null;
 return expected;
}
export function pdfFontStyle(style={},font={}){
  const name=typeof font.name==='string'?font.name:typeof style.name==='string'?style.name:'';
  const sourceFace=name.replace(/^[A-Z]{6}\+/,'');
  const family=style.fontFamily==='sans-serif'&&lcbSerifFaces.has(sourceFace)?{fontFamily:'serif'}:{};
  const face=/(?:^|[-_,+])((?:Bold|SemiBold|DemiBold)?(?:Italic|Oblique)|Bold|SemiBold|DemiBold)(?:MT|PS)?$/i.exec(name)?.[1]||'';
  return {...style,...family,name,bold:typeof font.bold==='boolean'?font.bold:/bold/i.test(face),italic:typeof font.italic==='boolean'?font.italic:/italic|oblique/i.test(face),...fontStyleEvidence(font)};
}
