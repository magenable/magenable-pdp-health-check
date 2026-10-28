export const categories = ['seo','structured','geo','conversion','performance'] as const;
export type Category = typeof categories[number];
export type Status = 'pass'|'warning'|'fail'|'not_evaluated';
export type Confidence = 'high'|'medium'|'low';
export type StructuredSource='jsonld'|'microdata';
export type FulfilmentChannel='delivery'|'pickup'|'unspecified';
export type StockState='in_stock'|'low_stock'|'backorder'|'preorder'|'out_of_stock'|'unknown';
export interface StockObservation {channel:FulfilmentChannel;location?:string;contextLabel:string;status:StockState;rawText:string;source:'visible';confidence:Confidence;}
export interface ImageInfo {alt:string|null;width:number;height:number;naturalWidth:number;naturalHeight:number;dimensionHints:boolean;lazy:boolean;offscreen:boolean;loaded:boolean;}
export interface ProductOffer {type:string;price:string;currency:string;availability:string;lowPrice?:string;highPrice?:string;source?:StructuredSource;channel?:FulfilmentChannel;location?:string;}
export interface ProductCandidate {id:string;name:string;description:string;image:boolean;brand:string;sku:string;matched:boolean;offers:ProductOffer[];source?:StructuredSource;kind?:'product'|'group';variantCount?:number;}
export interface Snapshot {
 version:string;origin:string;language:string;classification:'product'|'ambiguous'|'non_product'|'blocked';
 title:string;metaDescription:string;h1:string[];headingLevels:number[];canonical:{count:number;valid:boolean};robots:string[];
 product:{name:string;description:string;descriptionSource?:'visible'|'expandable'|'unknown';priceKind?:'exact'|'from'|'range'|'unknown';currencySource?:'visible'|'metadata'|'unknown';brand:string;category:string;specifications:string[];context:string[];price:string;currency:string;priceReliable:boolean;availability:'in_stock'|'out_of_stock'|'unknown';stockObservations?:StockObservation[];stockTruncated?:boolean;cart:boolean;cartEnabled:boolean;variants:number;variantsLabelled:boolean;shipping:boolean;returns:boolean;shippable:boolean|null;images:ImageInfo[]};
 schema:{products:ProductCandidate[];selected:number|null;parseErrors:number;ambiguous:boolean;truncated:boolean;groups?:{products:ProductCandidate[];selected:number|null;ambiguous:boolean};microdata?:{products:ProductCandidate[];selected:number|null;ambiguous:boolean;truncated:boolean;limitations:string[]}};
 technical:{domCount:number;scripts:number;styles:number;dpr:number};limitations:string[];incomplete:string[];unstable:boolean;
}
export interface Finding {ruleId:string;category:Category;title:string;status:Status;severity:'info'|'low'|'medium'|'high'|'critical';confidence:Confidence;applicability:'applicable'|'not_applicable'|'unknown';weight:number;advisory:boolean;explanation:string;evidence:string[];recommendation:string;reasonCode:string;method?:'standard'|'rendered'|'comparison';}
export interface CategoryScore {score:number|null;raw:number|null;coverage:number|null;candidateWeight:number;evaluatedWeight:number;unknownWeight:number;notApplicableWeight:number;evaluatedCount:number;}
export interface Report {version:string;ruleVersion:string;configuredWeights:Weights;id:string;capturedAt:string;origin:string;snapshotHash:string;classification:Snapshot['classification'];findings:Finding[];categories:Record<Category,CategoryScore>;overallScore:number|null;effectiveWeights:Partial<Record<Category,number>>;stockObservations?:StockObservation[];structuredEvidence?:{source:StructuredSource|'none';jsonldProducts:number;jsonldGroups?:number;subject?:'product'|'group'|'none';microdataProducts:number;subsetOnly:boolean};limitations:string[];}
export type Weights=Record<Category,number>;
