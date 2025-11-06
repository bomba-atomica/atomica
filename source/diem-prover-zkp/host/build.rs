//! Build script to compile the guest program to RISC-V

fn main() {
    // Tell cargo to rerun this build script if the guest code changes
    println!("cargo:rerun-if-changed=../guest/src");
    println!("cargo:rerun-if-changed=../guest/Cargo.toml");

    // Build the guest program using sp1-helper
    sp1_helper::build_program("../guest");
}
