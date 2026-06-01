import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import dotenv from "dotenv";

dotenv.config();

export async function askQuestion(query, namespaces, history = []) {
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

        // Initialize Groq LLM early for query reformulation
        const model = new ChatGroq({
            apiKey: process.env.GROQ_API_KEY,
            model: "llama-3.1-8b-instant",
            temperature: 0,
        });

        // Reformulate query if there's history
        let standaloneQuery = query;
        if (history && history.length > 0) {
            const reformulatePrompt = `Given the following chat history and a follow up question, rephrase the follow up question to be a standalone question.
            Chat History:
            ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
            Follow Up Input: ${query}
            Standalone question:`;
            
            const reformulateResponse = await model.invoke([
                { role: "user", content: reformulatePrompt }
            ]);
            standaloneQuery = reformulateResponse.content.trim();
            console.log(`Reformulated query: "${standaloneQuery}"`);
        }

        // 1. Re-initialize the same embeddings model used for ingestion
        const hfToken = process.env.HF_TOKEN;
        if (!hfToken) {
            throw new Error("HF_TOKEN environment variable is not set.");
        }
        const embeddings = new HuggingFaceInferenceEmbeddings({
            apiKey: hfToken,
            model: "sentence-transformers/all-MiniLM-L6-v2",
        });

        // 2. Connect to the existing Pinecone Vector Store
        const pinecone = new Pinecone({ apiKey: pineconeApiKey });
        const index = pinecone.index(pineconeIndex);

        // 3. Search across all provided namespaces using the standalone query
        let allChunksWithScore = [];
        for (const ns of namespaces) {
            const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
                pineconeIndex: index,
                namespace: ns,
            });
            // Fetch top 5 from each namespace WITH SCORE
            const chunks = await vectorStore.similaritySearchWithScore(standaloneQuery, 5);
            allChunksWithScore.push(...chunks);
        }

        // Sort all chunks by their similarity score descending (highest score first)
        allChunksWithScore.sort((a, b) => b[1] - a[1]);
        
        // Get the maximum similarity score
        const maxScore = allChunksWithScore.length > 0 ? (allChunksWithScore[0][1] ?? 0) : 0;
        console.log(`Maximum similarity score: ${maxScore}`);

        // Take the absolute top 5 most relevant chunks across all documents
        const topChildChunks = allChunksWithScore.slice(0, 5).map(c => c[0]);

        // Deduplicate parent chunks
        const uniqueParents = new Map();
        for (const chunk of topChildChunks) {
            const parentId = chunk.metadata.parentId || chunk.metadata.source || Math.random().toString();
            if (!uniqueParents.has(parentId)) {
                uniqueParents.set(parentId, chunk);
            }
        }
        const topChunks = Array.from(uniqueParents.values());

        // 5. Construct the strictly grounded System Prompt requesting JSON output
        const contextText = topChunks
            .map((chunk, i) => `[Source ${i + 1} - ${chunk.metadata.source || 'Document'}]:\n${chunk.metadata.parentContent || chunk.pageContent}`)
            .join('\n\n');

        const systemPrompt = `You are a helpful AI Assistant.

Rules:
1. If the user asks a conversational question (e.g., greetings, asking how you are, thanking you), respond politely and naturally. Set isConversational to true, noEvidence to false, and provide your response in the answer field.
2. For all other questions, answer based ONLY on the provided document context below. Do not use prior knowledge. Set isConversational to false.
3. If the answer to a document-related question is not found in the context, set noEvidence to true and set the answer field exactly to "I couldn't find sufficient evidence in the provided document to answer this question."
4. Be clear, concise, and helpful.

You MUST respond in the following JSON format:
{
  "isConversational": boolean,
  "noEvidence": boolean,
  "answer": "your answer here"
}

Document Context:
${contextText}
        `;

        // 6. Generate the Response with History in JSON format
        const finalMessages = [
            { role: "system", content: systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: query }
        ];

        const response = await model.invoke(finalMessages);
        
        let resultJson;
        let content = response.content.trim();
        if (content.startsWith("```")) {
            content = content.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        }
        try {
            resultJson = JSON.parse(content);
        } catch (e) {
            const startIdx = content.indexOf('{');
            const endIdx = content.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                try {
                    resultJson = JSON.parse(content.substring(startIdx, endIdx + 1));
                } catch (innerError) {
                    // Fallback below
                }
            }
            
            if (!resultJson) {
                console.warn("Failed to parse JSON response from LLM, falling back to plain text parsing:", response.content);
                const isRefusal = response.content.includes("I don't have enough information") || 
                                  response.content.includes("I couldn't find sufficient evidence") ||
                                  response.content.includes("sufficient evidence");
                resultJson = {
                    isConversational: !isRefusal && maxScore < 0.4 && (query.length < 15 || query.includes("hello") || query.includes("hi")),
                    noEvidence: isRefusal,
                    answer: response.content
                };
            }
        }

        let answer = resultJson.answer || "No response generated.";
        let confidence = 'HIGH';

        if (resultJson.isConversational) {
            confidence = 'HIGH';
        } else {
            // Apply threshold rules based on maximum similarity score
            if (maxScore >= 0.7) {
                confidence = 'HIGH';
            } else if (maxScore >= 0.4) {
                confidence = 'LOW';
            } else {
                confidence = 'NOT_FOUND';
            }

            // Force NOT_FOUND if the LLM flagged noEvidence
            if (resultJson.noEvidence) {
                confidence = 'NOT_FOUND';
            }

            // If not found, override the answer text to prevent hallucination
            if (confidence === 'NOT_FOUND') {
                answer = "I couldn't find sufficient evidence in the provided document to answer this question.";
            }
        }

        console.log(`Query: "${query}" | Confidence: ${confidence} | Max Score: ${maxScore.toFixed(4)}`);

        return {
            answer: answer,
            sources: topChunks,
            score: maxScore,
            confidence: confidence
        };
    } catch (error) {
        console.error("Error during retrieval:", error);
        throw error;
    }
}