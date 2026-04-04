// NpmGuardAuditRequest contract — deployed on Sepolia + 0G Galileo Testnet
// Update these addresses after running: cd contracts && npm run deploy

export const AUDIT_REQUEST_ADDRESS =
  "0x4bbaf196bde9e02594631e03c28ebe16719214f3" as `0x${string}`; // Sepolia

export const AUDIT_REQUEST_ADDRESS_0G =
  "0x1201448ae5f00e1783036439569e71ab3757d0de" as `0x${string}`; // 0G Galileo Testnet

export const AUDIT_REQUEST_ABI = [
  {
    inputs: [{ name: "_auditFee", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "packageName", type: "string" },
      { indexed: false, name: "version", type: "string" },
      { indexed: true, name: "requester", type: "address" },
    ],
    name: "AuditRequested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "key", type: "bytes32" },
      { indexed: true, name: "requester", type: "address" },
    ],
    name: "AuditRequestedByKey",
    type: "event",
  },
  {
    inputs: [
      { name: "packageName", type: "string" },
      { name: "version", type: "string" },
    ],
    name: "requestAudit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "key", type: "bytes32" }],
    name: "requestAuditByKey",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "auditFee",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "packageName", type: "string" },
      { name: "version", type: "string" },
    ],
    name: "isRequested",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "requested",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_fee", type: "uint256" }],
    name: "setFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
