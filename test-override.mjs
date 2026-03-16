import { AllSetProvider } from './dist/index.js';

console.log('=== allset-sdk Config Override Test ===\n');

const allset = new AllSetProvider({ network: 'testnet' });

// Check network config
const networkConfig = allset.getNetworkConfig();
console.log('CrossSign URL:', networkConfig.crossSignUrl);
console.log('Expected: https://testnet.cross-sign.allset.fast.xyz');
console.log('Match:', networkConfig.crossSignUrl === 'https://testnet.cross-sign.allset.fast.xyz');

// Check chain config
const arbConfig = allset.getChainConfig('arbitrum');
console.log('\nArbitrum bridge:', arbConfig?.bridgeContract);
console.log('Expected: 0x1B296f9160bFB2Fa15f3F8A0567FD060dC95C4b4');
console.log('Match:', arbConfig?.bridgeContract === '0x1B296f9160bFB2Fa15f3F8A0567FD060dC95C4b4');

// Check token config
const tokenConfig = allset.getTokenConfig('arbitrum', 'USDC');
console.log('\nArbitrum USDC fastTokenId:', tokenConfig?.fastTokenId);
console.log('Expected: 7f0d656c48ebdc13e08524d5718e4206ef8d8efc7c811d6921dae1ef1a15110f');
console.log('Match:', tokenConfig?.fastTokenId === '7f0d656c48ebdc13e08524d5718e4206ef8d8efc7c811d6921dae1ef1a15110f');
