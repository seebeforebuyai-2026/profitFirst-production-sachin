const axios = require('axios');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const API_KEY   = process.env.PINECONE_API_KEY;
const INDEX_HOST = "https://profitfirst-knowledge-by-sachin-44pzb6a.svc.aped-4627-b74a.pinecone.io";
const MODEL      = 'llama-text-embed-v2';

// ─── SHARED HEADERS ────────────────────────────────────────────────────────
const pineconeHeaders = () => {
    if (!API_KEY) throw new Error("PINECONE_API_KEY is missing from environment variables!");
    return { 'Api-Key': API_KEY, 'Content-Type': 'application/json', 'X-Pinecone-API-Version': '2024-10' };
};

// ─── HELPER: detailed error logging ───────────────────────────────────────
const logAxiosError = (label, error) => {
    if (error.response) {
        console.error(`❌ ${label} — HTTP ${error.response.status}`);
        console.error("   Response body:", JSON.stringify(error.response.data, null, 2));
        console.error("   Request URL:  ", error.config?.url);
        console.error("   Request body: ", error.config?.data);
    } else if (error.request) {
        console.error(`❌ ${label} — No response received (network/DNS issue)`);
        console.error("   Request URL:", error.config?.url);
    } else {
        console.error(`❌ ${label} —`, error.message);
    }
};

/**
 * FUNCTION 1: seedKnowledgeBase
 * Embeds text using Pinecone Inference and upserts vectors into the index.
 */
const seedKnowledgeBase = async (knowledgeArray) => {
    try {
        // ── Validate API Key ──────────────────────────────────────────────
        const headers = pineconeHeaders();
        console.log(`\n🔑 API Key found: ${API_KEY.slice(0, 8)}...`);
        console.log(`🧠 Step 1: Generating embeddings for ${knowledgeArray.length} items...\n`);

        // ── Step 1: Embed ─────────────────────────────────────────────────
        const embedRes = await axios.post(
            'https://api.pinecone.io/embed',
            {
                model: MODEL,
                parameters: { input_type: 'passage', truncate: 'END' },
                inputs: knowledgeArray.map(k => ({ text: k.text }))
            },
            { headers }
        );

        const vectorsData = embedRes.data?.data;
        if (!Array.isArray(vectorsData) || vectorsData.length === 0) {
            throw new Error(`Embed API returned unexpected shape: ${JSON.stringify(embedRes.data)}`);
        }

        console.log(`✅ Embeddings received. Dimensions: ${vectorsData[0]?.values?.length}`);

        // ── Step 2: Build upsert records ──────────────────────────────────
        const vectors = knowledgeArray.map((item, i) => ({
            id:       item.id,
            values:   vectorsData[i].values,
            metadata: { text: item.text, category: item.category }
        }));

        console.log(`\n📦 Step 2: Upserting ${vectors.length} records to Pinecone...\n`);

        // ── Step 3: Upsert ────────────────────────────────────────────────
        // NOTE: namespace is optional — remove if your index doesn't use namespaces
        const upsertRes = await axios.post(
            `${INDEX_HOST}/vectors/upsert`,
            { vectors, namespace: '' },
            { headers }
        );

        console.log("✅ Upsert response:", JSON.stringify(upsertRes.data));
        console.log("\n🏆 [SUCCESS] Knowledge Base Seeded — AI is now an Expert.\n");
        return true;

    } catch (error) {
        logAxiosError("seedKnowledgeBase", error);
        return false;
    }
};

/**
 * FUNCTION 2: searchKnowledge
 * Converts a query to a vector and retrieves top-K matching knowledge chunks.
 */
const searchKnowledge = async (query, topK = 3) => {
    try {
        const headers = pineconeHeaders();

        // ── Embed query ───────────────────────────────────────────────────
        const embedRes = await axios.post(
            'https://api.pinecone.io/embed',
            {
                model: MODEL,
                parameters: { input_type: 'query', truncate: 'END' },
                inputs: [{ text: query }]
            },
            { headers }
        );

        const queryVector = embedRes.data?.data?.[0]?.values;
        if (!queryVector) throw new Error("No vector returned for query.");

        // ── Query index ───────────────────────────────────────────────────
        const queryRes = await axios.post(
            `${INDEX_HOST}/query`,
            {
                vector:          queryVector,
                topK,
                includeMetadata: true,
                namespace:       ''   // remove if unused
            },
            { headers }
        );

        const matches = queryRes.data?.matches ?? [];
        if (matches.length === 0) {
            console.warn("⚠️  No matches found for query:", query);
            return "";
        }

        return matches.map(m => m.metadata?.text ?? '').filter(Boolean).join("\n\n");

    } catch (error) {
        logAxiosError("searchKnowledge", error);
        return "";
    }
};

module.exports = { seedKnowledgeBase, searchKnowledge };