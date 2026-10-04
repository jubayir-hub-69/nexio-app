// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/// @notice Stakes Arc ERC-20 USDC (6 decimals). Amounts are token units, not native 18-decimal gas units.
contract NexioUSDCVault {
    IERC20 public immutable usdc;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeTime;
    mapping(address => uint256) public earnedYield;

    uint256 private locked;

    modifier nonReentrant() {
        require(locked == 0, "Reentrant");
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "Zero address");
        usdc = IERC20(_usdc);
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Deposit amount must be > 0");

        _updateYield(msg.sender);
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed. Check allowance.");

        stakedBalance[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Withdraw amount must be > 0");
        require(stakedBalance[msg.sender] >= amount, "Insufficient balance");

        _updateYield(msg.sender);
        stakedBalance[msg.sender] -= amount;

        require(usdc.transfer(msg.sender, amount), "Transfer failed");
    }

    function _updateYield(address user) internal {
        if (stakedBalance[user] > 0) {
            uint256 timeStaked = block.timestamp - lastStakeTime[user];
            earnedYield[user] += (stakedBalance[user] * timeStaked) / 3600;
        }
        lastStakeTime[user] = block.timestamp;
    }

    function getPendingYield(address user) external view returns (uint256) {
        if (stakedBalance[user] == 0) return earnedYield[user];
        uint256 timeStaked = block.timestamp - lastStakeTime[user];
        return earnedYield[user] + ((stakedBalance[user] * timeStaked) / 3600);
    }
}
