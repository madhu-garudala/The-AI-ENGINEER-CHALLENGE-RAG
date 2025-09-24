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
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">ContentChat</span>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#" className="text-gray-600 hover:text-gray-900 text-sm">About</a>
              <a href="#" className="text-gray-600 hover:text-gray-900 text-sm">Features</a>
              <a href="#" className="text-gray-600 hover:text-gray-900 text-sm">Help</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6">
        {/* Hero Section */}
        <div className="py-16 lg:py-24">
          <div className="max-w-4xl">
            <h1 className="text-4xl lg:text-6xl font-light text-gray-900 mb-6">
              Welcome to AI
              <br />
              <span className="font-normal">Content Chat</span>
            </h1>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl">
              Upload your documents or process YouTube videos to have intelligent conversations with your content using advanced AI technology.
            </p>

            {/* Content Upload Interface */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Content Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Content Type
                  </label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-3 pr-8 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                      <option>PDF Document</option>
                      <option>YouTube Video</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Upload Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Upload Method
                  </label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-3 pr-8 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                      <option>File Upload</option>
                      <option>URL Link</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Language
                  </label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-3 pr-8 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                      <option>English</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* PDF Upload Section */}
              {!pdfStatus.pdf_uploaded && (
                <div className="mb-6">
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-emerald-300 transition-colors">
                    <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Upload your PDF document</h3>
                    <p className="text-gray-500 mb-4">Drag and drop your file here, or click to browse</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-flex items-center px-6 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      Choose File
                    </label>
                    {pdfFile && (
                      <p className="mt-3 text-sm text-gray-600">
                        Selected: {pdfFile.name}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* YouTube URL Section */}
              {!youtubeStatus.youtube_processed && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Or enter YouTube URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    💡 Works best with educational videos that have captions enabled
                  </p>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={pdfFile ? handleFileUpload : handleYouTubeProcess}
                disabled={(!pdfFile && !youtubeUrl.trim()) || uploading || processingYoutube}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {(uploading || processingYoutube) && (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                )}
                {uploading ? 'Processing Document...' : 
                 processingYoutube ? 'Processing Video...' : 
                 'Start Analysis'}
              </button>
            </div>

            {/* Status Display */}
            {pdfStatus.pdf_uploaded && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-emerald-900">Document Ready</h4>
                    <p className="text-sm text-emerald-700">
                      PDF processed successfully • {pdfStatus.chunks_count} sections indexed
                    </p>
                  </div>
                </div>
              </div>
            )}

            {youtubeStatus.youtube_processed && youtubeStatus.video_info && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-900">Video Ready</h4>
                    <p className="text-sm text-blue-700">
                      "{youtubeStatus.video_info.title}" • {youtubeStatus.chunks_count} segments indexed
                    </p>
                    {youtubeStatus.video_info.author && (
                      <p className="text-xs text-blue-600 mt-1">By: {youtubeStatus.video_info.author}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat Interface */}
        {(pdfStatus.pdf_uploaded || youtubeStatus.youtube_processed) && (
          <div className="pb-16">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-lg font-medium text-gray-900">
                  Chat with your {contentType === 'youtube' ? 'video content' : 'document'}
                </h2>
              </div>
              
              <div className="h-96 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-gray-500">
                      Ask me anything about your {contentType === 'youtube' ? 'video content' : 'document'}
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-2xl px-4 py-3 rounded-2xl ${
                        message.isUser 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-2 ${
                          message.isUser ? 'text-emerald-100' : 'text-gray-500'
                        }`}>
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-900 max-w-2xl px-4 py-3 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-gray-100 p-6">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder={`Ask a question about your ${contentType === 'youtube' ? 'video' : 'document'}...`}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isSendDisabled && sendMessage()}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={isSendDisabled}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-red-900">Error</h4>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center text-sm text-gray-500">
            Powered by Next.js, FastAPI, and OpenAI • Built with ❤️ using AIMakerSpace
          </div>
        </div>
      </footer>
    </div>
  );
}
