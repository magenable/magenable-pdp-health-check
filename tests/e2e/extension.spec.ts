import {test,expect,chromium,type BrowserContext,type CDPSession,type Page,type Worker} from '@playwright/test';
import {createServer,type Server} from 'node:http';import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {productPage} from '../../fixtures/pages';
import {stockPage} from '../../fixtures/stock';
import {familyPage,marketplacePage,blockedPage} from '../../fixtures/hybrid';
let server:Server;let origin:string;
test.beforeAll(async()=>{server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');const url=new URL(req.url!,'http://localhost');if(url.pathname==='/hybrid-family'){res.end(familyPage());return;}if(url.pathname==='/hybrid-marketplace'){res.end(marketplacePage({splitOnly:true}));return;}if(url.pathname==='/blocked'){res.statusCode=403;res.end(blockedPage);return;}if(url.pathname==='/stock-fixture'){res.end(stockPage());return;}if(url.pathname==='/other')res.end('<html><title>About us</title><main><h1>About us</h1><p>Company information.</p></main></html>');else res.end(productPage({platform:url.searchParams.get('platform')??'custom',schema:(url.searchParams.get('schema')??'valid') as 'valid',outOfStock:url.searchParams.has('out')}));}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
test.afterAll(()=>{server.close();});
class Panel {
 private sequence=0;private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 constructor(private root:CDPSession,private session:string){root.on('Target.receivedMessageFromTarget',(event:any)=>{if(event.sessionId!==session)return;const message=JSON.parse(event.message);const pending=this.pending.get(message.id);if(pending){this.pending.delete(message.id);message.error?pending.reject(Error(JSON.stringify(message.error))):pending.resolve(message.result);}});}
 async command(method:string,params:Record<string,unknown>={}){const id=++this.sequence;const result=new Promise<any>((resolve,reject)=>this.pending.set(id,{resolve,reject}));await this.root.send('Target.sendMessageToTarget',{sessionId:this.session,message:JSON.stringify({id,method,params})});return result;}
 async evaluate<T=any>(expression:string):Promise<T>{const r=await this.command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value as T;}
}
async function setup(options:{tallWindow?:boolean}={}){
 const profile=await mkdtemp(path.join(tmpdir(),'pdp-e2e-'));const extension=path.resolve('dist');
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging','--no-sandbox',...(options.tallWindow?['--window-size=1600,1500']:[])]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;const root=await context.browser()!.newBrowserCDPSession();const page=await context.newPage();const requests:string[]=[];context.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('chrome-extension:')&&!r.url().startsWith('data:'))requests.push(r.url());});
 async function grant(){await page.bringToFront();const {targetInfos}=await root.send('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]});const target=targetInfos.find(t=>t.url===page.url());if(!target)throw Error('No actual tab target');await root.send('Extensions.triggerAction',{id,targetId:target.targetId});await expect.poll(async()=>Boolean((await worker.evaluate(()=>chrome.storage.session.get('grant'))).grant)).toBe(true);}
 async function panel(){await expect.poll(async()=>{const {targetInfos}=await root.send('Target.getTargets');return targetInfos.some(t=>t.url===`chrome-extension://${id}/sidepanel.html`);}).toBe(true);const {targetInfos}=await root.send('Target.getTargets');const target=targetInfos.find(t=>t.url===`chrome-extension://${id}/sidepanel.html`)!;const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});const p=new Panel(root,sessionId);await expect.poll(()=>p.evaluate("document.readyState==='complete'")).toBe(true);return p;}
 async function close(){await context.close();await rm(profile,{recursive:true,force:true});}
 return {context,worker,id,root,page,requests,grant,panel,close};
}
async function audit(env:Awaited<ReturnType<typeof setup>>,panel:Panel){const old=await env.worker.evaluate(async()=>{const d=await chrome.storage.session.get('reports');return (d.reports as any[])?.[0]?.report.id;});await panel.evaluate("document.getElementById('analyse').click()");await expect.poll(()=>panel.evaluate("document.getElementById('status').textContent"),{timeout:12000}).toMatch(/Analysis complete|No product page detected|Product page identity is unconfirmed|failed|cannot|Click the extension/);await expect.poll(async()=>{const d=await env.worker.evaluate(()=>chrome.storage.session.get('reports'));return (d.reports as any[])?.[0]?.report.id;},{timeout:12000}).not.toBe(old);const d=await env.worker.evaluate(()=>chrome.storage.session.get('reports'));return (d.reports as any[])[0].report;}

test('actual action opens native panel; manual audit, independent prices, rerun, export and no network',async()=>{
 const e=await setup();try{
 await e.page.goto(origin+'/product?secret=do-not-retain');const before=await e.page.content();await e.grant();const p=await e.panel();expect((await e.worker.evaluate(()=>chrome.storage.session.get('reports'))).reports??[]).toHaveLength(0);
 const report=await audit(e,p);expect(report.findings).toHaveLength(28);expect(await p.evaluate("document.getElementById('overall-evidence').textContent")).toContain('Scores apply only to evaluated checks');expect(report.origin).toBe(origin);expect(report.findings.find((f:any)=>f.ruleId==='SD-05').status).toBe('pass');expect(report.findings.find((f:any)=>f.ruleId==='UX-03').status).toBe('pass');expect(await e.page.content()).toBe(before);
 expect(JSON.stringify(report)).not.toMatch(/do-not-collect|customer@example|do-not-retain/);
 await e.page.locator('[itemprop="price"]').evaluate(el=>el.textContent='149.00 AUD');const next=await audit(e,p);expect(next.findings.find((f:any)=>f.ruleId==='SD-05').status).toBe('fail');expect(next.snapshotHash).not.toBe(report.snapshotHash);
 await mkdir('artifacts/downloads',{recursive:true});await e.root.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve('artifacts/downloads'),eventsEnabled:true});
 await p.evaluate("document.getElementById('copy').click()");await expect.poll(async()=>{const d=await e.worker.evaluate(()=>chrome.storage.local.get('counters'));return (d.counters as any)?.report_copied;}).toBe(1);
 await p.evaluate("document.getElementById('json').click()");await expect.poll(async()=>{try{return JSON.parse(await readFile('artifacts/downloads/magenable-pdp-report.json','utf8')).id;}catch{return '';}}).toBe(next.id);
 await expect.poll(async()=>{const d=await e.worker.evaluate(()=>chrome.storage.local.get('counters'));return (d.counters as any)?.report_exported;}).toBe(1);
 await mkdir('artifacts',{recursive:true});const image=await p.command('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/sidepanel.png',Buffer.from(image.data,'base64'));
 expect(e.requests).toEqual([]);expect(await p.evaluate("document.querySelectorAll('script:not([src])').length")).toBe(0);
 }finally{await e.close();}
});

test('tab switch, navigation and restricted page do not silently acquire access',async()=>{
 const e=await setup();try{await e.page.goto(origin+'/product');await e.grant();const p=await e.panel();await audit(e,p);
 const other=await e.context.newPage();await other.goto(origin+'/other');await other.bringToFront();const switched=await p.evaluate("chrome.runtime.sendMessage({type:'analyse'})");expect(switched.ok).toBe(false);expect(switched.error).toBe('ACTION_REQUIRED');
 await e.page.bringToFront();await e.page.goto(origin+'/product?changed=1');await expect.poll(async()=>Boolean((await e.worker.evaluate(()=>chrome.storage.session.get('grant'))).grant)).toBe(false);const navigated=await p.evaluate("chrome.runtime.sendMessage({type:'analyse'})");expect(navigated.error).toBe('ACTION_REQUIRED');
 await e.page.goto('chrome://version');await e.grant();const restricted=await p.evaluate("chrome.runtime.sendMessage({type:'analyse'})");expect(restricted.ok).toBe(false);expect(restricted.error).toBe('UNSUPPORTED_PAGE');
 }finally{await e.close();}
});

test('synthetic Magento Shopify WooCommerce custom shapes and schema failure/ambiguity/non-PDP',async()=>{
 const e=await setup();try{for(const platform of ['magento','shopify','woocommerce','custom']){await e.page.goto(origin+'/product?platform='+platform);await e.grant();const p=await e.panel();const report=await audit(e,p);expect(report.classification).toBe('product');expect(report.findings.find((f:any)=>f.ruleId==='SD-01').status).toBe('pass');}
 for(const schema of ['missing','invalid','multiple']){await e.page.goto(origin+'/product?schema='+schema);await e.grant();const p=await e.panel();const report=await audit(e,p);expect(report.findings.find((f:any)=>f.ruleId==='SD-05').status).toBe('not_evaluated');if(schema==='missing')expect(report.findings.find((f:any)=>f.ruleId==='SD-01').status).toBe('fail');}
 await e.page.goto(origin+'/other');await e.grant();const p=await e.panel();const report=await audit(e,p);expect(report.classification).toBe('non_product');expect(report.overallScore).toBe(null);
 }finally{await e.close();}
});

test('untrusted evidence stays text, message scope, cache TTL, counters clear and widths',async()=>{
 const e=await setup();try{await e.page.goto(origin+'/product');await e.page.locator('h1').evaluate(el=>el.textContent='<img src=x onerror=alert(1)>');await e.grant();const p=await e.panel();await audit(e,p);
 expect(await p.evaluate("document.querySelectorAll('#categories img').length")).toBe(0);
 expect(await p.evaluate("[...document.images].map(img=>({id:img.id,alt:img.alt,src:new URL(img.src).pathname}))")).toEqual([{id:'brand-logo',alt:'Magenable',src:'/magenable-logo-colour.png'}]);
 const invalid=await p.evaluate("chrome.runtime.sendMessage({type:'analyse',url:'https://evil.invalid'})");expect(invalid.error).toBe('INVALID_MESSAGE');
 const invalidWeights=await p.evaluate("chrome.runtime.sendMessage({type:'set_weights',weights:{seo:0,structured:0,geo:0,conversion:0,performance:0}})");expect(invalidWeights.error).toBe('INVALID_WEIGHTS');
 const saved=await p.evaluate("chrome.runtime.sendMessage({type:'set_weights',weights:{seo:25,structured:25,geo:20,conversion:20,performance:0}})");expect(saved.ok).toBe(true);
 const customized=await audit(e,p);expect(customized.configuredWeights.performance).toBe(0);expect(customized.effectiveWeights.performance).toBeUndefined();
 for(const width of [320,400,600]){await p.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});expect(await p.evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);}
 await e.worker.evaluate(async()=>{const data=await chrome.storage.session.get('reports');const reports=data.reports as any[];reports[0].savedAt=Date.now()-31*60_000;await chrome.storage.session.set({reports});});
 const expired=await p.evaluate("chrome.runtime.sendMessage({type:'init'})");expect(expired.report).toBeNull();
 await p.evaluate("document.getElementById('clear').click()");await expect.poll(async()=>{const d=await e.worker.evaluate(()=>chrome.storage.session.get('reports'));return d.reports;}).toBeUndefined();
 expect((await e.worker.evaluate(()=>chrome.storage.local.get('counters'))).counters).toBeUndefined();
 }finally{await e.close();}
});

test('20 real local audits reproducible within target; worker restart restores no automatic audit',async()=>{
 const e=await setup();try{await e.page.goto(origin+'/product');await e.grant();const p=await e.panel();const samples:number[]=[];const hashes=new Set();const scores=new Set();for(let i=0;i<20;i++){const start=performance.now();const report=await audit(e,p);samples.push(performance.now()-start);hashes.add(report.snapshotHash);scores.add(report.overallScore);}expect(hashes.size).toBe(1);expect(scores.size).toBe(1);samples.sort((a,b)=>a-b);expect(samples[18]).toBeLessThan(10000);
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/benchmark.json',JSON.stringify({browser:e.context.browser()?.version(),runs:20,p95ms:samples[18],worstMs:samples[19],samples},null,2));
 await e.worker.evaluate(async()=>{await chrome.storage.session.set({job:{id:'interrupted-fixture',phase:'extracting',tabId:0,startedAt:Date.now(),deadline:Date.now()+10000}});});
 const session=await e.context.newCDPSession(e.page);await session.send('ServiceWorker.enable');const versions:any[]=[];session.on('ServiceWorker.workerVersionUpdated',ev=>versions.push(...ev.versions));await session.send('ServiceWorker.stopAllWorkers');
 const recovered=await p.evaluate("chrome.runtime.sendMessage({type:'init'})");expect(recovered.interrupted).toBe(true);const data=await p.evaluate("chrome.storage.local.get('counters')");expect(data.counters.audit_completed).toBe(20);
 }finally{await e.close();}
});

test('native panel preserves scoped microdata/stock in UI and actual exports; real same-context mismatch',async()=>{
 const e=await setup();const folder=await mkdtemp(path.join(tmpdir(),'pdp-stock-download-'));
 try{
 await e.page.goto(origin+'/stock-fixture');const before=await e.page.content();await e.grant();const p=await e.panel();const report=await audit(e,p);
 expect(report.structuredEvidence.source).toBe('microdata');expect(report.structuredEvidence.jsonldProducts).toBe(0);
 expect(report.stockObservations.map((o:any)=>[o.channel,o.location??'',o.status])).toEqual([['delivery','','in_stock'],['pickup','Central','backorder'],['pickup','Eastside','low_stock']]);
 expect(report.findings.find((f:any)=>f.ruleId==='UX-04').applicability).toBe('not_applicable');expect(report.findings.find((f:any)=>f.ruleId==='SD-06').status).toBe('not_evaluated');
 expect(await p.evaluate("document.getElementById('stock-observations').textContent")).toContain('Pickup — Central: Back-Order');
 expect(await p.evaluate("document.getElementById('structured-source').textContent")).toContain('Microdata');expect(await e.page.content()).toBe(before);
 await e.root.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:folder,eventsEnabled:true});await p.evaluate("document.getElementById('json').click()");
 const jsonFile=path.join(folder,'magenable-pdp-report.json');await expect.poll(async()=>{try{return JSON.parse(await readFile(jsonFile,'utf8')).id;}catch{return '';}}).toBe(report.id);
 const downloaded=JSON.parse(await readFile(jsonFile,'utf8'));expect(downloaded.stockObservations).toEqual(report.stockObservations);expect(JSON.stringify(downloaded)).not.toMatch(/private-user|Private enquiry/);
 await p.evaluate("document.getElementById('text').click()");const textFile=path.join(folder,'magenable-pdp-report.txt');await expect.poll(async()=>{try{return await readFile(textFile,'utf8');}catch{return '';}}).toContain('Pickup — Central: Back-Order');
 expect(await readFile(textFile,'utf8')).toContain('Structured source: microdata');
 await e.page.locator('[itemprop="offers"]').evaluate(el=>el.insertAdjacentHTML('beforeend','<link itemprop="availableDeliveryMethod" href="https://schema.org/ParcelService">'));
 await e.page.locator('.row .font-bold').first().evaluate(el=>el.textContent='Out of stock');const changed=await audit(e,p);
 expect(changed.findings.find((f:any)=>f.ruleId==='SD-06').status).toBe('fail');expect(changed.findings.find((f:any)=>f.ruleId==='SD-06').explanation).toContain('same explicitly aligned');
 expect(e.requests).toEqual([]);
 }finally{await e.close();await rm(folder,{recursive:true,force:true});}
});

test('visible status guide, keyboard disclosure, local logo and exact safe footer across narrow widths',async()=>{
 const e=await setup({tallWindow:true});try{
 await e.page.goto(origin+'/stock-fixture');const before=await e.page.content();await e.grant();const p=await e.panel();const report=await audit(e,p);
 expect(report.version).toBe('0.2.0');expect(report.ruleVersion).toBe('0.2.0');
 expect(await p.evaluate("document.querySelector('.brand-title h1').textContent")).toBe('Product Page Health Check');
 expect(await p.evaluate("document.getElementById('header-description').textContent")).toBe('Check online-store product pages for SEO, AI readiness and conversion opportunities.');
 expect(await p.evaluate("document.getElementById('header-assurance').textContent")).toBe('No account. Local analysis.');
 expect(await p.evaluate("document.querySelector('header').textContent")).not.toMatch(/100%|no data leaves|no page data uploaded/i);
 const meanings=await p.evaluate("document.getElementById('status-guide-text').textContent");
 for(const label of ['Pass','Warning','Fail','Not Evaluated','Not Applicable'])expect(meanings).toContain(label);
 expect(await p.evaluate("document.getElementById('status-guide').open")).toBe(true);
 expect(await p.evaluate("[...document.querySelectorAll('#categories details>summary')].filter(e=>e.title).length")).toBe(28);
 expect(await p.evaluate("({text:document.getElementById('website').textContent.trim(),href:document.getElementById('website').href,target:document.getElementById('website').target,rel:[...document.getElementById('website').relList]})")).toEqual({text:'Visit Magenable, Australian ecommerce and AI experts',href:'https://magenable.com.au/',target:'_blank',rel:['noopener','noreferrer','nofollow']});
 await p.command('Emulation.setFocusEmulationEnabled',{enabled:true});
 await p.command('Page.bringToFront');
 await p.evaluate("document.getElementById('status-guide-heading').focus()");
 expect(await p.evaluate('document.activeElement.id')).toBe('status-guide-heading');
 async function pressEnter(){await p.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await p.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});}
 await pressEnter();await expect.poll(()=>p.evaluate("document.getElementById('status-guide').open")).toBe(false);
 await pressEnter();await expect.poll(()=>p.evaluate("document.getElementById('status-guide').open")).toBe(true);
 async function pressSpace(){await p.command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',text:' ',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await p.command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});}
 await pressSpace();await expect.poll(()=>p.evaluate("document.getElementById('status-guide').open")).toBe(false);
 await pressSpace();await expect.poll(()=>p.evaluate("document.getElementById('status-guide').open")).toBe(true);
 await p.evaluate("document.activeElement.blur();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 const measurements=[];
 for(const width of [320,400,600]){
  await p.command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await p.evaluate("window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const dims=await p.evaluate("(()=>{const img=document.getElementById('brand-logo'),a=img.getBoundingClientRect(),b=document.querySelector('.brand-title h1').getBoundingClientRect(),guide=document.getElementById('status-guide');return {width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,logoLoaded:img.complete&&img.naturalWidth>0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,renderedWidth:a.width,renderedHeight:a.height,beside:a.right<=b.left&&a.top<b.bottom&&b.top<a.bottom,alt:img.alt,logoSource:new URL(img.src).pathname,guideHeight:guide.getBoundingClientRect().height,guideVisible:getComputedStyle(document.getElementById('status-guide-text')).display!=='none'};})()");
  expect(dims.logoLoaded).toBe(true);expect(dims.naturalWidth).toBe(207);expect(dims.naturalHeight).toBe(50);expect(dims.alt).toBe('Magenable');expect(dims.logoSource).toBe('/magenable-logo-colour.png');
  expect(dims.renderedWidth/dims.renderedHeight).toBeCloseTo(dims.naturalWidth/dims.naturalHeight,2);expect(dims.beside).toBe(true);expect(dims.scrollWidth).toBeLessThanOrEqual(dims.width);expect(dims.guideVisible).toBe(true);expect(dims.guideHeight).toBeLessThan(260);measurements.push(dims);
  await mkdir('artifacts/ux',{recursive:true});const image=await p.command('Page.captureScreenshot',{format:'png'});await writeFile(`artifacts/ux/header-status-guide-${width}.png`,Buffer.from(image.data,'base64'));
  await p.evaluate("document.getElementById('website').scrollIntoView({block:'center'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");const footer=await p.command('Page.captureScreenshot',{format:'png'});await writeFile(`artifacts/ux/footer-${width}.png`,Buffer.from(footer.data,'base64'));
 }
 await p.command('Emulation.setDeviceMetricsOverride',{width:320,height:1100,deviceScaleFactor:1,mobile:false});
 await p.evaluate("document.documentElement.style.fontSize=(parseFloat(getComputedStyle(document.documentElement).fontSize)*2)+'px'");
 const enlargedFits=await p.evaluate('document.documentElement.scrollWidth<=window.innerWidth');
 if(!enlargedFits)console.log('Text enlargement overflow',await p.evaluate("({inner:innerWidth,root:document.documentElement.scrollWidth,rootClient:document.documentElement.clientWidth,body:document.body.scrollWidth,scrollX,scrollContainers:[...document.querySelectorAll('body *')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth).slice(0,12).map(e=>({tag:e.tagName,id:e.id,class:e.className,text:e.textContent.slice(0,80),client:e.clientWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().toJSON()})),boxes:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth||r.left<0)}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,class:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))})"));
 expect(enlargedFits).toBe(true);
 await writeFile('artifacts/ux/measurements.json',JSON.stringify({browser:e.context.browser()?.version(),measurements,textEnlargement200Percent:true},null,2));
 expect(await e.page.content()).toBe(before);expect(e.requests).toEqual([]);
 }finally{await e.close();}
});

test('standards-first native family/marketplace reports, real export and explicit denial error',async()=>{
 const e=await setup();const folder=await mkdtemp(path.join(tmpdir(),'pdp-hybrid-export-'));
 try{
 await e.page.goto(origin+'/hybrid-family');const before=await e.page.content();await e.grant();let p=await e.panel();const family=await audit(e,p);
 expect(family.classification).toBe('product');expect(family.structuredEvidence.subject).toBe('group');expect(family.structuredEvidence.jsonldGroups).toBe(1);
 for(const id of ['SD-05','SD-06','SD-07'])expect(family.findings.find((f:any)=>f.ruleId===id).status).toBe('not_evaluated');
 expect(family.findings.find((f:any)=>f.ruleId==='SEO-01').status).toBe('pass');expect(family.stockObservations).toEqual([]);
 expect(await p.evaluate("document.getElementById('structured-source').textContent")).toContain('current variant not confirmed');
 expect(await p.evaluate("document.getElementById('categories').textContent")).toContain('Method: Rendered observation — best effort');
 expect(await e.page.content()).toBe(before);
 await e.root.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:folder,eventsEnabled:true});await p.evaluate("document.getElementById('json').click()");
 const exported=path.join(folder,'magenable-pdp-report.json');await expect.poll(async()=>{try{return JSON.parse(await readFile(exported,'utf8')).id;}catch{return '';}}).toBe(family.id);
 const data=JSON.parse(await readFile(exported,'utf8'));expect(data.structuredEvidence.subject).toBe('group');expect(data.findings.every((f:any)=>['standard','rendered','comparison'].includes(f.method))).toBe(true);expect(JSON.stringify(data)).not.toContain('private-form-value');
 await e.page.goto(origin+'/hybrid-marketplace');await e.grant();p=await e.panel();const market=await audit(e,p);
 expect(market.classification).toBe('product');expect(market.findings.find((f:any)=>f.ruleId==='UX-03').status).toBe('pass');expect(market.findings.find((f:any)=>f.ruleId==='UX-02').status).toBe('pass');expect(market.findings.find((f:any)=>f.ruleId==='SD-01').status).toBe('fail');expect(market.findings.find((f:any)=>f.ruleId==='SD-05').status).toBe('not_evaluated');expect(JSON.stringify(market)).not.toContain('do-not-read-private-value');
 await e.page.goto(origin+'/blocked');await e.grant();p=await e.panel();await p.evaluate("document.getElementById('analyse').click()");
 await expect.poll(()=>p.evaluate("document.getElementById('status').textContent")).toContain('access/security verification screen');
 expect(await p.evaluate("document.getElementById('report').hidden")).toBe(true);
 const counters=await e.worker.evaluate(()=>chrome.storage.local.get('counters'));expect((counters.counters as any).audit_completed).toBe(2);expect((counters.counters as any).audit_failed).toBe(1);expect(e.requests).toEqual([]);
 }finally{await e.close();await rm(folder,{recursive:true,force:true});}
});
