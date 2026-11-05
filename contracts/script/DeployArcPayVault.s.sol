// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

/// @notice Deploys ArcPayVault. Defaults target Arc Testnet.
///
/// Optional env vars (all have Arc Testnet defaults):
///   OWNER_ADDRESS      - pause/unpause + two-step ownership admin. Defaults to the broadcaster.
///   USDC_ADDRESS       - ERC-20 USDC. Default 0x3600000000000000000000000000000000000000 (Arc USDC predeploy).
///   IDENTITY_REGISTRY  - ERC-8004 IdentityRegistry. Default 0x8004A818BFB912233c491871b3d84c89A494BD9e (Arc Testnet).
///
/// Simulate (no transaction is sent):
///   forge script contracts/script/DeployArcPayVault.s.sol --rpc-url arc_testnet
///
/// Broadcast with an encrypted keystore account (recommended):
///   forge script contracts/script/DeployArcPayVault.s.sol --rpc-url arc_testnet --account <name> --broadcast
contract DeployArcPayVault is Script {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_TESTNET_IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external returns (ArcPayVault vault) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        address registry = vm.envOr("IDENTITY_REGISTRY", ARC_TESTNET_IDENTITY_REGISTRY);

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        address owner = vm.envOr("OWNER_ADDRESS", broadcaster);
        vault = new ArcPayVault(owner, usdc, registry);
        vm.stopBroadcast();

        console.log("ArcPayVault deployed at:", address(vault));
        console.log("owner:", owner);
        console.log("usdc:", usdc);
        console.log("identityRegistry:", registry);
    }
}
