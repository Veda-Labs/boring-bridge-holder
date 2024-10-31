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
    igbProgram: new anchor.web3.PublicKey("Hs7KVBU67nBnWhDPZkEFwWqrFMUfJbmY2DQ4gmCZfaZp"),
    igbProgramData: new anchor.web3.PublicKey("FvGvXJf6bd2wx8FxzsYNzd2uHaPy7JTkmuKiVvSTt7jm"),
    igbAccount: new anchor.web3.PublicKey("3Wp4qKkgf4tjXz1soGyTSndCgBPLZFSrZkiDZ8Qp9EEj"),
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
    const randomUser = anchor.web3.Keypair.generate();
    const uniqueMessage = anchor.web3.Keypair.generate();
    const messageStoragePda = anchor.web3.Keypair.generate();
    const gasPaymentPda = anchor.web3.Keypair.generate();
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
          messageStoragePda: messageStoragePda.publicKey,
          igbProgram: configParams.igbProgram,
          igbProgramData: configParams.igbProgramData,
          gasPaymentPda: gasPaymentPda.publicKey,
          igbAccount: configParams.igbAccount,
          tokenSender: configParams.tokenSender,
          token2022: configParams.token2022Program,
          mintAuth: configParams.mintAuth,
          tokenSenderAssociated: configParams.tokenSenderAssociated,
        })
        .signers([randomUser, uniqueMessage, messageStoragePda, gasPaymentPda])
        .rpc();
      expect.fail("Should have thrown error");
    } catch (e) {
      expect(e.toString()).to.include("Unauthorized");
    }

    // // Should succeed when called by strategist
    // const tx = await program.methods
    //   .transferRemote(amount)
    //   .accounts({
    //     boringAccount: holder.publicKey,
    //     signer: strategist.publicKey,
    //     // Add other required accounts here
    //   })
    //   .signers([strategist])
    //   .rpc();

    // await anchor.AnchorProvider.env().connection.confirmTransaction(tx);
  });

});
