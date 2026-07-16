// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// Demo contract for Flex. Deliberately vulnerable — do NOT deploy.
/// Contains, by design:
///   1. Reentrancy in withdraw() (state updated after external call)   [all 3 catch]
///   2. tx.origin authentication in onlyOwner                          [2 of 3 catch]
///   3. Unbounded loop in distribute()                                 [1 of 3 catch]
///   4. Missing zero-address check in setOwner()                       [1 of 3 catch]
contract Vault {
    mapping(address => uint256) public balances;
    address public owner;
    address[] public users;

    modifier onlyOwner() {
        require(tx.origin == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        if (balances[msg.sender] == 0) users.push(msg.sender);
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function distribute(uint256 amount) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            payable(users[i]).transfer(amount);
        }
    }
}
