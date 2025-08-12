/**
 * Simple offline eval: node scripts/eval_retrieval.ts path/to/cases.json
 * cases.json: [{ question: string, expectedPhrases: string[], lang?: string }]
 */
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/eval_retrieval.ts cases.json'); process.exit(1); }
  const raw = fs.readFileSync(path.resolve(file), 'utf-8');
  const cases: Array<{ question: string; expectedPhrases: string[]; lang?: string }> = JSON.parse(raw);
  let ok = 0;
  for (const c of cases) {
    const res = await fetch('http://localhost:8888/api/chat-supabase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: c.question, languageCode: c.lang || 'en' })
    });
    const data = await res.json();
    const resp: string = data?.response || '';
    let hit = 0;
    for (const p of c.expectedPhrases) {
      if (resp.toLowerCase().includes(p.toLowerCase())) hit++;
    }
    const pass = hit > 0;
    if (pass) ok++;
    console.log(JSON.stringify({ q: c.question, hits: hit, pass }, null, 0));
  }
  console.log(`Passed: ${ok}/${cases.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });


