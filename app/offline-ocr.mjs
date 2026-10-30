// Loaded on demand for printed scanned pages; every engine URL is app-local.
let queue=Promise.resolve();
export async function createOfflineOcr(logger=()=>{}){
 let release;const previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;
 let worker;try{
 const {default:{createWorker}}=await import('./vendor/ocr/tesseract.esm.min.js');
 const base=new URL('./vendor/ocr/',import.meta.url).href;
 worker=await createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base.replace(/\/$/,''),workerBlobURL:false,gzip:false,cacheMethod:'none',logger});
 await worker.setParameters({tessedit_pageseg_mode:'3',user_defined_dpi:'216'});
 const terminate=worker.terminate;let closing;
 worker.terminate=()=>closing??=Promise.resolve().then(()=>terminate()).finally(release);
 return worker;
 }catch(error){try{await worker?.terminate();}finally{release();}throw error;}
}
