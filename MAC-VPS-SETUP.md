# Mac VPS Setup Instructions

## Quick Setup

1. **Upload your project** to the Mac VPS
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
   # Install Homebrew first
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
- `Rent-Collector.app` - macOS application
- `Rent-Collector-1.0.1.dmg` - Installer disk image
- `Rent-Collector-1.0.1-mac.zip` - Zipped app

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

## System Requirements

- macOS 10.14+ (Mojave or later)
- Node.js 16+
- npm 8+
- 4GB RAM minimum
- 2GB free disk space

## Build Commands

```bash
# Development
npm run dev:electron

# Build for macOS
npm run dist:mac

# Build for all platforms
npm run dist
```
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