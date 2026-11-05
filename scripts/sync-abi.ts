/**
 * Regenerates src/contracts/vaultAbi.ts from the Foundry artifact.
 * Run after any change to contracts/ArcPayVault.sol:
 *   bun run contracts:build && bun run abi:sync
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const artifactPath = resolve('contracts/out/ArcPayVault.sol/ArcPayVault.json')
const outPath = resolve('src/contracts/vaultAbi.ts')

if (!existsSync(artifactPath)) {
  console.error(`Artifact not found at ${artifactPath}. Run "bun run contracts:build" first.`)
  process.exit(1)
}

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { abi: unknown[] }
const source =
  '// Generated from contracts/out/ArcPayVault.sol/ArcPayVault.json (bun run abi:sync)\n' +
  `export const vaultAbi = ${JSON.stringify(artifact.abi, null, 2)} as const\n`

writeFileSync(outPath, source)
console.log(`Wrote ${artifact.abi.length} ABI entries to src/contracts/vaultAbi.ts`)
