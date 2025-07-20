import * as fs from 'fs';
import * as path from 'path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { WalletInfo } from './types';

export class WalletManager {
  private wallets: WalletInfo[] = [];

  /**
   * Load private keys from a text file
   * Supports multiple formats:
   * 1. Simple format: one private key per line
   * 2. Structured format: PRIVATE KEYS section, WALLET ADDRESSES section, or PRIVATE KEYS / ADDRESS pairs
   * 
   * @param filePath Path to the wallet file
   * @param clearExisting If true, clears existing wallets before loading new ones
   */
  async loadWalletsFromFile(filePath: string, clearExisting: boolean = false): Promise<WalletInfo[]> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Wallet file not found: ${absolutePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      let privateKeys: string[] = [];
      let walletAddresses: string[] = [];

      // Check if this is a structured format
      const hasPrivateKeysSection = content.includes('PRIVATE KEYS:');
      const hasWalletAddressesSection = content.includes('WALLET ADDRESSES:');
      const hasPrivateKeysAddressSection = content.includes('PRIVATE KEYS / ADDRESS:');

      if (hasPrivateKeysSection || hasWalletAddressesSection || hasPrivateKeysAddressSection) {
        // Parse structured format
        let currentSection = '';
        
        for (const line of lines) {
          if (line === 'PRIVATE KEYS:' || line === 'WALLET ADDRESSES:' || line === 'PRIVATE KEYS / ADDRESS:') {
            currentSection = line;
            continue;
          }

          if (currentSection === 'PRIVATE KEYS:') {
            // Add to private keys if it looks like a base58 private key
            if (line.length >= 80 && line.length <= 90) {
              privateKeys.push(line);
            }
          } else if (currentSection === 'WALLET ADDRESSES:') {
            // Add to wallet addresses if it looks like a base58 public key
            if (line.length >= 40 && line.length <= 50) {
              walletAddresses.push(line);
            }
          } else if (currentSection === 'PRIVATE KEYS / ADDRESS:') {
            // Parse pairs of private key and address
            if (line.length >= 80 && line.length <= 90) {
              // This is a private key, next line should be the address
              privateKeys.push(line);
            } else if (line.length >= 40 && line.length <= 50 && privateKeys.length > 0) {
              // This is an address, associate it with the last private key
              walletAddresses.push(line);
            }
          }
        }

        console.log(`Found ${privateKeys.length} private keys and ${walletAddresses.length} wallet addresses in structured format`);
      } else {
        // Simple format: assume all lines are private keys
        privateKeys = lines.filter(line => line.length >= 80 && line.length <= 90);
        console.log(`Found ${privateKeys.length} private keys in simple format`);
      }

      if (privateKeys.length === 0) {
        throw new Error('No valid private keys found in file');
      }

      // If clearExisting is true, reset the wallets array
      if (clearExisting) {
        this.wallets = [];
      }

      // Remove duplicates based on private keys and public keys
      const uniqueWallets = new Map<string, { privateKey: string; publicKey: string }>();
      const duplicates: string[] = [];

      // Add existing wallets to the map to prevent duplicates
      this.wallets.forEach(wallet => {
        uniqueWallets.set(wallet.publicKey, { privateKey: wallet.privateKey, publicKey: wallet.publicKey });
      });

      for (const privateKey of privateKeys) {
        try {
          const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
          const publicKey = keypair.publicKey.toString();
          
          // Check for duplicates by public key
          if (uniqueWallets.has(publicKey)) {
            const existing = uniqueWallets.get(publicKey)!;
            if (existing.privateKey !== privateKey) {
              console.warn(`Warning: Different private keys found for same public key ${publicKey}`);
            }
            duplicates.push(publicKey);
            continue;
          }

          // Check for duplicates by private key
          const existingByPrivateKey = Array.from(uniqueWallets.values()).find(w => w.privateKey === privateKey);
          if (existingByPrivateKey) {
            console.warn(`Warning: Duplicate private key found for public key ${publicKey}`);
            duplicates.push(publicKey);
            continue;
          }

          uniqueWallets.set(publicKey, { privateKey, publicKey });
        } catch (error) {
          console.error(`Invalid private key: ${error}`);
          throw new Error(`Invalid private key: ${error}`);
        }
      }

      if (duplicates.length > 0) {
        console.log(`Removed ${duplicates.length} duplicate wallets: ${duplicates.join(', ')}`);
      }

      this.wallets = Array.from(uniqueWallets.values()).map(({ privateKey, publicKey }) => {
        // If we have wallet addresses from structured format, verify they match
        const index = privateKeys.indexOf(privateKey);
        if (walletAddresses.length > index) {
          const providedAddress = walletAddresses[index];
          if (providedAddress !== publicKey) {
            console.warn(`Warning: Provided address ${providedAddress} doesn't match private key's public key ${publicKey}`);
          }
        }

        return {
          privateKey,
          publicKey,
          balance: 0,
          rentExemptBalance: 0,
          rentAmount: 0,
          canClose: false
        };
      });

      return this.wallets;
    } catch (error) {
      console.error('Error loading wallets:', error);
      throw error;
    }
  }

  /**
   * Get all loaded wallets
   */
  getWallets(): WalletInfo[] {
    return this.wallets;
  }

  /**
   * Update wallet information with current balance and rent data
   */
  updateWalletInfo(index: number, balance: number, rentExemptBalance: number, rentAmount: number, canClose: boolean): void {
    if (index >= 0 && index < this.wallets.length) {
      this.wallets[index] = {
        ...this.wallets[index],
        balance,
        rentExemptBalance,
        rentAmount,
        canClose
      };
    }
  }

  /**
   * Get wallet by index
   */
  getWallet(index: number): WalletInfo | null {
    return index >= 0 && index < this.wallets.length ? this.wallets[index] : null;
  }

  /**
   * Get total number of wallets
   */
  getWalletCount(): number {
    return this.wallets.length;
  }
} 