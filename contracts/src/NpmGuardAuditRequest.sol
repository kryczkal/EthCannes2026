// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NpmGuardAuditRequest {
    event AuditRequested(
        string packageName,
        string version,
        address indexed requester
    );

    event AuditRequestedByKey(
        bytes32 indexed key,
        address indexed requester
    );

    address public owner;
    uint256 public auditFee;

    mapping(bytes32 => bool) public requested;

    constructor(uint256 _auditFee) {
        owner = msg.sender;
        auditFee = _auditFee;
    }

    function requestAudit(
        string calldata packageName,
        string calldata version
    ) external payable {
        require(msg.value >= auditFee, "Insufficient fee");

        bytes32 key = keccak256(abi.encodePacked(packageName, "@", version));
        require(!requested[key], "Already requested");
        requested[key] = true;

        emit AuditRequested(packageName, version, msg.sender);

        // Refund excess payment
        if (msg.value > auditFee) {
            payable(msg.sender).transfer(msg.value - auditFee);
        }
    }

    function requestAuditByKey(bytes32 key) external payable {
        require(msg.value >= auditFee, "Insufficient fee");
        require(!requested[key], "Already requested");
        requested[key] = true;

        emit AuditRequestedByKey(key, msg.sender);

        if (msg.value > auditFee) {
            payable(msg.sender).transfer(msg.value - auditFee);
        }
    }

    function isRequested(
        string calldata packageName,
        string calldata version
    ) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(packageName, "@", version));
        return requested[key];
    }

    function setFee(uint256 _fee) external {
        require(msg.sender == owner, "Not owner");
        auditFee = _fee;
    }

    function withdraw() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }
}
