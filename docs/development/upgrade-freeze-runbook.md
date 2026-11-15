# Upgrade and freeze runbook

The LockBox UUPS proxy and the Atomica Move package remain upgradeable while
the system is stabilizing. The EVM `LOCKBOX_ADMIN` and the Aptos `@atomica`
package publisher are trusted until each chain is frozen. The LockBox admin
can only authorize implementation upgrades and call `freeze()`; it cannot
move, pause, or block user funds.

## Before the freeze

1. Record the current LockBox proxy address, implementation address, Move
   package address, and both chain IDs in the release record.
2. Review and test the proposed LockBox implementation and Move package.
3. Deploy the LockBox implementation, then call `upgradeToAndCall` on the
   proxy from `LOCKBOX_ADMIN`. Preserve the ERC-7201 LockBox configuration and
   sequential slots 0–5; Aptos proves the `commitments` mapping at slot 0.
4. Publish the Move package with the compatible upgrade policy while upgrades
   are still required:

   ```sh
   aptos move publish \
     --package-dir source/atomica-move-contracts \
     --named-addresses "atomica=$ATOMICA_ADDRESS" \
     --private-key "$ATOMICA_PRIVATE_KEY" \
     --included-artifacts none \
     --assume-yes
   ```

5. Verify both chains with `bun source/atomica-demo/scripts/check-freeze.ts`.
   Both results should be `false` until their freeze is executed.

## Freeze both chains

After the owner declares the system stable, use the authorized keys for the
one-way freeze. Coordinate the two transactions and retain their transaction
hashes in the release record.

Freeze LockBox from the admin account:

```sh
cast send "$LOCKBOX_PROXY_ADDRESS" 'freeze()' \
  --rpc-url "$ETH_RPC_URL" \
  --private-key "$LOCKBOX_ADMIN_PRIVATE_KEY"
```

The Move freeze is an immutable republish from the `@atomica` account. In the
reviewed release copy of `Move.toml`, change the package's
`upgrade_policy = "compatible"` to `upgrade_policy = "immutable"`. Build that
exact package, then publish it from `@atomica`:

```sh
aptos move publish \
  --package-dir source/atomica-move-contracts \
  --named-addresses "atomica=$ATOMICA_ADDRESS" \
  --private-key "$ATOMICA_PRIVATE_KEY" \
  --included-artifacts none \
  --assume-yes
```

An immutable Move package cannot be upgraded again. A frozen LockBox proxy
rejects every `upgradeToAndCall`, and a second `freeze()` call reverts.

## Verify

Run the checker with both endpoints and addresses set:

```sh
APTOS_URL="$APTOS_URL" \
ETH_RPC_URL="$ETH_RPC_URL" \
ATOMICA_ADDRESS="$ATOMICA_ADDRESS" \
LOCKBOX_PROXY_ADDRESS="$LOCKBOX_PROXY_ADDRESS" \
bun source/atomica-demo/scripts/check-freeze.ts --require-frozen
```

The command prints the Move package and EVM LockBox freeze status and exits
nonzero unless both are frozen. Record the output and the two transaction
hashes with the release artifacts.
