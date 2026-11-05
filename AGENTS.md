# ArcPay Automated Vault

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

---

## What This App Does

USDC vault on Arc Testnet. Users deposit and withdraw USDC, send batch payments from their vault balance, and create payroll plans that only an ERC-8004 registered agent can release after the contract re-checks every rule (plan active, agent identity, due time, runs left, spend cap, balance).

## Deployed contracts (Arc Testnet)

- `ArcPayVault`: `0x405438ec99cda31b5ece7788d1f96cd12cd376c6`
  - Deployed from the shared platform deployer wallet (owner = pause/unpause only, ownership renounce disabled, owner can never move user funds).
  - Constructor: owner, USDC `0x3600000000000000000000000000000000000000`, ERC-8004 IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`.
  - Deploy block `70910984` (also `VITE_VAULT_DEPLOY_BLOCK` in `.env`).
  - Source verified on the Arc Testnet explorer (Blockscout, Solc 0.8.28, optimizer 200, Cancun). Superseded unfunded deployment: `0xb5b54835bbfe15163a11abd91dd0dbb967e5ee35`.
  - Reviewed at maximum depth, 132 tests passing. Uses Ownable2Step, constructor requires contract addresses. Full report: `docs/security-review.md`.
  - Never run `lookup_contract` on this address again without deleting `contracts/imported/` afterwards: it duplicates the source and collides with the real artifact.
  - Source `contracts/ArcPayVault.sol`; ABI mirrored in `src/contracts/vaultAbi.ts` (regenerate from `contracts/out/` after any contract change).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS (Arc Dark tokens in `src/index.css`)
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. `bun run contracts:build`, `bun run contracts:test`
- Chain: Arc Testnet (5042002). USDC ERC-20 view only (6 decimals) via `@/onchain-money`; no native balance is shown.

## Key Files

- `src/App.tsx` - composition root
- `src/components/` - Header, BalanceHero, MoneyForm (deposit/withdraw), BatchTransfer, PayrollPlanner, AgentPanel (+ AgentIdentity, PlanList), TracePanel, TxDecoder
- `src/hooks/` - useVaultState (live reads), usePlans, useAgent (ERC-8004 identity), useTxFlow (tx runner with trace groups), useVaultEvents (bounded log scan), useRecipients
- `src/lib/` - vault.ts (addresses, ABIs), decode.ts (calldata and receipt decoding), callLog.ts (call trace + `withTraceGroup`), rpcLog.ts (in-app JSON-RPC log)

## Styling

- All component styles live in `src/styles/app.css` as semantic classes (`.card`, `.btn-primary`, `.grid-2`, `.recipient-row`, ...) built with Tailwind `@apply`, so they never depend on utility-class detection. Design tokens (Arc Dark) are in `src/index.css`. Prefer extending these classes over adding ad-hoc utility classes in components.
- Layout uses auto-fit grids (not viewport breakpoints) so it fits the narrow Studio preview frame.

## Tracing

- `src/tracing.ts` (scaffold) streams RPC calls to the Tracing panel. Every write flow runs inside `withTraceGroup(label, ...)` so calls appear as one labelled group.
- `src/lib/rpcLog.ts` wraps fetch (imported after `./tracing` in `src/main.tsx`) to keep an in-app RPC log.

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it.
- Never put a secret in a URL path or query.

## Packaging

- `bun run export:zip` builds `exports/arcpay-automated-vault.zip` (GitHub-ready: no node_modules, .env, logs or Studio-only scripts). Verified: the extracted archive typechecks, `forge build` succeeds and all 132 tests pass.
- `bun run abi:sync` regenerates `src/contracts/vaultAbi.ts` after contract changes. Deploy script: `contracts/script/DeployArcPayVault.s.sol`.

## To Run

```bash
bun install
bun run dev
```

Restart the dev server after editing `.env`.
