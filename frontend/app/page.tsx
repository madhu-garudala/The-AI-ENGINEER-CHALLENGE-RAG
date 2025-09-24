'use client';

import { useState, useRef, useEffect } from 'react';

interface PDFStatus {
  pdf_uploaded: boolean;
  chunks_count: number;
}

interface YouTubeStatus {
  youtube_processed: boolean;
  chunks_count: number;
  video_info: {
    title?: string;
    author?: string;
    duration?: number;
    views?: number;
  } | null;
}

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStatus, setPdfStatus] = useState<PDFStatus>({ pdf_uploaded: false, chunks_count: 0 });
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeStatus>({ 
    youtube_processed: false, 
    chunks_count: 0, 
    video_info: null 
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingYoutube, setProcessingYoutube] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<'pdf' | 'youtube' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check PDF and YouTube status on component mount
  useEffect(() => {
    checkPDFStatus();
    checkYouTubeStatus();
  }, []);

  const checkPDFStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/pdf-status');
      const data = await response.json();
      setPdfStatus(data);
      if (data.pdf_uploaded) {
        setContentType('pdf');
      }
    } catch (err) {
      console.error('Error checking PDF status:', err);
    }
  };

  const checkYouTubeStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/youtube-status');
      const data = await response.json();
      setYoutubeStatus(data);
      if (data.youtube_processed) {
        setContentType('youtube');
      }
    } catch (err) {
      console.error('Error checking YouTube status:', err);
    }
  };

  const handleFileUpload = async () => {
    if (!pdfFile) {
      setError('Please select a PDF file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);

      const response = await fetch('http://localhost:8000/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to upload PDF');
      }

      setPdfStatus({ pdf_uploaded: true, chunks_count: data.chunks_count });
      setContentType('pdf');
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleYouTubeProcess = async () => {
    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setProcessingYoutube(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/process-youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to process YouTube video');
      }

      setYoutubeStatus({ 
        youtube_processed: true, 
        chunks_count: data.chunks_count,
        video_info: data.video_info
      });
      setContentType('youtube');
      
      // Video processed successfully - status will show in the status message
    } catch (err) {
      console.error('YouTube processing error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setProcessingYoutube(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    setError(null);

    try {
      // Choose endpoint based on content type
      const endpoint = contentType === 'youtube' ? 
        'http://localhost:8000/api/youtube-chat' : 
        'http://localhost:8000/api/pdf-chat';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: '',
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessage.id 
              ? { ...msg, content: msg.content + chunk }
              : msg
          )
        );
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isSendDisabled = loading || !inputMessage.trim() || (!pdfStatus.pdf_uploaded && !youtubeStatus.youtube_processed);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">AI Content Chat</h1>
              </div>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="#" className="text-gray-500 hover:text-gray-900">About</a>
              <a href="#" className="text-gray-500 hover:text-gray-900">Help</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Chat with Your Content
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Upload PDFs or process YouTube videos to have intelligent conversations using AI
            </p>
          </div>

          {/* Upload Section */}
          {!pdfStatus.pdf_uploaded && !youtubeStatus.youtube_processed && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* PDF Upload */}
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Upload PDF Document</h3>
                <div className="space-y-4">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {pdfFile && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Selected: {pdfFile.name}</p>
                      <button
                        onClick={handleFileUpload}
                        disabled={uploading}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {uploading ? 'Uploading...' : 'Upload PDF'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* YouTube URL */}
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Process YouTube Video</h3>
                <div className="space-y-4">
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {youtubeUrl && (
                    <button
                      onClick={handleYouTubeProcess}
                      disabled={processingYoutube}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {processingYoutube ? 'Processing...' : 'Process Video'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status Messages */}
          {pdfStatus.pdf_uploaded && (
            <div className="max-w-2xl mx-auto mb-6">
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-800">
                  ✅ PDF uploaded successfully! Indexed {pdfStatus.chunks_count} text chunks.
                </p>
              </div>
            </div>
          )}

          {youtubeStatus.youtube_processed && youtubeStatus.video_info && (
            <div className="max-w-2xl mx-auto mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  ✅ Video "{youtubeStatus.video_info.title}" processed! Indexed {youtubeStatus.chunks_count} segments.
                </p>
              </div>
            </div>
          )}

          {/* Chat Interface */}
          {(pdfStatus.pdf_uploaded || youtubeStatus.youtube_processed) && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Chat with your {contentType === 'youtube' ? 'video' : 'document'}
                  </h3>
                </div>
                <div className="border-t border-gray-200">
                  <div className="h-64 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500">
                          Ask me anything about your {contentType === 'youtube' ? 'video content' : 'document'}!
                        </p>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              message.isUser
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            <p className={`text-xs mt-1 ${
                              message.isUser ? 'text-indigo-100' : 'text-gray-500'
                            }`}>
                              {message.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-800 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                            <span className="text-sm">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="border-t border-gray-200 px-4 py-4">
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder={`Ask a question about your ${contentType === 'youtube' ? 'video' : 'document'}...`}
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !isSendDisabled && sendMessage()}
                        />
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        onClick={sendMessage}
                        disabled={isSendDisabled}
                      >
                        {loading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        ) : null}
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="max-w-3xl mx-auto mt-6">
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
