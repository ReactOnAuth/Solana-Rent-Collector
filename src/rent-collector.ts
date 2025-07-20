import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  AccountInfo
} from '@solana/web3.js';

// Polyfill crypto.getRandomValues for Node.js environment
if (typeof global !== 'undefined' && !global.crypto) {
  const { webcrypto } = require('crypto');
  global.crypto = webcrypto;
}
import { 
  TOKEN_PROGRAM_ID, 
  createCloseAccountInstruction,
  createBurnInstruction
} from '@solana/spl-token';

import bs58 from 'bs58';
import { WalletInfo, RentCollectionResult, RentCollectionSummary } from './types';

// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export class RentCollector {
  private connection: Connection;
  private walletManager: any; // Will be properly typed when imported
  private readonly BATCH_SIZE = 10; // Helius has high rate limits, so we can process more wallets per batch
  private feePayerKeypair: Keypair | null = null;

  constructor(rpcUrl: string, walletManager: any) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.walletManager = walletManager;
  }

  /**
   * Set the fee payer wallet (should have SOL for transaction fees)
   */
  setFeePayer(feePayerPrivateKey: string): void {
    this.feePayerKeypair = Keypair.fromSecretKey(bs58.decode(feePayerPrivateKey));
    console.log(`Fee payer set to: ${this.feePayerKeypair.publicKey.toString()}`);
  }

  /**
   * Sleep function for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Check if it's a rate limit error
        if (error.message && (error.message.includes('429') || error.message.includes('Too Many Requests'))) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`Rate limited (attempt ${attempt + 1}/${maxRetries + 1}). Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          continue;
        }

        // For other errors, throw immediately
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Calculate rent-exempt balance for an account
   */
  private async calculateRentExemptBalance(accountInfo: AccountInfo<Buffer>): Promise<number> {
    const dataSize = accountInfo.data.length;
    const rentExemptionAmount = await this.connection.getMinimumBalanceForRentExemption(dataSize);
    return rentExemptionAmount;
  }

  /**
   * Check if an account can be closed (has rent to collect)
   */
  private canCloseAccount(balance: number, _rentExemptBalance: number): boolean {
    // For token accounts, we can always close them and recover the full balance
    // The rent calculation is different for token accounts vs regular accounts
    return balance > 0;
  }

  /**
   * Calculate rent amount that can be collected
   */
  private calculateRentAmount(balance: number, _rentExemptBalance: number): number {
    // For token accounts, we can recover the full balance when closing
    // The rent-exempt calculation doesn't apply the same way for token accounts
    return balance;
  }

  /**
   * Get all token accounts for a wallet
   */
  private async getTokenAccounts(walletPublicKey: PublicKey): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer> }[]> {
    try {
      console.log(`Getting token accounts for ${walletPublicKey.toString()}...`);
      

      
      // Try multiple approaches to find token accounts
      let allTokenAccounts: { pubkey: PublicKey; account: AccountInfo<Buffer> }[] = [];
      
      // Method 1: getTokenAccountsByOwner (both Token and Token-2022)
      try {
        // Check standard Token program
        const tokenAccounts = await this.retryWithBackoff(async () => {
          return await this.connection.getTokenAccountsByOwner(walletPublicKey, {
            programId: TOKEN_PROGRAM_ID
          });
        });
        console.log(`Method 1 (Token): Found ${tokenAccounts.value.length} token accounts`);
        allTokenAccounts.push(...tokenAccounts.value.map(item => ({
          pubkey: item.pubkey,
          account: item.account
        })));
        
        // Check Token-2022 program
        const token2022Accounts = await this.retryWithBackoff(async () => {
          return await this.connection.getTokenAccountsByOwner(walletPublicKey, {
            programId: TOKEN_2022_PROGRAM_ID
          });
        });
        console.log(`Method 1 (Token-2022): Found ${token2022Accounts.value.length} token accounts`);
        allTokenAccounts.push(...token2022Accounts.value.map(item => ({
          pubkey: item.pubkey,
          account: item.account
        })));
      } catch (error) {
        console.log(`Method 1 failed: ${error}`);
      }
      
      // Method 2: getParsedProgramAccounts with owner filter and data size filter
      try {
        const parsedAccounts = await this.retryWithBackoff(async () => {
          return await this.connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
            filters: [
              {
                dataSize: 165, // Token account data size
              },
              {
                memcmp: {
                  offset: 32,
                  bytes: walletPublicKey.toBase58(),
                },
              },
            ],
          });
        });
        console.log(`Method 2: Found ${parsedAccounts.length} parsed token accounts`);
        
        // Convert parsed accounts to raw format
        parsedAccounts.forEach(item => {
          if (item.account && item.account.data && typeof item.account.data === 'object' && 'parsed' in item.account.data) {
            const parsedData = (item.account.data as any).parsed;
            if (parsedData && parsedData.info && parsedData.info.owner === walletPublicKey.toString()) {
              const rawAccount: AccountInfo<Buffer> = {
                lamports: item.account.lamports,
                data: Buffer.from(JSON.stringify(item.account.data)),
                owner: item.account.owner,
                executable: item.account.executable,
                rentEpoch: item.account.rentEpoch
              };
              allTokenAccounts.push({
                pubkey: item.pubkey,
                account: rawAccount
              });
            }
          }
        });
      } catch (error) {
        console.log(`Method 2 failed: ${error}`);
      }
      
      // Method 3: Try to get specific token accounts if we know the wallet has tokens (both programs)
      try {
        // Get all accounts owned by this wallet (Token program)
        const tokenAccounts = await this.retryWithBackoff(async () => {
          return await this.connection.getParsedTokenAccountsByOwner(walletPublicKey, {
            programId: TOKEN_PROGRAM_ID
          });
        });
        console.log(`Method 3 (Token): Found ${tokenAccounts.value.length} parsed token accounts`);
        
        // Convert to our format
        tokenAccounts.value.forEach(item => {
          if (item.account && item.account.data && typeof item.account.data === 'object' && 'parsed' in item.account.data) {
            const parsedData = (item.account.data as any).parsed;
            if (parsedData && parsedData.info && parsedData.info.owner === walletPublicKey.toString()) {
              const rawAccount: AccountInfo<Buffer> = {
                lamports: item.account.lamports,
                data: Buffer.from(JSON.stringify(item.account.data)),
                owner: item.account.owner,
                executable: item.account.executable,
                rentEpoch: item.account.rentEpoch
              };
              allTokenAccounts.push({
                pubkey: item.pubkey,
                account: rawAccount
              });
            }
          }
        });
        
        // Get all accounts owned by this wallet (Token-2022 program)
        const token2022Accounts = await this.retryWithBackoff(async () => {
          return await this.connection.getParsedTokenAccountsByOwner(walletPublicKey, {
            programId: TOKEN_2022_PROGRAM_ID
          });
        });
        console.log(`Method 3 (Token-2022): Found ${token2022Accounts.value.length} parsed token accounts`);
        
        // Convert to our format
        token2022Accounts.value.forEach(item => {
          if (item.account && item.account.data && typeof item.account.data === 'object' && 'parsed' in item.account.data) {
            const parsedData = (item.account.data as any).parsed;
            if (parsedData && parsedData.info && parsedData.info.owner === walletPublicKey.toString()) {
              const rawAccount: AccountInfo<Buffer> = {
                lamports: item.account.lamports,
                data: Buffer.from(JSON.stringify(item.account.data)),
                owner: item.account.owner,
                executable: item.account.executable,
                rentEpoch: item.account.rentEpoch
              };
              allTokenAccounts.push({
                pubkey: item.pubkey,
                account: rawAccount
              });
            }
          }
        });
      } catch (error) {
        console.log(`Method 3 failed: ${error}`);
      }
      
      // Remove duplicates based on pubkey
      const uniqueAccounts = new Map<string, { pubkey: PublicKey; account: AccountInfo<Buffer> }>();
      allTokenAccounts.forEach(account => {
        uniqueAccounts.set(account.pubkey.toString(), account);
      });
      
      const result = Array.from(uniqueAccounts.values());
      console.log(`Total unique token accounts found: ${result.length}`);
      
      return result;
    } catch (error) {
      console.error(`Error getting token accounts for ${walletPublicKey.toString()}:`, error);
      return [];
    }
  }

  /**
   * Close a token account and recover rent using fee payer
   */
  private async closeTokenAccount(
    tokenAccountPubkey: PublicKey,
    ownerKeypair: Keypair,
    destinationPubkey: PublicKey
  ): Promise<{ success: boolean; rentRecovered: number; error?: string }> {
    try {
      if (!this.feePayerKeypair) {
        return {
          success: false,
          rentRecovered: 0,
          error: 'Fee payer not set'
        };
      }

      // Get the account info to calculate rent recovered
      const accountInfo = await this.connection.getAccountInfo(tokenAccountPubkey);
      const rentRecovered = accountInfo ? accountInfo.lamports : 0;
      
      // Determine if this is a Token-2022 account
      const isToken2022 = accountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID);
      const programId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      
      // Parse token account data to get amount
      let tokenAmount = 0;
      if (accountInfo && accountInfo.data.length >= 165) {
        tokenAmount = Number(accountInfo.data.readBigUInt64LE(64));
      }
      
      // Check if account has any tokens - if so, we'll burn them
      if (tokenAmount > 0) {
        console.log(`    Token account ${tokenAccountPubkey.toString()} has ${tokenAmount} tokens - will burn them before closing`);
      }

      // Create transaction with fee payer
      const transaction = new Transaction();
      
      // If account has tokens, burn them first
      if (tokenAmount > 0) {
        console.log(`    Burning ${tokenAmount} tokens from ${tokenAccountPubkey.toString()}`);
        
        // Parse mint from account data
        const mint = new PublicKey(accountInfo!.data.slice(0, 32));
        
        const burnInstruction = createBurnInstruction(
          tokenAccountPubkey,
          mint,
          ownerKeypair.publicKey,
          BigInt(tokenAmount),
          [],
          programId
        );
        transaction.add(burnInstruction);
      }
      
      // Create close account instruction with the correct program ID
      const closeInstruction = createCloseAccountInstruction(
        tokenAccountPubkey,
        destinationPubkey,
        ownerKeypair.publicKey,
        [],
        programId
      );
      
      transaction.add(closeInstruction);
      transaction.feePayer = this.feePayerKeypair.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Sign with both owner and fee payer
      transaction.sign(ownerKeypair, this.feePayerKeypair);
      
      const signature = await this.retryWithBackoff(async () => {
        return await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [ownerKeypair, this.feePayerKeypair!]
        );
      });

      console.log(`Successfully closed token account ${tokenAccountPubkey.toString()}`);
      console.log(`Transaction signature: ${signature}`);

      // Rent recovered is already calculated above

      return {
        success: true,
        rentRecovered,
        error: undefined
      };
    } catch (error) {
      console.error(`Error closing token account ${tokenAccountPubkey.toString()}:`, error);
      return {
        success: false,
        rentRecovered: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a single wallet to find token accounts with rent (without closing them yet)
   */
  private async processSingleWallet(wallet: WalletInfo, walletIndex: number): Promise<WalletInfo> {
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const publicKey = keypair.publicKey;

    // Add small delay to avoid overwhelming the RPC
    await this.sleep(250);

    try {
      // Get wallet balance
      const walletBalance = await this.retryWithBackoff(async () => {
        return await this.connection.getBalance(publicKey);
      });

      console.log(`Wallet ${walletIndex + 1}: Balance = ${walletBalance / LAMPORTS_PER_SOL} SOL`);

      // Get all token accounts for this wallet
      const tokenAccounts = await this.getTokenAccounts(publicKey);
      
      let totalRentToCollect = 0;
      let tokenAccountsWithRent = 0;

      // Check each token account for rent
      for (const tokenAccount of tokenAccounts) {
        const accountInfo = tokenAccount.account;
        const balance = accountInfo.lamports;
        
        if (accountInfo.data) {
          const rentExemptBalance = await this.calculateRentExemptBalance(accountInfo);
          const rentAmount = this.calculateRentAmount(balance, rentExemptBalance);
          
          console.log(`  Token account ${tokenAccount.pubkey.toString()}: Balance=${balance / LAMPORTS_PER_SOL} SOL, Rent exempt=${rentExemptBalance / LAMPORTS_PER_SOL} SOL, Rent amount=${rentAmount / LAMPORTS_PER_SOL} SOL`);
          
          if (this.canCloseAccount(balance, rentExemptBalance)) {
            totalRentToCollect += rentAmount;
            tokenAccountsWithRent++;
            console.log(`  -> This token account has rent to collect: ${rentAmount / LAMPORTS_PER_SOL} SOL`);
          }
        }
      }

      const processedWallet: WalletInfo = {
        ...wallet,
        balance: walletBalance,
        rentExemptBalance: 0, // Not used for token accounts
        rentAmount: totalRentToCollect,
        canClose: totalRentToCollect > 0
      };

      this.walletManager.updateWalletInfo(walletIndex, walletBalance, 0, totalRentToCollect, totalRentToCollect > 0);

      if (totalRentToCollect > 0) {
        console.log(`Wallet ${walletIndex + 1}: ${publicKey.toString()} - ${tokenAccountsWithRent} token accounts with rent: ${totalRentToCollect / LAMPORTS_PER_SOL} SOL`);
      } else {
        console.log(`Wallet ${walletIndex + 1}: No token accounts with rent to collect`);
      }

      return processedWallet;
    } catch (error) {
      console.error(`Error processing wallet ${walletIndex + 1}:`, error);
      return wallet;
    }
  }



  /**
   * Analyze all wallets to find token accounts with rent
   */
  async analyzeWallets(progressCallback?: (progress: { current: number; total: number; wallet: string; status: string }) => void): Promise<WalletInfo[]> {
    const wallets = this.walletManager.getWallets();
    const analyzedWallets: WalletInfo[] = [];

    console.log(`Analyzing ${wallets.length} wallets for token accounts with rent...`);

    // Process wallets in batches
    for (let i = 0; i < wallets.length; i += this.BATCH_SIZE) {
      console.log(`\n=== Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(wallets.length / this.BATCH_SIZE)} ===`);
      
      const batch = wallets.slice(i, i + this.BATCH_SIZE);
      
      for (let j = 0; j < batch.length; j++) {
        const walletIndex = i + j;
        const wallet = batch[j];
        
        if (progressCallback) {
          progressCallback({
            current: walletIndex + 1,
            total: wallets.length,
            wallet: wallet.publicKey,
            status: 'Checking balance...'
          });
        }
        
        const result = await this.processSingleWallet(wallet, walletIndex);
        analyzedWallets.push(result);
        
        if (progressCallback) {
          progressCallback({
            current: walletIndex + 1,
            total: wallets.length,
            wallet: wallet.publicKey,
            status: result.canClose ? `Found ${(result.rentAmount || 0) / LAMPORTS_PER_SOL} SOL rent` : 'No rent found'
          });
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i + this.BATCH_SIZE < wallets.length) {
        console.log(`Waiting 1.5 seconds before next batch...`);
        await this.sleep(1500); // 1.5 second delay between batches
      }
    }

    const walletsWithRent = analyzedWallets.filter(w => w.canClose);
    console.log(`\nFound ${walletsWithRent.length} wallets with token accounts that have rent to collect`);

    return analyzedWallets;
  }

  /**
   * Close all token accounts with rent using the fee payer
   */
  async closeAllTokenAccounts(): Promise<RentCollectionSummary> {
    if (!this.feePayerKeypair) {
      throw new Error('Fee payer not set. Call setFeePayer() first.');
    }

    const wallets = this.walletManager.getWallets();
    const results: RentCollectionResult[] = [];
    let totalRentRecovered = 0;
    let successfulClosures = 0;
    let failedClosures = 0;

    console.log('Starting token account closing process...');

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      
      if (wallet.canClose && wallet.rentAmount > 0) {
        const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
        const publicKey = keypair.publicKey;

        console.log(`\n--- Closing token accounts for Wallet ${i + 1} ---`);
        
        // Get token accounts for this wallet
        const tokenAccounts = await this.getTokenAccounts(publicKey);
        
        for (const tokenAccount of tokenAccounts) {
          const accountInfo = tokenAccount.account;
          const balance = accountInfo.lamports;
          
          if (accountInfo.data) {
            const rentExemptBalance = await this.calculateRentExemptBalance(accountInfo);
            const rentAmount = this.calculateRentAmount(balance, rentExemptBalance);
            
            if (this.canCloseAccount(balance, rentExemptBalance)) {
              console.log(`  Attempting to close token account ${tokenAccount.pubkey.toString()} (rent: ${rentAmount / LAMPORTS_PER_SOL} SOL)`);
              
              const closeResult = await this.closeTokenAccount(
                tokenAccount.pubkey,
                keypair,
                this.feePayerKeypair!.publicKey // Send rent to fee payer wallet
              );
              
              if (closeResult.success) {
                successfulClosures++;
                totalRentRecovered += closeResult.rentRecovered;
                console.log(`  -> Successfully closed and recovered ${closeResult.rentRecovered / LAMPORTS_PER_SOL} SOL`);
              } else {
                failedClosures++;
                console.log(`  -> Failed to close: ${closeResult.error}`);
              }
              
              // Add delay between closures
              await this.sleep(2000);
            } else {
              console.log(`  Skipping token account ${tokenAccount.pubkey.toString()} - cannot close (balance: ${balance / LAMPORTS_PER_SOL} SOL, rent exempt: ${rentExemptBalance / LAMPORTS_PER_SOL} SOL)`);
            }
          }
        }
      }
    }

    const summary: RentCollectionSummary = {
      totalWallets: wallets.length,
      successfulCollections: successfulClosures,
      totalRentCollected: totalRentRecovered,
      failedCollections: failedClosures,
      results
    };

    console.log('\n=== Token Account Closing Summary ===');
    console.log(`Total wallets processed: ${summary.totalWallets}`);
    console.log(`Successful closures: ${summary.successfulCollections}`);
    console.log(`Failed closures: ${summary.failedCollections}`);
    console.log(`Total rent recovered: ${summary.totalRentCollected / LAMPORTS_PER_SOL} SOL`);

    return summary;
  }

  /**
   * Transfer SOL from a wallet to the fee payer using fee payer for transaction fees
   */
  private async transferSolToFeePayer(
    fromKeypair: Keypair,
    amount: number
  ): Promise<{ success: boolean; amountTransferred: number; error?: string }> {
    try {
      if (!this.feePayerKeypair) {
        return {
          success: false,
          amountTransferred: 0,
          error: 'Fee payer not set'
        };
      }

      // Transfer the full amount since fee payer covers transaction fees
      const transferAmount = amount;
      
      if (transferAmount <= 0) {
        return {
          success: false,
          amountTransferred: 0,
          error: 'No SOL to transfer'
        };
      }

      console.log(`    Transferring ${transferAmount / LAMPORTS_PER_SOL} SOL to fee payer (fee payer covers transaction fees)`);

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: this.feePayerKeypair.publicKey,
          lamports: transferAmount
        })
      );

      // Set fee payer
      transaction.feePayer = this.feePayerKeypair.publicKey;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Sign with both source wallet and fee payer
      transaction.sign(fromKeypair, this.feePayerKeypair);
      
      const signature = await this.retryWithBackoff(async () => {
        return await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [fromKeypair, this.feePayerKeypair!]
        );
      });

      console.log(`    Successfully transferred ${transferAmount / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Transaction signature: ${signature}`);

      return {
        success: true,
        amountTransferred: transferAmount,
        error: undefined
      };
    } catch (error) {
      console.error(`Error transferring SOL:`, error);
      return {
        success: false,
        amountTransferred: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer SOL balances from wallets to fee payer
   */
  async transferSolBalances(): Promise<RentCollectionSummary> {
    if (!this.feePayerKeypair) {
      throw new Error('Fee payer not set. Call setFeePayer() first.');
    }

    const wallets = this.walletManager.getWallets();
    const results: RentCollectionResult[] = [];
    let totalSolTransferred = 0;
    let successfulTransfers = 0;
    let failedTransfers = 0;

    console.log('Starting SOL balance transfer process...');

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      
      // Only transfer from wallets that have SOL and no rent to collect
      if (wallet.balance > 0.00001 * LAMPORTS_PER_SOL && (!wallet.canClose || wallet.rentAmount === 0)) {
        const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
        // const publicKey = keypair.publicKey; // Unused variable

        console.log(`\n--- Transferring SOL from Wallet ${i + 1} ---`);
        console.log(`Wallet ${i + 1}: Balance = ${wallet.balance / LAMPORTS_PER_SOL} SOL`);
        
        const transferResult = await this.transferSolToFeePayer(keypair, wallet.balance);
        
        if (transferResult.success) {
          successfulTransfers++;
          totalSolTransferred += transferResult.amountTransferred;
          console.log(`  -> Successfully transferred ${transferResult.amountTransferred / LAMPORTS_PER_SOL} SOL`);
        } else {
          failedTransfers++;
          console.log(`  -> Failed to transfer: ${transferResult.error}`);
        }
        
        // Add delay between transfers
        await this.sleep(1000);
      }
    }

    const summary: RentCollectionSummary = {
      totalWallets: wallets.length,
      successfulCollections: successfulTransfers,
      totalRentCollected: totalSolTransferred,
      failedCollections: failedTransfers,
      results
    };

    console.log('\n=== SOL Transfer Summary ===');
    console.log(`Total wallets processed: ${summary.totalWallets}`);
    console.log(`Successful transfers: ${summary.successfulCollections}`);
    console.log(`Failed transfers: ${summary.failedCollections}`);
    console.log(`Total SOL transferred: ${summary.totalRentCollected / LAMPORTS_PER_SOL} SOL`);

    return summary;
  }

  /**
   * Process a single wallet completely - close token accounts and transfer SOL
   */
  async processWalletCompletely(walletIndex: number): Promise<{
    tokenAccountsClosed: number;
    rentRecovered: number;
    solTransferred: number;
    totalRecovered: number;
  }> {
    if (!this.feePayerKeypair) {
      throw new Error('Fee payer not set. Call setFeePayer() first.');
    }

    const wallets = this.walletManager.getWallets();
    const wallet = wallets[walletIndex];
    
    if (!wallet) {
      throw new Error(`Wallet ${walletIndex} not found`);
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const publicKey = keypair.publicKey;

    console.log(`\n=== Processing Wallet ${walletIndex + 1} ===`);
    console.log(`Wallet ${walletIndex + 1}: ${publicKey.toString()}`);
    console.log(`Initial balance: ${wallet.balance / LAMPORTS_PER_SOL} SOL`);

    let tokenAccountsClosed = 0;
    let rentRecovered = 0;
    let solTransferred = 0;

    // Step 1: Check for token accounts with rent
    console.log(`\n--- Step 1: Checking for token accounts with rent ---`);
    const tokenAccounts = await this.getTokenAccounts(publicKey);
    
    if (tokenAccounts.length > 0) {
      console.log(`Found ${tokenAccounts.length} token accounts`);
      
      for (const tokenAccount of tokenAccounts) {
        const accountInfo = tokenAccount.account;
        const balance = accountInfo.lamports;
        
        if (accountInfo.data) {
          const rentExemptBalance = await this.calculateRentExemptBalance(accountInfo);
          const rentAmount = this.calculateRentAmount(balance, rentExemptBalance);
          
          console.log(`  Token account ${tokenAccount.pubkey.toString()}: Balance=${balance / LAMPORTS_PER_SOL} SOL, Rent exempt=${rentExemptBalance / LAMPORTS_PER_SOL} SOL, Rent amount=${rentAmount / LAMPORTS_PER_SOL} SOL`);
          
          if (this.canCloseAccount(balance, rentExemptBalance)) {
            console.log(`  -> This token account has rent to collect: ${rentAmount / LAMPORTS_PER_SOL} SOL`);
            
            // Step 2: Close the token account
            console.log(`  --- Closing token account ---`);
            const closeResult = await this.closeTokenAccount(
              tokenAccount.pubkey,
              keypair,
              this.feePayerKeypair.publicKey
            );
            
            if (closeResult.success) {
              tokenAccountsClosed++;
              rentRecovered += closeResult.rentRecovered;
              console.log(`  -> Successfully closed and recovered ${closeResult.rentRecovered / LAMPORTS_PER_SOL} SOL`);
            } else {
              console.log(`  -> Failed to close: ${closeResult.error}`);
            }
            
            // Add delay between closures
            await this.sleep(1000);
          } else {
            console.log(`  -> No rent to collect from this account`);
          }
        }
      }
    } else {
      console.log(`No token accounts found`);
    }

    // Step 3: Burn any remaining SPL tokens
    console.log(`\n--- Step 2: Burning any remaining SPL tokens ---`);
    const burnResult = await this.burnAllTokens(keypair);
    
    // Step 4: Check if there's remaining SOL to transfer
    console.log(`\n--- Step 3: Checking for remaining SOL balance ---`);
    
    // Get updated balance after token account closures
    const updatedBalance = await this.retryWithBackoff(async () => {
      return await this.connection.getBalance(publicKey);
    });
    
    console.log(`Updated balance after token closures: ${updatedBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (updatedBalance > 0) {
      console.log(`\n--- Step 4: Transferring remaining SOL to fee payer ---`);
      const transferResult = await this.transferSolToFeePayer(keypair, updatedBalance);
      
      if (transferResult.success) {
        solTransferred = transferResult.amountTransferred;
        console.log(`  -> Successfully transferred ${transferResult.amountTransferred / LAMPORTS_PER_SOL} SOL to fee payer`);
      } else {
        console.log(`  -> Failed to transfer SOL: ${transferResult.error}`);
      }
    } else {
      console.log(`  -> No SOL to transfer (balance is 0)`);
    }

    const totalRecovered = rentRecovered + solTransferred;

    console.log(`\n=== Wallet ${walletIndex + 1} Summary ===`);
    console.log(`Token accounts closed: ${tokenAccountsClosed}`);
    console.log(`Tokens burned: ${burnResult.tokensBurned} types, ${burnResult.totalTokensBurned} total`);
    console.log(`Rent recovered: ${rentRecovered / LAMPORTS_PER_SOL} SOL`);
    console.log(`SOL transferred: ${solTransferred / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total recovered: ${totalRecovered / LAMPORTS_PER_SOL} SOL`);

    return {
      tokenAccountsClosed,
      rentRecovered,
      solTransferred,
      totalRecovered
    };
  }

  /**
   * Process all wallets one by one
   */
  async processAllWallets(progressCallback?: (progress: { current: number; total: number; wallet: string; status: string }) => void): Promise<RentCollectionSummary> {
    if (!this.feePayerKeypair) {
      throw new Error('Fee payer not set. Call setFeePayer() first.');
    }

    const wallets = this.walletManager.getWallets();
    const results: RentCollectionResult[] = [];
    let totalTokenAccountsClosed = 0;
    let totalRentRecovered = 0;
    let totalSolTransferred = 0;
    let totalRecovered = 0;
    let successfulWallets = 0;
    let failedWallets = 0;

    console.log(`\n=== Processing ${wallets.length} wallets ===`);

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const walletAddress = wallet.publicKey;
      
      try {
        // Send progress update
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: wallets.length,
            wallet: walletAddress,
            status: 'Processing wallet...'
          });
        }

        const walletResult = await this.processWalletCompletely(i);
        
        totalTokenAccountsClosed += walletResult.tokenAccountsClosed;
        totalRentRecovered += walletResult.rentRecovered;
        totalSolTransferred += walletResult.solTransferred;
        totalRecovered += walletResult.totalRecovered;
        successfulWallets++;

        // Send success progress update
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: wallets.length,
            wallet: walletAddress,
            status: `Collected ${(walletResult.totalRecovered / LAMPORTS_PER_SOL).toFixed(4)} SOL`
          });
        }

        // Add delay between wallets
        if (i < wallets.length - 1) {
          console.log(`\nWaiting 1.5 seconds before next wallet...`);
          await this.sleep(1500);
        }
      } catch (error) {
        console.error(`Error processing wallet ${i + 1}:`, error);
        failedWallets++;
        
        // Send error progress update
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: wallets.length,
            wallet: walletAddress,
            status: 'Failed to process'
          });
        }
      }
    }

    const summary: RentCollectionSummary = {
      totalWallets: wallets.length,
      successfulCollections: successfulWallets,
      totalRentCollected: totalRecovered,
      failedCollections: failedWallets,
      results
    };

    console.log('\n=== Final Summary ===');
    console.log(`Total wallets processed: ${summary.totalWallets}`);
    console.log(`Successful wallets: ${summary.successfulCollections}`);
    console.log(`Failed wallets: ${summary.failedCollections}`);
    console.log(`Total token accounts closed: ${totalTokenAccountsClosed}`);
    console.log(`Total rent recovered: ${totalRentRecovered / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total SOL transferred: ${totalSolTransferred / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total recovered: ${summary.totalRentCollected / LAMPORTS_PER_SOL} SOL`);

    return summary;
  }

  /**
   * Burn all SPL tokens from a wallet
   */
  private async burnAllTokens(walletKeypair: Keypair): Promise<{ tokensBurned: number; totalTokensBurned: number }> {
    if (!this.feePayerKeypair) {
      return { tokensBurned: 0, totalTokensBurned: 0 };
    }

    let tokensBurned = 0;
    let totalTokensBurned = 0;

    try {
      console.log(`    Checking for SPL tokens to burn...`);
      
      // Get all token accounts for this wallet
      const tokenAccounts = await this.getTokenAccounts(walletKeypair.publicKey);
      
      for (const tokenAccount of tokenAccounts) {
        try {
          // Determine if this is a Token-2022 account
          const isToken2022 = tokenAccount.account.owner.equals(TOKEN_2022_PROGRAM_ID);
          const programId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
          
          console.log(`    Processing ${isToken2022 ? 'Token-2022' : 'Token'} account: ${tokenAccount.pubkey.toString()}`);
          
          // For Token-2022 accounts, we need to use a different approach since we can't use getAccount
          // Let's try to get the account info directly
          const accountInfo = await this.connection.getAccountInfo(tokenAccount.pubkey);
          
          if (!accountInfo) {
            console.log(`    Account not found: ${tokenAccount.pubkey.toString()}`);
            continue;
          }
          
          // Parse the token account data to get amount and mint
          // Token account data structure: [mint(32)][owner(32)][amount(8)][delegate(32)][state(1)][is_native(1)][delegated_amount(8)][close_authority(32)]
          const data = accountInfo.data;
          if (data.length < 165) {
            console.log(`    Invalid token account data length: ${data.length}`);
            continue;
          }
          
          const mint = new PublicKey(data.slice(0, 32));
          // const owner = new PublicKey(data.slice(32, 64)); // Unused variable
          const amount = data.readBigUInt64LE(64);
          
          // Check if account has tokens
          if (amount > 0) {
            console.log(`    Found ${amount} tokens of mint ${mint.toString()}`);
            

            
            console.log(`    Burning ${amount} tokens from ${tokenAccount.pubkey.toString()}`);
            
            // Create burn instruction with the correct program ID
            const burnInstruction = createBurnInstruction(
              tokenAccount.pubkey,
              mint,
              walletKeypair.publicKey,
              amount,
              [],
              programId
            );

            // Create transaction
            const transaction = new Transaction().add(burnInstruction);
            transaction.feePayer = this.feePayerKeypair.publicKey;
            
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;

            // Sign with both wallet and fee payer
            transaction.sign(walletKeypair, this.feePayerKeypair);
            
            const signature = await this.retryWithBackoff(async () => {
              return await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [walletKeypair, this.feePayerKeypair!]
              );
            });

            console.log(`    Successfully burned ${amount} tokens`);
            console.log(`    Burn transaction signature: ${signature}`);
            
            tokensBurned++;
            totalTokensBurned += Number(amount);
            
            // Add small delay between burns
            await this.sleep(500);
          } else {
            console.log(`    No tokens to burn in ${tokenAccount.pubkey.toString()}`);
          }
        } catch (error) {
          console.log(`    Failed to burn tokens from ${tokenAccount.pubkey.toString()}: ${error}`);
        }
      }
      
      if (tokensBurned === 0) {
        console.log(`    No tokens found to burn`);
      } else {
        console.log(`    Burned ${tokensBurned} token types, ${totalTokensBurned} total tokens`);
      }
      
    } catch (error) {
      console.error(`Error burning tokens:`, error);
    }

    return { tokensBurned, totalTokensBurned };
  }
} 