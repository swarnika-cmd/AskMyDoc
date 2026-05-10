import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { QdrantVectorStore } from "@langchain/qdrant";

export async function ingestDocument(filePath, collectionName) {
    try {
        console.log(`Starting ingestion for: ${filePath}`);
        
        // 1. Ingestion: Load the PDF
        const loader = new PDFLoader(filePath);
        const docs = await loader.load();
        console.log(`Loaded ${docs.length} pages from PDF.`);

        // 2. Chunking: RecursiveCharacterTextSplitter
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.splitDocuments(docs);
        console.log(`Split document into ${chunks.length} chunks.`);

        // 3. Embedding: Initialize HuggingFace Local Embeddings
        const embeddings = new HuggingFaceTransformersEmbeddings({
            modelName: "Xenova/all-MiniLM-L6-v2",
        });

        // 4. Storage: Index into Qdrant
        const vectorStore = await QdrantVectorStore.fromDocuments(chunks, embeddings, {
            url: process.env.QDRANT_URL || "http://localhost:6333",
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collectionName
        });
        
        console.log(`Successfully ingested ${chunks.length} chunks into Qdrant collection: ${collectionName}`);
        return { success: true, chunksCount: chunks.length };
        
    } catch (error) {
        console.error("Error during document ingestion:", error);
        throw error;
    }
}
