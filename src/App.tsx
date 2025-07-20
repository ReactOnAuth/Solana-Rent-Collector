import { useState, useEffect } from 'react'
import { Wallet, Settings, Play, FileText, AlertCircle, CheckCircle, Loader2, BarChart3 } from 'lucide-react'

interface WalletInfo {
  privateKey: string
  publicKey: string
  balance?: number
  rentAmount?: number
  canClose?: boolean
}

interface RentCollectionSummary {
  totalWallets: number
  successfulCollections: number
  totalRentCollected: number
  failedCollections: number
}

function App() {
  const [step, setStep] = useState<'setup' | 'collecting' | 'results'>('setup')
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [walletFiles, setWalletFiles] = useState<string[]>([])
  const [rpcUrl, setRpcUrl] = useState('https://api.mainnet-beta.solana.com')
  const [feePayerKey, setFeePayerKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [processingResults, setProcessingResults] = useState<RentCollectionSummary | null>(null)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; wallet: string; status: string } | null>(null)
  const [totalCollected, setTotalCollected] = useState<number>(0)

  // Load saved configuration on app start
  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const result = await window.electronAPI.getSavedConfig()
        if (result.success && result.config) {
          if (result.config.rpcUrl) {
            setRpcUrl(result.config.rpcUrl)
          }
          if (result.config.feePayerKey) {
            setFeePayerKey(result.config.feePayerKey)
          }
        }
      } catch (error) {
        console.error('Failed to load saved config:', error)
      }
    }
    
    loadSavedConfig()
  }, [])

  const handleSelectWalletFile = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const filePaths = await window.electronAPI.selectWalletFile()
      if (!filePaths || filePaths.length === 0) return

      const result = await window.electronAPI.loadWallets(filePaths)
      if (result.success) {
        setWallets(result.wallets || [])
        setWalletFiles(prev => [...prev, ...(result.newFiles || [])])
        
        const fileCount = result.newFiles?.length || 0
        const totalCount = result.count || 0
        
        if (fileCount > 1) {
          setSuccess(`Loaded ${totalCount} wallets from ${fileCount} files`)
        } else {
          setSuccess(`Loaded ${totalCount} wallets from ${result.newFiles?.[0] || 'file'}`)
        }
        setStep('setup')
      } else {
        setError(result.error || 'Failed to load wallets')
      }
    } catch (err) {
      setError('Failed to select wallet files')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearWallets = () => {
    setWallets([])
    setWalletFiles([])
    setSuccess('Wallets cleared')
  }

  const handleSetRpcUrl = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await window.electronAPI.setRpcUrl(rpcUrl)
      if (result.success) {
        setSuccess('RPC URL set successfully')
      } else {
        setError(result.error || 'Failed to set RPC URL')
      }
    } catch (err) {
      setError('Failed to set RPC URL')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetFeePayer = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await window.electronAPI.setFeePayer(feePayerKey)
      if (result.success) {
        setSuccess('Fee payer set successfully')
      } else {
        setError(result.error || 'Failed to set fee payer')
      }
    } catch (err) {
      setError('Failed to set fee payer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProcessWallets = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setStep('collecting') // Move to collecting step immediately
      setScanProgress(null)
      setTotalCollected(0) // Reset total collected
      
      // Listen for progress updates
      window.electronAPI.onScanProgress((progress) => {
        setScanProgress(progress)
        // Extract SOL amount from status if it contains collection info
        if (progress.status.includes('Collected') && progress.status.includes('SOL')) {
          const match = progress.status.match(/Collected ([\d.]+) SOL/)
          if (match) {
            const collectedAmount = parseFloat(match[1])
            setTotalCollected(prev => prev + collectedAmount)
          }
        }
      })
      
      const result = await window.electronAPI.processAllWallets()
      if (result.success) {
        setProcessingResults(result.summary)
        setTotalCollected(result.summary.totalRentCollected / 1e9) // Set final total
        setSuccess('Rent collection completed!')
        setStep('results') // Move to results step
      } else {
        setError(result.error || 'Failed to process wallets')
      }
    } catch (err) {
      setError('Failed to process wallets')
    } finally {
      setIsLoading(false)
      setScanProgress(null)
    }
  }





  // Check if all required configurations are set
  const isAnalyzeReady = wallets.length > 0 && rpcUrl.trim() && feePayerKey.trim()

  return (
    <div className="container">
      <header className="app-header">
        <div className="header-left">
          <Wallet className="h-6 w-6" style={{ color: 'var(--accent-color)' }} />
          <h1>RENT n BURN</h1>
        </div>
        <div className="tagline">SOLANA RENT RECOVERY</div>
      </header>

      <div className="main-content">
        {/* Progress Steps */}
        <div className="progress-steps">
          <div className={`step ${step === 'setup' ? 'active' : step === 'collecting' || step === 'results' ? 'completed' : ''}`}>
            <Settings className="h-5 w-5" />
          </div>
          <div className={`step-connector ${step === 'collecting' || step === 'results' ? 'active' : ''}`}></div>
          <div className={`step ${step === 'collecting' ? 'active' : step === 'results' ? 'completed' : ''}`}>
            <Play className="h-5 w-5" />
          </div>
          <div className={`step-connector ${step === 'results' ? 'active' : ''}`}></div>
          <div className={`step ${step === 'results' ? 'active' : ''}`}>
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="message error">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {success && (
          <div className="message success">
            <CheckCircle className="h-5 w-5" />
            {success}
          </div>
        )}

        {/* Setup Step */}
        {step === 'setup' && (
          <div>
            <div className="grid-2">
              {/* Wallet File Selection */}
              <div className="card">
                <h2>
                  <FileText className="h-5 w-5" />
                  Load Wallets
                </h2>
                <p className="text-dim mb-4">
                  Select a text file containing wallet private keys (one per line)
                </p>
                <button
                  onClick={handleSelectWalletFile}
                  disabled={isLoading}
                  className="btn btn-primary w-full"
                >
                  {isLoading ? <Loader2 className="spinner" /> : <FileText className="h-4 w-4" />}
                  Add Wallet File
                </button>
                {wallets.length > 0 && (
                  <div className="mt-2">
                    <p className="text-dim text-sm mb-2">
                      Loaded {wallets.length} wallets from {walletFiles.length} file{walletFiles.length !== 1 ? 's' : ''}
                    </p>
                    {walletFiles.length > 0 && (
                      <div className="text-dim text-xs mb-2">
                        Files: {walletFiles.map(f => f.split('/').pop()).join(', ')}
                      </div>
                    )}
                    <button
                      onClick={handleClearWallets}
                      className="btn btn-secondary text-xs"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* RPC Configuration */}
              <div className="card">
                <h2>RPC Configuration</h2>
                {rpcUrl.includes('api.mainnet-beta.solana.com') && (
                  <div className="message error mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <div>
                      <strong>Warning:</strong> The default Solana RPC has very low rate limits and will cause errors when processing many wallets.
                      <br />
                      <strong>Recommendation:</strong> Use <a href="https://helius.xyz" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>Helius RPC</a> (free tier available) for better performance.
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>RPC URL</label>
                  <input
                    type="text"
                    value={rpcUrl}
                    onChange={(e) => setRpcUrl(e.target.value)}
                    placeholder="https://api.mainnet-beta.solana.com"
                  />
                </div>
                <button
                  onClick={handleSetRpcUrl}
                  disabled={isLoading}
                  className="btn btn-secondary w-full"
                >
                  Set RPC URL
                </button>
              </div>
            </div>

            {/* Fee Payer Configuration */}
            <div className="card">
              <h2>Fee Payer Configuration</h2>
              <p className="text-dim mb-4">
                Set a wallet that will pay transaction fees for all operations
              </p>
              <div className="form-group">
                <label>Fee Payer Private Key</label>
                <input
                  type="password"
                  value={feePayerKey}
                  onChange={(e) => setFeePayerKey(e.target.value)}
                  placeholder="Enter private key"
                />
              </div>
              <button
                onClick={handleSetFeePayer}
                disabled={isLoading}
                className="btn btn-primary w-full"
              >
                Set Fee Payer
              </button>
            </div>

            {/* Analyze Button */}
            <div className="text-center">
                              <button
                  onClick={handleProcessWallets}
                  disabled={isLoading || !isAnalyzeReady}
                  className={`btn ${isAnalyzeReady ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isLoading ? <Loader2 className="spinner" /> : <Play className="h-5 w-5" />}
                  Collect Rent
                </button>
              {!isAnalyzeReady && (
                <p className="text-dim mt-2 text-sm">
                  {wallets.length === 0 && 'Please load wallet file • '}
                  {!rpcUrl.trim() && 'Please set RPC URL • '}
                  {!feePayerKey.trim() && 'Please set fee payer'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Collecting Step */}
        {step === 'collecting' && (
          <div>
            <div className="card">
              <h2>Collecting Rent</h2>
              
              {/* Live Progress Stats */}
              {scanProgress && (
                <div className="stats-grid mb-6">
                  <div className="stat-card">
                    <div className="stat-label">Progress</div>
                    <div className="stat-value">{scanProgress.current} / {scanProgress.total}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Current Wallet</div>
                    <div className="stat-value text-sm">{scanProgress.wallet.substring(0, 8)}...{scanProgress.wallet.substring(scanProgress.wallet.length - 8)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Total Collected</div>
                    <div className="stat-value accent">{totalCollected.toFixed(4)} SOL</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Completion</div>
                    <div className="stat-value accent">{Math.round((scanProgress.current / scanProgress.total) * 100)}%</div>
                  </div>
                </div>
              )}
              
              {/* Progress Bar */}
              {isLoading && (
                <div className="text-center py-8">
                  <Loader2 className="spinner mx-auto mb-4" style={{ width: '48px', height: '48px' }} />
                  <p className="text-dim">Scanning wallets and collecting rent...</p>
                  <p className="text-dim text-sm mt-2">This may take a few moments</p>
                  
                  {scanProgress && (
                    <div className="mt-6 p-4 bg-card-bg border border-border-dark rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-dim">Progress</span>
                        <span className="text-sm text-accent-color">{scanProgress.current} / {scanProgress.total}</span>
                      </div>
                      <div className="w-full bg-border-dark rounded-full h-2 mb-3">
                        <div 
                          className="bg-accent-color h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-light mb-1">
                          <span className="text-dim">Wallet:</span> {scanProgress.wallet.substring(0, 8)}...{scanProgress.wallet.substring(scanProgress.wallet.length - 8)}
                        </p>
                        <p className="text-sm text-accent-color">{scanProgress.status}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Move to Results when Complete */}
              {!isLoading && processingResults && (
                <div className="text-center">
                  <button
                    onClick={() => setStep('results')}
                    className="btn btn-primary"
                  >
                    View Results
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && processingResults && (
          <div>
            <div className="card">
              <h2>Collection Results</h2>
              
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Total Wallets</div>
                  <div className="stat-value">{processingResults.totalWallets}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Wallets with Rent</div>
                  <div className="stat-value" style={{ color: processingResults.totalRentCollected > 0 ? '#00ff9d' : '#ff6b6b' }}>
                    {processingResults.totalRentCollected > 0 ? processingResults.successfulCollections : 0}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Wallets Processed</div>
                  <div className="stat-value" style={{ color: '#00ff9d' }}>{processingResults.successfulCollections}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Recovered</div>
                  <div className="stat-value accent">{(processingResults.totalRentCollected / 1e9).toFixed(4)} SOL</div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="mt-6 p-4 bg-card-bg border border-border-dark rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-light">Summary</h3>
                {processingResults.totalRentCollected > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-accent-color" />
                      <span className="text-light">Successfully collected rent from {processingResults.successfulCollections} wallets</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5 text-accent-color" />
                      <span className="text-light">Total SOL recovered: <span className="text-accent-color font-semibold">{(processingResults.totalRentCollected / 1e9).toFixed(4)} SOL</span></span>
                    </div>
                    <div className="ml-8">
                      <p className="text-dim text-sm">
                        Includes rent recovered from closing token accounts + any remaining SOL balance
                      </p>
                    </div>
                    {processingResults.failedCollections > 0 && (
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5" style={{ color: '#ff6b6b' }} />
                        <span className="text-dim">{processingResults.failedCollections} wallets failed to process</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-5 w-5 text-dim" />
                      <span className="text-light">Processed {processingResults.totalWallets} wallets</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5" style={{ color: '#ff6b6b' }} />
                      <span className="text-light">No rent was found to collect</span>
                    </div>
                    <div className="ml-8">
                      <p className="text-dim text-sm">
                        The wallets either have no token accounts, or the token accounts don't have recoverable rent.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center mt-6">
                <button
                  onClick={() => setStep('setup')}
                  className="btn btn-secondary mr-4"
                >
                  Start Over
                </button>
                <button
                  onClick={handleProcessWallets}
                  className="btn btn-primary"
                >
                  Collect Again
                </button>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  )
}

export default App 