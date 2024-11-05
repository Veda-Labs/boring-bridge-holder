import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { Program } from "@coral-xyz/anchor";

const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  // Get program ID and wallet from provider
  const program = anchor.workspace.YourProgramName;
  const wallet = provider.wallet;

  console.log("Initializing...");
  
  try {
    const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;
    // const owner = (program.provider as anchor.AnchorProvider).wallet;
    const owner = provider.wallet;
    const ATA_PROGRAM_ID = new anchor.web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const strategist = provider.wallet;
    
    // Bridging configuration.
    const destinationDomain = new anchor.BN(1);
    const evmAddressHex = "0x0463E60C7cE10e57911AB7bD1667eaa21de3e79b".slice(2); // remove '0x' prefix
    const evmRecipientBuffer = Buffer.concat([
        Buffer.alloc(12, 0), // 12 zero bytes
        Buffer.from(evmAddressHex, 'hex') // 20 bytes of address
    ]);
    const evmRecipient = Array.from(evmRecipientBuffer);
    const decimals = new anchor.BN(6);

    // Initialize configParams
    let configParams = {
      targetProgram: new anchor.web3.PublicKey("EqRSt9aUDMKYKhzd1DGMderr3KNp29VZH3x5P7LFTC8m"),
      noop: new anchor.web3.PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
      tokenPda: new anchor.web3.PublicKey("84KCVv2ERnDShUepu5kCufm2nB8vdHnCCuWx4qbDKSTB"),
      mailboxProgram: new anchor.web3.PublicKey("EitxJuv2iBjsg2d7jVy2LDC1e2zBrx4GB5Y9h2Ko3A9Y"),
      mailboxOutbox: new anchor.web3.PublicKey("FKKDGYumoKjQjVEejff6MD1FpKuBs6SdgAobVdJdE21B"),
      messageDispatchAuthority: new anchor.web3.PublicKey("HncL4avgJq8uH2cGaAUf5rF2SS2ZLKH3MEyq97WFNmv6"),
      igpProgram: new anchor.web3.PublicKey("Hs7KVBU67nBnWhDPZkEFwWqrFMUfJbmY2DQ4gmCZfaZp"),
      igpProgramData: new anchor.web3.PublicKey("FvGvXJf6bd2wx8FxzsYNzd2uHaPy7JTkmuKiVvSTt7jm"),
      igpAccount: new anchor.web3.PublicKey("3Wp4qKkgf4tjXz1soGyTSndCgBPLZFSrZkiDZ8Qp9EEj"),
      tokenSender: new anchor.web3.PublicKey("ABb3i11z7wKoGCfeRQNQbVYWjAm7jG7HzZnDLV4RKRbK"),
      token2022Program: new anchor.web3.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      mintAuth: new anchor.web3.PublicKey("AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE"),
      destinationDomain: destinationDomain,
      evmRecipient: evmRecipient,
      decimals: decimals,
    }
    // Find the boring account PDA
    const [boringAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("boring_state"),
        owner.publicKey.toBuffer()
      ],
      program.programId
    );

    const [boringAccountAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        boringAccount.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const tx = await program.methods
      .initialize(
        owner.publicKey,
        strategist.publicKey,
        configParams,
      )
    .accounts({
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([provider.wallet])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);
    
    console.log("Initialization completed successfully!");
  } catch (error) {
    console.error("Initialization failed:", error);
    throw error;
  }
};