// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract NexioVault {
    IERC20 public stablecoin;
    
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

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Zero address");
        stablecoin = IERC20(_tokenAddress);
    }

    // Users deposit ERC-20 stablecoins (EURC on Arc uses 6 decimals).
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Deposit amount must be > 0");
        
        _updateYield(msg.sender);
        require(stablecoin.transferFrom(msg.sender, address(this), amount), "Transfer failed. Check allowance.");
        
        stakedBalance[msg.sender] += amount;
    }

    // Users withdraw funds
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Withdraw amount must be > 0");
        require(stakedBalance[msg.sender] >= amount, "Insufficient balance");

        _updateYield(msg.sender);
        stakedBalance[msg.sender] -= amount;
        
        require(stablecoin.transfer(msg.sender, amount), "Transfer failed");
    }

    // Internal function to update yield automatically
    function _updateYield(address user) internal {
        if (stakedBalance[user] > 0) {
            uint256 timeStaked = block.timestamp - lastStakeTime[user];
            // Yield calculated per hour
            earnedYield[user] += (stakedBalance[user] * timeStaked) / 3600;
        }
        lastStakeTime[user] = block.timestamp;
    }

    // View function for frontend dashboard display
    function getPendingYield(address user) external view returns (uint256) {
        if (stakedBalance[user] == 0) return earnedYield[user];
        uint256 timeStaked = block.timestamp - lastStakeTime[user];
        return earnedYield[user] + ((stakedBalance[user] * timeStaked) / 3600);
    }
}