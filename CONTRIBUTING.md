# Contributing to AskMyDoc

Thank you for showing interest in contributing to AskMyDoc! We welcome contributions of all forms, including bug fixes, feature requests, documentation, and interface enhancements.

## 🚀 How to Get Started

### 1. Fork and Clone
1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/AskMyDoc.git
   cd AskMyDoc
   ```

### 2. Set Up Environment
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Enter your API credentials (Groq, Pinecone, and HuggingFace tokens) into the `.env` file.

### 3. Install Dependencies
Install packages using `--legacy-peer-deps` to handle peer dependency resolutions correctly:
```bash
npm install --legacy-peer-deps
```

### 4. Running Locally
Start the development server:
```bash
npm start
```
Go to `http://localhost:3000` to interact with your local server.

---

## 🛠️ Code Guidelines

* **Linting & Formatting:** We use [Prettier](.prettierrc) for unified formatting. Make sure your changes are clean.
* **Separation of Concerns:** 
  * Keep RAG retrieval logic isolated in `retrieve.js`.
  * Keep document parsing and chunking in `ingest.js`.
  * Keep routing and API handlers in `server.js`.
* **Testing:** Test new code locally by uploading sample files (e.g. `sample.pdf`) and running conversational queries.
