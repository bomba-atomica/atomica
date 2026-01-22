// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Atomica DepositBox Contract
 * @notice Handles ETH and USDC deposits with Ethereum native state proof verification
 * @dev Part of Atomica's cross-chain atomic deposit system
 *
 * Architecture (Simplified - January 2026):
 * - Deposits stored directly in contract storage (no commitments)
 * - Verification via eth_getProof (EIP-1186) MPT proofs
 * - No separate Merkle tree - use Ethereum's state trie
 * - BLS validators sign Ethereum block headers
 *
 * Trust Model:
 * - Ethereum's stateRoot is cryptographically authenticated via consensus
 * - BLS signatures verify block headers for cross-chain use
 * - MPT proof verifies deposit against stateRoot
 *
 * Related Contracts:
 * - Settlement: Confirms deposits and executes trades
 * - BLSVerifier: Verifies BLS signatures on block headers
 * - Governance: Handles emergency brick() for refunds
 *
 * @see https://eips.ethereum.org/EIPS/eip-1186
 */
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";

/**
 * @title DepositBox
 * @notice Main contract for handling ETH and USDC deposits
 * @dev Uses Ethereum native state proofs for verification
 *
 * Deposit Lifecycle:
 * 1. PENDING: Initial deposit state
 * 2. CONFIRMED: Included in auction
 * 3. SETTLED: Trade executed successfully
 *
 * Storage Layout for eth_getProof:
 * - Account proof: Proves DepositBox storage root
 * - Storage proof: Proves individual deposit at keccak256(abi.encode(depositor, nonce))
 *
 * @author Atomica
 */
contract DepositBox is ReentrancyGuard, Ownable {
    using DepositTypes for DepositTypes.Deposit;
    using DepositTypes for DepositTypes.AssetType;
    using DepositTypes for DepositTypes.DepositStatus;

    /**
     * @notice USDC token contract reference
     * @dev Immutable after deployment - set in constructor
     */
    IERC20 public immutable usdcToken;

    /**
     * @notice Time period after which deposits can be refunded
     * @dev Fixed at 7 days - no way to modify
     */
    uint256 public constant DEPOSIT_TIMEOUT = 7 days;

    /**
     * @notice Maps storage key to deposit details
     * @dev Storage key: keccak256(abi.encode(depositor, nonce))
     */
    mapping(bytes32 => DepositTypes.Deposit) public deposits;

    /**
     * @notice Tracks all nonces used by each depositor
     * @dev Used for iterating a user's deposit history
     */
    mapping(address => uint256[]) public depositorNonces;

    /**
     * @notice Total deposits by asset type
     * @dev 0 = ETH, 1 = USDC
     */
    mapping(DepositTypes.AssetType => uint256) public totalDeposits;

    /**
     * @notice Counter for generating unique deposit nonces
     * @dev Starts at 1, increments with each deposit
     */
    uint256 public depositNonceCounter;

    /**
     * @notice Address of settlement contract
     * @dev Can only be set once by owner
     */
    address public settlementContract;

    /**
     * @notice Emitted when ETH is deposited
     * @param depositor Address that made the deposit
     * @param amount Amount of ETH deposited (in wei)
     * @param nonce Unique deposit identifier
     */
    event ETHDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 nonce
    );

    /**
     * @notice Emitted when USDC is deposited
     * @param depositor Address that made the deposit
     * @param amount Amount of USDC deposited (in decimals)
     * @param nonce Unique deposit identifier
     */
    event USDCDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 nonce
    );

    /**
     * @notice Emitted when deposit is confirmed by validators
     * @param depositor The depositor address
     * @param nonce The deposit's unique identifier
     * @param stateRoot Ethereum stateRoot at confirmation time
     */
    event DepositConfirmed(
        address indexed depositor,
        uint256 nonce,
        bytes32 stateRoot
    );

    /**
     * @notice Emitted when deposit is refunded after timeout
     * @param depositor Address that received the refund
     * @param amount Amount refunded
     * @param assetType Type of asset (ETH or USDC)
     * @param nonce The deposit's unique identifier
     */
    event DepositRefunded(
        address indexed depositor,
        uint256 amount,
        DepositTypes.AssetType assetType,
        uint256 nonce
    );

    /**
     * @notice Emitted when settlement contract is set
     * @param settlement Address of the settlement contract
     */
    event SettlementContractSet(address indexed settlement);

    /**
     * @notice Restricts function to only settlement contract
     * @dev Used for confirmDeposits and markSettled functions
     */
    modifier onlySettlement() {
        require(msg.sender == settlementContract, "DepositBox: only settlement");
        _;
    }

    /**
     * @notice Constructor
     * @param usdcTokenAddress Address of USDC token contract
     * @dev Sets immutable USDC reference and initializes nonce counter
     */
    constructor(address usdcTokenAddress) {
        require(usdcTokenAddress != address(0), "DepositBox: invalid USDC address");
        usdcToken = IERC20(usdcTokenAddress);
        depositNonceCounter = 1;
    }

    /**
     * @notice Sets the settlement contract address
     * @param settlement Address of the settlement contract
     * @dev Can only be called once by owner
     */
    function setSettlementContract(address settlement) external onlyOwner {
        require(settlement != address(0), "DepositBox: invalid settlement");
        require(settlementContract == address(0), "DepositBox: settlement already set");
        settlementContract = settlement;
        emit SettlementContractSet(settlement);
    }

    /**
     * @notice Deposit ETH
     * @dev Creates deposit in PENDING status
     *
     * Requirements:
     * - Must send positive ETH amount
     *
     * Emits:
     * - ETHDeposited event
     */
    function depositETH()
        external
        payable
        nonReentrant
    {
        require(msg.value > 0, "DepositBox: zero deposit");

        uint256 nonce = _generateNonce();
        bytes32 storageKey = _computeStorageKey(msg.sender, nonce);

        deposits[storageKey] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.ETH,
            amount: msg.value,
            nonce: nonce,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });

        depositorNonces[msg.sender].push(nonce);
        totalDeposits[DepositTypes.AssetType.ETH] += msg.value;

        emit ETHDeposited(msg.sender, msg.value, nonce);
    }

    /**
     * @notice Deposit USDC
     * @param amount Amount of USDC to deposit
     * @dev Creates deposit in PENDING status, transfers USDC
     *
     * Requirements:
     * - Must have approved USDC spending
     * - Amount must be positive
     *
     * Emits:
     * - USDCDeposited event
     */
    function depositUSDC(uint256 amount)
        external
        nonReentrant
    {
        require(amount > 0, "DepositBox: zero deposit");

        uint256 nonce = _generateNonce();
        bytes32 storageKey = _computeStorageKey(msg.sender, nonce);

        deposits[storageKey] = DepositTypes.Deposit({
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.USDC,
            amount: amount,
            nonce: nonce,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });

        depositorNonces[msg.sender].push(nonce);
        totalDeposits[DepositTypes.AssetType.USDC] += amount;

        require(
            usdcToken.transferFrom(msg.sender, address(this), amount),
            "DepositBox: USDC transfer failed"
        );

        emit USDCDeposited(msg.sender, amount, nonce);
    }

    /**
     * @notice Batch confirm deposits (called by settlement contract)
     * @param depositors Array of depositor addresses
     * @param nonces Array of deposit nonces
     * @param stateRoot Ethereum stateRoot for verification
     * @dev Updates deposit status from PENDING to CONFIRMED
     *
     * Requirements:
     * - Can only be called by settlement contract
     * - All deposits must exist and be in PENDING status
     *
     * Emits:
     * - DepositConfirmed event for each deposit
     */
    function confirmDeposits(
        address[] calldata depositors,
        uint256[] calldata nonces,
        bytes32 stateRoot
    ) external onlySettlement {
        require(depositors.length == nonces.length, "DepositBox: length mismatch");

        for (uint256 i = 0; i < depositors.length; i++) {
            bytes32 storageKey = _computeStorageKey(depositors[i], nonces[i]);
            DepositTypes.Deposit storage deposit = deposits[storageKey];

            require(
                deposit.status == DepositTypes.DepositStatus.PENDING,
                "DepositBox: not pending"
            );

            deposit.status = DepositTypes.DepositStatus.CONFIRMED;

            emit DepositConfirmed(depositors[i], nonces[i], stateRoot);
        }
    }

    /**
     * @notice Mark confirmed deposits as settled after trade execution
     * @param depositors Array of depositor addresses
     * @param nonces Array of deposit nonces
     * @dev Updates deposit status from CONFIRMED to SETTLED
     *
     * Requirements:
     * - Can only be called by settlement contract
     * - All deposits must exist and be in CONFIRMED status
     */
    function markSettled(
        address[] calldata depositors,
        uint256[] calldata nonces
    ) external onlySettlement {
        require(depositors.length == nonces.length, "DepositBox: length mismatch");

        for (uint256 i = 0; i < depositors.length; i++) {
            bytes32 storageKey = _computeStorageKey(depositors[i], nonces[i]);
            DepositTypes.Deposit storage deposit = deposits[storageKey];

            if (deposit.status == DepositTypes.DepositStatus.CONFIRMED) {
                deposit.status = DepositTypes.DepositStatus.SETTLED;
            }
        }
    }

    /**
     * @notice Refund deposit after timeout period
     * @param depositor Original depositor address
     * @param nonce Deposit nonce to refund
     * @dev Returns funds to depositor after DEPOSIT_TIMEOUT
     *
     * Requirements:
     * - Can only be called by depositor
     * - Deposit must be in PENDING status
     * - DEPOSIT_TIMEOUT must have elapsed
     *
     * Emits:
     * - DepositRefunded event
     */
    function refundDeposit(address depositor, uint256 nonce)
        external
        nonReentrant
    {
        bytes32 storageKey = _computeStorageKey(depositor, nonce);
        DepositTypes.Deposit storage deposit = deposits[storageKey];

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

    /**
     * @notice Get deposit details by depositor and nonce
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return Deposit details including amount, status, etc.
     */
    function getDeposit(address depositor, uint256 nonce)
        external
        view
        returns (DepositTypes.Deposit memory)
    {
        bytes32 storageKey = _computeStorageKey(depositor, nonce);
        return deposits[storageKey];
    }

    /**
     * @notice Get deposit storage key for proof generation
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return Storage key for eth_getProof
     */
    function getStorageKey(address depositor, uint256 nonce)
        external
        pure
        returns (bytes32)
    {
        return _computeStorageKey(depositor, nonce);
    }

    /**
     * @notice Get storage proof data for a deposit (off-chain use)
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return Storage key and encoded deposit for proof generation
     */
    function getDepositForProof(address depositor, uint256 nonce)
        external
        view
        returns (bytes32 key, bytes memory value)
    {
        bytes32 storageKey = _computeStorageKey(depositor, nonce);
        DepositTypes.Deposit memory deposit = deposits[storageKey];
        return (storageKey, abi.encode(deposit));
    }

    /**
     * @notice Generate unique deposit nonce
     * @return The new nonce value
     * @dev Increments nonce counter
     */
    function _generateNonce() internal returns (uint256) {
        return depositNonceCounter++;
    }

    /**
     * @notice Compute storage key for a deposit
     * @param depositor Address of depositor
     * @param nonce Unique deposit identifier
     * @return Storage key for eth_getProof
     * @dev Key format: keccak256(abi.encode(depositor, nonce))
     */
    function _computeStorageKey(address depositor, uint256 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(depositor, nonce));
    }
}
