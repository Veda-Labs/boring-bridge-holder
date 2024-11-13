import { Program } from "@coral-xyz/anchor";
import anchor from "@coral-xyz/anchor";
import { Transaction, PublicKey } from "@solana/web3.js";
import bs58 from 'bs58';
import { execSync } from 'child_process';
import 'dotenv/config';

async function main() {
  try {
    // Configuration
    const bufferAccount = "EdPhrpChYNfUf3zoVeqFDBWjEMoVQYPwzY7oY52P3tNt";
    const programId = "AWzzXzsLQvddsYdphCV6CTcr5ALXtg8AAtZXTqbUcVBF";
    const multisigAuthority = "4Cj1s2ipALjJk9foQV4oDaZYCZwSsVkAShQL1KFVJG9b";
    const anchor = require("@coral-xyz/anchor");
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const latestBlockhash = await provider.connection.getLatestBlockhash();


    // Get the base64 transaction message from solana CLI
    const command = `solana program upgrade \
      --upgrade-authority ${multisigAuthority} \
      --sign-only \
      --dump-transaction-message \
      --blockhash ${latestBlockhash.blockhash} \
      --url https://eclipse.helius-rpc.com \
      ${bufferAccount} \
      ${programId}`;

    const output = execSync(command).toString();

    // Extract just the Transaction Message
    const txMessageMatch = output.match(/Transaction Message: (.*?)(?:\n|$)/);
    if (!txMessageMatch) {
      throw new Error("Could not find transaction message in CLI output");
    }

    console.log("Base64 Message:", txMessageMatch[1]);
    
    // Convert base64 to base58
    const base64Message = txMessageMatch[1];
    const messageBytes = Buffer.from(base64Message, 'base64');
    const base58Message = bs58.encode(messageBytes);
    
    console.log("\nUpgrade Transaction Details:");
    console.log("- Program ID:", programId);
    console.log("- Buffer Account:", bufferAccount);
    console.log("- Multisig Authority:", multisigAuthority);
    console.log("\nEncoded Transaction (base58):");
    console.log(base58Message);

    const decodedMessage = bs58.decode(base58Message);
    const versionedMessage = anchor.web3.VersionedMessage.deserialize(decodedMessage);
    
    console.log("\nDecoded Transaction Details:");
    console.log("Instructions:", versionedMessage.instructions.map(ix => ({
      programId: versionedMessage.staticAccountKeys[ix.programIdIndex].toBase58(),
      keys: ix.accounts.map((index) => {
        const accountMeta = versionedMessage.staticAccountKeys[index];
        return {
          pubkey: accountMeta.toBase58(),
          isSigner: versionedMessage.isAccountSigner(index),
          isWritable: versionedMessage.isAccountWritable(index)
        };
      }),
      data: bs58.encode(ix.data)
    })));

  } catch (error) {
    console.error("Failed to create upgrade transaction:", error);
    throw error;
  }
}

main();