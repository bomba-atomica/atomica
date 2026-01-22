// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";

contract DepositBox is ReentrancyGuard, Ownable {
    using DepositTypes for DepositTypes.Deposit;
    using DepositTypes for DepositTypes.AssetType;
    using DepositTypes for DepositTypes.DepositStatus;

    IERC20 public immutable usdcToken;

    uint256 public constant DEPOSIT_TIMEOUT = 7 days;

    mapping(bytes32 => DepositTypes.Deposit) public deposits;
    mapping(address => uint256[]) public depositorNonces;
    mapping(DepositTypes.AssetType => uint256) public totalDeposits;
    mapping(bytes32 => bool) public commitmentUsed;

    uint256 public depositNonceCounter;
    bytes32 public latestStateRoot;
    uint256 public lastDepositBlock;

    address public settlementContract;

    event ETHDeposited(
        address indexed depositor,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 nonce
    );

    event USDCDeposited(
        address indexed depositor,
        uint256 amount,
        bytes32 indexed commitment,
        uint256 nonce
    );

    event DepositConfirmed(
        bytes32 indexed commitment,
        bytes32 stateRoot,
        uint256 nonce
    );

    event DepositRefunded(
        address indexed depositor,
        uint256 amount,
        DepositTypes.AssetType assetType,
        uint256 nonce
    );

    event SettlementContractSet(address indexed settlement);

    modifier onlySettlement() {
        require(msg.sender == settlementContract, "DepositBox: only settlement");
        _;
    }

    constructor(address usdcTokenAddress) {
        require(usdcTokenAddress != address(0), "DepositBox: invalid USDC address");
        usdcToken = IERC20(usdcTokenAddress);
        depositNonceCounter = 1;
    }

    function setSettlementContract(address settlement) external onlyOwner {
        require(settlement != address(0), "DepositBox: invalid settlement");
        require(settlementContract == address(0), "DepositBox: settlement already set");
        settlementContract = settlement;
        emit SettlementContractSet(settlement);
    }

    function depositETH(bytes32 commitment)
        external
        payable
        nonReentrant
    {
        require(msg.value > 0, "DepositBox: zero deposit");
        require(commitment != bytes32(0), "DepositBox: zero commitment");
        require(!commitmentUsed[commitment], "DepositBox: commitment used");

        uint256 nonce = _generateNonce();
        bytes32 depositHash = _computeDepositHash(
            msg.sender,
            DepositTypes.AssetType.ETH,
            msg.value,
            nonce,
            commitment
        );

        deposits[depositHash] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.ETH,
            amount: msg.value,
            nonce: nonce,
            commitment: commitment,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });

        depositorNonces[msg.sender].push(nonce);
        commitmentUsed[commitment] = true;
        totalDeposits[DepositTypes.AssetType.ETH] += msg.value;

        emit ETHDeposited(msg.sender, msg.value, commitment, nonce);
    }

    function depositUSDC(uint256 amount, bytes32 commitment)
        external
        nonReentrant
    {
        require(amount > 0, "DepositBox: zero deposit");
        require(commitment != bytes32(0), "DepositBox: zero commitment");
        require(!commitmentUsed[commitment], "DepositBox: commitment used");

        uint256 nonce = _generateNonce();
        bytes32 depositHash = _computeDepositHash(
            msg.sender,
            DepositTypes.AssetType.USDC,
            amount,
            nonce,
            commitment
        );

        deposits[depositHash] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.USDC,
            amount: amount,
            nonce: nonce,
            commitment: commitment,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });

        depositorNonces[msg.sender].push(nonce);
        commitmentUsed[commitment] = true;
        totalDeposits[DepositTypes.AssetType.USDC] += amount;

        require(
            usdcToken.transferFrom(msg.sender, address(this), amount),
            "DepositBox: USDC transfer failed"
        );

        emit USDCDeposited(msg.sender, amount, commitment, nonce);
    }

    function confirmDeposits(
        bytes32[] calldata commitments,
        bytes32 newStateRoot
    ) external onlySettlement {
        require(commitments.length > 0, "DepositBox: empty commitments");

        for (uint256 i = 0; i < commitments.length; i++) {
            bytes32 commitment = commitments[i];
            require(commitmentUsed[commitment], "DepositBox: unknown commitment");

            bytes32 depositHash = _computeDepositHashFromCommitment(commitment);
            DepositTypes.Deposit storage deposit = deposits[depositHash];

            require(
                deposit.status == DepositTypes.DepositStatus.PENDING,
                "DepositBox: not pending"
            );

            deposit.status = DepositTypes.DepositStatus.CONFIRMED;

            emit DepositConfirmed(commitment, newStateRoot, deposit.nonce);
        }

        latestStateRoot = newStateRoot;
        lastDepositBlock = block.number;
    }

    function markSettled(bytes32[] calldata commitments) external onlySettlement {
        for (uint256 i = 0; i < commitments.length; i++) {
            bytes32 commitment = commitments[i];
            require(commitmentUsed[commitment], "DepositBox: unknown commitment");

            bytes32 depositHash = _computeDepositHashFromCommitment(commitment);
            DepositTypes.Deposit storage deposit = deposits[depositHash];

            if (deposit.status == DepositTypes.DepositStatus.CONFIRMED) {
                deposit.status = DepositTypes.DepositStatus.SETTLED;
            }
        }
    }

    function refundDeposit(address depositor, uint256 nonce)
        external
        nonReentrant
    {
        bytes32 depositHash = _computeDepositHash(
            depositor,
            DepositTypes.AssetType.ETH,
            0,
            nonce,
            bytes32(0)
        );

        DepositTypes.Deposit storage deposit = deposits[depositHash];
        require(
            deposit.depositor == msg.sender,
            "DepositBox: not owner"
        );
        require(
            deposit.status == DepositTypes.DepositStatus.PENDING,
            "DepositBox: not pending"
        );
        require(
            block.timestamp > deposit.timestamp + DEPOSIT_TIMEOUT,
            "DepositBox: not timed out"
        );

        deposit.status = DepositTypes.DepositStatus.REFUNDED;

        if (deposit.assetType == DepositTypes.AssetType.ETH) {
            (bool success, ) = msg.sender.call{value: deposit.amount}("");
            require(success, "DepositBox: ETH refund failed");
        } else {
            require(
                usdcToken.transfer(msg.sender, deposit.amount),
                "DepositBox: USDC refund failed"
            );
        }

        emit DepositRefunded(
            msg.sender,
            deposit.amount,
            deposit.assetType,
            nonce
        );
    }

    function getDeposit(address depositor, uint256 nonce)
        external
        view
        returns (DepositTypes.Deposit memory)
    {
        bytes32 depositHash = _computeDepositHash(
            depositor,
            DepositTypes.AssetType.ETH,
            0,
            nonce,
            bytes32(0)
        );
        return deposits[depositHash];
    }

    function getDepositByCommitment(bytes32 commitment)
        external
        view
        returns (DepositTypes.Deposit memory)
    {
        bytes32 depositHash = _computeDepositHashFromCommitment(commitment);
        return deposits[depositHash];
    }

    function _generateNonce() internal returns (uint256) {
        return depositNonceCounter++;
    }

    function _computeDepositHash(
        address depositor,
        DepositTypes.AssetType assetType,
        uint256 amount,
        uint256 nonce,
        bytes32 commitment
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            depositor,
            assetType,
            amount,
            nonce,
            commitment
        ));
    }

    function _computeDepositHashFromCommitment(bytes32 commitment)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(commitment));
    }
}
