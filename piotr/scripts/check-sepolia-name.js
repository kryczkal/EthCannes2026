#!/usr/bin/env node

import { createPublicClient, http, zeroAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { namehash, normalize } from 'viem/ens';
import { ensRegistryAbi, publicResolverAbi } from '../lib/abi.js';
import { decodeIpfsContenthash } from '../lib/ens.js';

const name = process.argv[2];

if (!name) {
  console.error('Usage: node scripts/check-sepolia-name.js <name.eth>');
  process.exit(1);
}

if (!process.env.SEPOLIA_RPC_URL) {
  console.error('SEPOLIA_RPC_URL is required.');
  process.exit(1);
}

const registry = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL)
});

const normalizedName = normalize(name);
const node = namehash(normalizedName);

const owner = await client.readContract({
  address: registry,
  abi: ensRegistryAbi,
  functionName: 'owner',
  args: [node]
});

const resolver = await client.readContract({
  address: registry,
  abi: ensRegistryAbi,
  functionName: 'resolver',
  args: [node]
});

console.log(`name: ${normalizedName}`);
console.log(`node: ${node}`);
console.log(`owner: ${owner}`);
console.log(`resolver: ${resolver}`);

if (resolver === zeroAddress) {
  console.log('contenthash: <none>');
  process.exit(0);
}

const contenthash = await client.readContract({
  address: resolver,
  abi: publicResolverAbi,
  functionName: 'contenthash',
  args: [node]
});

console.log(`contenthash: ${contenthash}`);

if (!contenthash || contenthash === '0x') {
  console.log('decoded: <none>');
  process.exit(0);
}

try {
  const decoded = decodeIpfsContenthash(contenthash);
  console.log(`decoded: ${decoded}`);
  console.log(`gateway: https://gateway.pinata.cloud/ipfs/${decoded}`);
} catch (error) {
  console.log(
    `decoded: <failed> ${error instanceof Error ? error.message : String(error)}`
  );
}
