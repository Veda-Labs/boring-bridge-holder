# Boring Bridge Holder

A Solana program that facilitates token bridging using Hyperlane's infrastructure.

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

1. Start a local Solana test validator:

   ```bash
   solana-test-validator
   ```

2. Run the tests:
   ```bash
    anchor test
   ```

## Deploying

Solana devnet:

```bash
anchor deploy --provider.cluster https://api.devnet.solana.com
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
