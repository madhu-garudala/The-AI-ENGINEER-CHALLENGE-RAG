#!/bin/bash

# PDF RAG Chat Server Startup Script
echo "🚀 Starting PDF RAG Chat Server"
echo ""

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY environment variable is not set!"
    echo ""
    echo "Please set your OpenAI API key first:"
    echo ""
    echo "Option 1: Set it for this session:"
    echo "export OPENAI_API_KEY=sk-your_actual_api_key_here"
    echo ""
    echo "Option 2: Set it permanently in your shell profile:"
    echo "echo 'export OPENAI_API_KEY=sk-your_actual_api_key_here' >> ~/.zshrc"
    echo "source ~/.zshrc"
    echo ""
    echo "Option 3: Run this script with the API key:"
    echo "OPENAI_API_KEY=sk-your_actual_api_key_here ./start_server.sh"
    echo ""
    echo "Get your API key from: https://platform.openai.com/account/api-keys"
    echo "The key should start with 'sk-'"
    exit 1
fi

# Check if API key looks valid (not the test key)
if [ "$OPENAI_API_KEY" = "test_key" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ] || [ "$OPENAI_API_KEY" = "sk-your_actual_api_key_here" ]; then
    echo "❌ Please set a valid OpenAI API key!"
    echo "Your current key: $OPENAI_API_KEY"
    echo "Get your API key from: https://platform.openai.com/account/api-keys"
    echo "The key should start with 'sk-' and be from your OpenAI account"
    exit 1
fi

# Check if API key starts with 'sk-'
if [[ ! "$OPENAI_API_KEY" =~ ^sk- ]]; then
    echo "⚠️  Warning: Your API key doesn't start with 'sk-'"
    echo "Current key: $OPENAI_API_KEY"
    echo "Make sure you're using a valid OpenAI API key"
    echo ""
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Please set a valid API key."
        exit 1
    fi
fi

echo "✅ OpenAI API key is set: ${OPENAI_API_KEY:0:10}..."
echo "🌐 Starting server on http://localhost:8000"
echo "📱 Frontend should be running on http://localhost:3000"
echo ""

cd api && python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
