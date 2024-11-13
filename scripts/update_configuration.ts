import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program, web3 } from "@coral-xyz/anchor";
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const anchor = require("@coral-xyz/anchor");
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

async function main() {
  console.log("Updating configuration...");
  
  try {
    const creator = provider.wallet;
    
    // Find the boring account PDA
    const [boringAccount] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("boring_state"),
        creator.publicKey.toBuffer()
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

  console.log("BoringAccount:", boringAccount.toString());
  const boringAccountHex = Buffer.from(boringAccount.toBytes()).toString('hex');
  console.log("BoringAccountHex:", boringAccountHex);

  

    const tx = await program.methods
      .updateConfiguration(newConfig)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: provider.wallet.publicKey,
      })
      .rpc();

    const confirmation = await provider.connection.confirmTransaction(tx);
    
    if (confirmation.value.err) {
      console.error("Configuration update failed:", confirmation.value.err);
    } else {
      console.log("Configuration update successful:", tx);
    }

  } catch (error) {
    console.error("Configuration update failed:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});