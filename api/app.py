# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
import tempfile
import asyncio
from typing import Optional, List
from pathlib import Path

# Import AIMakerSpace components for RAG functionality
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from aimakerspace.vectordatabase import VectorDatabase
from aimakerspace.openai_utils.embedding import EmbeddingModel
from aimakerspace.openai_utils.chatmodel import ChatOpenAI
from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter

# Initialize FastAPI application with a title
app = FastAPI(title="PDF RAG Chat API")

# Global variables for RAG system
vector_db: Optional[VectorDatabase] = None
chat_model: Optional[ChatOpenAI] = None

# Configure CORS (Cross-Origin Resource Sharing) middleware
# This allows the API to be accessed from different domains/origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers in requests
)

# Define the data model for chat requests using Pydantic
# This ensures incoming request data is properly validated
class ChatRequest(BaseModel):
    developer_message: str  # Message from the developer/system
    user_message: str      # Message from the user
    model: Optional[str] = "gpt-4o-mini"  # Optional model selection with default
    api_key: str          # OpenAI API key for authentication

class PDFChatRequest(BaseModel):
    message: str          # User's question about the PDF

# Define the main chat endpoint that handles POST requests
@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Initialize OpenAI client with the provided API key
        client = OpenAI(api_key=request.api_key)
        
        # Create an async generator function for streaming responses
        async def generate():
            # Create a streaming chat completion request
            stream = client.chat.completions.create(
                model=request.model,
                messages=[
                    {"role": "developer", "content": request.developer_message},
                    {"role": "user", "content": request.user_message}
                ],
                stream=True  # Enable streaming response
            )
            
            # Yield each chunk of the response as it becomes available
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content

        # Return a streaming response to the client
        return StreamingResponse(generate(), media_type="text/plain")
    
    except Exception as e:
        # Handle any errors that occur during processing
        raise HTTPException(status_code=500, detail=str(e))

# PDF Upload and Indexing endpoint
@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and index a PDF file for RAG functionality."""
    global vector_db, chat_model
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Check if OpenAI API key is set
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "test_key":
        raise HTTPException(
            status_code=500, 
            detail="OpenAI API key not configured. Please set OPENAI_API_KEY environment variable with your actual API key from https://platform.openai.com/account/api-keys"
        )
    
    try:
        
        # Initialize models
        embedding_model = EmbeddingModel()
        chat_model = ChatOpenAI(model_name="gpt-4o-mini")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        try:
            # Load PDF content
            pdf_loader = PDFLoader(tmp_file_path)
            pdf_loader.load_file()
            
            if not pdf_loader.documents:
                raise HTTPException(status_code=400, detail="No text found in PDF")
            
            # Split text into chunks
            text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_texts(pdf_loader.documents)
            
            # Create vector database and index chunks
            vector_db = VectorDatabase(embedding_model)
            await vector_db.abuild_from_list(chunks)
            
            return {
                "message": "PDF uploaded and indexed successfully",
                "chunks_count": len(chunks),
                "filename": file.filename
            }
            
        finally:
            # Clean up temporary file
            os.unlink(tmp_file_path)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

# PDF Chat endpoint using RAG
@app.post("/api/pdf-chat")
async def pdf_chat(request: PDFChatRequest):
    """Chat with the uploaded PDF using RAG."""
    global vector_db, chat_model
    
    if vector_db is None:
        raise HTTPException(status_code=400, detail="No PDF uploaded. Please upload a PDF first.")
    
    if chat_model is None:
        raise HTTPException(status_code=500, detail="Chat model not initialized")
    
    try:
        # Check if OpenAI API key is set
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or api_key == "test_key":
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY environment variable with your actual API key from https://platform.openai.com/account/api-keys"
            )
        
        # Search for relevant context
        relevant_chunks = vector_db.search_by_text(request.message, k=3, return_as_text=True)
        context = "\n\n".join(relevant_chunks)
        
        # Create system prompt for RAG
        system_prompt = f"""You are a helpful assistant that answers questions based ONLY on the provided context from a PDF document. 

IMPORTANT RULES:
1. ONLY use information from the provided context below
2. If the answer is not in the context, say "I cannot find that information in the provided document"
3. Be specific and cite relevant parts of the context when possible
4. If the context is insufficient, ask for clarification

Context from PDF:
{context}"""

        # Create async generator for streaming response
        async def generate():
            async for chunk in chat_model.astream([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ]):
                yield chunk

        return StreamingResponse(generate(), media_type="text/plain")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")

# Check if PDF is uploaded
@app.get("/api/pdf-status")
async def pdf_status():
    """Check if a PDF has been uploaded and indexed."""
    return {
        "pdf_uploaded": vector_db is not None,
        "chunks_count": len(vector_db.vectors) if vector_db else 0
    }

# Reset PDF state (for development/testing)
@app.delete("/api/reset-pdf")
async def reset_pdf():
    """Reset the PDF state to allow uploading a new PDF."""
    global vector_db, chat_model
    vector_db = None
    chat_model = None
    return {"message": "PDF state reset successfully"}

# Define a health check endpoint to verify API status
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
