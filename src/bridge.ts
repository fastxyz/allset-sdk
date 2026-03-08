/**
 * bridge.ts — AllSet bridge provider
 *
 * Bridges between Fast chain and EVM chains (Ethereum Sepolia, Arbitrum Sepolia).
 *
 * Two directions:
 *   Deposit  (EVM → Fast): call bridge.deposit(token, amount, receiver) on the EVM bridge contract
 *   Withdraw (Fast → EVM): transfer on Fast chain + submit ExternalClaim intent + POST to relayer
 */

import { bech32m } from 'bech32';
import { encodeAbiParameters, encodeFunctionData, hashMessage } from 'viem';
import { FastError } from './fast-compat.js';
import type { BridgeProvider, AllSetChainConfig, AllSetTokenInfo } from './types.js';

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

const FAST_USDC_TOKEN_ID = hexToUint8Array('1b48766165f2cc84292d8c06b0523e1eefd7586049be0f82249c002f88a409ef');
const FAST_USDC_TOKEN_HEX = '1b48766165f2cc84292d8c06b0523e1eefd7586049be0f82249c002f88a409ef';

const CHAIN_CONFIGS: Record<string, AllSetChainConfig> = {
  ethereum: {
    chainId: 11155111,
    bridgeContract: '0x38b48764f6B12e1Dd5e4f8391d06d34Ba3920201',
    fastsetBridgeAddress: 'fast19cjwajufyuqv883ydlvrp8xrhxejuvfe40pxq5dsrv675zgh89sqg9txs8',
    relayerUrl: 'https://staging.omniset.fastset.xyz/ethereum-sepolia-relayer/relay',
  },
  arbitrum: {
    chainId: 421614,
    bridgeContract: '0xBb9111E62c9EE364cF6dc676d754602a2E259bd3',
    fastsetBridgeAddress: 'fast1pz07pdlspsydyt2g79yeshunhfyjsr5j4ahuyfv8hpdn00ks8u6q8axf9t',
    relayerUrl: 'https://staging.omniset.fastset.xyz/arbitrum-sepolia-relayer/relay',
  },
};

const CHAIN_TOKENS: Record<string, Record<string, AllSetTokenInfo>> = {
  arbitrum: {
    USDC: {
      evmAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      fastsetTokenId: FAST_USDC_TOKEN_ID,
      decimals: 6,
      isNative: false,
    },
    fastUSDC: {
      evmAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      fastsetTokenId: FAST_USDC_TOKEN_ID,
      decimals: 6,
      isNative: false,
    },
  },
};

function resolveAllSetToken(token: string, evmChain: string): AllSetTokenInfo | null {
  const chainTokens = CHAIN_TOKENS[evmChain];
  if (!chainTokens) return null;

  const upper = token.toUpperCase();
  if (chainTokens[upper]) return chainTokens[upper]!;

  if (chainTokens[token]) return chainTokens[token]!;

  const clean = token.startsWith('0x') ? token.slice(2).toLowerCase() : token.toLowerCase();
  if (clean === FAST_USDC_TOKEN_HEX) return chainTokens.USDC ?? null;

  for (const info of Object.values(chainTokens)) {
    if (info.evmAddress.toLowerCase() === token.toLowerCase()) return info;
  }

  return null;
}

function fastAddressToBytes32(address: string): `0x${string}` {
  const { words } = bech32m.decode(address, 90);
  const bytes = new Uint8Array(bech32m.fromWords(words));
  return `0x${Buffer.from(bytes).toString('hex')}` as `0x${string}`;
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const BRIDGE_DEPOSIT_ABI = [{
  type: 'function' as const,
  name: 'deposit' as const,
  inputs: [
    { name: 'token', type: 'address' as const },
    { name: 'amount', type: 'uint256' as const },
    { name: 'receiver', type: 'bytes32' as const },
  ],
  outputs: [],
  stateMutability: 'payable' as const,
}];

export const allsetProvider: BridgeProvider = {
  name: 'allset',
  chains: ['fast', 'ethereum', 'arbitrum'],
  networks: ['testnet'],

  async bridge(params): Promise<{ txHash: string; orderId: string; estimatedTime?: string }> {
    try {
      const isDeposit = params.fromChain !== 'fast' && params.toChain === 'fast';
      const isWithdraw = params.fromChain === 'fast';

      if (!isDeposit && !isWithdraw) {
        throw new FastError(
          'UNSUPPORTED_OPERATION',
          `AllSet only supports bridging between Fast chain and EVM chains (ethereum, arbitrum). Got: ${params.fromChain} → ${params.toChain}`,
          {
            note: 'Use fromChain: "fast" for withdrawals, or toChain: "fast" for deposits.\n  Example: await allset.bridge({ fromChain: "ethereum", toChain: "fast", fromToken: "USDC", toToken: "fastUSDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
          },
        );
      }

      if (isDeposit) {
        if (!params.evmExecutor) {
          throw new FastError(
            'INVALID_PARAMS',
            'AllSet deposit (EVM → Fast) requires evmExecutor',
            {
              note: 'Provide an evmExecutor created with createEvmExecutor().\n  Example: const executor = createEvmExecutor(privateKey, rpcUrl, chainId)',
            },
          );
        }

        const chainConfig = CHAIN_CONFIGS[params.fromChain];
        if (!chainConfig) {
          throw new FastError(
            'UNSUPPORTED_OPERATION',
            `AllSet does not support EVM chain "${params.fromChain}". Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`,
            {
              note: 'Use "ethereum" or "arbitrum" as the source chain for AllSet deposits.',
            },
          );
        }

        let tokenInfo = resolveAllSetToken(params.fromToken, params.fromChain);
        if (!tokenInfo) {
          tokenInfo = resolveAllSetToken(params.toToken, params.fromChain);
        }
        if (!tokenInfo) {
          throw new FastError(
            'TOKEN_NOT_FOUND',
            `Cannot resolve token "${params.fromToken}" on AllSet for chain "${params.fromChain}".`,
            {
              note: 'Supported tokens: USDC, fastUSDC.\n  Example: await allset.bridge({ fromChain: "arbitrum", toChain: "fast", fromToken: "USDC", toToken: "fastUSDC", amount: "1000000", senderAddress: "0x...", receiverAddress: "fast1..." })',
            },
          );
        }

        let receiverBytes32: `0x${string}`;
        try {
          receiverBytes32 = fastAddressToBytes32(params.receiverAddress);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new FastError(
            'INVALID_ADDRESS',
            `Failed to decode Fast chain receiver address "${params.receiverAddress}": ${msg}`,
            {
              note: 'The receiver address must be a valid Fast chain bech32m address (fast1...).\n  Example: fast1abc...',
            },
          );
        }

        const calldata = encodeFunctionData({
          abi: BRIDGE_DEPOSIT_ABI,
          functionName: 'deposit',
          args: [
            tokenInfo.evmAddress as `0x${string}`,
            BigInt(params.amount),
            receiverBytes32,
          ],
        });

        let txHash: string;

        if (tokenInfo.isNative) {
          const receipt = await params.evmExecutor.sendTx({
            to: chainConfig.bridgeContract,
            data: calldata,
            value: params.amount,
          });
          if (receipt.status === 'reverted') {
            throw new FastError(
              'TX_FAILED',
              `AllSet deposit transaction reverted: ${receipt.txHash}`,
              {
                note: 'The deposit transaction was reverted. Check that you have sufficient ETH balance.',
              },
            );
          }
          txHash = receipt.txHash;
        } else {
          const requiredAmount = BigInt(params.amount);
          const currentAllowance = await params.evmExecutor.checkAllowance(
            tokenInfo.evmAddress,
            chainConfig.bridgeContract,
            params.senderAddress,
          );
          if (currentAllowance < requiredAmount) {
            await params.evmExecutor.approveErc20(
              tokenInfo.evmAddress,
              chainConfig.bridgeContract,
              params.amount,
            );
          }

          const receipt = await params.evmExecutor.sendTx({
            to: chainConfig.bridgeContract,
            data: calldata,
            value: '0',
          });
          if (receipt.status === 'reverted') {
            throw new FastError(
              'TX_FAILED',
              `AllSet deposit transaction reverted: ${receipt.txHash}`,
              {
                note: 'The deposit transaction was reverted. Check that you have sufficient token balance and the approval succeeded.',
              },
            );
          }
          txHash = receipt.txHash;
        }

        return {
          txHash,
          orderId: txHash,
          estimatedTime: '1-5 minutes',
        };
      }

      if (!params.fastClient) {
        throw new FastError(
          'INVALID_PARAMS',
          'AllSet withdrawal (Fast → EVM) requires fastClient',
          {
            note: 'Provide a compatible FastClient implementation with submit() and evmSign().',
          },
        );
      }

      const chainConfig = CHAIN_CONFIGS[params.toChain];
      if (!chainConfig) {
        throw new FastError(
          'UNSUPPORTED_OPERATION',
          `AllSet does not support EVM destination chain "${params.toChain}". Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`,
          {
            note: 'Use "ethereum" or "arbitrum" as the destination chain for AllSet withdrawals.',
          },
        );
      }

      let tokenInfo = resolveAllSetToken(params.fromToken, params.toChain);
      if (!tokenInfo) {
        tokenInfo = resolveAllSetToken(params.toToken, params.toChain);
      }
      if (!tokenInfo) {
        throw new FastError(
          'TOKEN_NOT_FOUND',
          `Cannot resolve token "${params.fromToken}" on AllSet for destination chain "${params.toChain}".`,
          {
            note: 'Supported tokens: USDC, fastUSDC.\n  Example: await allset.bridge({ fromChain: "fast", toChain: "arbitrum", fromToken: "fastUSDC", toToken: "USDC", amount: "1000000", senderAddress: "fast1...", receiverAddress: "0x..." })',
          },
        );
      }

      const evmTokenAddress = tokenInfo.evmAddress;

      const transferResult = await params.fastClient.submit({
        recipient: chainConfig.fastsetBridgeAddress,
        claim: {
          TokenTransfer: {
            token_id: tokenInfo.fastsetTokenId,
            amount: params.amount,
            user_data: null,
          },
        },
      });

      const transferCrossSign = await params.fastClient.evmSign({
        certificate: transferResult.certificate,
      });

      const transferClaimHash = hashMessage({
        raw: new Uint8Array(transferCrossSign.transaction),
      });

      const dynamicTransferPayload = encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }],
        [
          evmTokenAddress as `0x${string}`,
          params.receiverAddress as `0x${string}`,
        ],
      );

      const intentClaimEncoded = encodeAbiParameters(
        [{
          type: 'tuple',
          components: [
            { name: 'transferClaimHash', type: 'bytes32' },
            {
              name: 'intents',
              type: 'tuple[]',
              components: [
                { name: 'action', type: 'uint8' },
                { name: 'payload', type: 'bytes' },
                { name: 'value', type: 'uint256' },
              ],
            },
          ],
        }],
        [{
          transferClaimHash: transferClaimHash as `0x${string}`,
          intents: [{
            action: 1,
            payload: dynamicTransferPayload,
            value: 0n,
          }],
        }],
      );

      const intentBytes = hexToUint8Array(intentClaimEncoded);

      const intentResult = await params.fastClient.submit({
        recipient: params.fastClient.address!,
        claim: {
          ExternalClaim: {
            claim: {
              verifier_committee: [] as Uint8Array[],
              verifier_quorum: 0,
              claim_data: Array.from(intentBytes),
            },
            signatures: [] as Array<[Uint8Array, Uint8Array]>,
          },
        },
      });

      const intentCrossSign = await params.fastClient.evmSign({
        certificate: intentResult.certificate,
      });

      const relayerBody = {
        encoded_transfer_claim: Array.from(new Uint8Array(transferCrossSign.transaction.map(Number))),
        transfer_proof: transferCrossSign.signature,
        transfer_claim_id: transferResult.txHash,
        fastset_address: params.senderAddress,
        external_address: params.receiverAddress,
        encoded_intent_claim: Array.from(new Uint8Array(intentCrossSign.transaction.map(Number))),
        intent_proof: intentCrossSign.signature,
        intent_claim_id: intentResult.txHash,
        external_token_address: evmTokenAddress,
      };

      const relayRes = await fetch(chainConfig.relayerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayerBody),
      });

      if (!relayRes.ok) {
        const text = await relayRes.text();
        throw new FastError(
          'TX_FAILED',
          `AllSet relayer request failed (${relayRes.status}): ${text}`,
          {
            note: 'The withdrawal was submitted to Fast chain but the relayer rejected it. Try again.',
          },
        );
      }

      return {
        txHash: transferResult.txHash,
        orderId: transferClaimHash,
        estimatedTime: '1-5 minutes',
      };
    } catch (err: unknown) {
      if (err instanceof FastError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new FastError(
        'TX_FAILED',
        `AllSet bridge failed: ${msg}`,
        {
          note: 'Check that both chains are configured and have sufficient balance.',
        },
      );
    }
  },
};
