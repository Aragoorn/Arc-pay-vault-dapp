// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ArcPayVaultTestBase, MockUSDC} from "./ArcPayVault.Base.t.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

contract ArcPayVaultCoreTest is ArcPayVaultTestBase {
    // ---------- deployment ----------

    function test_Deploy_SetsConfig() public view {
        assertEq(vault.owner(), owner);
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(address(vault.identityRegistry()), address(registry));
        assertEq(vault.totalDeposits(), 0);
        assertEq(vault.planCount(), 0);
        assertEq(vault.MAX_RECIPIENTS(), 100);
        assertEq(vault.MIN_INTERVAL(), 60);
        assertEq(vault.MAX_INTERVAL(), 365 days);
        assertFalse(vault.paused());
    }

    function test_Deploy_RevertsOnZeroUsdc() public {
        vm.expectRevert(ArcPayVault.ZeroAddress.selector);
        new ArcPayVault(owner, address(0), address(registry));
    }

    function test_Deploy_RevertsOnZeroRegistry() public {
        vm.expectRevert(ArcPayVault.ZeroAddress.selector);
        new ArcPayVault(owner, address(usdc), address(0));
    }

    function test_Deploy_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ArcPayVault(address(0), address(usdc), address(registry));
    }

    function test_Deploy_RevertsWhenUsdcIsEoa() public {
        address eoa = makeAddr("usdcEoa");
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotAContract.selector, eoa));
        new ArcPayVault(owner, eoa, address(registry));
    }

    function test_Deploy_RevertsWhenRegistryIsEoa() public {
        address eoa = makeAddr("registryEoa");
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotAContract.selector, eoa));
        new ArcPayVault(owner, address(usdc), eoa);
    }

    function test_Deploy_BothEoaReportsUsdcFirst() public {
        address eoaU = makeAddr("usdcEoa");
        address eoaR = makeAddr("registryEoa");
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotAContract.selector, eoaU));
        new ArcPayVault(owner, eoaU, eoaR);
    }

    function test_Deploy_ZeroAddressTakesPrecedenceOverNotAContract() public {
        address eoa = makeAddr("someEoa");
        vm.expectRevert(ArcPayVault.ZeroAddress.selector);
        new ArcPayVault(owner, eoa, address(0));
        vm.expectRevert(ArcPayVault.ZeroAddress.selector);
        new ArcPayVault(owner, address(0), eoa);
    }

    function testFuzz_Deploy_RevertsOnAnyCodelessAddress(address a) public {
        vm.assume(a != address(0) && a.code.length == 0);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotAContract.selector, a));
        new ArcPayVault(owner, a, address(registry));
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.NotAContract.selector, a));
        new ArcPayVault(owner, address(usdc), a);
    }

    // ---------- deposit ----------

    function test_Deposit_CreditsBalanceAndEmits() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit Deposited(alice, 100e6, 100e6);
        vm.prank(alice);
        vault.deposit(100e6);

        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.balances(alice), 100e6);
        assertEq(vault.totalDeposits(), 100e6);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
        assertEq(usdc.balanceOf(alice), FUND - 100e6);
    }

    function test_Deposit_Accumulates() public {
        _deposit(alice, 100e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit Deposited(alice, 40e6, 140e6);
        vm.prank(alice);
        vault.deposit(40e6);
        assertEq(vault.balanceOf(alice), 140e6);
    }

    function test_RevertDeposit_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcPayVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_RevertDeposit_WhenPaused() public {
        vm.prank(owner);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1e6);
    }

    function test_RevertDeposit_NoAllowance() public {
        usdc.mint(bob, 10e6);
        vm.prank(bob);
        vm.expectRevert();
        vault.deposit(10e6);
    }

    function test_RevertDeposit_InsufficientTokenBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.deposit(FUND + 1);
    }

    // ---------- withdraw ----------

    function test_Withdraw_ReturnsFundsAndEmits() public {
        _deposit(alice, 100e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(alice, 30e6, 70e6);
        vm.prank(alice);
        vault.withdraw(30e6);

        assertEq(vault.balanceOf(alice), 70e6);
        assertEq(vault.totalDeposits(), 70e6);
        assertEq(usdc.balanceOf(alice), FUND - 70e6);
        assertEq(usdc.balanceOf(address(vault)), 70e6);
    }

    function test_Withdraw_FullBalance() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.totalDeposits(), 0);
        assertEq(usdc.balanceOf(alice), FUND);
    }

    function test_RevertWithdraw_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ArcPayVault.ZeroAmount.selector);
        vault.withdraw(0);
    }

    function test_RevertWithdraw_Insufficient() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, 100e6, 100e6 + 1));
        vault.withdraw(100e6 + 1);
    }

    function test_RevertWithdraw_CannotTakeOthersFunds() public {
        _deposit(alice, 100e6);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, 0, 1));
        vault.withdraw(1);
    }

    function test_RevertWithdraw_TokenReturnsFalse_StateUntouched() public {
        _deposit(alice, 100e6);
        usdc.setFailMode(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(usdc)));
        vault.withdraw(10e6);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.totalDeposits(), 100e6);
    }

    function test_RevertWithdraw_TokenReverts_StateUntouched() public {
        _deposit(alice, 100e6);
        usdc.setFailMode(alice, 2);
        vm.prank(alice);
        vm.expectRevert(bytes("blocked"));
        vault.withdraw(10e6);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.totalDeposits(), 100e6);
    }

    // ---------- withdraw while paused ----------

    function test_Withdraw_WorksWhilePaused() public {
        _deposit(alice, 100e6);
        vm.prank(owner);
        vault.pause();
        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(alice, 100e6, 0);
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(usdc.balanceOf(alice), FUND);
        assertEq(vault.totalDeposits(), 0);
    }

    function test_Paused_BlocksDepositBatchCreatePlan_ButNotCancelOrSetAgent() public {
        _deposit(alice, 500e6);
        uint256 id = _planDefault();
        vm.prank(owner);
        vault.pause();

        vm.startPrank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1e6);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.batchTransfer(_a1(bob), _u1(1e6));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.createPlan(AGENT, _a1(bob), _u1(1e6), 1 days, 0, 1, 1e6);

        // payer retains control of their plan while paused
        vault.setPlanAgent(id, AGENT2);
        vault.cancelPlan(id);
        vm.stopPrank();
        (, uint256 agentId,,,,,,, bool active,,) = vault.getPlan(id);
        assertEq(agentId, AGENT2);
        assertFalse(active);
    }

    // ---------- batchTransfer ----------

    function test_Batch_PaysRecipientsAndEmits() public {
        _deposit(alice, 1_000e6);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(0, alice, bob, 100e6);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(0, alice, carol, 250e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, 2, 350e6);
        vm.prank(alice);
        vault.batchTransfer(_a2(bob, carol), _u2(100e6, 250e6));

        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(carol), 250e6);
        assertEq(vault.balanceOf(alice), 650e6);
        assertEq(vault.totalDeposits(), 650e6);
        assertEq(usdc.balanceOf(address(vault)), 650e6);
    }

    function test_Batch_DuplicateRecipientsAndSelf() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vault.batchTransfer(_a2(bob, bob), _u2(10e6, 20e6));
        assertEq(usdc.balanceOf(bob), 30e6);
        vm.prank(alice);
        vault.batchTransfer(_a1(alice), _u1(5e6)); // paying yourself goes to wallet, not internal balance
        assertEq(vault.balanceOf(alice), 65e6);
    }

    function test_Batch_MaxRecipients100() public {
        _deposit(alice, 1_000e6);
        address[] memory r = new address[](100);
        uint256[] memory a = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            r[i] = address(uint160(0x5000 + i));
            a[i] = 1e6;
        }
        vm.prank(alice);
        vault.batchTransfer(r, a);
        assertEq(vault.balanceOf(alice), 900e6);
        assertEq(usdc.balanceOf(address(uint160(0x5000 + 99))), 1e6);
    }

    function test_RevertBatch_LengthMismatch() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidArrayLengths.selector, 2, 1));
        vault.batchTransfer(_a2(bob, carol), _u1(1e6));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidArrayLengths.selector, 1, 2));
        vault.batchTransfer(_a1(bob), _u2(1e6, 1e6));
    }

    function test_RevertBatch_EmptyAndTooMany() public {
        _deposit(alice, 1_000e6);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipientCount.selector, 0, 100));
        vault.batchTransfer(new address[](0), new uint256[](0));
        address[] memory r = new address[](101);
        uint256[] memory a = new uint256[](101);
        for (uint256 i; i < 101; ++i) {
            r[i] = address(uint160(0x5000 + i));
            a[i] = 1;
        }
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipientCount.selector, 101, 100));
        vault.batchTransfer(r, a);
        vm.stopPrank();
    }

    function test_RevertBatch_ZeroAddressRecipient() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipient.selector, 1));
        vault.batchTransfer(_a2(bob, address(0)), _u2(1e6, 1e6));
    }

    function test_RevertBatch_VaultAsRecipient() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InvalidRecipient.selector, 0));
        vault.batchTransfer(_a1(address(vault)), _u1(1e6));
    }

    function test_RevertBatch_ZeroAmount() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(ArcPayVault.ZeroAmount.selector);
        vault.batchTransfer(_a2(bob, carol), _u2(1e6, 0));
    }

    function test_RevertBatch_InsufficientBalance() public {
        _deposit(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, 100e6, 101e6));
        vault.batchTransfer(_a2(bob, carol), _u2(50e6, 51e6));
    }

    function test_RevertBatch_WhenPaused() public {
        _deposit(alice, 100e6);
        vm.prank(owner);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.batchTransfer(_a1(bob), _u1(1e6));
    }

    // ---------- batch failed-transfer refunds ----------

    function test_Batch_FalseReturningRecipientIsRefunded() public {
        _deposit(alice, 1_000e6);
        usdc.setFailMode(bob, 1);
        vm.expectEmit(true, true, false, true, address(vault));
        emit PaymentFailed(0, bob, 100e6);
        vm.expectEmit(true, false, true, true, address(vault));
        emit PaymentSent(0, alice, carol, 250e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, 2, 250e6); // only successful total
        vm.prank(alice);
        vault.batchTransfer(_a2(bob, carol), _u2(100e6, 250e6));

        assertEq(usdc.balanceOf(bob), 0);
        assertEq(usdc.balanceOf(carol), 250e6);
        assertEq(vault.balanceOf(alice), 750e6);
        assertEq(vault.totalDeposits(), 750e6);
        assertEq(usdc.balanceOf(address(vault)), 750e6);
    }

    function test_Batch_RevertingRecipientIsRefunded() public {
        _deposit(alice, 1_000e6);
        usdc.setFailMode(carol, 2);
        vm.expectEmit(true, true, false, true, address(vault));
        emit PaymentFailed(0, carol, 250e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, 2, 100e6);
        vm.prank(alice);
        vault.batchTransfer(_a2(bob, carol), _u2(100e6, 250e6));

        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(carol), 0);
        assertEq(vault.balanceOf(alice), 900e6);
        assertEq(vault.totalDeposits(), 900e6);
        assertEq(usdc.balanceOf(address(vault)), 900e6);
    }

    function test_Batch_AllFail_FullRefund() public {
        _deposit(alice, 1_000e6);
        usdc.setFailMode(bob, 1);
        usdc.setFailMode(carol, 2);
        vm.expectEmit(true, false, false, true, address(vault));
        emit BatchTransferred(alice, 2, 0);
        vm.prank(alice);
        vault.batchTransfer(_a2(bob, carol), _u2(100e6, 250e6));
        assertEq(vault.balanceOf(alice), 1_000e6);
        assertEq(vault.totalDeposits(), 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    /// @dev Informational: a token returning no data breaks `try ... returns (bool)` decoding in the caller,
    /// which is NOT caught by `catch`, so the whole batch reverts. Standard USDC never does this.
    function test_Batch_NoReturnDataTokenRevertsWholeBatch() public {
        _deposit(alice, 1_000e6);
        usdc.setFailMode(bob, 3);
        vm.prank(alice);
        vm.expectRevert();
        vault.batchTransfer(_a2(carol, bob), _u2(1e6, 1e6));
        assertEq(vault.balanceOf(alice), 1_000e6);
        assertEq(usdc.balanceOf(carol), 0);
    }

    // ---------- access control ----------

    function test_Pause_OwnerOnlyAndEmits() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit Pausable.Paused(owner);
        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());

        vm.expectEmit(false, false, false, true, address(vault));
        emit Pausable.Unpaused(owner);
        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_RevertPause_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.pause();
    }

    function test_RevertUnpause_NonOwner() public {
        vm.prank(owner);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.unpause();
    }

    function test_RevertPause_AlreadyPaused() public {
        vm.startPrank(owner);
        vault.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.pause();
        vm.stopPrank();
    }

    function test_RevertUnpause_NotPaused() public {
        vm.prank(owner);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        vault.unpause();
    }

    function test_RevertRenounceOwnership_EvenForOwner() public {
        vm.prank(owner);
        vm.expectRevert(ArcPayVault.RenounceDisabled.selector);
        vault.renounceOwnership();
        assertEq(vault.owner(), owner);
    }

    function test_RevertRenounceOwnership_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(ArcPayVault.RenounceDisabled.selector);
        vault.renounceOwnership();
    }

    function test_TransferOwnership_OnlySetsPendingOwner() public {
        vm.expectEmit(true, true, false, false, address(vault));
        emit Ownable2Step.OwnershipTransferStarted(owner, bob);
        vm.prank(owner);
        vault.transferOwnership(bob);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), bob);
        // owner keeps pause rights; pending owner has none yet
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vault.pause();
        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());
    }

    function test_RevertTransferOwnership_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.transferOwnership(alice);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_RevertAcceptOwnership_NonPending() public {
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.acceptOwnership();
        // current owner is not the pending owner either
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vault.acceptOwnership();
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), bob);
    }

    function test_RevertAcceptOwnership_NoPendingTransfer() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.acceptOwnership();
    }

    function test_AcceptOwnership_PendingOwnerGainsPauseRights() public {
        vm.prank(owner);
        vault.transferOwnership(bob);

        vm.expectEmit(true, true, false, false, address(vault));
        emit Ownable.OwnershipTransferred(owner, bob);
        vm.prank(bob);
        vault.acceptOwnership();

        assertEq(vault.owner(), bob);
        assertEq(vault.pendingOwner(), address(0));

        vm.prank(bob);
        vault.pause();
        assertTrue(vault.paused());
        vm.prank(bob);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_AcceptOwnership_OldOwnerLosesRights() public {
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vault.pause();
        vm.prank(bob);
        vault.pause();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vault.unpause();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vault.transferOwnership(owner);
    }

    function test_AcceptOwnership_CannotBeReplayed() public {
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vault.acceptOwnership();
    }

    function test_TransferOwnership_OverwritesPendingOwner() public {
        vm.startPrank(owner);
        vault.transferOwnership(bob);
        vault.transferOwnership(carol);
        vm.stopPrank();
        assertEq(vault.pendingOwner(), carol);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vault.acceptOwnership();
        vm.prank(carol);
        vault.acceptOwnership();
        assertEq(vault.owner(), carol);
    }

    function test_RenounceDisabled_AfterOwnershipTransfer() public {
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();
        vm.prank(bob);
        vm.expectRevert(ArcPayVault.RenounceDisabled.selector);
        vault.renounceOwnership();
        assertEq(vault.owner(), bob);
    }

    function test_NewOwnerStillHasNoAccessToUserFunds() public {
        _deposit(alice, 100e6);
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, 0, 1));
        vault.withdraw(1);
        assertEq(vault.balanceOf(alice), 100e6);
    }

    function test_OwnerHasNoAccessToUserFunds() public {
        _deposit(alice, 100e6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ArcPayVault.InsufficientBalance.selector, 0, 1));
        vault.withdraw(1);
        assertEq(vault.balanceOf(alice), 100e6);
    }
}
