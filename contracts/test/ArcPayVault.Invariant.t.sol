// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcPayVaultTestBase, MockUSDC, MockIdentityRegistry} from "./ArcPayVault.Base.t.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

contract VaultHandler is Test {
    ArcPayVault public vault;
    MockUSDC public usdc;
    address public vaultOwner;
    address public agentOp;

    address[] public actors;
    address[] public recipients; // never actors; some are configured to fail
    uint256 public totalMinted;
    uint256[] public planIds;

    constructor(ArcPayVault v, MockUSDC t, address vaultOwner_, address agentOp_) {
        vault = v;
        usdc = t;
        vaultOwner = vaultOwner_;
        agentOp = agentOp_;
        for (uint256 i; i < 3; ++i) actors.push(address(uint160(0xA0 + i)));
        for (uint256 i; i < 4; ++i) {
            address r = address(uint160(0xC0 + i));
            recipients.push(r);
            if (i == 2) t.setFailMode(r, 1);
            if (i == 3) t.setFailMode(r, 2);
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function recipientsLength() external view returns (uint256) {
        return recipients.length;
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function deposit(uint256 s, uint256 amt) external {
        address a = _actor(s);
        amt = bound(amt, 1, 1_000e6);
        usdc.mint(a, amt);
        totalMinted += amt;
        vm.startPrank(a);
        usdc.approve(address(vault), amt);
        vault.deposit(amt); // may revert while paused
        vm.stopPrank();
    }

    function withdraw(uint256 s, uint256 amt) external {
        address a = _actor(s);
        uint256 bal = vault.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(a);
        vault.withdraw(amt);
    }

    function batch(uint256 s, uint256 n, uint256 seed) external {
        address a = _actor(s);
        n = bound(n, 1, 6);
        address[] memory r = new address[](n);
        uint256[] memory amts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = recipients[uint256(keccak256(abi.encode(seed, i))) % recipients.length];
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i, "a"))), 1, 100e6);
        }
        vm.prank(a);
        vault.batchTransfer(r, amts); // may revert (insufficient / paused)
    }

    function createPlan(uint256 s, uint256 seed) external {
        address a = _actor(s);
        uint256 n = bound(seed, 1, 4);
        address[] memory r = new address[](n);
        uint256[] memory amts = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            r[i] = recipients[uint256(keccak256(abi.encode(seed, i))) % recipients.length];
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i, "a"))), 1, 50e6);
            total += amts[i];
        }
        vm.prank(a);
        uint256 id = vault.createPlan(1, r, amts, 60, 0, 5, total * 3);
        planIds.push(id);
    }

    function executePayroll(uint256 idx) external {
        if (planIds.length == 0) return;
        uint256 id = planIds[idx % planIds.length];
        vm.prank(agentOp);
        vault.executePayroll(id, 1);
    }

    function cancelPlan(uint256 idx) external {
        if (planIds.length == 0) return;
        uint256 id = planIds[idx % planIds.length];
        (address payer,,,,,,,,,,) = vault.getPlan(id);
        vm.prank(payer);
        vault.cancelPlan(id);
    }

    function togglePause() external {
        vm.startPrank(vaultOwner);
        if (vault.paused()) vault.unpause();
        else vault.pause();
        vm.stopPrank();
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }
}

contract ArcPayVaultInvariantTest is ArcPayVaultTestBase {
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new VaultHandler(vault, usdc, owner, agentOwner);
        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](8);
        sels[0] = VaultHandler.deposit.selector;
        sels[1] = VaultHandler.withdraw.selector;
        sels[2] = VaultHandler.batch.selector;
        sels[3] = VaultHandler.createPlan.selector;
        sels[4] = VaultHandler.executePayroll.selector;
        sels[5] = VaultHandler.cancelPlan.selector;
        sels[6] = VaultHandler.togglePause.selector;
        sels[7] = VaultHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// @dev Σ internal balances == totalDeposits.
    function invariant_SumOfBalancesEqualsTotalDeposits() public view {
        uint256 s;
        for (uint256 i; i < handler.actorsLength(); ++i) s += vault.balanceOf(handler.actors(i));
        assertEq(s, vault.totalDeposits());
    }

    /// @dev The vault is always exactly solvent: real token balance == totalDeposits.
    function invariant_VaultTokenBalanceEqualsTotalDeposits() public view {
        assertEq(usdc.balanceOf(address(vault)), vault.totalDeposits());
    }

    /// @dev Conservation of tokens: vault + actors + recipients == everything minted.
    function invariant_TokenConservation() public view {
        uint256 s = usdc.balanceOf(address(vault)) + usdc.balanceOf(alice); // alice seeded in base setUp
        for (uint256 i; i < handler.actorsLength(); ++i) s += usdc.balanceOf(handler.actors(i));
        for (uint256 i; i < handler.recipientsLength(); ++i) s += usdc.balanceOf(handler.recipients(i));
        assertEq(s, handler.totalMinted() + FUND);
    }

    /// @dev Plans' spent never exceeds their cap and executions never exceed max.
    function invariant_PlanLimitsRespected() public view {
        uint256 n = vault.planCount();
        for (uint256 id = 1; id <= n; ++id) {
            (,,,, uint32 execs, uint32 maxE, uint256 cap, uint256 spent,,,) = vault.getPlan(id);
            assertLe(spent, cap);
            assertLe(execs, maxE);
        }
    }
}
