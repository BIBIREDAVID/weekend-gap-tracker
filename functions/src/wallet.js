/**
 * Thin wrapper over the Wallet API balance endpoint this project uses. See
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/balance
 */

/**
 * POST /api/v1/dex/balance/token-balances-by-address — balances for a
 * specific (chain, contract) list, up to 20 entries. Pass "" as a token's
 * contract address for the chain's native asset (BNB on BSC).
 */
function getTokenBalancesByAddress(client, { address, tokens, excludeRiskToken = "0" }) {
  return client.post("/api/v1/dex/balance/token-balances-by-address", {
    address,
    tokenContractAddresses: tokens,
    excludeRiskToken,
  });
}

module.exports = { getTokenBalancesByAddress };
