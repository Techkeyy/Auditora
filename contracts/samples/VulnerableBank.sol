// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VulnerableBank — an intentionally unsafe contract for testing Auditora.
/// @notice Deployed to Monad testnet as a live stress-test target. It holds real
///         (testnet) funds and has a single EOA owner, so Auditora's recon shows
///         funds-at-risk + EOA control, and the board should confirm real bugs:
///         - reentrancy in withdraw() (state updated after the external call)
///         - tx.origin authentication (phishable)
///         - unprotected owner drain + missing zero-address check on setOwner
///         DO NOT use anything like this in production.
contract VulnerableBank {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() payable {
        owner = msg.sender;
    }

    // tx.origin auth — phishable: a contract the owner calls can impersonate them.
    modifier onlyOwner() {
        require(tx.origin == owner, "not owner");
        _;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Reentrancy: sends ETH before zeroing the balance. Classic drain.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount; // state update AFTER the call
    }

    // Missing zero-address check — ownership can be bricked.
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // Unprotected-by-good-practice drain: whoever is owner takes everything.
    function drain() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "drain failed");
    }

    receive() external payable {}
}
