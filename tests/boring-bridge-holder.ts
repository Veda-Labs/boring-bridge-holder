import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { expect } from "chai";
import { ComputeBudgetProgram } from "@solana/web3.js";

// TODO so the boringAccountAta is dependent on the provider.wallet.
// So I need to find some way to create the boringAccountAta using some wallet from this test,
// then I need to figure out how to send some tokens to it so that others can run the test suite.

// The signers array will automatically have the provider's wallet added to it.(which is the owner)
describe("boring-bridge-holder", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;
  // const owner = (program.provider as anchor.AnchorProvider).wallet;
  const owner = provider.wallet;
  const ATA_PROGRAM_ID = new anchor.web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const strategist = anchor.web3.Keypair.fromSecretKey(Uint8Array.from([
    // 64 bytes for a fixed private key
    174, 47, 154, 16, 202, 193, 206, 113, 199, 190, 53, 133, 169, 175, 31, 56, 
    222, 53, 138, 189, 224, 216, 117, 173, 10, 149, 53, 45, 73, 251, 237, 246, 
    15, 185, 186, 82, 177, 240, 148, 69, 241, 227, 167, 80, 141, 89, 240, 121,
    121, 35, 172, 247, 68, 251, 226, 218, 48, 63, 176, 109, 168, 89, 238, 135,
  ]));
  
  // Bridging configuration.
  const destinationDomain = new anchor.BN(1);
  const evmAddressHex = "0x0463E60C7cE10e57911AB7bD1667eaa21de3e79b".slice(2); // remove '0x' prefix
  const evmRecipient = Buffer.concat([
      Buffer.alloc(12, 0), // 12 zero bytes
      Buffer.from(evmAddressHex, 'hex') // 20 bytes of address
  ]);
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

  // token sender associated is wrong it would really be a a PDA using the holder account.

  it("Is initialized!", async () => {
    await anchor.AnchorProvider.env().connection.requestAirdrop(
      owner.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    const tx = await program.methods
    .initialize(
        // @ts-ignore
        owner.publicKey,
        strategist.publicKey,
        configParams,
      )
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the owner is set
    expect(holderAccount.owner.equals(owner.publicKey)).to.be.true;
    // Make sure the strategist is set
    expect(holderAccount.strategist.equals(strategist.publicKey)).to.be.true;
    // Verify the config hash is not all zeros
    const isAllZeros = holderAccount.configHash.every(byte => byte === 0);
    expect(isAllZeros).to.be.false;
  });

  it("Can transfer ownership", async () => {
    const newOwner = anchor.web3.Keypair.generate();

    const tx = await program.methods
      .transferOwnership(newOwner.publicKey)
    .accounts({
      // @ts-ignore
        boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the owner is set
    expect(holderAccount.owner.equals(newOwner.publicKey)).to.be.true;

    // Transfer ownership back to the original owner
    const tx2 = await program.methods
      .transferOwnership(owner.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: newOwner.publicKey,
    })
    .signers([newOwner])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx2);
  });

  it("Can update strategist", async () => {
    const newStrategist = anchor.web3.Keypair.generate();

    const tx = await program.methods
      .updateStrategist(newStrategist.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the strategist is set
    expect(holderAccount.strategist.equals(newStrategist.publicKey)).to.be.true;

    // Update strategist back to the original strategist
    const tx2 = await program.methods
      .updateStrategist(strategist.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx2);
  });

  it("Can update configuration", async () => {
    // Record existing config hash
    const existingConfigHash = (await program.account.boringState.fetch(boringAccount)).configHash;

    // Alter existing config params.
    configParams.noop = new anchor.web3.PublicKey("4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw");

    // Update configuration
    const tx = await program.methods
      // @ts-ignore
      .updateConfiguration(configParams)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    // Fetch the updated configuration
    const updatedConfigHash = (await program.account.boringState.fetch(boringAccount)).configHash;
    expect(updatedConfigHash).to.not.equal(existingConfigHash);

    // Update configuration back to the original config.
    configParams.noop = new anchor.web3.PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");

    const tx2 = await program.methods
      // @ts-ignore
      .updateConfiguration(configParams)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx2);

    // Fetch the updated configuration
    const updatedConfigHash2 = (await program.account.boringState.fetch(boringAccount)).configHash;
    expect(updatedConfigHash2).to.deep.equal(existingConfigHash);
  });

  it("Cannot re initialize", async () => {
    try {
      await program.methods
        // @ts-ignore
        .initialize(owner.publicKey, strategist.publicKey, configParams)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([])
      .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("already in use");
    }
  });


  it("Only owner can transfer ownership", async () => {
    const randomUser = anchor.web3.Keypair.generate();
    const newOwner = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .transferOwnership(newOwner.publicKey)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }
  });

  it("Only owner can update strategist", async () => {
    const randomUser = anchor.web3.Keypair.generate();
    const newStrategist = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .updateStrategist(newStrategist.publicKey)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }
  });

  it("Only owner can update configuration", async () => {
    const randomUser = anchor.web3.Keypair.generate();

    try {
      await program.methods
        // @ts-ignore
        .updateConfiguration(configParams)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }
  });

  it("Only strategist can transfer remote", async () => {
    // Change the strategist.
    const newStrategist = anchor.web3.Keypair.generate();

    const tx = await program.methods
      .updateStrategist(newStrategist.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    // This should be a random key pair.
    const uniqueMessage = anchor.web3.Keypair.generate();

    // Derive PDAs using unique message
    const messageStoragePda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("hyperlane"),
        Buffer.from("-"),
        Buffer.from("dispatched_message"),
        Buffer.from("-"),
        uniqueMessage.publicKey.toBuffer()
      ],
      configParams.mailboxProgram
    );
  
    const gasPaymentPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("hyperlane_igp"),
        Buffer.from("-"),
        Buffer.from("gas_payment"),
        Buffer.from("-"),
        uniqueMessage.publicKey.toBuffer()
      ],
      configParams.igpProgram
    );

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const amount = new anchor.BN(1000);

    // Should fail when called by old strategist
    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: configParams.targetProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda,
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda,
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: boringAccountAta,
          strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }

    // Update strategist back to old one.
    const tx0 = await program.methods
      .updateStrategist(strategist.publicKey)
      .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: owner.publicKey,
        })
        .signers([])
        .rpc();
    
    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx0);
  });

  it("Strategist cannot transfer remote with invalid config", async () => {
    const uniqueMessage = anchor.web3.Keypair.generate();
    
    // Derive PDAs
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

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const amount = new anchor.BN(1000);

    // Create modified config with different target program
    const invalidTargetProgram = anchor.web3.Keypair.generate().publicKey;

    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: invalidTargetProgram, // Using different target program
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda,
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda,
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: boringAccountAta,
          strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("InvalidConfiguration");
    }
  });

  it("Fails with malformed message storage PDA", async () => {
    const uniqueMessage = anchor.web3.Keypair.generate();
    // Create an incorrect message storage PDA by using wrong seeds
    const [messageStoragePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("wrong_seed"),
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

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const amount = new anchor.BN(1000);

    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: configParams.targetProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda, // Using incorrect PDA
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda,
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: boringAccountAta,
          strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("ConstraintSeeds");
    }
  });

  it("Fails with malformed gas payment PDA", async () => {
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
    
    // Create an incorrect gas payment PDA by using wrong seeds
    const [gasPaymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("wrong_seed"),
        uniqueMessage.publicKey.toBuffer()
      ],
      configParams.igpProgram
    );

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const amount = new anchor.BN(1000);

    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: configParams.targetProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda,
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda, // Using incorrect PDA
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: boringAccountAta,
          strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("ConstraintSeeds");
    }
  });

  it("Fails with malformed boring account ATA", async () => {
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

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const amount = new anchor.BN(1000);

    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: configParams.targetProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda,
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda,
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: strategistAta, // Using incorrect ATA
          strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("ConstraintTokenOwner");
    }
  });

  it("Fails with malformed strategist ATA", async () => {
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

    const amount = new anchor.BN(1000);

    try {
      await program.methods
        // @ts-ignore
        .transferRemote(destinationDomain, evmRecipient, decimals, amount)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: strategist.publicKey,
          targetProgram: configParams.targetProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
          noop: configParams.noop,
          tokenPda: configParams.tokenPda,
          mailboxProgram: configParams.mailboxProgram,
          mailboxOutbox: configParams.mailboxOutbox,
          messageDispatchAuthority: configParams.messageDispatchAuthority,
          uniqueMessage: uniqueMessage.publicKey,
          messageStoragePda: messageStoragePda,
          igpProgram: configParams.igpProgram,
          igpProgramData: configParams.igpProgramData,
          gasPaymentPda: gasPaymentPda,
          igpAccount: configParams.igpAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          boringAccountAta: boringAccountAta,
          strategistAta: boringAccountAta, // Using incorrect ATA
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("ConstraintTokenOwner");
    }
  });

  it("Can transfer remote tokens", async () => {

    // 1. Create a unique message account for this transfer
    const uniqueMessage = anchor.web3.Keypair.generate();

    // 2. Derive the PDAs we need
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

    const [strategistAta] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        strategist.publicKey.toBuffer(),
        configParams.token2022Program.toBuffer(),
        configParams.mintAuth.toBuffer(),
      ],
      ATA_PROGRAM_ID
    );

    const airdropTx =await anchor.AnchorProvider.env().connection.requestAirdrop(
      strategist.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    await anchor.AnchorProvider.env().connection.confirmTransaction(airdropTx);

    // 5. Set up the transfer amount (as a 32-byte array)
    const amount = new anchor.BN(10);
    // const value = BigInt(1000);

    // 7. Execute the transfer
    const tx = await program.methods
      // @ts-ignore
      .transferRemote(destinationDomain, evmRecipient, decimals, amount)
      .accounts({
            // @ts-ignore
            boringAccount: boringAccount,
            signer: strategist.publicKey,
            targetProgram: configParams.targetProgram,
            systemProgram: anchor.web3.SystemProgram.programId,
            noop: configParams.noop,
            tokenPda: configParams.tokenPda,
            mailboxProgram: configParams.mailboxProgram,
            mailboxOutbox: configParams.mailboxOutbox,
            messageDispatchAuthority: configParams.messageDispatchAuthority,
            uniqueMessage: uniqueMessage.publicKey,
            messageStoragePda: messageStoragePda,
            igpProgram: configParams.igpProgram,
            igpProgramData: configParams.igpProgramData,
            gasPaymentPda: gasPaymentPda,
            igpAccount: configParams.igpAccount,
            tokenSender: configParams.tokenSender,
            token2022: configParams.token2022Program,
            mintAuth: configParams.mintAuth,
            boringAccountAta: boringAccountAta,
            strategistAta: strategistAta,
        })
        .signers([strategist, uniqueMessage])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ 
              units: 400_000  // Increase compute units
          })
      ])
        .rpc();

    // 8. Verify the transfer was successful
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);
  });
});
