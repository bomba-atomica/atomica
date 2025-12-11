module atomica::eth_auth {
    use std::vector;
    use aptos_std::secp256k1;
    use aptos_std::aptos_hash;

    /// Error codes
    const E_INVALID_SIGNATURE: u64 = 1;
    const E_INVALID_ADDRESS: u64 = 2;

    /// Verify an Ethereum signature.
    /// `msg`: The message that was signed (pre-hashing if needed, but normally we expect the digest).
    ///        Actually, usually we pass the 32-byte hash. Let's assume input is the 32-byte digest.
    /// `sig`: The 65-byte signature (r, s, v).
    /// `eth_address`: The 20-byte expected Ethereum address.
    public fun verify_eth_sig(msg_digest: vector<u8>, sig: vector<u8>, eth_address: vector<u8>) {
        assert!(vector::length(&sig) == 65, E_INVALID_SIGNATURE);
        assert!(vector::length(&eth_address) == 20, E_INVALID_ADDRESS);
        assert!(vector::length(&msg_digest) == 32, E_INVALID_SIGNATURE);

        // Extract recovery id (v). In Ethereum, v is usually 27 or 28, or 0/1.
        // secp256k1::ecdsa_recover expects 0 or 1.
        let v = *vector::borrow(&sig, 64);
        if (v >= 27) {
            v = v - 27;
        };
        assert!(v == 0 || v == 1, E_INVALID_SIGNATURE);

        // Extract signature (r, s) - first 64 bytes.
        let signature_body = vector::empty<u8>();
        let i = 0;
        while (i < 64) {
            vector::push_back(&mut signature_body, *vector::borrow(&sig, i));
            i = i + 1;
        };

        // Recover public key
        let pk_opt = secp256k1::ecdsa_recover(msg_digest, v, &signature_body);
        assert!(std::option::is_some(&pk_opt), E_INVALID_SIGNATURE);
        let pk = std::option::extract(&mut pk_opt);

        // Derive Ethereum address: Keccak256(pk) -> last 20 bytes
        // Note: The recovered public key from `ecdsa_recover` is 64 bytes (uncompressed, without prefix).
        // Ethereum addresses are derived from the 64-byte uncompressed public key.
        
        let pk_hash = aptos_hash::keccak256(pk);
        
        // Take last 20 bytes
        let recovered_address = vector::empty<u8>();
        let j = 12; // 32 - 20 = 12
        while (j < 32) {
            vector::push_back(&mut recovered_address, *vector::borrow(&pk_hash, j));
            j = j + 1;
        };

        assert!(recovered_address == eth_address, E_INVALID_ADDRESS);
    }
}
