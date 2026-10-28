import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Report} from '../src/contracts';
import {cacheReport,cachedReport,clearReports,count,clearCounters,markStale} from '../src/storage';
let session:Record<string,unknown>;let local:Record<string,unknown>;
function area(data:()=>Record<string,unknown>){return {get:vi.fn(async(key:string)=>({[key]:structuredClone(data()[key])})),set:vi.fn(async(values:Record<string,unknown>)=>{Object.assign(data(),structuredClone(values));}),remove:vi.fn(async(keys:string|string[])=>{for(const k of Array.isArray(keys)?keys:[keys])delete data()[k];})};}
beforeEach(()=>{session={};local={};vi.stubGlobal('chrome',{storage:{session:area(()=>session),local:area(()=>local)}});});
const report=(id:string)=>({id,origin:'https://example.test'} as Report);
describe('bounded local cache and counters',()=>{
 it('evicts to ten reports and replaces a tab result',async()=>{for(let i=0;i<12;i++)await cacheReport(report('r'+i),i,'doc');expect((session.reports as unknown[])).toHaveLength(10);await cacheReport(report('replacement'),11,'doc');expect((session.reports as unknown[])).toHaveLength(10);expect((await cachedReport(11))?.id).toBe('replacement');});
 it('expires, invalidates and clears reports',async()=>{await cacheReport(report('r'),1,'doc');await markStale(1);expect(await cachedReport(1)).toBeNull();await cacheReport(report('fresh'),1,'doc');(session.reports as {savedAt:number}[])[0].savedAt=Date.now()-31*60_000;expect(await cachedReport(1)).toBeNull();await clearReports();expect(session.reports).toBeUndefined();});
 it('does not resurrect cache after a serialized clear',async()=>{const a=cacheReport(report('r'),1,'doc');const b=clearReports();await Promise.all([a,b]);expect(session.reports).toBeUndefined();});
 it('does not cache cancelled snapshots',async()=>{await expect(cacheReport(report('cancelled'),1,'doc',()=>false)).rejects.toThrow('INTERRUPTED');expect(session.reports).toBeUndefined();});
 it('serializes concurrent local counter increments without event history',async()=>{await Promise.all(Array.from({length:20},()=>count('audit_completed')));expect(local.counters).toEqual({audit_completed:20});await clearCounters();expect(local.counters).toBeUndefined();});
});
