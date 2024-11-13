import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import 'dotenv/config';

const anchor = require("@coral-xyz/anchor");
const provider = anchor.AnchorProvider.env();
// Configure client to use the provider.
anchor.setProvider(provider);

// Get program ID and wallet from provider
const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

console.log("Transferring ownership...");
  
try {
  const creator = new anchor.web3.PublicKey("DuheUFDBEGh1xKKvCvcTPQwA8eR3oo58kzVpB54TW5TP");
  const oldOwner = provider.wallet;
  const newOwner = new anchor.web3.PublicKey("4Cj1s2ipALjJk9foQV4oDaZYCZwSsVkAShQL1KFVJG9b");

  // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.toBuffer()
    ],
    program.programId
  );

  console.log("Boring Account:", boringAccount.toString());
  console.log("Old Owner:", oldOwner.publicKey.toString());
  console.log("New Owner:", newOwner.toString());

  // Transfer ownership
  program.methods
    .transferOwnership(
        newOwner,
    )
  .accounts({
    // @ts-ignore
    boringAccount: boringAccount,
    signer: oldOwner.publicKey,
  })
  .signers([])
  .rpc().then(tx => anchor.AnchorProvider.env().connection.confirmTransaction(tx).then(result => {
    if (result.value.err) {
      console.error("Transfer ownership failed:", result.value.err);
    } else {
      console.log("Transfer ownership successful: ", tx);
    }
  }));
  
} catch (error) {
  console.error("Transfer ownership failed:", error);
  throw error;
  }