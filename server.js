import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { ingestDocument } from './ingest.js';
import { askQuestion } from './retrieve.js';
import fs from 'fs';

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

const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
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

        const result = await ingestDocument(filePath, collectionName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
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
        const { query, collectionName } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const targetCollection = collectionName || 'DefaultCollection';
        const result = await askQuestion(query, targetCollection);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});