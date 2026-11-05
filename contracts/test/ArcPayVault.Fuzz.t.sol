// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcPayVaultTestBase} from "./ArcPayVault.Base.t.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

contract ArcPayVaultFuzzTest is ArcPayVaultTestBase {
    function _mk(uint256 n, uint256 seed, uint256 mask)
        internal
        returns (address[] memory r, uint256[] memory a, uint256 total, uint256 failed)
    {
        r = new address[](n);
        a = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = address(uint160(0xB000 + i));
            a[i] = bound(uint256(keccak256(abi.encode(seed, i))), 1, 1_000e6);
            total += a[i];
            if ((mask >> (i % 256)) & 1 == 1) {
                usdc.setFailMode(r[i], (i % 2 == 0) ? 1 : 2);
                failed += a[i];
            }
        }
    }

    function testFuzz_DepositWithdraw(uint256 dep, uint256 wd) public {
        dep = bound(dep, 1, FUND);
        wd = bound(wd, 1, dep);
        vm.startPrank(alice);
        vault.deposit(dep);
        assertEq(vault.balanceOf(alice), dep);
        assertEq(vault.totalDeposits(), dep);
        vault.withdraw(wd);
        vm.stopPrank();
        assertEq(vault.balanceOf(alice), dep - wd);
        assertEq(vault.totalDeposits(), dep - wd);
        assertEq(usdc.balanceOf(address(vault)), dep - wd);
        assertEq(usdc.balanceOf(alice), FUND - dep + wd);
    }

    function testFuzz_WithdrawMoreThanBalanceReverts(uint256 dep, uint256 extra) public {
        dep = bound(dep, 1, FUND);
        extra = bound(extra, 1, type(uint128).max);
        _deposit(alice, dep);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, dep, dep + extra));
        vault.withdraw(dep + extra);
    }

    function testFuzz_MultiUserDepositsSumToTotal(uint256 x, uint256 y, uint256 z) public {
        x = bound(x, 1, 1e15);
        y = bound(y, 1, 1e15);
        z = bound(z, 1, 1e15);
        _deposit(alice, x);
        _deposit(bob, y);
        _deposit(carol, z);
        assertEq(vault.balanceOf(alice) + vault.balanceOf(bob) + vault.balanceOf(carol), vault.totalDeposits());
        assertEq(vault.totalDeposits(), x + y + z);
        assertEq(usdc.balanceOf(address(vault)), x + y + z);
    }

    function testFuzz_BatchTotals(uint256 nRaw, uint256 seed) public {
        uint256 n = bound(nRaw, 1, 100);
        (address[] memory r, uint256[] memory a, uint256 total,) = _mk(n, seed, 0);
        _deposit(alice, total + 7);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, n, total);
        vm.prank(alice);
        vault.batchTransfer(r, a);

        assertEq(vault.balanceOf(alice), 7);
        assertEq(vault.totalDeposits(), 7);
        assertEq(usdc.balanceOf(address(vault)), 7);
        assertEq(_sumTokenBalances(r), total);
    }

    function testFuzz_BatchWithFailures_RefundsExactly(uint256 nRaw, uint256 seed, uint256 mask) public {
        uint256 n = bound(nRaw, 1, 100);
        (address[] memory r, uint256[] memory a, uint256 total, uint256 failed) = _mk(n, seed, mask);
        _deposit(alice, total);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, n, total - failed);
        vm.prank(alice);
        vault.batchTransfer(r, a);

        assertEq(vault.balanceOf(alice), failed);
        assertEq(vault.totalDeposits(), failed);
        assertEq(usdc.balanceOf(address(vault)), failed);
        assertEq(_sumTokenBalances(r), total - failed);
    }

    function testFuzz_BatchInsufficientReverts(uint256 nRaw, uint256 seed, uint256 shortBy) public {
        uint256 n = bound(nRaw, 1, 30);
        (address[] memory r, uint256[] memory a, uint256 total,) = _mk(n, seed, 0);
        shortBy = bound(shortBy, 1, total);
        if (total > shortBy) _deposit(alice, total - shortBy);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, total - shortBy, total));
        vault.batchTransfer(r, a);
    }

    function testFuzz_PayrollAccounting(uint256 nRaw, uint256 seed, uint256 mask, uint256 runsRaw) public {
        uint256 n = bound(nRaw, 1, 25);
        uint32 runs = uint32(bound(runsRaw, 1, 6));
        (address[] memory r, uint256[] memory a, uint256 total, uint256 failed) = _mk(n, seed, mask);
        _deposit(alice, total * runs + 3);
        vm.prank(alice);
        uint256 id = vault.createPlan(AGENT, r, a, 1 days, 0, runs, total * runs);

        for (uint32 k = 1; k <= runs; ++k) {
            vm.expectEmit(true, true, true, true, address(vault));
            emit PayrollExecuted(id, AGENT, agentWallet, total - failed, failed, k);
            vm.prank(agentWallet);
            vault.executePayroll(id, AGENT);
            skip(1 days);
        }
        (,,,, uint32 execs,,, uint256 spent, bool active,,) = vault.getPlan(id);
        assertEq(execs, runs);
        assertFalse(active);
        assertEq(spent, (total - failed) * runs);
        assertEq(_sumTokenBalances(r), (total - failed) * runs);
        assertEq(vault.balanceOf(alice), 3 + failed * runs);
        assertEq(vault.totalDeposits(), vault.balanceOf(alice));
        assertEq(usdc.balanceOf(address(vault)), vault.totalDeposits());
    }

    function testFuzz_SpendCapBoundsRuns(uint256 capRaw, uint256 perRaw) public {
        uint256 per = bound(perRaw, 1, 100e6);
        uint256 cap = bound(capRaw, per, per * 10);
        _deposit(alice, per * 20);
        vm.prank(alice);
        uint256 id = vault.createPlan(AGENT, _a1(bob), _u1(per), 1 days, 0, 20, cap);
        uint256 allowed = cap / per;
        for (uint256 k; k < allowed; ++k) {
            vm.prank(agentOwner);
            vault.executePayroll(id, AGENT);
            skip(1 days);
        }
        (ArcPayVault.Check c,) = vault.previewExecution(id, AGENT, agentOwner);
        assertEq(uint8(c), uint8(ArcPayVault.Check.SpendCapExceeded));
        assertEq(usdc.balanceOf(bob), allowed * per);
        assertLe(usdc.balanceOf(bob), cap);
    }

    function testFuzz_PreviewTotalMatchesSum(uint256 nRaw, uint256 seed) public {
        uint256 n = bound(nRaw, 1, 100);
        (address[] memory r, uint256[] memory a, uint256 total,) = _mk(n, seed, 0);
        vm.prank(alice);
        uint256 id = vault.createPlan(AGENT, r, a, 60, 0, 1, total);
        (, uint256 t) = vault.previewExecution(id, AGENT, agentOwner);
        assertEq(t, total);
    }

    function testFuzz_IntervalBounds(uint64 interval) public {
        vm.prank(alice);
        if (interval < 60 || interval > 365 days) {
            vm.expectRevert(
                abi.encodeWithSelector(ArcPayVault.InvalidInterval.selector, interval, uint64(60), uint64(365 days))
            );
        }
        vault.createPlan(AGENT, _a1(bob), _u1(1), interval, 0, 1, 1);
    }
}
