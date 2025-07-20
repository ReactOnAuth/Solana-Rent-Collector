import { contextBridge, ipcRenderer } from 'electron'

// Polyfill crypto.getRandomValues for Node.js environment
if (!global.crypto) {
  // Use a simple polyfill that works in preload context
  global.crypto = {
    getRandomValues: (array: any) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  } as any;
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectWalletFile: () => ipcRenderer.invoke('select-wallet-file'),
  loadWallets: (filePaths: string[]) => ipcRenderer.invoke('load-wallets', filePaths),
  setRpcUrl: (rpcUrl: string) => ipcRenderer.invoke('set-rpc-url', rpcUrl),
  setFeePayer: (privateKey: string) => ipcRenderer.invoke('set-fee-payer', privateKey),
  getSavedConfig: () => ipcRenderer.invoke('get-saved-config'),
  analyzeWallets: () => ipcRenderer.invoke('analyze-wallets'),
  processAllWallets: () => ipcRenderer.invoke('process-all-wallets'),
  processSingleWallet: (walletIndex: number) => ipcRenderer.invoke('process-single-wallet', walletIndex),
  onScanProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('scan-progress', (_event, progress) => callback(progress))
  }
})

export type ElectronAPI = {
  selectWalletFile: () => Promise<string[]>
  loadWallets: (filePaths: string[]) => Promise<{ success: boolean; wallets?: any[]; count?: number; newFiles?: string[]; newWalletsCount?: number; error?: string }>
  setRpcUrl: (rpcUrl: string) => Promise<{ success: boolean; error?: string }>
  setFeePayer: (privateKey: string) => Promise<{ success: boolean; error?: string }>
  getSavedConfig: () => Promise<{ success: boolean; config?: { rpcUrl?: string; feePayerKey?: string }; error?: string }>
  analyzeWallets: () => Promise<{ success: boolean; wallets?: any[]; error?: string }>
  processAllWallets: () => Promise<{ success: boolean; summary?: any; error?: string }>
  processSingleWallet: (walletIndex: number) => Promise<{ success: boolean; result?: any; error?: string }>
  onScanProgress: (callback: (progress: { current: number; total: number; wallet: string; status: string }) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 