// Run with Node 22+; streams public JSONL without loading the source archive in memory.
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const source = 'https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/review_categories/All_Beauty.jsonl.gz';
const metadataSource = 'https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_All_Beauty.jsonl.gz';
async function* records(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(180000)});
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  const stream = Readable.fromWeb(response.body);
  const gzip = createGunzip();
  stream.on('error', error => gzip.destroy(error));
  stream.pipe(gzip);
  const lines = createInterface({input:gzip, crlfDelay:Infinity});
  try { for await (const line of lines) { if(line.trim()) yield JSON.parse(line); } }
  finally { lines.close(); stream.unpipe(gzip); stream.destroy(); gzip.destroy(); }
}
function readableText(value) {
  const entities = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  let text = value;
  for(let pass=0;pass<2;pass++)text=text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,entity)=>{
    if(entity[0]!=='#')return entities[entity.toLowerCase()] || match;
    const hex=entity[1].toLowerCase()==='x';const code=parseInt(entity.slice(hex?2:1),hex?16:10);
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):match;
  });
  return text.replace(/<br\s*\/?>/gi,'\n').replace(/<\/?(?:p|b|strong|i|em)\b[^>]*>/gi,'').trim();
}
const pool = [], seen = new Set();
let scanned = 0;
for await (const item of records(source)) {
  scanned++;
  const text = typeof item.text === 'string' ? readableText(item.text) : '';
  if (!text || text.length > 2000 || !item.parent_asin || !Number.isFinite(item.timestamp) || !Number.isFinite(item.rating) || item.rating < 1 || item.rating > 5) continue;
  const date = new Date(item.timestamp).toISOString().slice(0,10);
  const key = JSON.stringify([item.parent_asin,text.toLowerCase(),date,item.rating]);
  if(seen.has(key))continue;
  seen.add(key);
  pool.push({id:`R${String(pool.length+1).padStart(3,'0')}`,text,product:item.parent_asin,date,rating:item.rating});
  if(pool.length===50000)break;
}
if(pool.length<50000)throw new Error('Not enough eligible reviews; existing default was not changed.');
const groups = new Map();
for(const row of pool){const group=groups.get(row.product)||[];group.push(row);groups.set(row.product,group);}
const chosen = [...groups.entries()].filter(([,rows])=>rows.length>=20).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0])).slice(0,6);
if(chosen.length!==6)throw new Error('Not enough products for the default sample.');
console.log(`Read ${scanned} rows; kept ${pool.length} eligible reviews. Selected six products with at least 20 reviews each.`);
const names = new Map();
for await(const item of records(metadataSource)) {
  if(chosen.some(([id])=>id===item.parent_asin) && typeof item.title==='string')names.set(item.parent_asin,item.title);
  if(names.size===chosen.length)break;
}
const hash = r=>createHash('sha256').update('signal-v1:'+r.text+':'+r.date).digest('hex');
const defaultReviews = chosen.flatMap(([id,rows])=>[...rows].sort((a,b)=>hash(a).localeCompare(hash(b))).slice(0,20).map(row=>({...row,product:names.has(id)?`${names.get(id).slice(0,78)} · ${id}`:id}))).sort((a,b)=>a.date.localeCompare(b.date)||a.product.localeCompare(b.product)).map((row,i)=>({...row,id:`R${String(i+1).padStart(3,'0')}`}));
const csvCell = value=>{let v=String(value??'');if(/^[\s]*[=+@-]/.test(v)||/^[\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
const csv = rows=>[['review','product','date','rating'],...rows.map(r=>[r.text,r.product,r.date,r.rating])].map(row=>row.map(csvCell).join(',')).join('\r\n');
const provenance={name:'Amazon reviews · All Beauty',dataset:'Amazon Reviews 2023 — McAuley Lab',category:'All_Beauty',sourcePage:'https://amazon-reviews-2023.github.io/',reviewSource:source,metadataSource,retrievedAt:new Date().toISOString(),sourceRowsScanned:scanned,eligiblePoolSize:pool.length,defaultReviewCount:defaultReviews.length,defaultProductCount:chosen.length,dateRange:[defaultReviews[0].date,defaultReviews.at(-1).date],selection:'First 50,000 eligible unique reviews in source order; six most-reviewed products in that pool; 20 per product selected by ascending SHA-256 of signal-v1:text:date. This convenience sample is not representative of the full category.',filters:'Non-empty review text up to 2,000 characters, product ID, timestamp, rating 1–5. HTML line breaks and common/numeric entities are normalized to readable text; simple formatting tags are removed. Exact duplicate product/text/date/rating records removed. No language detection was applied.',labels:'No reference sentiment labels. Star ratings are not ground truth and are not used as expected_sentiment.',productNames:chosen.map(([id])=>({parent_asin:id,title:names.get(id)||null})),privacy:'Reviewer IDs, images and profile fields are omitted.'};
await mkdir('data/feedback',{recursive:true});await mkdir('public/feedback',{recursive:true});
await writeFile('data/feedback/amazon-default.json',JSON.stringify(defaultReviews,null,2)+'\n');
await writeFile('data/feedback/amazon-provenance.json',JSON.stringify(provenance,null,2)+'\n');
await writeFile('data/feedback/all-beauty-50000.csv',csv(pool));
await writeFile('public/feedback/amazon-default.csv',csv(defaultReviews));
console.log(JSON.stringify({defaultReviews:defaultReviews.length,poolReviews:pool.length,productNamesFound:names.size,dateRange:provenance.dateRange,defaultBytes:Buffer.byteLength(csv(defaultReviews))}));

