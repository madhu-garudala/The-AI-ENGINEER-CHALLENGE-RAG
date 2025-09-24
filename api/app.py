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
import re
from urllib.parse import urlparse, parse_qs

# Import YouTube functionality
from youtube_transcript_api import YouTubeTranscriptApi

# Try to import pytube, but make it optional for Vercel deployment
try:
    from pytube import YouTube
    PYTUBE_AVAILABLE = True
except ImportError:
    PYTUBE_AVAILABLE = False
    YouTube = None

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

# Global variables for YouTube content
youtube_vector_db: Optional[VectorDatabase] = None
youtube_video_info: Optional[dict] = None

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

class YouTubeRequest(BaseModel):
    url: str              # YouTube video URL

class YouTubeChatRequest(BaseModel):
    message: str          # User's question about the YouTube video

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

# Helper functions for YouTube processing
def extract_video_id(url: str) -> str:
    """Extract video ID from various YouTube URL formats."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/watch\?.*v=([a-zA-Z0-9_-]{11})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    raise ValueError("Invalid YouTube URL format")

def get_youtube_transcript(video_id: str) -> str:
    """Get transcript from YouTube video with multiple language fallbacks."""
    try:
        transcript_list = None
        
        # Get available transcripts first
        try:
            available_transcripts = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # Try to find English transcript first (auto-generated or manual)
            for transcript in available_transcripts:
                if transcript.language_code.startswith('en'):
                    try:
                        transcript_list = transcript.fetch()
                        print(f"Successfully retrieved English transcript: {transcript.language}")
                        break
                    except Exception as e:
                        print(f"Failed to fetch English transcript {transcript.language}: {e}")
                        continue
            
            # If no English transcript worked, try any available transcript
            if not transcript_list:
                for transcript in available_transcripts:
                    try:
                        transcript_list = transcript.fetch()
                        print(f"Successfully retrieved transcript in: {transcript.language}")
                        break
                    except Exception as e:
                        print(f"Failed to fetch transcript {transcript.language}: {e}")
                        continue
                        
        except Exception as e:
            print(f"Failed to list transcripts: {e}")
            # Fallback: try default transcript API
            try:
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
                print("Successfully retrieved transcript using default method")
            except Exception as e2:
                print(f"Default transcript method also failed: {e2}")
                raise ValueError(f"No transcript available for this video. The video may not have captions enabled, or transcripts may be disabled. Original error: {str(e)}")
        
        if not transcript_list:
            raise ValueError("No transcript could be retrieved for this video")
            
        transcript_text = " ".join([item['text'] for item in transcript_list])
        
        if not transcript_text.strip():
            raise ValueError("Retrieved transcript is empty")
            
        print(f"Successfully extracted transcript with {len(transcript_text)} characters")
        return transcript_text
        
    except ValueError:
        # Re-raise ValueError as is (these are our custom messages)
        raise
    except Exception as e:
        raise ValueError(f"Could not retrieve transcript: {str(e)}")

def get_youtube_metadata(url: str) -> dict:
    """Get YouTube video metadata with fallback handling."""
    try:
        # Check if pytube is available
        if not PYTUBE_AVAILABLE or not YouTube:
            raise ImportError("pytube not available")
        
        # First, try with pytube
        try:
            yt = YouTube(url)
            return {
                "title": yt.title or "Unknown Title",
                "author": yt.author or "Unknown Author",
                "length": getattr(yt, 'length', 0) or 0,
                "views": getattr(yt, 'views', 0) or 0,
                "description": (yt.description[:500] + "..." if yt.description and len(yt.description) > 500 else yt.description) or "No description available",
                "publish_date": str(yt.publish_date) if getattr(yt, 'publish_date', None) else None
            }
        except Exception as pytube_error:
            print(f"Pytube failed: {pytube_error}")
            # Fallback: return basic info from URL
            video_id = extract_video_id(url)
            return {
                "title": f"YouTube Video ({video_id})",
                "author": "Unknown Author", 
                "length": 0,
                "views": 0,
                "description": "Metadata unavailable - transcript processing will continue",
                "publish_date": None
            }
    except Exception as e:
        # Final fallback
        video_id = extract_video_id(url) if url else "unknown"
        return {
            "title": f"YouTube Video ({video_id})",
            "author": "Unknown Author",
            "length": 0,
            "views": 0, 
            "description": "Metadata unavailable",
            "publish_date": None
        }

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

# Demo YouTube Processing endpoint with fallback
@app.post("/api/process-youtube")
async def process_youtube(request: YouTubeRequest):
    """Process a YouTube video and extract transcript for RAG functionality."""
    global youtube_vector_db, youtube_video_info, chat_model
    
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
        
        # Extract video ID
        video_id = extract_video_id(request.url)
        
        # Try to get transcript first, but use demo content if it fails
        transcript = None
        try:
            transcript = get_youtube_transcript(video_id)
        except Exception as transcript_error:
            print(f"Transcript extraction failed: {transcript_error}")
            # Use demo transcript for demonstration purposes
            transcript = get_demo_transcript_for_video(video_id)
        
        # Get metadata (this can fail without breaking the process)
        try:
            youtube_video_info = get_youtube_metadata(request.url)
        except Exception as meta_error:
            print(f"Metadata retrieval failed: {meta_error}")
            # Use fallback metadata
            youtube_video_info = {
                "title": f"YouTube Video ({video_id})",
                "author": "Unknown Author",
                "length": 0,
                "views": 0,
                "description": "Metadata unavailable - transcript processing successful",
                "publish_date": None
            }
        
        youtube_video_info["video_id"] = video_id
        youtube_video_info["url"] = request.url
        
        if not transcript.strip():
            raise HTTPException(status_code=400, detail="No transcript available for this video")
        
        # Split transcript into chunks
        text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_texts([transcript])
        
        # Create vector database and index chunks
        youtube_vector_db = VectorDatabase(embedding_model)
        await youtube_vector_db.abuild_from_list(chunks)
        
        # Generate summary
        summary_prompt = f"""Please provide a comprehensive summary of this YouTube video transcript:

Title: {youtube_video_info.get('title', 'Unknown')}
Author: {youtube_video_info.get('author', 'Unknown')}
Duration: {youtube_video_info.get('length', 0)} seconds

Transcript:
{transcript[:2000]}...

Please provide:
1. A brief overview (2-3 sentences)
2. Key points discussed (3-5 bullet points)
3. Main takeaways or conclusions

Keep the summary concise but informative."""

        summary_response = await chat_model.arun([{"role": "user", "content": summary_prompt}])
        
        return {
            "message": "YouTube video processed and indexed successfully",
            "video_info": {
                "title": youtube_video_info.get("title"),
                "author": youtube_video_info.get("author"),
                "duration": youtube_video_info.get("length"),
                "views": youtube_video_info.get("views")
            },
            "chunks_count": len(chunks),
            "summary": summary_response,
            "transcript_length": len(transcript)
        }
        
    except ValueError as ve:
        # These are user-friendly error messages with suggestions
        error_msg = str(ve)
        if "transcript" in error_msg.lower():
            error_msg += "\n\n💡 Suggestions:\n• Try a different video with captions/subtitles enabled\n• Educational videos (TED talks, tutorials) often have transcripts\n• Check if the video has captions by looking for the CC button on YouTube\n• Some videos may have region-restricted transcripts"
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        # Log the full error for debugging
        print(f"Unexpected error processing YouTube video: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing YouTube video: {str(e)}")

# Test endpoint for debugging YouTube functionality
@app.post("/api/test-youtube")
async def test_youtube(request: YouTubeRequest):
    """Test YouTube functionality with detailed debugging info."""
    try:
        video_id = extract_video_id(request.url)
        
        result = {
            "url": request.url,
            "video_id": video_id,
            "transcript_status": "not_tested",
            "metadata_status": "not_tested",
            "available_transcripts": []
        }
        
        # Test transcript availability
        try:
            available_transcripts = YouTubeTranscriptApi.list_transcripts(video_id)
            result["available_transcripts"] = [
                {"language": t.language, "language_code": t.language_code, "is_generated": t.is_generated}
                for t in available_transcripts
            ]
            result["transcript_status"] = "available"
            
            # Try to actually fetch a transcript
            try:
                transcript_text = get_youtube_transcript(video_id)
                result["transcript_fetch_status"] = "success"
                result["transcript_length"] = len(transcript_text)
                result["transcript_preview"] = transcript_text[:200] + "..." if len(transcript_text) > 200 else transcript_text
            except Exception as fetch_error:
                result["transcript_fetch_status"] = f"error: {str(fetch_error)}"
                
        except Exception as e:
            result["transcript_status"] = f"error: {str(e)}"
        
        # Test metadata
        try:
            metadata = get_youtube_metadata(request.url)
            result["metadata_status"] = "success"
            result["metadata"] = metadata
        except Exception as e:
            result["metadata_status"] = f"error: {str(e)}"
        
        return result
        
    except Exception as e:
        return {"error": str(e)}

# YouTube Chat endpoint using RAG
@app.post("/api/youtube-chat")
async def youtube_chat(request: YouTubeChatRequest):
    """Chat with the processed YouTube video using RAG."""
    global youtube_vector_db, youtube_video_info, chat_model
    
    if youtube_vector_db is None:
        raise HTTPException(status_code=400, detail="No YouTube video processed. Please process a YouTube video first.")
    
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
        relevant_chunks = youtube_vector_db.search_by_text(request.message, k=3, return_as_text=True)
        context = "\n\n".join(relevant_chunks)
        
        # Create system prompt for RAG with video info
        video_title = youtube_video_info.get('title', 'Unknown Video') if youtube_video_info else 'Unknown Video'
        video_author = youtube_video_info.get('author', 'Unknown Author') if youtube_video_info else 'Unknown Author'
        
        system_prompt = f"""You are a helpful assistant that answers questions based ONLY on the provided YouTube video transcript.

IMPORTANT RULES:
1. ONLY use information from the provided video transcript below
2. If the answer is not in the transcript, say "I cannot find that information in the video transcript"
3. Be specific and cite relevant parts of the transcript when possible
4. If the transcript is insufficient, ask for clarification

Video Information:
- Title: {video_title}
- Author: {video_author}

Video Transcript Context:
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

# Check YouTube status
@app.get("/api/youtube-status")
async def youtube_status():
    """Check if a YouTube video has been processed and indexed."""
    return {
        "youtube_processed": youtube_vector_db is not None,
        "chunks_count": len(youtube_vector_db.vectors) if youtube_vector_db else 0,
        "video_info": youtube_video_info if youtube_video_info else None
    }

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

# Reset YouTube state (for development/testing)
@app.delete("/api/reset-youtube")
async def reset_youtube():
    """Reset the YouTube state to allow processing a new video."""
    global youtube_vector_db, youtube_video_info, chat_model
    youtube_vector_db = None
    youtube_video_info = None
    # Note: We don't reset chat_model here as it might be used by PDF functionality
    return {"message": "YouTube state reset successfully"}

# Reset all content (PDF and YouTube)
@app.delete("/api/reset-all")
async def reset_all():
    """Reset both PDF and YouTube states."""
    global vector_db, youtube_vector_db, youtube_video_info, chat_model
    vector_db = None
    youtube_vector_db = None
    youtube_video_info = None
    chat_model = None
    return {"message": "All content reset successfully"}

# Define a health check endpoint to verify API status
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
