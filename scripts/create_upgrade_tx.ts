import { Program } from "@coral-xyz/anchor";
import anchor from "@coral-xyz/anchor";
import { 
  Transaction, 
  PublicKey, 
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction 
} from "@solana/web3.js";
import bs58 from 'bs58';
import 'dotenv/config';

// BPF Loader Program ID
const BPF_UPGRADE_LOADER_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

async function createUpgradeInstruction(
  programId: PublicKey,
  bufferAddress: PublicKey,
  upgradeAuthority: PublicKey,
  spillAddress: PublicKey
) {
  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    BPF_UPGRADE_LOADER_ID
  );

  const keys = [
    {
      pubkey: programDataAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: programId,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: bufferAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: spillAddress, // Using upgrade authority as spill address
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: SYSVAR_CLOCK_PUBKEY,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: upgradeAuthority,
      isWritable: false,
      isSigner: true,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: BPF_UPGRADE_LOADER_ID,
    data: Buffer.from([3, 0, 0, 0]), // Upgrade instruction bincode
  });
}

async function main() {
  try {
    const anchor = require("@coral-xyz/anchor");
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    // Configuration
    const bufferAccount = new PublicKey("EdPhrpChYNfUf3zoVeqFDBWjEMoVQYPwzY7oY52P3tNt");
    const programId = new PublicKey("AWzzXzsLQvddsYdphCV6CTcr5ALXtg8AAtZXTqbUcVBF");
    const multisigAuthority = new PublicKey("4Cj1s2ipALjJk9foQV4oDaZYCZwSsVkAShQL1KFVJG9b");
    const spillAddress = new PublicKey("DuheUFDBEGh1xKKvCvcTPQwA8eR3oo58kzVpB54TW5TP");
    
    // Create our own upgrade instruction
    const upgradeIx = await createUpgradeInstruction(
      programId,
      bufferAccount,
      multisigAuthority,
      spillAddress
    );

    // Create a transaction with our instruction
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: multisigAuthority,
      ...latestBlockhash,
    }).add(upgradeIx);

    // Serialize and compare
    const serializedTx = tx.serializeMessage();

    const encoded = bs58.encode(serializedTx);

    console.log("\nTransaction Details:");
    console.log("- Instructions:", tx.instructions.length);
    console.log("- Fee Payer:", tx.feePayer.toBase58());
    console.log("- Recent Blockhash:", tx.recentBlockhash);
    console.log("- Serialized Size:", serializedTx.length, "bytes");
    
    require('fs').writeFileSync('encoded_transaction.txt', encoded);
    
    console.log("\nEncoded transaction has been written to encoded_transaction.txt");

  } catch (error) {
    console.error("Failed to create upgrade transaction:", error);
    throw error;
  }
}

main();