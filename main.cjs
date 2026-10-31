'use strict';
const {app,BrowserWindow,protocol,net,session,Menu,ipcMain,dialog}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {savePdfBatch}=require('./save-batch.cjs');
const {createOutputFolderStore}=require('./output-settings.cjs');
const authorizedFolders=new Set();const HOME='amends://local/index.html';
const outputFolders=createOutputFolderStore({settingsFile:()=>path.join(app.getPath('userData'),'output-settings.json'),authorizedFolders});
// Keep the remembered output folder when upgrading from the original name.
const userData=app.commandLine.hasSwitch('user-data-dir')?app.getPath('userData'):path.join(app.getPath('appData'),'Amends In Maker');
app.setName('AiM');
app.setPath('userData',userData);
if(process.platform==='win32')app.setAppUserModelId('Alexander-D-Loyd.AiM');
if(process.env.AMENDS_IN_QA==='1')app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'amends',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const trusted=event=>event.senderFrame===event.sender.mainFrame&&event.senderFrame.url===HOME;
ipcMain.handle('amends-in:get-output-folder',async event=>{if(!trusted(event))throw Error('Request denied.');return outputFolders.get();});
ipcMain.handle('amends-in:choose-folder',async event=>{if(!trusted(event))throw Error('Request denied.');const qa=process.env.AMENDS_IN_QA==='1',qaFolder=qa&&process.env.AMENDS_IN_QA_OUTPUT_FOLDER;const choice=qa&&process.env.AMENDS_IN_QA_CHOOSE_CANCEL==='1'?{canceled:true,filePaths:[]}:qaFolder?{canceled:false,filePaths:[qaFolder]}:await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'Choose where to save the Amends In PDFs',properties:['openDirectory','createDirectory']});if(choice.canceled||!choice.filePaths.length)return null;return outputFolders.remember(choice.filePaths[0]);});
ipcMain.handle('amends-in:save-batch',async(event,request)=>{if(!trusted(event))throw Error('Request denied.');await outputFolders.get();return savePdfBatch(request,{authorizedFolders});});
async function createWindow(){const qa=process.env.AMENDS_IN_QA==='1',win=new BrowserWindow({title:'AiM',icon:path.join(__dirname,'app/assets/aim-icon.ico'),width:1280,height:900,minWidth:760,minHeight:680,backgroundColor:'#201e22',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,...(qa?{offscreen:true,backgroundThrottling:false}:{})}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(url!==HOME)e.preventDefault();});win.once('ready-to-show',()=>{if(!qa)win.show();});await win.loadURL(HOME);}
app.whenReady().then(async()=>{const root=path.resolve(__dirname,'app');protocol.handle('amends',async request=>{try{const url=new URL(request.url);if(url.hostname!=='local')return new Response('Forbidden',{status:403});const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep))return new Response('Forbidden',{status:403});return await net.fetch(pathToFileURL(target).href);}catch{return new Response('Not found',{status:404});}});session.defaultSession.setPermissionRequestHandler((_wc,_permission,done)=>done(false));session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,done)=>done({cancel:true}));Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'AiM',submenu:[{role:'quit'}]},{label:'Edit',submenu:[{role:'copy'},{role:'selectAll'}]},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}]));await createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});});
app.on('window-all-closed',()=>app.quit());
