import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
import fs from "fs";

export async function ingestDocument(filePath, collectionName, originalFileName = '') {
    try {
        console.log(`Starting ingestion for: ${filePath} (${originalFileName})`);
        
        // 1. Ingestion: Load the file
        let docs;
        try {
            const isText = originalFileName.toLowerCase().endsWith('.txt') || filePath.toLowerCase().endsWith('.txt');
            if (isText) {
                const text = fs.readFileSync(filePath, 'utf-8');
                docs = [new Document({ pageContent: text, metadata: { source: originalFileName || filePath } })];
                console.log(`Loaded 1 text document.`);
            } else {
                const loader = new PDFLoader(filePath);
                docs = await loader.load();
                
                // Check if the PDF is purely scanned/image-based (no extractable text)
                // A scanned PDF might have a few stray text artifacts (garbage characters)
                // so we ensure there's a reasonable amount of text (e.g., > 50 chars)
                const totalTextLength = docs.reduce((acc, d) => acc + d.pageContent.trim().length, 0);
                const hasText = totalTextLength > 50;
                
                if (docs.length === 0 || !hasText) {
                    console.log(`PDFLoader found no extractable text. Attempting OCR fallback for scanned PDF...`);
                    const formData = new FormData();
                    formData.append('base64Image', 'data:application/pdf;base64,' + fs.readFileSync(filePath).toString('base64'));
                    formData.append('language', 'eng');
                    formData.append('isOverlayRequired', 'false');
                    formData.append('OCREngine', '2');
                    
                    const res = await fetch('https://api.ocr.space/parse/image', {
                        method: 'POST',
                        headers: { 'apikey': 'helloworld' },
                        body: formData
                    });
                    
                    const data = await res.json();
                    
                    if (data.IsErroredOnProcessing) {
                        throw new Error(`OCR API Error: ${data.ErrorMessage || 'Unknown error'}`);
                    }
                    
                    const extractedText = data.ParsedResults?.map(r => r.ParsedText).join('\n') || '';
                    if (extractedText.trim()) {
                        docs = [new Document({ pageContent: extractedText, metadata: { source: originalFileName || filePath, ocr: true } })];
                        console.log(`Loaded 1 document via OCR fallback.`);
                    } else {
                        console.log(`OCR fallback also yielded no text.`);
                    }
                } else {
                    console.log(`Loaded ${docs.length} pages from PDF.`);
                }
            }
        } catch (pdfError) {
            console.error("File loading error:", pdfError.message);
            throw new Error(`Failed to parse file: ${pdfError.message}`);
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