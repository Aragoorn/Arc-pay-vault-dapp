# ArcPayVault security and verification review

Contract: `contracts/ArcPayVault.sol`
Deployed (Arc Testnet): `0x405438ec99cda31b5ece7788d1f96cd12cd376c6`, source verified on https://explorer.testnet.arc.io/address/0x405438ec99cda31b5ece7788d1f96cd12cd376c6
Superseded (never held funds, no plans): `0xb5b54835bbfe15163a11abd91dd0dbb967e5ee35`

## Findings and resolution

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Medium | Ownership transfer took effect immediately | Inherits `Ownable2Step`; new owner must call `acceptOwnership()` |
| 2 | Medium | Constructor accepted non-contract USDC / registry addresses (both immutable) | Reverts `NotAContract(address)` when either has no code |
| 3 | Medium | Pooled USDC custody is exposed to an issuer blocklist of the vault address | Documented in NatSpec; cannot be fixed in code. Monitor and stop deposits during an incident |
| 4 | Low | Several custom errors lacked diagnostic values | Added parameters to all validation and authorization errors |
| 5 | Info | `MaxRunsReached` is unreachable via the public API (plan turns inactive first) | Kept as defense in depth |
| 6 | Info | A token returning no data from `transfer` reverts the whole call instead of refunding | Atomic, no fund loss; standard USDC returns a bool |

Earlier rounds also fixed: renouncing ownership while paused could lock the vault (renounce is now disabled), and one blocked recipient could revert a whole manual batch (failed payments are now refunded individually).

## Checks run

- Two independent reviews at maximum depth, three rounds, final round clean.
- Reentrancy: every state-changing function is `nonReentrant`, effects precede external calls, and attack contracts (malicious token hook, malicious recipient, operator that is also recipient) all fail with `ReentrancyGuardReentrantCall`.
- Access control: owner can only pause and unpause (and hand off ownership in two steps); cannot move user funds. `cancelPlan` and `setPlanAgent` are payer-only. `executePayroll` requires the agent's ERC-8004 owner or wallet.
- Static analysis: no High findings. Remaining Medium/Low items are benign (strict equality on a run counter, a local that defaults to zero, a guarded benign reentrancy pattern, timestamp use for scheduling).
- Unit, fuzz and invariant tests: 132 passed, 0 failed (invariants: internal balances sum to `totalDeposits`, vault USDC equals `totalDeposits`, token conservation, plan limits respected).
- OpenZeppelin imports: `Ownable`, `Ownable2Step`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `IERC20` all resolve to `@openzeppelin/contracts` 5.6.1 and compile on Solc 0.8.28 (Cancun).
- Explorer verification: standard Blockscout verification passed (Solc 0.8.28, optimizer 200 runs, Cancun, constructor args supplied). The explorer's source is byte-identical to the local file.
- Live state: owner is the platform deployer wallet, `usdc()` and `identityRegistry()` match the expected addresses, `pendingOwner()` is empty.

## Remaining risks

- The platform deployer wallet is a shared testnet wallet and is the vault's pause owner. For a real deployment, deploy from your own wallet or hand ownership to a multisig.
- Gas at 100 recipients is high (about 3.7M for `executePayroll`). Use fewer recipients per plan if a run fails on gas.
- Real USDC blocklisting and the live ERC-8004 registry behavior were not exercised by tests.
- This is an automated review, not a substitute for an independent third-party audit before any mainnet use.
