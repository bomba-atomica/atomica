import { ethers } from "ethers";

// From the test output
const user = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const token = "0xb4B46bdAA835F8E4b4d8e208B6559cD267851051"; // FakeETH
const lockBox = "0x703848F4c85f18e3acd8196c8eC91eb0b7Bd0797";

// Calculate storage key with slot 0
function calcKey(slot: number): string {
  const innerKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [token, slot])
  );
  const storageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [user, innerKey])
  );
  return storageKey;
}

console.log("Storage keys:");
console.log("Slot 0:", calcKey(0));
console.log("Slot 1:", calcKey(1));
console.log("Slot 2:", calcKey(2));
console.log("\nFrom test output:");
console.log("Used key: 0x7db06b6b60069292205003b91e71b0d3d2ba80b4475e40e6aaeda15b014b9208");
