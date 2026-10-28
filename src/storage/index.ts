import type { Report } from '../contracts';
export const EVENTS=['extension_opened','audit_started','audit_completed','audit_failed','finding_expanded','report_copied','report_exported','website_clicked','consultation_clicked'] as const;
export type EventName=typeof EVENTS[number];
interface Cached {report:Report;tabId:number;documentId:string;savedAt:number;stale:boolean;}
let counterQueue:Promise<void>=Promise.resolve();
let sessionQueue:Promise<unknown>=Promise.resolve();
export function mutateSession<T>(operation:()=>Promise<T>):Promise<T>{const next=sessionQueue.catch(()=>{}).then(operation);sessionQueue=next;return next;}
export function count(event:EventName){counterQueue=counterQueue.catch(()=>{}).then(async()=>{const data=await chrome.storage.local.get('counters');const counters=(data.counters??{}) as Partial<Record<EventName,number>>;counters[event]=Math.min(1_000_000_000,(Number(counters[event])||0)+1);await chrome.storage.local.set({counters});});return counterQueue;}
export async function clearCounters(){await counterQueue;await chrome.storage.local.remove('counters');}
async function readCache(){const data=await chrome.storage.session.get('reports');return (data.reports??[]) as Cached[];}
export function cacheReport(report:Report,tabId:number,documentId:string,isCurrent:()=>boolean=()=>true,job?:unknown){return mutateSession(async()=>{
 const reports=await readCache();if(!isCurrent())throw Error('INTERRUPTED');
 const next=[{report,tabId,documentId,savedAt:Date.now(),stale:false},...reports.filter(r=>Date.now()-r.savedAt<30*60_000&&r.tabId!==tabId)].slice(0,10);
 await chrome.storage.session.set({reports:next,...(job?{job}:{})});
});}
export function cachedReport(tabId:number):Promise<Report|null>{return mutateSession(async()=>{
 const reports=await readCache();const valid=reports.filter(r=>Date.now()-r.savedAt<30*60_000);
 if(valid.length!==reports.length)await chrome.storage.session.set({reports:valid});return valid.find(r=>r.tabId===tabId&&!r.stale)?.report??null;
});}
export function markStale(tabId:number){return mutateSession(async()=>{const reports=await readCache();await chrome.storage.session.set({reports:reports.map(r=>r.tabId===tabId?{...r,stale:true}:r)});});}
export function clearReports(){return mutateSession(()=>chrome.storage.session.remove(['reports','job']));}
