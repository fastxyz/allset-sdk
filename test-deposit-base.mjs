import { AllSetProvider, createEvmExecutor, createEvmWallet } from './dist/index.js';

const FAST_ADDRESS = 'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv';
const EVM_KEYFILE = process.env.HOME + '/.evm/keys/test-wallet.json';

async function main() {
  console.log('Setting up...');
  
  const allset = new AllSetProvider({ network: 'testnet' });
  const account = createEvmWallet(EVM_KEYFILE);
  
  console.log('EVM Address:', account.address);
  console.log('Fast Address:', FAST_ADDRESS);
  
  // Base mainnet RPC
  const rpcUrl = 'https://mainnet.base.org';
  const chainId = 8453;
  
  const evmClients = createEvmExecutor(account, rpcUrl, chainId);
  
  console.log('\nDepositing 0.000001 USDC from Base to Fast...');
  
  const result = await allset.sendToFast({
    chain: 'base',
    token: 'USDC',
    amount: '1', // 0.000001 USDC (6 decimals)
    from: account.address,
    to: FAST_ADDRESS,
    evmClients,
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
