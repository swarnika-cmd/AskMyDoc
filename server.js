import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { ingestDocument } from './ingest.js';
import { askQuestion } from './retrieve.js';
import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs';
import os from 'os';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    if (req.path === '/api/upload') {
        req.setTimeout(300000);
    }
    next();
});

app.use(express.static('public'));

const uploadsDir = process.env.VERCEL ? os.tmpdir() : 'uploads';
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        if (req.file.size === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Uploaded file is empty (0 bytes). If you dragged it from a browser, try saving it to your computer first.' });
        }

        // Validate Pinecone configuration (replaces old Qdrant check)
        const pineconeApiKey = process.env.PINECONE_API_KEY;
        const pineconeIndex = process.env.PINECONE_INDEX;

        if (!pineconeApiKey || !pineconeIndex) {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(500).json({ 
                error: 'Pinecone is not configured. Please set PINECONE_API_KEY and PINECONE_INDEX environment variables.' 
            });
        }

        const filePath = req.file.path;
        const collectionName = req.body.collectionName || 'DefaultCollection';

        console.log(`\n=== Starting Upload ===`);
        console.log(`File: ${req.file.originalname} (${req.file.size} bytes)`);
        console.log(`Collection/Namespace: ${collectionName}`);
        console.log(`Pinecone Index: ${pineconeIndex}`);

        const result = await ingestDocument(filePath, collectionName, req.file.originalname);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Check if the PDF had extractable text
        if (result.chunksCount === 0) {
            console.log(`⚠ Upload completed but 0 chunks extracted (scanned/image PDF?)\n`);
            return res.status(400).json({
                error: 'No text could be extracted from this PDF. It may be a scanned/image-based document.',
                result
            });
        }

        console.log(`✓ Upload completed successfully\n`);
        res.json({ message: 'File ingested successfully', result });
    } catch (error) {
        console.error(`\n✗ Upload failed:`);
        console.error(`Message: ${error.message}`);
        console.error(`Stack: ${error.stack}\n`);

        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {
                console.error("Cleanup error:", e.message);
            }
        }

        res.status(500).json({
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { query, collectionName, namespaces, history } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const targetNamespaces = namespaces || (collectionName ? [collectionName] : ['DefaultCollection']);
        const result = await askQuestion(query, targetNamespaces, history || []);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a document's vectors from Pinecone by namespace
app.post('/api/delete', async (req, res) => {
    try {
        const { namespace } = req.body;
        if (!namespace) {
            return res.status(400).json({ error: 'Namespace is required' });
        }

        const pineconeApiKey = process.env.PINECONE_API_KEY;
        const pineconeIndex = process.env.PINECONE_INDEX;

        if (!pineconeApiKey || !pineconeIndex) {
            return res.status(500).json({ error: 'Pinecone is not configured.' });
        }

        const pinecone = new Pinecone({ apiKey: pineconeApiKey });
        const index = pinecone.index(pineconeIndex);

        // Delete all vectors in this namespace
        await index.namespace(namespace).deleteAll();

        console.log(`✓ Deleted all vectors from namespace: ${namespace}`);
        res.json({ message: `Deleted namespace: ${namespace}` });
    } catch (error) {
        console.error('Delete error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, (err) => {
    if (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
    console.log(`Server running on port ${PORT}`);
});
