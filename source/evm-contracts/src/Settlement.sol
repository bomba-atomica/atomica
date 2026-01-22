// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";
import "./BLSVerifier.sol";
import "./DepositBox.sol";

contract Settlement is ReentrancyGuard, Ownable {
    BLSVerifier public blsVerifier;
    DepositBox public depositBox;
    IERC20 public immutable usdcToken;

    bytes32 public latestVerifiedRoot;
    uint256 public lastSettlementBlock;

    bool public bricked;

    mapping(bytes32 => bool) public processedTrades;

    event TradeExecuted(
        bytes32 indexed tradeId,
        address indexed recipient,
        uint256 ethAmount,
        uint256 usdcAmount
    );
    event SettlementVerified(
        bytes32 indexed stateRoot,
        bytes32 indexed merkleRoot,
        uint256 clearingPrice
    );
    event VerificationFailed(string reason);
    event Bricked(address indexed caller, uint256 timestamp);

    modifier onlyVerifiedStateRoot(bytes32 stateRoot) {
        require(
            blsVerifier.isStateRootValid(stateRoot),
            "Settlement: unverified state root"
        );
        _;
    }

    modifier notBricked() {
        require(!bricked, "Settlement: system bricked");
        _;
    }

    constructor(
        address blsVerifierAddress,
        address depositBoxAddress,
        address usdcTokenAddress
    ) {
        require(blsVerifierAddress != address(0), "Settlement: invalid BLS verifier");
        require(depositBoxAddress != address(0), "Settlement: invalid deposit box");
        require(usdcTokenAddress != address(0), "Settlement: invalid USDC");

        blsVerifier = BLSVerifier(blsVerifierAddress);
        depositBox = DepositBox(depositBoxAddress);
        usdcToken = IERC20(usdcTokenAddress);
    }

    function settle(
        bytes32 stateRoot,
        bytes32 merkleRoot,
        DepositTypes.TradeResult calldata tradeResult,
        bytes calldata blsSignature,
        uint256[] calldata validatorIndices,
        bytes[] calldata pubkeys,
        bytes32[] calldata winningCommitments,
        address[] calldata winners,
        uint256[] calldata ethAmounts,
        uint256[] calldata usdcAmounts
    ) external nonReentrant notBricked returns (bool) {
        require(
            winners.length == winningCommitments.length,
            "Settlement: commitment mismatch"
        );
        require(
            winners.length == ethAmounts.length && winners.length == usdcAmounts.length,
            "Settlement: amounts mismatch"
        );

        bool verified = blsVerifier.verifyStateProofWithPubkeys(
            stateRoot,
            blsSignature,
            pubkeys,
            validatorIndices
        );

        require(verified, "Settlement: BLS verification failed");

        bytes32 tradeId = keccak256(abi.encodePacked(
            stateRoot,
            merkleRoot,
            tradeResult.clearingPrice
        ));

        require(!processedTrades[tradeId], "Settlement: trade already processed");

        require(
            keccak256(abi.encodePacked(tradeResult.merkleRoot)) == keccak256(abi.encodePacked(merkleRoot)),
            "Settlement: merkle root mismatch"
        );

        for (uint256 i = 0; i < winningCommitments.length; i++) {
            bytes32 commitment = winningCommitments[i];
            address winner = winners[i];
            uint256 ethAmount = ethAmounts[i];
            uint256 usdcAmount = usdcAmounts[i];

            require(ethAmount > 0 || usdcAmount > 0, "Settlement: zero amounts");

            if (ethAmount > 0) {
                (bool success, ) = winner.call{value: ethAmount}("");
                require(success, "Settlement: ETH transfer failed");
            }

            if (usdcAmount > 0) {
                require(
                    usdcToken.transfer(winner, usdcAmount),
                    "Settlement: USDC transfer failed"
                );
            }

            emit TradeExecuted(tradeId, winner, ethAmount, usdcAmount);
        }

        depositBox.markSettled(winningCommitments);

        processedTrades[tradeId] = true;
        latestVerifiedRoot = stateRoot;
        lastSettlementBlock = block.number;

        emit SettlementVerified(stateRoot, merkleRoot, tradeResult.clearingPrice);

        return true;
    }

    function settleWithZKProof(
        bytes32 stateRoot,
        bytes32 merkleRoot,
        DepositTypes.TradeResult calldata tradeResult,
        bytes32 zkProofHash,
        bytes32[] calldata winningCommitments,
        address[] calldata winners,
        uint256[] calldata ethAmounts,
        uint256[] calldata usdcAmounts
    ) external nonReentrant notBricked returns (bool) {
        require(
            blsVerifier.isStateRootValid(stateRoot),
            "Settlement: unverified state root"
        );

        require(
            winners.length == winningCommitments.length,
            "Settlement: commitment mismatch"
        );
        require(
            winners.length == ethAmounts.length && winners.length == usdcAmounts.length,
            "Settlement: amounts mismatch"
        );

        bytes32 tradeId = keccak256(abi.encodePacked(
            stateRoot,
            merkleRoot,
            tradeResult.clearingPrice,
            zkProofHash
        ));

        require(!processedTrades[tradeId], "Settlement: trade already processed");

        require(
            keccak256(abi.encodePacked(tradeResult.merkleRoot)) == keccak256(abi.encodePacked(merkleRoot)),
            "Settlement: merkle root mismatch"
        );

        for (uint256 i = 0; i < winningCommitments.length; i++) {
            address winner = winners[i];
            uint256 ethAmount = ethAmounts[i];
            uint256 usdcAmount = usdcAmounts[i];

            if (ethAmount > 0) {
                (bool success, ) = winner.call{value: ethAmount}("");
                require(success, "Settlement: ETH transfer failed");
            }

            if (usdcAmount > 0) {
                require(
                    usdcToken.transfer(winner, usdcAmount),
                    "Settlement: USDC transfer failed"
                );
            }

            emit TradeExecuted(tradeId, winner, ethAmount, usdcAmount);
        }

        depositBox.markSettled(winningCommitments);

        processedTrades[tradeId] = true;
        latestVerifiedRoot = stateRoot;
        lastSettlementBlock = block.number;

        emit SettlementVerified(stateRoot, merkleRoot, tradeResult.clearingPrice);

        return true;
    }

    function executeTransfers(
        bytes32 stateRoot,
        DepositTypes.TradeResult calldata tradeResult,
        bytes32[] calldata commitments,
        address[] calldata recipients,
        uint256[] calldata ethAmounts,
        uint256[] calldata usdcAmounts
    ) external onlyOwner notBricked returns (bool) {
        require(
            blsVerifier.isStateRootValid(stateRoot),
            "Settlement: unverified state root"
        );

        require(
            commitments.length == recipients.length &&
            recipients.length == ethAmounts.length &&
            ethAmounts.length == usdcAmounts.length,
            "Settlement: array length mismatch"
        );

        bytes32 tradeId = keccak256(abi.encodePacked(
            stateRoot,
            tradeResult.merkleRoot,
            tradeResult.clearingPrice
        ));

        require(!processedTrades[tradeId], "Settlement: trade already processed");

        for (uint256 i = 0; i < commitments.length; i++) {
            address recipient = recipients[i];
            uint256 ethAmount = ethAmounts[i];
            uint256 usdcAmount = usdcAmounts[i];

            if (ethAmount > 0) {
                (bool success, ) = recipient.call{value: ethAmount}("");
                require(success, "Settlement: ETH transfer failed");
            }

            if (usdcAmount > 0) {
                require(
                    usdcToken.transfer(recipient, usdcAmount),
                    "Settlement: USDC transfer failed"
                );
            }

            emit TradeExecuted(tradeId, recipient, ethAmount, usdcAmount);
        }

        depositBox.markSettled(commitments);

        processedTrades[tradeId] = true;
        latestVerifiedRoot = stateRoot;
        lastSettlementBlock = block.number;

        return true;
    }

    function isTradeProcessed(bytes32 stateRoot, bytes32 merkleRoot, uint256 clearingPrice)
        external
        view
        returns (bool)
    {
        bytes32 tradeId = keccak256(abi.encodePacked(stateRoot, merkleRoot, clearingPrice));
        return processedTrades[tradeId];
    }

    function getContractBalances()
        external
        view
        returns (uint256 ethBalance, uint256 usdcBalance)
    {
        return (address(this).balance, usdcToken.balanceOf(address(this)));
    }
}
