#[test_only]
/// Lock registration against validator-certified Ethereum headers (issues 171, 197).
///
/// Fixtures are real `eth_getProof` output from anvil: LockBox.sol deployed
/// with FakeETH / FakeUSD, then USER locked 10 FakeETH (nonce 0) in block 6,
/// and an unrelated transaction mined block 7. The same lock is proven at
/// both blocks, under different state roots.
///
/// `ethereum_headers::set_header_for_test` stands in for a validator quorum
/// certificate. Every registration is carried by an account that is neither
/// @atomica nor the depositor: any account may carry a proof.
module atomica::eth_lock_registration_tests {
    use aptos_framework::ethereum_headers;
    use aptos_framework::timestamp;
    use atomica::eth_proof;
    use atomica::lock_receipt::{Self, Ethereum, FakeETH, FakeUSD};

    const LOCKBOX: vector<u8> = x"9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    const FAKE_ETH: vector<u8> = x"5FbDB2315678afecb367f032d93F642f64180aa3";
    const FAKE_USD: vector<u8> = x"e7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const USER: vector<u8> = x"f39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const TEN_ETH: u256 = 10000000000000000000;
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
    fun root_6(): vector<u8> { x"5b6545b4c0f529b4be8977fd5a1521a5768b58d2d3e79c1172f9e3bcc089a618" }

    /// LockBox account proof at block 6.
    fun account_proof_6(): vector<vector<u8>> {
        vector[
            x"f901b1a072ba1cd1b1d242d7813198006734a49f5a80bcbf9f927142c4b3d0e828bbe7cda01689b2a5203afd9ea0a0ca3765e4a538c7176e53eac1f8307a344ffc3c61765580a0525a550acb2f6f3c497cd8123df807b12ae97164f53793fcfb51ac914a2039e4a08c22f48173e849f81a64b005ae91e95b70f05dd091e89b6e395a78f949be3a5ca089e0a55777241dfc113492858baf94f6f487a560e190b9b9689f1504f2ef7577a0f8c4e41dcfc3d9bf2b040482246013d3db334c82be26135f90bdf9eff6334039a0e13b57392b313e7c7b98e4dfcded038192cc8ea51bc98e99d820f290b86b5656a04b29efa44ecf50c19b34950cf1d0f05e00568bcc873120fbea9a4e8439de0962a0d0a1bfe5b45d2d863a794f016450a4caca04f3b599e8d1652afca8b752935fd880a0bf9b09e442e044778b354abbadb5ec049d7f5e8b585c3966d476c4fbc9a181d280a0790246e443226568e8e28a7a70e77c5054bb012bdf72e505ee44786476232a47a0b36ee111a5f10a0ca3822351b0533003525d266313dd40a4a4106393e91957c9a0e5c557a0ce3894afeb44c37f3d24247f67dc76a174d8cacc360c1210eef60a7680",
            x"f871a023a4c93973b6d8ed7eb060c5f4057891ef24da802ae8391765379869c2ad71b280808080808080a03299524ef91f2124548d0e0c9750c3290633e193ddde6b7da1d74d71484aacb380808080a0ebad29f3b22dce63b09b3987ffbc2f077a4e966eb10919ca8297fa5cfa37647d808080",
            x"f869a020460e45164e07e0e4df7165de40d5863fb7b8ece896a164bf57a134287c68f5b846f8440180a029b5bdc9a4be6cade162ff90f3a2113019bf30852f7ddfda2d98869706df362fa0724f63104e5cf57b214d50e3af2cb5e86bdf03594b720bb89bdda49eb2c9d1b7",
        ]
    }

    /// Storage proof of lockAmounts[lock_id(USER, FAKE_ETH, 0)] at block 6.
    fun storage_proof_6(): vector<vector<u8>> {
        vector[
            x"f871a08857639e3944eefb53fc927fd82a371bd6fd6ada8f9fe9cbc2b6381c1aeb5fec80a000505b738666bfc003be886f10474d70293652955283d4b024c863ec603f1b21808080808080808080a0de0d702acbf7a589e5b8744babf76bfd87882d76a48d46d706bffd284d83334b80808080",
            x"f85180a04998943c41e9deca8dbe0b995219970e10abadcf461f8c12355183f64c0e1f2a808080808080808080a0cc61ef1332b0adb4a46d67131793f011b388b2f293d2d7e38fea1624783afcc38080808080",
            x"eba0207cfcae80f6649d0132e0c2df2e587834d4677956558abf8c8eb0b23075f14589888ac7230489e80000",
        ]
    }

    /// State root of anvil block 7.
    fun root_7(): vector<u8> { x"dbfb2e7809d2e11e9359c3ec55d8aa0254a04bc795e2d62a6c85ea34f977d7ba" }

    /// LockBox account proof at block 7.
    fun account_proof_7(): vector<vector<u8>> {
        vector[
            x"f901b1a072ba1cd1b1d242d7813198006734a49f5a80bcbf9f927142c4b3d0e828bbe7cda01689b2a5203afd9ea0a0ca3765e4a538c7176e53eac1f8307a344ffc3c61765580a0475663af86b726c056309666e238035e6dcc24e42097b83092bd839cc53e8167a0ccf3e10d3898c1ce4a4e5b9fb57f28a6d30c30063d274b4dc51862676c4242c3a03757d58bf4d92850d18e268101f52faf956815f6ad0fe7c075b985a4b98367cca083ef4fb5c9d02b0f37e445760e89229d7c8b1178070962631837aa323941b8eca0e13b57392b313e7c7b98e4dfcded038192cc8ea51bc98e99d820f290b86b5656a04b29efa44ecf50c19b34950cf1d0f05e00568bcc873120fbea9a4e8439de0962a0d0a1bfe5b45d2d863a794f016450a4caca04f3b599e8d1652afca8b752935fd880a0bf9b09e442e044778b354abbadb5ec049d7f5e8b585c3966d476c4fbc9a181d280a0790246e443226568e8e28a7a70e77c5054bb012bdf72e505ee44786476232a47a0fab9b9b59a8f2e844673b710075e012468dd61f1ce5751e65baa0cec73f943f7a0e5c557a0ce3894afeb44c37f3d24247f67dc76a174d8cacc360c1210eef60a7680",
            x"f871a023a4c93973b6d8ed7eb060c5f4057891ef24da802ae8391765379869c2ad71b280808080808080a03299524ef91f2124548d0e0c9750c3290633e193ddde6b7da1d74d71484aacb380808080a0ebad29f3b22dce63b09b3987ffbc2f077a4e966eb10919ca8297fa5cfa37647d808080",
            x"f869a020460e45164e07e0e4df7165de40d5863fb7b8ece896a164bf57a134287c68f5b846f8440180a029b5bdc9a4be6cade162ff90f3a2113019bf30852f7ddfda2d98869706df362fa0724f63104e5cf57b214d50e3af2cb5e86bdf03594b720bb89bdda49eb2c9d1b7",
        ]
    }

    /// Storage proof of lockAmounts[lock_id(USER, FAKE_ETH, 0)] at block 7.
    fun storage_proof_7(): vector<vector<u8>> {
        vector[
            x"f871a08857639e3944eefb53fc927fd82a371bd6fd6ada8f9fe9cbc2b6381c1aeb5fec80a000505b738666bfc003be886f10474d70293652955283d4b024c863ec603f1b21808080808080808080a0de0d702acbf7a589e5b8744babf76bfd87882d76a48d46d706bffd284d83334b80808080",
            x"f85180a04998943c41e9deca8dbe0b995219970e10abadcf461f8c12355183f64c0e1f2a808080808080808080a0cc61ef1332b0adb4a46d67131793f011b388b2f293d2d7e38fea1624783afcc38080808080",
            x"eba0207cfcae80f6649d0132e0c2df2e587834d4677956558abf8c8eb0b23075f14589888ac7230489e80000",
        ]
    }

    fun setup(framework: &signer, atomica: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        eth_proof::initialize(atomica, LOCKBOX, FAKE_ETH, FAKE_USD, b"localhost:3000");
        lock_receipt::initialize<Ethereum, FakeETH>(atomica);
        lock_receipt::initialize<Ethereum, FakeUSD>(atomica);
    }

    // ==================== verify_lock ====================

    #[test(framework = @0x1, atomica = @atomica)]
    fun verify_lock_reads_one_lock_amount(framework: &signer, atomica: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        let amount = eth_proof::verify_lock(
            6, USER, FAKE_ETH, 0, account_proof_6(), storage_proof_6()
        );
        assert!(amount == TEN_ETH, 0);
    }

    // ==================== register_ethereum_lock ====================

    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun registers_lock_proven_at_certified_header(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());

        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );

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
    }

    // Bad root: the proof is for block 6, but the certified root of block 6 is
    // another one. The caller cannot supply its own root.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 2, location = atomica::mpt)]
    fun rejects_proof_against_other_certified_root(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_7());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
    }

    // The validators have not certified the proof block: nothing to verify
    // against, even when a later block is certified.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 9, location = atomica::eth_proof)]
    fun rejects_block_without_certified_header(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(7, root_7());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
    }

    // Duplicate lock: the same lock proven again at a later block (a new
    // state root and a new block hash) is the same lock id, so it aborts.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 1, location = atomica::lock_receipt)]
    fun rejects_same_lock_proven_at_second_block(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        certify(7, root_7());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 7, USER, 0, account_proof_7(), storage_proof_7()
        );
    }

    // The block 7 proof is valid on its own, so the duplicate test above
    // fails for the duplicate, not for a bad proof.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun second_block_proof_is_valid_alone(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(7, root_7());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 7, USER, 0, account_proof_7(), storage_proof_7()
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
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
    }

    // Another nonce names another slot, which this proof does not cover.
    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    #[expected_failure(abort_code = 1, location = atomica::mpt)]
    fun rejects_lock_under_another_nonce(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 1, account_proof_6(), storage_proof_6()
        );
    }

    // The depositor's own Ethereum-derivable account may carry the proof too.
    #[test(framework = @0x1, atomica = @atomica)]
    fun depositor_account_registers(framework: &signer, atomica: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        let depositor = aptos_framework::account::create_signer_for_test(USER_ACCOUNT);
        lock_receipt::register_ethereum_lock<FakeETH>(
            &depositor, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
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
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
        lock_receipt::claim<Ethereum, FakeETH>(@atomica, eth_proof::lock_id(USER, FAKE_ETH, 0));
    }

    #[test(framework = @0x1, atomica = @atomica, carrier = @0x123)]
    fun derived_owner_claims_registered_receipt(framework: &signer, atomica: &signer, carrier: &signer) {
        setup(framework, atomica);
        certify(6, root_6());
        lock_receipt::register_ethereum_lock<FakeETH>(
            carrier, 6, USER, 0, account_proof_6(), storage_proof_6()
        );
        let amount = lock_receipt::claim<Ethereum, FakeETH>(
            USER_ACCOUNT, eth_proof::lock_id(USER, FAKE_ETH, 0)
        );
        assert!(amount == TEN_ETH, 0);
    }
}
