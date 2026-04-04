import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const source = readFileSync("src/NpmGuardAuditRequest.sol", "utf8");

const input = {
  language: "Solidity",
  sources: {
    "NpmGuardAuditRequest.sol": { content: source },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.some((e: any) => e.severity === "error")) {
  console.error("Compilation errors:");
  for (const err of output.errors) {
    console.error(err.formattedMessage);
  }
  process.exit(1);
}

const contract =
  output.contracts["NpmGuardAuditRequest.sol"]["NpmGuardAuditRequest"];

const artifact = {
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};

mkdirSync("out", { recursive: true });
writeFileSync("out/NpmGuardAuditRequest.json", JSON.stringify(artifact, null, 2));

console.log("Compiled → out/NpmGuardAuditRequest.json");
console.log(`Bytecode size: ${artifact.bytecode.length / 2 - 1} bytes`);
