import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from './dist/index.js';

const FAST_KEYFILE = process.env.HOME + '/.fast/keys/test-wallet.json';
const EVM_ADDRESS = '0x4e94048ab8fd1a0f5d81ff458ca566198ce4c650';

async function main() {
  console.log('Setting up...');
  
  const fastProvider = new FastProvider({ network: 'testnet' });
  const fastWallet = await FastWallet.fromKeyfile(FAST_KEYFILE, fastProvider);
  const allset = new AllSetProvider({ network: 'testnet' });
  
  console.log('Fast Address:', fastWallet.address);
  console.log('EVM Address:', EVM_ADDRESS);
  
  console.log('\nWithdrawing 0.000001 testUSDC from Fast to Ethereum Sepolia...');
  
  const result = await allset.sendToExternal({
    chain: 'ethereum',
    token: 'USDC',
    amount: '1', // 0.000001 USDC (6 decimals)
    from: fastWallet.address,
    to: EVM_ADDRESS,
    fastWallet,
  });
  
  console.log('\nSuccess!');
  console.log('TX Hash:', result.txHash);
  console.log('Order ID:', result.orderId);
  console.log('Estimated Time:', result.estimatedTime);
}

main().catch(err => {
  console.error('\nError:', err.message);
  if (err.code) console.error('Code:', err.code);
  if (err.context) console.error('Context:', JSON.stringify(err.context, null, 2));
});
