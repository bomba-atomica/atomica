import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const APTOS_BIN_PATH = "/Users/lucas/code/rust/atomica/source/target/debug/aptos";

export interface DebugState {
    ethAddress: string;
    ethAddressBytes: number[];
    digest: string;
    digestBytes: number[];
    scheme: string;
    domain: string;
    issuedAt: string;
    siweMessage: string;
    siweMessageLength: number;
    siweMessageBytes: number[];
    signature: string;
    signatureBytes: number[];
    chain_id: number;
    entryFunction: string;
    origin: string;
    networkName: string;
}

export class DebugUtils {
    static DEBUG_DIR = path.resolve(__dirname, '../../debug-repro');

    static generateReproPackage(debugState: DebugState) {
        if (fs.existsSync(this.DEBUG_DIR)) {
            fs.rmSync(this.DEBUG_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(path.join(this.DEBUG_DIR, 'sources'), { recursive: true });

        this.writeMoveToml();
        this.writeMoveModule(debugState);

        console.log(`[DebugUtils] Generated reproduction package at ${this.DEBUG_DIR}`);
    }

    static runMoveTest() {
        console.log(`[DebugUtils] Running 'aptos move test' in ${this.DEBUG_DIR}...`);
        const result = spawnSync(APTOS_BIN_PATH, ['move', 'test'], {
            cwd: this.DEBUG_DIR,
            stdio: 'pipe',
            encoding: 'utf-8'
        });

        if (result.status !== 0) {
            console.error(`[DebugUtils] Move test failed with code ${result.status}`);
            if (result.error) console.error(`[DebugUtils] Spawn Error: ${result.error.message}`);
            if (result.signal) console.error(`[DebugUtils] Signal: ${result.signal}`);
            console.error(`[DebugUtils] STDERR:\n${result.stderr}`);
            console.log(`[DebugUtils] STDOUT:\n${result.stdout}`);
        } else {
            console.log(`[DebugUtils] Move test completed.`);
            console.log(`[DebugUtils] STDOUT:\n${result.stdout}`);
        }
        return result;
    }

    private static writeMoveToml() {
        const tomlContent = `[package]
name = "DebugSignatureRepro"
version = "0.0.0"

[dependencies]
AptosFramework = { local = "../../zapatos/aptos-move/framework/aptos-framework" }
AptosStdlib = { local = "../../zapatos/aptos-move/framework/aptos-stdlib" }
MoveStdlib = { local = "../../zapatos/aptos-move/framework/move-stdlib" }
`;
        fs.writeFileSync(path.join(this.DEBUG_DIR, 'Move.toml'), tomlContent);
    }

    private static writeMoveModule(state: DebugState) {
        // Convert signature string to failing vector literal if needed, but signatureBytes is cleaner
        const sigHex = state.signature.startsWith('0x') ? state.signature.substring(2) : state.signature;

        const moveContent = `module 0x1::debug_repro {
    use std::debug;
    use std::string::{Self, String, utf8};
    use std::string_utils;
    use std::vector;
    use std::chain_id;
    use aptos_std::secp256k1;
    use aptos_std::aptos_hash;
    use aptos_framework::base16;

    const EADDR_MISMATCH: u64 = 4;
    const EINVALID_SIGNATURE: u64 = 1;

    fun network_name(): vector<u8> {
        let chain_id = chain_id::get();
        if (chain_id == 1) { b"mainnet" } else if (chain_id == 2) { b"testnet" } else { b"local" }
    }

    fun construct_message(
        ethereum_address: &vector<u8>,
        domain: &vector<u8>,
        entry_function_name: &vector<u8>,
        digest_utf8: &vector<u8>,
        issued_at: &vector<u8>,
        scheme: &vector<u8>,
    ): vector<u8> {
        let message = &mut vector[];
        message.append(*domain);
        message.append(b" wants you to sign in with your Ethereum account:\\n");
        message.append(*ethereum_address);
        message.append(b"\\n\\nPlease confirm you explicitly initiated this request from ");
        message.append(*domain);
        message.append(b".");
        message.append(b" You are approving to execute transaction ");
        message.append(*entry_function_name);
        message.append(b" on Aptos blockchain");
        let network_name = network_name();
        message.append(b" (");
        message.append(network_name);
        message.append(b")");
        message.append(b".");
        message.append(b"\\n\\nURI: ");
        message.append(*scheme);
        message.append(b"://");
        message.append(*domain);
        message.append(b"\\nVersion: 1");
        message.append(b"\\nChain ID: ");
        message.append(*string_utils::to_string(&chain_id::get()).bytes());
        message.append(b"\\nNonce: ");
        message.append(*digest_utf8);
        message.append(b"\\nIssued At: ");
        message.append(*issued_at);

        let msg_len = message.length();
        let prefix = b"\\x19Ethereum Signed Message:\\n";
        let msg_len_string = string_utils::to_string(&msg_len);
        let msg_len_bytes = msg_len_string.bytes();

        let full_message = &mut vector[];
        full_message.append(prefix);
        full_message.append(*msg_len_bytes);
        full_message.append(*message);
        *full_message
    }

    fun recover_public_key(signature_bytes: &vector<u8>, message: &vector<u8>): vector<u8> {
        let rs = vector::slice(signature_bytes, 0, 64);
        let v = *vector::borrow(signature_bytes, 64);
        if (v < 27) { v = v + 27; };
        let signature = secp256k1::ecdsa_signature_from_bytes(rs);
        let maybe_recovered = secp256k1::ecdsa_recover(*message, v - 27, &signature);
        if (std::option::is_none(&maybe_recovered)) {
            debug::print(&utf8(b"Signature recovery failed"));
            abort EINVALID_SIGNATURE
        };
        let pubkey = std::option::borrow(&maybe_recovered);
        let pubkey_bytes = secp256k1::ecdsa_raw_public_key_to_bytes(pubkey);
        let full_pubkey = &mut vector[];
        vector::push_back(full_pubkey, 4u8);
        full_pubkey.append(pubkey_bytes);
        *full_pubkey
    }

    fun base16_decode(str: &vector<u8>): vector<u8> {
        let len = vector::length(str);
        if (len % 2 != 0) {
            // odd length, invalid
            return vector::empty()
        };
        let res = vector::empty();
        let i = 0;
        while (i < len) {
            let h = *vector::borrow(str, i);
            let l = *vector::borrow(str, i + 1);
            let val = if (h >= 48 && h <= 57) { h - 48 } else if (h >= 97 && h <= 102) { h - 87 } else { 0 }; // 0-9, a-f
            let val2 = if (l >= 48 && l <= 57) { l - 48 } else if (l >= 97 && l <= 102) { l - 87 } else { 0 };
            vector::push_back(&mut res, (val << 4) | val2);
            i = i + 2;
        };
        res
    }

    public entry fun verify(
        ethereum_address: String,
        domain: String,
        entry_function_name: String,
        digest_hex: String, 
        issued_at: String,
        scheme: String,
        signature: vector<u8>
    ) {
        let ethereum_address_bytes = string::bytes(&ethereum_address);
        let domain_bytes = string::bytes(&domain);
        let entry_function_name_bytes = string::bytes(&entry_function_name);
        let digest_bytes = string::bytes(&digest_hex);
        let issued_at_bytes = string::bytes(&issued_at);
        let scheme_bytes = string::bytes(&scheme);

        debug::print(&utf8(b"=== Debug Reproduction ==="));
        debug::print(&utf8(b"Address:"));
        debug::print(&ethereum_address);
        debug::print(&utf8(b"Digest:"));
        debug::print(&digest_hex);

        let message = construct_message(
            ethereum_address_bytes, 
            domain_bytes, 
            entry_function_name_bytes, 
            digest_bytes, 
            issued_at_bytes, 
            scheme_bytes
        );

        debug::print(&utf8(b"=== Message constructed len:"));
        debug::print(&vector::length(&message));

        let hashed_message = aptos_hash::keccak256(message);
        debug::print(&utf8(b"=== Keccak256 Hash:"));
        debug::print(&hashed_message);

        let public_key_bytes = recover_public_key(&signature, &hashed_message);
        let public_key_without_prefix = vector::slice(&public_key_bytes, 1, vector::length(&public_key_bytes));
        let kexHash = aptos_hash::keccak256(public_key_without_prefix);
        let recovered_addr = vector::slice(&kexHash, 12, 32);

        let ethereum_address_without_prefix = vector::slice(ethereum_address_bytes, 2, vector::length(ethereum_address_bytes));
        let account_address_vec = base16_decode(&ethereum_address_without_prefix);

        debug::print(&utf8(b"=== Recovered Addr vs Expected ==="));
        debug::print(&recovered_addr);
        debug::print(&account_address_vec);

        assert!(recovered_addr == account_address_vec, EADDR_MISMATCH);
        debug::print(&utf8(b"SUCCESS: Verified!"));
    }

    #[test]
    fun test_reproduce_failure() {
        chain_id::initialize_for_test(&std::unit_test::create_signers_for_testing(1)[0], ${state.chain_id});

        let ethereum_address = utf8(b"${state.ethAddress}");
        let domain = utf8(b"${state.domain}");
        let entry_function_name = utf8(b"${state.entryFunction}");
        let digest_hex = utf8(b"${state.digest}");
        let issued_at = utf8(b"${state.issuedAt}");
        let scheme = utf8(b"${state.scheme}");
        let signature = x"${sigHex}";

        verify(
            ethereum_address,
            domain,
            entry_function_name,
            digest_hex,
            issued_at,
            scheme,
            signature
        );
    }
}
`;
        fs.writeFileSync(path.join(this.DEBUG_DIR, 'sources', 'debug_repro.move'), moveContent);
    }
}
