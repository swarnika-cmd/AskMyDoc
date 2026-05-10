<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg" alt="NotebookLM Logo" width="80" height="80">
  <h1 align="center">AskMyDoc: NotebookLM RAG Clone</h1>
  <p align="center">
    <strong>A production-ready RAG application that lets you upload and chat with your documents.</strong>
  </p>
</div>

---

## 🌟 Overview
**AskMyDoc** is an end-to-end Retrieval-Augmented Generation (RAG) web application inspired by Google NotebookLM. It allows users to upload PDF documents, parses and splits them into intelligent semantic chunks, and allows for natural language conversations grounded strictly in the document's content.

## ✨ Key Features
- 🚀 **Lightning Fast LLM**: Powered by **Groq** (`llama-3.1-8b-instant`) for instantaneous, deterministic, and grounded responses.
- 🧠 **Free Local Embeddings**: Utilizes **HuggingFace** (`Xenova/all-MiniLM-L6-v2`) to generate local embeddings at zero cost.
- 🗄️ **Advanced Vector Storage**: Integrates with **Qdrant** (Cloud/Docker) for high-performance semantic retrieval.
- 🎨 **Premium User Interface**: Features a highly aesthetic, responsive, and minimalist frontend inspired perfectly by Google NotebookLM (built with pure HTML/CSS/VanillaJS).
- 🔐 **Strict Grounding**: System prompts explicitly force the AI to answer *only* from the provided context, eliminating hallucinations.

## 🛠️ Technology Stack
- **Backend:** Node.js, Express.js
- **Frontend:** Vanilla HTML, CSS (Tailwind), JavaScript
- **RAG Pipeline:** LangChain.js (`@langchain/community`, `@langchain/groq`, `@langchain/qdrant`)
- **Document Parsing:** `pdf-parse`

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- A Groq API Key (Free)
- A Qdrant Cloud URL / API Key (Free)

### 2. Installation
Clone the repository and install the dependencies (use `--legacy-peer-deps` due to LangChain peer requirements):
```bash
git clone https://github.com/swarnika-cmd/AskMyDoc.git
cd AskMyDoc
npm install --legacy-peer-deps
```

### 3. Environment Setup
Rename `.env.example` to `.env` and fill in your keys:
```env
GROQ_API_KEY=your_groq_api_key_here
QDRANT_URL=https://your-cluster-url.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key_here
PORT=3000
```

### 4. Running the App
Start the Express server:
```bash
node server.js
```
Navigate to `http://localhost:3000` in your browser. Upload a PDF, wait for the ingestion process, and start asking questions!

## 📦 Deployment
This project is perfectly structured for immediate deployment on PaaS providers like **Render.com** or **Railway**. Simply connect the GitHub repository, set your Build Command to `npm install --legacy-peer-deps`, set your Start Command to `node server.js`, and add your `.env` variables in the dashboard!

---
*Built for Assignment 03 — Google NotebookLM RAG*
