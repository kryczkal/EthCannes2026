// NpmGuardAuditRequest contract — deployed on Sepolia
// Update this address after running: cd contracts && npm run deploy

export const AUDIT_REQUEST_ADDRESS =
  "0x4dd8e49df27242a9cea4c9b9eb3b62298439d6ae" as `0x${string}`;

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
