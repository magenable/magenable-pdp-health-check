import type {ImageInfo,ProductCandidate,Snapshot,StockObservation,StockState,FulfilmentChannel,ProductOffer} from '../contracts';

/** Self-contained: Chrome injects the function body without module closures. No page mutation/network. */
export function extractPage():Snapshot {
  const MAX_BYTES=1024*1024, MAX_BLOCKS=100, MAX_VISITS=2000, MAX_DEPTH=20, MAX_OFFERS=128;
  const root=document, started=performance.now();
  const limitations:string[]=[], incomplete:string[]=[];
  const budget=()=>{if(performance.now()-started>5000)throw Error('EXTRACTION_TIMEOUT');};
  const clean=(value:unknown,max=500)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const redact=(value:string)=>value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[redacted-email]').replace(/\b(?:token|secret|api[_ -]?key|password|auth)[=: ]+[^\s,;]+/gi,'[redacted]');
  const privateSelector='input,textarea,select,script,style,template,meta,link,[data-personal],[class*="account" i],[class*="review" i],[class*="testimonial" i],[id*="account" i],[id*="review" i],.product-item,[class*="product-card" i],[class*="product-thumbnail" i],[class*="related-products" i],[class*="complementary-product" i],[class*="recommend" i],[class*="cross-sell" i],[class*="upsell" i]';
  function unrelatedForm(el:Element):boolean {
    const form=el.closest('form');if(!form)return false;
    const action=form.getAttribute('action');let endpoint='';if(action){try{endpoint=new URL(action,location.href).pathname;}catch{/* no endpoint */}}
    return /enquir|inquir|contact|newsletter|subscribe|search|login|register|review|question|notify/i.test(`${form.id} ${form.className} ${endpoint}`);
  }
  function safePlace(value:string):string {
    const label=redact(clean(value,80));
    return /\[redacted|https?:|@|\d{4,}|\b(?:postcode|address|customer|account|your order|zip code)\b|\b\d+\s+\w+\s+(?:street|road|avenue|lane|drive|st|rd)\b/i.test(label)?'':label;
  }
  function hidden(el:Element,disclosure?:Element):boolean {
    if(unrelatedForm(el))return true;
    for(let node:Element|null=el;node;node=node.parentElement){
      if(node.matches(privateSelector))return true;
      if(!disclosure?.contains(node)){
        if(node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true')return true;
        const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return true;
      }
    }
    return false;
  }
  function text(el:Element|null,max=500,disclosure?:Element):string {
    if(!el||hidden(el,disclosure))return '';
    const walker=root.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node:Node|null,result='',visits=0;
    while((node=walker.nextNode())){
      if(++visits>1000){if(!incomplete.includes('DOM selection limit'))incomplete.push('DOM selection limit');break;}
      if(node.parentElement&&!hidden(node.parentElement,disclosure))result+=' '+node.textContent;
      if(result.length>=max*3)break;
    }
    return redact(clean(result,max));
  }
  const attr=(el:Element|null,name:string)=>el&&!hidden(el)?redact(clean(el.getAttribute(name),300)):'';
  function all(selector:string,scope:ParentNode=root):Element[]{
    budget();const nodes=scope.querySelectorAll(selector);
    if(nodes.length>250&&!incomplete.includes('DOM selection limit'))incomplete.push('DOM selection limit');
    return Array.from(nodes).slice(0,250).filter(el=>!hidden(el)&&!unrelatedForm(el));
  }
  function first(selectors:string[],scope:ParentNode=root):Element|null {for(const s of selectors){const found=all(s,scope)[0];if(found)return found;}return null;}
  const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const language=(root.documentElement.lang||root.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content')||'unknown').toLowerCase();
  const url=location.href,origin=location.origin;
  const marketplace=!!root.querySelector('#ppd #productTitle');
  const nameElement=first(['#ppd #productTitle','main [data-testid*="product-title" i]','main .product-title','main .product-name','main h1','[role="main"] h1','h1']);
  const name=text(nameElement,300);
  const primary=nameElement?.closest('#ppd,.product-info-main,.product__info-container,.product__info-wrapper,.c-product-main__form,.summary.entry-summary,[data-product-info],form[action*="/cart/add"]')
    ??first(['main[data-product]','main [data-product]','main[itemtype*="Product" i]','main [itemtype*="Product" i]','main .product-info','main .product-details'])
    ??root.querySelector('main,[role="main"]');
  const h1=all('h1').slice(0,20).map(el=>text(el,300)).filter(Boolean);
  const headingLevels=all('h1,h2,h3,h4,h5,h6').slice(0,200).map(el=>Number(el.tagName.slice(1)));
  const metaDescription=redact(clean(root.querySelector('meta[name="description"]')?.getAttribute('content')));
  const canonicalLinks=Array.from(root.querySelectorAll('link[rel="canonical"]')).slice(0,20).map(el=>el.getAttribute('href')??'').filter(Boolean);
  const canonical={count:canonicalLinks.length,valid:canonicalLinks.length===1&&(()=>{try{return /^https?:$/.test(new URL(canonicalLinks[0],url).protocol);}catch{return false;}})()};
  const robots=Array.from(root.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')).slice(0,20).map(el=>redact(clean(el.getAttribute('content')))).filter(Boolean);

  let bytes=0,parseErrors=0,truncated=false;
  const blocks:unknown[]=[];
  const scripts=root.querySelectorAll('script[type="application/ld+json"]');
  if(scripts.length>MAX_BLOCKS){truncated=true;limitations.push('JSON-LD block limit reached');}
  for(const script of Array.from(scripts).slice(0,MAX_BLOCKS)){
    const raw=script.textContent??'';const size=new TextEncoder().encode(raw).byteLength;
    if(bytes+size>MAX_BYTES){truncated=true;limitations.push('JSON-LD byte limit reached');break;}
    bytes+=size;budget();try{blocks.push(JSON.parse(raw));}catch{parseErrors++;}
  }
  const nodes:Record<string,unknown>[]=[], refs=new Map<string,Record<string,unknown>>(),seen=new Set<object>();let visits=0;
  const skipped=new Set(['@context','review','aggregateRating','shippingDetails','hasMerchantReturnPolicy','potentialAction','sameAs']);
  function visit(value:unknown,depth:number){
    budget();if(depth>MAX_DEPTH||visits>=MAX_VISITS){truncated=true;return;}visits++;
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    if(Array.isArray(value)){for(const item of value){if(visits>=MAX_VISITS){truncated=true;break;}visit(item,depth+1);}return;}
    const r=value as Record<string,unknown>;
    if(typeof r['@id']==='string'&&(r['@type']||Object.keys(r).length>1)&&(r['@type']||!refs.has(r['@id'])))refs.set(r['@id'],r);
    if(r['@type'])nodes.push(r);
    for(const [key,child] of Object.entries(r)){if(skipped.has(key))continue;if(visits>=MAX_VISITS){truncated=true;break;}visit(child,depth+1);}
  }
  for(const block of blocks)visit(block,0);
  function resolve(value:unknown):unknown {if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof (value as Record<string,unknown>)['@id']==='string')return refs.get((value as Record<string,unknown>)['@id'] as string)??value;return value;}
  const scalar=(v:unknown)=>typeof v==='string'||typeof v==='number'?redact(clean(String(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' '))):'';
  function field(r:Record<string,unknown>,key:string){const v=resolve(r[key]);return v&&typeof v==='object'&&!Array.isArray(v)?scalar((v as Record<string,unknown>).name??(v as Record<string,unknown>).value):scalar(v);}
  function types(r:Record<string,unknown>){const t=r['@type'];return (Array.isArray(t)?t:[t]).filter(v=>typeof v==='string').map(v=>String(v).split('/').pop()!.toLowerCase());}
  function methodStrings(value:unknown):string[]{return (Array.isArray(value)?value:[value]).flatMap(v=>typeof v==='string'?[v]:v&&typeof v==='object'&&typeof (v as Record<string,unknown>)['@id']==='string'?[(v as Record<string,unknown>)['@id'] as string]:[]);}
  function fulfilment(methods:string[],place:string):Pick<ProductOffer,'channel'|'location'>{
    const classified=methods.map(v=>{
      if(/^https?:\/\/schema\.org\/OnSitePickup$/.test(v)||/^https?:\/\/purl\.org\/goodrelations\/v1#DeliveryModePickUp$/.test(v))return 'pickup';
      if(/^https?:\/\/schema\.org\/ParcelService$/.test(v)||/^https?:\/\/purl\.org\/goodrelations\/v1#(?:DeliveryModeMail|DeliveryModeFreight|DeliveryModeOwnFleet|DHL|UPS|FederalExpress)$/.test(v))return 'delivery';
      return 'unspecified';
    });
    const channels=new Set(classified);return {channel:classified.length&&channels.size===1&&!channels.has('unspecified')?classified[0] as FulfilmentChannel:'unspecified',location:safePlace(place)||undefined};
  }
  function offers(r:Record<string,unknown>):ProductCandidate['offers']{
    const v=resolve(r.offers);const list=Array.isArray(v)?v:[v];if(list.length>MAX_OFFERS)truncated=true;
    return list.slice(0,MAX_OFFERS).map(resolve).filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)).map(o=>({source:'jsonld',...fulfilment(methodStrings(o.availableDeliveryMethod),field(o,'availableAtOrFrom')),type:types(o).includes('aggregateoffer')?'AggregateOffer':'Offer',price:field(o,'price'),currency:field(o,'priceCurrency'),availability:field(o,'availability'),lowPrice:field(o,'lowPrice')||undefined,highPrice:field(o,'highPrice')||undefined}));
  }
  const skuElement=first(['[itemprop="sku"]','[data-product-sku]','[data-sku]'],primary??root);
  const sku=text(skuElement,100)||attr(skuElement,'data-sku')||attr(skuElement,'data-product-sku');
  const records=nodes.filter(r=>types(r).includes('product'));
  const candidates:ProductCandidate[]=records.map((r,i)=>{
    const productName=field(r,'name'),productSku=field(r,'sku'),identifier=scalar(r['@id']),productUrl=field(r,'url')||(/\?/.test(identifier)?identifier:'');let urlMatch=false;
    if(productUrl){try{const a=new URL(productUrl,url),b=new URL(url);a.hash='';b.hash='';urlMatch=a.href===b.href;}catch{/* no match: variant query must not be discarded */}}
    return {id:`product-${i+1}`,source:'jsonld',name:productName,description:field(r,'description'),image:!!resolve(r.image),brand:field(r,'brand'),sku:productSku,matched:!!(productName&&name&&normalized(productName)===normalized(name)||productSku&&sku&&normalized(productSku)===normalized(sku)||urlMatch),offers:offers(r)};
  });
  const matches=candidates.filter(p=>p.matched),selected=matches.length===1?candidates.indexOf(matches[0]):null;
  const ambiguous=matches.length>1||candidates.length>1&&matches.length===0;
  if(ambiguous)limitations.push('Current structured Product identity is unresolved among multiple candidates; page-level checks can still run when product context is established');

  // Match a family independently of its children. Never promote family offers into a selected variant.
  const groupProducts:ProductCandidate[]=nodes.filter(r=>types(r).includes('productgroup')).map((r,i)=>{
    const raw=resolve(r.hasVariant),members=(Array.isArray(raw)?raw:[raw]).map(resolve).filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&types(v as Record<string,unknown>).includes('product'));
    if(members.length>MAX_OFFERS)truncated=true;
    const own=offers(r),memberOffers=members.slice(0,MAX_OFFERS).flatMap(offers),captured=own.length?own:memberOffers;
    if(captured.length>MAX_OFFERS)truncated=true;
    let urlMatch=false;const identity=field(r,'url')||scalar(r['@id']);
    if(identity){try{const a=new URL(identity,url),b=new URL(url);a.hash='';b.hash='';a.searchParams.delete('variant');b.searchParams.delete('variant');urlMatch=a.href===b.href;}catch{/* invalid identity */}}
    const groupName=field(r,'name');return {id:`group-${i+1}`,kind:'group',source:'jsonld',name:groupName,description:field(r,'description'),image:!!resolve(r.image),brand:field(r,'brand'),sku:field(r,'productGroupID'),matched:urlMatch||!!groupName&&normalized(groupName)===normalized(name),offers:captured.slice(0,MAX_OFFERS),variantCount:members.length};
  });
  const groupMatches=groupProducts.filter(p=>p.matched);
  const groups={products:groupProducts,selected:groupMatches.length===1?groupProducts.indexOf(groupMatches[0]):null,ambiguous:groupMatches.length>1||groupProducts.length>1&&groupMatches.length===0};
  if(groups.selected!==null)limitations.push('ProductGroup family recognised; family offers are not a confirmed selected variant.');

  const microLimits:string[]=[];let microTruncated=false;
  const machinePrivate='input,textarea,select,script,style,template,[data-personal],[class*="account" i],[class*="review" i],[id*="review" i],.product-item,[class*="product-card" i],[class*="product-thumbnail" i],[class*="related-products" i],[class*="complementary-product" i],[class*="recommend" i],[class*="cross-sell" i],[class*="upsell" i]';
  const safeMachine=(el:Element)=>!el.closest(machinePrivate)&&!unrelatedForm(el);
  const microTypes=(el:Element)=>(el.getAttribute('itemtype')??'').split(/\s+/).map(v=>v.match(/^https?:\/\/schema\.org\/(\w+)$/)?.[1]??'');
  function ownProperties(scope:Element,key:string):Element[]{
    budget();const props=scope.querySelectorAll(`[itemprop~="${key}"]`);const owned:Element[]=[];
    if(props.length>2000)microTruncated=true;
    for(const el of Array.from(props).slice(0,2000)){
      if(!safeMachine(el)||(el.hasAttribute('itemscope')?el.parentElement?.closest('[itemscope]'):el.closest('[itemscope]'))!==scope)continue;
      if(owned.length>=250){microTruncated=true;break;}owned.push(el);
    }
    return owned;
  }
  function microValue(el:Element,scope:Element):string {
    if(!safeMachine(el))return '';
    if(el.tagName==='META')return scalar(el.getAttribute('content'));
    if(['LINK','A','AREA'].includes(el.tagName))return scalar(el.getAttribute('href'));
    if(['IMG','SOURCE','VIDEO','AUDIO'].includes(el.tagName))return scalar(el.getAttribute('src'));
    if(el.tagName==='TIME')return scalar(el.getAttribute('datetime'));
    return text(el,500,scope);
  }
  function microField(scope:Element,key:string):string {
    const values=ownProperties(scope,key).map(el=>microValue(el,scope)).filter(Boolean);
    if(['name','sku','price','priceCurrency','availability','lowPrice','highPrice'].includes(key)&&new Set(values).size>1){microTruncated=true;microLimits.push(`Conflicting microdata ${key} values are not uniquely interpreted`);return '';}
    return values[0]??'';
  }
  const typedScopes=root.querySelectorAll('[itemscope][itemtype]');if(typedScopes.length>2000)microTruncated=true;
  const productRoots=Array.from(typedScopes).slice(0,2000).filter(el=>microTypes(el).includes('Product')&&safeMachine(el));
  if(Array.from(typedScopes).slice(0,2000).some(el=>microTypes(el).includes('ProductGroup'))||root.querySelector('[typeof~="Product"],[typeof~="ProductGroup"],[typeof~="schema:Product"],[typeof~="schema:ProductGroup"],[typeof~="https://schema.org/Product"],[typeof~="https://schema.org/ProductGroup"]'))incomplete.push('Unsupported product structured-data format detected (ProductGroup microdata or RDFa); absence is not established');
  if(productRoots.length>20){microTruncated=true;microLimits.push('Microdata Product candidate limit reached');}
  const microProducts:ProductCandidate[]=productRoots.slice(0,20).map((scope,index)=>{
    if(scope.hasAttribute('itemref')){microTruncated=true;microLimits.push('Microdata itemref is outside the supported subset');}
    const productName=microField(scope,'name'),productSku=microField(scope,'sku');
    const brandScope=ownProperties(scope,'brand')[0];const productBrand=brandScope?.hasAttribute('itemscope')?microField(brandScope,'name'):brandScope?microValue(brandScope,scope):'';
    const offerRoots=ownProperties(scope,'offers').filter(el=>el.hasAttribute('itemscope')&&microTypes(el).some(t=>t==='Offer'||t==='AggregateOffer'));
    if(offerRoots.length>MAX_OFFERS)microTruncated=true;
    const productOffers:ProductOffer[]=offerRoots.slice(0,MAX_OFFERS).map(offer=>{
      if(offer.hasAttribute('itemref')){microTruncated=true;microLimits.push('Microdata Offer itemref is outside the supported subset');}
      const places=ownProperties(offer,'availableAtOrFrom');const place=places.length===1?(places[0].hasAttribute('itemscope')?microField(places[0],'name'):microValue(places[0],offer)):'';
      const methods=ownProperties(offer,'availableDeliveryMethod').map(el=>microValue(el,offer));
      return {source:'microdata',...fulfilment(methods,place),type:microTypes(offer).includes('AggregateOffer')?'AggregateOffer':'Offer',price:microField(offer,'price'),currency:microField(offer,'priceCurrency'),availability:microField(offer,'availability'),lowPrice:microField(offer,'lowPrice')||undefined,highPrice:microField(offer,'highPrice')||undefined};
    });
    const headingScope=!!nameElement&&scope.contains(nameElement)&&(!productName||normalized(productName)===normalized(name));
    const matched=!!(productName&&name&&normalized(productName)===normalized(name)||productSku&&sku&&normalized(productSku)===normalized(sku)||headingScope);
    return {id:`microdata-product-${index+1}`,source:'microdata',name:productName,description:microField(scope,'description'),image:!!microField(scope,'image'),brand:productBrand,sku:productSku,matched,offers:productOffers};
  });
  const microMatches=microProducts.filter(p=>p.matched);
  const microdata={products:microProducts,selected:microMatches.length===1?microProducts.indexOf(microMatches[0]):null,ambiguous:microMatches.length>1||microProducts.length>1&&microMatches.length===0,truncated:microTruncated,limitations:Array.from(new Set(microLimits))};
  if(microProducts.length)limitations.push('Product/Offer microdata subset inspected separately; not full microdata or rich-result eligibility validation.',...microdata.limitations);

  const detailSelectors=['#productDescription','main [id="product.info.description"]','main .product.attribute.description .value','main [data-testid*="description" i]','main .product-description','main .product__description','main [class*="product-main__description"]','main [itemprop="description"]','main .description'];
  let descriptionElement=first(detailSelectors),descriptionSource:'visible'|'expandable'|'unknown'='visible',disclosure:Element|undefined;
  if(!descriptionElement){
    // Only read a collapsed panel when a visible, explicit user control targets its ID. Never reveal/click it.
    const controls=Array.from(root.querySelectorAll('[aria-controls],a[href^="#"]')).slice(0,250).filter(e=>!hidden(e));
    for(const selector of detailSelectors){for(const el of Array.from(root.querySelectorAll(selector)).slice(0,20)){
      const panel=el.closest('[role="tabpanel"],[id]');if(!panel?.id)continue;
      if(controls.some(c=>(c.getAttribute('aria-controls')??'').split(/\s+/).includes(panel.id)||c.getAttribute('href')===`#${panel.id}`)){
        descriptionElement=el;disclosure=panel;descriptionSource='expandable';break;
      }
    }if(descriptionElement)break;}
  }
  // Template-backed tab shells are not product prose. Do not read inert template contents or labels.
  let description=descriptionElement?.querySelector('template')?all('p,.rte,[data-product-description]',descriptionElement).filter(el=>!el.closest('label,button,[role="tab"]')).map(el=>text(el,1200,disclosure)).join(' ').slice(0,1200):text(descriptionElement,1200,disclosure);
  if(!description&&primary){
    const identityWords=normalized(name).split(' ').filter(w=>w.length>=4);
    const paragraph=all('p',primary).find(el=>!el.closest('[class*="price" i],[class*="pricing" i],[class*="payment" i],[class*="shipping" i],[class*="return" i],[class*="installment" i],[class*="quantity" i]')&&text(el,1000).length>=80&&identityWords.some(w=>normalized(text(el,1000)).split(' ').includes(w)));
    description=text(paragraph??null,1200);
  }
  if(!description)descriptionSource='unknown';
  if(descriptionSource==='expandable')limitations.push('Product description is in an explicitly linked expandable panel; not initially visible.');
  const tables=[...all('main #product-attribute-specs-table,main .additional-attributes,main [data-product-specifications]'),...(primary?all('table,dl,[itemprop="additionalProperty"],[class*="specification" i]',primary):[])];
  const specifications=Array.from(new Set(tables)).slice(0,20).map(el=>text(el,250)).filter(Boolean);
  let brand=text(first(['[itemprop="brand"]','[data-brand]'],primary??root),200);
  if(!brand){for(const table of tables){const cell=table.querySelector('td[data-th="Brand" i]');if(cell){brand=text(cell,200);break;}const row=Array.from(table.querySelectorAll('tr')).find(r=>/^brand$/i.test(text(r.querySelector('th,td'),80)));if(row){brand=text(row.querySelectorAll('th,td')[1]??null,200);break;}}}
  const category=all('nav[aria-label*="breadcrumb" i],.breadcrumbs,.breadcrumb,main [data-category]').map(el=>text(el,300)).filter(v=>{const remaining=normalized(v).replace(/^home\s*/,'').replace(normalized(name),'').trim();return !!remaining;}).join(' | ').slice(0,500);
  const context=all('main [class*="shipping" i],main [class*="return" i],main [class*="policy" i],main [class*="benefit" i],main [class*="faq" i]').slice(0,20).map(el=>text(el,250)).filter(Boolean);
  const policyLinks=all('a[href*="shipping" i],a[href*="delivery" i],a[href*="returns" i],a[href*="refund" i]');
  let shipping=context.some(v=>/\bship|delivery|versand/i.test(v)),returns=context.some(v=>/\breturn|refund|retour/i.test(v));
  for(const link of policyLinks){const href=link.getAttribute('href')??'',label=text(link,100);if(!label)continue;
    if(/shipping|delivery/i.test(href)){shipping=true;context.push(`Delivery information link: ${label}`);}
    if(/returns|refund/i.test(href)){returns=true;context.push(`Returns information link: ${label}`);}
  }

  const marketPrices=marketplace?all('#corePriceDisplay_desktop_feature_div .priceToPay,#corePrice_feature_div .priceToPay,#apex_desktop .priceToPay'):[];
  const marketPrice=marketPrices.length===1?marketPrices[0]:null;
  const priceNodes=marketplace?(marketPrice?[marketPrice]:[]):primary?all('[data-price],[data-product-price],.price,.product-price,.price-box,[itemprop="price"],.c-product-main__pricing-price,.product__price .money,.price__regular .price-item',primary):[];
  const priceLeaves=priceNodes.filter(el=>!priceNodes.some(other=>other!==el&&el.contains(other)));
  const priceTexts=priceLeaves.map(el=>text(el,180)).filter(Boolean);
  // Some marketplace themes hide the accessibility price and paint aria-hidden split digits.
  // Read only the verified current-price numeric spans; never stale hidden text or a list price.
  if(marketPrice&&!priceTexts.length){
    const whole=marketPrice.querySelector('.a-price-whole'),fraction=marketPrice.querySelector('.a-price-fraction');
    const painted=(el:Element)=>{for(let n:Element|null=el;n&&n!==marketPrice;n=n.parentElement){const style=getComputedStyle(n);if(n.hasAttribute('hidden')||style.display==='none'||style.visibility==='hidden')return false;}return true;};
    if(whole?.tagName==='SPAN'&&fraction?.tagName==='SPAN'&&marketPrice.querySelectorAll('.a-price-whole').length===1&&marketPrice.querySelectorAll('.a-price-fraction').length===1&&painted(whole)&&painted(fraction)){
      const a=clean(whole.textContent,60).replace(/\s+/g,'').replace(/[.,]$/,''),b=clean(fraction.textContent,8);
      const separator=language.startsWith('en')?'.':/^(de|fr|es|it|pt|nl)/.test(language)?',':'';
      if(separator&&/^[\d.,]+$/.test(a)&&/^\d{1,3}$/.test(b))priceTexts.push(a+separator+b);
    }
  }
  const priceContext=priceLeaves.map(el=>text(el.closest('.price-box,.price-container,[data-price-container],.o-pricing')??el,250)).join(' | ');
  const codes=Intl.supportedValuesOf('currency');
  const currencyCode=(v:string)=>(v.match(/\b[A-Z]{3}\b/g)??[]).find(c=>codes.includes(c))??'';
  const currencyCandidates=priceLeaves.flatMap(el=>[text(el,180),attr(el,'data-currency'),attr(el,'aria-label'),...all('[data-currency],[itemprop="priceCurrency"]',el).map(c=>text(c,50)||attr(c,'data-currency'))]).map(currencyCode).filter(Boolean);
  const distinctCurrencies=Array.from(new Set(currencyCandidates));let currency=distinctCurrencies.length===1?distinctCurrencies[0]:'';
  let currencySource:'visible'|'metadata'|'unknown'=currency?'visible':'unknown';
  if(!currency&&distinctCurrencies.length===0){const metadata=Array.from(root.querySelectorAll('meta[property="product:price:currency"],meta[property="og:price:currency"]')).map(el=>currencyCode(el.getAttribute('content')??'')).filter(Boolean);if(new Set(metadata).size===1){currency=metadata[0];currencySource='metadata';}}
  function normalizeMoney(raw:string){const s=raw.trim().replace(/[\s\u00a0\u202f]/g,'');
    if(language.startsWith('en'))return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(s)?s.replace(/,/g,''):null;
    if(/^(de|fr|es|it|pt|nl)/.test(language))return /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,6})?$/.test(s)?s.replace(/\./g,'').replace(',','.'):null;
    return /^\d+$/.test(s)?s:null;
  }
  const numbers=priceTexts.flatMap(v=>v.match(/\d[\d.,\u00a0\u202f ]*/g)??[]),normalizedPrices=numbers.map(normalizeMoney);
  const unique=Array.from(new Set(normalizedPrices.map((v,i)=>v??numbers[i].trim())));
  const from=/\bfrom\b|\bstarting\b/i.test(priceContext),range=/\d[\d.,]*\s*[-–]\s*\d/.test(priceContext);
  const ambiguousPrice=/\b(?:was|installment|per month|monthly|list|msrp)\b/i.test(priceContext)||unique.length>1;
  const priceKind:'exact'|'from'|'range'|'unknown'=from?'from':range?'range':unique.length===1&&!ambiguousPrice?'exact':'unknown';
  const price=unique.length===1?unique[0]:range?unique.slice(0,2).join(' – '):'';

  const optionRoot=marketplace?root.querySelector('#twister_feature_div,#twister'):primary;
  const controls=optionRoot?Array.from(optionRoot.querySelectorAll('select,[role="radio"],input[type="radio"]:not([name*="quantity" i])')).slice(0,100).filter(el=>!el.closest('product-description,.product-description,[role="tablist"],[class*="size-guide" i],[id*="size-guide" i]')&&!/quantity|^qty$/i.test(`${el.id} ${el.getAttribute('name')??''}`)&&el.parentElement&&!hidden(el.parentElement)&&!unrelatedForm(el)&&!el.hasAttribute('hidden')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'):[];
  const variants=controls.length;
  const variantsLabelled=variants>0&&controls.every(el=>!!clean(el.getAttribute('aria-label'))||(el.getAttribute('aria-labelledby')??'').split(/\s+/).filter(Boolean).some(id=>!!text(root.getElementById(id),100))||!!el.id&&Array.from(root.querySelectorAll('label')).some(l=>l.getAttribute('for')===el.id&&!!text(l,100))||!!text(el.closest('label'),100));
  const cartButtons=primary?all('button,[role="button"]',primary).filter(el=>/add\s*to\s*(?:cart|bag|basket)|buy\s*now|purchase|加入购物车|acheter/i.test(text(el,100)||attr(el,'aria-label'))):[];
  // Known static submit semantics only; never read a merchant form's input value.
  if(marketplace&&primary)cartButtons.push(...Array.from(primary.querySelectorAll('input[type="submit"]#add-to-cart-button,input[type="submit"]#buy-now-button,input[type="submit"][name="submit.add-to-cart"]')).filter(el=>el.parentElement&&!hidden(el.parentElement)&&!unrelatedForm(el)&&!el.hasAttribute('hidden')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'));
  const cart=cartButtons.length>0,cartEnabled=cartButtons.some(el=>!(el as HTMLButtonElement).disabled&&el.getAttribute('aria-disabled')!=='true');
  function visibleStockState(value:string):StockState|undefined {
    const v=clean(value,120).replace(/^(?:stock|availability)\s*:\s*/i,'').trim();
    const negative=/\b(?:out[ -]?of[ -]?stock|sold[ -]?out|unavailable|not available|not in stock)\b/i.test(v);
    const withoutNegative=v.replace(/out[ -]?of[ -]?stock|not in stock|not available|unavailable|sold[ -]?out/gi,'').replace(/available\s+(?:on|for)\s+(?:back[ -]?order|pre[ -]?order)/gi,'');
    const positive=/\b(?:in[ -]?stock|low[ -]?stock|limited stock|available)\b/i.test(withoutNegative);
    const future=/\b(?:back[ -]?order|pre[ -]?order)\b/i.test(v);
    if(positive&&(negative||future)||negative&&future)return 'unknown';
    if(/^(?:out[ -]?of[ -]?stock|sold[ -]?out|unavailable|not available|not in stock)(?:\s*[.!].*)?$/i.test(v))return 'out_of_stock';
    if(/^(?:(?:available\s+(?:on|for)\s+)?back[ -]?order(?:ed)?|on order)(?:\s*[.!].*)?$/i.test(v))return 'backorder';
    if(/^(?:available\s+for\s+)?pre[ -]?order(?:\s*[.!].*)?$/i.test(v))return 'preorder';
    const remaining=v.match(/^only\s+(\d{1,6})\s+(?:left|remaining)(?:\s*[.!].*)?$/i);if(remaining)return Number(remaining[1])===0?'out_of_stock':'low_stock';
    const quantity=v.match(/^(\d{1,6})\s+in[ -]?stock(?:\s*[.!].*)?$/i);if(quantity)return Number(quantity[1])===0?'out_of_stock':'in_stock';
    if(/^(?:low[ -]?stock|limited[ -]?(?:stock|availability))(?:\s*[.!].*)?$/i.test(v))return 'low_stock';
    if(/^(?:in[ -]?stock|available)(?:\s*[.!].*)?$/i.test(v))return 'in_stock';
    return undefined;
  }
  const stockNodes:{el:Element;status:StockState;rawText:string}[]=[];let stockTruncated=false;
  const stockRoot=marketplace?root.querySelector('#desktop_buybox,#buybox')??primary:primary;
  if(stockRoot){
    const walker=root.createTreeWalker(stockRoot,NodeFilter.SHOW_ELEMENT,{acceptNode:node=>hidden(node as Element)||unrelatedForm(node as Element)||(node as Element).closest('[role="tooltip"],.tooltip,.variant-picker__status,[data-stock-legend],[class*="size-legend" i],[class*="availability-key" i]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    let node:Node|null,scanned=0;
    while((node=walker.nextNode())){
      budget();if(++scanned>4000){stockTruncated=true;break;}
      const el=node as Element;if(el.children.length&&!Array.from(el.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&!!clean(n.textContent)))continue;
      const rawText=text(el,121);if(rawText.length>120)continue;
      const status=visibleStockState(rawText);if(!status)continue;
      if(stockNodes.length>=24){stockTruncated=true;break;}stockNodes.push({el,status,rawText});
    }
  }
  function stockContext(el:Element,rawText:string):Pick<StockObservation,'channel'|'location'|'contextLabel'>{
    if(marketplace&&el.closest('#availability'))return {channel:'unspecified',contextLabel:'Current buy box'};
    let label='',unresolved=false;let channel:FulfilmentChannel='unspecified';
    // Find the smallest neighbouring label containing exactly one status, not a whole product description.
    for(let ancestor=el.parentElement,depth=0;ancestor&&ancestor!==primary&&depth<4;ancestor=ancestor.parentElement,depth++){
      if(stockNodes.filter(n=>ancestor!.contains(n.el)).length!==1)break;
      if(ancestor.querySelector('input[autocomplete*="address" i],input[name*="postcode" i],input[name*="address" i],input[name*="zip" i]')){unresolved=true;break;}
      if(nameElement&&ancestor.contains(nameElement)||cartButtons.some(b=>ancestor!.contains(b))||ancestor.querySelector('input,textarea,select'))break;
      const raw=text(ancestor,240);if(raw.length>180)continue;
      const rawLabel=raw.replace(rawText,'').replace(/^[\s:|–-]+|[\s:|–-]+$/g,'');
      const candidate=safePlace(rawLabel);if(rawLabel&&!candidate)unresolved=true;
      if(candidate&&candidate.length<=80&&candidate.split(' ').length<=10&&!/\d[.,]\d|[$€£]|\b(?:stock|inventory|availability|status)\b/i.test(candidate)&&normalized(candidate)!==normalized(name)){label=candidate;break;}
    }
    if(/^(?:delivery|shipping)(?:\s+(?:availability|stock))?$/i.test(label))channel='delivery';
    else if(/^(?:pickup|pick[ -]?up|click\s*(?:&|and)\s*collect)\b|^collection(?:\s*[:–-]|$)/i.test(label))channel='pickup';
    if(channel==='unspecified'){
      for(let ancestor=el.parentElement,depth=0;ancestor&&depth<6;ancestor=ancestor.parentElement,depth++){
        if(ancestor===primary||nameElement&&ancestor.contains(nameElement))break;
        const context=text(ancestor,320);
        const pickup=/\b(?:click\s*(?:&|and)\s*collect|pick[ -]?up)\b/i.test(context)||Array.from(ancestor.querySelectorAll('h2,h3,h4,legend')).some(h=>/^collection$/i.test(text(h,80))),delivery=/\b(?:delivery|shipping)\b/i.test(context);
        if(pickup&&!delivery){channel='pickup';break;}
        if(delivery&&!pickup){channel='delivery';break;}
      }
    }
    const location=channel==='pickup'?safePlace(label.replace(/^(?:pickup|pick[ -]?up|click\s*(?:&|and)\s*collect|collection)\s*[:–-]?\s*/i,'')):'';
    return {channel,location:location||undefined,contextLabel:unresolved?'Unresolved fulfilment context':label};
  }
  const stockObservations:StockObservation[]=stockNodes.map(({el,status,rawText})=>{
    const suffix=rawText.match(/[.!]\s*(\S.*)$/)?.[1];
    const qualified=!!suffix&&!/^selling fast[.!]?$/i.test(suffix);
    const context=stockContext(el,rawText);
    return {...context,status,rawText,source:'visible',confidence:status==='unknown'?'low':qualified||context.contextLabel==='Unresolved fulfilment context'?'medium':'high'};
  });
  if(stockTruncated)limitations.push('Visible stock scan reached its bound; observations may be partial.');
  // The legacy aggregate is ONLY a single unnamed page-level observation, never a union of locations.
  const single=!stockTruncated&&stockObservations.length===1&&stockObservations[0].confidence==='high'&&stockObservations[0].channel==='unspecified'&&!stockObservations[0].contextLabel?stockObservations[0]:undefined;
  const availability:Snapshot['product']['availability']=single?.status==='in_stock'||single?.status==='low_stock'?'in_stock':single?.status==='out_of_stock'?'out_of_stock':'unknown';
  const priceReliable=priceKind==='exact'&&!!price&&!!currency&&currencySource==='visible'&&normalizedPrices.every(v=>v!==null)&&variants===0&&!ambiguous;

  const gallery=first(['#ppd #imgTagWrapperId','main product-gallery','main .product.media','main [data-gallery-role="gallery-placeholder"]','main media-gallery','main .product__media-gallery','main .woocommerce-product-gallery','main [data-product-gallery]','main [class*="product-main__gallery"]','main [class*="product-main__media"]','main [class*="product-main__images"]']);
  const galleryScope=gallery??primary?.closest('[data-product],[itemtype*="Product" i],.c-product-main,.product-main,.product')??primary??root.querySelector('main');
  const images:ImageInfo[]=galleryScope?Array.from(galleryScope.querySelectorAll('img')).slice(0,100).filter(el=>!hidden(el)&&!el.closest('[class*="logo" i],[class*="avatar" i]')&&el.getAttribute('role')!=='presentation'&&el.getAttribute('role')!=='none').slice(0,40).map(el=>{
    const im=el as HTMLImageElement,rect=im.getBoundingClientRect(),css=getComputedStyle(im);
    return {alt:attr(im,'alt')||null,width:im.width||Number(attr(im,'width'))||0,height:im.height||Number(attr(im,'height'))||0,naturalWidth:im.naturalWidth||0,naturalHeight:im.naturalHeight||0,dimensionHints:!!attr(im,'width')&&!!attr(im,'height')||!!css.aspectRatio&&css.aspectRatio!=='auto',lazy:im.loading==='lazy'||!!attr(im,'data-src'),offscreen:rect.top>innerHeight||rect.bottom<0,loaded:im.complete&&im.naturalWidth>0};
  }):[];
  if(!description)incomplete.push('Rendered product description unavailable');
  if(!specifications.length)incomplete.push('Product specifications not identified; optional applicability unknown');
  if(!images.length)incomplete.push('Relevant product gallery images unavailable');
  if(!price)incomplete.push('Visible product price is missing or ambiguous');
  if(!records.length&&!groupProducts.length&&!microProducts.length)incomplete.push('Structured product data unavailable');
  if(truncated)incomplete.push('Structured-data limits may affect structured fields');
  if(root.querySelector('iframe'))limitations.push('Only the main frame was inspected; embedded frames are unsupported.');
  if(priceKind==='from'||priceKind==='range')limitations.push('A starting/range price is displayed, not a confirmed selected-variant price.');
  if(currencySource==='metadata')limitations.push('Currency comes from page metadata, not an explicit visible ISO code; price mismatches are not confirmed.');
  if(price&&currencySource==='unknown')limitations.push('Price amount found, but currency is not independently identifiable; no confirmed price comparison.');
  const domProduct=!!name&&!!primary&&(!!priceNodes.length&&cart||marketplace&&(!!priceNodes.length||cart));
  const likelyProduct=selected!==null||groups.selected!==null||microdata.selected!==null||domProduct;
  const gateTitle=/^(?:access (?:to this page )?(?:has been )?(?:denied|blocked)|robot check(?:\s*[-|]|$)|just a moment[.!…]*$|attention required.*cloudflare|security verification)/i.test(clean(root.title));
  const gateFrame=!!root.querySelector('iframe[src*="_Incapsula_Resource"],iframe[src*="captcha" i],#px-captcha,#captchacharacters');
  const blocked=!domProduct&&(gateTitle||gateFrame&&!likelyProduct);
  if(blocked)limitations.push('Access/security verification screen detected; no product audit is possible. No challenge or login is bypassed.');
  return {version:'0.1',origin,language,classification:blocked?'blocked':likelyProduct?'product':ambiguous||microdata.ambiguous||groups.ambiguous?'ambiguous':'non_product',title:redact(clean(root.title)),metaDescription,h1,headingLevels,canonical,robots,
    product:{name,description,descriptionSource,brand,category,specifications,context:context.slice(0,20),price,priceKind,currency,currencySource,priceReliable,availability,stockObservations,stockTruncated,cart,cartEnabled,variants,variantsLabelled,shipping,returns,shippable:shipping?true:null,images},
    schema:{products:candidates,selected,parseErrors,ambiguous,truncated,microdata,groups},technical:{domCount:root.querySelectorAll('*').length,scripts:root.scripts.length,styles:root.querySelectorAll('link[rel="stylesheet"],style').length,dpr:devicePixelRatio||1},limitations,incomplete,unstable:false};
}
