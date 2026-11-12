#[test_only]
/// Lock registration against validator-certified Ethereum headers (issues 171,
/// 197, 203).
///
/// Fixtures are real `eth_getProof` output from anvil: the proof-gated
/// LockBox.sol deployed with FakeETH / FakeUSD, then USER locked 10 FakeETH
/// (nonce 0) into window WINDOW_ID, pair hash keccak256(""), deadline
/// `eth_lock_deadline(WINDOW_ID)` in block 6, and an unrelated transaction
/// mined block 7. The proof covers LockBox slot 0: `commitments[lock_id]`.
/// The same lock is proven at both blocks, under different state roots.
/// `source/evm-contracts/script/LockProofFixture.s.sol` regenerates it.
///
/// `ethereum_headers::set_header_for_test` stands in for a validator quorum
/// certificate. Every registration is carried by an account that is neither
/// @atomica nor the depositor: any account may carry a proof.
module atomica::eth_lock_registration_tests {
    use aptos_framework::ethereum_headers;
    use aptos_framework::timestamp;
    use atomica::auction;
    use atomica::eth_proof;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

    const LOCKBOX: vector<u8> = x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    const FAKE_ETH: vector<u8> = x"5FbDB2315678afecb367f032d93F642f64180aa3";
    const FAKE_USD: vector<u8> = x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const USER: vector<u8> = x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const TEN_ETH: u256 = 10000000000000000000;
    /// The window the fixture lock is bound to: the anvil lock was mined at
    /// unix second 1794441605, after the 16:15 UTC close of window 41537.
    const WINDOW_ID: u64 = 41538;
    /// eth_lock_deadline(WINDOW_ID): window close 1794469500 (07:45 UTC) plus 72 hours.
    const DEADLINE: u64 = 1794728700;
    /// keccak256 of the empty pair BCS.
    const PAIR_HASH: vector<u8> = x"c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    /// `LockBox.commitments(lock_id)` read back from anvil after the lock.
    const COMMITMENT: vector<u8> = x"7cc6092f969b4b2ba9933b617e48965ee144d303198d4eeb3764e72eecbb20c1";
    /// `LockBox.getLockId(USER, FAKE_ETH, 0)` read back from anvil.
    const LOCK_ID: vector<u8> = x"971e89c2b26f64aa4fc94b73baad52f35b2beb721f37991b5771e8328a10586a";
    /// `LockBox.commitmentStorageKey(LOCK_ID)` read back from anvil.
    const STORAGE_KEY: vector<u8> = x"d06824aae8fc45f9d700be7d63b09e0baf2d07b123582f9e14a61e62c3ff0e71";
    /// Any 32-byte block hash: eth_proof reads only the state root.
    const BLOCK_HASH: vector<u8> = x"1111111111111111111111111111111111111111111111111111111111111111";
    /// `getDerivedAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "localhost:3000")`
    /// from the SDK (source/atomica-sdk/src/siwe.ts).
    const USER_ACCOUNT: address = @0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6;

    /// The validators certify `root` for `block`.
    fun certify(block: u64, root: vector<u8>) {
        ethereum_headers::set_header_for_test(block, BLOCK_HASH, root);
    }

    /// State root of anvil block 6.
    fun root_6(): vector<u8> { x"bc2de0b6f81c049ad6fe19b1aa0897512e14dec90f9163d14f072a6dcab50bf0" }

    /// LockBox account proof at block 6.
    fun account_proof_6(): vector<vector<u8>> {
        vector[
            x"f901b1a0f2384d9e2436b063374a9bd416febb0da60d6730c2c88ac1cbd62b63e14b5dd9a01689b2a5203afd9ea0a0ca3765e4a538c7176e53eac1f8307a344ffc3c61765580a0cc4e5619e4704a5b5cc7773cc90baea3b3e9dd4b1eb6b994e2c887c791daf3b5a0e06cb58daca009b35307325064e6aeb09217cf78a0f7a2359e5e11980fba9b25a056a3b95b1f64847dc241d19022202c905d0ffdf34ec78551cb570ed9396ecaf8a09cde463072ed7bb4f47f260728d527867a9f94b8bfabd710aba1976203651813a06b18599a671d3835a0608c6c48909b6ee859c339cc91c4846bce6036e4718608a04b29efa44ecf50c19b34950cf1d0f05e00568bcc873120fbea9a4e8439de0962a0d0a1bfe5b45d2d863a794f016450a4caca04f3b599e8d1652afca8b752935fd880a0bf9b09e442e044778b354abbadb5ec049d7f5e8b585c3966d476c4fbc9a181d280a0790246e443226568e8e28a7a70e77c5054bb012bdf72e505ee44786476232a47a04789a0d9c5c9f41ef9ed977d15aaa70c935d27d551233aec4eddffeb2df6e103a0e5c557a0ce3894afeb44c37f3d24247f67dc76a174d8cacc360c1210eef60a7680",
            x"f871a023a4c93973b6d8ed7eb060c5f4057891ef24da802ae8391765379869c2ad71b280808080808080a02b16129b6e4fa287c73693f4718338e6666dd77c42a034d8133589f834af3a4c80808080a0ebad29f3b22dce63b09b3987ffbc2f077a4e966eb10919ca8297fa5cfa37647d808080",
            x"f869a020460e45164e07e0e4df7165de40d5863fb7b8ece896a164bf57a134287c68f5b846f8440180a0d3407db18209fa2a9aeccbce71719fbc86047fe4492eceef9ff2b9fb7799a4c7a08038a51e5f5a72908346afac40d244fec4314f57774a801af637aa4e4127b4f9",
        ]
    }

    /// Storage proof of commitments[lock_id(USER, FAKE_ETH, 0)] at block 6.
    fun storage_proof_6(): vector<vector<u8>> {
        vector[
            x"f8b1a059ede42558910a5b6065b21716d108204d163fc39183dd6522286b9373072791a0467bea250b4fc92ee2ba99f36332a31deb03edbc517ce9a911fbb89a89c29b9b808080808080a0071b011fdbd4ad7d1e6f9762be4d1a88dffde614a6bd399bf3b5bad8f41249b580a0907c52b3a38fcbc3b9368f06819cf419942340ff846eca47f8e59c1d40a2196f8080a01329bd8b355e6a39ebf3eb7c148a78b3dbf1093a155106da6c038747213714e7808080",
            x"f843a034fdef4e9be7793964c45abb9b0f44ec3a05c2d1ce3e35c95c15693d91240226a1a07cc6092f969b4b2ba9933b617e48965ee144d303198d4eeb3764e72eecbb20c1",
        ]
    }

    /// State root of anvil block 7.
    fun root_7(): vector<u8> { x"1a1b323f3e04fcbf8a9e0a6c762370e45760fa5153d9c30eb9ca31da642f61d1" }

    /// LockBox account proof at block 7.
    fun account_proof_7(): vector<vector<u8>> {
        vector[
            x"f901b1a0f2384d9e2436b063374a9bd416febb0da60d6730c2c88ac1cbd62b63e14b5dd9a01689b2a5203afd9ea0a0ca3765e4a538c7176e53eac1f8307a344ffc3c61765580a07e201bb622fa0637826a34a7195085ca7df1d7089d81c5642df50a095b69f739a0e06cb58daca009b35307325064e6aeb09217cf78a0f7a2359e5e11980fba9b25a0c378d8974aa13010131ac08445b8b9481085c4cf8b76fb6cf83a152a5846690ea073ee915c505a028c0e997134af09b285dcdf2ecbacfc69a2627b4f018f96e745a08b01ee09acde1817b7083ada51a30317e7dbba20b8ff411ec957563a7f40b6bda04b29efa44ecf50c19b34950cf1d0f05e00568bcc873120fbea9a4e8439de0962a0d0a1bfe5b45d2d863a794f016450a4caca04f3b599e8d1652afca8b752935fd880a0bf9b09e442e044778b354abbadb5ec049d7f5e8b585c3966d476c4fbc9a181d280a0790246e443226568e8e28a7a70e77c5054bb012bdf72e505ee44786476232a47a0fa2802063cd761153d8cde2dd2dd4c3df15159a218c07b8c91acef46cd0de0c1a0e5c557a0ce3894afeb44c37f3d24247f67dc76a174d8cacc360c1210eef60a7680",
            x"f871a023a4c93973b6d8ed7eb060c5f4057891ef24da802ae8391765379869c2ad71b280808080808080a02b16129b6e4fa287c73693f4718338e6666dd77c42a034d8133589f834af3a4c80808080a0ebad29f3b22dce63b09b3987ffbc2f077a4e966eb10919ca8297fa5cfa37647d808080",
            x"f869a020460e45164e07e0e4df7165de40d5863fb7b8ece896a164bf57a134287c68f5b846f8440180a0d3407db18209fa2a9aeccbce71719fbc86047fe4492eceef9ff2b9fb7799a4c7a08038a51e5f5a72908346afac40d244fec4314f57774a801af637aa4e4127b4f9",
        ]
    }

    /// Storage proof of commitments[lock_id(USER, FAKE_ETH, 0)] at block 7.
    fun storage_proof_7(): vector<vector<u8>> {
        vector[
            x"f8b1a059ede42558910a5b6065b21716d108204d163fc39183dd6522286b9373072791a0467bea250b4fc92ee2ba99f36332a31deb03edbc517ce9a911fbb89a89c29b9b808080808080a0071b011fdbd4ad7d1e6f9762be4d1a88dffde614a6bd399bf3b5bad8f41249b580a0907c52b3a38fcbc3b9368f06819cf419942340ff846eca47f8e59c1d40a2196f8080a01329bd8b355e6a39ebf3eb7c148a78b3dbf1093a155106da6c038747213714e7808080",
            x"f843a034fdef4e9be7793964c45abb9b0f44ec3a05c2d1ce3e35c95c15693d91240226a1a07cc6092f969b4b2ba9933b617e48965ee144d303198d4eeb3764e72eecbb20c1",
        ]
    }

    // ==================== Fixture of a lock with a wrong deadline ====================
    //
    // The fixture before issue 220, kept for the computed lock deadline issue
    // (221): the same anvil lock bound to window 83075 with deadline
    // 1794700800, the deadline of the old window formula. Under the current
    // formula `eth_lock_deadline(83075)` is another second, so this is a
    // proven commitment whose deadline is not `eth_lock_deadline(window_id)`.
    // A LockBox that computes the deadline itself cannot make one.

    const WRONG_DEADLINE_WINDOW_ID: u64 = 83075;
    const WRONG_DEADLINE: u64 = 1794700800;
    const WRONG_DEADLINE_COMMITMENT: vector<u8> = x"47aeb7321d102da54ae9a862722094e50a626d1bb23a2651a6acc48cde9bc0b6";

    /// State root of anvil block 6 of the wrong deadline fixture.
    fun wrong_deadline_root_6(): vector<u8> { x"c7d6d2d643a6c942f16a1cde7116e3ba916c9c04a6604a7454585b612ac8687e" }

    /// LockBox account proof at block 6 of the wrong deadline fixture.
    fun wrong_deadline_account_proof_6(): vector<vector<u8>> {
        vector[
            x"f901b1a05fb2b963b016c74d9762f8937982e37344d391e472fae3134e774851d62834e6a01689b2a5203afd9ea0a0ca3765e4a538c7176e53eac1f8307a344ffc3c61765580a05372195d9abd8a41425bdf7ed920ab7f0af14d562e524da3fc1aca03916265e7a063173d1b768cdb882e784f8d9faaacc13749a3f6557ecc97ffd5199fb22226baa0a7a324f5246f5158e6e70040a00780c7bfcc1482ca514d5b2a3b344ca1ef1591a0c65408ee64b48fc428d16b244e19de46c25036cdd855ab5d562e13d73828857aa0367537f48a29485aec1333c10c74987fcaf01e8c9fcd06611c5870530ee1a81da04b29efa44ecf50c19b34950cf1d0f05e00568bcc873120fbea9a4e8439de0962a0d0a1bfe5b45d2d863a794f016450a4caca04f3b599e8d1652afca8b752935fd880a0bf9b09e442e044778b354abbadb5ec049d7f5e8b585c3966d476c4fbc9a181d280a0790246e443226568e8e28a7a70e77c5054bb012bdf72e505ee44786476232a47a02e9459e60798274ef6ca26559bea389f166b95b6de75ccc80791c080caa63550a0e5c557a0ce3894afeb44c37f3d24247f67dc76a174d8cacc360c1210eef60a7680",
            x"f871a023a4c93973b6d8ed7eb060c5f4057891ef24da802ae8391765379869c2ad71b280808080808080a02d1549db99372ea4ca293d0a79c93dcba664f4ad6f1c1a2aa952e98792858eae80808080a0ebad29f3b22dce63b09b3987ffbc2f077a4e966eb10919ca8297fa5cfa37647d808080",
            x"f869a020460e45164e07e0e4df7165de40d5863fb7b8ece896a164bf57a134287c68f5b846f8440180a059562fc7cd6998bb9571f0a41ffee9a913370c78844fb39c5c7211e794a27206a0fed12667f6b3325066fb85a597088246dace74fe20c9bbedfcdb9fcce560c62e",
        ]
    }

    /// Storage proof of the wrong deadline commitment at block 6.
    fun wrong_deadline_storage_proof_6(): vector<vector<u8>> {
        vector[
            x"f8b1a0cd5ea61f0e2875f716b21616d6eb4cf16e4f199899cd2e12c443b1301be60950a0d707b37a3c09423dbc002978d8cfb55ab4e7c2b331cfbb43f4aec4a3afbf70c0808080808080a0071b011fdbd4ad7d1e6f9762be4d1a88dffde614a6bd399bf3b5bad8f41249b580a0cc04bed916db789b0b4e86e4cb679f42c777574ebf441e224625513076e409ab8080a01329bd8b355e6a39ebf3eb7c148a78b3dbf1093a155106da6c038747213714e7808080",
            x"f843a034fdef4e9be7793964c45abb9b0f44ec3a05c2d1ce3e35c95c15693d91240226a1a047aeb7321d102da54ae9a862722094e50a626d1bb23a2651a6acc48cde9bc0b6",
        ]
    }

    fun setup(framework: &signer, atomica: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        eth_proof::initialize(atomica, LOCKBOX, FAKE_ETH, FAKE_USD, b"localhost:3000");
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
    }

    // SCOUT(#221) EDIT: `register_6`, its 14 callers, the 4 direct `register_ethereum_lock` calls and the `verify_lock` call of this file drop the deadline argument.
    /// Register the fixture lock with the given fields, proven at block 6.
    fun register_6(carrier: &signer, amount: u256, window_id: u64, pair_hash: vector<u8>, deadline: u64) {
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, amount, window_id, pair_hash, deadline, account_proof_6(), storage_proof_6()
        );
    }

    // ==================== Lock binding mirrors LockBox ====================

    #[test]
    fun lock_id_commitment_and_slot_match_lockbox() {
        assert!(eth_proof::lock_id(USER, FAKE_ETH, 0) == LOCK_ID, 0);
        assert!(eth_proof::lock_storage_key(USER, FAKE_ETH, 0) == STORAGE_KEY, 1);
        assert!(
            eth_proof::lock_commitment(USER, FAKE_ETH, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE) == COMMITMENT,
            2
        );
        assert!(auction::pair_hash(b"") == PAIR_HASH, 3);
    }

    // SCOUT(#221) TEST: window_close_and_lock_deadline_match_the_shared_table (the same table as the forge and SDK tests)
    #[test]
    fun eth_lock_deadline_is_window_close_plus_delay() {
        // Window 41538 is the even window of day 20769: it closes at 07:45 UTC.
        assert!(eth_proof::window_close_secs(WINDOW_ID) == 20769 * 86400 + 27900, 0);
        assert!(auction::eth_lock_deadline(WINDOW_ID) == DEADLINE, 1);
        assert!(eth_proof::eth_reclaim_delay_secs() == 259200, 2);
        // The odd window before it closed at 16:15 UTC of the day before.
        assert!(eth_proof::window_close_secs(WINDOW_ID - 1) == 20768 * 86400 + 58500, 3);
        // The anvil lock second falls in WINDOW_ID.
        assert!(eth_proof::window_id_at(1794441605) == WINDOW_ID, 4);
    }

    #[test]
    fun window_close_secs_follows_0745_and_1615_utc() {
        assert!(eth_proof::window_close_secs(0) == 27900, 0);
        assert!(eth_proof::window_close_secs(1) == 58500, 1);
        assert!(eth_proof::window_close_secs(2) == 114300, 2);
        assert!(eth_proof::window_close_secs(3) == 144900, 3);
    }

    // ==================== verify_lock ====================

    #[test(framework = @0x1, atomica = @atomica)]
    fun verify_lock_accepts_commitment_proof(framework: &signer, atomica: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        eth_proof::verify_lock(
            6, USER, FAKE_ETH, 0, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE, account_proof_6(), storage_proof_6()
        );
    }

    // ==================== register_ethereum_lock ====================

    // SCOUT(#221) EDIT: the `auction_key` assert at the end of `registers_lock_proven_at_certified_header` loses the deadline argument.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun registers_lock_proven_at_certified_header(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());

        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);

        let lock_id = eth_proof::lock_id(USER, FAKE_ETH, 0);
        assert!(lock_receipt::is_lock_claimed<Ethereum, FakeETH>(lock_id), 0);
        let (user, amount, block, status, eth_owner) =
            lock_receipt::get_receipt<Ethereum, FakeETH>(lock_id);
        // The receipt names the proven depositor and its Ethereum-derivable
        // account, never the carrier.
        assert!(eth_owner == USER, 1);
        assert!(user == USER_ACCOUNT, 6);
        assert!(user == eth_proof::ethereum_account_address(USER), 7);
        assert!(amount == TEN_ETH, 2);
        assert!(block == 6, 3);
        assert!(status == lock_receipt::status_active(), 4);
        assert!(lock_receipt::get_receipt_count<Ethereum, FakeETH>() == 1, 5);
        let (window_id, pair_hash) = lock_receipt::get_receipt_binding<Ethereum, FakeETH>(lock_id);
        assert!(window_id == WINDOW_ID, 8);
        assert!(pair_hash == PAIR_HASH, 9);
        assert!(auction::auction_key(window_id, pair_hash) == eth_proof::auction_key(WINDOW_ID, PAIR_HASH, DEADLINE), 10);
    }

    // Wrong amount: the slot holds the commitment of 10 FakeETH, not 9.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 14, location = atomica::eth_proof)] // E_COMMITMENT_MISMATCH
    fun rejects_wrong_amount(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH - 1, WINDOW_ID, PAIR_HASH, DEADLINE);
    }

    // SCOUT(#221) EDIT: `rejects_wrong_deadline` becomes a commitment mismatch in `verify_lock`. It needs a proof of a commitment made with another deadline, and the new LockBox cannot make one: keep today's fixture for it.
    // Wrong deadline: any deadline but eth_lock_deadline(window_id) is refused,
    // so every registered lock of an auction shares one deadline.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 11, location = atomica::lock_receipt)] // E_WRONG_DEADLINE
    fun rejects_wrong_deadline(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE + 1);
    }

    // A proven commitment whose deadline is not eth_lock_deadline(window_id):
    // the proof holds against its certified root, and registration refuses it.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 11, location = atomica::lock_receipt)] // E_WRONG_DEADLINE
    fun rejects_proven_lock_with_another_deadline(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        assert!(eth_proof::eth_lock_deadline(WRONG_DEADLINE_WINDOW_ID) != WRONG_DEADLINE, 100);
        assert!(
            eth_proof::lock_commitment(
                USER, FAKE_ETH, TEN_ETH, WRONG_DEADLINE_WINDOW_ID, PAIR_HASH, WRONG_DEADLINE
            ) == WRONG_DEADLINE_COMMITMENT,
            101
        );
        certify(6, wrong_deadline_root_6());
        eth_proof::verify_lock(
            6, USER, FAKE_ETH, 0, TEN_ETH, WRONG_DEADLINE_WINDOW_ID, PAIR_HASH, WRONG_DEADLINE,
            wrong_deadline_account_proof_6(), wrong_deadline_storage_proof_6()
        );
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, TEN_ETH, WRONG_DEADLINE_WINDOW_ID, PAIR_HASH, WRONG_DEADLINE,
            wrong_deadline_account_proof_6(), wrong_deadline_storage_proof_6()
        );
    }

    // Another window with its own valid deadline: the lock commits to WINDOW_ID.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 14, location = atomica::eth_proof)] // E_COMMITMENT_MISMATCH
    fun rejects_other_window(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID + 1, PAIR_HASH, eth_proof::eth_lock_deadline(WINDOW_ID + 1));
    }

    // Another pair: the lock commits to keccak256("").
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 14, location = atomica::eth_proof)] // E_COMMITMENT_MISMATCH
    fun rejects_other_pair(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, auction::pair_hash(b"other pair"), DEADLINE);
    }

    // Bad root: the proof is for block 6, but the certified root of block 6 is
    // another one. The caller cannot supply its own root.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 2, location = atomica::mpt)]
    fun rejects_proof_against_other_certified_root(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_7());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
    }

    // The validators have not certified the proof block: nothing to verify
    // against, even when a later block is certified.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 9, location = atomica::eth_proof)]
    fun rejects_block_without_certified_header(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(7, root_7());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
    }

    // Duplicate lock: the same lock proven again at a later block (a new
    // state root and a new block hash) is the same lock id, so it aborts.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 1, location = atomica::lock_receipt)]
    fun rejects_same_lock_proven_at_second_block(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        certify(7, root_7());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 7, USER, 0, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE, account_proof_7(), storage_proof_7()
        );
    }

    // The block 7 proof is valid on its own, so the duplicate test above
    // fails for the duplicate, not for a bad proof.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun second_block_proof_is_valid_alone(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(7, root_7());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 7, USER, 0, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE, account_proof_7(), storage_proof_7()
        );
        assert!(lock_receipt::get_receipt_count<Ethereum, FakeETH>() == 1, 0);
    }

    // The token comes from the pinned asset mapping: a FakeETH lock cannot
    // be registered as FakeUSD (the derived storage key differs).
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 1, location = atomica::mpt)]
    fun rejects_lock_under_another_asset(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        lock_receipt::register_ethereum_lock<FakeUSD>(
            carrier, 6, USER, 0, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE, account_proof_6(), storage_proof_6()
        );
    }

    // Another nonce names another slot, which this proof does not cover.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 2, location = atomica::mpt)]
    fun rejects_lock_under_another_nonce(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 1, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE, account_proof_6(), storage_proof_6()
        );
    }

    // The depositor's own Ethereum-derivable account may carry the proof too.
    #[test(framework = @0x1, atomica = @atomica)]
    fun depositor_account_registers(framework: &signer, atomica: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        let depositor = aptos_framework::account::create_signer_for_test(USER_ACCOUNT);
        register_6(&depositor, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        let (user, _, _, _, _) =
            lock_receipt::get_receipt<Ethereum, FakeETH>(eth_proof::lock_id(USER, FAKE_ETH, 0));
        assert!(user == USER_ACCOUNT, 0);
    }

    // ==================== Claim after registration ====================

    // The @atomica account cannot claim a registered receipt: only the
    // depositor's Ethereum-derivable account can.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 5, location = atomica::lock_receipt)]
    fun atomica_cannot_claim_registered_receipt(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        lock_receipt::claim<Ethereum, FakeETH>(@atomica, eth_proof::lock_id(USER, FAKE_ETH, 0));
    }

    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun derived_owner_claims_registered_receipt(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        let amount = lock_receipt::claim<Ethereum, FakeETH>(
            USER_ACCOUNT, eth_proof::lock_id(USER, FAKE_ETH, 0)
        );
        assert!(amount == TEN_ETH, 0);
    }

    // ==================== mint_from_lock is retired ====================

    // The depositor's own account calls mint_from_lock on its ACTIVE receipt:
    // it aborts E_RETIRED, so the receipt is never claimed (the abort rolls
    // the whole transaction back and the receipt stays ACTIVE).
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 3, location = atomica::fake_eth)] // E_RETIRED
    fun fake_eth_mint_from_lock_is_retired(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        let lock_id = eth_proof::lock_id(USER, FAKE_ETH, 0);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == lock_receipt::status_active(), 100);
        let depositor = aptos_framework::account::create_signer_for_test(USER_ACCOUNT);
        atomica::fake_eth::mint_from_lock(&depositor, lock_id);
    }

    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 3, location = atomica::fake_usd)] // E_RETIRED
    fun fake_usd_mint_from_lock_is_retired(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        let lock_id = eth_proof::lock_id(USER, FAKE_ETH, 0);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == lock_receipt::status_active(), 100);
        let depositor = aptos_framework::account::create_signer_for_test(USER_ACCOUNT);
        atomica::fake_usd::mint_from_lock(&depositor, lock_id);
    }

    // Without mint_from_lock, a registered receipt stays ACTIVE until the
    // depositor's account claims it into an auction window.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun registered_receipt_stays_active_until_auction_claim(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        register_6(carrier, TEN_ETH, WINDOW_ID, PAIR_HASH, DEADLINE);
        let lock_id = eth_proof::lock_id(USER, FAKE_ETH, 0);
        assert!(lock_receipt::get_receipt_status<Ethereum, FakeETH>(lock_id) == lock_receipt::status_active(), 0);
        assert!(lock_receipt::claim<Ethereum, FakeETH>(USER_ACCOUNT, lock_id) == TEN_ETH, 1);
    }
}
