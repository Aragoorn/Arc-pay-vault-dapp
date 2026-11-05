// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ArcPayVaultTestBase} from "./ArcPayVault.Base.t.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

contract ArcPayVaultPlansTest is ArcPayVaultTestBase {
    // ---------- createPlan ----------

    function test_CreatePlan_StoresPlanAndEmits() public {
        uint64 first = uint64(block.timestamp + 1 hours);
        vm.expectEmit(true, true, true, true, address(vault));
        emit PlanCreated(1, alice, AGENT, 2, 150e6, 1 days, first);
        uint256 id = _plan(alice, first, 3, 450e6);

        assertEq(id, 1);
        assertEq(vault.planCount(), 1);
        (
            address payer,
            uint256 agentId,
            uint64 interval,
            uint64 next,
            uint32 execs,
            uint32 maxE,
            uint256 cap,
            uint256 spent,
            bool active,
            address[] memory r,
            uint256[] memory a
        ) = vault.getPlan(id);
        assertEq(payer, alice);
        assertEq(agentId, AGENT);
        assertEq(interval, 1 days);
        assertEq(next, first);
        assertEq(execs, 0);
        assertEq(maxE, 3);
        assertEq(cap, 450e6);
        assertEq(spent, 0);
        assertTrue(active);
        assertEq(r.length, 2);
        assertEq(r[0], bob);
        assertEq(r[1], carol);
        assertEq(a[0], 100e6);
        assertEq(a[1], 50e6);
        uint256[] memory ids = vault.getPlanIdsByPayer(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], 1);
    }

    function test_CreatePlan_ZeroFirstExecutionMeansNow_NoFundsRequiredOrLocked() public {
        uint256 id = _planDefault(); // alice has no vault balance
        (,,, uint64 next,,,,,,,) = vault.getPlan(id);
        assertEq(next, uint64(block.timestamp));
        assertEq(vault.totalDeposits(), 0);
    }

    function test_CreatePlan_IntervalBoundsAccepted() public {
        vm.startPrank(alice);
        vault.createPlan(AGENT, _a1(bob), _u1(1), 60, 0, 1, 1);
        vault.createPlan(AGENT, _a1(bob), _u1(1), 365 days, 0, 1, 1);
        vm.stopPrank();
        assertEq(vault.planCount(), 2);
    }

    function test_CreatePlan_FirstExecutionEqualNowAccepted() public {
        uint256 id = _plan(alice, uint64(block.timestamp), 1, 150e6);
        assertEq(id, 1);
    }

    function test_RevertCreatePlan_Validation() public {
        address[] memory r = _a1(bob);
        uint256[] memory a = _u1(10e6);
        vm.startPrank(alice);

        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidArrayLengths.selector, 2, 1));
        vault.createPlan(AGENT, _a2(bob, carol), a, 1 days, 0, 1, 10e6);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipientCount.selector, 0, 100));
        vault.createPlan(AGENT, new address[](0), new uint256[](0), 1 days, 0, 1, 10e6);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipient.selector, 0));
        vault.createPlan(AGENT, _a1(address(0)), a, 1 days, 0, 1, 10e6);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipient.selector, 0));
        vault.createPlan(AGENT, _a1(address(vault)), a, 1 days, 0, 1, 10e6);
        vm.expectRevert(ArcPayVault.ZeroAmount.selector);
        vault.createPlan(AGENT, r, _u1(0), 1 days, 0, 1, 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(ArcPayVault.InvalidInterval.selector, uint64(59), uint64(60), uint64(365 days))
        );
        vault.createPlan(AGENT, r, a, 59, 0, 1, 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                ArcPayVault.InvalidInterval.selector, uint64(365 days + 1), uint64(60), uint64(365 days)
            )
        );
        vault.createPlan(AGENT, r, a, uint64(365 days + 1), 0, 1, 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                ArcPayVault.InvalidFirstExecutionAt.selector, uint64(block.timestamp - 1), block.timestamp
            )
        );
        vault.createPlan(AGENT, r, a, 1 days, uint64(block.timestamp - 1), 1, 10e6);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidMaxExecutions.selector, uint32(0)));
        vault.createPlan(AGENT, r, a, 1 days, 0, 0, 10e6);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidSpendCap.selector, 10e6 - 1, 10e6));
        vault.createPlan(AGENT, r, a, 1 days, 0, 1, 10e6 - 1);
        vm.stopPrank();
        assertEq(vault.planCount(), 0);
    }

    function test_RevertCreatePlan_TooManyRecipients() public {
        address[] memory r = new address[](101);
        uint256[] memory a = new uint256[](101);
        for (uint256 i; i < 101; ++i) {
            r[i] = address(uint160(0x7000 + i));
            a[i] = 1;
        }
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipientCount.selector, 101, 100));
        vault.createPlan(AGENT, r, a, 1 days, 0, 1, 101);
    }

    function test_RevertCreatePlan_InvalidAgent() public {
        vm.startPrank(alice);
        // never-registered id -> ownerOf returns address(0)
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidAgent.selector, 99));
        vault.createPlan(99, _a1(bob), _u1(1), 1 days, 0, 1, 1);
        // registry reverts (like an ERC-721 for nonexistent token)
        registry.setReverts(AGENT, true, false);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidAgent.selector, AGENT));
        vault.createPlan(AGENT, _a1(bob), _u1(1), 1 days, 0, 1, 1);
        vm.stopPrank();
    }

    function test_RevertCreatePlan_WhenPaused() public {
        vm.prank(owner);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.createPlan(AGENT, _a1(bob), _u1(1), 1 days, 0, 1, 1);
    }

    function test_RevertCreatePlan_TimestampOverflow() public {
        vm.warp(uint256(type(uint64).max) + 1);
        vm.prank(alice);
        vm.expectRevert(ArcPayVault.TimestampOverflow.selector);
        vault.createPlan(AGENT, _a1(bob), _u1(1), 1 days, 0, 1, 1);
    }

    // ---------- cancelPlan / setPlanAgent ----------

    function test_CancelPlan_PayerOnlyAndEmits() public {
        uint256 id = _planDefault();
        vm.expectEmit(true, false, false, false, address(vault));
        emit PlanCancelled(id);
        vm.prank(alice);
        vault.cancelPlan(id);
        (,,,,,,,, bool active,,) = vault.getPlan(id);
        assertFalse(active);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.PlanInactive));
    }

    function test_RevertCancelPlan_NotPayer() public {
        uint256 id = _planDefault();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotPlanPayer.selector, id, bob));
        vault.cancelPlan(id);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotPlanPayer.selector, id, owner));
        vault.cancelPlan(id);
        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotPlanPayer.selector, id, agentOwner));
        vault.cancelPlan(id);
    }

    function test_RevertCancelPlan_UnknownPlan() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotPlanPayer.selector, 42, alice));
        vault.cancelPlan(42);
    }

    function test_SetPlanAgent_PayerOnlyAndEmits() public {
        uint256 id = _planDefault();
        vm.expectEmit(true, true, false, false, address(vault));
        emit PlanAgentChanged(id, AGENT2);
        vm.prank(alice);
        vault.setPlanAgent(id, AGENT2);
        (, uint256 agentId,,,,,,,,,) = vault.getPlan(id);
        assertEq(agentId, AGENT2);
        // old agent is now locked out
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.AgentMismatch));
    }

    function test_RevertSetPlanAgent_NotPayer() public {
        uint256 id = _planDefault();
        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotPlanPayer.selector, id, agentOwner));
        vault.setPlanAgent(id, AGENT2);
    }

    function test_RevertSetPlanAgent_Inactive() public {
        uint256 id = _planDefault();
        vm.startPrank(alice);
        vault.cancelPlan(id);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InactivePlan.selector, id));
        vault.setPlanAgent(id, AGENT2);
        vm.stopPrank();
    }

    function test_RevertSetPlanAgent_InvalidAgent() public {
        uint256 id = _planDefault();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidAgent.selector, 77));
        vault.setPlanAgent(id, 77);
    }

    // ---------- isAgentOperator ----------

    function test_IsAgentOperator_OwnerAndWallet() public view {
        assertTrue(vault.isAgentOperator(AGENT, agentOwner));
        assertTrue(vault.isAgentOperator(AGENT, agentWallet));
        assertFalse(vault.isAgentOperator(AGENT, stranger));
        assertFalse(vault.isAgentOperator(AGENT, address(0)));
    }

    function test_IsAgentOperator_ZeroWalletDoesNotMatchZeroOperator() public view {
        assertFalse(vault.isAgentOperator(AGENT2, address(0)));
        assertFalse(vault.isAgentOperator(12345, address(0)));
    }

    function test_IsAgentOperator_RegistryLookupFailuresAreNonMatches() public {
        registry.setReverts(AGENT, true, false);
        assertFalse(vault.isAgentOperator(AGENT, agentOwner));
        assertTrue(vault.isAgentOperator(AGENT, agentWallet)); // wallet lookup independent
        registry.setReverts(AGENT, false, true);
        assertTrue(vault.isAgentOperator(AGENT, agentOwner));
        assertFalse(vault.isAgentOperator(AGENT, agentWallet));
        registry.setReverts(AGENT, true, true);
        assertFalse(vault.isAgentOperator(AGENT, agentOwner));
    }

    function test_IsAgentOperator_FollowsOwnershipTransfer() public {
        address newOwner = makeAddr("newOwner");
        registry.set(AGENT, newOwner, agentWallet);
        assertFalse(vault.isAgentOperator(AGENT, agentOwner));
        assertTrue(vault.isAgentOperator(AGENT, newOwner));
    }

    // ---------- previewExecution: every Check code ----------

    function _preview(uint256 id, uint256 agentId, address op) internal view returns (ArcPayVault.Check c) {
        (c,) = vault.previewExecution(id, agentId, op);
    }

    function test_Check_Ok_ReturnsTotalPerRun() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        (ArcPayVault.Check c, uint256 total) = vault.previewExecution(id, AGENT, agentOwner);
        assertEq(uint8(c), uint8(ArcPayVault.Check.Ok));
        assertEq(total, 150e6);
    }

    function test_Check_Paused() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(owner);
        vault.pause();
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.Paused));
        // paused takes priority even over an unknown plan
        assertEq(uint8(_preview(999, AGENT, stranger)), uint8(ArcPayVault.Check.Paused));
    }

    function test_Check_PlanInactive_UnknownAndCancelled() public {
        _deposit(alice, 500e6);
        assertEq(uint8(_preview(999, AGENT, agentOwner)), uint8(ArcPayVault.Check.PlanInactive));
        uint256 id = _planDefault();
        vm.prank(alice);
        vault.cancelPlan(id);
        // inactive takes priority over wrong agent / wrong operator
        assertEq(uint8(_preview(id, 55, stranger)), uint8(ArcPayVault.Check.PlanInactive));
    }

    function test_Check_AgentMismatch() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        assertEq(uint8(_preview(id, AGENT2, agentOwner)), uint8(ArcPayVault.Check.AgentMismatch));
    }

    function test_Check_NotAgentOperator() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        assertEq(uint8(_preview(id, AGENT, stranger)), uint8(ArcPayVault.Check.NotAgentOperator));
        assertEq(uint8(_preview(id, AGENT, address(0))), uint8(ArcPayVault.Check.NotAgentOperator));
    }

    function test_Check_TooEarly() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, uint64(block.timestamp + 1 hours), 3, 450e6);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.TooEarly));
        skip(1 hours - 1);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.TooEarly));
        skip(1);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.Ok));
    }

    /// @dev MaxRunsReached cannot be reached through the public API: executePayroll deactivates the plan on the
    /// final run, so PlanInactive always wins. We force `executions == maxExecutions` with a storage write to
    /// confirm the defensive branch itself returns the right code.
    function test_Check_MaxRunsReached_ViaForcedStorage() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 2, 450e6);
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(id, uint256(5)))) + 2); // _plans mapping slot (5 since Ownable2Step added _pendingOwner)
        uint256 word = uint256(vm.load(address(vault), slot));
        word = (word & ~(uint256(0xffffffff) << 128)) | (uint256(2) << 128);
        vm.store(address(vault), slot, bytes32(word));
        (,,,, uint32 execs, uint32 maxE,,, bool active,,) = vault.getPlan(id);
        assertEq(execs, 2);
        assertEq(maxE, 2);
        assertTrue(active);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.MaxRunsReached));
    }

    function test_Check_FinalRunLeadsToPlanInactiveNotMaxRuns() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 1, 150e6);
        _exec(id);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.PlanInactive));
    }

    function test_Check_SpendCapExceeded() public {
        _deposit(alice, 500e6);
        uint256 id = _plan(alice, 0, 5, 200e6); // only one 150e6 run fits
        _exec(id);
        skip(1 days);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.SpendCapExceeded));
    }

    function test_Check_InsufficientBalance() public {
        _deposit(alice, 149e6);
        uint256 id = _planDefault();
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.InsufficientBalance));
        _deposit(alice, 1e6);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.Ok));
    }

    function test_Check_PriorityOrder_TooEarlyBeforeInsufficientBalance() public {
        uint256 id = _plan(alice, uint64(block.timestamp + 1 hours), 3, 450e6);
        assertEq(uint8(_preview(id, AGENT, agentOwner)), uint8(ArcPayVault.Check.TooEarly));
    }
}
