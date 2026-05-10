import { ChatGroq } from "@langchain/groq";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import dotenv from "dotenv";

dotenv.config();

export async function askQuestion(query, collectionName) {
    try {
        console.log(`Searching for context to answer: "${query}"`);

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

        const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            namespace: collectionName,
        });

        // 3. Set up the Retriever to fetch the top 3 most relevant chunks
        const retriever = vectorStore.asRetriever({ k: 3 });
        const searchedChunks = await retriever.invoke(query);

        // 4. Initialize Groq LLM
        const model = new ChatGroq({
            apiKey: process.env.GROQ_API_KEY,
            model: "llama-3.1-8b-instant",
            temperature: 0,
        });

        // 5. Construct the strictly grounded System Prompt
        const systemPrompt = `You are an AI Assistant that resolves user queries based ONLY on the provided context.

        Rule 1: Only answer based on the available context from the file.
        Rule 2: If the answer is not contained in the context, politely state that you do not know. Do not hallucinate.
        Rule 3: Base your answer purely on the JSON context provided below.

        Context:
        ${JSON.stringify(searchedChunks)}
        `;

        // 6. Generate the Response
        const response = await model.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
        ]);

        return {
            answer: response.content,
            sources: searchedChunks
        };
    } catch (error) {
        console.error("Error during retrieval:", error);
        throw error;
    }
}