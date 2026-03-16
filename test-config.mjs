import { AllSetProvider } from './dist/index.js';

const allset = new AllSetProvider({ network: 'testnet' });

console.log('Network config:', JSON.stringify(allset.getNetworkConfig(), null, 2));
console.log('\nArbitrum token config:', JSON.stringify(allset.getTokenConfig('arbitrum', 'USDC'), null, 2));
