'use client';

import { useState, useRef, useEffect } from 'react';

interface PDFStatus {
  pdf_uploaded: boolean;
  chunks_count: number;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check PDF status on component mount
  useEffect(() => {
    checkPDFStatus();
  }, []);

  const checkPDFStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/pdf-status');
      const data = await response.json();
      setPdfStatus(data);
    } catch (err) {
      console.error('Error checking PDF status:', err);
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
      const response = await fetch('http://localhost:8000/api/pdf-chat', {
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

  const isSendDisabled = loading || !inputMessage.trim() || !pdfStatus.pdf_uploaded;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white to-gray-50">
      <main className="container mx-auto px-4 py-8 flex-1 flex flex-col">
        {/* Title Section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 text-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            PDF RAG Chat
          </h1>
          <p className="text-gray-600 text-lg">
            Upload a PDF and chat with it using AI-powered retrieval-augmented generation.
          </p>
        </div>


        {/* PDF Upload Section */}
        {!pdfStatus.pdf_uploaded && (
          <div className="max-w-2xl mx-auto w-full mb-6">
            <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload PDF Document</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="pdf-file" className="block text-sm font-medium text-gray-700 mb-2">
                    Select PDF File
                  </label>
                  <input
                    id="pdf-file"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="w-full p-3 text-base text-gray-800 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 bg-white"
                  />
                </div>
                <button
                  className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white rounded-lg transition-colors duration-200 shadow-sm ${
                    !pdfFile || uploading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  onClick={handleFileUpload}
                  disabled={!pdfFile || uploading}
                >
                  {uploading && (
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  )}
                  {uploading ? 'Uploading and Indexing...' : 'Upload PDF'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Status */}
        {pdfStatus.pdf_uploaded && (
          <div className="max-w-2xl mx-auto w-full mb-6">
            <div className="rounded-2xl border border-green-200 bg-green-50 shadow-sm p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800">
                  PDF uploaded and indexed ({pdfStatus.chunks_count} chunks)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {pdfStatus.pdf_uploaded && (
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
            {/* Messages */}
            <div className="flex-1 rounded-2xl border border-gray-200 bg-white/90 shadow-sm mb-4 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Chat with your PDF</h2>
              </div>
              <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-96">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p>Ask me anything about your PDF document!</p>
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
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-1 ${
                          message.isUser ? 'text-blue-100' : 'text-gray-500'
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
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-400 border-t-gray-600 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 p-4 text-lg text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 bg-white min-h-[60px]"
                  placeholder="Ask a question about your PDF..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isSendDisabled && sendMessage()}
                />
                <button
                  className={`inline-flex items-center gap-2 px-6 py-4 text-base font-medium text-white rounded-lg transition-colors duration-200 shadow-sm ${
                    isSendDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  onClick={sendMessage}
                  disabled={isSendDisabled}
                >
                  {loading ? (
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="max-w-2xl mx-auto w-full mt-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="text-center text-xs text-gray-500">
          Built with Next.js, FastAPI, and OpenAI · Powered by AIMakerSpace RAG
        </div>
      </footer>
    </div>
  );
}
