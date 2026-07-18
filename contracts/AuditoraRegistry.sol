// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  AuditoraRegistry — a public audit-attestation registry for Monad
/// @notice Auditora runs a review board of AI agents over a deployed contract,
///         then anchors the verdict that survived adversarial challenge here.
///         Anyone can look up any address and see: has this been audited, when,
///         what did the board conclude — and does the code hash still match what
///         was audited.
///
///         Attestations bind to the target's EXTCODEHASH at audit time, so a
///         verdict can never be carried over to different code. (Known limit:
///         a proxy's own codehash never changes — registry consumers should
///         audit implementation addresses, not proxies.)
contract AuditoraRegistry {
    struct Attestation {
        bytes32 codehash;     // EXTCODEHASH of target at audit time
        bytes32 reportHash;   // keccak256 of the canonical report JSON
        uint8   posture;      // 0 = clean, 1 = no-consensus, 2 = corroborated
        uint16  corroborated; // findings confirmed (survived the Challenger)
        uint16  lone;         // findings disputed (Challenger could not fully rule out)
        uint64  timestamp;
        address attester;
    }

    /// A paid, onchain request for Auditora to audit `target`.
    struct Request {
        address target;
        address requester;
        uint96  paid;
        bool    fulfilled;
    }

    /// requestId sentinel for attestations not tied to any paid request.
    uint256 public constant NO_REQUEST = type(uint256).max;

    address public owner;
    address public attester;   // backend signer that writes verdicts
    uint256 public requestFee; // price of requesting an audit onchain

    mapping(address => Attestation[]) private _attestations;
    Request[] private _requests;

    event AuditRequested(
        uint256 indexed requestId,
        address indexed target,
        address indexed requester,
        uint256 paid
    );
    event Attested(
        address indexed target,
        uint256 indexed requestId,
        bytes32 codehash,
        bytes32 reportHash,
        uint8 posture,
        uint16 corroborated,
        uint16 lone
    );
    event FeeChanged(uint256 fee);
    event AttesterChanged(address attester);

    error NotOwner();
    error NotAttester();
    error FeeTooLow(uint256 sent, uint256 required);
    error NotAContract(address target);
    error BadRequest(uint256 requestId);

    constructor(uint256 fee) {
        owner = msg.sender;
        attester = msg.sender;
        requestFee = fee;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAttester() {
        if (msg.sender != attester) revert NotAttester();
        _;
    }

    // ---------------------------------------------------------------- writes

    /// @notice Pay the fee to queue any deployed contract for a board review.
    function requestAudit(address target) external payable returns (uint256 id) {
        if (msg.value < requestFee) revert FeeTooLow(msg.value, requestFee);
        if (target.code.length == 0) revert NotAContract(target);
        id = _requests.length;
        _requests.push(Request(target, msg.sender, uint96(msg.value), false));
        emit AuditRequested(id, target, msg.sender, msg.value);
    }

    /// @notice Anchor a board verdict for `target`. Pass NO_REQUEST when the
    ///         audit wasn't triggered by a paid onchain request.
    function attest(
        address target,
        bytes32 reportHash,
        uint8 posture,
        uint16 corroborated,
        uint16 lone,
        uint256 requestId
    ) external onlyAttester {
        if (target.code.length == 0) revert NotAContract(target);
        bytes32 ch = target.codehash;
        _attestations[target].push(
            Attestation(
                ch,
                reportHash,
                posture,
                corroborated,
                lone,
                uint64(block.timestamp),
                msg.sender
            )
        );
        if (requestId != NO_REQUEST) {
            if (
                requestId >= _requests.length ||
                _requests[requestId].target != target ||
                _requests[requestId].fulfilled
            ) revert BadRequest(requestId);
            _requests[requestId].fulfilled = true;
        }
        emit Attested(target, requestId, ch, reportHash, posture, corroborated, lone);
    }

    // ----------------------------------------------------------------- reads

    function attestationCount(address target) external view returns (uint256) {
        return _attestations[target].length;
    }

    /// @notice The most recent attestation for `target`, plus whether the
    ///         contract's CURRENT codehash still matches the audited one.
    function latest(address target)
        external
        view
        returns (Attestation memory a, bool fresh)
    {
        uint256 n = _attestations[target].length;
        require(n > 0, "no attestations");
        a = _attestations[target][n - 1];
        fresh = target.codehash == a.codehash;
    }

    function getAttestations(
        address target,
        uint256 offset,
        uint256 limit
    ) external view returns (Attestation[] memory page) {
        Attestation[] storage all = _attestations[target];
        if (offset >= all.length) return new Attestation[](0);
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new Attestation[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        if (id >= _requests.length) revert BadRequest(id);
        return _requests[id];
    }

    /// @notice Open (unfulfilled) requests, newest-first, up to `limit`.
    function openRequests(uint256 limit)
        external
        view
        returns (uint256[] memory ids, Request[] memory reqs)
    {
        uint256 n = _requests.length;
        uint256 found = 0;
        uint256[] memory tmp = new uint256[](limit);
        for (uint256 i = n; i > 0 && found < limit; i--) {
            if (!_requests[i - 1].fulfilled) {
                tmp[found++] = i - 1;
            }
        }
        ids = new uint256[](found);
        reqs = new Request[](found);
        for (uint256 j = 0; j < found; j++) {
            ids[j] = tmp[j];
            reqs[j] = _requests[tmp[j]];
        }
    }

    // ----------------------------------------------------------------- admin

    function setFee(uint256 fee) external onlyOwner {
        requestFee = fee;
        emit FeeChanged(fee);
    }

    function setAttester(address a) external onlyOwner {
        attester = a;
        emit AttesterChanged(a);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}
