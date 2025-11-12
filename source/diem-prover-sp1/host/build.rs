use sp1_helper::build_program_with_args;

fn main() {
    // Build the noop guest program
    build_program_with_args("../guest-noop", Default::default());
}
