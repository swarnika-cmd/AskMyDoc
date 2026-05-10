import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { ingestDocument } from './ingest.js';
import { askQuestion } from './retrieve.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Set longer timeout for upload requests (5 minutes)
app.use((req, res, next) => {
    if (req.path === '/api/upload') {
        req.setTimeout(300000); // 5 minutes for uploads
    }
    next();
});

// Serve frontend UI
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Set up multer for file uploads
const upload = multer({ dest: uploadsDir });

app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Validate Qdrant configuration
        const qdrantUrl = process.env.QDRANT_URL;
        if (!qdrantUrl) {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(500).json({ error: 'Qdrant is not configured. Please set QDRANT_URL environment variable.' });
        }
        
        const filePath = req.file.path;
        const collectionName = req.body.collectionName || 'DefaultCollection';
        
        console.log(`\n=== Starting Upload ===`);
        console.log(`File: ${req.file.originalname} (${req.file.size} bytes)`);
        console.log(`Collection: ${collectionName}`);
        console.log(`Qdrant URL: ${qdrantUrl.substring(0, 50)}...`);
        
        const result = await ingestDocument(filePath, collectionName);
        
        // Clean up uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        console.log(`✓ Upload completed successfully\n`);
        res.json({ message: 'File ingested successfully', result });
    } catch (error) {
        console.error(`\n✗ Upload failed:`);
        console.error(`Message: ${error.message}`);
        console.error(`Stack: ${error.stack}\n`);
        
        // Clean up file on error
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

// Chat Endpoint
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
