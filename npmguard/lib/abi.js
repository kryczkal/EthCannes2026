export const ensRegistryAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'owner',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'resolver',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setResolver',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'resolver', type: 'address' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setSubnodeRecord',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' }
    ],
    outputs: []
  }
];

export const publicResolverAbi = [
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'multicall',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }]
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setText',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setContenthash',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'hash', type: 'bytes' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'text',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' }
    ],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'contenthash',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes' }]
  }
];

export const nameWrapperAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getData',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'fuses', type: 'uint32' },
      { name: 'expiry', type: 'uint64' }
    ]
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setResolver',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'resolver', type: 'address' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setSubnodeRecord',
    inputs: [
      { name: 'parentNode', type: 'bytes32' },
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
      { name: 'fuses', type: 'uint32' },
      { name: 'expiry', type: 'uint64' }
    ],
    outputs: [{ name: 'node', type: 'bytes32' }]
  }
];
