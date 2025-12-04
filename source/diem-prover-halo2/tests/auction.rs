use demo_halo2_auction::auction::AuctionCircuit;
use halo2_proofs::{
    circuit::Value,
    dev::MockProver,
    halo2curves::bn256::Fr,
};

#[test]
fn test_auction_valid() {
    let k = 9; // 2^9 = 512 rows required for lookup table (0..255) + blinding
    let bids = vec![
        Value::known(Fr::from(10)),
        Value::known(Fr::from(20)),
        Value::known(Fr::from(15)),
    ];
    let reserve_price = Value::known(Fr::from(5));
    
    let reserve_price = Value::known(Fr::from(5));
    
    // Note: We are using fresh random parameters here (MockProver). 
    // For real proofs, we would use ParamsKZG::read to load a Powers of Tau file.
    let circuit = AuctionCircuit {
        bids,
        reserve_price,
        winner_idx: Some(1), // Bid 20 is the winner (index 1)
    };

    // Public inputs: [winner_bid] (placeholder for now, maybe just empty or reserve)
    // For now, let's assume no public inputs or just check basic validity
    let public_inputs = vec![vec![]];

    let prover = MockProver::run(k, &circuit, public_inputs).unwrap();
    prover.assert_satisfied();
}
