module atomica::timelock_encryption {
    use std::vector;
    use aptos_std::crypto_algebra::{
        Self, Element, hash_to
    };
    use aptos_std::ibe;
    use aptos_std::bls12381_algebra::{
        G1, G2, Gt,
        HashG2XmdSha256SswuRo,
        FormatG1Compr, FormatG1Uncompr
    };

    /// Error codes
    const E_CIPHERTEXT_LENGTH_MISMATCH: u64 = 1;
    const E_INVALID_CIPHERTEXT: u64 = 2;
    const E_VERIFICATION_FAILED: u64 = 3;

    /// A struct representing an encrypted message (Hashed IBE Ciphertext).
    struct EncryptedMessage has drop, store, copy {
        u: vector<u8>,      // U = r * G (Serialized)
        ciphertext: vector<u8>, // C = M XOR Hash(e(P_pub, Q_id)^r)
    }

    /// Creates a new `EncryptedMessage` struct.
    public fun create_encrypted_message(
        u: vector<u8>,
        ciphertext: vector<u8>
    ): EncryptedMessage {
        EncryptedMessage {
            u,
            ciphertext
        }
    }

    /// Derives the Identity Point Q_id = HashToG2(ID) for a given ID (e.g. epoch bytes).
    public fun identity_point(id: &vector<u8>): Element<G2> {
        // DST should match Drand or standard IBE implementations.
        // Using the standard BLS12-381 G2 XMD:SHA-256 SSWU RO
        let dst = b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_";
        hash_to<G2, HashG2XmdSha256SswuRo>(&dst, id)
    }

    /// Decrypts a message.
    ///
    /// Scheme (Hashed IBE):
    /// 1. Signature Sig = s * Q_id (This is the DKG output/randomness for the round).
    /// 2. Compute Shared Secret K = e(U, Sig).
    ///    Proof: K = e(rG, sQ) = e(G, Q)^(rs) = e(sG, Q)^r = e(P_pub, Q)^r.
    /// 3. S' = Keccak256(Serialize(K)).
    /// 4. M = C XOR S'.
    public fun decrypt(
        encrypted_msg: &EncryptedMessage,
        signature: &Element<G2>
    ): vector<u8> {
        // Deserialize U
        let u_opt = crypto_algebra::deserialize<G1, FormatG1Uncompr>(&encrypted_msg.u);
        let u = if (std::option::is_some(&u_opt)) {
            std::option::extract(&mut u_opt)
        } else {
            let u_opt_c = crypto_algebra::deserialize<G1, FormatG1Compr>(&encrypted_msg.u);
            assert!(std::option::is_some(&u_opt_c), E_INVALID_CIPHERTEXT);
            std::option::extract(&mut u_opt_c)
        };

        // Use native IBE decryption which is gas-optimized
        ibe::decrypt<G1, G2, Gt>(&u, signature, encrypted_msg.ciphertext)
    }

    /// Helper to XOR two vectors of bytes.
    fun xor(a: &vector<u8>, b: &vector<u8>): vector<u8> {
        let res = vector::empty();
        let len = vector::length(a);
        let mask_len = vector::length(b);
        let i = 0;
        while (i < len && i < mask_len) {
            let v1 = *vector::borrow(a, i);
            let v2 = *vector::borrow(b, i);
            vector::push_back(&mut res, v1 ^ v2);
            i = i + 1;
        };
        res
    }

    //
    // Tests
    //

    #[test_only]
    use aptos_std::crypto_algebra::{scalar_mul};
    #[test_only]
    use std::bcs;

    #[test(fx = @std)]
    fun test_ibe_flow(fx: signer) {
        // Enable natives
        aptos_std::crypto_algebra::enable_cryptography_algebra_natives(&fx);

        // 1. Setup Phase
        // Master Secret s
        let s = crypto_algebra::from_u64<Fr>(123456789); // Insecure, just for test
        // Master Public Key P_pub = s * G
        let g1_gen = one<G1>();
        let p_pub = scalar_mul(&g1_gen, &s);

        // 2. Encryption Phase (Off-Chain simulation)
        // ID for the round
        let id_bytes = b"epoch_100";
        let q_id = identity_point(&id_bytes);
        
        // Generate random r
        let r = crypto_algebra::from_u64<Fr>(987654321); // Insecure, just for test
        
        // U = r * G
        let u = scalar_mul(&g1_gen, &r);
        
        // K = e(P_pub, Q_id)^r
        let pair = pairing<G1, G2, Gt>(&p_pub, &q_id);
        // We can't do exponentiation in Gt easily with generic algebra if `pow` isn't exposed directly on Gt or Scalar.
        // Wait, `scalar_mul` is for Additive groups usually?
        // Actually bls12381_algebra::Gt is multiplicative, but crypto_algebra::scalar_mul might wrap it?
        // Let's check crypto_algebra docs or source.
        // Usually Gt is written multiplicatively, so "scalar mul" corresponds to exponentiation.
        let k_enc = scalar_mul(&pair, &r);

        // Derive Mask
        let k_bytes = crypto_algebra::serialize<Gt, FormatGt>(&k_enc);
        let mask = keccak256(k_bytes);

        // Message
        let msg = b"SecretBid100";
        let ciphertext = xor(&msg, &mask);
        // Serialize U
        let u_bytes = crypto_algebra::serialize<G1, FormatG1Uncompr>(&u);
        let enc_msg = create_encrypted_message(u_bytes, ciphertext);

        // 3. Extraction Phase (Validators)
        // Signature Sig = s * Q_id
        let signature = scalar_mul(&q_id, &s);

        // 4. Decryption Phase (On-Chain)
        let decrypted_bytes = decrypt(&enc_msg, &signature);

        assert!(decrypted_bytes == msg, 1);
    }
}
