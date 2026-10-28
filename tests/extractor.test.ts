// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { extractPage } from '../src/extractors/index.js';

const page = (body: string, head = '') => {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  document.title = 'Fixture';
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
};
beforeEach(() => page(''));

describe('extractPage', () => {
  it('uses independent visible price/currency/stock and excludes form data', () => {
    page(`<main data-product><h1>Blue Mug</h1><p class="product-description">A useful mug</p>
      <div class="price"><span>€19,90</span><span data-currency>EUR</span></div>
      <span data-stock-status>Out of stock</span><button>Add to cart</button>
      <input name="email" value="private@example.test"><input type="password" value="secret"></main>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Blue Mug', description: 'contact private@example.test', offers: { '@type': 'Offer', price: '999.00', priceCurrency: 'USD', availability: 'https://schema.org/InStock' } })}</script>`);
    const s = extractPage();
    expect(s.version).toBe('0.1');
    expect(s.product.price).toBe('19,90');
    expect(s.product.currency).toBe('EUR');
    expect(s.product.priceReliable).toBe(false); // visible value and selected schema offer disagree
    expect(s.product.availability).toBe('out_of_stock');
    expect(JSON.stringify(s)).not.toContain('private@example.test');

  });

  it('requires rendered description and never falls back to all main text', () => {
    page('<main><h1>Camera</h1><p>Shipping and account text, but no product description.</p><div style="display:none" class="product-description">hidden</div></main>');
    const s = extractPage();
    expect(s.product.description).toBe('');
    expect(s.incomplete.join(' ')).toMatch(/description/i);
  });

  it('resolves graph references whether definitions precede or follow, including offer arrays', () => {
    const graph = { '@graph': [
      { '@type': 'Product', '@id': '#p', name: 'Camera', brand: { '@id': '#brand' }, offers: [{ '@id': '#o1' }, { '@id': '#o2' }] },
      { '@id': '#o1', '@type': 'Offer', price: '10', priceCurrency: 'EUR' },
      { '@id': '#brand', '@type': 'Brand', name: 'Lens Co' },
      { '@id': '#o2', '@type': 'Offer', price: '11', priceCurrency: 'EUR' }
    ] };
    page('<main><h1>Camera</h1><div class="price">EUR 10</div></main><script type="application/ld+json">' + JSON.stringify(graph) + '</script>');
    const s = extractPage();
    expect(s.schema.products[0].id).toBe('product-1');
    expect(s.schema.products[0].brand).toBe('Lens Co');
    expect(s.schema.products[0].offers).toHaveLength(2);
    expect(s.schema.products[0].offers.map(o => o.price)).toEqual(['10', '11']);
  });

  it('counts malformed JSON once within the byte/block budget', () => {
    page('<main><h1>Thing</h1></main><script type="application/ld+json">{bad</script><script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', name: 'Other' }) + '</script>');
    expect(extractPage().schema.parseErrors).toBe(1);
  });

  it('rejects ambiguous ranges, sale labels, uncertain punctuation and missing visible ISO currency', () => {
    page('<main><h1>Chair</h1><div class="price">From 1.299,95 € – 1.499,95 €</div><span data-currency>EUR</span></main>');
    const s = extractPage();
    expect(s.product.priceReliable).toBe(false);
    page('<main><h1>Chair</h1><div class="price">1,299</div></main>');
    expect(extractPage().product.priceReliable).toBe(false);
  });

  it('searches all semantic cart buttons and respects disabled states', () => {
    page('<main><h1>Mug</h1><button>Newsletter</button><button aria-disabled="true">Add to cart</button><button>Add to cart</button></main>');
    const s = extractPage();
    expect(s.product.cart).toBe(true);
    expect(s.product.cartEnabled).toBe(true);
    page('<main><h1>Mug</h1><button>Newsletter</button><button disabled>Add to cart</button></main>');
    expect(extractPage().product.cartEnabled).toBe(false);
  });

  it('limits variants to PDP controls and requires each control own label', () => {
    page('<main><h1>Mug</h1><label>Unrelated account label</label><select id="size"><option>Large</option></select><label for="size">Size</label><input type="radio" id="colour" name="colour"><label for="colour">Colour</label></main>');
    const s = extractPage();
    expect(s.product.variants).toBe(2);
    expect(s.product.variantsLabelled).toBe(true);
  });

  it('marks missing relevant fields and keeps synchronous snapshots coherent', () => {
    page('<main><h1>Plain</h1></main>');
    const s = extractPage();
    expect(s.unstable).toBe(false);
    expect(s.incomplete.join(' ')).toMatch(/specifications|images|price/i);
  });
});
