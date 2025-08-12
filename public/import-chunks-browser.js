// Browser-based chunk import script for Supabase
// Run this in your browser console after deploying the site

const SUPABASE_URL = 'https://jgsrxrlibhbucxbexxph.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impnc3J4cmxpYmhidWN4YmV4eHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNTc5MjIsImV4cCI6MjA2OTYzMzkyMn0.A0r_44bExFv9LJAHHQSlGl2vJePyJjXZOrf3JwLHdpA';

async function importChunksFromBrowser() {
  console.log('🚀 Starting browser-based chunk import...');
  
  try {
    // Step 1: Check if table exists
    console.log('🔍 Checking knowledge_base table...');
    
    const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (!checkResponse.ok) {
      console.error('❌ Table does not exist. Please run the migration first.');
      return;
    }
    
    console.log('✅ Knowledge base table exists');
    
    // Step 2: Load the knowledge base file
    console.log('📖 Loading knowledge base file...');
    
    const response = await fetch('/knowledge-base-enhanced.json');
    if (!response.ok) {
      throw new Error(`Failed to load knowledge base: ${response.status} ${response.statusText}`);
    }
    
    console.log('📊 Response received, parsing JSON...');
    console.log('📊 Content-Type:', response.headers.get('content-type'));
    console.log('📊 Content-Length:', response.headers.get('content-length'));
    
    const responseText = await response.text();
    console.log('📊 First 200 characters:', responseText.substring(0, 200));
    
    const data = JSON.parse(responseText);
    console.log(`📊 Found ${data.chunks.length} chunks to import`);
    console.log(`📚 Total chunks: ${data.total_chunks}`);
    console.log(`📖 Books processed: ${data.books_processed.length}`);
    
    // Step 3: Import chunks in batches
    const BATCH_SIZE = 10;
    let inserted = 0;
    let failed = 0;
    
    for (let i = 0; i < data.chunks.length; i += BATCH_SIZE) {
      const batch = data.chunks.slice(i, i + BATCH_SIZE);
      
      // Prepare batch data
      const batchData = batch.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        embedding: chunk.embedding,
        source: chunk.source,
        category: chunk.category || chunk.metadata?.category,
        tags: chunk.tags || [],
        metadata: chunk.metadata || {},
        importance: chunk.metadata?.importance || 3,
        word_count: chunk.metadata?.word_count || chunk.content.split(' ').length
      }));
      
      try {
        // Insert batch
        const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(batchData)
        });
        
        if (insertResponse.ok) {
          inserted += batch.length;
          console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${inserted}/${data.chunks.length} chunks imported`);
        } else {
          failed += batch.length;
          console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} failed:`, await insertResponse.text());
        }
      } catch (error) {
        failed += batch.length;
        console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error.message);
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Progress update every 1000 chunks
      if (inserted % 1000 === 0 && inserted > 0) {
        console.log(`📈 Progress: ${inserted}/${data.chunks.length} chunks (${(inserted/data.chunks.length*100).toFixed(1)}%)`);
      }
    }
    
    console.log(`🎉 Import completed!`);
    console.log(`✅ Successfully imported: ${inserted} chunks`);
    console.log(`❌ Failed: ${failed} chunks`);
    console.log(`📊 Total processed: ${inserted + failed} chunks`);
    
    // Step 4: Verify final count
    const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base?select=id`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      console.log(`🔍 Verification: ${verifyData.length} chunks in database`);
    }
    
  } catch (error) {
    console.error('❌ Error importing chunks:', error);
  }
}

// Export for use in console
window.importChunksFromBrowser = importChunksFromBrowser;

console.log('📝 To import chunks, run: importChunksFromBrowser()'); 