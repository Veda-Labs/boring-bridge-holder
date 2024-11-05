import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const anchor = require("@coral-xyz/anchor");
const provider = anchor.AnchorProvider.env();
// Configure client to use the provider.
anchor.setProvider(provider);

// Get program ID and wallet from provider
const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

console.log("Initializing...");
  
try {
  const creator = provider.wallet;
  const owner = provider.wallet;
  const strategist = provider.wallet;

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
  let configParams = {
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

  // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.publicKey.toBuffer()
    ],
    program.programId
  );
  program.methods
    .initialize(
      owner.publicKey,
      strategist.publicKey,
      configParams,
    )
  .accounts({
    // @ts-ignore
    boringAccount: boringAccount,
    signer: owner.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([])
  .rpc().then(tx => anchor.AnchorProvider.env().connection.confirmTransaction(tx).then(result => {
    if (result.value.err) {
      console.error("Initialization failed:", result.value.err);
    } else {
      console.log("Initialization successful: ", tx);
    }
  }));
} catch (error) {
  console.error("Initialization failed:", error);
  throw error;
  }