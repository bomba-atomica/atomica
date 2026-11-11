#[test_only]
/// outcome_tree against the shared fixture
/// source/atomica-sdk/tests/fixtures/outcome_tree_vectors.json, which the SDK
/// (outcome-tree.ts) and LockBox (OutcomeTree.sol) check too. Also pins the
/// BCS of `auction::AuctionOutcome` to the 201 golden vector.
module atomica::outcome_tree_tests {
    use std::vector;
    use atomica::auction;
    use atomica::outcome_tree;

    // ---------------------------------------------------------------- 1_leaves

    /// Unsorted input of case 1_leaves: (lock ids, payouts hashes computed here).
    fun case_1_leaves_input(): (vector<vector<u8>>, vector<vector<u8>>) {
        let ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        vector::push_back(&mut ids, x"4c7ede30b604e961a1f5c18e8a5f5af0df99710196167a7496fddd8b32cb69e5");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"6b9ead1b3fe055dbf9c24b7c2c23ff4a5362608b"], &vector[1000u256]));
        (ids, hashes)
    }

    #[test]
    fun case_1_leaves_matches_fixture() {
        let (ids, hashes) = case_1_leaves_input();
        let leaves = outcome_tree::sorted_leaves(ids, hashes);
        let root = x"3f775ad0ff796e0991ce5a15c22b4fb2aaabbcef25629477cbf572050324a884";
        assert!(outcome_tree::root(&leaves) == root, 0);
        assert!(*vector::borrow(&leaves, 0) == x"3f775ad0ff796e0991ce5a15c22b4fb2aaabbcef25629477cbf572050324a884", 10);
        assert!(outcome_tree::leaf_hash(x"4c7ede30b604e961a1f5c18e8a5f5af0df99710196167a7496fddd8b32cb69e5", x"b70518a445992e99b5b57c87806e8c30c410214ec35220b91412323a92a0b399") == x"3f775ad0ff796e0991ce5a15c22b4fb2aaabbcef25629477cbf572050324a884", 20);
        let proof = vector::empty<vector<u8>>();
        assert!(outcome_tree::proof(&leaves, 0) == proof, 30);
        assert!(outcome_tree::verify(x"3f775ad0ff796e0991ce5a15c22b4fb2aaabbcef25629477cbf572050324a884", 0, 1, &proof, root), 40);
    }

    // ---------------------------------------------------------------- 2_leaves

    /// Unsorted input of case 2_leaves: (lock ids, payouts hashes computed here).
    fun case_2_leaves_input(): (vector<vector<u8>>, vector<vector<u8>>) {
        let ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        vector::push_back(&mut ids, x"803214d868a55f50284ebd3eae18aae94acd16e35584423a58aa9a0dd59800f7");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"ea1ae982455eb410f68a740afcb829f43a752191"], &vector[1000u256]));
        vector::push_back(&mut ids, x"5b4e11a41a66bebd134a25ced045bd694f520a4b5f604dc698216720ed9b3195");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"3d1529634ea171e7eb899983a9e0fd26e79e3c3d", x"7fcc0c2bb6c65b5413ff3fbd36381bbbf6483e5a"], &vector[2000u256, 8u256]));
        (ids, hashes)
    }

    #[test]
    fun case_2_leaves_matches_fixture() {
        let (ids, hashes) = case_2_leaves_input();
        let leaves = outcome_tree::sorted_leaves(ids, hashes);
        let root = x"2c0de764b59eee6c83a21bfb0309669b03169e609a8a023da960230825b20c43";
        assert!(outcome_tree::root(&leaves) == root, 0);
        assert!(*vector::borrow(&leaves, 0) == x"b58e67487df3eb0f8136100d39b79133661912db6c86cdaac239e443c7a6da50", 10);
        assert!(outcome_tree::leaf_hash(x"5b4e11a41a66bebd134a25ced045bd694f520a4b5f604dc698216720ed9b3195", x"31bddc275acb301352b4918fb558f40878e15d796aac83a5de02a8b73ca4e666") == x"b58e67487df3eb0f8136100d39b79133661912db6c86cdaac239e443c7a6da50", 20);
        let proof = vector[x"fe987237b62d8bb979fd829a5891a4ddb88b03e67b35c982d6666eea650e93e4"];
        assert!(outcome_tree::proof(&leaves, 0) == proof, 30);
        assert!(outcome_tree::verify(x"b58e67487df3eb0f8136100d39b79133661912db6c86cdaac239e443c7a6da50", 0, 2, &proof, root), 40);
        assert!(*vector::borrow(&leaves, 1) == x"fe987237b62d8bb979fd829a5891a4ddb88b03e67b35c982d6666eea650e93e4", 11);
        assert!(outcome_tree::leaf_hash(x"803214d868a55f50284ebd3eae18aae94acd16e35584423a58aa9a0dd59800f7", x"860a786873023b58838df24c4d79287524327f83501b65c28bd94be86fd6964a") == x"fe987237b62d8bb979fd829a5891a4ddb88b03e67b35c982d6666eea650e93e4", 21);
        let proof = vector[x"b58e67487df3eb0f8136100d39b79133661912db6c86cdaac239e443c7a6da50"];
        assert!(outcome_tree::proof(&leaves, 1) == proof, 31);
        assert!(outcome_tree::verify(x"fe987237b62d8bb979fd829a5891a4ddb88b03e67b35c982d6666eea650e93e4", 1, 2, &proof, root), 41);
    }

    // ---------------------------------------------------------------- 3_leaves

    /// Unsorted input of case 3_leaves: (lock ids, payouts hashes computed here).
    fun case_3_leaves_input(): (vector<vector<u8>>, vector<vector<u8>>) {
        let ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        vector::push_back(&mut ids, x"5fe9dc5a28229c015cd41e053827e6c4ddabea2b76981e38281aef2192088349");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"dd5d6e82cd15ae0d73441e4b0f05b40eb72cb719"], &vector[1000u256]));
        vector::push_back(&mut ids, x"3e0b2ff2c03e729626fd38a127cabd694e12d9ab89df579373cae28b0e2c86f6");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"bee4fc952206011506b3893f1383dfefa6f42f4c", x"035c9dc1b253ef5ff312647fc34e784587788bb4"], &vector[2000u256, 8u256]));
        vector::push_back(&mut ids, x"4e90d3d7d098b9d328813fd7faa5deede0a0f63324235e12f27ab7b072a324aa");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"fe559aa79cfb7f7396b330714cc9254ca6c3d4b0"], &vector[3000u256]));
        (ids, hashes)
    }

    #[test]
    fun case_3_leaves_matches_fixture() {
        let (ids, hashes) = case_3_leaves_input();
        let leaves = outcome_tree::sorted_leaves(ids, hashes);
        let root = x"df2d64c259652f9abf9a6d9c8e07abf48f07c9fe50c97e98b17a33057f20fcc2";
        assert!(outcome_tree::root(&leaves) == root, 0);
        assert!(*vector::borrow(&leaves, 0) == x"0c71ceb0baa8d5e92d7176e0ef42f4795659615348d7278f22fbeb165760f381", 10);
        assert!(outcome_tree::leaf_hash(x"3e0b2ff2c03e729626fd38a127cabd694e12d9ab89df579373cae28b0e2c86f6", x"cdebfcc30f3a7fcea51ed019ab115f962ec33186add9eeced75c496dfe49d703") == x"0c71ceb0baa8d5e92d7176e0ef42f4795659615348d7278f22fbeb165760f381", 20);
        let proof = vector[x"b9bbb4dcbf53339bc0b05d8cf210214c5a03185a4c09de2ea7fb9355d84ce2d3", x"3c34759adcbac4f94de7f6613c0a5d04d9e2db847091d60fee915d2af5f9cfea"];
        assert!(outcome_tree::proof(&leaves, 0) == proof, 30);
        assert!(outcome_tree::verify(x"0c71ceb0baa8d5e92d7176e0ef42f4795659615348d7278f22fbeb165760f381", 0, 3, &proof, root), 40);
        assert!(*vector::borrow(&leaves, 1) == x"b9bbb4dcbf53339bc0b05d8cf210214c5a03185a4c09de2ea7fb9355d84ce2d3", 11);
        assert!(outcome_tree::leaf_hash(x"4e90d3d7d098b9d328813fd7faa5deede0a0f63324235e12f27ab7b072a324aa", x"a9bff72b896b4e2e7396ad1da6856b10ab07cbab80551497be75e8d41cb863f7") == x"b9bbb4dcbf53339bc0b05d8cf210214c5a03185a4c09de2ea7fb9355d84ce2d3", 21);
        let proof = vector[x"0c71ceb0baa8d5e92d7176e0ef42f4795659615348d7278f22fbeb165760f381", x"3c34759adcbac4f94de7f6613c0a5d04d9e2db847091d60fee915d2af5f9cfea"];
        assert!(outcome_tree::proof(&leaves, 1) == proof, 31);
        assert!(outcome_tree::verify(x"b9bbb4dcbf53339bc0b05d8cf210214c5a03185a4c09de2ea7fb9355d84ce2d3", 1, 3, &proof, root), 41);
        assert!(*vector::borrow(&leaves, 2) == x"3c34759adcbac4f94de7f6613c0a5d04d9e2db847091d60fee915d2af5f9cfea", 12);
        assert!(outcome_tree::leaf_hash(x"5fe9dc5a28229c015cd41e053827e6c4ddabea2b76981e38281aef2192088349", x"9b773ca33f5e3f4b7c6c2c08b4ea88104bb739143dbf4c34d2c5488ade7a0caf") == x"3c34759adcbac4f94de7f6613c0a5d04d9e2db847091d60fee915d2af5f9cfea", 22);
        let proof = vector[x"1b658344cce13056f207fb04a75f0165aca89f5b5b3c0b2c9000d8ee8e33d739"];
        assert!(outcome_tree::proof(&leaves, 2) == proof, 32);
        assert!(outcome_tree::verify(x"3c34759adcbac4f94de7f6613c0a5d04d9e2db847091d60fee915d2af5f9cfea", 2, 3, &proof, root), 42);
    }

    // ---------------------------------------------------------------- 5_leaves

    /// Unsorted input of case 5_leaves: (lock ids, payouts hashes computed here).
    fun case_5_leaves_input(): (vector<vector<u8>>, vector<vector<u8>>) {
        let ids = vector::empty<vector<u8>>();
        let hashes = vector::empty<vector<u8>>();
        vector::push_back(&mut ids, x"f1820b5c0123ae536bfd759e2ca9484baefae2e63cac701c06aee85db59a5b62");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"b35e5276320578ff06514cadd30048a3a2c563cc"], &vector[1000u256]));
        vector::push_back(&mut ids, x"bc36fd8d1b1533535a10de78c26c25e1152f7f7945923f5453da7b77a0251cec");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"4f9138cfc86c6fbe9424c2c964e2e3740c7cb027", x"e5240eeccfde5ee9ad419a5b34f4978004a18704"], &vector[2000u256, 8u256]));
        vector::push_back(&mut ids, x"b7e9437a3b349fcd6bbdf556931d6f2e1fc923510efdd5e9d1e1b074ad5ecc14");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"5bb0a325b89b6b64b807725ef4d39ffada9f3b82"], &vector[3000u256]));
        vector::push_back(&mut ids, x"b00bed94dc6fb9958709324d012d24dbd86ec2301824b31f6c27937b2eaa71a6");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"a5a1b82638da1c4d31131e7403bbb996cb3ba090", x"562ca9f65c2544fa4b1bbe8bb17e4eab37736f45"], &vector[4000u256, 10u256]));
        vector::push_back(&mut ids, x"fcdba792b7ce280f23e522f0f0e4a1ed6b7b4e4230cfb38cfe889734bba08819");
        vector::push_back(&mut hashes, outcome_tree::payouts_hash(&vector[x"7519b08cf821cb9f64df706e31a30db876bcf3d6"], &vector[5000u256]));
        (ids, hashes)
    }

    #[test]
    fun case_5_leaves_matches_fixture() {
        let (ids, hashes) = case_5_leaves_input();
        let leaves = outcome_tree::sorted_leaves(ids, hashes);
        let root = x"bd068efc8b3a41864838fbb8121048a2835268adf0afd7bc985872dc59cc5c96";
        assert!(outcome_tree::root(&leaves) == root, 0);
        assert!(*vector::borrow(&leaves, 0) == x"613c09760d544508a001af3d0ca791df3726f79df087f19efb23b8432efb243f", 10);
        assert!(outcome_tree::leaf_hash(x"b00bed94dc6fb9958709324d012d24dbd86ec2301824b31f6c27937b2eaa71a6", x"2712eabdfb3b160d2ef9630314ea10e8bf757f885727de0e45c87253df66ba35") == x"613c09760d544508a001af3d0ca791df3726f79df087f19efb23b8432efb243f", 20);
        let proof = vector[x"edc9f0b11025b4c89511f16ee6a698371e035925c177ff5836faeeb837dd6bdb", x"ce012cf6ed4b77a920a1eb286a6492d05b3658c90b0d2a75de3bc8614ce5cb7c", x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761"];
        assert!(outcome_tree::proof(&leaves, 0) == proof, 30);
        assert!(outcome_tree::verify(x"613c09760d544508a001af3d0ca791df3726f79df087f19efb23b8432efb243f", 0, 5, &proof, root), 40);
        assert!(*vector::borrow(&leaves, 1) == x"edc9f0b11025b4c89511f16ee6a698371e035925c177ff5836faeeb837dd6bdb", 11);
        assert!(outcome_tree::leaf_hash(x"b7e9437a3b349fcd6bbdf556931d6f2e1fc923510efdd5e9d1e1b074ad5ecc14", x"96bf6c2a23082d8153c4a78ab5430b51ff89ef3543ff016d6856c9bac8e4ec37") == x"edc9f0b11025b4c89511f16ee6a698371e035925c177ff5836faeeb837dd6bdb", 21);
        let proof = vector[x"613c09760d544508a001af3d0ca791df3726f79df087f19efb23b8432efb243f", x"ce012cf6ed4b77a920a1eb286a6492d05b3658c90b0d2a75de3bc8614ce5cb7c", x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761"];
        assert!(outcome_tree::proof(&leaves, 1) == proof, 31);
        assert!(outcome_tree::verify(x"edc9f0b11025b4c89511f16ee6a698371e035925c177ff5836faeeb837dd6bdb", 1, 5, &proof, root), 41);
        assert!(*vector::borrow(&leaves, 2) == x"cfe6333f29b37e2610fb4d6db3c7ed1d6bfc80f7523d15b8da39b2fd99d886ef", 12);
        assert!(outcome_tree::leaf_hash(x"bc36fd8d1b1533535a10de78c26c25e1152f7f7945923f5453da7b77a0251cec", x"23638cb13e46e088301685d7c684b0c5c6cfc4816fefdb4195f6439d9cbc0579") == x"cfe6333f29b37e2610fb4d6db3c7ed1d6bfc80f7523d15b8da39b2fd99d886ef", 22);
        let proof = vector[x"3e6e96dbe8dfe914f28f75a8fc2fd74e2169d7cef8c9afbb2bda0d45eac0fec3", x"922c3f86d6859eb4f6462aec05fbb288a0d6f24b25ceff441016483d9343336e", x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761"];
        assert!(outcome_tree::proof(&leaves, 2) == proof, 32);
        assert!(outcome_tree::verify(x"cfe6333f29b37e2610fb4d6db3c7ed1d6bfc80f7523d15b8da39b2fd99d886ef", 2, 5, &proof, root), 42);
        assert!(*vector::borrow(&leaves, 3) == x"3e6e96dbe8dfe914f28f75a8fc2fd74e2169d7cef8c9afbb2bda0d45eac0fec3", 13);
        assert!(outcome_tree::leaf_hash(x"f1820b5c0123ae536bfd759e2ca9484baefae2e63cac701c06aee85db59a5b62", x"bb79f6157a28e9701e0e7d7d964e7cfd27927b91565d323a90686df97d4ea65a") == x"3e6e96dbe8dfe914f28f75a8fc2fd74e2169d7cef8c9afbb2bda0d45eac0fec3", 23);
        let proof = vector[x"cfe6333f29b37e2610fb4d6db3c7ed1d6bfc80f7523d15b8da39b2fd99d886ef", x"922c3f86d6859eb4f6462aec05fbb288a0d6f24b25ceff441016483d9343336e", x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761"];
        assert!(outcome_tree::proof(&leaves, 3) == proof, 33);
        assert!(outcome_tree::verify(x"3e6e96dbe8dfe914f28f75a8fc2fd74e2169d7cef8c9afbb2bda0d45eac0fec3", 3, 5, &proof, root), 43);
        assert!(*vector::borrow(&leaves, 4) == x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761", 14);
        assert!(outcome_tree::leaf_hash(x"fcdba792b7ce280f23e522f0f0e4a1ed6b7b4e4230cfb38cfe889734bba08819", x"a9cd0567a535cf1cb898512359593d535203441a30aa531005cc63b74c7e7311") == x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761", 24);
        let proof = vector[x"f9a51079aa295073da6fd1626cc08a2ac89c2cbbc79ea47b446ffe84d86582f6"];
        assert!(outcome_tree::proof(&leaves, 4) == proof, 34);
        assert!(outcome_tree::verify(x"7d075c315a0226e77f7fe3cd33059b06ee56a8474a079bf87036d922a8904761", 4, 5, &proof, root), 44);
    }

    // ---------------------------------------------------------------- rejections

    #[test]
    fun verify_rejects_wrong_index_and_tampered_sibling() {
        let (ids, hashes) = case_5_leaves_input();
        let leaves = outcome_tree::sorted_leaves(ids, hashes);
        let root = outcome_tree::root(&leaves);
        let leaf = *vector::borrow(&leaves, 2);
        let proof = outcome_tree::proof(&leaves, 2);
        assert!(outcome_tree::verify(leaf, 2, 5, &proof, root), 0);
        assert!(!outcome_tree::verify(leaf, 3, 5, &proof, root), 1);
        assert!(!outcome_tree::verify(leaf, 5, 5, &proof, root), 2);
        let bad = proof;
        *vector::borrow_mut(&mut bad, 0) = x"0000000000000000000000000000000000000000000000000000000000000000";
        assert!(!outcome_tree::verify(leaf, 2, 5, &bad, root), 3);
        vector::push_back(&mut proof, root);
        assert!(!outcome_tree::verify(leaf, 2, 5, &proof, root), 4);
    }

    #[test]
    #[expected_failure(abort_code = 4, location = atomica::outcome_tree)] // E_DUPLICATE_LOCK
    fun sorted_leaves_rejects_duplicate_lock() {
        let (ids, hashes) = case_3_leaves_input();
        let first = *vector::borrow(&ids, 0);
        vector::push_back(&mut ids, first);
        let h = *vector::borrow(&hashes, 0);
        vector::push_back(&mut hashes, h);
        outcome_tree::sorted_leaves(ids, hashes);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = atomica::outcome_tree)] // E_INVALID_RECIPIENT
    fun payouts_hash_rejects_short_recipient() {
        outcome_tree::payouts_hash(&vector[x"00"], &vector[1u256]);
    }

    #[test]
    #[expected_failure(abort_code = 5, location = atomica::outcome_tree)] // E_EMPTY_TREE
    fun root_rejects_empty_tree() {
        outcome_tree::root(&vector::empty<vector<u8>>());
    }

    // ---------------------------------------------------------------- AuctionOutcome BCS

    // The BCS of an AuctionOutcome built from the 201 golden vector fields is
    // that vector's `event_data` (test/fixtures/aptos/aptos_outcome_proof_vectors.json).
    #[test]
    fun auction_outcome_bcs_matches_golden_vector() {

        let bytes = auction::test_auction_outcome_bcs(
            42,
            x"cd03ca3d356a5894c35b06385111a08066f040b543f37bd2b45dea09c1327578",
            1767225600,
            x"647aeaa8bcfcba424bd00d92b76a634fbbe3ab120cb49c39a9113a8bb193ccbb",
            3,
        );
        assert!(bytes == x"2a0000000000000020cd03ca3d356a5894c35b06385111a08066f040b543f37bd2b45dea09c132757800b955690000000020647aeaa8bcfcba424bd00d92b76a634fbbe3ab120cb49c39a9113a8bb193ccbb0300000000000000", 0);
    }
}
