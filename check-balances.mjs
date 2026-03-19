import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia, sepolia, base } from 'viem/chains';

const EVM_ADDRESS = '0x1253537Cd5848424C920DD54Ce6DFeBD75EDC471';
const FAST_ADDRESS = 'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const USDC_ADDRESSES = {
  'Ethereum Sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'Arbitrum Sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'Base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const CHAINS = {
  'Ethereum Sepolia': { chain: sepolia, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  'Arbitrum Sepolia': { chain: arbitrumSepolia, rpc: 'https://sepolia-rollup.arbitrum.io/rpc' },
  'Base': { chain: base, rpc: 'https://mainnet.base.org' },
};

// Check Fast balance
async function checkFastBalance() {
  const testUsdcId = '9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8';
  const fastUsdcId = 'b4fdab846372740f747eb4b64ac0c22eaa159113f2d35b075027065fba419365';
  
  const res = await fetch('https://testnet.api.fast.xyz/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'fast_getBalance',
      params: { address: FAST_ADDRESS }
    })
  });
  const data = await res.json();
  console.log('Fast Network:', FAST_ADDRESS);
  if (data.result) {
    for (const [tokenId, balance] of Object.entries(data.result)) {
      const balNum = typeof balance === 'string' && balance.startsWith('0x') 
        ? parseInt(balance, 16) : Number(balance);
      const formatted = (balNum / 1e6).toFixed(6);
      let tokenName = tokenId;
      if (tokenId === testUsdcId) tokenName = 'testUSDC';
      if (tokenId === fastUsdcId) tokenName = 'fastUSDC';
      console.log(`  ${tokenName}: ${formatted}`);
    }
  } else {
    console.log('  No balances or error:', data.error?.message || 'unknown');
  }
}

// Check EVM balances
async function checkEvmBalances() {
  console.log('\nEVM Address:', EVM_ADDRESS);
  for (const [name, config] of Object.entries(CHAINS)) {
    try {
      const client = createPublicClient({ chain: config.chain, transport: http(config.rpc) });
      const balance = await client.readContract({
        address: USDC_ADDRESSES[name],
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [EVM_ADDRESS],
      });
      console.log(`  ${name} USDC: ${(Number(balance) / 1e6).toFixed(6)}`);
    } catch (e) {
      console.log(`  ${name} USDC: error - ${e.message}`);
    }
  }
}

await checkFastBalance();
await checkEvmBalances();
