import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { RentCollector } from '../src/rent-collector'
import { WalletManager } from '../src/wallet-manager'
import * as fs from 'fs'
import * as path from 'path'

// Polyfill crypto.getRandomValues for Node.js environment
import { webcrypto } from 'crypto'
if (!global.crypto) {
  global.crypto = webcrypto as any
}

// Polyfill window for Solana Web3.js in Node.js environment
if (typeof global.window === 'undefined') {
  (global as any).window = global
}

// Polyfill WebSocket for Node.js environment
if (typeof global.WebSocket === 'undefined') {
  const WebSocket = require('ws')
  global.WebSocket = WebSocket as any
}

const isDev = process.env.IS_DEV === 'true'

let mainWindow: BrowserWindow | null = null
let rentCollector: RentCollector | null = null
let walletManager: WalletManager | null = null
let storedRpcUrl: string | null = null
let storedFeePayerKey: string | null = null
let loadedWalletFiles: string[] = []

// Storage functions
function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'config.json')
}

function loadConfig(): { rpcUrl?: string; feePayerKey?: string } {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error loading config:', error)
  }
  return {}
}

function saveConfig(config: { rpcUrl?: string; feePayerKey?: string }): void {
  try {
    const configPath = getConfigPath()
    const userDataPath = path.dirname(configPath)
    
    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Error saving config:', error)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    icon: join(__dirname, '../public/icon.ico')
  })

  if (isDev) {
    // Wait for Vite dev server to be ready
    const loadURL = async () => {
      try {
        if (mainWindow) {
          await mainWindow.loadURL('http://localhost:5173')
          mainWindow.webContents.openDevTools()
        }
      } catch (error) {
        console.log('Vite dev server not ready, retrying in 1 second...')
        setTimeout(() => loadURL(), 1000)
      }
    }
    loadURL()
  } else {
    if (mainWindow) {
      mainWindow.loadFile(join(__dirname, '../dist/index.html'))
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Load saved configuration
  const config = loadConfig()
  storedRpcUrl = config.rpcUrl || null
  storedFeePayerKey = config.feePayerKey || null
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Suppress GPU errors
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('select-wallet-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths
  }
  return []
})

ipcMain.handle('load-wallets', async (_event, filePaths: string[]) => {
  try {
    if (!walletManager) {
      walletManager = new WalletManager()
    }
    
    let totalNewWallets = 0
    const loadedFileNames: string[] = []
    
    // Load wallets from each file
    for (const filePath of filePaths) {
      try {
        const newWallets = await walletManager.loadWalletsFromFile(filePath)
        totalNewWallets += newWallets.length
        
        // Add to loaded files list
        if (!loadedWalletFiles.includes(filePath)) {
          loadedWalletFiles.push(filePath)
          loadedFileNames.push(filePath.split('/').pop() || filePath.split('\\').pop() || filePath)
        }
      } catch (error) {
        console.error(`Error loading file ${filePath}:`, error)
        // Continue with other files even if one fails
      }
    }
    
    // Get all wallets (including previously loaded ones)
    const allWallets = walletManager.getWallets()
    
    return { 
      success: true, 
      wallets: allWallets, 
      count: allWallets.length,
      newFiles: loadedFileNames,
      newWalletsCount: totalNewWallets
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('set-rpc-url', async (_event, rpcUrl: string) => {
  try {
    // Store RPC URL for later use
    storedRpcUrl = rpcUrl
    
    // Save to config file
    const config = loadConfig()
    config.rpcUrl = rpcUrl
    saveConfig(config)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('set-fee-payer', async (_event, privateKey: string) => {
  try {
    // Store fee payer for later use
    storedFeePayerKey = privateKey
    
    // Save to config file
    const config = loadConfig()
    config.feePayerKey = privateKey
    saveConfig(config)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('process-all-wallets', async (event) => {
  try {
    if (!walletManager) {
      throw new Error('Wallets not loaded')
    }
    if (!storedRpcUrl) {
      throw new Error('RPC URL not set')
    }
    if (!storedFeePayerKey) {
      throw new Error('Fee payer not set')
    }
    
    // Initialize RentCollector with all required components
    rentCollector = new RentCollector(storedRpcUrl, walletManager)
    rentCollector.setFeePayer(storedFeePayerKey)
    
    // Send progress updates during processing
    const summary = await rentCollector.processAllWallets((progress) => {
      event.sender.send('scan-progress', progress)
    })
    
    return { success: true, summary }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('get-saved-config', async () => {
  try {
    const config = loadConfig()
    return { success: true, config }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('process-single-wallet', async (_event, walletIndex: number) => {
  try {
    if (!rentCollector) {
      throw new Error('Rent collector not initialized. Please analyze wallets first.')
    }
    const result = await rentCollector.processWalletCompletely(walletIndex)
    return { success: true, result }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}) 