const { SigningKey, keccak256, Signature } = require("ethers");

/**
 * Sign the raw RFQ payload from `rfq.typedDataToSign` (a hex string starting
 * "0x1901..." — the EIP-712 prefix + domain separator + struct hash, NOT a
 * JSON typed-data object). It's already the exact preimage the vendor
 * hashes on-chain, so this is keccak256 + a raw ECDSA sign, not
 * `eth_signTypedData_v4` against a domain/types/message object we don't have.
 *
 * Returns a 132-char "0x" + r + s + v hex string, matching what
 * POST /order/submit expects as `userSignature`.
 */
function signRfqTypedData(privateKey, typedDataToSign) {
  const digest = keccak256(typedDataToSign);
  const signingKey = new SigningKey(privateKey);
  const sig = signingKey.sign(digest);
  return Signature.from(sig).serialized;
}

module.exports = { signRfqTypedData };
