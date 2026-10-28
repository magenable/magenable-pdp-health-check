import type { Report } from '../contracts';
import { categories } from '../contracts';
import { summary } from '../reports';
import {stockLine} from '../rules/structured-evidence';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=(text:string)=>{$('status').textContent=text;};
let report:Report|null=null;let running=false;
const port=chrome.runtime.connect({name:'panel'});void port;
const send=(type:string,event?:string)=>chrome.runtime.sendMessage({type,...(event?{event}:{})});
const event=(name:string)=>{void send('event',name).catch(()=>{});};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text:string,parent:HTMLElement){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;}
const statusLabels={pass:'Pass',warning:'Warning',fail:'Fail',not_evaluated:'Not Evaluated'};
const statusHelp={pass:'The assessed criteria were met; this is not a complete audit guarantee.',warning:'An issue or improvement needs review. Check the evidence and confidence.',fail:'Available evidence supports a problem with the assessed criteria.',not_evaluated:'Not enough reliable evidence to assess this check; not counted as a pass or fail.'};
const labels={seo:'SEO',structured:'Structured Data',geo:'AI Discoverability',conversion:'Conversion UX',performance:'Local Technical Observations'};
function render(r:Report){
 report=r;$('report').hidden=false;$('overall').textContent=`Overall: ${r.overallScore??'Insufficient evidence'}`;
 const configuredTotal=Object.values(r.configuredWeights).reduce((sum,w)=>sum+w,0);
 const coverage=categories.reduce((sum,c)=>sum+(r.categories[c].coverage??0)*r.configuredWeights[c],0)/configuredTotal;
 $('overall-evidence').textContent=`Evidence coverage: ${Math.round(coverage*100)}% across configured categories. Scores apply only to evaluated checks, not a complete professional audit.${r.overallScore===null&&r.classification==='product'?' No overall score: SEO, structured data and at least one readiness category must meet their coverage gates. Individual findings remain useful.':''}`;
 $('page').textContent=`Page origin: ${r.origin}`;$('capture').textContent=`Captured ${r.capturedAt} · rules ${r.ruleVersion}. Cached results are not a new scan.`;
 $('weights').textContent='Effective weights: '+Object.entries(r.effectiveWeights).map(([k,v])=>`${labels[k as keyof typeof labels]} ${Math.round(v!)}%`).join(', ');
 const source=r.structuredEvidence;
 $('structured-source').textContent=source?`Subject: ${source.subject==='group'?'ProductGroup family — current variant not confirmed':source.subject==='product'?'matched Product':'no uniquely matched subject'} · ${source.jsonldGroups??0} ProductGroup families. Structured evidence: ${source.source==='none'?'no uniquely matched Product':source.source==='microdata'?'Microdata — supported subset':'JSON-LD — core Product/Offer checks'} · ${source.jsonldProducts} JSON-LD / ${source.microdataProducts} microdata Product candidates. Not full rich-result validation.`:'';
 $('stock-observations').replaceChildren();
 for(const observation of r.stockObservations??[])node('li',`${stockLine(observation)} · ${observation.confidence} confidence · visible page evidence`,$('stock-observations'));
 if(!r.stockObservations?.length)node('li','No independent visible stock statement captured. Structured data and an enabled button are not substituted for visible stock.',$('stock-observations'));
 const actionable=r.findings.filter(f=>(f.status==='fail'||f.status==='warning')&&!f.advisory&&f.confidence!=='low');
 $('issues').textContent=`${actionable.length} scored ${actionable.length===1?'issue':'issues'}. Advisory and unavailable findings are separate.`;
 $('priorities').replaceChildren();for(const f of actionable.slice(0,5))node('li',`${f.title}: ${f.recommendation}`,$('priorities'));
 if(!actionable.length)node('li','No scored issues found in available evidence. Review coverage and limitations.',$('priorities'));
 $('categories').replaceChildren();
 for(const category of categories){const c=r.categories[category];const section=node('details','',$('categories'));
 node('summary',`${labels[category]}: ${c.score??'Not scored'} · ${c.evaluatedCount} evaluated · coverage ${c.coverage===null?'n/a':Math.round(c.coverage*100)+'%'}`,section);
 if(c.score===null){const needed=[];if(c.evaluatedCount<2)needed.push('at least 2 evaluated checks');if(c.coverage===null||c.coverage<0.5)needed.push('at least 50% evidence coverage');node('p',`No numeric score: this category needs ${needed.join(' and ')}. Useful observations are still listed below.`,section);}else if(c.coverage!==null&&c.coverage<1){node('p',`Based on available evidence only (${Math.round(c.coverage*100)}% coverage). Unavailable checks are not passes or failures.`,section);}
 for(const f of r.findings.filter(x=>x.category===category)){const item=node('details','',section);item.className=`finding-${f.status}`;
 const findingSummary=node('summary',`${f.applicability==='not_applicable'?'Not Applicable':statusLabels[f.status]} · ${f.title}`,item);
 findingSummary.title=f.applicability==='not_applicable'?'This check does not apply to this page; excluded from scoring and evidence coverage.':statusHelp[f.status];
 node('p',`Method: ${f.method==='standard'?'Standards / metadata':f.method==='comparison'?'Cross-source comparison':f.method==='rendered'?'Rendered observation — best effort':'not recorded in cached report'}`,item);
 node('p',`Severity: ${f.severity} · Confidence: ${f.confidence} · ${f.advisory?'Advisory only':f.applicability}`,item);
 node('p',f.explanation,item);node('pre',f.evidence.join('\n')||'No reliable evidence available.',item);node('p',`Recommendation: ${f.recommendation}`,item);node('p',`${f.ruleId} · ${f.reasonCode}`,item);
 item.addEventListener('toggle',()=>{if(item.open)event('finding_expanded');});
 }}
 $('limitations').replaceChildren();for(const text of r.limitations)node('li',text,$('limitations'));$('analyse').textContent='Reanalyse This Page';
}
const errors:Record<string,string>={ACCESS_BLOCKED:'The website is showing an access/security verification screen, not a product page. Load the normal product page in your browser, then analyse again. No challenge is bypassed.',ACTION_REQUIRED:'Click the extension icon on this product tab to enable analysis, then try again.',UNSUPPORTED_PAGE:'This page cannot be inspected. Open a normal HTTP(S) product page.',INTERRUPTED:'Analysis was interrupted by a page or permission change. Click the extension icon and reanalyse.',BUSY:'Another audit is still running. Wait or clear it.',ANALYSIS_FAILED:'Analysis failed or permission expired. Click the extension icon on the product tab and try again.',INVALID_SNAPSHOT:'The page returned unsupported or excessive data. No report was saved.'};
$('analyse').addEventListener('click',async()=>{
 if(running)return;running=true;$<HTMLButtonElement>('analyse').disabled=true;status('Extracting this page and evaluating available evidence…');
 try{const result=await send('analyse');if(result.ok){render(result.report);status(result.report.classification==='non_product'?'No product page detected. Product-specific checks were not evaluated.':result.report.classification==='ambiguous'?'Product page identity is unconfirmed. Product-specific checks were not evaluated.':'Analysis complete. Review evidence and coverage; unavailable comparisons remain unscored.');}else{report=null;$('report').hidden=true;status(errors[result.error]??'Unable to analyse this page. Reopen the extension and retry.');}}
 catch{status('Extension connection interrupted. Reopen the panel and try again.');}
 finally{running=false;$<HTMLButtonElement>('analyse').disabled=false;}
});
$('clear').addEventListener('click',async()=>{await send('clear');report=null;$('report').hidden=true;status('Results and local counters cleared.');});
$('copy').addEventListener('click',async()=>{if(!report)return;try{await navigator.clipboard.writeText(summary(report));event('report_copied');status('Summary copied. Review evidence before sharing.');}catch{status('Clipboard unavailable. Use Export text instead.');}});
function download(format:'text'|'json'){
 if(!report)return;const blob=new Blob([format==='json'?JSON.stringify(report,null,2):summary(report)],{type:format==='json'?'application/json':'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`magenable-pdp-report.${format==='json'?'json':'txt'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);event('report_exported');status('Report exported. Origin only; review evidence before sharing.');
}
$('text').addEventListener('click',()=>download('text'));$('json').addEventListener('click',()=>download('json'));
$('website').addEventListener('click',()=>event('website_clicked'));$('consult').addEventListener('click',()=>event('consultation_clicked'));
for(const category of categories){const label=node('label',labels[category]+' ',$('weight-inputs'));const input=document.createElement('input');input.id='weight-'+category;input.type='number';input.min='0';input.max='100';input.step='0.1';label.append(input);label.style.display='block';}
function displayWeights(weights:Record<string,number>){for(const category of categories)$<HTMLInputElement>('weight-'+category).value=String(weights[category]);}
async function saveWeights(weights:Record<string,number>){const result=await chrome.runtime.sendMessage({type:'set_weights',weights});status(result.ok?'Weights saved. Reanalyse to apply; existing reports are unchanged.':'Invalid weights. Use numbers from 0 to 100 with at least one positive value.');if(result.ok)displayWeights(result.weights);}
$('save-weights').addEventListener('click',()=>{void saveWeights(Object.fromEntries(categories.map(c=>[c,Number($<HTMLInputElement>('weight-'+c).value)])));});
$('reset-weights').addEventListener('click',()=>{void saveWeights({seo:25,structured:25,geo:20,conversion:20,performance:10});});
void send('get_weights').then(result=>displayWeights(result.weights)).catch(()=>{});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.grant){report=null;$('report').hidden=true;status(changes.grant.newValue?'Ready on the selected tab. Click Analyse to read the page.':'Page changed or access expired. Click the extension icon on the product tab before reanalysing.');}});
void send('init').then(data=>{if(data.report)render(data.report);status(data.interrupted?'Previous analysis was interrupted. Click Analyse to start a fresh scan.':data.ready?'Ready. Analysis begins only when you click Analyse.':'Click the extension icon on the product tab, then Analyse.');event('extension_opened');}).catch(()=>status('Extension not available. Reload the panel.'));
