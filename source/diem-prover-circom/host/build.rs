use anyhow::Result;
use foundry_compilers::{Project, ProjectPathsConfig};
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../circuits/noop.circom");
    println!("cargo:rerun-if-changed=../solidity/src");
    println!("cargo:rerun-if-changed=../solidity/foundry.toml");

    // Check if circom is installed
    let circom_check = Command::new("circom")
        .arg("--version")
        .output();

    match circom_check {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            println!("cargo:warning=Found circom: {}", version.trim());
        }
        _ => {
            println!("cargo:warning=⚠️  circom not found. Install it with:");
            println!("cargo:warning=   git clone https://github.com/iden3/circom.git");
            println!("cargo:warning=   cd circom && cargo install --path circom");
            println!("cargo:warning=");
            println!("cargo:warning=   Then run: cd circuits && ./compile.sh");
        }
    }

    // Compile Solidity contracts
    if let Err(e) = compile_contracts() {
        println!("cargo:warning=Failed to compile Solidity contracts: {}", e);
    }
}

fn compile_contracts() -> Result<()> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("solidity");

    if !root.exists() {
        println!("cargo:warning=Solidity directory not found, skipping contract compilation");
        return Ok(());
    }

    // Configure paths for Foundry project
    let paths = ProjectPathsConfig::builder()
        .root(&root)
        .sources(root.join("src"))
        .artifacts(root.join("out"))
        .build()?;

    // Create and compile project
    let project = Project::builder()
        .paths(paths)
        .build()?;

    let output = project.compile()?;

    if output.has_compiler_errors() {
        anyhow::bail!("Solidity compilation failed:\n{}", output);
    }

    // Find the verifier contract
    let contract = output
        .find("Groth16Verifier")
        .ok_or_else(|| anyhow::anyhow!("Groth16Verifier contract not found in compilation output"))?;

    // Extract bytecode
    let bytecode = contract
        .bytecode
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No bytecode found for Groth16Verifier"))?;

    // Write bytecode to a file that tests can read
    let out_dir = PathBuf::from(std::env::var("OUT_DIR")?);
    let bytecode_hex = bytecode.object.to_string();
    std::fs::write(out_dir.join("verifier_bytecode.hex"), bytecode_hex)?;

    println!("cargo:warning=Successfully compiled Groth16Verifier contract");

    Ok(())
}
