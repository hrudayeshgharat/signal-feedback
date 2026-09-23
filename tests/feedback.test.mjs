import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, parseCSV, importReviews, csvCell, evaluate, validateAIResults, exportReviews } from '../lib/feedback/analysis.ts';
const make = (text, extra={}) => ({id:'R001',text,product:'Test',date:'2026-09-01',rating:3,...extra});
test('CSV supports BOM, quoted commas, newlines and escaped quotes',()=>{
 assert.deepEqual(parseCSV('\uFEFFreview,product\r\n"Good, really ""good""\nquality",Lamp\r\n'),[['review','product'],['Good, really "good"\nquality','Lamp']]);
 assert.throws(()=>parseCSV('review\n"broken'),/unclosed/);
 assert.throws(()=>parseCSV('review\n"a"oops'),/Unexpected/);
});
test('Import validates headers, row shape, dates, ratings and labels',()=>{
 assert.throws(()=>importReviews('product\nLamp'),/needs a review/);
 assert.throws(()=>importReviews('review,review\na,b'),/unique/);
 assert.throws(()=>importReviews('review,rating\na,5,extra'),/columns/);
 assert.throws(()=>importReviews('review,date\na,2026-02-30'),/valid YYYY/);
 assert.throws(()=>importReviews('review,rating\na,NaN'),/rating/);
 assert.throws(()=>importReviews('review,expected_sentiment\na,happy'),/expected_sentiment/);
 assert.throws(()=>importReviews('review\n'+Array(121).fill('good').join('\n')),/at most/);
});
test('Import removes exact duplicates and empty reviews with visible warnings',()=>{
 const result=importReviews('review,product\ngood,Lamp\ngood,Lamp\n,Lamp\nbad,Lamp');
 assert.equal(result.reviews.length,2); assert.equal(result.warnings.length,2);
 assert.equal(result.reviews[1].id,'R004');
});
test('Baseline handles simple negation and ignores ratings and reference labels',()=>{
 assert.equal(baseline(make('not good')).sentiment,'negative');
 assert.equal(baseline(make('not bad')).sentiment,'positive');
 assert.equal(baseline(make('excellent quality',{rating:1,expected:'negative'})).sentiment,'positive');
 assert.deepEqual(baseline(make('delivery was late and support was poor')).topics,['Delivery','Support']);
 assert.equal(baseline(make('It has two pockets')).sentiment,'neutral');
});
test('Exports escape quotes and neutralize spreadsheet formula prefixes',()=>{
 assert.equal(csvCell('=1+2'),'"\'=1+2"'); assert.equal(csvCell(' @SUM(A1)'),'"\' @SUM(A1)"');
 assert.equal(csvCell('say "hi"'),'"say ""hi"""');
 const r=baseline(make('Great, "quality"\nmaterial'));
 const imported=importReviews(exportReviews([r])); assert.equal(imported.reviews[0].text,r.text);
});
test('Evaluation excludes unlabeled rows and exposes mistakes',()=>{
 const result=evaluate([baseline(make('great',{expected:'positive'})),baseline(make('great',{id:'R002',expected:'negative'})),baseline(make('bad',{id:'R003'}))]);
 assert.equal(result.total,2); assert.equal(result.correct,1); assert.equal(result.accuracy,.5);
 assert.equal(result.macroF1,1/3); assert.equal(result.disagreements.length,1);
 assert.deepEqual(result.matrix,[[1,0,0],[0,0,0],[1,0,0]]); assert.equal(evaluate([]).accuracy,null);
});
test('AI validation rejects missing or invented IDs and topics and preserves source text',()=>{
 const rows=[make('actual review')];
 const valid=[{id:'R001',text:'invented text',sentiment:'positive',topics:['Quality'],explanation:'A quality compliment.'}];
 assert.equal(validateAIResults(valid,rows)[0].text,'actual review');
 assert.equal(validateAIResults(valid,rows)[0].source,'ai');
 assert.throws(()=>validateAIResults([],rows));
 assert.throws(()=>validateAIResults([{...valid[0],id:'R999'}],rows));
 assert.throws(()=>validateAIResults([{...valid[0],topics:['Invented']}],rows));
 assert.throws(()=>validateAIResults([{...valid[0],sentiment:'amazing'}],rows));
 assert.throws(()=>validateAIResults([{...valid[0],explanation:''}],rows));
});

test('Real default remains within upload limits and has provenance without invented labels',async()=>{
 const {readFile}=await import('node:fs/promises');
 const rows=JSON.parse(await readFile(new URL('../data/feedback/amazon-default.json',import.meta.url),'utf8'));
 const source=JSON.parse(await readFile(new URL('../data/feedback/amazon-provenance.json',import.meta.url),'utf8'));
 const csv=await readFile(new URL('../public/feedback/amazon-default.csv',import.meta.url),'utf8');
 assert.equal(rows.length,120);assert.equal(new Set(rows.map(r=>r.product)).size,6);
 assert.equal(new Set(rows.map(r=>r.id)).size,120);
 assert.ok(rows.every(r=>!r.expected && r.text.length<=2000 && r.product.length<=100));
 const imported=importReviews(csv).reviews;
 assert.equal(imported.length,rows.length);
 assert.ok(imported.every(r=>!r.expected));
 assert.equal(evaluate(rows.map(baseline)).total,0);
 assert.equal(source.eligiblePoolSize,50000);
 assert.equal(source.defaultReviewCount,rows.length);
 assert.equal(source.sourcePage,'https://amazon-reviews-2023.github.io/');
});
