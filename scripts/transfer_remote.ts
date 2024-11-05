import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";
import { ComputeBudgetProgram } from "@solana/web3.js";
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

// To run this do this
// ts-node scripts/transfer_remote.ts

const anchor = require("@coral-xyz/anchor");
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Get program ID and wallet from provider
const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

console.log("Transferring remote...");

try {
  // The amount to transfer
  let amount = new anchor.BN(1000);

  const creator = provider.wallet;
  const owner = provider.wallet;
  const strategist = provider.wallet;

  // Read the config file
  const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));

  const ATA_PROGRAM_ID = new anchor.web3.PublicKey(config.ATA_PROGRAM_ID);

  // Process EVM recipient address
  const evmAddressHex = config.evmRecipientAddress.slice(2); // remove '0x' prefix
  const evmRecipientBuffer = Buffer.concat([
    Buffer.alloc(12, 0), // 12 zero bytes
    Buffer.from(evmAddressHex, 'hex') // 20 bytes of address
  ]);
  const evmRecipient = Array.from(evmRecipientBuffer);
  const destinationDomain = new anchor.BN(config.destinationDomain);
  const decimals = new anchor.BN(config.decimals);

  // Initialize configParams
  const configParams = {
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
    destinationDomain,
    evmRecipient,
    decimals,
  };

  // Find the boring account PDA
  const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("boring_state"),
      creator.publicKey.toBuffer()
    ],
    program.programId
  );

  const uniqueMessage = anchor.web3.Keypair.generate();

  const [messageStoragePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("hyperlane"),
      Buffer.from("-"),
      Buffer.from("dispatched_message"),
      Buffer.from("-"),
      uniqueMessage.publicKey.toBuffer()
    ],
    configParams.mailboxProgram
  );

  const [gasPaymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("hyperlane_igp"),
      Buffer.from("-"),
      Buffer.from("gas_payment"),
      Buffer.from("-"),
      uniqueMessage.publicKey.toBuffer()
    ],
    configParams.igpProgram
  );

  const [boringAccountAta] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      boringAccount.toBuffer(),
      configParams.token2022Program.toBuffer(),
      configParams.mintAuth.toBuffer(),
    ],
    ATA_PROGRAM_ID
  );

  const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      strategist.publicKey.toBuffer(),
      configParams.token2022Program.toBuffer(),
      configParams.mintAuth.toBuffer(),
    ],
    ATA_PROGRAM_ID
  );

  program.methods
    .transferRemote(
      destinationDomain,
      evmRecipient,
      decimals,
      amount,
    )
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
      targetProgram: configParams.targetProgram,
      systemProgram: anchor.web3.SystemProgram.programId,
      noop: configParams.noop,
      tokenPda: configParams.tokenPda,
      mailboxProgram: configParams.mailboxProgram,
      mailboxOutbox: configParams.mailboxOutbox,
      messageDispatchAuthority: configParams.messageDispatchAuthority,
      uniqueMessage: uniqueMessage.publicKey,
      messageStoragePda,
      igpProgram: configParams.igpProgram,
      igpProgramData: configParams.igpProgramData,
      gasPaymentPda,
      igpAccount: configParams.igpAccount,
      tokenSender: configParams.tokenSender,
      token2022: configParams.token2022Program,
      mintAuth: configParams.mintAuth,
      boringAccountAta,
      strategistAta,
    })
    .signers([uniqueMessage])
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000 // Increase compute units
      })
    ])
    .rpc()
    .then(tx => 
      anchor.AnchorProvider.env().connection.confirmTransaction(tx)
        .then(result => {
          if (result.value.err) {
            console.error("Transfer remote failed:", result.value.err);
          } else {
            console.log("Transfer remote successful: ", tx);
          }
        })
    );

} catch (error) {
  console.error("Transfer remote failed:", error);
  throw error;
}