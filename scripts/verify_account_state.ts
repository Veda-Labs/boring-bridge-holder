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

console.log("Reading account state...");
  
async function main() {
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

    const programBoringAccount = await program.account.boringState.fetch(boringAccount);

    console.log("Owner: ", programBoringAccount.owner.toString());
    console.log("Strategist: ", programBoringAccount.strategist.toString());
    // Convert congfig hash to a hex string.
    console.log("Config Hash: ", Buffer.from(programBoringAccount.configHash).toString('hex'));


  } catch (error) {
    console.error("Version call failed:", error);
    throw error;
  }
}

main();