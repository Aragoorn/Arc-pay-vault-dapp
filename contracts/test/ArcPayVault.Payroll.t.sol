// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArcPayVaultTestBase} from "./ArcPayVault.Base.t.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

contract ArcPayVaultPayrollTest is ArcPayVaultTestBase {
    function _expectRule(ArcPayVault.Check c) internal {
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.RuleViolated.selector, c));
    }

    // ---------- happy path ----------

    function test_Execute_PaysRecipientsUpdatesStateAndEmits() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();

        vm.expectEmit(true, true, true, false, address(vault));
        emit PayrollRuleVerified(id, AGENT, agentOwner);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(id, alice, bob, 100e6);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(id, alice, carol, 50e6);
        vm.expectEmit(true, true, true, true, address(vault));
        emit PayrollExecuted(id, AGENT, agentOwner, 150e6, 0, 1);
        _exec(id);

        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(carol), 50e6);
        assertEq(vault.balanceOf(alice), 350e6);
        assertEq(vault.totalDeposits(), 350e6);
        assertEq(usdc.balanceOf(address(vault)), 350e6);
        (,,, uint64 next, uint32 execs,,, uint256 spent, bool active,,) = vault.getPlan(id);
        assertEq(execs, 1);
        assertEq(spent, 150e6);
        assertEq(next, uint64(block.timestamp + 1 days));
        assertTrue(active);
    }

    function test_Execute_AgentWalletCanExecute() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(agentWallet);
        vault.executePayroll(id, AGENT);
        assertEq(usdc.balanceOf(bob), 100e6);
    }

    function test_Execute_RepeatsUntilMaxThenDeactivates() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault(); // 3 runs
        for (uint32 i = 1; i <= 3; ++i) {
            _exec(id);
            skip(1 days);
            (,,,, uint32 execs,,,,,,) = vault.getPlan(id);
            assertEq(execs, i);
        }
        (,,,,,,, uint256 spent, bool active,,) = vault.getPlan(id);
        assertEq(spent, 450e6);
        assertFalse(active);
        assertEq(vault.balanceOf(alice), 50e6);
        _expectRule(ArcPayVault.Check.PlanInactive);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_Execute_IntervalSchedulesFromExecutionTime() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        skip(3 hours);
        _exec(id);
        (,,, uint64 next,,,,,,,) = vault.getPlan(id);
        assertEq(next, uint64(block.timestamp + 1 days));
    }

    function test_Execute_AnyoneCanFundWithdrawalAfterPlanDoesNotLock() public {
        _deposit(alice, 150e6);
        uint256 id = _planDefault();
        vm.prank(alice);
        vault.withdraw(150e6); // plans do not reserve funds
        _expectRule(ArcPayVault.Check.InsufficientBalance);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    // ---------- every Check code via executePayroll ----------

    function test_RevertExecute_Paused() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(owner);
        vault.pause();
        _expectRule(ArcPayVault.Check.Paused);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_PlanInactive() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(alice);
        vault.cancelPlan(id);
        _expectRule(ArcPayVault.Check.PlanInactive);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
        _expectRule(ArcPayVault.Check.PlanInactive);
        vm.prank(agentOwner);
        vault.executePayroll(12345, AGENT); // unknown plan
    }

    function test_RevertExecute_AgentMismatch() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        _expectRule(ArcPayVault.Check.AgentMismatch);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT2);
    }

    function test_RevertExecute_NotAgentOperator() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        _expectRule(ArcPayVault.Check.NotAgentOperator);
        vm.prank(stranger);
        vault.executePayroll(id, AGENT);
        // even the payer is not automatically an operator
        _expectRule(ArcPayVault.Check.NotAgentOperator);
        vm.prank(alice);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_TooEarly_ThenRunsOnTime() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, uint64(block.timestamp + 1 hours), 3, 450e6);
        _expectRule(ArcPayVault.Check.TooEarly);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
        skip(1 hours);
        _exec(id);
        // immediately again is too early (interval 1 day)
        _expectRule(ArcPayVault.Check.TooEarly);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_MaxRunsReached_ViaForcedStorage() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 2, 450e6);
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(id, uint256(5)))) + 2); // _plans mapping slot (5 since Ownable2Step added _pendingOwner)
        uint256 word = uint256(vm.load(address(vault), slot));
        word = (word & ~(uint256(0xffffffff) << 128)) | (uint256(2) << 128);
        vm.store(address(vault), slot, bytes32(word));
        _expectRule(ArcPayVault.Check.MaxRunsReached);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_SpendCapExceeded() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 5, 200e6);
        _exec(id);
        skip(1 days);
        _expectRule(ArcPayVault.Check.SpendCapExceeded);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_InsufficientBalance() public {
        _deposit(alice, 149e6);
        uint256 id = _planDefault();
        _expectRule(ArcPayVault.Check.InsufficientBalance);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
    }

    function test_RevertExecute_OldOwnerLockedOutAfterAgentTransfer() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        address newOwner = makeAddr("newOwner");
        registry.set(AGENT, newOwner, address(0));
        _expectRule(ArcPayVault.Check.NotAgentOperator);
        vm.prank(agentOwner);
        vault.executePayroll(id, AGENT);
        vm.prank(newOwner);
        vault.executePayroll(id, AGENT);
        assertEq(usdc.balanceOf(bob), 100e6);
    }

    function test_RevertExecute_TimestampOverflow() public {
        vm.warp(uint256(type(uint64).max) - 10);
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(agentOwner);
        vm.expectRevert(ArcPayVault.TimestampOverflow.selector);
        vault.executePayroll(id, AGENT);
    }

    // ---------- failed-transfer refund paths in executePayroll ----------

    function test_Execute_FalseReturningRecipientRefunded() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        usdc.setFailMode(bob, 1);

        vm.expectEmit(true, true, false, true, address(vault));
        emit PaymentFailed(id, bob, 100e6);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(id, alice, carol, 50e6);
        vm.expectEmit(true, true, true, true, address(vault));
        emit PayrollExecuted(id, AGENT, agentOwner, 50e6, 100e6, 1);
        _exec(id);

        assertEq(usdc.balanceOf(bob), 0);
        assertEq(usdc.balanceOf(carol), 50e6);
        assertEq(vault.balanceOf(alice), 450e6); // 500 - 150 + 100 refund
        assertEq(vault.totalDeposits(), 450e6);
        assertEq(usdc.balanceOf(address(vault)), 450e6);
        (,,, uint64 next, uint32 execs,,, uint256 spent,,,) = vault.getPlan(id);
        assertEq(spent, 50e6); // only the successful part counts against the cap
        assertEq(execs, 1); // the scheduled run is still consumed
        assertEq(next, uint64(block.timestamp + 1 days));
    }

    function test_Execute_RevertingRecipientRefunded() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        usdc.setFailMode(carol, 2);

        vm.expectEmit(true, true, false, true, address(vault));
        emit PaymentFailed(id, carol, 50e6);
        vm.expectEmit(true, true, true, true, address(vault));
        emit PayrollExecuted(id, AGENT, agentOwner, 100e6, 50e6, 1);
        _exec(id);

        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(carol), 0);
        assertEq(vault.balanceOf(alice), 400e6);
        assertEq(vault.totalDeposits(), 400e6);
        assertEq(usdc.balanceOf(address(vault)), 400e6);
        (,,,,,,, uint256 spent,,,) = vault.getPlan(id);
        assertEq(spent, 100e6);
    }

    function test_Execute_AllFailFullRefundAndRunConsumed() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 1, 150e6);
        usdc.setFailMode(bob, 1);
        usdc.setFailMode(carol, 2);
        _exec(id);
        assertEq(vault.balanceOf(alice), 500e6);
        assertEq(vault.totalDeposits(), 500e6);
        assertEq(usdc.balanceOf(address(vault)), 500e6);
        (,,,, uint32 execs,,, uint256 spent, bool active,,) = vault.getPlan(id);
        assertEq(execs, 1);
        assertEq(spent, 0);
        assertFalse(active); // max executions of 1 consumed even though nothing was paid
    }

    function test_Execute_FailedPaymentFreesSpendCapForLaterRun() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 5, 200e6);
        usdc.setFailMode(bob, 1);
        _exec(id); // spent = 50
        usdc.setFailMode(bob, 0);
        skip(1 days);
        _exec(id); // 50 + 150 = 200 <= cap
        (,,,,,,, uint256 spent,,,) = vault.getPlan(id);
        assertEq(spent, 200e6);
        assertEq(usdc.balanceOf(bob), 100e6);
    }

    /// @dev Informational: a no-return-data token cannot be decoded by `try ... returns (bool)`; the decode
    /// failure is outside the try/catch so the whole payroll reverts and state is rolled back.
    function test_Execute_NoReturnDataTokenRevertsAtomically() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        usdc.setFailMode(carol, 3);
        vm.prank(agentOwner);
        vm.expectRevert();
        vault.executePayroll(id, AGENT);
        assertEq(vault.balanceOf(alice), 500e6);
        (,,,, uint32 execs,,,,,,) = vault.getPlan(id);
        assertEq(execs, 0);
    }

    // ---------- gas stress (informational) ----------

    function test_Gas_ExecutePayroll100Recipients() public {
        _deposit(alice, 1_000e6);
        address[] memory r = new address[](100);
        uint256[] memory a = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            r[i] = address(uint160(0x9000 + i));
            a[i] = 1e6;
        }
        vm.prank(alice);
        uint256 id = vault.createPlan(AGENT, r, a, 1 days, 0, 2, 200e6);
        uint256 g = gasleft();
        _exec(id);
        emit log_named_uint("executePayroll(100 recipients) gas", g - gasleft());
        assertEq(usdc.balanceOf(address(uint160(0x9000 + 99))), 1e6);
    }

    function test_Gas_ExecutePayroll100RecipientsAllFail() public {
        _deposit(alice, 1_000e6);
        address[] memory r = new address[](100);
        uint256[] memory a = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            r[i] = address(uint160(0x9000 + i));
            a[i] = 1e6;
            usdc.setFailMode(r[i], 2);
        }
        vm.prank(alice);
        uint256 id = vault.createPlan(AGENT, r, a, 1 days, 0, 2, 200e6);
        uint256 g = gasleft();
        _exec(id);
        emit log_named_uint("executePayroll(100 failing recipients) gas", g - gasleft());
        assertEq(vault.balanceOf(alice), 1_000e6);
        assertEq(vault.totalDeposits(), 1_000e6);
    }
}
