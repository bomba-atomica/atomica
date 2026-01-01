# Ethereum Development Standards and Coding Guidelines

## Language
All Ethereum smart contracts must be written in Solidity. Vyper is not permitted.

## Development Loop
Use Halmos to catch 95% of bugs instantly while coding. Integrate Halmos into your development workflow to validate contracts in real-time during development.

## Final Audit
Use Kontrol (KEVM) to mathematically prove key invariants cannot be violated. For example, prove that "User balance can never decrease unless they call withdraw" holds even in edge cases that Halmos might simplify.