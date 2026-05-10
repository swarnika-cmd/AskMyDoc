import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { QdrantVectorStore } from "@langchain/qdrant";

export async function ingestDocument(filePath, collectionName) {
    try {
        console.log(`Starting ingestion for: ${filePath}`);
        
        // 1. Ingestion: Load the PDF
        let docs;
        try {
            const loader = new PDFLoader(filePath);
            docs = await loader.load();
            console.log(`Loaded ${docs.length} pages from PDF.`);
        } catch (pdfError) {
            console.error("PDF loading error:", pdfError.message);
            throw new Error(`Failed to parse PDF: ${pdfError.message}`);
        }

        // 2. Chunking: RecursiveCharacterTextSplitter
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.splitDocuments(docs);
        console.log(`Split document into ${chunks.length} chunks.`);

        // 3. Embedding: Initialize HuggingFace Local Embeddings
        console.log("Initializing embeddings model...");
        let embeddings;
        try {
            embeddings = new HuggingFaceTransformersEmbeddings({
                modelName: "Xenova/all-MiniLM-L6-v2",
            });
            // Force model download/cache on initialization
            await embeddings.embedQuery("test");
            console.log("Embeddings model ready");
        } catch (embedError) {
            console.error("Embedding initialization error:", embedError.message);
            throw new Error(`Embedding model failed: ${embedError.message}`);
        }

        // 4. Storage: Index into Qdrant
        const qdrantUrl = process.env.QDRANT_URL;
        const qdrantApiKey = process.env.QDRANT_API_KEY;
        
        console.log(`\nQdrant Configuration:`);
        console.log(`  URL: ${qdrantUrl ? qdrantUrl.substring(0, 50) + '...' : 'NOT SET'}`);
        console.log(`  API Key: ${qdrantApiKey ? '***SET***' : 'NOT SET'}\n`);
        
        if (!qdrantUrl) {
            throw new Error("QDRANT_URL environment variable is not set. Check your Render environment variables.");
        }

        try {
            const vectorStore = await QdrantVectorStore.fromDocuments(chunks, embeddings, {
                url: qdrantUrl,
                apiKey: qdrantApiKey,
                collectionName: collectionName,
                checkCompatibility: false // Skip version check for cloud
            });
            
            console.log(`Successfully ingested ${chunks.length} chunks into Qdrant collection: ${collectionName}`);
            return { success: true, chunksCount: chunks.length };
        } catch (qdrantError) {
            console.error("Qdrant connection/storage error:", qdrantError.message);
            console.error("Full error:", qdrantError);
            throw new Error(`Qdrant error: ${qdrantError.message}`);
        }
        
    } catch (error) {
        console.error("Error during document ingestion:", error.message);
        throw error;
    }
}
