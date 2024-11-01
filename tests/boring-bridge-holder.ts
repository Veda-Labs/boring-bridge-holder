import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { expect } from "chai";

// The signers array will automatically have the provider's wallet added to it.(which is the owner)
describe("boring-bridge-holder", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

  const holder = anchor.web3.Keypair.generate();
  const owner = (program.provider as anchor.AnchorProvider).wallet
  const strategist = anchor.web3.Keypair.generate();
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
    tokenSenderAssociated: new anchor.web3.PublicKey("4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw"),
  }
  const destinationDomain = 1;
  const evm_target = new Array(32).fill(0);

  // token sender associated is wrong it would really be a a PDA using the holder account.

  it("Is initialized!", async () => {
    await anchor.AnchorProvider.env().connection.requestAirdrop(
      owner.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    const tx = await program.methods
      .initialize(
        owner.publicKey,
        strategist.publicKey,
        configParams,
        destinationDomain,
        evm_target
      )
    .accounts({
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([holder])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(holder.publicKey);
    // Make sure the owner is set
    expect(holderAccount.owner.equals(owner.publicKey)).to.be.true;
    // Make sure the strategist is set
    expect(holderAccount.strategist.equals(strategist.publicKey)).to.be.true;
    // Make sure the destination domain is set
    expect(holderAccount.destinationDomain).to.equal(destinationDomain);
    // Make sure the evm target is set
    expect(holderAccount.evmTarget).to.deep.equal(evm_target);
    // TODO check that config params is set.
  });

  it("Can transfer ownership", async () => {
    const newOwner = anchor.web3.Keypair.generate();

    const tx = await program.methods
      .transferOwnership(newOwner.publicKey)
    .accounts({
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(holder.publicKey);
    // Make sure the owner is set
    expect(holderAccount.owner.equals(newOwner.publicKey)).to.be.true;

    // Transfer ownership back to the original owner
    const tx2 = await program.methods
      .transferOwnership(owner.publicKey)
    .accounts({
      boringAccount: holder.publicKey,
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
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    const holderAccount = await program.account.boringState.fetch(holder.publicKey);
    // Make sure the strategist is set
    expect(holderAccount.strategist.equals(newStrategist.publicKey)).to.be.true;

    // Update strategist back to the original strategist
    const tx2 = await program.methods
      .updateStrategist(strategist.publicKey)
    .accounts({
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx2);
  });

  it("Can update configuration", async () => {
    // Record existing config hash
    const existingConfigHash = (await program.account.boringState.fetch(holder.publicKey)).configHash;

    // Alter existing config params.
    configParams.noop = new anchor.web3.PublicKey("4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw");

    // Update configuration
    const tx = await program.methods
      .updateConfiguration(configParams)
    .accounts({
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx);

    // Fetch the updated configuration
    const updatedConfigHash = (await program.account.boringState.fetch(holder.publicKey)).configHash;
    expect(updatedConfigHash).to.not.equal(existingConfigHash);

    // Update configuration back to the original config.
    configParams.noop = new anchor.web3.PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");

    const tx2 = await program.methods
      .updateConfiguration(configParams)
    .accounts({
      boringAccount: holder.publicKey,
      signer: owner.publicKey,
    })
    .signers([])
    .rpc();

    // Confirm the transaction
    await anchor.AnchorProvider.env().connection.confirmTransaction(tx2);

    // Fetch the updated configuration
    const updatedConfigHash2 = (await program.account.boringState.fetch(holder.publicKey)).configHash;
    expect(updatedConfigHash2).to.deep.equal(existingConfigHash);
  });

  it("Cannot re initialize", async () => {
    try {
      await program.methods
        .initialize(owner.publicKey, strategist.publicKey, configParams, destinationDomain, evm_target)
      .accounts({
        boringAccount: holder.publicKey,
        signer: owner.publicKey,
      })
      .signers([holder])
      .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      // expect(e.toString()).to.include("ReInitialized");
    }
  });


  it("Only owner can transfer ownership", async () => {
    const randomUser = anchor.web3.Keypair.generate();
    const newOwner = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .transferOwnership(newOwner.publicKey)
        .accounts({
          boringAccount: holder.publicKey,
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
          boringAccount: holder.publicKey,
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
        .updateConfiguration(configParams)
        .accounts({
          boringAccount: holder.publicKey,
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
    // Create random user that tries to call transfer remote.
    const randomUser = anchor.web3.Keypair.generate();

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

    const amount = new Array(32).fill(0);

    // Should fail when called by random user
    try {
      await program.methods
        .transferRemote(amount)
        .accounts({
          boringAccount: holder.publicKey,
          signer: randomUser.publicKey,
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
          tokenSenderAssociated: configParams.tokenSenderAssociated,
        })
        .signers([randomUser, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }
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

    const amount = new Array(32).fill(0);

    // Create modified config with different target program
    const invalidTargetProgram = anchor.web3.Keypair.generate().publicKey;

    try {
      await program.methods
        .transferRemote(amount)
        .accounts({
          boringAccount: holder.publicKey,
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
          tokenSenderAssociated: configParams.tokenSenderAssociated,
        })
        .signers([strategist, uniqueMessage])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("InvalidConfiguration");
    }
  });

  it("Verifies PDA derivation logic", async () => {
    // Known values from your test transaction
    const knownUniqueMessage = new anchor.web3.PublicKey("BvSZDyyAQqJes9BwTy8HRngqk9fAHgJLA3TvzVG93rvW");
    const knownMailboxProgram = new anchor.web3.PublicKey("EitxJuv2iBjsg2d7jVy2LDC1e2zBrx4GB5Y9h2Ko3A9Y");
    const knownIgpProgram = new anchor.web3.PublicKey("Hs7KVBU67nBnWhDPZkEFwWqrFMUfJbmY2DQ4gmCZfaZp");
    
    // Expected PDA addresses from your test transaction
    const expectedMessageStoragePda = new anchor.web3.PublicKey("7wHZmEimQKZUn96HXNDK7UUeQFvEc4raB9wEtMBhnHTi");
    const expectedGasPaymentPda = new anchor.web3.PublicKey("ALbDN9TJ5yVwrHPr9VZW6AHzh4TpJWurqEWvNR4web3j");

    // Derive PDAs using the same logic from the macros
    const [derivedMessageStoragePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("hyperlane"),
        Buffer.from("-"),
        Buffer.from("dispatched_message"),
        Buffer.from("-"),
        knownUniqueMessage.toBuffer()
      ],
      knownMailboxProgram
    );

    const [derivedGasPaymentPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("hyperlane_igp"),
        Buffer.from("-"),
        Buffer.from("gas_payment"),
        Buffer.from("-"),
        knownUniqueMessage.toBuffer()
      ],
      knownIgpProgram
    );

    // Verify the derived PDAs match the expected addresses
    expect(derivedMessageStoragePda.equals(expectedMessageStoragePda)).to.be.true;
    expect(derivedGasPaymentPda.equals(expectedGasPaymentPda)).to.be.true;
  });

  it("Verifies token sender associated account derivation", async () => {
    // Known values from your test transaction
    const ATA_PROGRAM_ID = new anchor.web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    
    // Please provide these values from your test transaction:
    const tokenSender = new anchor.web3.PublicKey("Hv4wFFTubQtULBCHR64H1CZ5KJezgH8GCiMr3PjtFyhJ");
    const mintAuth = new anchor.web3.PublicKey("AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE");
    const token2022Program = new anchor.web3.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    
    // Expected ATA from your test transaction
    const expectedAta = new anchor.web3.PublicKey("4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw");

    // Derive the ATA
    const [derivedAta] = anchor.web3.PublicKey.findProgramAddressSync(
        [
            tokenSender.toBuffer(),
            token2022Program.toBuffer(),
            mintAuth.toBuffer(),
        ],
        ATA_PROGRAM_ID
    );

    // Verify the derived ATA matches the expected address
    expect(derivedAta.equals(expectedAta)).to.be.true;
  });

  // TODO now add in a test that "forks" mainnet by loading in the programs and accounts from eclipse that I need.
  // Then I am going to need to have to somehow edit my boringAccounts token account to give it some tokens, AND I will
  // probs need to edit the associated token program to make that work cuz that is a PDA so it should be derived as such.

  // These lines are interesting. It does look like the unique message is literally just a random kaypair
  // And that the 
  // https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/rust/sealevel/programs/hyperlane-sealevel-token/tests/functional.rs#L705-L713

  // Okay and I think this line is useful for determine the recipient associated token account.
  // https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/rust/sealevel/programs/hyperlane-sealevel-token/tests/functional.rs#L459-L464
});
