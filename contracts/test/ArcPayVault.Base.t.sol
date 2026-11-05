// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ArcPayVault} from "../ArcPayVault.sol";

interface ITokenHook {
    function onTokenHook() external;
}

/// @dev 6-decimal ERC-20 with per-recipient misbehaviour switches and ERC-777-style hooks.
contract MockUSDC is ERC20 {
    // 0 = normal, 1 = return false, 2 = revert, 3 = return no data
    mapping(address => uint8) public failMode;
    bool public hooksEnabled;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailMode(address who, uint8 mode) external {
        failMode[who] = mode;
    }

    function setHooks(bool on) external {
        hooksEnabled = on;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint8 m = failMode[to];
        if (m == 1) return false;
        if (m == 2) revert("blocked");
        if (m == 3) {
            assembly {
                return(0, 0)
            }
        }
        bool ok = super.transfer(to, amount);
        if (hooksEnabled && to.code.length > 0) ITokenHook(to).onTokenHook();
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (hooksEnabled && from.code.length > 0) ITokenHook(from).onTokenHook();
        return super.transferFrom(from, to, amount);
    }
}

/// @dev Minimal ERC-8004 identity registry mock.
contract MockIdentityRegistry {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public wallets;
    mapping(uint256 => bool) public revertOwner;
    mapping(uint256 => bool) public revertWallet;

    function set(uint256 id, address agentOwner, address wallet) external {
        owners[id] = agentOwner;
        wallets[id] = wallet;
    }

    function setReverts(uint256 id, bool ownerReverts, bool walletReverts) external {
        revertOwner[id] = ownerReverts;
        revertWallet[id] = walletReverts;
    }

    function ownerOf(uint256 id) external view returns (address) {
        require(!revertOwner[id], "ownerOf reverted");
        return owners[id];
    }

    function getAgentWallet(uint256 id) external view returns (address) {
        require(!revertWallet[id], "wallet reverted");
        return wallets[id];
    }
}

/// @dev Malicious actor: on a token hook it replays `payload` against the vault and records the outcome.
contract Reenterer is ITokenHook {
    address public vault;
    bytes public payload;
    bool public armed;
    bool public fired;
    bool public lastSuccess;
    bytes public lastRet;
    bool public revertInHook;

    constructor(address vault_) {
        vault = vault_;
    }

    function arm(bytes calldata data) external {
        payload = data;
        armed = true;
        fired = false;
    }

    function setRevertInHook(bool v) external {
        revertInHook = v;
    }

    function execOn(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    function onTokenHook() external {
        if (revertInHook) revert("hook revert");
        if (!armed || fired) return;
        fired = true;
        (lastSuccess, lastRet) = vault.call(payload);
    }
}

abstract contract ArcPayVaultTestBase is Test {
    ArcPayVault internal vault;
    MockUSDC internal usdc;
    MockIdentityRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal agentOwner = makeAddr("agentOwner");
    address internal agentWallet = makeAddr("agentWallet");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AGENT = 1;
    uint256 internal constant AGENT2 = 2;
    uint256 internal constant FUND = 1_000_000e6;

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

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        registry = new MockIdentityRegistry();
        vault = new ArcPayVault(owner, address(usdc), address(registry));
        registry.set(AGENT, agentOwner, agentWallet);
        registry.set(AGENT2, makeAddr("agent2Owner"), address(0));
        usdc.mint(alice, FUND);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ---------- helpers ----------

    function _deposit(address who, uint256 amount) internal {
        if (usdc.balanceOf(who) < amount) usdc.mint(who, amount - usdc.balanceOf(who));
        vm.startPrank(who);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function _a1(address a) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = a;
    }

    function _u1(uint256 v) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = v;
    }

    function _a2(address a, address b) internal pure returns (address[] memory r) {
        r = new address[](2);
        r[0] = a;
        r[1] = b;
    }

    function _u2(uint256 x, uint256 y) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = x;
        r[1] = y;
    }

    /// @dev Creates a plan from `payer`: recipients [bob, carol] x [100e6, 50e6] (150e6/run).
    function _plan(address payer, uint64 first, uint32 maxExec, uint256 cap) internal returns (uint256 id) {
        vm.prank(payer);
        id = vault.createPlan(AGENT, _a2(bob, carol), _u2(100e6, 50e6), 1 days, first, maxExec, cap);
    }

    function _planDefault() internal returns (uint256) {
        return _plan(alice, 0, 3, 450e6);
    }

    function _exec(uint256 planId) internal {
        vm.prank(agentOwner);
        vault.executePayroll(planId, AGENT);
    }

    function _sumTokenBalances(address[] memory who) internal view returns (uint256 s) {
        for (uint256 i; i < who.length; ++i) s += usdc.balanceOf(who[i]);
    }
}
