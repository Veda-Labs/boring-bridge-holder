# Boring Bridge Holder

A Solana program that facilitates token bridging using Hyperlane's infrastructure. The program implements a secure ownership model using [Squads Protocol](https://squads.so) for critical administrative controls while maintaining efficient token bridging operations.

## Security Model

### Administrative Control

- Program upgrade authority is managed by a Squads multisig
- Program account ownership is managed by the same Squads multisig
- This ensures critical administrative functions require multiple signatures, preventing single-point-of-failure risks

### Strategist Role

- The strategist is implemented as a normal externally owned account (not a PDA)
- This design choice is necessary since PDAs with data cannot transfer lamports
- The strategist has limited control, only being able to:
  1. Initiate transfers up to the current token balance
  2. Pay bridge fees using their own lamports

## Transfer Flow

When a strategist initiates a remote transfer, the following security checks and operations occur:

1. **Strategist Verification**

   - Verifies the transaction signer matches the stored strategist public key

2. **Configuration Validation**

   - All strategist-provided parameters (except amount) are hashed and compared against stored configuration
   - This prevents unauthorized modification of bridge parameters

3. **Token Transfer**

   - Transfers the specified token amount from the program derived account(BoringState) to the strategist
   - Amount is bounded by the program's current token balance

4. **Bridge Execution**
   - The transferred tokens are bridged from the strategist's account, using Hyperlane's infrastructure
   - Bridge fees are paid by the strategist's account

## Important Notes

- The strategist cannot modify any bridge configuration parameters
- All configuration changes require multisig approval
- Bridge fees must be covered by the strategist's lamport balance
- Token transfers are limited to the program's available balance

## Links

- [Squads Protocol](https://squads.so) - The multisig solution used for administrative control

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/en/download/)
- [Yarn](https://classic.yarnpkg.com/en/docs/install) or [npm](https://www.npmjs.com/get-npm)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd boring-bridge-holder
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

## Building

Build the program:

```bash
anchor build
```

## Testing

Run the tests:

```bash
anchor test
```

## Deploying

Solana devnet:

```bash
anchor deploy --provider.cluster https://api.devnet.solana.com
```

Eclipse Mainnet:

```bash
solana program deploy target/deploy/boring_bridge_holder.so --keypair ~/.config/solana/id.json --url https://eclipse.helius-rpc.com
```

To retry txs:

```bash
solana program deploy target/deploy/boring_bridge_holder.so --keypair ~/.config/solana/id.json --url https://eclipse.helius-rpc.com --buffer <PATH_TO_INTERMEDIATE_KEYPAIR>
```

To generate an intermediate keypair:

```bash
solana-keygen recover --outfile ./intermediate.json
```

To see abandoned buffer accounts:

```bash
solana program show --buffers --keypair ~/.config/solana/id.json -u https://eclipse.helius-rpc.com
```

To close abandoned buffer accounts:

```bash
solana program close --buffers --keypair ~/.config/solana/id.json -u https://eclipse.helius-rpc.com
```

## scripts

Before running any scripts:

1. Copy the sample environment file:

   ```bash
   cp sample.env .env
   ```

2. Fill out the `.env` file with your configuration values

- `initialize.ts`: Initialize the boring bridge holder account
- `transfer_ownership.ts`: Transfer ownership of the boring bridge holder account
- `update_configuration.ts`: Update the configuration
- `update_strategist.ts`: Update the strategist
- `transfer_remote.ts`: Transfer tokens remotely

3. Run scripts using ts-node:
   ```bash
   ts-node scripts/<script-name>.ts
   ```

## Program Structure

- `programs/boring-bridge-holder/src/lib.rs`: Main program file containing instruction handlers
- `programs/boring-bridge-holder/src/instructions/`: Directory containing instruction-specific logic
  - `transfer_remote.rs`: Logic for the transfer remote instruction
- `tests/boring-bridge-holder.ts`: Test suite

## Key Features

- Initialize a boring bridge holder account
- Transfer ownership
- Update strategist
- Update configuration
- Transfer tokens remotely using Hyperlane's infrastructure

## Account Structure

### BoringState

- Creator: The account that created the boring bridge holder
- Owner: The account that can update configuration and transfer ownership
- Strategist: The account that can execute transfers
- Config Hash: Hash of the current configuration
- Bump: PDA bump seed

### Configuration Data

- Target Program
- NOOP Program
- Token PDA
- Mailbox Program
- Mailbox Outbox
- Message Dispatch Authority
- IGP Program
- IGP Program Data
- IGP Account
- Token Sender
- Token 2022 Program
- Mint Authority
- Destination Domain
- EVM Recipient
- Decimals

## License

UNLICENSED
