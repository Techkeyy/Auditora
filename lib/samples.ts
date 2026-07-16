import type { Mode } from "./types";

export const SAMPLES: Record<Mode, { label: string; value: string }> = {
  contract: {
    label: "Load vulnerable vault",
    value: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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
}`,
  },
  code: {
    label: "Load risky snippet",
    value: `// Express route — is this safe?
app.get("/user", (req, res) => {
  const id = req.query.id;
  const query = "SELECT * FROM users WHERE id = " + id;
  db.query(query, (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});`,
  },
  question: {
    label: "Load sample question",
    value: `Is it safe to store JWT access tokens in localStorage in a browser SPA? Give the definitive answer.`,
  },
};

export const PLACEHOLDER: Record<Mode, string> = {
  contract:
    "Paste Solidity source — or a fully compiled contract string (0x… EVM bytecode) — to send to the audit swarm…",
  code: "Paste a code snippet to review…",
  question: "Ask a technical question you're about to trust…",
};
