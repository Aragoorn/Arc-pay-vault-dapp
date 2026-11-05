// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ArcPayVaultTestBase, Reenterer} from "./ArcPayVault.Base.t.sol";

contract ArcPayVaultReentrancyTest is ArcPayVaultTestBase {
    Reenterer internal atk;

    function setUp() public override {
        super.setUp();
        atk = new Reenterer(address(vault));
        usdc.setHooks(true);
    }

    function _payloads() internal view returns (bytes[] memory p) {
        p = new bytes[](7);
        p[0] = abi.encodeCall(vault.withdraw, (1));
        p[1] = abi.encodeCall(vault.deposit, (1));
        p[2] = abi.encodeCall(vault.batchTransfer, (_a1(bob), _u1(1)));
        p[3] = abi.encodeCall(vault.createPlan, (AGENT, _a1(bob), _u1(1), 1 days, 0, 1, 1));
        p[4] = abi.encodeCall(vault.cancelPlan, (1));
        p[5] = abi.encodeCall(vault.setPlanAgent, (1, AGENT2));
        p[6] = abi.encodeCall(vault.executePayroll, (1, AGENT));
    }

    function _assertBlocked() internal view {
        assertTrue(atk.fired(), "hook did not fire");
        assertFalse(atk.lastSuccess(), "reentrant call succeeded");
        assertEq(bytes4(atk.lastRet()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function _atkDeposit(uint256 amount) internal {
        usdc.mint(address(atk), amount);
        atk.execOn(address(usdc), abi.encodeCall(usdc.approve, (address(vault), type(uint256).max)));
        atk.execOn(address(vault), abi.encodeCall(vault.deposit, (amount)));
    }

    // ---------- withdraw ----------

    function test_Reentrancy_WithdrawHookCannotReenterAnyEntryPoint() public {
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; ++i) {
            _atkDeposit(100e6);
            atk.arm(ps[i]);
            atk.execOn(address(vault), abi.encodeCall(vault.withdraw, (50e6)));
            _assertBlocked();
            // drain the remainder for the next loop turn
            atk.execOn(address(vault), abi.encodeCall(vault.withdraw, (vault.balanceOf(address(atk)))));
            assertEq(vault.balanceOf(address(atk)), 0);
        }
        assertEq(vault.totalDeposits(), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_Reentrancy_DoubleWithdrawBlocked_BalancesExact() public {
        _atkDeposit(100e6);
        atk.arm(abi.encodeCall(vault.withdraw, (50e6)));
        atk.execOn(address(vault), abi.encodeCall(vault.withdraw, (50e6)));
        _assertBlocked();
        assertEq(vault.balanceOf(address(atk)), 50e6);
        assertEq(usdc.balanceOf(address(atk)), 50e6);
        assertEq(vault.totalDeposits(), 50e6);
        assertEq(usdc.balanceOf(address(vault)), 50e6);
    }

    // ---------- deposit (malicious token hook on transferFrom) ----------

    function test_Reentrancy_DepositTokenHookBlocked() public {
        usdc.mint(address(atk), 100e6);
        atk.execOn(address(usdc), abi.encodeCall(usdc.approve, (address(vault), type(uint256).max)));
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; ++i) {
            atk.arm(ps[i]);
            atk.execOn(address(vault), abi.encodeCall(vault.deposit, (10e6)));
            _assertBlocked();
        }
        assertEq(vault.balanceOf(address(atk)), 70e6);
        assertEq(vault.totalDeposits(), 70e6);
        assertEq(usdc.balanceOf(address(vault)), 70e6);
    }

    // ---------- batchTransfer with malicious recipient ----------

    function test_Reentrancy_BatchRecipientCannotReenter() public {
        _deposit(alice, 500e6);
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; ++i) {
            atk.arm(ps[i]);
            vm.prank(alice);
            vault.batchTransfer(_a2(address(atk), bob), _u2(10e6, 5e6));
            _assertBlocked();
        }
        assertEq(usdc.balanceOf(address(atk)), 70e6);
        assertEq(usdc.balanceOf(bob), 35e6);
        assertEq(vault.balanceOf(alice), 500e6 - 105e6);
        assertEq(vault.totalDeposits(), 500e6 - 105e6);
        assertEq(usdc.balanceOf(address(vault)), 500e6 - 105e6);
    }

    function test_Reentrancy_BatchRevertingHookRecipientIsRefunded() public {
        _deposit(alice, 500e6);
        atk.setRevertInHook(true);
        vm.expectEmit(true, true, false, true, address(vault));
        emit PaymentFailed(0, address(atk), 10e6);
        vm.prank(alice);
        vault.batchTransfer(_a2(address(atk), bob), _u2(10e6, 5e6));
        assertEq(usdc.balanceOf(address(atk)), 0);
        assertEq(usdc.balanceOf(bob), 5e6);
        assertEq(vault.balanceOf(alice), 495e6);
        assertEq(vault.totalDeposits(), 495e6);
        assertEq(usdc.balanceOf(address(vault)), 495e6);
    }

    // ---------- executePayroll with malicious recipient / operator ----------

    function _planWithAtkRecipient() internal returns (uint256 id) {
        vm.prank(alice);
        id = vault.createPlan(AGENT, _a2(address(atk), bob), _u2(10e6, 5e6), 1 days, 0, 5, 1_000e6);
    }

    function test_Reentrancy_PayrollRecipientCannotReenter() public {
        _deposit(alice, 500e6);
        uint256 id = _planWithAtkRecipient();
        assertEq(id, 1);
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; ++i) {
            atk.arm(ps[i]);
            _exec(id);
            _assertBlocked();
            skip(1 days);
            if (i == 4) break; // plan has maxExecutions 5
        }
        (,,,, uint32 execs,,, uint256 spent,,,) = vault.getPlan(id);
        assertEq(execs, 5);
        assertEq(spent, 75e6);
        assertEq(vault.balanceOf(alice), 500e6 - 75e6);
        assertEq(vault.totalDeposits(), 500e6 - 75e6);
        assertEq(usdc.balanceOf(address(vault)), 500e6 - 75e6);
    }

    function test_Reentrancy_PayrollRevertingHookRecipientIsRefunded() public {
        _deposit(alice, 500e6);
        uint256 id = _planWithAtkRecipient();
        atk.setRevertInHook(true);
        vm.expectEmit(true, true, true, true, address(vault));
        emit PayrollExecuted(id, AGENT, agentOwner, 5e6, 10e6, 1);
        _exec(id);
        assertEq(usdc.balanceOf(address(atk)), 0);
        assertEq(vault.balanceOf(alice), 495e6);
        assertEq(vault.totalDeposits(), 495e6);
        assertEq(usdc.balanceOf(address(vault)), 495e6);
    }

    function test_Reentrancy_MaliciousOperatorAlsoRecipientCannotDoubleExecute() public {
        uint256 agent3 = 3;
        registry.set(agent3, address(atk), address(0));
        _deposit(alice, 500e6);
        vm.prank(alice);
        uint256 id = vault.createPlan(agent3, _a1(address(atk)), _u1(10e6), 1 days, 0, 5, 1_000e6);
        atk.arm(abi.encodeCall(vault.executePayroll, (id, agent3)));
        atk.execOn(address(vault), abi.encodeCall(vault.executePayroll, (id, agent3)));
        _assertBlocked();
        (,,,, uint32 execs,,, uint256 spent,,,) = vault.getPlan(id);
        assertEq(execs, 1);
        assertEq(spent, 10e6);
        assertEq(usdc.balanceOf(address(atk)), 10e6);
        assertEq(vault.balanceOf(alice), 490e6);
    }

    // ---------- read-only view during callback is callable and consistent with checks-effects-interactions ----------

    function test_Reentrancy_ViewsAreCallableMidTransferAndAlreadyDebited() public {
        _deposit(alice, 500e6);
        atk.arm(abi.encodeCall(vault.balanceOf, (alice)));
        vm.prank(alice);
        vault.batchTransfer(_a1(address(atk)), _u1(100e6));
        assertTrue(atk.lastSuccess());
        // state was already debited before the external call (checks-effects-interactions)
        assertEq(abi.decode(atk.lastRet(), (uint256)), 400e6);
    }
}
