// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DailyGM {
    mapping(address => uint256) public lastCheckIn;
    mapping(address => uint256) public streak;

    event CheckedIn(address indexed user, uint256 streak, uint256 timestamp);

    function checkIn() external {
        // Ensure 24 hours have passed since the last check-in
        require(block.timestamp >= lastCheckIn[msg.sender] + 24 hours, "Wait 24 hours before next GM");
        
        streak[msg.sender] += 1;
        lastCheckIn[msg.sender] = block.timestamp;

        emit CheckedIn(msg.sender, streak[msg.sender], block.timestamp);
    }
}