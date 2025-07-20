# Rent Collector - Electron UI

A modern Electron application for collecting rent from Solana wallets efficiently. Built with React, TypeScript, and Vite.

## Features

- 🎯 **Easy Setup**: Simple 3-step process to collect rent
- 📊 **Real-time Analysis**: See exactly how much rent can be collected
- 🔒 **Secure**: Private keys never leave your machine
- ⚡ **Fast**: Optimized for batch processing
- 🎨 **Modern UI**: Clean, responsive interface
- 🔄 **Token-2022 Support**: Handles both standard SPL tokens and Token-2022

## Installation

### Download Pre-built Binaries

**Latest Release**: [v1.0.1](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/latest)

#### Windows
- **Setup**: [Rent-Collector-Setup-1.0.1.exe](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/download/v1.0.1/Rent-Collector.Setup.1.0.1.exe)
- **Portable**: [Rent-Collector-1.0.1-win.zip](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/download/v1.0.1/Rent-Collector.Setup.1.0.1.zip)

#### macOS
- **Universal (Intel + Apple Silicon)**: [Rent-Collector-1.0.1.dmg](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/download/v1.0.1/Rent-Collector-1.0.1.dmg)
- **Apple Silicon Only**: [Rent-Collector-1.0.1-arm64.dmg](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/download/v1.0.1/Rent-Collector-1.0.1-arm64.dmg)
- **Universal ZIP**: [Rent-Collector-1.0.1-mac.zip](https://github.com/ReactOnAuth/Solana-Rent-Collector/releases/download/v1.0.1/Rent-Collector-1.0.1-mac.zip)

### Build from Source

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Development Mode**
   ```bash
   # Terminal 1: Start Vite dev server
   npm run dev
   
   # Terminal 2: Start Electron
   npm run electron
   ```

3. **Build for Production**
   ```bash
   # Build the application
   npm run dist
   
   # The executable will be in the `release` folder
   ```

### macOS Build

For building on macOS, see [MACOS-BUILD.md](./MACOS-BUILD.md) for detailed instructions.

**Quick macOS Setup:**
```bash
# Run setup script
chmod +x setup-mac.sh
./setup-mac.sh

# Build for macOS
npm run dist:mac
```

**Build Outputs:**
- `Rent-Collector.app` - macOS application bundle
- `Rent-Collector-1.0.1.dmg` - Universal installer (Intel + Apple Silicon)
- `Rent-Collector-1.0.1-arm64.dmg` - Apple Silicon only installer

## Usage

### Step 1: Setup
1. **Load Wallets**: Select a text file containing wallet private keys (one per line)
2. **Configure RPC**: Set your Solana RPC URL (default: mainnet-beta)
3. **Set Fee Payer**: Provide a wallet private key that will pay transaction fees

### Step 2: Analysis
- The app analyzes all wallets to find token accounts with rent
- View detailed breakdown of rent amounts per wallet
- See total potential rent collection

### Step 3: Processing
- Process all wallets to collect rent
- Burn tokens and close accounts
- Transfer remaining SOL to fee payer
- View final results and statistics

## File Format

Your wallet file should be a plain text file with one private key per line:

```
4NwwCq5bBmDwkvBkujMV19khLcYwCzLciqB3gJt7jJkX...
5PqR8vN2mK9wL3xJ7hF4tY6uI1oP9sA2dG8fH3jK6l...
...
```

## Configuration

### RPC Endpoints
- **Helius**: `https://rpc.helius.xyz/?api-key=YOUR_API_KEY`

### Fee Payer
The fee payer wallet should have sufficient SOL to cover transaction fees for all operations. Recommended: at least 0.01 SOL.

## Technical Details

### Supported Token Types
- Standard SPL Tokens (Token Program)
- Token-2022 Program tokens
- Associated Token Accounts
- Regular Token Accounts

### Rent Collection Process
1. **Token Detection**: Finds all token accounts owned by each wallet
2. **Rent Calculation**: Determines rent-exempt status and collectable amounts
3. **Token Burning**: Burns any remaining tokens to free up rent
4. **Account Closing**: Closes token accounts and recovers rent
5. **SOL Transfer**: Transfers remaining SOL to fee payer

### Safety Features
- Minimum rent threshold (0.0001 SOL) to avoid unprofitable transactions
- Rate limiting and retry logic for RPC calls
- Comprehensive error handling
- Transaction fee optimization

## Development

### Project Structure
```
├── src/                    # React application
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # React entry point
│   ├── index.css          # Global styles
│   └── lib/               # Utility functions
├── electron/              # Electron main process
│   ├── main.ts            # Main process
│   └── preload.ts         # Preload script
├── src/                   # Original rent collector logic
│   ├── rent-collector.ts  # Core rent collection logic
│   ├── wallet-manager.ts  # Wallet management
│   └── types.ts           # TypeScript types
└── dist/                  # Built application
```

### Scripts
- `npm run dev` - Start Vite dev server
- `npm run electron` - Start Electron in development
- `npm run build` - Build React app
- `npm run dist` - Build production executable
- `npm run preview` - Preview built app

## Troubleshooting

### Common Issues

1. **"Failed to load wallets"**
   - Check file format (one private key per line)
   - Ensure file is not empty
   - Verify private keys are valid base58 format

2. **"RPC connection failed"**
   - Check internet connection
   - Verify RPC URL is correct
   - Try a different RPC endpoint

3. **"Insufficient funds for fee payer"**
   - Add more SOL to fee payer wallet
   - Check fee payer private key is correct

4. **"Rate limit exceeded"**
   - Wait a few minutes before retrying
   - Use a different RPC endpoint
   - Reduce batch size in settings

### Performance Tips

- Use a reliable RPC endpoint (Helius recommended)
- Process wallets in smaller batches if experiencing issues
- Ensure stable internet connection
- Close other applications to free up system resources

## Security

- Private keys are never transmitted over the network
- All processing happens locally on your machine
- No data is stored or logged
- File dialogs use system security

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the console logs for detailed error messages
3. Ensure you're using the latest version
4. Test with a small number of wallets first 