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
      setMessages([{
        id: '1',
        content: `PDF "${pdfFile.name}" uploaded successfully! I've indexed ${data.chunks_count} text chunks. You can now ask me questions about the document.`,
        isUser: false,
        timestamp: new Date()
      }]);
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
      
      setMessages([{
        id: '1',
        content: `YouTube video "${data.video_info.title}" processed successfully! 

📊 **Video Summary:**
${data.summary}

I've indexed ${data.chunks_count} text chunks from the transcript. You can now ask me questions about the video content.`,
        isUser: false,
        timestamp: new Date()
      }]);
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
    <div className="min-h-screen bg-white">
      {/* Header - Clean and minimal like limehome */}
      <header className="py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-teal-500 rounded"></div>
            <span className="text-lg font-medium text-gray-900">contentchat</span>
          </div>
          <nav className="hidden md:flex items-center space-x-8 text-sm text-gray-600">
            <a href="#" className="hover:text-gray-900">About</a>
            <a href="#" className="hover:text-gray-900">Features</a>
            <a href="#" className="hover:text-gray-900">Help</a>
            <div className="flex items-center space-x-2 text-xs">
              <span>En</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pt-12 pb-24">
        {/* Hero Section - Much more spacious */}
        <div className="mb-16">
          <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-6 leading-tight">
            Welcome Home
          </h1>
          <p className="text-lg text-gray-600 mb-16 max-w-xl leading-relaxed">
            Introducing an entirely new way to chat with your content around the world.
          </p>
        </div>

        {/* Search Interface - Clean and minimal like limehome */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Content Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                Content Type
              </label>
              <div className="relative">
                <select className="w-full bg-white border border-gray-300 rounded px-3 py-3 text-sm text-gray-900 appearance-none focus:outline-none focus:border-gray-400">
                  <option>PDF Document</option>
                  <option>YouTube Video</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                  <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Upload Method */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                Method
              </label>
              <div className="relative">
                <select className="w-full bg-white border border-gray-300 rounded px-3 py-3 text-sm text-gray-900 appearance-none focus:outline-none focus:border-gray-400">
                  <option>File Upload</option>
                  <option>URL Link</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                  <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
                Language
              </label>
              <div className="relative">
                <select className="w-full bg-white border border-gray-300 rounded px-3 py-3 text-sm text-gray-900 appearance-none focus:outline-none focus:border-gray-400">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                  <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <button
                onClick={pdfFile ? handleFileUpload : handleYouTubeProcess}
                disabled={(!pdfFile && !youtubeUrl.trim()) || uploading || processingYoutube}
                className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white text-sm font-medium py-3 px-4 rounded transition-colors"
              >
                {(uploading || processingYoutube) ? 'Processing...' : 'Search Content'}
              </button>
            </div>
          </div>
        </div>

        {/* File Upload Section - Only show when no content is uploaded */}
        {!pdfStatus.pdf_uploaded && !youtubeStatus.youtube_processed && (
          <div className="mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* PDF Upload */}
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <div className="mb-6">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-light text-gray-900 mb-2">Upload PDF</h3>
                  <p className="text-sm text-gray-600 mb-4">Select a document to analyze and chat with</p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="pdf-upload"
                />
                <label
                  htmlFor="pdf-upload"
                  className="inline-block bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium py-2 px-4 rounded cursor-pointer transition-colors"
                >
                  Choose File
                </label>
                {pdfFile && (
                  <p className="mt-3 text-xs text-gray-600">
                    {pdfFile.name}
                  </p>
                )}
              </div>

              {/* YouTube URL */}
              <div className="bg-gray-50 rounded-lg p-8">
                <div className="mb-6 text-center">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-lg font-light text-gray-900 mb-2">YouTube Video</h3>
                  <p className="text-sm text-gray-600 mb-4">Enter a video URL to analyze its content</p>
                </div>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>
            </div>
          </div>
        )}

        {/* Status Display */}
        {pdfStatus.pdf_uploaded && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
              <span className="text-sm text-green-800">
                PDF ready • {pdfStatus.chunks_count} sections indexed
              </span>
            </div>
          </div>
        )}

        {youtubeStatus.youtube_processed && youtubeStatus.video_info && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
              <span className="text-sm text-blue-800">
                Video ready: "{youtubeStatus.video_info.title}" • {youtubeStatus.chunks_count} segments indexed
              </span>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {(pdfStatus.pdf_uploaded || youtubeStatus.youtube_processed) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-light text-gray-900">
                Chat with your {contentType === 'youtube' ? 'video' : 'document'}
              </h2>
            </div>
            
            <div className="h-96 overflow-y-auto p-6">
              {messages.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-500 text-sm">
                    Start a conversation about your {contentType === 'youtube' ? 'video content' : 'document'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-lg px-4 py-3 rounded-lg text-sm ${
                        message.isUser 
                          ? 'bg-teal-500 text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-1 ${
                          message.isUser ? 'text-teal-100' : 'text-gray-500'
                        }`}>
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-900 max-w-lg px-4 py-3 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 p-6">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isSendDisabled && sendMessage()}
                  className="flex-1 bg-white border border-gray-300 rounded px-3 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
                <button
                  onClick={sendMessage}
                  disabled={isSendDisabled}
                  className="bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-3 rounded transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
