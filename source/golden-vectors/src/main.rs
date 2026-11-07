//! Generates the SIWE BCS golden vectors that the atomica-sdk tests read.
//!
//! Run with `cargo run` from any directory. It overwrites
//! `source/atomica-sdk/tests/fixtures/golden_vectors.json`. A clean tree after
//! the run proves the fixture matches this generator (CI checks this).

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Mirrors `SIWEAbstractPublicKey` in the Aptos framework module
/// `ethereum_derivable_account.move`. Both fields are utf8 bytes: the address
/// is the 0x-prefixed hex string, not the 20 raw address bytes.
#[derive(Serialize, Deserialize)]
struct SIWEAbstractPublicKey {
    ethereum_address: Vec<u8>,
    domain: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
enum SIWEAbstractSignature {
    MessageV1 {
        issued_at: String,
        signature: Vec<u8>,
    },
    MessageV2 {
        scheme: String,
        issued_at: String,
        signature: Vec<u8>,
    },
}

#[derive(Serialize)]
struct GoldenVectors {
    abstract_public_key: Vec<TestCase>,
    abstract_signature: Vec<TestCase>,
}

#[derive(Serialize)]
struct TestCase {
    name: String,
    input: serde_json::Value,
    bcs_hex: String,
}

fn main() {
    let mut vectors = GoldenVectors {
        abstract_public_key: vec![],
        abstract_signature: vec![],
    };

    // 1. SIWEAbstractPublicKey
    // Case A: Standard
    let pk = SIWEAbstractPublicKey {
        ethereum_address: b"0x1234567890123456789012345678901234567890".to_vec(),
        domain: b"example.com".to_vec(),
    };
    vectors.abstract_public_key.push(TestCase {
        name: "Standard Public Key".to_string(),
        input: serde_json::json!({
            "ethereum_address": "0x1234567890123456789012345678901234567890",
            "domain": "example.com"
        }),
        bcs_hex: hex::encode(bcs::to_bytes(&pk).unwrap()),
    });

    // 2. SIWEAbstractSignature
    // Case A: MessageV2 (Standard)
    let sig_bytes = vec![0xAA, 0xBB, 0xCC];
    let sig_v2 = SIWEAbstractSignature::MessageV2 {
        scheme: "https".to_string(),
        issued_at: "2023-01-01T00:00:00Z".to_string(),
        signature: sig_bytes.clone(),
    };
    vectors.abstract_signature.push(TestCase {
        name: "MessageV2 Standard".to_string(),
        input: serde_json::json!({
            "variant": "MessageV2",
            "scheme": "https",
            "issued_at": "2023-01-01T00:00:00Z",
            "signature": "0xaabbcc"
        }),
        bcs_hex: hex::encode(bcs::to_bytes(&sig_v2).unwrap()),
    });

    // Case B: MessageV1 (Legacy/Alternative)
    let sig_v1 = SIWEAbstractSignature::MessageV1 {
        issued_at: "2023-01-01T00:00:00Z".to_string(),
        signature: sig_bytes.clone(),
    };
    vectors.abstract_signature.push(TestCase {
        name: "MessageV1 Standard".to_string(),
        input: serde_json::json!({
            "variant": "MessageV1",
            "issued_at": "2023-01-01T00:00:00Z",
            "signature": "0xaabbcc"
        }),
        bcs_hex: hex::encode(bcs::to_bytes(&sig_v1).unwrap()),
    });

    let out = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../atomica-sdk/tests/fixtures/golden_vectors.json");
    let json = serde_json::to_string_pretty(&vectors).unwrap() + "\n";
    std::fs::write(&out, json).unwrap();

    println!("Golden vectors written to {}", out.display());
}
