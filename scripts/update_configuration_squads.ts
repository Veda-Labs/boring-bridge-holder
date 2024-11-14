import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import 'dotenv/config';
import bs58 from 'bs58';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  try {
    const anchor = require("@coral-xyz/anchor");
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;
    const creator = new anchor.web3.PublicKey("DuheUFDBEGh1xKKvCvcTPQwA8eR3oo58kzVpB54TW5TP");
    
    // This should be your multisig address
    const multisigAuthority = new anchor.web3.PublicKey("4Cj1s2ipALjJk9foQV4oDaZYCZwSsVkAShQL1KFVJG9b");
    
    const newStrategist = new anchor.web3.PublicKey("J2V6fTUnxem8WLwWiofAuptFwP3sJNeKcT8SRWDDrQ4z");
    
    // Find the boring account PDA
    const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("boring_state"),
        creator.toBuffer()
      ],
      program.programId
    );

    // Read the config file
    const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
  
    // Process EVM recipient address
    const evmAddressHex = config.evmRecipientAddress.slice(2); // remove '0x' prefix
    const evmRecipientBuffer = Buffer.concat([
      Buffer.alloc(12, 0), // 12 zero bytes
      Buffer.from(evmAddressHex, 'hex') // 20 bytes of address
    ]);
    const evmRecipient = Array.from(evmRecipientBuffer);

    // Initialize configParams
    let newConfig = {
      targetProgram: new anchor.web3.PublicKey(config.targetProgram),
      noop: new anchor.web3.PublicKey(config.noop),
      tokenPda: new anchor.web3.PublicKey(config.tokenPda),
      mailboxProgram: new anchor.web3.PublicKey(config.mailboxProgram),
      mailboxOutbox: new anchor.web3.PublicKey(config.mailboxOutbox),
      messageDispatchAuthority: new anchor.web3.PublicKey(config.messageDispatchAuthority),
      igpProgram: new anchor.web3.PublicKey(config.igpProgram),
      igpProgramData: new anchor.web3.PublicKey(config.igpProgramData),
      igpAccount: new anchor.web3.PublicKey(config.igpAccount),
      tokenSender: new anchor.web3.PublicKey(config.tokenSender),
      token2022Program: new anchor.web3.PublicKey(config.token2022Program),
      mintAuth: new anchor.web3.PublicKey(config.mintAuth),
      destinationDomain: new anchor.BN(config.destinationDomain),
      evmRecipient: evmRecipient,
      decimals: new anchor.BN(config.decimals),
    }

    // Create the instruction
    const ix = await program.methods
      .updateConfiguration(newConfig)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: multisigAuthority,
      })
      .instruction();

    // Create new transaction
    const tx = new Transaction();
    
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
    console.log("- Fee Payer:", tx.feePayer?.toBase58() || "undefined");
    console.log("- Recent Blockhash:", tx.recentBlockhash);
    console.log("- Serialized Size:", serializedTransaction.length, "bytes");
    
    require('fs').writeFileSync('encoded_transaction.txt', encoded);
    
    console.log("\nEncoded transaction has been written to encoded_transaction.txt");

  } catch (error) {
    console.error("Failed to create transaction:", error);
  }
}

main();