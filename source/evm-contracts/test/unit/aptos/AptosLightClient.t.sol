// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AptosLightClient} from "../../../src/aptos/AptosLightClient.sol";
import {IAptosLightClient} from "../../../src/aptos/IAptosLightClient.sol";
import {AptosTypes} from "../../../src/aptos/AptosTypes.sol";
import {AptosHash} from "../../../src/aptos/AptosHash.sol";
import {Bls12381} from "../../../src/aptos/Bls12381.sol";
import {AptosVectors} from "./AptosVectors.sol";
import {AptosTestChain} from "./AptosTestChain.sol";

/**
 * @notice AptosLightClient against the golden vectors from atomica-aptos, plus synthetic chains
 *         with real BLS signatures for the cases the vectors do not cover and the gas ceilings.
 *         Every failing case asserts the exact custom error.
 */
contract AptosLightClientTest is AptosVectors, AptosTestChain {
    string internal constant EPOCH_CHANGE = ".epoch_change";
    string internal constant SET1 = ".validator_sets[0]";
    string internal constant SET2 = ".validator_sets[1]";

    uint256 internal constant VERIFY_EVENT_GAS_CEILING = 8_000_000;
    uint256 internal constant ADVANCE_EPOCH_GAS_CEILING = 15_000_000;

    bytes internal auctionOutcomeTag = structTag(bytes32(uint256(0xcafe)), "auction", "AuctionOutcome");

    // ---------------------------------------------------------------- constructor

    function test_constructorAcceptsGoldenGenesis() public {
        AptosLightClient client = _genesisClient();
        assertEq(client.latestEpoch(), 1);
        assertEq(client.epochStateHash(1), keccak256(_hex(string.concat(SET1, ".epoch_state_bcs"))));
        assertEq(client.epochStateHash(0), bytes32(0));
    }

    /// A one-byte change in the genesis LedgerInfo (its executed_state_id) breaks the waypoint.
    function test_constructorRevertsOnOneByteChange() public {
        bytes memory genesisLi = _hex(".genesis.ledger_info_with_signatures");
        genesisLi[AptosTypes.EXECUTED_STATE_ID_OFFSET] ^= 0x01;
        vm.expectRevert(IAptosLightClient.WaypointMismatch.selector);
        new AptosLightClient(genesisLi, 0, _b32(".genesis.waypoint_value"));
    }

    /// A one-byte change in the genesis validator set breaks the waypoint too.
    function test_constructorRevertsOnValidatorSetChange() public {
        bytes memory genesisLi = _hex(".genesis.ledger_info_with_signatures");
        genesisLi[200] ^= 0x01;
        vm.expectRevert(IAptosLightClient.WaypointMismatch.selector);
        new AptosLightClient(genesisLi, 0, _b32(".genesis.waypoint_value"));
    }

    function test_constructorRevertsOnWrongWaypointVersion() public {
        bytes memory genesisLi = _hex(".genesis.ledger_info_with_signatures");
        vm.expectRevert(IAptosLightClient.WaypointMismatch.selector);
        new AptosLightClient(genesisLi, 1, _b32(".genesis.waypoint_value"));
    }

    // ---------------------------------------------------------------- advanceEpoch

    function test_advanceEpochAcceptsGoldenQuorum() public {
        AptosLightClient client = _genesisClient();
        vm.expectEmit(address(client));
        emit IAptosLightClient.EpochAdvanced(2, keccak256(_hex(string.concat(SET2, ".epoch_state_bcs"))));
        client.advanceEpoch(_goldenEpochChange());
        assertEq(client.latestEpoch(), 2);
        assertEq(client.epochStateHash(2), keccak256(_hex(string.concat(SET2, ".epoch_state_bcs"))));
        assertEq(client.epochStateHash(1), keccak256(_hex(string.concat(SET1, ".epoch_state_bcs"))));
    }

    /// Only validator 3 (voting power 4) signs. The epoch 1 quorum is 7.
    function test_advanceEpochRevertsBelowQuorum() public {
        AptosLightClient client = _genesisClient();
        IAptosLightClient.SignedLedgerInfo memory s = _goldenEpochChange();
        AptosTypes.LedgerInfo memory li = AptosTypes.parseLedgerInfoWithSignatures(s.ledgerInfoWithSignatures);
        s.ledgerInfoWithSignatures[li.bitmaskStart] = 0x10;
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.InsufficientVotingPower.selector, 4, 7));
        client.advanceEpoch(s);
    }

    /// The epoch 2 validator set offered for an epoch 1 LedgerInfo.
    function test_advanceEpochRevertsOnWrongSet() public {
        AptosLightClient client = _genesisClient();
        IAptosLightClient.SignedLedgerInfo memory s = _goldenEpochChange();
        s.epochState = _hex(string.concat(SET2, ".epoch_state_bcs"));
        vm.expectRevert(IAptosLightClient.ValidatorSetMismatch.selector);
        client.advanceEpoch(s);
    }

    function test_advanceEpochRevertsOnReplay() public {
        AptosLightClient client = _genesisClient();
        client.advanceEpoch(_goldenEpochChange());
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.EpochAlreadyAdvanced.selector, 1));
        client.advanceEpoch(_goldenEpochChange());
    }

    /// A validly signed epoch 2 change offered while only epoch 1 is known.
    function test_advanceEpochRevertsOnSkippedEpoch() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        ValidatorSet memory set2 = makeSet(2, 4, 2, 1);
        ValidatorSet memory set3 = makeSet(3, 4, 3, 1);
        AptosLightClient client = _syntheticClient(set1);
        LedgerInfoFields memory f;
        f.epoch = 2;
        f.round = 9;
        f.version = 20;
        f.nextEpochState = set3.epochState;
        IAptosLightClient.SignedLedgerInfo memory s = signLedgerInfo(set2, firstSigners(4, 3), f);
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.UnknownEpoch.selector, 2));
        client.advanceEpoch(s);
    }

    /// The outcome LedgerInfo does not end its epoch.
    function test_advanceEpochRevertsOnNonEpochEnding() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        vm.expectRevert(IAptosLightClient.NotEpochEnding.selector);
        client.advanceEpoch(_goldenOutcomeLedgerInfo(0));
    }

    // ---------------------------------------------------------------- verifyEvent

    function test_verifyEventReturnsGoldenAuctionOutcome() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        (uint64 version, bytes memory data) = client.verifyEvent(_goldenEventProof(), auctionOutcomeTag);
        assertEq(version, 1337);
        assertEq(data, _hex(".event.event_data"));
    }

    function test_verifyEventRevertsOnWrongTypeTag() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        bytes memory tag = structTag(bytes32(uint256(0xcafe)), "auction", "AuctionStarted");
        vm.expectRevert(AptosTypes.UnexpectedEventType.selector);
        client.verifyEvent(_goldenEventProof(), tag);
    }

    function test_verifyEventRevertsOnTamperedTransactionSibling() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.transactionAccumulatorProof[5] ^= 0x01;
        vm.expectRevert(AptosHash.AccumulatorRootMismatch.selector);
        client.verifyEvent(p, auctionOutcomeTag);
    }

    function test_verifyEventRevertsOnTamperedEventSibling() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.eventAccumulatorProof[40] ^= 0x01;
        vm.expectRevert(AptosHash.AccumulatorRootMismatch.selector);
        client.verifyEvent(p, auctionOutcomeTag);
    }

    /// The proof claims another version: the leaf index no longer leads to the root.
    function test_verifyEventRevertsOnWrongVersion() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.version = 1336;
        vm.expectRevert(AptosHash.AccumulatorRootMismatch.selector);
        client.verifyEvent(p, auctionOutcomeTag);
    }

    function test_verifyEventRevertsOnVersionAfterLedgerInfo() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.version = 1337 + 2048;
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.VersionAfterLedgerInfo.selector, 1337 + 2048, 1499));
        client.verifyEvent(p, auctionOutcomeTag);
    }

    function test_verifyEventRevertsOnUnknownEpoch() public {
        AptosLightClient client = _genesisClient();
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.UnknownEpoch.selector, 2));
        client.verifyEvent(_goldenEventProof(), auctionOutcomeTag);
    }

    /// Golden below-quorum vector: validators 0 and 2 hold 7 of 11. The quorum is 8.
    function test_verifyEventRevertsOnGoldenBelowQuorum() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.ledgerInfo = _goldenOutcomeLedgerInfo(1);
        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.InsufficientVotingPower.selector, 7, 8));
        client.verifyEvent(p, auctionOutcomeTag);
    }

    /// Golden flipped-bit vector: the flipped signature is not in the G2 subgroup.
    function test_verifyEventRevertsOnGoldenFlippedSignatureBit() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.ledgerInfo = _goldenOutcomeLedgerInfo(2);
        vm.expectRevert(abi.encodeWithSelector(Bls12381.PrecompileFailed.selector, Bls12381.PAIRING));
        client.verifyEvent{gas: 20_000_000}(p, auctionOutcomeTag);
    }

    /// Golden previous-epoch vector: the epoch 1 set signed an epoch 2 LedgerInfo.
    function test_verifyEventRevertsOnGoldenPreviousEpochSet() public {
        AptosLightClient client = _goldenClientAtEpoch2();
        IAptosLightClient.EventProof memory p = _goldenEventProof();
        p.ledgerInfo = _goldenOutcomeLedgerInfo(3);
        vm.expectRevert(Bls12381.InvalidSignature.selector);
        client.verifyEvent(p, auctionOutcomeTag);
    }

    /// A failed transaction committed under a validly signed LedgerInfo.
    function test_verifyEventRevertsOnFailedTransaction() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        AptosLightClient client = _syntheticClient(set1);
        IAptosLightClient.EventProof memory p = _syntheticEventProof(set1, 7, 3, false);
        vm.expectRevert(AptosTypes.TransactionFailed.selector);
        client.verifyEvent(p, auctionOutcomeTag);
    }

    /// A valid quorum proof from epoch 1 stops verifying once the client advances to epoch 2.
    function test_verifyEventRevertsOnStaleEpoch() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        ValidatorSet memory set2 = makeSet(2, 4, 2, 1);
        AptosLightClient client = _syntheticClient(set1);
        IAptosLightClient.EventProof memory p = _syntheticEventProof(set1, 7, 3, true);
        client.verifyEvent(p, auctionOutcomeTag);

        LedgerInfoFields memory f;
        f.epoch = 1;
        f.round = 10;
        f.executedStateId = keccak256("epoch 1 end");
        f.version = 20;
        f.nextEpochState = set2.epochState;
        client.advanceEpoch(signLedgerInfo(set1, firstSigners(4, 3), f));
        assertEq(client.latestEpoch(), 2);

        vm.expectRevert(abi.encodeWithSelector(IAptosLightClient.StaleEpoch.selector, 1, 2));
        client.verifyEvent(p, auctionOutcomeTag);
    }

    function test_verifyEventAcceptsSyntheticProof() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        AptosLightClient client = _syntheticClient(set1);
        IAptosLightClient.EventProof memory p = _syntheticEventProof(set1, 7, 3, true);
        (uint64 version, bytes memory data) = client.verifyEvent(p, auctionOutcomeTag);
        assertEq(version, 7);
        assertEq(data, bytes("outcome"));
    }

    // ---------------------------------------------------------------- gas ceilings

    /// verifyEvent with a 4-validator set and a 2^20-leaf transaction accumulator.
    function test_gasVerifyEvent4Validators2Pow20Leaves() public {
        ValidatorSet memory set1 = makeSet(1, 4, 1, 1);
        AptosLightClient client = _syntheticClient(set1);
        IAptosLightClient.EventProof memory p = _syntheticEventProof(set1, (1 << 20) - 1, 20, true);
        bytes memory callData = abi.encodeCall(IAptosLightClient.verifyEvent, (p, auctionOutcomeTag));
        uint256 used = _measure(address(client), callData);
        emit log_named_uint("verifyEvent gas (4 validators, 2^20 leaves)", used);
        assertLe(used, VERIFY_EVENT_GAS_CEILING);
    }

    /// advanceEpoch from a 100-validator set, signed by its quorum of 67, to a new 100-validator set.
    function test_gasAdvanceEpochTo100Validators() public {
        ValidatorSet memory set1 = makeSet(1, 100, 1, 1);
        ValidatorSet memory set2 = makeSet(2, 100, 2, 1);
        AptosLightClient client = _syntheticClient(set1);
        LedgerInfoFields memory f;
        f.epoch = 1;
        f.round = 50;
        f.executedStateId = keccak256("epoch 1 end");
        f.version = 5000;
        f.nextEpochState = set2.epochState;
        IAptosLightClient.SignedLedgerInfo memory s = signLedgerInfo(set1, firstSigners(100, 67), f);
        bytes memory callData = abi.encodeCall(IAptosLightClient.advanceEpoch, (s));
        uint256 used = _measure(address(client), callData);
        emit log_named_uint("advanceEpoch gas (100 to 100 validators)", used);
        assertLe(used, ADVANCE_EPOCH_GAS_CEILING);
        assertEq(client.latestEpoch(), 2);
        assertEq(client.epochStateHash(2), keccak256(set2.epochState));
    }

    // ---------------------------------------------------------------- helpers

    /// @dev Transaction gas: 21000, plus calldata at the larger of the standard and EIP-7623 floor
    ///      prices, plus the execution gas of the call.
    function _measure(address target, bytes memory callData) internal returns (uint256) {
        uint256 zeros;
        for (uint256 i = 0; i < callData.length; i++) {
            if (callData[i] == 0) zeros++;
        }
        uint256 tokens = zeros + 4 * (callData.length - zeros);
        uint256 before = gasleft();
        (bool ok, bytes memory ret) = target.call(callData);
        uint256 execution = before - gasleft();
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        uint256 standard = 21_000 + 4 * tokens + execution;
        uint256 floor = 21_000 + 10 * tokens;
        return standard > floor ? standard : floor;
    }

    function _genesisClient() internal returns (AptosLightClient) {
        return new AptosLightClient(
            _hex(".genesis.ledger_info_with_signatures"),
            uint64(vm.parseJsonUint(vectors, ".genesis.waypoint_version")),
            _b32(".genesis.waypoint_value")
        );
    }

    function _goldenClientAtEpoch2() internal returns (AptosLightClient client) {
        client = _genesisClient();
        client.advanceEpoch(_goldenEpochChange());
    }

    function _goldenEpochChange() internal view returns (IAptosLightClient.SignedLedgerInfo memory s) {
        s.ledgerInfoWithSignatures = _hex(string.concat(EPOCH_CHANGE, ".ledger_info_with_signatures"));
        s.epochState = _hex(string.concat(SET1, ".epoch_state_bcs"));
        s.signerPublicKeys = _signerKeys(SET1, string.concat(EPOCH_CHANGE, ".signing"));
        s.signature = _hex(string.concat(EPOCH_CHANGE, ".signing.signature_eip2537"));
    }

    /// Outcome LedgerInfo case `i`, offered with the epoch 2 set and the keys at its signer indexes.
    function _goldenOutcomeLedgerInfo(uint256 i) internal view returns (IAptosLightClient.SignedLedgerInfo memory s) {
        string memory c = string.concat(".outcome_ledger_infos[", vm.toString(i), "]");
        s.ledgerInfoWithSignatures = _hex(string.concat(c, ".ledger_info_with_signatures"));
        s.epochState = _hex(string.concat(SET2, ".epoch_state_bcs"));
        s.signerPublicKeys = _signerKeys(SET2, string.concat(c, ".signing"));
        s.signature = _hex(string.concat(c, ".signing.signature_eip2537"));
    }

    function _goldenEventProof() internal view returns (IAptosLightClient.EventProof memory p) {
        p.ledgerInfo = _goldenOutcomeLedgerInfo(0);
        p.version = uint64(vm.parseJsonUint(vectors, ".transaction.version"));
        p.transactionInfo = _hex(".transaction.transaction_info");
        p.transactionAccumulatorProof = _hex(".transaction.transaction_accumulator_proof");
        p.eventIndex = uint64(vm.parseJsonUint(vectors, ".event.index"));
        p.contractEvent = _hex(".event.event");
        p.eventAccumulatorProof = _hex(".event.event_accumulator_proof");
    }

    function _signerKeys(string memory set, string memory signing) internal view returns (bytes memory keys) {
        uint256[] memory idx = vm.parseJsonUintArray(vectors, string.concat(signing, ".signer_indexes"));
        for (uint256 i = 0; i < idx.length; i++) {
            keys = abi.encodePacked(
                keys, _hex(string.concat(set, ".validators[", vm.toString(idx[i]), "].public_key_eip2537"))
            );
        }
    }

    function _syntheticClient(ValidatorSet memory first) internal returns (AptosLightClient) {
        (bytes memory liws, uint64 wpVersion, bytes32 wpHash) = genesis(first);
        return new AptosLightClient(liws, wpVersion, wpHash);
    }

    /// An AuctionOutcome event (index 1 of 3) in the transaction at `version`, under an epoch 1
    /// LedgerInfo signed by 3 of 4 validators, with a transaction accumulator proof of `depth`.
    function _syntheticEventProof(ValidatorSet memory set1, uint64 version, uint256 depth, bool success)
        internal
        view
        returns (IAptosLightClient.EventProof memory p)
    {
        p.contractEvent = eventV2(auctionOutcomeTag, bytes("outcome"));
        p.eventIndex = 1;
        bytes32 eventRoot;
        (p.eventAccumulatorProof, eventRoot) = accumulator(
            AptosHash.EVENT_ACCUMULATOR_SEED,
            AptosHash.hashWithSeed(AptosHash.CONTRACT_EVENT_SEED, p.contractEvent),
            1,
            2
        );
        p.transactionInfo = transactionInfo(eventRoot, success);
        p.version = version;
        bytes32 root;
        (p.transactionAccumulatorProof, root) = accumulator(
            AptosHash.TRANSACTION_ACCUMULATOR_SEED,
            AptosHash.hashWithSeed(AptosHash.TRANSACTION_INFO_SEED, p.transactionInfo),
            version,
            depth
        );
        LedgerInfoFields memory f;
        f.epoch = 1;
        f.round = 3;
        f.executedStateId = root;
        f.version = version;
        f.timestampUsecs = 1_700_000_000_000_000;
        p.ledgerInfo = signLedgerInfo(set1, firstSigners(4, 3), f);
    }
}
