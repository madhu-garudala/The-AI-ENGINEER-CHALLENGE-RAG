# PDF RAG System - Merge Instructions

This document provides instructions for merging the PDF RAG functionality back to the main branch.

## Overview

The feature branch `feature/pdf-rag-system` implements a complete PDF RAG (Retrieval-Augmented Generation) system that allows users to:
- Upload PDF documents
- Index PDF content using vector embeddings
- Chat with PDF documents using AI-powered context retrieval
- Stream responses in real-time

## Changes Made

### Backend (FastAPI)
- **File**: `api/app.py`
  - Added PDF upload endpoint (`/api/upload-pdf`)
  - Added PDF chat endpoint (`/api/pdf-chat`) with streaming responses
  - Added PDF status endpoint (`/api/pdf-status`)
  - Integrated AIMakerSpace library for RAG functionality
  - Added proper error handling and validation

- **File**: `api/requirements.txt`
  - Added PyPDF2 for PDF text extraction
  - Added numpy for vector operations
  - Added python-dotenv for environment management

### Frontend (Next.js)
- **File**: `frontend/app/page.tsx`
  - Completely redesigned UI for PDF RAG chat
  - Added PDF upload interface
  - Added real-time chat interface with streaming responses
  - Added API key input for OpenAI authentication
  - Added status indicators and error handling

### AIMakerSpace Library
- **New Files**: Complete AIMakerSpace library implementation
  - `aimakerspace/vectordatabase.py` - Vector database with cosine similarity search
  - `aimakerspace/openai_utils/embedding.py` - OpenAI embeddings integration
  - `aimakerspace/openai_utils/chatmodel.py` - OpenAI chat completions wrapper
  - `aimakerspace/text_utils.py` - PDF loading and text splitting utilities

## Merge Instructions

### Option 1: GitHub CLI (Recommended)

```bash
# Switch to main branch
git checkout main

# Merge the feature branch
git merge feature/pdf-rag-system

# Push changes to remote
git push origin main

# Delete the feature branch (optional)
git branch -d feature/pdf-rag-system
git push origin --delete feature/pdf-rag-system
```

### Option 2: GitHub Pull Request

1. **Create Pull Request**:
   - Go to the GitHub repository
   - Click "Compare & pull request" for the `feature/pdf-rag-system` branch
   - Add title: "Implement PDF RAG System with Upload and Chat Functionality"
   - Add description:
     ```
     This PR implements a complete PDF RAG system that allows users to upload PDF documents and chat with them using AI-powered retrieval-augmented generation.
     
     ## Features
     - PDF upload and text extraction using PyPDF2
     - Vector database indexing using AIMakerSpace library
     - Real-time chat interface with streaming responses
     - Context-aware responses based on PDF content
     - Modern, responsive UI design
     
     ## Technical Details
     - Backend: FastAPI with streaming responses
     - Frontend: Next.js with TypeScript
     - RAG: AIMakerSpace library with OpenAI embeddings
     - Vector Search: Cosine similarity with configurable chunk size
     ```

2. **Review and Merge**:
   - Review the changes in the GitHub interface
   - Ensure all tests pass (if applicable)
   - Merge the pull request

## Post-Merge Setup

### 1. Install Dependencies

```bash
# Backend dependencies
cd api
pip install -r requirements.txt

# Frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root with your OpenAI API key:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Run the Application

```bash
# Start backend (Terminal 1)
cd api
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Start frontend (Terminal 2)
cd frontend
npm run dev
```

### 4. Access the Application

- Frontend: https://localhost:3000 (HTTPS enabled)
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Testing the System

1. **Upload a PDF**:
   - Enter your OpenAI API key
   - Select a PDF file
   - Click "Upload PDF"
   - Wait for indexing to complete

2. **Chat with PDF**:
   - Ask questions about the PDF content
   - The system will retrieve relevant context and provide answers
   - Responses are streamed in real-time

## API Endpoints

- `POST /api/upload-pdf` - Upload and index a PDF file
- `POST /api/pdf-chat` - Chat with the uploaded PDF
- `GET /api/pdf-status` - Check if PDF is uploaded
- `GET /api/health` - Health check endpoint

## Configuration

The system can be configured by modifying these parameters in `api/app.py`:
- `chunk_size`: Size of text chunks for indexing (default: 1000)
- `chunk_overlap`: Overlap between chunks (default: 200)
- `k`: Number of relevant chunks to retrieve (default: 3)
- `model_name`: OpenAI model to use (default: "gpt-4o-mini")

## Troubleshooting

1. **PDF Upload Issues**:
   - Ensure the file is a valid PDF
   - Check that the PDF contains extractable text
   - Verify OpenAI API key is valid

2. **Chat Issues**:
   - Ensure a PDF has been uploaded first
   - Check that the API key is correct
   - Verify the backend is running on port 8000

3. **Frontend Issues**:
   - Check that the frontend is running on port 3000
   - Verify CORS settings in the backend
   - Check browser console for errors

## Security Notes

- API keys are handled securely and not stored
- PDF files are processed temporarily and cleaned up
- CORS is configured for development (should be restricted in production)
- All user inputs are validated and sanitized

## Future Enhancements

- Support for multiple PDF documents
- Persistent vector database storage
- User authentication and session management
- PDF preview functionality
- Export chat conversations
- Advanced search and filtering options



