import { exec } from 'child_process';

const PATH_TO_COMPILED_PROGRAM = './target/deploy/boring_bridge_holder.so';
const RPC_URL = 'https://eclipse.helius-rpc.com';
const PROGRAM_ID = 'AWzzXzsLQvddsYdphCV6CTcr5ALXtg8AAtZXTqbUcVBF';

// Helper function to execute commands
const execCommand = async (command: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
};

async function verifyProgram() {
  try {
    // Check if solana-verify is installed
    try {
      await execCommand('solana-verify --version');
    } catch (error) {
      console.error('\x1b[31mError: solana-verify is not installed\x1b[0m');
      console.log('Please install it by running:');
      console.log('\x1b[33mcargo install solana-verify\x1b[0m');
      process.exit(1);
    }

    // Get local program hash
    console.log('Getting local program hash...');
    const localHash = await execCommand(
      `solana-verify get-executable-hash ${PATH_TO_COMPILED_PROGRAM}`
    );
    console.log(`Local program hash: ${localHash}`);

    // Get on-chain program hash
    console.log('\nGetting on-chain program hash...');
    const onChainHash = await execCommand(
      `solana-verify get-program-hash -u ${RPC_URL} ${PROGRAM_ID}`
    );
    console.log(`On-chain program hash: ${onChainHash}`);

    // Compare hashes
    console.log('\nComparing hashes...');
    if (localHash === onChainHash) {
      console.log('\x1b[32mSuccess: Program hashes match!\x1b[0m');
    } else {
      console.error('\x1b[31mError: Program hashes do not match!\x1b[0m');
      console.log('Local hash:     ', localHash);
      console.log('On-chain hash: ', onChainHash);
      process.exit(1);
    }

  } catch (error) {
    console.error('\x1b[31mAn error occurred:\x1b[0m', error);
    process.exit(1);
  }
}

verifyProgram().catch( err => {
  console.error("Error:", err);
  process.exit(1);
});