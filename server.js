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
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: 'Qdrant is not configured. Please set QDRANT_URL environment variable.' });
        }
        
        const filePath = req.file.path;
        const collectionName = req.body.collectionName || 'DefaultCollection';
        
        console.log(`Uploading file: ${req.file.originalname}, Collection: ${collectionName}`);
        
        const result = await ingestDocument(filePath, collectionName);
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        res.json({ message: 'File ingested successfully', result });
    } catch (error) {
        console.error('Upload error:', error.message);
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
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
