import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

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
            await embeddings.embedQuery("test");
            console.log("Embeddings model ready");
        } catch (embedError) {
            console.error("Embedding initialization error:", embedError.message);
            throw new Error(`Embedding model failed: ${embedError.message}`);
        }

        // 4. Storage: Index into Pinecone
        const pineconeApiKey = process.env.PINECONE_API_KEY;
        const pineconeIndex = process.env.PINECONE_INDEX;

        console.log(`\nPinecone Configuration:`);
        console.log(`  API Key: ${pineconeApiKey ? '***SET***' : 'NOT SET'}`);
        console.log(`  Index: ${pineconeIndex ? pineconeIndex : 'NOT SET'}\n`);

        if (!pineconeApiKey) {
            throw new Error("PINECONE_API_KEY environment variable is not set.");
        }
        if (!pineconeIndex) {
            throw new Error("PINECONE_INDEX environment variable is not set.");
        }

        try {
            const pinecone = new Pinecone({ apiKey: pineconeApiKey });
            const index = pinecone.index(pineconeIndex);

            const vectorStore = await PineconeStore.fromDocuments(chunks, embeddings, {
                pineconeIndex: index,
                namespace: collectionName,
            });

            console.log(`Successfully ingested ${chunks.length} chunks into Pinecone index: ${pineconeIndex}, namespace: ${collectionName}`);
            return { success: true, chunksCount: chunks.length };
        } catch (pineconeError) {
            console.error("Pinecone connection/storage error:", pineconeError.message);
            console.error("Full error:", pineconeError);
            throw new Error(`Pinecone error: ${pineconeError.message}`);
        }

    } catch (error) {
        console.error("Error during document ingestion:", error.message);
        throw error;
    }
}