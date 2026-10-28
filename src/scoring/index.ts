import { categories, type Category, type CategoryScore, type Finding, type Weights } from '../contracts/index.js';
import { ruleIds } from '../rules/index.js';

const DEFAULT_WEIGHTS: Weights = { seo:25, structured:25, geo:20, conversion:20, performance:10 };
const FACTOR = { pass:1, warning:0.5, fail:0 } as const;
const MIN_RULES = 2;
const MIN_COVERAGE = 0.5;
const statuses = new Set(['pass','warning','fail','not_evaluated']);
const applications = new Set(['applicable','not_applicable','unknown']);
const confidences = new Set(['high','medium','low']);
const roundHalfUp = (n: number) => Math.floor(n + 0.5);

export function validateWeights(weights: Weights): Weights {
  const keys = Object.keys(weights).sort();
  const expected = [...categories].sort();
  if (keys.length !== expected.length || keys.some((key,i)=>key!==expected[i])) throw new Error('Weights must contain exactly one key for every category.');
  if (Object.values(weights).some(v=>!Number.isFinite(v)||v<0||v>100) || Object.values(weights).every(v=>v===0)) throw new Error('Weights must be finite, within 0..100 percent, and have a positive total.');
  return {...weights};
}

export function score(findings: Finding[], weights: Weights = DEFAULT_WEIGHTS): { categories: Record<Category, CategoryScore>; overallScore: number|null; effectiveWeights: Partial<Record<Category, number>> } {
  const configured=validateWeights(weights);
  if (findings.length!==ruleIds.length) throw new Error(`Findings must contain exactly ${ruleIds.length} catalogue rules.`);
  const ids=new Set<string>();
  for (const f of findings) {
    if (!ruleIds.includes(f.ruleId)) throw new Error(`Unknown rule ID: ${f.ruleId}`);
    if (ids.has(f.ruleId)) throw new Error(`Duplicate rule ID: ${f.ruleId}`); ids.add(f.ruleId);
    if (!categories.includes(f.category)) throw new Error(`Unknown category: ${f.category}`);
    if (!statuses.has(f.status)||!applications.has(f.applicability)||!confidences.has(f.confidence)) throw new Error(`Invalid finding configuration: ${f.ruleId}`);
    if (!Number.isFinite(f.weight)||f.weight<0) throw new Error(`Invalid rule weight: ${f.ruleId}`);
  }
  if (ids.size!==ruleIds.length) throw new Error('Findings are missing catalogue rule IDs.');
  const out={} as Record<Category,CategoryScore>;
  for (const category of categories) {
    const fs=findings.filter(f=>f.category===category&&!f.advisory&&!['GEO-05','PERF-04'].includes(f.ruleId));
    let candidateWeight=0,evaluatedWeight=0,unknownWeight=0,notApplicableWeight=0,earned=0,evaluatedCount=0;
    for (const f of fs) {
      if (f.applicability==='not_applicable') { notApplicableWeight+=f.weight; continue; }
      candidateWeight+=f.weight;
      const eligible=f.applicability==='applicable'&&f.status!=='not_evaluated'&&f.confidence!=='low'&&(f.status==='pass'||f.status==='warning'||f.status==='fail');
      if (!eligible) { unknownWeight+=f.weight; continue; }
      evaluatedWeight+=f.weight; evaluatedCount++; earned+=f.weight*FACTOR[f.status as keyof typeof FACTOR];
    }
    const coverage=candidateWeight>0?evaluatedWeight/candidateWeight:null;
    const raw=evaluatedWeight>0?100*earned/evaluatedWeight:null;
    const gated=raw!==null&&evaluatedCount>=MIN_RULES&&coverage!==null&&coverage>=MIN_COVERAGE;
    out[category]={score:gated?roundHalfUp(raw):null,raw,coverage,candidateWeight,evaluatedWeight,unknownWeight,notApplicableWeight,evaluatedCount};
  }
  const available=categories.filter(c=>out[c].score!==null&&configured[c]>0);
  const required=out.seo.score!==null&&out.structured.score!==null&&(out.geo.score!==null||out.conversion.score!==null);
  const totalConfigured=available.reduce((sum,c)=>sum+configured[c],0);
  const overallRaw=required&&totalConfigured>0?available.reduce((sum,c)=>sum+(out[c].raw!*configured[c]),0)/totalConfigured:null;
  const overallScore=overallRaw===null?null:roundHalfUp(overallRaw);
  const effectiveWeights: Partial<Record<Category,number>>={};
  if(totalConfigured>0) for(const c of available) effectiveWeights[c]=configured[c]*100/totalConfigured;
  return {categories:out,overallScore,effectiveWeights};
}
export const defaultWeights: Weights={...DEFAULT_WEIGHTS};
