// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DepositBox.sol";
import "./BLSVerifier.sol";
import "./Settlement.sol";

contract Governance is Ownable {
    IERC20 public immutable usdcToken;

    bool public initialized;
    bool public bricked;

    address public depositBox;
    address public blsVerifier;
    address public settlement;

    uint256 public genesisBlock;
    uint256 public brickBlock;

    event Genesis(
        address indexed depositBox,
        address indexed blsVerifier,
        address indexed settlement,
        uint256 blockNumber
    );
    event Bricked(
        address indexed caller,
        uint256 blockNumber,
        string reason
    );
    event RefundExecuted(
        address indexed depositor,
        uint256 ethAmount,
        uint256 usdcAmount
    );

    modifier notInitialized() {
        require(!initialized, "Governance: already initialized");
        _;
    }

    modifier onlyInitialized() {
        require(initialized, "Governance: not initialized");
        _;
    }

    modifier notBricked() {
        require(!bricked, "Governance: system bricked");
        _;
    }

    constructor(address usdcTokenAddress) {
        require(usdcTokenAddress != address(0), "Governance: invalid USDC");
        usdcToken = IERC20(usdcTokenAddress);
    }

    function genesis(
        address depositBoxAddress,
        address blsVerifierAddress,
        address settlementAddress
    ) external onlyOwner notInitialized {
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

    function brick(string calldata reason) external onlyOwner notBricked {
        require(bytes(reason).length > 0, "Governance: empty reason");

        bricked = true;
        brickBlock = block.number;

        emit Bricked(msg.sender, block.number, reason);
    }

    function refundAllPendingDeposits(
        address[] calldata depositors,
        uint256[][] calldata nonces
    ) external onlyOwner onlyInitialized {
        require(bricked, "Governance: not bricked");
        require(depositors.length == nonces.length, "Governance: length mismatch");

        DepositBox depositBoxContract = DepositBox(depositBox);

        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            uint256[] memory userNonces = nonces[i];

            for (uint256 j = 0; j < userNonces.length; j++) {
                try depositBoxContract.refundDeposit(depositor, userNonces[j]) {
                    emit RefundExecuted(depositor, 0, 0);
                } catch {
                    // Skip failed refunds
                }
            }
        }
    }

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

    receive() external payable {
        require(msg.sender == depositBox, "Governance: only from deposit box");
    }
}
