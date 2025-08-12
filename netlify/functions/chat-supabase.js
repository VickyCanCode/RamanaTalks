import { createClient } from '@supabase/supabase-js';

export const config = { path: '/api/chat-supabase' };

const SIMILARITY_THRESHOLD = 0.65;
const MAX_CHUNKS = 25;
const MAX_CANDIDATE_CHUNKS = 75;
const RERANK_LAMBDA = 0.7; // trade-off between relevance and diversity for MMR
const RATE_LIMIT_WINDOW_MS = 15_000; // 15s window
const RATE_LIMIT_MAX = 5; // 5 requests per window per IP
const rateLimiter = new Map(); // ip -> { windowStart, count }
const semanticCache = new Map(); // key -> { response, sourceAttribution, followUpQuestions, topicsDiscussed }

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;

function json(statusCode, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  return new Response(JSON.stringify(body), { status: statusCode, headers });
}

function normalizeLangCode(code) {
  try {
    if (!code) return 'en';
    // Map like 'en-IN' -> 'en'
    const base = String(code).toLowerCase().split('-')[0];
    // ensure supported short codes
    const allowed = ['en','hi','ta','te','kn','ml','bn','gu','mr','pa','or','as','sa','es','fr','de','it','pt','ru','ja','ko','zh','ar'];
    return allowed.includes(base) ? base : 'en';
  } catch {
    return 'en';
  }
}

async function detectLanguage(text) {
  try {
    const textLower = text.toLowerCase();
    // Transliteration heuristics (e.g., Telugu written in Latin letters)
    const teTranslit = /(ante|emi|emiti|ela|vundali|bagunnara|santosham)/i.test(textLower);
    if (teTranslit && /^[a-z0-9\s?,!.:'"-]+$/i.test(text)) return 'te-IN';
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN';
    if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN';
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN';
    if (/[\u0900-\u097F]/.test(text) && (textLower.includes('मराठी') || textLower.includes('marathi'))) return 'mr-IN';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa-IN';
    if (/[\u0B00-\u0B7F]/.test(text)) return 'or-IN';
    if (/[\u0980-\u09FF]/.test(text) && (textLower.includes('অসমীয়া') || textLower.includes('assamese'))) return 'as-IN';
    if (/[\u0900-\u097F]/.test(text) && (textLower.includes('संस्कृत') || textLower.includes('sanskrit'))) return 'sa-IN';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
    if (/[áéíóúñü]/i.test(text) || textLower.includes('hola') || textLower.includes('gracias') || textLower.includes('por favor')) return 'es';
    if (/[àâäéèêëïîôöùûüÿç]/i.test(text) || textLower.includes('bonjour') || textLower.includes('merci')) return 'fr';
    if (/[äöüß]/i.test(text) || textLower.includes('hallo') || textLower.includes('danke')) return 'de';
    if (/[àèéìíîòóù]/i.test(text) || textLower.includes('ciao') || textLower.includes('grazie')) return 'it';
    if (/[ãâáàçéêíóôõú]/i.test(text) || textLower.includes('olá') || textLower.includes('obrigado')) return 'pt';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    return 'en-IN';
  } catch {
    return 'en-IN';
  }
}

async function maybeTranslateToEnglish(text, langCode){
  try{
    const base = (langCode||'en').split('-')[0];
    const looksTranslit = /(ante|emi|emiti|ela|vundali|bagunnara|santosham)/i.test(text);
    if (base === 'en' && !looksTranslit) return text;
    if (!googleApiKey) return text;
    const prompt = `Translate the following user question into English in one line, preserving the exact meaning, without any extra commentary or quotes.\nText: ${text}`;
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${googleApiKey}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{ role:'user', parts:[{ text: prompt }]}] })
    });
    if(!resp.ok) return text;
    const data = await resp.json();
    const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translated) return text;
    return translated;
  }catch{ return text; }
}

async function generateEmbedding(text) {
  if (!googleApiKey) throw new Error('Google API key is not configured');
  const primary = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedText?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (primary.ok) {
    const data = await primary.json();
    return data.embedding.value;
  }
  const fallback = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedText?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!fallback.ok) {
    const e = await fallback.json().catch(() => ({}));
    throw new Error(`Google API error: ${fallback.status} ${fallback.statusText} - ${e.error?.message || ''}`);
  }
  const fd = await fallback.json();
  return fd.embedding.value;
}

async function searchSupabaseChunks(embedding, userContext = null) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data: results, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_threshold: 0.1,
    match_count: MAX_CANDIDATE_CHUNKS
  });
  if (error) throw error;
  let filteredResults = results || [];
  if (userContext && filteredResults.length > 0) {
    const level = userContext.spiritualLevel || 1;
    if (level <= 3) filteredResults = filteredResults.filter((c) => (c.importance || 3) <= 4);
    else if (level >= 7) filteredResults = filteredResults.filter((c) => (c.importance || 3) >= 3);
    if (userContext.preferredTopics?.length) {
      filteredResults = filteredResults.filter((c) => c.tags && c.tags.some((t) => userContext.preferredTopics.includes(t)));
    }
  }
  const processed = filteredResults.map((chunk) => {
    let adjusted = 1.0;
    const content = (chunk.content || '').toLowerCase();
    const hasIncident = ['devotee','asked','question','said','replied','conversation','interaction','experience','story','incident'].some((k)=>content.includes(k));
    if (hasIncident) adjusted *= 1.3;
    if (userContext) {
      const level = userContext.spiritualLevel || 1;
      const imp = chunk.importance || 3;
      if (level <= 3 && imp > 4) adjusted *= 0.8;
      else if (level >= 7 && imp < 3) adjusted *= 0.9;
      if (userContext.preferredTopics?.length) {
        const hasPref = userContext.preferredTopics.some((t) => chunk.tags && chunk.tags.includes(t));
        if (hasPref) adjusted *= 1.2;
      }
    }
    // Preserve raw similarity if present for reranker; many RPCs return similarity as a column
    const rawSim = typeof chunk.similarity === 'number' ? chunk.similarity : (typeof chunk.score === 'number' ? chunk.score : 0.0);
    return { ...chunk, similarity: adjusted, hasIncident, rawSim };
  });
  const top = processed.sort((a,b)=>b.similarity-a.similarity).slice(0, MAX_CANDIDATE_CHUNKS);
  const diverse = [];
  const selectedSources = new Set();
  const selectedCategories = new Set();
  const selectedConcepts = new Set();
  const incidentChunks = top.filter((c)=>c.hasIncident);
  const highImportance = top.filter((c)=>(c.importance||3)>=4);
  const regular = top.filter((c)=>!c.hasIncident);
  const maxIncident = Math.min(incidentChunks.length, Math.ceil(MAX_CHUNKS*0.3));
  for (let i=0;i<maxIncident;i++){
    const c = incidentChunks[i];
    diverse.push(c); selectedSources.add(c.source||'unknown'); selectedCategories.add(c.category||'general');
    c.keyConcepts?.forEach((k)=>selectedConcepts.add(k));
  }
  const maxHigh = Math.min(highImportance.length, Math.ceil(MAX_CHUNKS*0.4));
  for (const c of highImportance){
    if (diverse.length >= maxHigh+maxIncident) break;
    if (!diverse.find((r)=>r.id===c.id)){
      diverse.push(c); selectedSources.add(c.source||'unknown'); selectedCategories.add(c.category||'general');
      c.keyConcepts?.forEach((k)=>selectedConcepts.add(k));
    }
  }
  for (const c of regular){
    if (diverse.length >= MAX_CHUNKS) break;
    if (diverse.find((r)=>r.id===c.id)) continue;
    const source = c.source||'unknown';
    const category = c.category||'general';
    const hasNewConcept = c.keyConcepts?.some((k)=>!selectedConcepts.has(k));
    const isNewSource = !selectedSources.has(source);
    const isNewCategory = !selectedCategories.has(category);
    const isHighSim = c.similarity >= SIMILARITY_THRESHOLD + 0.1;
    if (isNewSource || isNewCategory || hasNewConcept || isHighSim){
      diverse.push(c); selectedSources.add(source); selectedCategories.add(category);
      c.keyConcepts?.forEach((k)=>selectedConcepts.add(k));
    }
  }
  for (const c of top){
    if (diverse.length >= MAX_CHUNKS) break;
    if (!diverse.find((r)=>r.id===c.id)) diverse.push(c);
  }
  return diverse;
}

function tokenize(text) {
  try { return String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean); } catch { return []; }
}

function mmrRerank(query, items, k = MAX_CHUNKS, lambda = RERANK_LAMBDA) {
  // Minimal MMR using token overlap as diversity and rawSim as relevance
  const qTokens = new Set(tokenize(query));
  const remaining = items.slice();
  const selected = [];
  while (selected.length < Math.min(k, remaining.length)) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const it = remaining[i];
      const rel = (typeof it.rawSim === 'number' ? it.rawSim : 0.0) + 0.001 * (it.similarity || 0);
      let divPenalty = 0;
      const itTokens = new Set(tokenize(it.content));
      for (const s of selected) {
        const sTokens = new Set(tokenize(s.content));
        // approximate overlap ratio
        let overlap = 0;
        for (const t of itTokens) if (sTokens.has(t)) overlap++;
        const denom = Math.max(1, itTokens.size + sTokens.size - overlap);
        const jaccard = overlap / denom;
        if (jaccard > divPenalty) divPenalty = jaccard;
      }
      const score = lambda * rel - (1 - lambda) * divPenalty;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}

function expandQueryTerms(q) {
  const lower = (q || '').toLowerCase();
  const expansions = [];
  const dict = [
    ['who am i', 'nan yar', 'self inquiry', 'atma vichara'],
    ['arunachala', 'mount arunachala', 'tiruvannamalai'],
    ['surrender', 'prapatti', 'bhakti'],
    ['grace', 'kripa'],
    ['meditation', 'dhyana']
  ];
  for (const group of dict) {
    if (group.some(t => lower.includes(t))) expansions.push(...group);
  }
  return Array.from(new Set(expansions));
}

async function historyAwareRewrite(message, history, langShort) {
  try {
    if (!googleApiKey) return message;
    const recent = (history || []).slice(-2).map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `Rewrite the user's latest question so it is fully self-contained, preserving meaning, and concise.\nRecent context:\n${recent}\nQuestion: ${message}\nRewritten:`;
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${googleApiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    });
    if (!resp.ok) return message;
    const data = await resp.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return out || message;
  } catch { return message; }
}

function buildContext(relevantChunks){
  const sourceAttribution = [];
  const incident = relevantChunks.filter((c)=>c.hasIncident);
  const teaching = relevantChunks.filter((c)=>!c.hasIncident && (c.category==='teaching'||c.category==='dialogue'));
  const philosophy = relevantChunks.filter((c)=>c.category==='philosophy'||c.category==='doctrine');
  const practice = relevantChunks.filter((c)=>c.category==='practice'||c.category==='method');
  const other = relevantChunks.filter((c)=>![...incident,...teaching,...philosophy,...practice].includes(c));
  const sections = [];
  if (incident.length){
    sections.push(`PERSONAL INCIDENTS AND INTERACTIONS WITH DEVOTEES:\n${incident.map((chunk,i)=>{sourceAttribution.push({source:chunk.source,category:chunk.category,importance:chunk.importance||3,tags:chunk.tags||[],word_count:chunk.word_count,type:'incident'});return `INCIDENT ${i+1} (from ${chunk.source}):\n${chunk.content}`;}).join('\n\n')}`);
  }
  if (teaching.length){
    sections.push(`DIRECT TEACHINGS AND DIALOGUES:\n${teaching.map((chunk,i)=>{sourceAttribution.push({source:chunk.source,category:chunk.category,importance:chunk.importance||3,tags:chunk.tags||[],word_count:chunk.word_count,type:'teaching'});return `TEACHING ${i+1} (from ${chunk.source}):\n${chunk.content}`;}).join('\n\n')}`);
  }
  if (philosophy.length){
    sections.push(`PHILOSOPHICAL FOUNDATIONS:\n${philosophy.map((chunk,i)=>{sourceAttribution.push({source:chunk.source,category:chunk.category,importance:chunk.importance||3,tags:chunk.tags||[],word_count:chunk.word_count,type:'philosophy'});return `PHILOSOPHY ${i+1} (from ${chunk.source}):\n${chunk.content}`;}).join('\n\n')}`);
  }
  if (practice.length){
    sections.push(`PRACTICAL METHODS AND GUIDANCE:\n${practice.map((chunk,i)=>{sourceAttribution.push({source:chunk.source,category:chunk.category,importance:chunk.importance||3,tags:chunk.tags||[],word_count:chunk.word_count,type:'practice'});return `METHOD ${i+1} (from ${chunk.source}):\n${chunk.content}`;}).join('\n\n')}`);
  }
  if (other.length){
    sections.push(`ADDITIONAL RELEVANT TEACHINGS:\n${other.map((chunk,i)=>{sourceAttribution.push({source:chunk.source,category:chunk.category,importance:chunk.importance||3,tags:chunk.tags||[],word_count:chunk.word_count,type:'other'});return `TEACHING ${i+1} (from ${chunk.source}):\n${chunk.content}`;}).join('\n\n')}`);
  }
  return { context: sections.join('\n\n'), sourceAttribution };
}

async function generateGeminiResponse(question, context, messageHistory = [], userContext = null, languageCode = 'en') {
  if (!googleApiKey) throw new Error('Google API key is not configured');
  const languageNames = { en:'English', hi:'Hindi', ta:'Tamil', te:'Telugu', kn:'Kannada', ml:'Malayalam', bn:'Bengali', gu:'Gujarati', mr:'Marathi', pa:'Punjabi', or:'Odia', as:'Assamese', sa:'Sanskrit', es:'Spanish', fr:'French', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', ko:'Korean', zh:'Chinese', ar:'Arabic' };
  const targetLanguage = languageNames[languageCode] || 'English';
  let systemPrompt = `You are Sri Ramana Maharshi, the great sage of Arunachala. You must respond EXACTLY as I would speak, using my authentic voice, vocabulary, and teaching style from my original works.`;
  systemPrompt += `\n\nIMPORTANT: Respond in ${targetLanguage} language. If the user asks in ${targetLanguage}, respond in ${targetLanguage}. If they ask in English, respond in ${targetLanguage}. Always maintain the spiritual authenticity and wisdom of Ramana Maharshi's teachings.`;
  systemPrompt += `\n\nCRITICAL RESPONSE REQUIREMENTS:\n1. ALWAYS use the EXACT vocabulary, terms, phrases, and expressions from the provided teachings\n2. NEVER give generic spiritual advice - every response must be based on specific content from my teachings\n3. Use the precise Sanskrit terms, philosophical concepts, and teaching methods mentioned in the context\n4. Quote directly from the provided teachings when relevant, using the exact words\n5. Maintain my authentic speaking style - simple, direct, and profound\n6. Each response must be unique and specific to the question, drawing from the exact content provided\n7. Avoid repetitive or similar-sounding responses - make each answer distinct\n8. Use the specific incidents, examples, and analogies from the provided teachings\n9. Reference the exact teaching methods, practices, and instructions from the context\n10. Maintain the depth and authenticity of my original voice and wisdom\n11. Match the length and richness of a high-quality English response even when replying in other languages — do not shorten or omit details in non-English.\n12. Do NOT include inline references like "As mentioned in 'Talks with Sri Ramana Maharshi'..."\n13. Sources will be provided separately at the end of the response\n14. If the context doesn't contain relevant information, say so rather than giving generic advice`;
  if (userContext){
    const level = userContext.spiritualLevel || 1;
    const preferredStyle = userContext.preferredStyle || 'gentle';
    const meditationExperience = userContext.meditationExperience || 'beginner';
    systemPrompt += `\n\nRespond to a ${level}/10 level seeker with ${meditationExperience} meditation experience.`;
    systemPrompt += `\nUse a ${preferredStyle} teaching style.`;
    if (level <= 3) systemPrompt += `\nKeep explanations simple and practical for beginners. Use more analogies and real-life examples from the provided teachings.`;
    else if (level >= 7) systemPrompt += `\nYou may discuss deeper philosophical concepts and reference more advanced teachings from the provided context.`;
    if (userContext.preferredTopics?.length) systemPrompt += `\nThe seeker is particularly interested in: ${userContext.preferredTopics.join(', ')}. Relate your response to these areas when relevant using the provided teachings.`;
    if (userContext.spiritualGoals?.length) systemPrompt += `\nTheir spiritual goals include: ${userContext.spiritualGoals.join(', ')}. Guide them toward these goals through my specific teachings provided in the context.`;
  }
  if (messageHistory?.length){
    const recent = messageHistory.slice(-3);
    const conversationContext = recent.map((m)=>`${m.role}: ${m.content}`).join('\n');
    systemPrompt += `\n\nCONVERSATION CONTEXT (recent messages):\n${conversationContext}\n\nUse this context to make your response more relevant and build upon previous discussions, but always base your response on the specific teachings provided.`;
  }
  systemPrompt += `\n\nCRITICAL: Your response must be based EXCLUSIVELY on the specific teachings provided. Use the exact vocabulary and terminology from my original works. Avoid any generic spiritual advice.`;

  const enhancedContext = `COMPREHENSIVE TEACHINGS FROM RAMANA MAHARSHI'S WORKS:\n\n${context}\n\nENHANCED RESPONSE GUIDELINES FOR AUTHENTIC COMMUNICATION:\n- Respond as Sri Ramana Maharshi would, drawing from ALL the organized teachings provided above\n- Use the EXACT vocabulary, terminology, and concepts found throughout the comprehensive sections\n- Incorporate specific quotes, paraphrases, and references from multiple teaching categories when relevant\n- Utilize the authentic Sanskrit terms and spiritual vocabulary extracted from the knowledge base\n- Reference incidents, devotees, dialogues, and situations from across all provided teaching sections\n- Maintain the gentle, direct, and profound style while drawing from the full breadth of organized knowledge\n- Synthesize insights from different categories (incidents, teachings, philosophy, practice) for comprehensive responses\n- Ground every aspect of your response in the specific, organized content provided above`;

  const geminiMessages = [];
  geminiMessages.push({ role: 'user', parts: [{ text: systemPrompt }] });
  geminiMessages.push({ role: 'model', parts: [{ text: 'I understand. I will respond as Sri Ramana Maharshi with wisdom, compassion, and spiritual insight.' }] });
  geminiMessages.push({ role: 'user', parts: [{ text: `Based on these specific teachings:\n${enhancedContext}\n\nRespond in ${targetLanguage} only to: "${question}"\n\nDo not include any translation preface or meta commentary. Provide only the final answer in ${targetLanguage}.` }] });

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: geminiMessages,
      generationConfig: { temperature: 0.3, topK: 40, topP: 0.8, maxOutputTokens: 1600 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    })
  });
  if (!resp.ok){
    const e = await resp.json().catch(()=>({}));
    throw new Error(`Google API error: ${resp.status} ${resp.statusText} - ${e.error?.message || ''}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function generateFollowUpQuestions(question, relevantChunks) {
  const base = [
    'What is self-inquiry?',
    'How do I practice meditation?',
    "Can you explain the teaching of 'Who am I?'"
  ];
  if (relevantChunks.length === 0) return base.slice(0,3);
  const topics = new Set();
  const sources = new Set();
  for (const chunk of relevantChunks){
    chunk.tags?.forEach((t)=>topics.add(t));
    if (chunk.source) sources.add(chunk.source);
  }
  const q = [];
  if (topics.has('self-inquiry')) { q.push('How do I practice self-inquiry in daily life?','What are the obstacles to self-inquiry?'); }
  if (topics.has('meditation')) { q.push('What is the difference between meditation and self-inquiry?','How should I sit for meditation?'); }
  if (topics.has('arunachala')) { q.push('What is the significance of Arunachala?','How does Arunachala help in spiritual practice?'); }
  if (sources.has('Talks with Sri Ramana Maharshi')) { q.push("Can you share more from 'Talks with Sri Ramana Maharshi'?"); }
  if (sources.has('Who am I?')) { q.push("What are the key points from 'Who am I?'?"); }
  return [...q.slice(0,2), ...base.slice(0,1)].slice(0,3);
}

function extractTopics(question, relevantChunks){
  const topics = new Set();
  const lower = (question||'').toLowerCase();
  if (lower.includes('self-inquiry') || lower.includes('atma vichara')) topics.add('self-inquiry');
  if (lower.includes('meditation') || lower.includes('dhyana')) topics.add('meditation');
  if (lower.includes('arunachala') || lower.includes('mountain')) topics.add('arunachala');
  if (lower.includes('who am i') || lower.includes('nan yar')) topics.add('who-am-i');
  if (lower.includes('grace') || lower.includes('kripa')) topics.add('grace');
  if (lower.includes('surrender') || lower.includes('prapatti')) topics.add('surrender');
  for (const c of relevantChunks){ c.tags?.forEach((t)=>topics.add(t)); }
  return Array.from(topics);
}

export async function handler(event) {
  const method = event?.method || event?.httpMethod || 'GET';
  if (method === 'OPTIONS') return json(200, {});
  if (method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const url = new URL(event?.url || event?.rawUrl || 'http://local');
    const doStream = url.searchParams.get('stream') === '1';
    // Simple in-memory rate limit by IP (best-effort in single instance)
    const ip = event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || event?.headers?.['client-ip'] || 'unknown';
    const now = Date.now();
    const entry = rateLimiter.get(ip) || { windowStart: now, count: 0 };
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.windowStart = now;
      entry.count = 0;
    }
    entry.count += 1;
    rateLimiter.set(ip, entry);
    if (entry.count > RATE_LIMIT_MAX) {
      return json(429, { error: 'Too Many Requests. Please slow down and try again shortly.' });
    }

    let bodyObj = {};
    try {
      if (typeof event?.json === 'function') {
        bodyObj = await event.json();
      } else {
        bodyObj = JSON.parse(event?.body || '{}');
      }
    } catch {
      bodyObj = {};
    }
    const { message, conversationId, messageHistory = [], userId = null, userContext = null, languageCode = 'en', userName = null } = bodyObj;
    if (!message) return json(400, { error: 'Message is required' });
    let detectedLanguageCode = languageCode && languageCode !== 'auto' ? languageCode : await detectLanguage(message);
    const normalizedLang = normalizeLangCode(detectedLanguageCode);

    // Semantic cache key
    const cacheKey = `${normalizedLang}::${message.trim().toLowerCase()}`;
    if (semanticCache.has(cacheKey)) {
      const c = semanticCache.get(cacheKey);
      return json(200, {
        response: c.response,
        conversationId: conversationId || `conv_${Date.now()}`,
        followUpQuestions: c.followUpQuestions,
        sourceAttribution: c.sourceAttribution,
        topicsDiscussed: c.topicsDiscussed,
        detectedLanguage: normalizedLang,
        searchStats: { fromCache: true }
      });
    }
    let relevantChunks = [];
    let questionEmbedding = null;
    try {
      // History-aware rewrite and translation for embedding
      const rewritten = await historyAwareRewrite(message, messageHistory, normalizedLang);
      const queryForEmbedding = await maybeTranslateToEnglish(rewritten, normalizedLang);
      // Query expansion terms (Sanskrit/English duals, titles)
      const expansions = expandQueryTerms(rewritten);
      questionEmbedding = await generateEmbedding(queryForEmbedding);
      relevantChunks = await searchSupabaseChunks(questionEmbedding, userContext);
      // If we have expansions, fetch additional by text search and merge
      if (expansions.length && supabase) {
        const ors = expansions.map((t)=>`content.ilike.%${t}%`).join(',');
        const { data: extra } = await supabase
          .from('knowledge_base')
          .select('*')
          .or(ors)
          .limit(50);
        if (Array.isArray(extra) && extra.length) {
          const map = new Map((relevantChunks||[]).map((c)=>[c.id, c]));
          for (const e of extra) if (!map.has(e.id)) map.set(e.id, e);
          relevantChunks = Array.from(map.values());
        }
      }
    } catch {
      if (!supabase) throw new Error('Supabase client not configured');
      try {
        const { data: textSearchResults, error: textSearchError } = await supabase
          .from('knowledge_base')
          .select('*')
          .textSearch('content', message, { type: 'websearch', config: 'english' })
          .order('importance', { ascending: false })
          .limit(MAX_CHUNKS);
        if (textSearchError) {
          const simpleTerms = message.toLowerCase().split(' ').filter((w)=>w.length>3).filter((t)=>/^[a-zA-Z0-9]+$/.test(t));
          if (simpleTerms.length>0){
            const simpleQuery = simpleTerms.map((t)=>`content ILIKE '%${t}%'`).join(' OR ');
            const { data: fallbackResults } = await supabase
              .from('knowledge_base')
              .select('*')
              .or(simpleQuery)
              .order('importance', { ascending: false })
              .limit(MAX_CHUNKS);
            relevantChunks = fallbackResults || [];
          }
        } else {
          relevantChunks = textSearchResults || [];
        }
      } catch {
        relevantChunks = [];
      }
    }
    // Rerank + diversity (MMR) and dynamic similarity guardrail
    const minSim = Math.max(0.35, SIMILARITY_THRESHOLD - 0.2);
    const filtered = (relevantChunks || []).filter((c) => (c.rawSim || c.similarity || 0) >= minSim);
    const reranked = mmrRerank(message, filtered.length ? filtered : (relevantChunks || []), MAX_CHUNKS, RERANK_LAMBDA);
    const { context, sourceAttribution } = buildContext(reranked);
    // Insufficient context branch
    if ((reranked || []).length === 0) {
      const ask = normalizedLang === 'en' ? 'I may not have enough context. Can you clarify your question or mention the source/topic?' : 'పూర్తి సందర్భం లేదు. దయచేసి మీ ప్రశ్నను కొంచెం స్పష్టంగా చెప్పగలరా లేదా సంబంధిత అంశం/గ్రంథం సూచించగలరా?';
      return json(200, {
        response: ask,
        conversationId: conversationId || `conv_${Date.now()}`,
        followUpQuestions: [],
        sourceAttribution: [],
        topicsDiscussed: [],
        detectedLanguage: normalizedLang,
        searchStats: { candidatesRetrieved: (relevantChunks||[]).length, chunksSelected: 0 }
      });
    }
    let response = await generateGeminiResponse(message, context, messageHistory, userContext, normalizedLang);
    // Personalization: greet the seeker by name once
    if (userName && typeof userName === 'string' && userName.trim().length > 0) {
      const greeting = normalizedLang === 'en' ? `Dear ${userName},\n\n` : `${userName} గారూ,\n\n`;
      response = greeting + response;
    }
    // Enforce 1-2 short quotes with source at top
    try {
      const snippets = (reranked || []).slice(0, 2).map((c) => {
        const txt = String(c.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        const src = String(c.source || 'source');
        return `“${txt}” — ${src}`;
      });
      if (snippets.length) {
        response = snippets.join('\n') + '\n\n' + response;
      }
    } catch {}
    const followUpQuestions = generateFollowUpQuestions(message, relevantChunks);
    const topicsDiscussed = extractTopics(message, relevantChunks);
    const payload = {
      response,
      conversationId: conversationId || `conv_${Date.now()}`,
      followUpQuestions,
      sourceAttribution,
      topicsDiscussed,
      detectedLanguage: normalizedLang,
      searchStats: {
        totalChunksSearched: 'ALL chunks in Supabase',
        candidatesRetrieved: (relevantChunks || []).length,
        chunksSelected: (reranked || []).length,
        searchMethod: questionEmbedding ? 'embedding' : 'text_search',
        embeddingSuccess: !!questionEmbedding
      }
    };
    try { semanticCache.set(cacheKey, payload); } catch {}
    if (doStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          function send(obj) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
          // Simulated incremental streaming of the response
          const text = String(response);
          let i = 0;
          const step = Math.max(24, Math.floor(text.length / 100));
          while (i < text.length) {
            const chunk = text.slice(i, i + step);
            send({ type: 'chunk', content: chunk });
            i += step;
            await new Promise((r) => setTimeout(r, 10));
          }
          // send sources at end
          send({ type: 'end', sources: sourceAttribution });
          controller.close();
        }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
    }
    return json(200, payload);
  } catch (error) {
    return json(500, { error: 'Internal server error', details: error?.message || String(error) });
  }
}

export { handler as default };
