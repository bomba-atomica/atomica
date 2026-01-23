// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/DepositTypes.sol";
import "./AuctionRegistry.sol";

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
     * @notice Auction registry contract reference
     * @dev Immutable after deployment - set in constructor
     */
    AuctionRegistry public immutable auctionRegistry;

    /**
     * @notice Time period after which deposits can be refunded
     * @dev Fixed at 7 days - no way to modify
     */
    uint256 public constant DEPOSIT_TIMEOUT = 7 days;

    /**
     * @notice Maps storage key to deposit details
     * @dev Storage key: keccak256(abi.encode(auctionId, depositor, nonce))
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
     * @notice Emitted when a trade is executed
     * @param auctionId Auction ID
     * @param recipient Winner address receiving funds
     * @param ethAmount ETH transferred to winner
     * @param usdcAmount USDC transferred to winner
     */
    event TradeExecuted(
        uint64 indexed auctionId,
        address indexed recipient,
        uint256 ethAmount,
        uint256 usdcAmount
    );

    /**
     * @notice Emitted when ETH is deposited
     * @param auctionId Auction this deposit belongs to
     * @param depositor Address that made the deposit
     * @param amount Amount of ETH deposited (in wei)
     * @param nonce Unique deposit identifier
     */
    event ETHDeposited(
        uint64 indexed auctionId,
        address indexed depositor,
        uint256 amount,
        uint256 nonce
    );

    /**
     * @notice Emitted when USDC is deposited
     * @param auctionId Auction this deposit belongs to
     * @param depositor Address that made the deposit
     * @param amount Amount of USDC deposited (in decimals)
     * @param nonce Unique deposit identifier
     */
    event USDCDeposited(
        uint64 indexed auctionId,
        address indexed depositor,
        uint256 amount,
        uint256 nonce
    );

    /**
     * @notice Emitted when deposit is confirmed by validators
     * @param auctionId Auction this deposit belongs to
     * @param depositor The depositor address
     * @param nonce The deposit's unique identifier
     * @param stateRoot Ethereum stateRoot at confirmation time
     */
    event DepositConfirmed(
        uint64 indexed auctionId,
        address indexed depositor,
        uint256 nonce,
        bytes32 stateRoot
    );

    /**
     * @notice Emitted when deposit is refunded after timeout
     * @param auctionId Auction this deposit belongs to
     * @param depositor Address that received the refund
     * @param amount Amount refunded
     * @param assetType Type of asset (ETH or USDC)
     * @param nonce The deposit's unique identifier
     */
    event DepositRefunded(
        uint64 indexed auctionId,
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
     * @param auctionRegistryAddress Address of AuctionRegistry contract
     * @dev Sets immutable references and initializes nonce counter
     */
    constructor(address usdcTokenAddress, address auctionRegistryAddress) Ownable(msg.sender) {
        require(usdcTokenAddress != address(0), "DepositBox: invalid USDC address");
        require(auctionRegistryAddress != address(0), "DepositBox: invalid auction registry");
        usdcToken = IERC20(usdcTokenAddress);
        auctionRegistry = AuctionRegistry(auctionRegistryAddress);
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
     * @notice Deposit ETH to a specific auction
     * @param auctionId The auction to deposit into (required)
     * @param nonce Unique deposit nonce for (auctionId, depositor)
     * @dev Creates deposit in PENDING status
     *
     * Requirements:
     * - Must send positive ETH amount
     * - Auction must exist and be in OPEN state
     * - Auction deadline must not have passed
     *
     * Emits:
     * - ETHDeposited event
     */
    function depositETH(uint64 auctionId, uint256 nonce)
        external
        payable
        nonReentrant
    {
        require(msg.value > 0, "DepositBox: zero deposit");
        require(auctionId < auctionRegistry.nextAuctionNonce(), "DepositBox: invalid auction");
        require(auctionRegistry.getAuctionState(auctionId) == DepositTypes.AuctionState.OPEN, "DepositBox: auction not open");
        require(block.timestamp < auctionRegistry.getDeadline(auctionId), "DepositBox: auction deadline passed");

        bytes32 storageKey = _computeStorageKey(auctionId, msg.sender, nonce);
        require(deposits[storageKey].amount == 0, "DepositBox: nonce already used");

        deposits[storageKey] = DepositTypes.Deposit({
            auctionId: auctionId,
            depositor: msg.sender,
            assetType: DepositTypes.AssetType.ETH,
            amount: msg.value,
            nonce: nonce,
            status: DepositTypes.DepositStatus.PENDING,
            timestamp: block.timestamp
        });

        depositorNonces[msg.sender].push(nonce);
        totalDeposits[DepositTypes.AssetType.ETH] += msg.value;

        emit ETHDeposited(auctionId, msg.sender, msg.value, nonce);
    }

    /**
     * @notice Deposit USDC to a specific auction
     * @param auctionId The auction to deposit into (required)
     * @param nonce Unique deposit nonce for (auctionId, depositor)
     * @param amount Amount of USDC to deposit
     * @dev Creates deposit in PENDING status, transfers USDC
     *
     * Requirements:
     * - Must have approved USDC spending
     * - Amount must be positive
     * - Auction must exist and be in OPEN state
     * - Auction deadline must not have passed
     *
     * Emits:
     * - USDCDeposited event
     */
    function depositUSDC(uint64 auctionId, uint256 nonce, uint256 amount)
        external
        nonReentrant
    {
        require(amount > 0, "DepositBox: zero deposit");
        require(auctionId < auctionRegistry.nextAuctionNonce(), "DepositBox: invalid auction");
        require(auctionRegistry.getAuctionState(auctionId) == DepositTypes.AuctionState.OPEN, "DepositBox: auction not open");
        require(block.timestamp < auctionRegistry.getDeadline(auctionId), "DepositBox: auction deadline passed");

        bytes32 storageKey = _computeStorageKey(auctionId, msg.sender, nonce);
        require(deposits[storageKey].amount == 0, "DepositBox: nonce already used");

        deposits[storageKey] = DepositTypes.Deposit({
            auctionId: auctionId,
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

        emit USDCDeposited(auctionId, msg.sender, amount, nonce);
    }

    /**
     * @notice Batch confirm deposits (called by settlement contract)
     * @param auctionIds Array of auction IDs
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
        uint64[] calldata auctionIds,
        address[] calldata depositors,
        uint256[] calldata nonces,
        bytes32 stateRoot
    ) external onlySettlement {
        require(auctionIds.length == depositors.length, "DepositBox: auctionIds length mismatch");
        require(depositors.length == nonces.length, "DepositBox: length mismatch");

        for (uint256 i = 0; i < depositors.length; i++) {
            bytes32 storageKey = _computeStorageKey(auctionIds[i], depositors[i], nonces[i]);
            DepositTypes.Deposit storage deposit = deposits[storageKey];

            require(
                deposit.status == DepositTypes.DepositStatus.PENDING,
                "DepositBox: not pending"
            );

            deposit.status = DepositTypes.DepositStatus.CONFIRMED;

            emit DepositConfirmed(auctionIds[i], depositors[i], nonces[i], stateRoot);
        }
    }

    /**
     * @notice Mark confirmed deposits as settled and transfer funds to winner
     * @param auctionIds Array of auction IDs
     * @param depositors Array of depositor addresses
     * @param nonces Array of deposit nonces
     * @param winners Array of winner addresses to receive funds
     * @param ethAmounts Array of ETH amounts to transfer
     * @param usdcAmounts Array of USDC amounts to transfer
     * @dev Updates deposit status from CONFIRMED to SETTLED and executes transfers
     */
    function settleTransfers(
        uint64[] calldata auctionIds,
        address[] calldata depositors,
        uint256[] calldata nonces,
        address[] calldata winners,
        uint256[] calldata ethAmounts,
        uint256[] calldata usdcAmounts
    ) external onlySettlement {
        require(auctionIds.length == depositors.length, "DepositBox: auctionIds length mismatch");
        require(depositors.length == nonces.length, "DepositBox: length mismatch");
        require(winners.length == ethAmounts.length, "DepositBox: winners length mismatch");
        require(ethAmounts.length == usdcAmounts.length, "DepositBox: amounts length mismatch");

        for (uint256 i = 0; i < depositors.length; i++) {
            bytes32 storageKey = _computeStorageKey(auctionIds[i], depositors[i], nonces[i]);
            DepositTypes.Deposit storage deposit = deposits[storageKey];

            if (deposit.status == DepositTypes.DepositStatus.CONFIRMED) {
                deposit.status = DepositTypes.DepositStatus.SETTLED;
            }
        }

        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            uint256 ethAmount = ethAmounts[i];
            uint256 usdcAmount = usdcAmounts[i];

            if (ethAmount > 0) {
                (bool success, ) = winner.call{value: ethAmount}("");
                require(success, "DepositBox: ETH transfer failed");
            }

            if (usdcAmount > 0) {
                require(
                    usdcToken.transfer(winner, usdcAmount),
                    "DepositBox: USDC transfer failed"
                );
            }

            emit TradeExecuted(auctionIds[i], winner, ethAmount, usdcAmount);
        }
    }

    /**
     * @notice Mark confirmed deposits as settled after trade execution
     * @param auctionIds Array of auction IDs
     * @param depositors Array of depositor addresses
     * @param nonces Array of deposit nonces
     * @dev Updates deposit status from CONFIRMED to SETTLED
     */
    function markSettled(
        uint64[] calldata auctionIds,
        address[] calldata depositors,
        uint256[] calldata nonces
    ) external onlySettlement {
        require(auctionIds.length == depositors.length, "DepositBox: auctionIds length mismatch");
        require(depositors.length == nonces.length, "DepositBox: length mismatch");

        for (uint256 i = 0; i < depositors.length; i++) {
            bytes32 storageKey = _computeStorageKey(auctionIds[i], depositors[i], nonces[i]);
            DepositTypes.Deposit storage deposit = deposits[storageKey];

            if (deposit.status == DepositTypes.DepositStatus.CONFIRMED) {
                deposit.status = DepositTypes.DepositStatus.SETTLED;
            }
        }
    }

    /**
     * @notice Refund deposit after timeout period
     * @param auctionId Auction the deposit belongs to
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
    function refundDeposit(uint64 auctionId, address depositor, uint256 nonce)
        external
        nonReentrant
    {
        bytes32 storageKey = _computeStorageKey(auctionId, depositor, nonce);
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
            auctionId,
            msg.sender,
            deposit.amount,
            deposit.assetType,
            nonce
        );
    }

    /**
     * @notice Get deposit details by auction ID, depositor and nonce
     * @param auctionId Auction the deposit belongs to
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return Deposit details including amount, status, etc.
     */
    function getDeposit(uint64 auctionId, address depositor, uint256 nonce)
        external
        view
        returns (DepositTypes.Deposit memory)
    {
        bytes32 storageKey = _computeStorageKey(auctionId, depositor, nonce);
        return deposits[storageKey];
    }

    /**
     * @notice Get deposit storage key for proof generation
     * @param auctionId Auction the deposit belongs to
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return Storage key for eth_getProof
     */
    function getStorageKey(uint64 auctionId, address depositor, uint256 nonce)
        external
        pure
        returns (bytes32)
    {
        return _computeStorageKey(auctionId, depositor, nonce);
    }

    /**
     * @notice Get storage proof data for a deposit (off-chain use)
     * @param auctionId Auction the deposit belongs to
     * @param depositor Address of the depositor
     * @param nonce Deposit nonce
     * @return key Storage key for eth_getProof
     * @return value Encoded deposit for proof generation
     */
    function getDepositForProof(uint64 auctionId, address depositor, uint256 nonce)
        external
        view
        returns (bytes32 key, bytes memory value)
    {
        bytes32 storageKey = _computeStorageKey(auctionId, depositor, nonce);
        DepositTypes.Deposit memory deposit = deposits[storageKey];
        return (storageKey, abi.encode(deposit));
    }

    /**
     * @notice Compute storage key for a deposit
     * @param auctionId Auction this deposit belongs to
     * @param depositor Address of depositor
     * @param nonce Unique deposit identifier
     * @return Storage key for eth_getProof
     * @dev Key format: keccak256(abi.encode(auctionId, depositor, nonce))
     */
    function _computeStorageKey(uint64 auctionId, address depositor, uint256 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(auctionId, depositor, nonce));
    }
}
