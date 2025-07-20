#!/bin/bash

echo "🚀 Setting up Rent Collector for macOS..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing Node.js..."
    # Install Node.js using Homebrew
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
else
    echo "✅ Node.js found: $(node --version)"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js with npm."
    exit 1
else
    echo "✅ npm found: $(npm --version)"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install electron-builder dependencies
echo "🔧 Installing electron-builder dependencies..."
npm run postinstall

# Create macOS icon if it doesn't exist
if [ ! -f "public/icon.icns" ]; then
    echo "⚠️  macOS icon not found. Creating placeholder..."
    # Create a simple placeholder icon
    mkdir -p public
    echo "Note: You may want to add a proper icon.icns file to public/ folder"
fi

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm run dev:electron (for development)"
echo "2. Run: npm run dist:mac (to build for macOS)"
echo "3. Check the 'release' folder for your .app file"
echo ""
echo "�� To build the macOS app:"
echo "   npm run dist:mac"
