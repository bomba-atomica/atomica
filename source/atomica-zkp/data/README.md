# Trusted Setup: Hermez Powers of Tau

This directory contains the `hermez-raw-9` file, a trusted setup parameter file derived from the Hermez Powers of Tau ceremony.

## Origin

The `hermez-raw-9` file is a product of the **Hermez Powers of Tau** ceremony, which itself builds upon the broader **Perpetual Powers of Tau** ceremony for the BN254 curve. This multi-party computation (MPC) ceremony was conducted to generate secure cryptographic parameters (the Structured Reference String or SRS) required for zk-SNARKs, specifically for the Polygon Hermez zk-rollup.

The file was downloaded from the official repository:
`https://trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com/hermez-raw-9`

## Usage

This file is used to initialize the proving and verifying keys for our Halo2 circuits. By loading these pre-computed parameters, we avoid the insecurity of generating parameters locally (which would require a trusted private key that must be destroyed) and instead rely on a widely accepted public setup.

## Trust and Security

The security of this setup relies on the "1-of-N" trust model. This means that as long as **at least one** participant in the ceremony acted honestly and destroyed their secret "toxic waste" (randomness), the resulting parameters are secure.

The Hermez ceremony involved numerous independent participants from the blockchain and cryptography community. It also incorporated a random beacon from the **drand** network (round 100000) to further ensure unpredictability. Because of the large number of diverse contributors, it is practically impossible for all of them to have colluded, making the generated parameters highly trusted within the Ethereum and Zero-Knowledge ecosystems.

## Who Uses It?

These parameters are the standard for projects building on the **Polygon Hermez (Polygon zkEVM)** stack and are widely used by other projects in the Halo2/KZG ecosystem that require a secure, production-ready trusted setup for BN254 circuits.
