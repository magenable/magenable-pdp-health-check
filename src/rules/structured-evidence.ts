import type {Snapshot,ProductCandidate,StructuredSource,StockObservation,StockState,ProductOffer} from '../contracts';
export function productEvidence(snapshot:Snapshot):{product:ProductCandidate|undefined;source:StructuredSource|'none';ambiguous:boolean;truncated:boolean;count:number}{
 const s=snapshot.schema;
 const group=s.groups?.selected!==undefined&&s.groups.selected!==null?s.groups.products[s.groups.selected]:undefined;
 if(s.products.length||s.groups?.products.length||s.truncated||!s.microdata?.products.length&&!s.microdata?.truncated){const selected=s.selected===null?undefined:s.products[s.selected];return {product:selected??group,source:s.products.length||s.groups?.products.length?'jsonld':'none',ambiguous:selected?s.ambiguous:group?false:s.ambiguous||!!s.groups?.ambiguous,truncated:s.truncated,count:s.products.length+(s.groups?.products.length??0)};}
 const m=s.microdata;return {product:m.selected===null?undefined:m.products[m.selected],source:'microdata',ambiguous:m.ambiguous,truncated:m.truncated,count:m.products.length};
}
export function schemaStock(value:string):StockState{
 const term=value.replace(/^https?:\/\/schema\.org\//,'');
 switch(term){case 'InStock':return 'in_stock';case 'LimitedAvailability':return 'low_stock';case 'OutOfStock':case 'SoldOut':return 'out_of_stock';case 'BackOrder':return 'backorder';case 'PreOrder':case 'PreSale':return 'preorder';default:return 'unknown';}
}
export function stockLine(s:StockObservation):string{return `${s.channel==='unspecified'?(s.contextLabel||'Page availability'):s.channel==='delivery'?'Delivery':`Pickup${s.location?' — '+s.location:''}`}: ${s.rawText}`;}
export interface StockComparison {status:'pass'|'fail'|'not_evaluated';explanation:string;evidence:string[];}
export function compareStock(offer:ProductOffer,observations:StockObservation[],truncated=false):StockComparison {
 const unknown=(explanation:string):StockComparison=>({status:'not_evaluated',explanation,evidence:observations.slice(0,4).map(stockLine)});
 if(truncated)return unknown('Stock capture reached its bound; a complete same-context comparison is unavailable.');
 const expected=schemaStock(offer.availability);if(expected==='unknown')return unknown('The structured availability cannot be mapped to a supported stock state.');
 const channel=offer.channel??'unspecified',location=(offer.location??'').trim().toLowerCase();
 const eligible=observations.filter(o=>o.source==='visible'&&o.confidence==='high'&&o.status!=='unknown');
 const candidates=observations.filter(o=>{
  if((o.channel??'unspecified')!==channel)return false;
  const at=(o.location??'').trim().toLowerCase();
  if(channel==='pickup'&&(!location||!at))return false;
  if(location)return at===location;
  if(at)return false;
  // An unnamed page badge is not interchangeable with a named warehouse/store/context.
  return channel!=='unspecified'||!o.contextLabel;
 });
 if(candidates.some(o=>o.confidence!=='high'||o.status==='unknown'))return unknown('Potentially matching visible stock evidence is ambiguous or low-confidence; no confirmed comparison.');
 const matched=candidates.filter(o=>eligible.includes(o));
 if(matched.length!==1){
  if(channel==='unspecified'&&!location&&eligible.some(o=>o.channel!=='unspecified'||!!o.location||!!o.contextLabel))return unknown('The general structured Offer does not identify a fulfilment channel/location. Delivery and pickup statements are preserved separately; no cross-context mismatch is asserted.');
  return unknown(matched.length>1?'Multiple visible statements match this scope; a unique, non-conflicting same-context statement is required.':'No uniquely aligned visible stock statement exists for this Offer fulfilment/location scope.');
 }
 // A generic Offer/default badge cannot be certified against a page containing several other contexts.
 if(channel==='unspecified'&&!location&&observations.length!==1)return unknown('Multiple fulfilment observations prevent a unique general-Offer comparison.');
 const observed=matched[0],available=(s:StockState)=>s==='in_stock'||s==='low_stock';
 const evidence=[stockLine(observed),`Structured (${offer.source??'jsonld'}): ${offer.availability}`];
 if(expected===observed.status||available(expected)&&available(observed.status))return {status:'pass',explanation:'Structured and visible availability are compatible in the same fulfilment/location scope. Low-stock detail is retained.',evidence};
 if(available(expected)!==available(observed.status))return {status:'fail',explanation:'Structured and visible availability contradict in the same explicitly aligned fulfilment/location scope.',evidence};
 return unknown('The detailed non-immediate stock states differ; equivalence or a confirmed contradiction is not established.');
}
