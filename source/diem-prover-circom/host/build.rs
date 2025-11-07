use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../circuits/noop.circom");

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
}
