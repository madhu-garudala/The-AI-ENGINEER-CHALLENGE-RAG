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
    <div className="min-h-screen bg-gray-50">
      {/* Header - Exact limehome style */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex space-x-1">
                <div className="w-3 h-3 bg-teal-500 rounded-sm"></div>
                <div className="w-3 h-3 bg-teal-500 rounded-sm"></div>
              </div>
              <span className="text-xl font-normal text-gray-900">limehome</span>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">About</a>
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Locations</a>
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Lease to limehome</a>
              <div className="text-sm text-gray-600">My Account</div>
              <div className="flex items-center space-x-1 text-sm text-gray-600">
                <span>En</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative">
        {/* Background Image Area */}
        <div className="h-screen bg-gray-100 relative overflow-hidden">
          {/* Simulated background with gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-gray-50 to-white"></div>
          
          {/* Content overlay */}
          <div className="relative z-10 max-w-7xl mx-auto px-6 pt-24">
            <div className="max-w-2xl">
              {/* Berlin location indicator */}
              <div className="flex items-center space-x-2 mb-8 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Berlin Thuerrstrasse</span>
              </div>

              {/* Main heading */}
              <h1 className="text-5xl md:text-6xl font-light text-gray-900 mb-6 leading-tight">
                Welcome Home
              </h1>

              <p className="text-lg text-gray-600 mb-12 leading-relaxed">
                Introducing an entirely new way to stay in your favorite neighborhoods around the world.
              </p>

              {/* Search form - Exact limehome style */}
              <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Location */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                      Content Type
                    </label>
                    <div className="relative">
                      <select className="w-full bg-white border-0 border-b-2 border-gray-200 focus:border-teal-500 px-0 py-3 text-sm text-gray-900 appearance-none focus:outline-none">
                        <option>PDF Document</option>
                        <option>YouTube Video</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                        <svg className="fill-current h-4 w-4 text-gray-400" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Check In - Check Out */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                      Check In — Check Out
                    </label>
                    <div className="relative">
                      <select className="w-full bg-white border-0 border-b-2 border-gray-200 focus:border-teal-500 px-0 py-3 text-sm text-gray-900 appearance-none focus:outline-none">
                        <option>File Upload</option>
                        <option>URL Link</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                        <svg className="fill-current h-4 w-4 text-gray-400" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Guests */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                      1 guest
                    </label>
                    <div className="relative">
                      <select className="w-full bg-white border-0 border-b-2 border-gray-200 focus:border-teal-500 px-0 py-3 text-sm text-gray-900 appearance-none focus:outline-none">
                        <option>English</option>
                        <option>German</option>
                        <option>French</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                        <svg className="fill-current h-4 w-4 text-gray-400" viewBox="0 0 20 20">
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
                      className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-medium py-3 px-6 rounded-md transition-colors"
                    >
                      {(uploading || processingYoutube) ? 'Processing...' : 'Search Suite'}
                    </button>
                  </div>
                </div>

                {/* File Upload Areas */}
                {!pdfStatus.pdf_uploaded && !youtubeStatus.youtube_processed && (
                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* PDF Upload */}
                      <div className="text-center">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="pdf-upload"
                        />
                        <label
                          htmlFor="pdf-upload"
                          className="block p-6 border-2 border-dashed border-gray-200 rounded-lg hover:border-teal-300 cursor-pointer transition-colors"
                        >
                          <svg className="w-8 h-8 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium text-teal-500">Upload PDF</span> or drag and drop
                          </div>
                          {pdfFile && (
                            <div className="mt-2 text-xs text-gray-500">{pdfFile.name}</div>
                          )}
                        </label>
                      </div>

                      {/* YouTube URL */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Or paste YouTube URL
                        </label>
                        <input
                          type="url"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-3 py-3 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Messages */}
              {pdfStatus.pdf_uploaded && (
                <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4 mb-6">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm text-green-800">
                      PDF ready • {pdfStatus.chunks_count} sections indexed
                    </span>
                  </div>
                </div>
              )}

              {youtubeStatus.youtube_processed && youtubeStatus.video_info && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 mb-6">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-sm text-blue-800">
                      Video ready: "{youtubeStatus.video_info.title}" • {youtubeStatus.chunks_count} segments
                    </span>
                  </div>
                </div>
              )}

              {/* Play showreel button */}
              <div className="flex items-center space-x-4 text-sm">
                <button className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>Play showreel</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        {(pdfStatus.pdf_uploaded || youtubeStatus.youtube_processed) && (
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-lg font-light text-gray-900">
                  Chat with your {contentType === 'youtube' ? 'video' : 'document'}
                </h2>
              </div>
              
              <div className="h-96 overflow-y-auto p-6">
                {messages.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-gray-500">
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

              <div className="border-t border-gray-100 p-6">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isSendDisabled && sendMessage()}
                    className="flex-1 border border-gray-200 rounded-md px-3 py-3 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={isSendDisabled}
                    className="bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-medium px-6 py-3 rounded-md transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="max-w-7xl mx-auto px-6 mb-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
