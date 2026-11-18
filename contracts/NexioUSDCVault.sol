// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title Nexio USDC Automated Vault & NLP Point Engine
/// @notice Stakes Arc ERC-20 USDC (6 decimals). 100 USDC staked for 86,400s accrues exact 10.0 NLP (10e18).
contract NexioUSDCVault {
    IERC20 public immutable usdc;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeTime;
    mapping(address => uint256) public accruedPoints;
    mapping(address => uint256) public claimedPoints;

    uint256 private locked = 1;

    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event NLPClaimed(address indexed user, uint256 amount, uint256 totalClaimed, uint256 timestamp);

    modifier nonReentrant() {
        require(locked == 1, "Reentrant");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "Zero address");
        usdc = IERC20(_usdc);
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Deposit amount must be > 0");

        _updatePoints(msg.sender);
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed. Check allowance.");

        stakedBalance[msg.sender] += amount;
        emit Deposited(msg.sender, amount, block.timestamp);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Withdraw amount must be > 0");
        require(stakedBalance[msg.sender] >= amount, "Insufficient balance");

        _updatePoints(msg.sender);
        stakedBalance[msg.sender] -= amount;

        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount, block.timestamp);
    }

    function claimNLP() external nonReentrant returns (uint256 claimed18) {
        _updatePoints(msg.sender);
        uint256 reward = accruedPoints[msg.sender];
        require(reward > 0, "No NLP available to claim");

        accruedPoints[msg.sender] = 0;
        claimedPoints[msg.sender] += reward;

        emit NLPClaimed(msg.sender, reward, claimedPoints[msg.sender], block.timestamp);
        return reward;
    }

    function _updatePoints(address user) internal {
        uint256 last = lastStakeTime[user];
        if (stakedBalance[user] > 0 && last > 0 && block.timestamp > last) {
            uint256 elapsed = block.timestamp - last;
            accruedPoints[user] += (stakedBalance[user] * 1e12 * elapsed) / 864000;
        }
        lastStakeTime[user] = block.timestamp;
    }

    function getPendingNLP(address user) public view returns (uint256) {
        uint256 pending = accruedPoints[user];
        uint256 last = lastStakeTime[user];
        if (stakedBalance[user] > 0 && last > 0 && block.timestamp > last) {
            uint256 elapsed = block.timestamp - last;
            pending += (stakedBalance[user] * 1e12 * elapsed) / 864000;
        }
        return pending;
    }

    function getLifetimeNLP(address user) external view returns (uint256) {
        return claimedPoints[user] + getPendingNLP(user);
    }

    function getPendingYield(address user) external view returns (uint256) {
        return getPendingNLP(user) / 1e12;
    }

    function earnedYield(address user) external view returns (uint256) {
        return accruedPoints[user] / 1e12;
    }
}
