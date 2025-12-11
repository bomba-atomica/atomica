use aptos_forge::{ForgeConfig, LocalFactory, Node, Result};
use std::time::Duration;
use blstrs::{G1Projective, G2Projective, Scalar, Gt};
use group::{Group, Curve};
use ff::Field;
use rand::thread_rng;
// Use HashToCurve trait
use blstrs::hash_to_curve::{ExpandMsgXmd, HashToCurve};

#[tokio::test]
async fn test_auction_flow() -> Result<()> {
    use aptos_crypto::blstrs::{G2Projective, Scalar};
    use group::Group;
    use ff::Field;
    use rand::thread_rng;

    println!("Starting auction flow test...");

    // 1. Setup local network
    let node_config = NodeConfig::default(); // Or custom config
    let mut factory = LocalFactory::from_workspace()?;
    let mut swarm = factory.new_swarm(::aptos_forge::ChainID::default(), 1).await?;
    let info = swarm.chain_info();
    
    // 2. Compile/Deploy Move package
    // (We assume the package is compiled locally or we compile it here via CLI override or Factory)
    // For simplicity, we might just assume `aptos` CLI is available to publish?
    // Or use internal forge helpers to publish.
    
    // 3. Create KeyPair (Rust side simulation of Timelock Authority)
    let mut rng = thread_rng();
    let s = Scalar::random(&mut rng);
    let mpk = G2Projective::generator() * s;
    let mpk_bytes = bcs::to_bytes(&mpk).unwrap();

    println!("MPK Generated: {:?}", hex::encode(&mpk_bytes));

    // 4. Create Auction
    // call create_auction(dapp_signer, eth_amt, min_price, duration, mpk_bytes)
    
    // 5. Encrypt Bid
    // Identity = "test_auction" (mapped to interval/ID)
    let id_bytes = b"test_auction";
    // U = r * G2
    let r = Scalar::random(&mut rng);
    let u = G2Projective::generator() * r;
    let u_bytes = bcs::to_bytes(&u).unwrap();
    
    // Session Key K = e(H(ID), MPK)^r = e(H(ID)^r, MPK) = e(H(ID), MPK^r)
    // Wait, standard IBE Boneh-Franklin:
    // K = e(d_ID, U) = e(s*H(ID), r*P) = e(H(ID), P)^(rs)
    // Encryptor computes: e(H(ID), MPK)^r = e(H(ID), s*P)^r = e(H(ID), P)^(sr)
    // Matches!
    
    // We need H(ID) in G1.
    // aptos_crypto::blstrs::hash_to_curve::HashToCurve
    // use aptos_crypto::blstrs::G1Projective;
    // let h_id = G1Projective::hash_to_curve(id_bytes, b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_");
    
    // let pair = aptos_crypto::blstrs::pairing(&h_id, &mpk);
    // let k = pair * r; // GT exponentiation? No, pair is Gt. Gt is multiplicative group.
    // let k = pair.pow(r);?
    
    // 6. Reveal
    // Signer (Authority) computes d_ID = s * H(ID)
    // Publish d_ID to Timelock module.
    // Call reveal_bids.
    
    // 2. Compile/Deploy Move package
    let root = std::env::current_dir()?;
    let aptos_cli_path = root.join("../zapatos/target/debug/aptos");
    let package_path = root.join("../atomica-move-contracts");
    
    // We need to run a validator node suitable for the test. 
    // LocalFactory spawns nodes. We can use the first validator's API URL.
    let validator_info = swarm.validators().next().unwrap();
    let url = validator_info.rest_api_endpoint();
    let root_account = swarm.chain_info().root_account;
    let root_key = &root_account.key; // Verify field name access in forge
    
    // For simplicity in this V0 smoke test, we'll try to use the CLI to publish using the root account key
    // But root account key is Ed25519Private key object. getting hex might differ.
    // aptos-forge: root_account has `key` field which is `Ed25519PrivateKey`.
    let key_bytes = bcs::to_bytes(&root_key).unwrap();
    // Ed25519 private key is 32 bytes, but BCS might add length prefix? No.
    // However, we need hex string for API/CLI.
    let mut key_hex = hex::encode(&key_bytes);
    // Remove length prefix if any? Ed25519PrivateKey bcs is just bytes?
    // Check aptos-types definitions. usually just bytes.

    // 3. Create Auction ...
    // ...
    
    // 3. Publish Package
    // Compile and publish
    println!("Publishing package...");
    // Assuming we can use CLI with the root key to publish
    // Note: V0 smoke test uses CLI.
    // aptos move publish --named-addresses atomica=default --package-dir ... --private-key ... --url ...
    
    let status = std::process::Command::new(&aptos_cli_path)
        .arg("move")
        .arg("publish")
        .arg("--package-dir")
        .arg(&package_path)
        .arg("--named-addresses")
        .arg("atomica=default") // Publish to the signer (root)
        .arg("--url")
        .arg(url.to_string())
        .arg("--private-key")
        .arg(&key_hex)
        .arg("--assume-yes")
        .status()?;
        
    if !status.success() {
        return Err(anyhow::anyhow!("Failed to publish package"));
    }

    // 4. Create Auction
    println!("Creating auction...");
    // create_auction(seller, amount_eth, min_price, duration, mpk_bytes)
    let mpk_hex = hex::encode(&mpk_bytes);
    let status = std::process::Command::new(&aptos_cli_path)
        .arg("move")
        .arg("run")
        .arg("--function-id")
        .arg("default::auction::create_auction")
        .arg("--args")
        .arg(format!("u64:{}", 100)) // amount_eth
        .arg(format!("u64:{}", 10))  // min_price
        .arg(format!("u64:{}", 3600)) // duration
        .arg(format!("hex:{}", mpk_hex)) // mpk_bytes
        .arg("--url")
        .arg(url.to_string())
        .arg("--private-key")
        .arg(&key_hex) // Seller is root for simplicity
        .arg("--assume-yes")
        .status()?;

    if !status.success() {
        return Err(anyhow::anyhow!("Failed to create auction"));
    }

    // 5. Encrypt Bid
    use aptos_crypto::blstrs::{G1Projective, Gt, pairing};
    use aptos_crypto::blstrs::hash_to_curve::{ExpandMsgXmd, HashToCurve};
    use ark_serialize::CanonicalSerialize;
    use tiny_keccak::{Hasher, Keccak};

    // Identity = "test_auction" (mapped to interval/ID)
    let bid_amount_usd = 20;
    
    // H(ID)
    let dst = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
    let h_id = <G1Projective as HashToCurve<ExpandMsgXmd<sha2::Sha256>>>::hash_to_curve(id_bytes, dst);
    
    // U = r * G2 (Wait! u_bytes in submit_bid is G1??)
    // Check auction.move: submit_bid(..., u_bytes: vector<u8>, ...)
    // In auction.move:
    // let u_opt = crypto_algebra::deserialize<G1, FormatG1Uncompr>(&u_bytes);
    // So U is G1.
    // In IBE: U = r * P (where P is generator).
    // If U is G1, then P is G1 generator.
    // MPK = s * P. So MPK is G1.
    // Check auction.move create_auction: mpk_bytes is G1.
    // Check smoke test setup:
    // let mpk = G2Projective::generator() * s; -> WRONG. Should be G1.
    // I need to correct Setup and Encrypt.

    // CORRECT SETUP:
    // G1 is P_pub (MPK).
    // G2 is Q_id (Identity).
    // Start again.
    
    // Setup (Redo)
    let mpk = G1Projective::generator() * s;
    let mpk_bytes = mpk.to_uncompressed(); // Matches FormatG1Uncompr

    // Encrypt
    // U = r * G1
    let r = Scalar::random(&mut rng);
    let u = G1Projective::generator() * r;
    let u_bytes = u.to_uncompressed();

    // Q_id = HashToG2(ID) -> G2
    let dst_g2 = b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_";
    let q_id = <G2Projective as HashToCurve<ExpandMsgXmd<sha2::Sha256>>>::hash_to_curve(id_bytes, dst_g2);

    // K = e(MPK, Q_id)^r = e(s*G1, H(ID))^r = e(G1, H(ID))^(sr)
    // Decryption: e(U, Sig) = e(r*G1, s*H(ID)) = e(G1, H(ID))^(rs)
    // Matches!
    
    let pair_gt = pairing(&mpk, &q_id);
    let k_gt = pair_gt * r;

    // Serialize K
    let mut k_bytes = Vec::new();
    k_gt.serialize_uncompressed(&mut k_bytes).unwrap();

    // Hash K
    let mut sha3 = Keccak::v256();
    sha3.update(&k_bytes);
    let mut mask = [0u8; 32];
    sha3.finalize(&mut mask);

    // XOR V
    // Message M = USD Amount? No, "amount_usd" is Public argument to submit_bid.
    // Encrypted bid usually contains the bid amount (if sealed bid).
    // In auction.move: submit_bid(amount_usd, ...) -> this amount is LOCKED coins.
    // But the *actual bid* is inside the encrypted message?
    // Move contract:
    // reveal_bids: let bid_amount = u64_from_bytes(&decrypted_bytes);
    // So M is 8 bytes of bid_amount.
    // public arg `amount_usd` is the payment lock.
    // Typically bid >= amount_lock? Or bid == amount_lock?
    // In auction.move: if (coin::value(&bid.payment) >= bid_amount).
    // So M contains the TRUE bid.
    // Let's set M = 20 (u64).
    let m_val: u64 = 20;
    let m_bytes = m_val.to_le_bytes();
    // Pad to match ciphertext length? XOR works on bytes.
    // M len is 8. Mask is 32.
    // XOR first 8 bytes.
    let mut v_bytes = Vec::new();
    for i in 0..8 {
        v_bytes.push(m_bytes[i] ^ mask[i]);
    }
    let v_hex = hex::encode(&v_bytes);
    let u_hex = hex::encode(&u_bytes);

    let status = std::process::Command::new(&aptos_cli_path)
        .arg("move")
        .arg("run")
        .arg("--function-id")
        .arg("default::auction::submit_bid")
        .arg("--args")
        .arg(format!("address:{}", root_account.address().to_hex_literal())) // seller_addr
        .arg(format!("u64:{}", bid_amount_usd))
        .arg(format!("hex:{}", u_hex))
        .arg(format!("hex:{}", v_hex))
        .arg("--url")
        .arg(url.to_string())
        .arg("--private-key")
        .arg(&key_hex) // Bidder is also root for simplicity
        .arg("--assume-yes")
        .status()?;

    if !status.success() {
        return Err(anyhow::anyhow!("Failed to submit bid"));
    }

    // 6. Reveal Phase
    println!("Revealing bids...");
    
    let interval = 1u64;
    
    // Generate d_ID = s * H(ID)
    // We need standard H(ID).
    // Use aptos_crypto::blstrs capabilities.
    // Ensure we can import properly.
    // If blstrs is not directly available, we might fail compilation here unless we added it to Cargo.toml.
    // We added `group` and `ff`. We need `blstrs` or use `aptos_crypto::blstrs`.
    
    // Check if HashToCurve is available on G1Projective
    // use blstrs::hash_to_curve::HashToCurve; (trait)
    // use aptos_crypto::blstrs::G1Projective;
    
    // We might need to import the trait.
    // use aptos_crypto::blstrs::hash_to_curve::{ExpandMsgXmd, HashToCurve};
    // Let's assume standard DST.
    let dst = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
    let h_id = G1Projective::hash_to_curve(id_bytes, dst, &[]);
    let d_id = h_id * s;
    
    // Serialize uncompressed for Move (FormatG1Uncompr)
    let d_id_bytes = d_id.to_uncompressed();
    let d_id_hex = hex::encode(&d_id_bytes);

    // Publish Secret Share to Timelock module
    println!("Publishing secret share (d_ID)...");
    let status = std::process::Command::new(&aptos_cli_path)
        .arg("move")
        .arg("run")
        .arg("--function-id")
        .arg("0x1::timelock::publish_secret_share")
        .arg("--args")
        .arg(format!("u64:{}", interval))
        .arg(format!("hex:{}", d_id_hex))
        .arg("--url")
        .arg(url.to_string())
        .arg("--private-key")
        .arg(&key_hex)
        .arg("--assume-yes")
        .status()?;

    if !status.success() {
        return Err(anyhow::anyhow!("Failed to publish secret"));
    }
    
    // Reveal Bids
    println!("Revealing bids on-chain...");
    let status = std::process::Command::new(&aptos_cli_path)
        .arg("move")
        .arg("run")
        .arg("--function-id")
        .arg("default::auction::reveal_bids")
        .arg("--args")
        .arg(format!("address:{}", root_account.address().to_hex_literal()))
        .arg(format!("u64:{}", interval))
        .arg("--url")
        .arg(url.to_string())
        .arg("--private-key")
        .arg(&key_hex)
        .arg("--assume-yes")
        .status()?;

    if !status.success() {
        return Err(anyhow::anyhow!("Failed to reveal bids"));
    }

    Ok(())
}
