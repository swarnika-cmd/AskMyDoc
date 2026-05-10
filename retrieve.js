import { ChatGroq } from "@langchain/groq";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import dotenv from "dotenv";

dotenv.config();

export async function askQuestion(query, namespaces) {
    try {
        console.log(`Searching for context to answer: "${query}" across ${namespaces.length} documents`);

        const pineconeApiKey = process.env.PINECONE_API_KEY;
        const pineconeIndex = process.env.PINECONE_INDEX;

        if (!pineconeApiKey) {
            throw new Error("PINECONE_API_KEY environment variable is not set.");
        }
        if (!pineconeIndex) {
            throw new Error("PINECONE_INDEX environment variable is not set.");
        }

        // 1. Re-initialize the same embeddings model used for ingestion
        const embeddings = new HuggingFaceTransformersEmbeddings({
            modelName: "Xenova/all-MiniLM-L6-v2",
        });

        // 2. Connect to the existing Pinecone Vector Store
        const pinecone = new Pinecone({ apiKey: pineconeApiKey });
        const index = pinecone.index(pineconeIndex);

        // 3. Search across all provided namespaces
        let allChunksWithScore = [];
        for (const ns of namespaces) {
            const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
                pineconeIndex: index,
                namespace: ns,
            });
            // Fetch top 3 from each namespace WITH SCORE
            const chunks = await vectorStore.similaritySearchWithScore(query, 3);
            allChunksWithScore.push(...chunks);
        }

        // Sort all chunks by their similarity score descending (highest score first)
        allChunksWithScore.sort((a, b) => b[1] - a[1]);
        
        // Take the absolute top 3 most relevant chunks across all documents
        const topChunks = allChunksWithScore.slice(0, 3).map(c => c[0]);

        // 4. Initialize Groq LLM
        const model = new ChatGroq({
            apiKey: process.env.GROQ_API_KEY,
            model: "llama-3.1-8b-instant",
            temperature: 0,
        });

        // 5. Construct the strictly grounded System Prompt
        const contextText = topChunks
            .map((chunk, i) => `[Source ${i + 1} - ${chunk.metadata.source || 'Document'}]:\n${chunk.pageContent}`)
            .join('\n\n');

        const systemPrompt = `You are a helpful AI Assistant.

Rules:
1. If the user asks a conversational question (e.g., greetings, asking how you are, thanking you), respond politely and naturally without complaining about missing document context.
2. For all other questions, answer based ONLY on the provided document context below. Do not use prior knowledge.
3. If the answer to a document-related question is not found in the context, say "I don't have enough information in the uploaded document to answer that."
4. Be clear, concise, and helpful.

Document Context:
${contextText}
        `;

        // 6. Generate the Response
        const response = await model.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
        ]);

        return {
            answer: response.content,
            sources: topChunks
        };
    } catch (error) {
        console.error("Error during retrieval:", error);
        throw error;
    }
}