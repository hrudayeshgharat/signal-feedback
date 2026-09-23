export const sentiments = ['positive', 'neutral', 'negative'] as const;
export type Sentiment = typeof sentiments[number];
export const topics = ['Delivery', 'Quality', 'Price', 'Support', 'Usability', 'Other'] as const;
export type Topic = typeof topics[number];
export type Review = { id: string; text: string; product: string; date: string; rating: number | null; expected?: Sentiment };
export type AnalyzedReview = Review & { sentiment: Sentiment; topics: Topic[]; explanation: string; source: 'baseline' | 'ai' };
export const MAX_REVIEWS = 120;
const words: Record<Exclude<Topic, 'Other'>, RegExp> = {
  Delivery: /\b(deliver\w*|ship\w*|arriv\w*|packag\w*|courier|late|delay\w*)\b/i,
  Quality: /\b(quality|broke\w*|broken|durab\w*|defect\w*|scratch\w*|build|material|battery|sound)\b/i,
  Price: /\b(price|pric\w*|cost\w*|expensive|cheap|value|worth|afford\w*|money)\b/i,
  Support: /\b(support|service|refund\w*|return\w*|agent|repl\w*|helpdesk)\b/i,
  Usability: /\b(easy|difficult|setup|install\w*|app|interface|confus\w*|connect\w*|usab\w*|intuitive)\b/i,
};
const positive = new Set('good great excellent amazing love loved easy fast helpful perfect comfortable reliable beautiful intuitive impressive fantastic sturdy affordable smooth happy quick'.split(' '));
const negative = new Set('bad terrible awful hate broken poor slow late expensive disappointed disappointing difficult confusing useless defective damaged delay delayed worst uncomfortable failed unreliable'.split(' '));
export function baseline(review: Review): AnalyzedReview {
  const tokens = review.text.toLowerCase().replace(/n't\b/g, ' not').match(/[a-z]+/g) || [];
  let score = 0;
  const evidence: string[] = [];
  tokens.forEach((word, index) => {
    let value = positive.has(word) ? 1 : negative.has(word) ? -1 : 0;
    if (!value) return;
    const negated = tokens.slice(Math.max(0, index - 3), index).some(t => ['not', 'never', 'no'].includes(t));
    if (negated) value *= -1;
    score += value;
    evidence.push(negated ? `not ${word}` : word);
  });
  const found = (Object.entries(words) as [Exclude<Topic, 'Other'>, RegExp][]).filter(([,regex]) => regex.test(review.text)).map(([topic]) => topic);
  return { ...review, sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', topics: found.length ? found : ['Other'], explanation: evidence.length ? `Local word cues: ${evidence.slice(0, 6).join(', ')}. Mixed cues can cancel out.` : 'No recognized sentiment words; assigned neutral by the local baseline.', source: 'baseline' };
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, ended = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; ended = true; } }
      else cell += c;
    } else if (c === '"' && cell === '' && !ended) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; ended = false;
      if (c !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (ended && !/\s/.test(c)) throw new Error('Unexpected text after a closing quote. Check your CSV formatting.');
      if (c === '"') throw new Error('Quotes inside a CSV field must be escaped as two quotes.');
      if (!ended) cell += c;
    }
  }
  if (quoted) throw new Error('An unclosed quote was found in the CSV.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function importReviews(text: string): { reviews: Review[]; warnings: string[] } {
  const [header, ...rows] = parseCSV(text);
  if (!header || !rows.length) throw new Error('Add a header row and at least one review.');
  const headers = header.map(h => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Column names must be unique.');
  const textIndex = headers.findIndex(h => ['review', 'text', 'review_text'].includes(h));
  if (textIndex < 0) throw new Error('Your CSV needs a review, text, or review_text column.');
  if (rows.length > MAX_REVIEWS) throw new Error(`Please upload at most ${MAX_REVIEWS} reviews per dataset.`);
  const warnings: string[] = [];
  const seen = new Set<string>();
  const reviews: Review[] = [];
  rows.forEach((row, i) => {
    if (row.length !== header.length) throw new Error(`Row ${i + 2} has ${row.length} columns; expected ${header.length}.`);
    const get = (name: string) => (row[headers.indexOf(name)] || '').trim();
    const review = (row[textIndex] || '').trim();
    if (!review) { warnings.push(`Row ${i + 2}: empty review skipped.`); return; }
    if (review.length > 2000) throw new Error(`Row ${i + 2}: review exceeds 2,000 characters.`);
    const product = get('product') || 'Unspecified';
    if (product.length > 100) throw new Error(`Row ${i + 2}: product exceeds 100 characters.`);
    const date = get('date');
    if (date && !validDate(date)) throw new Error(`Row ${i + 2}: use a valid YYYY-MM-DD date.`);
    const rawRating = get('rating');
    const rating = rawRating ? Number(rawRating) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) throw new Error(`Row ${i + 2}: rating must be between 1 and 5.`);
    const expected = get('expected_sentiment');
    if (expected && !sentiments.includes(expected as Sentiment)) throw new Error(`Row ${i + 2}: expected_sentiment must be positive, neutral, or negative.`);
    const fingerprint = JSON.stringify([review.toLowerCase(), product.toLowerCase(), date, rating, expected]);
    if (seen.has(fingerprint)) { warnings.push(`Row ${i + 2}: exact duplicate skipped.`); return; }
    seen.add(fingerprint);
    reviews.push({ id: `R${String(i + 1).padStart(3, '0')}`, text: review, product, date, rating, ...(expected ? {expected: expected as Sentiment} : {}) });
  });
  if (!reviews.length) throw new Error('No non-empty reviews were found.');
  return { reviews, warnings };
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportReviews(reviews: AnalyzedReview[]): string {
  return [['id','review','product','date','rating','sentiment','topics','explanation','source','expected_sentiment'], ...reviews.map(r => [r.id,r.text,r.product,r.date,r.rating,r.sentiment,r.topics.join('; '),r.explanation,r.source,r.expected || ''])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function evaluate(reviews: AnalyzedReview[]) {
  const labeled = reviews.filter(r => r.expected);
  const matrix = sentiments.map(actual => sentiments.map(predicted => labeled.filter(r => r.expected === actual && r.sentiment === predicted).length));
  const correct = labeled.filter(r => r.sentiment === r.expected).length;
  const present = sentiments.filter(s => labeled.some(r => r.expected === s));
  const f1 = present.map(s => {
    const tp = labeled.filter(r => r.expected === s && r.sentiment === s).length;
    const fp = labeled.filter(r => r.expected !== s && r.sentiment === s).length;
    const fn = labeled.filter(r => r.expected === s && r.sentiment !== s).length;
    return 2 * tp / (2 * tp + fp + fn || 1);
  });
  return { total: labeled.length, correct, accuracy: labeled.length ? correct / labeled.length : null, macroF1: f1.length ? f1.reduce((a,b) => a+b,0) / f1.length : null, matrix, disagreements: labeled.filter(r => r.sentiment !== r.expected) };
}
export function validateAIResults(value: unknown, reviews: Review[]): AnalyzedReview[] {
  if (!Array.isArray(value) || value.length !== reviews.length) throw new Error('Incomplete AI response.');
  const ids = new Set<string>();
  return reviews.map(review => {
    const item = value.find(r => r && r.id === review.id);
    if (!item || ids.has(item.id) || !sentiments.includes(item.sentiment) || !Array.isArray(item.topics) || !item.topics.length || item.topics.some((t: unknown) => !topics.includes(t as Topic)) || typeof item.explanation !== 'string' || !item.explanation.trim() || item.explanation.length > 600) throw new Error('Invalid AI response.');
    ids.add(item.id);
    return { ...review, sentiment: item.sentiment, topics: Array.from(new Set<Topic>(item.topics)), explanation: item.explanation, source: 'ai' };
  });
}

