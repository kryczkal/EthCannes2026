import { decode as decodeContentHash, encode as encodeContentHash } from '@ensdomains/content-hash';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  stringToHex,
  zeroAddress
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { namehash, normalize } from 'viem/ens';
import { ensRegistryAbi, nameWrapperAbi, publicResolverAbi } from './abi.js';
import {
  DEFAULT_ENS_DEPLOYMENTS,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_ROOT_DOMAIN,
  TEXT_RECORD_PREFIX
} from './constants.js';

function asAddress(address) {
  return getAddress(address);
}

function lower(value) {
  return value?.toLowerCase();
}

function requiredEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function splitName(name) {
  const normalizedName = normalize(name);
  const [label, ...rest] = normalizedName.split('.');
  return {
    normalizedName,
    label,
    parentName: rest.join('.')
  };
}

export function versionToEnsLabel(version) {
  return version.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export function packageToParentEnsName(packageName, rootDomain = DEFAULT_ROOT_DOMAIN) {
  return `${packageName}.${rootDomain}`;
}

export function packageVersionToEnsName(packageName, version, rootDomain = DEFAULT_ROOT_DOMAIN) {
  return `${versionToEnsLabel(version)}.${packageToParentEnsName(packageName, rootDomain)}`;
}

export function versionLabelToEnsName(parentName, version) {
  return `${versionToEnsLabel(version)}.${parentName}`;
}

export function buildAuditTextRecords(entry) {
  return {
    [`${TEXT_RECORD_PREFIX}.package`]: entry.packageName,
    [`${TEXT_RECORD_PREFIX}.version`]: entry.version,
    [`${TEXT_RECORD_PREFIX}.verdict`]: entry.audit.verdict,
    [`${TEXT_RECORD_PREFIX}.score`]: String(entry.audit.score),
    [`${TEXT_RECORD_PREFIX}.report_cid`]: entry.audit.reportCid ?? '',
    [`${TEXT_RECORD_PREFIX}.report_uri`]: entry.audit.reportUri ?? '',
    [`${TEXT_RECORD_PREFIX}.source_cid`]: entry.source.cid ?? '',
    [`${TEXT_RECORD_PREFIX}.source_uri`]: entry.source.ipfsUri ?? '',
    [`${TEXT_RECORD_PREFIX}.capabilities`]: entry.audit.capabilities.join(','),
    [`${TEXT_RECORD_PREFIX}.date`]: entry.audit.scannedAt
  };
}

export function buildLatestParentRecords(entry) {
  return {
    [`${TEXT_RECORD_PREFIX}.latest_version`]: entry.version,
    [`${TEXT_RECORD_PREFIX}.latest_version_name`]: versionLabelToEnsName(
      entry.parentName ?? packageToParentEnsName(entry.packageName),
      entry.version
    ),
    [`${TEXT_RECORD_PREFIX}.latest_verdict`]: entry.audit.verdict,
    [`${TEXT_RECORD_PREFIX}.latest_score`]: String(entry.audit.score),
    [`${TEXT_RECORD_PREFIX}.latest_report_cid`]: entry.audit.reportCid ?? '',
    [`${TEXT_RECORD_PREFIX}.latest_report_uri`]: entry.audit.reportUri ?? '',
    [`${TEXT_RECORD_PREFIX}.latest_source_cid`]: entry.source.cid ?? '',
    [`${TEXT_RECORD_PREFIX}.latest_source_uri`]: entry.source.ipfsUri ?? '',
    [`${TEXT_RECORD_PREFIX}.latest_capabilities`]: entry.audit.capabilities.join(','),
    [`${TEXT_RECORD_PREFIX}.latest_date`]: entry.audit.scannedAt
  };
}

export function encodeIpfsContenthash(cid) {
  return `0x${encodeContentHash('ipfs', cid)}`;
}

export function decodeIpfsContenthash(contenthashValue) {
  if (!contenthashValue || contenthashValue === '0x') {
    return null;
  }

  return decodeContentHash(contenthashValue);
}

export function createEnsClients() {
  const deployment = DEFAULT_ENS_DEPLOYMENTS.sepolia;
  const rpcUrl = requiredEnv('SEPOLIA_RPC_URL');
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const addresses = {
    registry: asAddress(process.env.ENS_REGISTRY_ADDRESS ?? deployment.registry),
    nameWrapper: asAddress(process.env.ENS_NAME_WRAPPER_ADDRESS ?? deployment.nameWrapper),
    publicResolver: asAddress(process.env.ENS_PUBLIC_RESOLVER_ADDRESS ?? deployment.publicResolver)
  };

  if (!privateKey) {
    return {
      publicClient,
      walletClient: null,
      account: null,
      addresses
    };
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  return {
    publicClient,
    walletClient,
    account,
    addresses
  };
}

async function waitForReceipt(publicClient, hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function readResolver(publicClient, registryAddress, node) {
  return publicClient.readContract({
    address: registryAddress,
    abi: ensRegistryAbi,
    functionName: 'resolver',
    args: [node]
  });
}

async function ensureResolver({ publicClient, walletClient, account, addresses, name, node, wrapped, currentResolver }) {
  if (currentResolver && currentResolver !== zeroAddress) {
    return currentResolver;
  }

  if (!walletClient || !account) {
    throw new Error(`ENS name ${name} is missing a resolver; a writable wallet client is required to set one.`);
  }

  const hash = await walletClient.writeContract({
    account,
    address: wrapped ? addresses.nameWrapper : addresses.registry,
    abi: wrapped ? nameWrapperAbi : ensRegistryAbi,
    functionName: 'setResolver',
    args: [node, addresses.publicResolver]
  });

  await waitForReceipt(publicClient, hash);
  return addresses.publicResolver;
}

async function getNameStatus({ publicClient, addresses, name }) {
  const normalizedName = normalize(name);
  const node = namehash(normalizedName);
  const owner = await publicClient.readContract({
    address: addresses.registry,
    abi: ensRegistryAbi,
    functionName: 'owner',
    args: [node]
  });
  const resolver = await readResolver(publicClient, addresses.registry, node);
  const wrapped = lower(owner) === lower(addresses.nameWrapper);
  let wrappedOwner = null;
  let expiry = null;

  if (wrapped) {
    const [resolvedOwner, , resolvedExpiry] = await publicClient.readContract({
      address: addresses.nameWrapper,
      abi: nameWrapperAbi,
      functionName: 'getData',
      args: [BigInt(node)]
    });
    wrappedOwner = resolvedOwner;
    expiry = Number(resolvedExpiry);
  }

  return {
    name: normalizedName,
    node,
    owner,
    resolver,
    wrapped,
    wrappedOwner,
    expiry
  };
}

function assertControllableName({ status, account, addresses, name }) {
  const accountAddress = lower(account.address);

  if (status.wrapped) {
    if (lower(status.wrappedOwner) !== accountAddress) {
      throw new Error(
        `ENS name ${name} is wrapped but controlled by ${status.wrappedOwner}, not ${account.address}.`
      );
    }

    return;
  }

  if (lower(status.owner) !== accountAddress) {
    throw new Error(
      `ENS name ${name} is owned by ${status.owner}, not ${account.address}.`
    );
  }
}

async function createSubname({
  publicClient,
  walletClient,
  account,
  addresses,
  parentStatus,
  label,
  resolverAddress
}) {
  const labelHash = keccak256(stringToHex(label));
  const hash = await walletClient.writeContract({
    account,
    address: parentStatus.wrapped ? addresses.nameWrapper : addresses.registry,
    abi: parentStatus.wrapped ? nameWrapperAbi : ensRegistryAbi,
    functionName: 'setSubnodeRecord',
    args: parentStatus.wrapped
      ? [
          parentStatus.node,
          label,
          account.address,
          resolverAddress,
          0,
          0,
          BigInt(parentStatus.expiry ?? Math.floor(Date.now() / 1000) + 31536000)
        ]
      : [parentStatus.node, labelHash, account.address, resolverAddress, 0]
  });

  await waitForReceipt(publicClient, hash);
  return hash;
}

async function writeResolverRecords({ publicClient, walletClient, account, resolverAddress, node, textRecords, sourceCid }) {
  const calls = [];

  if (sourceCid) {
    calls.push(
      encodeFunctionData({
        abi: publicResolverAbi,
        functionName: 'setContenthash',
        args: [node, encodeIpfsContenthash(sourceCid)]
      })
    );
  }

  for (const [key, value] of Object.entries(textRecords)) {
    calls.push(
      encodeFunctionData({
        abi: publicResolverAbi,
        functionName: 'setText',
        args: [node, key, value]
      })
    );
  }

  const hash = await walletClient.writeContract({
    account,
    address: resolverAddress,
    abi: publicResolverAbi,
    functionName: 'multicall',
    args: [calls]
  });

  return waitForReceipt(publicClient, hash);
}

export async function publishAuditRecord(entry) {
  const { publicClient, walletClient, account, addresses } = createEnsClients();
  if (!walletClient || !account) {
    throw new Error('SEPOLIA_PRIVATE_KEY is required to publish ENS records.');
  }

  const parentName = entry.parentName ?? packageToParentEnsName(entry.packageName);
  const versionName = versionLabelToEnsName(parentName, entry.version);
  const { label: packageLabel, parentName: baseDomain } = splitName(parentName);
  if (!baseDomain) {
    throw new Error(`Invalid parent ENS name ${parentName}`);
  }

  const baseDomainStatus = await getNameStatus({ publicClient, addresses, name: baseDomain });
  if (!baseDomainStatus.owner || baseDomainStatus.owner === zeroAddress) {
    throw new Error(`Base ENS name ${baseDomain} is not registered.`);
  }
  assertControllableName({ status: baseDomainStatus, account, addresses, name: baseDomain });

  let parentStatus = await getNameStatus({ publicClient, addresses, name: parentName });
  let parentCreationHash = null;
  if (!parentStatus.owner || parentStatus.owner === zeroAddress) {
    parentCreationHash = await createSubname({
      publicClient,
      walletClient,
      account,
      addresses,
      parentStatus: baseDomainStatus,
      label: packageLabel,
      resolverAddress: addresses.publicResolver
    });
    parentStatus = await getNameStatus({ publicClient, addresses, name: parentName });
  }
  assertControllableName({ status: parentStatus, account, addresses, name: parentName });

  const parentResolver = await ensureResolver({
    publicClient,
    walletClient,
    account,
    addresses,
    name: parentName,
    node: parentStatus.node,
    wrapped: parentStatus.wrapped,
    currentResolver: parentStatus.resolver
  });

  const versionNode = namehash(versionName);
  const creationHash = await createSubname({
    publicClient,
    walletClient,
    account,
    addresses,
    parentStatus,
    label: versionToEnsLabel(entry.version),
    resolverAddress: parentResolver
  });

  await writeResolverRecords({
    publicClient,
    walletClient,
    account,
    resolverAddress: parentResolver,
    node: versionNode,
    textRecords: buildAuditTextRecords(entry),
    sourceCid: entry.source.cid
  });

  await writeResolverRecords({
    publicClient,
    walletClient,
    account,
    resolverAddress: parentResolver,
    node: parentStatus.node,
    textRecords: buildLatestParentRecords(entry),
    sourceCid: entry.source.cid
  });

  return {
    parentName,
    versionName,
    txHashes: {
      createParentSubname: parentCreationHash,
      createSubname: creationHash
    }
  };
}

export async function resolveAuditRecord({ packageName, version, rootDomain = DEFAULT_ROOT_DOMAIN, gatewayHost = DEFAULT_GATEWAY_HOST }) {
  const { publicClient, addresses } = createEnsClients();
  const versionName = packageVersionToEnsName(packageName, version, rootDomain);
  const node = namehash(versionName);
  const resolverAddress = await readResolver(publicClient, addresses.registry, node);

  if (!resolverAddress || resolverAddress === zeroAddress) {
    throw new Error(`ENS name ${versionName} does not have a resolver configured.`);
  }

  const keys = [
    `${TEXT_RECORD_PREFIX}.verdict`,
    `${TEXT_RECORD_PREFIX}.score`,
    `${TEXT_RECORD_PREFIX}.report_cid`,
    `${TEXT_RECORD_PREFIX}.report_uri`,
    `${TEXT_RECORD_PREFIX}.source_cid`,
    `${TEXT_RECORD_PREFIX}.source_uri`,
    `${TEXT_RECORD_PREFIX}.capabilities`,
    `${TEXT_RECORD_PREFIX}.date`
  ];

  const textRecords = {};
  for (const key of keys) {
    textRecords[key] = await publicClient.readContract({
      address: resolverAddress,
      abi: publicResolverAbi,
      functionName: 'text',
      args: [node, key]
    });
  }

  const contenthashValue = await publicClient.readContract({
    address: resolverAddress,
    abi: publicResolverAbi,
    functionName: 'contenthash',
    args: [node]
  });

  const contentCid = decodeIpfsContenthash(contenthashValue);

  return {
    packageName,
    version,
    ensName: versionName,
    resolverAddress,
    verdict: textRecords[`${TEXT_RECORD_PREFIX}.verdict`],
    score: textRecords[`${TEXT_RECORD_PREFIX}.score`],
    reportCid: textRecords[`${TEXT_RECORD_PREFIX}.report_cid`],
    reportUri:
      textRecords[`${TEXT_RECORD_PREFIX}.report_uri`] ||
      (textRecords[`${TEXT_RECORD_PREFIX}.report_cid`]
        ? `https://${gatewayHost}/ipfs/${textRecords[`${TEXT_RECORD_PREFIX}.report_cid`]}`
        : ''),
    sourceCid: contentCid ?? textRecords[`${TEXT_RECORD_PREFIX}.source_cid`],
    sourceUri:
      textRecords[`${TEXT_RECORD_PREFIX}.source_uri`] ||
      (contentCid ? `ipfs://${contentCid}` : ''),
    capabilities: textRecords[`${TEXT_RECORD_PREFIX}.capabilities`]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    auditedAt: textRecords[`${TEXT_RECORD_PREFIX}.date`]
  };
}
