# macOS Build Instructions

## Quick Setup

1. **Clone or download the project** to your Mac
2. **Run the setup script:**
   ```bash
   chmod +x setup-mac.sh
   ./setup-mac.sh
   ```

3. **Build for macOS:**
   ```bash
   npm run dist:mac
   ```

## Manual Setup (if script fails)

1. **Install Node.js:**
   ```bash
   # Install Homebrew first (if not installed)
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   
   # Install Node.js
   brew install node
   ```

2. **Install dependencies:**
   ```bash
   npm install
   npm run postinstall
   ```

3. **Build the app:**
   ```bash
   npm run dist:mac
   ```

## What You'll Get

After building, you'll find in the `release` folder:
- `Rent-Collector.app` - macOS application bundle
- `Rent-Collector-1.0.1.dmg` - Universal installer (Intel + Apple Silicon)
- `Rent-Collector-1.0.1-arm64.dmg` - Apple Silicon only installer
- `Rent-Collector-1.0.1-mac.zip` - Universal zipped app
- `Rent-Collector-1.0.1-arm64-mac.zip` - Apple Silicon only zipped app

## Installation

### Using DMG Installer (Recommended):
1. **Double-click** the `.dmg` file
2. **Drag** the app to the Applications folder
3. **Eject** the DMG
4. **Run** the app from Applications

### Using ZIP File:
1. **Extract** the `.zip` file
2. **Move** the app to Applications folder
3. **Run** the app

## Troubleshooting

### Common Issues:

1. **"Permission denied"**
   ```bash
   chmod +x setup-mac.sh
   ```

2. **"Node.js not found"**
   ```bash
   brew install node
   ```

3. **"Build failed"**
   ```bash
   npm run postinstall
   npm run dist:mac
   ```

4. **"Icon not found"**
   - Add `public/icon.icns` file (optional)

5. **"App can't be opened"**
   - Right-click the app → Open
   - Or go to System Preferences → Security & Privacy → Allow

## System Requirements

- **macOS 10.14+** (Mojave or later)
- **Node.js 16+**
- **npm 8+**
- **4GB RAM** minimum
- **2GB free disk space**

## Development Commands

```bash
# Development mode
npm run dev:electron

# Build for macOS
npm run dist:mac

# Build for all platforms
npm run dist

# Run setup script
npm run setup:mac
```

## Architecture Support

- **Universal (Intel + Apple Silicon)**: `Rent-Collector-1.0.1.dmg`
- **Apple Silicon Only**: `Rent-Collector-1.0.1-arm64.dmg`

**Recommendation**: Use the Universal DMG for distribution as it works on all Macs.
```

## **How to Use on Your Mac VPS:**

1. **Upload your project** to the Mac VPS (zip and upload, or use git)
2. **Extract the project** if needed
3. **Run the setup script:**
   ```bash
   chmod +x setup-mac.sh
   ./setup-mac.sh
   ```
4. **Build the macOS app:**
   ```bash
   npm run dist:mac
   ```
5. **Download the results** from the `release` folder

The setup script will automatically install Node.js, npm, and all dependencies needed to build your macOS app! ��

Would you like me to create these files in your project now?