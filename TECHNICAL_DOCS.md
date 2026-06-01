# Technical Documentation: AskMyDoc RAG System

This document provides an architectural overview of the AskMyDoc Retrieval-Augmented Generation (RAG) system, outlining the design decisions, data flow, and specific technical implementations that power the application.

## 1. System Architecture

AskMyDoc follows a standard RAG paradigm decoupled into three distinct layers:
1. **Frontend (Client)**: A vanilla HTML/CSS/JS single-page application handling file uploads, user prompts, and UI state management (inspired by Google NotebookLM).
2. **Backend API (Server)**: An Express.js Node server that exposes endpoints for document upload (`/api/upload`) and LLM chat generation (`/api/chat`).
3. **RAG Engine (LangChain)**: The core logic orchestrating document parsing, text splitting, embedding generation, vector storage, and context-aware LLM retrieval.

---

## 2. Document Ingestion Pipeline (`ingest.js`)

When a user uploads a document, the system processes it through a strict pipeline to ensure maximum semantic retention.

### 2.1 File Parsing & Validation
- **Native PDF Parsing**: The system first attempts to extract raw text layers from PDFs using `pdf-parse` (via LangChain's `PDFLoader`).
- **OCR Fallback**: If the PDF is purely image-based or scanned (detected by extracting less than 50 characters of meaningful text), the system automatically routes the file to an external OCR API (`ocr.space`) to visually extract the text. This prevents "silent failures" where scanned documents result in empty vector spaces.

### 2.2 Semantic Chunking
- **Strategy**: `RecursiveCharacterTextSplitter`
- **Configuration**: `chunkSize: 1000`, `chunkOverlap: 200`
- **Rationale**: Recursive character splitting ensures that chunks are divided at natural paragraph or sentence boundaries rather than cutting off sentences mid-thought. The 200-character overlap ensures that context spanning across two chunks is preserved, allowing the LLM to understand references that bridge chunk boundaries.

### 2.3 Embeddings & Vector Storage
- **Embeddings**: Text chunks are embedded locally using the HuggingFace `Xenova/all-MiniLM-L6-v2` model. This is a highly efficient 384-dimensional model that runs without API costs.
- **Vector Database**: Pinecone is used for high-performance vector storage. 
- **Namespace Isolation**: Every uploaded document is assigned a unique `namespace` (e.g., `doc_brain_pdf_1778449428219`). This allows the system to easily isolate vectors by document, enabling features like per-document deletion and targeted multi-document queries.

---

## 3. Retrieval & Generation Pipeline (`retrieve.js`)

When a user submits a query, the backend reconstructs the context dynamically before querying the LLM.

### 3.1 Multi-Document Cross-Retrieval
The application supports querying across *multiple* active documents simultaneously.
1. The frontend identifies all "ready" documents in the sidebar and sends their Pinecone namespaces to the backend.
2. The backend asynchronously searches **every** provided namespace for the top 3 most relevant chunks to the user's query.

### 3.2 Score-Based Context Filtering
A critical issue in multi-document RAG is "Context Drowning", where irrelevant chunks from unrelated documents crowd the LLM's context window and confuse its reasoning.
- To solve this, AskMyDoc retrieves the chunks from all documents *with their mathematical similarity scores*.
- It aggregates all retrieved chunks, sorts them by score descending, and strictly slices the array to keep only the **absolute top 3 most relevant chunks across the entire workspace**.
- This completely filters out noise from unrelated documents, ensuring the LLM only reads highly relevant data.

### 3.3 Prompt Engineering & Grounding
The system uses Groq's `llama-3.1-8b-instant` model with `temperature: 0` to enforce deterministic outputs. The system prompt contains strict grounding rules:
- **Zero Hallucination Rule**: "answer based ONLY on the provided document context below."
- **Conversational Exception**: The AI is instructed to bypass the strict context rules *only* when the user uses standard greetings or conversational pleasantries (e.g., "how are you?"), allowing it to feel friendly without hallucinating facts.

---

## 4. Frontend Architecture (`app.html`)

- **Vanilla JS Implementation**: The frontend relies entirely on Vanilla JavaScript to maximize performance and minimize bundle size.
- **Document State Management**: The client maintains a `documents` object dictionary holding the status (`uploading`, `ready`, `error`) and `namespace` of every file.
- **Multipart Form Uploads**: Uses `FormData` to stream files to the Express server using Multer.
- **Markdown & Citations**: The frontend uses a Regex parser to dynamically render source citations (e.g., `[p.1]`) as styled UI badges.
