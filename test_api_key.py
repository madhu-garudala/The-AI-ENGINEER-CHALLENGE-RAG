#!/usr/bin/env python3
"""
Test script to verify OpenAI API key is working
"""

import os
import sys
from openai import OpenAI

def test_api_key():
    """Test if the OpenAI API key is valid and working"""
    
    # Get API key from environment
    api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key:
        print("❌ OPENAI_API_KEY environment variable is not set!")
        print("Please set it with: export OPENAI_API_KEY=sk-your_actual_api_key_here")
        return False
    
    if api_key == "test_key" or api_key == "your_openai_api_key_here":
        print("❌ Please set a valid OpenAI API key!")
        print("Get your API key from: https://platform.openai.com/account/api-keys")
        return False
    
    if not api_key.startswith("sk-"):
        print("⚠️  Warning: Your API key doesn't start with 'sk-'")
        print(f"Current key: {api_key}")
        print("Make sure you're using a valid OpenAI API key")
        return False
    
    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Test with a simple completion
        print("🔄 Testing API key...")
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Hello, this is a test."}],
            max_tokens=10
        )
        
        print("✅ API key is valid and working!")
        print(f"✅ Test response: {response.choices[0].message.content}")
        return True
        
    except Exception as e:
        print(f"❌ API key test failed: {str(e)}")
        if "Incorrect API key" in str(e):
            print("The API key is invalid. Please check your key at https://platform.openai.com/account/api-keys")
        elif "insufficient_quota" in str(e):
            print("You have insufficient credits. Please add credits to your OpenAI account.")
        return False

if __name__ == "__main__":
    print("🔑 Testing OpenAI API Key")
    print("=" * 40)
    
    success = test_api_key()
    
    if success:
        print("\n🎉 Your API key is working! You can now start the server.")
        print("Run: ./start_server.sh")
    else:
        print("\n❌ Please fix the API key issue and try again.")
        sys.exit(1)
