// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DepositBox.sol";
import "./BLSVerifier.sol";
import "./Settlement.sol";

/**
 * @title Governance
 * @notice Emergency governance contract for Atomica system
 * @dev Handles system initialization and emergency shutdown (brick)
 *
 * Architecture:
 * - Single-purpose contract: genesis() for init, brick() for emergency
 * - Orthogonal to core contracts (BLSVerifier has no governance knowledge)
 * - One-way brick: cannot be undone
 *
 * Lifecycle:
 * 1. Deploy all contracts (Governance, DepositBox, BLSVerifier, Settlement)
 * 2. Deployer calls genesis() to link contracts (only deployer can call)
 * 3. System operates normally
 * 4. If emergency, owner calls brick() to refund all deposits
 *
 * Security:
 * - Only deployer can call genesis() (checked via stored deployer address)
 * - Only owner can call brick()
 * - genesis() can only be called once
 * - brick() is irreversible
 *
 * @author Atomica
 */
contract Governance is Ownable {
    /**
     * @notice Original deployer address (immutable)
     * @dev Set in constructor, used for genesis() access control
     */
    address public immutable deployer;

    /**
     * @notice USDC token contract reference
     * @dev Immutable, set in constructor
     */
    IERC20 public immutable usdcToken;

    /**
     * @notice Whether system has been initialized
     * @dev Set by genesis(), prevents re-initialization
     */
    bool public initialized;

    /**
     * @notice Whether system has been bricked
     * @dev Set by brick(), one-way flag
     */
    bool public bricked;

    /**
     * @notice DepositBox contract address
     * @dev Set by genesis(), used for refunds
     */
    address public depositBox;

    /**
     * @notice BLSVerifier contract address
     * @dev Set by genesis()
     */
    address public blsVerifier;

    /**
     * @notice Settlement contract address
     * @dev Set by genesis()
     */
    address public settlement;

    /**
     * @notice Block number when genesis was called
     * @dev For tracking system age
     */
    uint256 public genesisBlock;

    /**
     * @notice Block number when system was bricked
     * @dev Zero if not bricked
     */
    uint256 public brickBlock;

    /**
     * @notice Time window for calling genesis after deployment
     * @dev 1 hour - must be called shortly after deployment
     */
    uint256 public constant GENESIS_WINDOW = 1 hours;

    /**
     * @notice Emitted when system is initialized
     * @param depositBox Address of DepositBox contract
     * @param blsVerifier Address of BLSVerifier contract
     * @param settlement Address of Settlement contract
     * @param blockNumber Block number of genesis
     */
    event Genesis(
        address indexed depositBox,
        address indexed blsVerifier,
        address indexed settlement,
        uint256 blockNumber
    );

    /**
     * @notice Emitted when system is bricked
     * @param caller Address that called brick()
     * @param blockNumber Block number of brick
     * @param reason Human-readable reason for brick
     */
    event Bricked(
        address indexed caller,
        uint256 blockNumber,
        string reason
    );

    /**
     * @notice Emitted when a refund is executed
     * @param depositor Address that received refund
     * @param ethAmount ETH refunded
     * @param usdcAmount USDC refunded
     */
    event RefundExecuted(
        address indexed depositor,
        uint256 ethAmount,
        uint256 usdcAmount
    );

    /**
     * @notice Requires caller is the original deployer
     */
    modifier onlyDeployer() {
        require(msg.sender == deployer, "Governance: not deployer");
        _;
    }

    /**
     * @notice Requires genesis window is still open
     */
    modifier onlyWithinGenesisWindow() {
        require(block.timestamp <= deploymentTime + GENESIS_WINDOW, "Governance: genesis window closed");
        _;
    }

    /**
     * @notice Requires system is not initialized
     */
    modifier notInitialized() {
        require(!initialized, "Governance: already initialized");
        _;
    }

    /**
     * @notice Requires system is not bricked
     */
    modifier notBricked() {
        require(!bricked, "Governance: already bricked");
        _;
    }

    /**
     * @notice Requires system is initialized
     */
    modifier onlyInitialized() {
        require(initialized, "Governance: not initialized");
        _;
    }

    /**
     * @notice Deployment timestamp
     * @dev Used for genesis window enforcement
     */
    uint256 public deploymentTime;

    /**
     * @notice Constructor
     * @param usdcTokenAddress Address of USDC token contract
     */
    constructor(address usdcTokenAddress) Ownable(msg.sender) {
        require(usdcTokenAddress != address(0), "Governance: invalid USDC");
        deployer = msg.sender;
        usdcToken = IERC20(usdcTokenAddress);
        deploymentTime = block.timestamp;
    }

    /**
     * @notice Initialize the system with contract addresses
     * @param depositBoxAddress Address of DepositBox contract
     * @param blsVerifierAddress Address of BLSVerifier contract
     * @param settlementAddress Address of Settlement contract
     * @dev Can only be called by original deployer within genesis window
     * @dev Sets up links between all system contracts
     * @dev Reverts if called by non-deployer or after genesis window
     */
    function genesis(
        address depositBoxAddress,
        address blsVerifierAddress,
        address settlementAddress
    )
        external
        onlyDeployer
        onlyOwner
        notInitialized
        onlyWithinGenesisWindow
    {
        require(depositBoxAddress != address(0), "Governance: invalid deposit box");
        require(blsVerifierAddress != address(0), "Governance: invalid BLS verifier");
        require(settlementAddress != address(0), "Governance: invalid settlement");

        depositBox = depositBoxAddress;
        blsVerifier = blsVerifierAddress;
        settlement = settlementAddress;

        initialized = true;
        genesisBlock = block.number;

        emit Genesis(depositBoxAddress, blsVerifierAddress, settlementAddress, block.number);
    }

    /**
     * @notice Emergency shutdown of the system
     * @param reason Human-readable reason for shutdown
     * @dev One-way: cannot be undone
     * @dev After brick, all deposits can be refunded
     */
    function brick(string calldata reason) external onlyOwner notBricked {
        require(bytes(reason).length > 0, "Governance: empty reason");

        bricked = true;
        brickBlock = block.number;

        emit Bricked(msg.sender, block.number, reason);
    }

    /**
     * @notice Refund all pending deposits (only when bricked)
     * @param auctionIds Array of auction IDs
     * @param depositors Array of depositor addresses
     * @param nonces Array of deposit nonces for each depositor
     * @dev Called by owner after brick to refund all depositors
     */
    function refundAllPendingDeposits(
        uint64[] calldata auctionIds,
        address[] calldata depositors,
        uint256[][] calldata nonces
    ) external onlyOwner onlyInitialized {
        require(bricked, "Governance: not bricked");
        require(auctionIds.length == depositors.length, "Governance: length mismatch");
        require(depositors.length == nonces.length, "Governance: depositors nonces mismatch");

        DepositBox depositBoxContract = DepositBox(depositBox);

        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            uint256[] memory userNonces = nonces[i];
            uint64 auctionId = auctionIds[i];

            for (uint256 j = 0; j < userNonces.length; j++) {
                try depositBoxContract.refundDeposit(auctionId, depositor, userNonces[j]) {
                    emit RefundExecuted(depositor, 0, 0);
                } catch {
                }
            }
        }
    }

    /**
     * @notice Emergency withdraw of ETH (only when bricked)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address payable to, uint256 amount)
        external
        onlyOwner
        onlyInitialized
    {
        require(bricked, "Governance: not bricked");
        require(to != address(0), "Governance: invalid recipient");
        require(amount > 0, "Governance: zero amount");
        require(address(this).balance >= amount, "Governance: insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Governance: transfer failed");
    }

    /**
     * @notice Emergency withdraw of USDC (only when bricked)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawUSDC(address to, uint256 amount)
        external
        onlyOwner
        onlyInitialized
    {
        require(bricked, "Governance: not bricked");
        require(to != address(0), "Governance: invalid recipient");
        require(amount > 0, "Governance: zero amount");
        require(usdcToken.balanceOf(address(this)) >= amount, "Governance: insufficient balance");

        require(usdcToken.transfer(to, amount), "Governance: USDC transfer failed");
    }

    /**
     * @notice Get current system state
     * @return isInitialized Whether system is initialized
     * @return isBricked Whether system is bricked
     * @return depositBoxAddr DepositBox address
     * @return blsVerifierAddr BLSVerifier address
     * @return settlementAddr Settlement address
     * @return genesisBlk Genesis block number
     * @return brickBlk Brick block number (0 if not bricked)
     */
    function getSystemState()
        external
        view
        returns (
            bool isInitialized,
            bool isBricked,
            address depositBoxAddr,
            address blsVerifierAddr,
            address settlementAddr,
            uint256 genesisBlk,
            uint256 brickBlk
        )
    {
        return (
            initialized,
            bricked,
            depositBox,
            blsVerifier,
            settlement,
            genesisBlock,
            brickBlock
        );
    }

    /**
     * @notice Receive ETH deposits
     * @dev Only accepts from DepositBox contract
     */
    receive() external payable {
        require(msg.sender == depositBox, "Governance: only from deposit box");
    }
}
