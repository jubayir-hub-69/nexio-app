// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Nexio Daily GM Protocol
/// @notice Enforces a 24-hour check-in cooldown and a strict 48-hour consecutive streak window.
contract DailyGM {
    mapping(address => uint256) public lastCheckIn;
    mapping(address => uint256) public streak;

    event CheckedIn(address indexed user, uint256 streak, uint256 timestamp);

    function checkIn() external {
        uint256 last = lastCheckIn[msg.sender];
        require(last == 0 || block.timestamp >= last + 24 hours, "Wait 24 hours before next GM");

        if (last == 0 || block.timestamp > last + 48 hours) {
            streak[msg.sender] = 1;
        } else {
            streak[msg.sender] += 1;
        }

        lastCheckIn[msg.sender] = block.timestamp;
        emit CheckedIn(msg.sender, streak[msg.sender], block.timestamp);
    }

    function getEffectiveStreak(address user) external view returns (uint256) {
        uint256 last = lastCheckIn[user];
        if (last == 0 || block.timestamp > last + 48 hours) {
            return 0;
        }
        return streak[user];
    }

    function getStreakWindow(address user)
        external
        view
        returns (uint256 effectiveStreak, uint256 nextCheckInAt, uint256 expiresAt)
    {
        uint256 last = lastCheckIn[user];
        if (last == 0) {
            return (0, 0, 0);
        }
        uint256 eff = block.timestamp > last + 48 hours ? 0 : streak[user];
        return (eff, last + 24 hours, last + 48 hours);
    }
}
