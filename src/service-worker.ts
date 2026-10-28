import type { Report, Weights } from './contracts';
import {validateWeights,defaultWeights} from './scoring';
import { extractPage } from './extractors';
import { makeReport } from './reports';
import { count, EVENTS, cacheReport, cachedReport, clearCounters, markStale, clearReports, mutateSession } from './storage';
interface Grant {tabId:number;windowId:number;generation:string;}
interface Job {id:string;tabId:number;generation:string;phase:'extracting'|'evaluating'|'completed'|'interrupted'|'failed';startedAt:number;deadline:number;documentId?:string;}
let activeJob:string|null=null;
const PANEL=chrome.runtime.getURL('sidepanel.html');
const errorResponse=(code:string)=>({ok:false as const,error:code});
void chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.runtime.onInstalled.addListener(()=>{activeJob=null;void mutateSession(()=>chrome.storage.session.remove(['reports','job','grant']));});
chrome.action.onClicked.addListener(tab=>{
 if(tab.id===undefined)return;
 // Call open synchronously inside gesture; no await before this call.
 void chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});
 const grant:Grant={tabId:tab.id,windowId:tab.windowId,generation:crypto.randomUUID()};
 activeJob=null;void mutateSession(()=>chrome.storage.session.set({grant,job:null}));
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading')void invalidate(tabId);});
chrome.tabs.onRemoved.addListener(tabId=>{void invalidate(tabId);});
async function invalidate(tabId:number){
 const data=await chrome.storage.session.get(['grant','job']);const grant=data.grant as Grant|undefined;
 if(grant?.tabId===tabId){activeJob=null;await chrome.storage.session.remove(['grant','job']);}
 await markStale(tabId);
}
async function target():Promise<Grant>{
 const {grant}=await chrome.storage.session.get('grant') as {grant?:Grant};
 if(!grant)throw Error('ACTION_REQUIRED');
 const tabs=await chrome.tabs.query({active:true,windowId:grant.windowId});
 if(tabs[0]?.id!==grant.tabId)throw Error('ACTION_REQUIRED');
 const tab=await chrome.tabs.get(grant.tabId);
 if(!tab.url||!/^https?:\/\//.test(tab.url))throw Error('UNSUPPORTED_PAGE');
 const url=new URL(tab.url);
 if(url.hostname==='chromewebstore.google.com'||(url.hostname==='chrome.google.com'&&url.pathname.startsWith('/webstore')))throw Error('UNSUPPORTED_PAGE');
 return grant;
}
async function assertCurrent(job:Job){
 if(activeJob!==job.id||Date.now()>job.deadline)throw Error('INTERRUPTED');
 const grant=await target();if(grant.generation!==job.generation)throw Error('ACTION_REQUIRED');
}
async function audit():Promise<{ok:true;report:Report}|{ok:false;error:string}>{
 let job:Job|undefined;
 try{
 const grant=await target();if(activeJob)throw Error('BUSY');
 job={id:crypto.randomUUID(),tabId:grant.tabId,generation:grant.generation,phase:'extracting',startedAt:Date.now(),deadline:Date.now()+10_000};
 activeJob=job.id;await chrome.storage.session.set({job});await count('audit_started');
 const result=await chrome.scripting.executeScript({target:{tabId:grant.tabId},func:extractPage});
 await assertCurrent(job);
 const entry=result[0];const snapshot=entry?.result;
 if(!snapshot||entry.frameId!==0||typeof entry.documentId!=='string'||JSON.stringify(snapshot).length>2*1024*1024||snapshot.version!=='0.1')throw Error('INVALID_SNAPSHOT');
 if(snapshot.classification==='blocked')throw Error('ACCESS_BLOCKED');
 job.documentId=entry.documentId;job.phase='evaluating';await chrome.storage.session.set({job});
 const settings=await chrome.storage.local.get('weights');
 const weights=settings.weights?validateWeights(settings.weights as Weights):defaultWeights;
 const report=await makeReport(snapshot,weights);await assertCurrent(job);
 job.phase='completed';await cacheReport(report,job.tabId,entry.documentId,()=>activeJob===job!.id&&Date.now()<=job!.deadline,job);await assertCurrent(job);
 await count('audit_completed');await assertCurrent(job);
 return {ok:true,report};
 }catch(error){
 const code=error instanceof Error?error.message:'';
 const allowed=['ACTION_REQUIRED','UNSUPPORTED_PAGE','BUSY','INTERRUPTED','INVALID_SNAPSHOT','SNAPSHOT_TOO_LARGE','ACCESS_BLOCKED'];
 if(job&&activeJob===job.id){job.phase='failed';await chrome.storage.session.set({job});await count('audit_failed');}
 return errorResponse(allowed.includes(code)?code:'ANALYSIS_FAILED');
 }finally{if(job&&activeJob===job.id)activeJob=null;}
}
chrome.runtime.onConnect.addListener(port=>{
 if(port.name!=='panel'||port.sender?.id!==chrome.runtime.id||port.sender?.url!==PANEL){port.disconnect();return;}
 port.onDisconnect.addListener(()=>{if(activeJob){activeJob=null;void chrome.storage.session.get('job').then(({job})=>{if(job) return chrome.storage.session.set({job:{...(job as Job),phase:'interrupted'}});});}});
});
chrome.runtime.onMessage.addListener((message:unknown,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id||sender.url!==PANEL||sender.tab||!message||typeof message!=='object')return false;
 const m=message as Record<string,unknown>;
 if(typeof m.type!=='string'||JSON.stringify(m).length>1000){sendResponse(errorResponse('INVALID_MESSAGE'));return false;}
 const allowedKeys=m.type==='set_weights'?['type','weights']:['type','event'];const keys=Object.keys(m);if(keys.some(k=>!allowedKeys.includes(k))){sendResponse(errorResponse('INVALID_MESSAGE'));return false;}
 const run=async()=>{
 switch(m.type){
 case 'analyse':return audit();
 case 'get_weights':{const data=await chrome.storage.local.get('weights');return {ok:true,weights:data.weights??defaultWeights};}
 case 'set_weights':{try{if(!m.weights||typeof m.weights!=='object'||Array.isArray(m.weights))return errorResponse('INVALID_WEIGHTS');const weights=validateWeights(m.weights as Weights);await chrome.storage.local.set({weights});return {ok:true,weights};}catch{return errorResponse('INVALID_WEIGHTS');}}
 case 'init':{
 const {job}=await chrome.storage.session.get('job') as {job?:Job};
 if(job&&['extracting','evaluating'].includes(job.phase)&&activeJob!==job.id){job.phase='interrupted';await chrome.storage.session.set({job});}
 try{const grant=await target();return {ok:true,ready:true,report:await cachedReport(grant.tabId),interrupted:job?.phase==='interrupted'};}
 catch{return {ok:true,ready:false,report:null,interrupted:job?.phase==='interrupted'};}}
 case 'event':if(typeof m.event==='string'&&(EVENTS as readonly string[]).includes(m.event)){await count(m.event as typeof EVENTS[number]);return {ok:true};}return errorResponse('INVALID_MESSAGE');
 case 'clear':activeJob=null;await clearReports();await clearCounters();return {ok:true};
 default:return errorResponse('INVALID_MESSAGE');
 }
 };
 void run().then(sendResponse).catch(()=>sendResponse(errorResponse('INTERNAL_ERROR')));return true;
});
