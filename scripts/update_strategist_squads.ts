import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import 'dotenv/config';
import bs58 from 'bs58';

async function main() {
  try {
    const anchor = require("@coral-xyz/anchor");
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;
    
    // This should be your multisig address
    const multisigAuthority = new anchor.web3.PublicKey("4Cj1s2ipALjJk9foQV4oDaZYCZwSsVkAShQL1KFVJG9b");
    
    const newStrategist = new anchor.web3.PublicKey("DuheUFDBEGh1xKKvCvcTPQwA8eR3oo58kzVpB54TW5TP");
    
  const creator = provider.wallet;

    // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.publicKey.toBuffer()
    ],
    program.programId
  );

    // Create the instruction
    const ix = await program.methods
      .updateStrategist(newStrategist)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: multisigAuthority,
      })
      .instruction();

    // Create new transaction
    const tx = new Transaction();
    
    // Add compute budget instruction first
    tx.add(
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      })
    );
    
    tx.add(ix);

    // Get latest blockhash
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = multisigAuthority;

    // Important: Convert to legacy transaction
    const serializedTransaction = tx.serializeMessage();

    const encoded = bs58.encode(serializedTransaction);
    
    console.log("\nTransaction Details:");
    console.log("- Instructions:", tx.instructions.length);
    console.log("- Fee Payer:", tx.feePayer.toBase58());
    console.log("- Recent Blockhash:", tx.recentBlockhash);
    console.log("- Serialized Size:", serializedTransaction.length, "bytes");
    
    require('fs').writeFileSync('encoded_transaction.txt', encoded);
    
    console.log("\nEncoded transaction has been written to encoded_transaction.txt");

  } catch (error) {
    console.error("Failed to create transaction:", error);
  }
}

main();