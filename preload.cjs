'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('amendsIn',Object.freeze({chooseOutputFolder:()=>ipcRenderer.invoke('amends-in:choose-folder'),saveBatch:request=>ipcRenderer.invoke('amends-in:save-batch',request)}));
