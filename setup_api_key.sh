#!/bin/bash

# Setup OpenAI API Key Script
echo "🔑 OpenAI API Key Setup"
echo ""

echo "Please enter your OpenAI API key (it should start with 'sk-'):"
read -p "API Key: " api_key

if [ -z "$api_key" ]; then
    echo "❌ No API key provided. Exiting."
    exit 1
fi

# Check if it starts with 'sk-'
if [[ ! "$api_key" =~ ^sk- ]]; then
    echo "⚠️  Warning: Your API key doesn't start with 'sk-'"
    echo "Make sure you're using a valid OpenAI API key from https://platform.openai.com/account/api-keys"
    echo ""
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Please get a valid API key."
        exit 1
    fi
fi

echo ""
echo "Setting up your API key..."

# Set for current session
export OPENAI_API_KEY="$api_key"
echo "✅ API key set for current session"

# Ask if they want to set it permanently
echo ""
read -p "Do you want to set this API key permanently in your shell profile? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Detect shell
    if [ -n "$ZSH_VERSION" ]; then
        profile_file="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        profile_file="$HOME/.bashrc"
    else
        profile_file="$HOME/.profile"
    fi
    
    # Add to profile
    echo "" >> "$profile_file"
    echo "# OpenAI API Key for PDF RAG Chat" >> "$profile_file"
    echo "export OPENAI_API_KEY=\"$api_key\"" >> "$profile_file"
    
    echo "✅ API key added to $profile_file"
    echo "Run 'source $profile_file' or restart your terminal to use it"
fi

echo ""
echo "🎉 Setup complete! You can now run:"
echo "  ./start_server.sh"
echo ""
echo "Or manually start the server with:"
echo "  cd api && python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
