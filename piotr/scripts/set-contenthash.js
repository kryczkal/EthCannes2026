#!/usr/bin/env node

import { zeroAddress } from 'viem';
import { namehash, normalize } from 'viem/ens';
import { ensRegistryAbi, nameWrapperAbi, publicResolverAbi } from '../lib/abi.js';
import { createEnsClients, decodeIpfsContenthash, encodeIpfsContenthash } from '../lib/ens.js';

const name = process.argv[2];
const cid = process.argv[3];

if (!name || !cid) {
  console.error('Usage: node --env-file=.env scripts/set-contenthash.js <name.eth> <ipfs-cid>');
  process.exit(1);
}

const { publicClient, walletClient, account, addresses } = createEnsClients();

if (!walletClient || !account) {
  console.error('SEPOLIA_PRIVATE_KEY is required.');
  process.exit(1);
}

const normalizedName = normalize(name);
const node = namehash(normalizedName);

const owner = await publicClient.readContract({
  address: addresses.registry,
  abi: ensRegistryAbi,
  functionName: 'owner',
  args: [node]
});

if (!owner || owner === zeroAddress) {
  console.error(`ENS name ${normalizedName} is not registered on Sepolia.`);
  process.exit(1);
}

const wrapped = owner.toLowerCase() === addresses.nameWrapper.toLowerCase();

let resolver = await publicClient.readContract({
  address: addresses.registry,
  abi: ensRegistryAbi,
  functionName: 'resolver',
  args: [node]
});

if (resolver === zeroAddress) {
  const setResolverHash = await walletClient.writeContract({
    account,
    address: wrapped ? addresses.nameWrapper : addresses.registry,
    abi: wrapped ? nameWrapperAbi : ensRegistryAbi,
    functionName: 'setResolver',
    args: [node, addresses.publicResolver]
  });

  await publicClient.waitForTransactionReceipt({ hash: setResolverHash });
  resolver = addresses.publicResolver;
  console.log(`resolver tx: ${setResolverHash}`);
}

const contenthash = encodeIpfsContenthash(cid);
const setContenthashHash = await walletClient.writeContract({
  account,
  address: resolver,
  abi: publicResolverAbi,
  functionName: 'setContenthash',
  args: [node, contenthash]
});

await publicClient.waitForTransactionReceipt({ hash: setContenthashHash });

const storedContenthash = await publicClient.readContract({
  address: resolver,
  abi: publicResolverAbi,
  functionName: 'contenthash',
  args: [node]
});

console.log(`name: ${normalizedName}`);
console.log(`resolver: ${resolver}`);
console.log(`tx: ${setContenthashHash}`);
console.log(`stored contenthash: ${storedContenthash}`);
console.log(`decoded: ${decodeIpfsContenthash(storedContenthash)}`);
console.log(`gateway: https://gateway.pinata.cloud/ipfs/${cid}`);
