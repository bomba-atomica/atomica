use ark_bn254::Fr;
use ark_circom::CircomConfig;
use std::path::PathBuf;
use std::fs;
use std::io::Write;

/// Test that loading a corrupted WASM file fails (panics in ark-circom)
#[tokio::test]
#[should_panic(expected = "called `Result::unwrap()` on an `Err` value")]
async fn test_corrupted_wasm_file() {
    println!("🚀 Testing Corrupted WASM File");

    // Create a temporary corrupted WASM file
    let temp_dir = std::env::temp_dir();
    let corrupted_wasm = temp_dir.join("corrupted_eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Write some garbage data to simulate a corrupted WASM file
    let mut file = fs::File::create(&corrupted_wasm).unwrap();
    file.write_all(b"This is not a valid WASM file! Just garbage data.").unwrap();
    drop(file);

    println!("📦 Testing with corrupted WASM file: {:?}", corrupted_wasm);

    // Try to load the corrupted circuit - this will panic
    let _result = CircomConfig::<Fr>::new(&corrupted_wasm, &r1cs_path);

    // Clean up (won't reach here due to panic)
    let _ = fs::remove_file(&corrupted_wasm);

    println!("✅ This should panic before reaching here");
}

/// Test that loading a non-existent WASM file fails (panics in ark-circom)
#[tokio::test]
#[should_panic(expected = "called `Result::unwrap()` on an `Err` value")]
async fn test_missing_wasm_file() {
    println!("🚀 Testing Missing WASM File");

    let missing_wasm = PathBuf::from("../circuits/build/nonexistent.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    println!("📦 Testing with non-existent WASM file: {:?}", missing_wasm);

    // Try to load a non-existent circuit file - this will panic
    let _result = CircomConfig::<Fr>::new(&missing_wasm, &r1cs_path);

    println!("✅ This should panic before reaching here");
}

/// Test that loading a valid WASM but corrupted R1CS file fails
#[tokio::test]
async fn test_corrupted_r1cs_file() {
    println!("🚀 Testing Corrupted R1CS File");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");

    // Create a temporary corrupted R1CS file
    let temp_dir = std::env::temp_dir();
    let corrupted_r1cs = temp_dir.join("corrupted_eq.r1cs");

    // Write some garbage data to simulate a corrupted R1CS file
    let mut file = fs::File::create(&corrupted_r1cs).unwrap();
    file.write_all(b"Not a valid R1CS file! Random bytes: \x00\x01\x02\x03").unwrap();
    drop(file);

    println!("📦 Testing with corrupted R1CS file: {:?}", corrupted_r1cs);

    // Try to load the circuit with corrupted R1CS
    let result = CircomConfig::<Fr>::new(&cfg_path, &corrupted_r1cs);

    // Clean up
    let _ = fs::remove_file(&corrupted_r1cs);

    assert!(result.is_err(), "Expected error when loading corrupted R1CS file, but got success");
    println!("✅ Correctly rejected corrupted R1CS file");
}

/// Test that loading a non-existent R1CS file fails gracefully
#[tokio::test]
async fn test_missing_r1cs_file() {
    println!("🚀 Testing Missing R1CS File");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let missing_r1cs = PathBuf::from("../circuits/build/nonexistent.r1cs");

    println!("📦 Testing with non-existent R1CS file: {:?}", missing_r1cs);

    // Try to load with non-existent R1CS file
    let result = CircomConfig::<Fr>::new(&cfg_path, &missing_r1cs);

    assert!(result.is_err(), "Expected error when loading non-existent R1CS file, but got success");
    println!("✅ Correctly rejected non-existent R1CS file");
}

/// Test that a WASM file with incorrect magic number fails (panics)
#[tokio::test]
#[should_panic(expected = "called `Result::unwrap()` on an `Err` value")]
async fn test_invalid_wasm_magic_number() {
    println!("🚀 Testing WASM with Invalid Magic Number");

    let temp_dir = std::env::temp_dir();
    let invalid_wasm = temp_dir.join("invalid_magic_eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // WASM files should start with magic number 0x00 0x61 0x73 0x6D (\\0asm)
    // Let's write something else
    let mut file = fs::File::create(&invalid_wasm).unwrap();
    file.write_all(b"\x00\x00\x00\x00FAKE_WASM_DATA").unwrap();
    drop(file);

    println!("📦 Testing WASM with invalid magic number: {:?}", invalid_wasm);

    let _result = CircomConfig::<Fr>::new(&invalid_wasm, &r1cs_path);

    // Clean up (won't reach here)
    let _ = fs::remove_file(&invalid_wasm);

    println!("✅ This should panic before reaching here");
}

/// Test with empty WASM file (panics)
#[tokio::test]
#[should_panic(expected = "called `Result::unwrap()` on an `Err` value")]
async fn test_empty_wasm_file() {
    println!("🚀 Testing Empty WASM File");

    let temp_dir = std::env::temp_dir();
    let empty_wasm = temp_dir.join("empty_eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Create an empty file
    fs::File::create(&empty_wasm).unwrap();

    println!("📦 Testing with empty WASM file: {:?}", empty_wasm);

    let _result = CircomConfig::<Fr>::new(&empty_wasm, &r1cs_path);

    // Clean up (won't reach here)
    let _ = fs::remove_file(&empty_wasm);

    println!("✅ This should panic before reaching here");
}

/// Test with empty R1CS file
#[tokio::test]
async fn test_empty_r1cs_file() {
    println!("🚀 Testing Empty R1CS File");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let temp_dir = std::env::temp_dir();
    let empty_r1cs = temp_dir.join("empty_eq.r1cs");

    // Create an empty file
    fs::File::create(&empty_r1cs).unwrap();

    println!("📦 Testing with empty R1CS file: {:?}", empty_r1cs);

    let result = CircomConfig::<Fr>::new(&cfg_path, &empty_r1cs);

    // Clean up
    let _ = fs::remove_file(&empty_r1cs);

    assert!(result.is_err(), "Expected error when loading empty R1CS file");
    println!("✅ Correctly rejected empty R1CS file");
}
