import * as anchor from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";
import { BoringBridgeHolder } from "../target/types/boring_bridge_holder";
import { expect } from "chai";
import { ComputeBudgetProgram } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAssociatedTokenAddressSync,
  MintLayout,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import {
  AccountInfoBytes,
  AddedAccount,
  BanksClient,
  BanksTransactionResultWithMeta,
  ProgramTestContext,
} from "solana-bankrun";
import {
  PublicKey,
  Transaction,
  Keypair,
  Connection,
  clusterApiUrl,
  TransactionInstruction
} from "@solana/web3.js";

const path = require("path");
const IDL = require(path.join(__dirname,"../target/idl/boring_bridge_holder.json"));

// TODO maybe install the @solana/spl-token library
// TODO so the boringAccountAta is dependent on the provider.wallet.
// So I need to find some way to create the boringAccountAta using some wallet from this test,
// then I need to figure out how to send some tokens to it so that others can run the test suite.

// The signers array will automatically have the provider's wallet added to it.(which is the owner)
describe("boring-bridge-holder", () => {
  let provider: BankrunProvider;
  let program: Program<BoringBridgeHolder>;
  let context: ProgramTestContext;
  let client: BanksClient;
  let connection: Connection;
  let creator: anchor.web3.Keypair;
  let owner: anchor.web3.Keypair = anchor.web3.Keypair.generate();
  let strategist: anchor.web3.Keypair = anchor.web3.Keypair.generate();
  let boringAccount: anchor.web3.PublicKey;
  let boringAccountAta: anchor.web3.PublicKey;
  let strategistAta: anchor.web3.PublicKey;
  let configParams: any;
  
  // Constants that don't depend on async operations
  const PROJECT_DIRECTORY = ""; // Leave empty if using default anchor project
  const ATA_PROGRAM_ID = new anchor.web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const destinationDomain = new anchor.BN(1);
  const evmAddressHex = "0x0463E60C7cE10e57911AB7bD1667eaa21de3e79b".slice(2);
  const evmRecipient = Buffer.concat([
    Buffer.alloc(12, 0),
    Buffer.from(evmAddressHex, 'hex')
  ]);
  const decimals = new anchor.BN(6);

  // Array of accounts to clone from mainnet
  const ACCOUNTS_TO_CLONE = [
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
    "EitxJuv2iBjsg2d7jVy2LDC1e2zBrx4GB5Y9h2Ko3A9Y", // Mailbox Program
    "FKKDGYumoKjQjVEejff6MD1FpKuBs6SdgAobVdJdE21B", // Mailbox Outbox
    "HncL4avgJq8uH2cGaAUf5rF2SS2ZLKH3MEyq97WFNmv6", // Message Dispatch Authority
    "Hs7KVBU67nBnWhDPZkEFwWqrFMUfJbmY2DQ4gmCZfaZp", // IGP Program
    "FvGvXJf6bd2wx8FxzsYNzd2uHaPy7JTkmuKiVvSTt7jm", // IGP Program Data
    "3Wp4qKkgf4tjXz1soGyTSndCgBPLZFSrZkiDZ8Qp9EEj", // IGP Account
    "EqRSt9aUDMKYKhzd1DGMderr3KNp29VZH3x5P7LFTC8m", // Target Program
    "84KCVv2ERnDShUepu5kCufm2nB8vdHnCCuWx4qbDKSTB", // Token PDA
    "ABb3i11z7wKoGCfeRQNQbVYWjAm7jG7HzZnDLV4RKRbK", // Token Sender
    "AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE", // Mint Authority
  ];

  async function createAndProcessTransaction(
    client: BanksClient,
    payer: Keypair,
    instruction: TransactionInstruction,
    additionalSigners: Keypair[] = []
  ): Promise<BanksTransactionResultWithMeta> {
    const tx = new Transaction();
    const [latestBlockhash] = await client.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash;
    tx.add(instruction);
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...additionalSigners);
    return await client.tryProcessTransaction(tx);
  }

  async function setupATA(
    context: ProgramTestContext,
    mintAccount: PublicKey,
    owner: PublicKey,
    amount: number
  ): Promise<PublicKey> {
    const tokenAccData = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint: mintAccount,
        owner,
        amount: BigInt(amount),
        delegateOption: 0,
        delegate: PublicKey.default,
        delegatedAmount: BigInt(0),
        state: 1,
        isNativeOption: 0,
        isNative: BigInt(0),
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      tokenAccData,
    );
  
    const ata = getAssociatedTokenAddressSync(mintAccount, owner, true, TOKEN_2022_PROGRAM_ID);
    const ataAccountInfo = {
      lamports: 1_000_000_000,
      data: tokenAccData,
      owner: TOKEN_2022_PROGRAM_ID,
      executable: false,
    };
  
    context.setAccount(ata, ataAccountInfo);
    return ata;
  }

  before(async () => {
    connection = new Connection("https://eclipse.helius-rpc.com");

    // Helper function to create AddedAccount from public key
    const createAddedAccount = async (pubkeyStr: string): Promise<AddedAccount> => {
      const pubkey = new PublicKey(pubkeyStr);
      const accountInfo = await connection.getAccountInfo(pubkey);
      if (!accountInfo) throw new Error(`Failed to fetch account ${pubkeyStr}`);
      return {
        address: pubkey,
        info: accountInfo
      };
    };

    // Create base accounts (owner and strategist with SOL)
    const baseAccounts: AddedAccount[] = [
      {
        address: owner.publicKey,
        info: {
          lamports: 2_000_000_000,
          data: Buffer.alloc(0),
          owner: anchor.web3.SystemProgram.programId,
          executable: false,
        }
      },
      {
        address: strategist.publicKey,
        info: {
          lamports: 2_000_000_000,
          data: Buffer.alloc(0),
          owner: anchor.web3.SystemProgram.programId,
          executable: false,
        }
      }
    ];

    // Fetch all accounts in parallel
    const clonedAccounts = await Promise.all(
      ACCOUNTS_TO_CLONE.map(createAddedAccount)
    );

    // Combine base accounts with cloned accounts
    const allAccounts = [...baseAccounts, ...clonedAccounts];

    // Set up bankrun context
    context = await startAnchor(PROJECT_DIRECTORY, [], allAccounts);
    client = context.banksClient;
    provider = new BankrunProvider(context);
    creator = context.payer;
    anchor.setProvider(provider); //TODO is this needed?
    program = anchor.workspace.BoringBridgeHolder as Program<BoringBridgeHolder>;

    // Initialize configParams
     configParams = {
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
    // Find PDAs
    let bump;
    [boringAccount, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("boring_state"),
        creator.publicKey.toBuffer()
      ],
      program.programId
    );

    // Create ATA for strategist
    strategistAta = await setupATA(context, configParams.mintAuth, strategist.publicKey, 0);

    // Create ATA for boringAccount, but give it some tokens
    boringAccountAta = await setupATA(context, configParams.mintAuth, boringAccount, 1000000);
  });

  // token sender associated is wrong it would really be a a PDA using the holder account.

  it("Is initialized!", async () => {
    const ix = await program.methods
    .initialize(
        owner.publicKey,
        strategist.publicKey,
        configParams,
      )
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: creator.publicKey,
    })
    .signers([])
    .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator]);

    // Expect the tx to succeed.
    expect(txResult.result).to.be.null;

    // Confirm the transaction
    await provider.connection.confirmTransaction

    const programBoringAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the owner is set
    expect(programBoringAccount.owner.equals(owner.publicKey)).to.be.true;
    // Make sure the strategist is set
    expect(programBoringAccount.strategist.equals(strategist.publicKey)).to.be.true;
    // Verify the config hash is not all zeros
    const isAllZeros = programBoringAccount.configHash.every(byte => byte === 0);
    expect(isAllZeros).to.be.false;
  });

  it("Can transfer ownership", async () => {
    const newOwner = anchor.web3.Keypair.generate();

    const ix0 = await program.methods
      .transferOwnership(newOwner.publicKey)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([owner])
      .instruction();

    let txResult0 = await createAndProcessTransaction(client, creator, ix0, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult0.result).to.be.null;

    let programBoringAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the owner is set
    expect(programBoringAccount.owner.equals(newOwner.publicKey)).to.be.true;

    // Transfer ownership back to the original owner
    const ix1 = await program.methods
      .transferOwnership(owner.publicKey)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: newOwner.publicKey,
      })
      .signers([newOwner])
      .instruction();

    let txResult1 = await createAndProcessTransaction(client, creator, ix1, [creator, newOwner]);

    // Expect the tx to succeed.
    expect(txResult1.result).to.be.null;

    programBoringAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the owner is set
    expect(programBoringAccount.owner.equals(owner.publicKey)).to.be.true;
  });

  it("Can update strategist", async () => {
    const newStrategist = anchor.web3.Keypair.generate();

    const ix0 = await program.methods
      .updateStrategist(newStrategist.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([owner])
    .instruction();

    let txResult0 = await createAndProcessTransaction(client, creator, ix0, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult0.result).to.be.null;

    let programBoringAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the strategist is set
    expect(programBoringAccount.strategist.equals(newStrategist.publicKey)).to.be.true;

    // Update strategist back to the original strategist
    const ix1 = await program.methods
      .updateStrategist(strategist.publicKey)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([])
      .instruction();

    let txResult1 = await createAndProcessTransaction(client, creator, ix1, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult1.result).to.be.null;

    programBoringAccount = await program.account.boringState.fetch(boringAccount);
    // Make sure the strategist is set
    expect(programBoringAccount.strategist.equals(strategist.publicKey)).to.be.true;
  });

  it("Can update configuration", async () => {
    // Record existing config hash
    const existingConfigHash = (await program.account.boringState.fetch(boringAccount)).configHash;

    // Alter existing config params.
    configParams.noop = new anchor.web3.PublicKey("4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw");

    // Update configuration
    const ix0 = await program.methods
      // @ts-ignore
      .updateConfiguration(configParams)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([])
      .instruction();

    let txResult0 = await createAndProcessTransaction(client, creator, ix0, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult0.result).to.be.null;

    // Fetch the updated configuration
    const updatedConfigHash = (await program.account.boringState.fetch(boringAccount)).configHash;
    expect(updatedConfigHash).to.not.equal(existingConfigHash);

    // Update configuration back to the original config.
    configParams.noop = new anchor.web3.PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");

    const ix1 = await program.methods
      // @ts-ignore
      .updateConfiguration(configParams)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([])
      .instruction();

    let txResult1 = await createAndProcessTransaction(client, creator, ix1, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult1.result).to.be.null;

    // Fetch the updated configuration
    const updatedConfigHash2 = (await program.account.boringState.fetch(boringAccount)).configHash;
    expect(updatedConfigHash2).to.deep.equal(existingConfigHash);
  });

  it("Cannot re initialize", async () => {
    const ix = await program.methods
      .initialize(
          owner.publicKey,
          strategist.publicKey,
          configParams,
        )
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: creator.publicKey,
      })
      .signers([])
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes(boringAccount.toString()) &&
      log.includes("already in use")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
  });

  it("Only owner can transfer ownership", async () => {
    const randomUser = anchor.web3.Keypair.generate();
    const newOwner = anchor.web3.Keypair.generate();

    const ix = await program.methods
      .transferOwnership(newOwner.publicKey)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, randomUser]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("Error Code: Unauthorized") &&
      log.includes("Error Message: OnlyOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
  });

  it("Only owner can update strategist", async () => {
    const randomUser = anchor.web3.Keypair.generate();
    const newStrategist = anchor.web3.Keypair.generate();

    const ix = await program.methods
      .updateStrategist(newStrategist.publicKey)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, randomUser]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("Error Code: Unauthorized") &&
      log.includes("Error Message: OnlyOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
  });

  it("Only owner can update configuration", async () => {
    const randomUser = anchor.web3.Keypair.generate();

    const ix = await program.methods
      // @ts-ignore
        .updateConfiguration(configParams)
        .accounts({
          // @ts-ignore
          boringAccount: boringAccount,
          signer: randomUser.publicKey,
        })
        .signers([randomUser])
        .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, randomUser]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("Error Code: Unauthorized") &&
      log.includes("Error Message: OnlyOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
  });

  it("Only strategist can transfer remote", async () => {
    // Change the strategist.
    const newStrategist = anchor.web3.Keypair.generate();

    const ix0 = await program.methods
      .updateStrategist(newStrategist.publicKey)
    .accounts({
      // @ts-ignore
      boringAccount: boringAccount,
      signer: owner.publicKey,
    })
    .signers([])
    .instruction();
    let txResult0 = await createAndProcessTransaction(client, creator, ix0, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult0.result).to.be.null;

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

    const amount = new anchor.BN(1000);

    // Should fail when called by old strategist
    const ix1 = await program.methods
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
      .instruction();
    let txResult1 = await createAndProcessTransaction(client, creator, ix1, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult1.result).to.exist;
    const errorLog = txResult1.meta.logMessages.find(log =>
      log.includes("Error Code: Unauthorized") &&
      log.includes("Error Message: OnlyOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult1.meta.logMessages[txResult1.meta.logMessages.length - 1]).to.include("failed");

    // Update strategist back to old one.
    const ix2 = await program.methods
      .updateStrategist(strategist.publicKey)
      .accounts({
        // @ts-ignore
        boringAccount: boringAccount,
        signer: owner.publicKey,
      })
      .signers([])  
      .instruction();
    let txResult2 = await createAndProcessTransaction(client, creator, ix2, [creator, owner]);

    // Expect the tx to succeed.
    expect(txResult2.result).to.be.null;
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

    const amount = new anchor.BN(1000);

    // Create modified config with different target program
    const invalidTargetProgram = anchor.web3.Keypair.generate().publicKey;

    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("Error Code: InvalidConfiguration")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
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

    const amount = new anchor.BN(1000);

    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("message_storage_pda") &&
      log.includes("ConstraintSeeds")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
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

    const amount = new anchor.BN(1000);

    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("gas_payment_pda") &&
      log.includes("ConstraintSeeds")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
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

    const amount = new anchor.BN(1000);

    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("boring_account_ata") &&
      log.includes("ConstraintTokenOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
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

    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // Expect the tx to fail.
    expect(txResult.result).to.exist;
    const errorLog = txResult.meta.logMessages.find(log =>
      log.includes("strategist_ata") &&
      log.includes("ConstraintTokenOwner")
    )
    expect(errorLog).to.exist;

    // Last log should indicate failure.
    expect(txResult.meta.logMessages[txResult.meta.logMessages.length - 1]).to.include("failed");
  });

  it("Can transfer remote tokens", async () => {
    const targetProgramExecutableData = new PublicKey("9hBaeLg5pnY3BxQRrL7mn36Tn2H72MRbcJp43hrc9LCE");
    const localProgramInfoBefore = await client.getAccount(targetProgramExecutableData);
    expect(localProgramInfoBefore).to.be.null;
    console.log("Program Data Account before:", localProgramInfoBefore);
    // Load in the target program executable data.
    const targetProgramExecutableDataInfo = await connection.getAccountInfo(targetProgramExecutableData);
    context.setAccount(targetProgramExecutableData, targetProgramExecutableDataInfo);

    const localProgramInfoAfter = await client.getAccount(targetProgramExecutableData);
    expect(localProgramInfoAfter).to.exist;

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

    // 5. Set up the transfer amount (as a 32-byte array)
    const amount = new anchor.BN(10);

    // 7. Execute the transfer
    const ix = await program.methods
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
      .instruction();
    let txResult = await createAndProcessTransaction(client, creator, ix, [creator, strategist, uniqueMessage]);

    // 8. Verify the transfer was successful
    console.log(txResult.meta.logMessages);
    expect(txResult.result).to.be.null;
  });
});
