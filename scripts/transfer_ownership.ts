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
  const creator = provider.wallet;
  const oldOwner = provider.wallet;
  const newOwner = provider.wallet;
  
  // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.publicKey.toBuffer()
    ],
    program.programId
  );

  // Transfer ownership
  program.methods
    .transferOwnership(
        newOwner.publicKey,
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