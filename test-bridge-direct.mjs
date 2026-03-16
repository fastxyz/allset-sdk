import { AllSetProvider } from './dist/index.js';
import { FastWallet, FastProvider } from '@fastxyz/sdk';
import fs from 'fs';

// Load buyer Fast wallet
const fastKeyPath = process.env.HOME + '/.money/keys/fast-buyer.json';
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));

console.log('Creating Fast wallet...');
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromPrivateKey(fastKey.privateKey, fastProvider);
console.log('Fast wallet address:', fastWallet.address);

// Check balance
const tokenId = '7f0d656c48ebdc13e08524d5718e4206ef8d8efc7c811d6921dae1ef1a15110f';
const balance = await fastProvider.getBalance(fastWallet.address, tokenId);
console.log('Fast balance:', balance);

// Bridge a small amount
const allset = new AllSetProvider({ network: 'testnet' });
const evmReceiver = '0x4e94048ab8fD1A0f5D81ff458CA566198ce4C650';

console.log('\nBridging 0.02 testUSDC to Arbitrum Sepolia...');
console.log('From:', fastWallet.address);
console.log('To:', evmReceiver);

try {
  const result = await allset.sendToExternal({
    chain: 'arbitrum',
    token: 'testUSDC',
    amount: '20000', // 0.02 USDC (6 decimals)
    from: fastWallet.address,
    to: evmReceiver,
    fastWallet: fastWallet,
  });
  
  console.log('\n✅ Bridge successful!');
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('\n❌ Bridge failed:', error.message);
  if (error.stack) console.error('Stack:', error.stack);
}
