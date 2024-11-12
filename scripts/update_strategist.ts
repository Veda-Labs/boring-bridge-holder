import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import 'dotenv/config';
// multisig site https://backup.app.squads.so/config
const anchor = require("@coral-xyz/anchor");
const provider = anchor.AnchorProvider.env();
// Configure client to use the provider.
anchor.setProvider(provider);

// Get program ID and wallet from provider
const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

console.log("Updating strategist...");
  
try {
  const creator = provider.wallet;
  const owner = provider.wallet;
  const newStrategist = new anchor.web3.PublicKey("J2V6fTUnxem8WLwWiofAuptFwP3sJNeKcT8SRWDDrQ4z");
  
  // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.publicKey.toBuffer()
    ],
    program.programId
  );

  // Update strategist
  program.methods
    .updateStrategist(
        newStrategist,
    )
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc().then(tx => anchor.AnchorProvider.env().connection.confirmTransaction(tx).then(result => {
      if (result.value.err) {
        console.error("Update strategist failed:", result.value.err);
      } else {
        console.log("Update strategist successful: ", tx);
        console.log("Strategist updated to: ", newStrategist.toString());
      }
    }));
  
} catch (error) {
  console.error("Update strategist failed:", error);
  throw error;
}