// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-8004 identity-registry surface used by the vault.
interface IIdentityRegistry {
    /// @notice Returns the current ERC-721 owner of an agent identity.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice Returns the wallet registered for an agent identity.
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/**
 * @title ArcPay Automated Vault
 * @notice USDC custody with depositor-controlled payments and rule-gated agent payroll.
 * @dev Amounts are raw USDC units (6 decimals). Plans do not reserve funds.
 * Arc Testnet configuration: USDC 0x3600000000000000000000000000000000000000;
 * identity registry 0x8004A818BFB912233c491871b3d84c89A494BD9e.
 * The configured token must be the standard, non-rebasing, non-fee-on-transfer USDC.
 * Ownership grants no authority to withdraw, sweep, or redirect depositor funds.
 * @dev All depositor USDC is pooled at the vault address. If the USDC issuer blocklists
 * the vault address, transfers out can fail for all depositors. Internal refunds and
 * pausing do not recover issuer-frozen funds. Operators should monitor for issuer
 * blocklisting and stop deposits during an incident.
 */
contract ArcPayVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RECIPIENTS = 100;
    uint64 public constant MIN_INTERVAL = 60;
    uint64 public constant MAX_INTERVAL = 365 days;

    IERC20 public immutable usdc;
    IIdentityRegistry public immutable identityRegistry;

    mapping(address => uint256) public balances;
    uint256 public totalDeposits;
    uint256 public planCount;

    enum Check {
        Ok,
        Paused,
        PlanInactive,
        AgentMismatch,
        NotAgentOperator,
        TooEarly,
        MaxRunsReached,
        SpendCapExceeded,
        InsufficientBalance
    }

    struct Plan {
        address payer;
        uint256 agentId;
        uint64 interval;
        uint64 nextExecutionAt;
        uint32 executions;
        uint32 maxExecutions;
        uint256 spendCap;
        uint256 spent;
        bool active;
        address[] recipients;
        uint256[] amounts;
    }

    mapping(uint256 => Plan) private _plans;
    mapping(address => uint256[]) private _planIdsByPayer;

    error ZeroAddress();
    error NotAContract(address account);
    error ZeroAmount();
    error InvalidArrayLengths(uint256 recipientsLength, uint256 amountsLength);
    error InvalidRecipientCount(uint256 count, uint256 maxCount);
    error InvalidRecipient(uint256 index);
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidInterval(uint64 interval, uint64 minInterval, uint64 maxInterval);
    error InvalidFirstExecutionAt(uint64 firstExecutionAt, uint256 currentTimestamp);
    error InvalidMaxExecutions(uint32 maxExecutions);
    error InvalidSpendCap(uint256 spendCap, uint256 requiredMinimum);
    error InvalidAgent(uint256 agentId);
    error NotPlanPayer(uint256 planId, address caller);
    error InactivePlan(uint256 planId);
    error TimestampOverflow();
    error RuleViolated(Check code);
    error RenounceDisabled();

    event Deposited(address indexed account, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed account, uint256 amount, uint256 newBalance);
    event BatchTransferred(address indexed payer, uint256 count, uint256 total);
    event PaymentSent(uint256 indexed planId, address payer, address indexed recipient, uint256 amount);
    event PaymentFailed(uint256 indexed planId, address indexed recipient, uint256 amount);
    event PlanCreated(
        uint256 indexed planId,
        address indexed payer,
        uint256 indexed agentId,
        uint256 recipientCount,
        uint256 totalPerRun,
        uint64 interval,
        uint64 firstExecutionAt
    );
    event PlanCancelled(uint256 indexed planId);
    event PlanAgentChanged(uint256 indexed planId, uint256 indexed newAgentId);
    event PayrollRuleVerified(uint256 indexed planId, uint256 indexed agentId, address indexed operator);
    event PayrollExecuted(
        uint256 indexed planId,
        uint256 indexed agentId,
        address indexed operator,
        uint256 paidTotal,
        uint256 failedTotal,
        uint32 runIndex
    );

    /// @notice Configures ownership, the USDC token, and the ERC-8004 registry.
    /// @dev Ownable rejects a zero initialOwner with its own custom error.
    constructor(address initialOwner, address usdc_, address identityRegistry_) Ownable(initialOwner) {
        if (usdc_ == address(0) || identityRegistry_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert NotAContract(usdc_);
        if (identityRegistry_.code.length == 0) revert NotAContract(identityRegistry_);
        usdc = IERC20(usdc_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    /// @notice Deposits approved USDC into the caller's internal balance.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposited(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Withdraws the caller's own USDC; remains available while paused.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 available = balances[msg.sender];
        if (amount > available) revert InsufficientBalance(available, amount);
        balances[msg.sender] = available - amount;
        totalDeposits -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Attempts up to 100 payments, re-crediting the caller for failed transfers.
    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts)
        external
        nonReentrant
        whenNotPaused
    {
        uint256 total = _validatePayments(recipients, amounts);
        uint256 available = balances[msg.sender];
        if (total > available) revert InsufficientBalance(available, total);
        balances[msg.sender] = available - total;
        totalDeposits -= total;
        uint256 failedTotal;
        for (uint256 i; i < recipients.length; ++i) {
            if (!_payRecipient(0, msg.sender, recipients[i], amounts[i])) {
                failedTotal += amounts[i];
            }
        }
        emit BatchTransferred(msg.sender, recipients.length, total - failedTotal);
    }

    /// @notice Creates an immutable payment schedule, without locking the payer's funds.
    /// @dev A zero firstExecutionAt means now. Authorization follows the agent's current owner/wallet.
    function createPlan(
        uint256 agentId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint64 interval,
        uint64 firstExecutionAt,
        uint32 maxExecutions,
        uint256 spendCap
    ) external nonReentrant whenNotPaused returns (uint256 planId) {
        uint256 total = _validatePayments(recipients, amounts);
        if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) revert InvalidInterval(interval, MIN_INTERVAL, MAX_INTERVAL);
        if (firstExecutionAt == 0) firstExecutionAt = _timestamp64(block.timestamp);
        if (uint256(firstExecutionAt) < block.timestamp) revert InvalidFirstExecutionAt(firstExecutionAt, block.timestamp);
        if (maxExecutions == 0) revert InvalidMaxExecutions(maxExecutions);
        if (spendCap < total) revert InvalidSpendCap(spendCap, total);
        _requireAgent(agentId);

        planId = ++planCount;
        Plan storage plan = _plans[planId];
        plan.payer = msg.sender;
        plan.agentId = agentId;
        plan.interval = interval;
        plan.nextExecutionAt = firstExecutionAt;
        plan.maxExecutions = maxExecutions;
        plan.spendCap = spendCap;
        plan.active = true;
        plan.recipients = recipients;
        plan.amounts = amounts;
        _planIdsByPayer[msg.sender].push(planId);
        _emitPlanCreated(planId, plan, total);
    }

    /// @notice Cancels only the caller's own plan, including while the vault is paused.
    function cancelPlan(uint256 planId) external nonReentrant {
        Plan storage plan = _plans[planId];
        if (plan.payer != msg.sender) revert NotPlanPayer(planId, msg.sender);
        plan.active = false;
        emit PlanCancelled(planId);
    }

    /// @notice Assigns another existing agent to the caller's active plan.
    function setPlanAgent(uint256 planId, uint256 newAgentId) external nonReentrant {
        Plan storage plan = _plans[planId];
        if (plan.payer != msg.sender) revert NotPlanPayer(planId, msg.sender);
        if (!plan.active) revert InactivePlan(planId);
        _requireAgent(newAgentId);
        plan.agentId = newAgentId;
        emit PlanAgentChanged(planId, newAgentId);
    }

    /// @notice Reports the first failing rule and the plan's total scheduled per run.
    /// @dev Unknown plan IDs are inactive; registry lookup failures are handled as non-matches.
    function previewExecution(uint256 planId, uint256 agentId, address operator)
        external
        view
        returns (Check code, uint256 totalPerRun)
    {
        return _checkExecution(_plans[planId], agentId, operator);
    }

    /// @notice Checks the current agent owner and registered wallet, ignoring zero addresses.
    /// @dev Each registry lookup is independently guarded; a reverting lookup is not a match.
    function isAgentOperator(uint256 agentId, address operator) public view returns (bool) {
        if (operator == address(0)) return false;
        try identityRegistry.ownerOf(agentId) returns (address agentOwner) {
            if (agentOwner != address(0) && operator == agentOwner) return true;
        } catch {}
        try identityRegistry.getAgentWallet(agentId) returns (address agentWallet) {
            if (agentWallet != address(0) && operator == agentWallet) return true;
        } catch {}
        return false;
    }

    /// @notice Executes one due payroll run after all rules pass for the caller's agent identity.
    /// @dev Failed transfers are refunded internally, but still consume this scheduled execution.
    /// USDC must return a standard ERC-20 boolean; false and reverting transfers are failures.
    function executePayroll(uint256 planId, uint256 agentId) external nonReentrant {
        Plan storage plan = _plans[planId];
        (Check code, uint256 total) = _checkExecution(plan, agentId, msg.sender);
        if (code != Check.Ok) revert RuleViolated(code);

        plan.nextExecutionAt = _timestamp64(block.timestamp + uint256(plan.interval));
        ++plan.executions;
        plan.spent += total;
        balances[plan.payer] -= total;
        totalDeposits -= total;
        if (plan.executions == plan.maxExecutions) plan.active = false;

        emit PayrollRuleVerified(planId, agentId, msg.sender);
        uint256 failedTotal = _payPayroll(planId, plan);
        emit PayrollExecuted(planId, agentId, msg.sender, total - failedTotal, failedTotal, plan.executions);
    }

    /// @notice Returns every field of a plan; unknown IDs return the default empty plan.
    function getPlan(uint256 planId)
        external
        view
        returns (
            address payer,
            uint256 agentId,
            uint64 interval,
            uint64 nextExecutionAt,
            uint32 executions,
            uint32 maxExecutions,
            uint256 spendCap,
            uint256 spent,
            bool active,
            address[] memory recipients,
            uint256[] memory amounts
        )
    {
        Plan storage plan = _plans[planId];
        payer = plan.payer;
        agentId = plan.agentId;
        interval = plan.interval;
        nextExecutionAt = plan.nextExecutionAt;
        executions = plan.executions;
        maxExecutions = plan.maxExecutions;
        spendCap = plan.spendCap;
        spent = plan.spent;
        active = plan.active;
        recipients = plan.recipients;
        amounts = plan.amounts;
    }

    /// @notice Returns all plan IDs created by a payer, including inactive plans.
    /// @dev Intended for offchain reads; the returned history grows with the payer's plan count.
    function getPlanIdsByPayer(address payer) external view returns (uint256[] memory) {
        return _planIdsByPayer[payer];
    }

    /// @notice Returns a depositor's internal USDC balance in six-decimal units.
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    /// @notice Pauses deposits, manual batches, plan creation, and automated execution.
    function pause() external onlyOwner nonReentrant {
        _pause();
    }

    /// @notice Restores operations without changing user funds or plan configuration.
    function unpause() external onlyOwner nonReentrant {
        _unpause();
    }

    function renounceOwnership() public pure override(Ownable) {
        revert RenounceDisabled();
    }

    function _validatePayments(address[] calldata recipients, uint256[] calldata amounts)
        private
        view
        returns (uint256 total)
    {
        uint256 count = recipients.length;
        if (count != amounts.length) revert InvalidArrayLengths(count, amounts.length);
        if (count == 0 || count > MAX_RECIPIENTS) revert InvalidRecipientCount(count, MAX_RECIPIENTS);
        for (uint256 i; i < count; ++i) {
            if (recipients[i] == address(0) || recipients[i] == address(this)) revert InvalidRecipient(i);
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
        }
    }

    function _requireAgent(uint256 agentId) private view {
        try identityRegistry.ownerOf(agentId) returns (address agentOwner) {
            if (agentOwner == address(0)) revert InvalidAgent(agentId);
        } catch {
            revert InvalidAgent(agentId);
        }
    }

    function _checkExecution(Plan storage plan, uint256 agentId, address operator)
        private
        view
        returns (Check code, uint256 totalPerRun)
    {
        // Arrays are immutable after creation and bounded to MAX_RECIPIENTS.
        for (uint256 i; i < plan.amounts.length; ++i) totalPerRun += plan.amounts[i];
        if (paused()) return (Check.Paused, totalPerRun);
        if (!plan.active) return (Check.PlanInactive, totalPerRun);
        if (agentId != plan.agentId) return (Check.AgentMismatch, totalPerRun);
        if (!isAgentOperator(agentId, operator)) return (Check.NotAgentOperator, totalPerRun);
        if (block.timestamp < plan.nextExecutionAt) return (Check.TooEarly, totalPerRun);
        if (plan.executions >= plan.maxExecutions) return (Check.MaxRunsReached, totalPerRun);
        // Subtraction avoids overflowing an addition during a view-only rule check.
        if (plan.spent > plan.spendCap || totalPerRun > plan.spendCap - plan.spent) {
            return (Check.SpendCapExceeded, totalPerRun);
        }
        if (totalPerRun > balances[plan.payer]) return (Check.InsufficientBalance, totalPerRun);
        return (Check.Ok, totalPerRun);
    }

    function _payPayroll(uint256 planId, Plan storage plan) private returns (uint256 failedTotal) {
        for (uint256 i; i < plan.recipients.length; ++i) {
            address recipient = plan.recipients[i];
            uint256 amount = plan.amounts[i];
            if (!_payRecipient(planId, plan.payer, recipient, amount)) {
                plan.spent -= amount;
                failedTotal += amount;
            }
        }
    }

    function _payRecipient(uint256 planId, address payer, address recipient, uint256 amount)
        private
        returns (bool success)
    {
        try usdc.transfer(recipient, amount) returns (bool transferred) {
            success = transferred;
        } catch {
            success = false;
        }
        if (success) {
            emit PaymentSent(planId, payer, recipient, amount);
        } else {
            balances[payer] += amount;
            totalDeposits += amount;
            emit PaymentFailed(planId, recipient, amount);
        }
    }

    function _emitPlanCreated(uint256 planId, Plan storage plan, uint256 total) private {
        emit PlanCreated(
            planId,
            plan.payer,
            plan.agentId,
            plan.recipients.length,
            total,
            plan.interval,
            plan.nextExecutionAt
        );
    }

    function _timestamp64(uint256 timestamp) private pure returns (uint64) {
        if (timestamp > type(uint64).max) revert TimestampOverflow();
        return uint64(timestamp);
    }
}
