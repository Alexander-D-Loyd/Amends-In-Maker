const MAX_PDF_BYTES=50*1024*1024;
const prepared=new WeakMap();
const check=signal=>{if(signal?.aborted)throw new DOMException('Reading cancelled.','AbortError');};
function validateFile(file){
 if(!file||typeof file.arrayBuffer!=='function'||!/^.*\.pdf$/i.test(file.name||''))throw Error('Choose a PDF file.');
 if(file.size!==undefined&&(!Number.isSafeInteger(file.size)||file.size<0))throw Error('The PDF file size is invalid.');
 if(file.size>MAX_PDF_BYTES)throw Error('This PDF exceeds the 50 MB limit.');
}
function validateLength(bytes){if(bytes.byteLength>MAX_PDF_BYTES)throw Error('This PDF exceeds the 50 MB limit.');}

// Read once before hashing. The parser reuses this exact source byte array;
// its worker receives a separate copy so the original cannot be transferred.
export async function readPdfBytes(file,{signal}={}){
 validateFile(file);check(signal);
 const data=await file.arrayBuffer();check(signal);
 if(!(data instanceof ArrayBuffer))throw Error('The PDF file could not be read as bytes.');
 const bytes=new Uint8Array(data);validateLength(bytes);
 prepared.set(bytes,{file,name:file.name,size:file.size,length:bytes.byteLength});return bytes;
}

export async function pdfFileBytes(file,{signal,preparedBytes}={}){
 if(preparedBytes===undefined)return readPdfBytes(file,{signal});
 validateFile(file);check(signal);
 const bound=preparedBytes instanceof Uint8Array&&prepared.get(preparedBytes);
 if(!bound||bound.file!==file||bound.name!==file.name||bound.size!==file.size||bound.length!==preparedBytes.byteLength)throw Error('The prepared PDF bytes do not belong to this unchanged file. Read the file again.');
 validateLength(preparedBytes);return preparedBytes;
}
