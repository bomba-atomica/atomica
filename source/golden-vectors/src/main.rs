
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use bcs;

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
    let eth_addr = hex::decode("1234567890123456789012345678901234567890").unwrap();
    let domain = "example.com".as_bytes().to_vec();
    let pk = SIWEAbstractPublicKey {
        ethereum_address: eth_addr.clone(),
        domain: domain.clone(),
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

    // Write to file
    let json = serde_json::to_string_pretty(&vectors).unwrap();
    let mut file = File::create("../atomica-web/tests/fixtures/golden_vectors.json").unwrap();
    file.write_all(json.as_bytes()).unwrap();

    println!("Golden vectors generated!");
}
