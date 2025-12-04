use halo2_proofs::{
    halo2curves::bn256::{Bn256, Fr, G1Affine, G2Affine, Fq, Fq2},
    halo2curves::group::{Curve, PrimeField},
    poly::commitment::Params,
    poly::kzg::commitment::ParamsKZG,
};
use std::io::{Read, Write};
use std::fs::File;

#[test]
fn test_convert_ptau() {
    let ptau_path = "powersOfTau28_hez_final_10.ptau";
    
    if !std::path::Path::new(ptau_path).exists() {
        println!("Skipping ptau conversion: file not found");
        return;
    }

    let mut f = File::open(ptau_path).expect("failed to open ptau");
    let metadata = f.metadata().unwrap();
    println!("File size: {}", metadata.len());
    
    // Read Header
    let mut magic = [0u8; 4];
    f.read_exact(&mut magic).unwrap();
    assert_eq!(&magic, b"ptau");

    let mut version = [0u8; 4];
    f.read_exact(&mut version).unwrap();
    let version = u32::from_le_bytes(version);
    println!("Version: {}", version);

    let mut n8 = [0u8; 4];
    f.read_exact(&mut n8).unwrap();
    let n8 = u32::from_le_bytes(n8);
    println!("n8: {}", n8); 

    let mut prime = [0u8; 32];
    f.read_exact(&mut prime).unwrap();
    // Hypothesis: n=2^14 G1 points
    let k_g1 = 14;
    let n_g1 = 1 << k_g1;
    println!("Attempting to read {} G1 points...", n_g1);
    
    let mut g1_points = Vec::new();
    for _ in 0..n_g1 {
        let mut buf = [0u8; 64]; 
        if f.read_exact(&mut buf).is_err() {
            println!("Reached EOF at G1 point {}", g1_points.len());
            break;
        }
        
        let x_bytes: [u8; 32] = buf[0..32].try_into().unwrap();
        let y_bytes: [u8; 32] = buf[32..64].try_into().unwrap();
        
        let x = Fq::from_repr(x_bytes).unwrap();
        let y = Fq::from_repr(y_bytes).unwrap();
        
        // G1Affine::from_xy might return CtOption
        let p = G1Affine::from_xy(x, y).unwrap();
        g1_points.push(p);
    }
    println!("Read {} G1 points", g1_points.len());
    
    // Read G2 points
    println!("Reading G2 points...");
    let mut g2_points = Vec::new();
    // We need at least 2 points (g2, s_g2)
    for i in 0..2 {
        let mut buf = [0u8; 128];
        if f.read_exact(&mut buf).is_err() {
            panic!("Failed to read G2 point {}", i);
        }
        
        let x_bytes: [u8; 64] = buf[0..64].try_into().unwrap();
        let y_bytes: [u8; 64] = buf[64..128].try_into().unwrap();
        
        let x = Fq2::from_repr(x_bytes).unwrap();
        let y = Fq2::from_repr(y_bytes).unwrap();
        
        let p = G2Affine::from_xy(x, y).unwrap();
        g2_points.push(p);
    }
    println!("Read {} G2 points", g2_points.len());

    // Create ParamsKZG
    // We only need k=9 for our tests
    let k_out = 9;
    let n_out = 1 << k_out;
    
    if g1_points.len() < n_out {
        panic!("Not enough G1 points for k={}", k_out);
    }

    let params = ParamsKZG::<Bn256> {
        k: k_out,
        g: g1_points[0..n_out as usize].to_vec(),
        g2: g2_points[0],
        s_g2: g2_points[1],
    };

    let mut out_buf = Vec::new();
    params.write(&mut out_buf).expect("failed to write params");
    
    let srs_path = "ptau_converted.srs";
    std::fs::write(srs_path, out_buf).expect("failed to save srs");
    println!("Saved converted SRS to {}", srs_path);
}
