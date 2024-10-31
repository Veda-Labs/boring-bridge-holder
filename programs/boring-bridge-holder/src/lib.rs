use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::hash::hash;
use solana_program::pubkey::Pubkey;

declare_id!("9r1KKPDBrJDMST1BDvua1ah1WMDeMAg36NrD2cCTd1vz");

// Logic for transfer_remote
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/rust/sealevel/libraries/hyperlane-sealevel-token/src/processor.rs#L275
// So yes I beleive teh input ones are ones that are based on a per tx basis but should look at how the above calls into mailbox to see how it derives it
// Accounts
// SOL TARGET: EqRSt9aUDMKYKhzd1DGMderr3KNp29VZH3x5P7LFTC8m
// 1) System program: 11111111111111111111111111111111 // const
// 2) NOOP: noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV // const
// 3) Token PDA: 84KCVv2ERnDShUepu5kCufm2nB8vdHnCCuWx4qbDKSTB owned by SOL TARGET // config
// 4) Mailbox program: EitxJuv2iBjsg2d7jVy2LDC1e2zBrx4GB5Y9h2Ko3A9Y // config
// 5) Mailbox outbox: FKKDGYumoKjQjVEejff6MD1FpKuBs6SdgAobVdJdE21B mutable // config
// 6) Message dispatch authority: HncL4avgJq8uH2cGaAUf5rF2SS2ZLKH3MEyq97WFNmv6 // config
// 7) MY ADDRESS: Hv4wFFTubQtULBCHR64H1CZ5KJezgH8GCiMr3PjtFyhJ, but I think this would be the programs accounts ID? the one that holds the token // const
// 8) unique message? different for all of them, maybe you rng some account? // input I think this might just be a random account that has never been used before
// 9) So a message storage PDA? My thinking is this something that is calculated offchain using sender address, and some nonce and bump? //input
// OPTIONAL 10) IGB program: Hs7KVBU67nBnWhDPZkEFwWqrFMUfJbmY2DQ4gmCZfaZp // config
// OPTIONAL 11) IGB Program data: FvGvXJf6bd2wx8FxzsYNzd2uHaPy7JTkmuKiVvSTt7jm // config
// OPTIONAL 12) Gas payment PDA, again think its like the message storage PDA. // input
// OPTIONAL 13) IGP account: 3Wp4qKkgf4tjXz1soGyTSndCgBPLZFSrZkiDZ8Qp9EEj // config
// 14) Token sender: ABb3i11z7wKoGCfeRQNQbVYWjAm7jG7HzZnDLV4RKRbK // config
// 15) Token 2022 Program: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb // const
// 16) Mint/mint authority PDA: AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE // config in my test this was the token address
// 17) token senders associated account from which tokens will be burned: 4NJWKGTJuWWqhdsdnKZwskp2CQqLBtqaPkvm99du4Mpw <--- this is the token account owned by sender // config
#[program]
mod boring_bridge_holder {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        owner: Pubkey,
        strategist: Pubkey,
        config: ConfigurationData,
        destination_domain: u32,
        evm_target: [u8; 32],
    ) -> Result<()> {
        // Check if the account is already initialized
        let boring_account = &mut ctx.accounts.boring_account;
        require!(
            boring_account.owner == Pubkey::default(),
            CustomError::AlreadyInitialized
        );

        boring_account.owner = owner;
        boring_account.strategist = strategist;
        boring_account.config_hash = config.compute_hash();
        boring_account.destination_domain = destination_domain;
        boring_account.evm_target = evm_target;

        msg!("Set Owner to: {}!", owner); // Message will show up in the tx logs
        msg!("Set Strategist to: {}!", strategist); // Message will show up in the tx logs
        Ok(())
    }

    pub fn transfer_ownership(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        require_keys_eq!(
            ctx.accounts.signer.key(),
            boring_account.owner,
            CustomError::Unauthorized
        );

        // Update the owner
        boring_account.owner = new_owner;
        msg!("Owner updated to: {}", new_owner);
        Ok(())
    }

    pub fn update_strategist(ctx: Context<UpdateOwner>, new_strategist: Pubkey) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        require_keys_eq!(
            ctx.accounts.signer.key(),
            boring_account.owner,
            CustomError::Unauthorized
        );

        // Update the owner
        boring_account.strategist = new_strategist;
        msg!("Strategist updated to: {}", new_strategist);
        Ok(())
    }

    pub fn update_configuration(
        ctx: Context<UpdateOwner>,
        config: ConfigurationData,
    ) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        require_keys_eq!(
            ctx.accounts.signer.key(),
            boring_account.owner,
            CustomError::Unauthorized
        );

        // Update the sol target
        boring_account.config_hash = config.compute_hash();
        msg!("SolTarget updated to: {}", config.target_program);
        // TODO can emit everything else too.
        Ok(())
    }

    pub fn transfer_remote(
        ctx: Context<TransferRemoteContext>,
        amount_or_id: [u8; 32],
    ) -> Result<()> {
        let boring_account = &mut ctx.accounts.boring_account;
        // Verify strategist
        require_keys_eq!(
            ctx.accounts.signer.key(),
            boring_account.strategist,
            CustomError::Unauthorized
        );

        // Verify configuration matches stored hash
        let config = ConfigurationData {
            target_program: ctx.accounts.target_program.key(),
            noop: ctx.accounts.noop.key(),
            token_pda: ctx.accounts.token_pda.key(),
            mailbox_program: ctx.accounts.mailbox_program.key(),
            mailbox_outbox: ctx.accounts.mailbox_outbox.key(),
            message_dispatch_authority: ctx.accounts.message_dispatch_authority.key(),
            igb_program: ctx.accounts.igb_program.key(),
            igb_program_data: ctx.accounts.igb_program_data.key(),
            igb_account: ctx.accounts.igb_account.key(),
            token_sender: ctx.accounts.token_sender.key(),
            token_2022_program: ctx.accounts.token_2022.key(),
            mint_auth: ctx.accounts.mint_auth.key(),
            token_sender_associated: ctx.accounts.token_sender_associated.key(),
        };

        require!(
            config.compute_hash() == boring_account.config_hash,
            CustomError::InvalidConfiguration
        );

        // Prepare the TransferRemote data
        let transfer_data = TransferRemote {
            destination_domain: boring_account.destination_domain,
            recipient: boring_account.evm_target,
            amount_or_id: amount_or_id,
        };

        // Serialize the TransferRemote data
        let mut data = vec![1, 1, 1, 1, 1, 1, 1, 1, 1]; // Looking at test TXs the instruction header for `transfer_remote` is 0x010101010101010101
        data.extend(transfer_data.try_to_vec()?); // Serialize with Borsh

        // Construct the required accounts for the CPI
        let account_metas = vec![
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.noop.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_pda.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mailbox_program.key(), false),
            AccountMeta::new(ctx.accounts.mailbox_outbox.key(), false),
            AccountMeta::new_readonly(ctx.accounts.message_dispatch_authority.key(), false),
            AccountMeta::new(ctx.accounts.boring_account.key(), true),
            AccountMeta::new_readonly(ctx.accounts.unique_message.key(), true),
            AccountMeta::new(ctx.accounts.message_storage_pda.key(), false),
            AccountMeta::new_readonly(ctx.accounts.igb_program.key(), false),
            AccountMeta::new(ctx.accounts.igb_program_data.key(), false),
            AccountMeta::new(ctx.accounts.gas_payment_pda.key(), false),
            AccountMeta::new_readonly(ctx.accounts.igb_account.key(), false),
            AccountMeta::new(ctx.accounts.token_sender.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_2022.key(), false),
            AccountMeta::new(ctx.accounts.mint_auth.key(), false),
            AccountMeta::new(ctx.accounts.token_sender_associated.key(), false),
        ];

        // Create the instruction
        let instruction = Instruction {
            program_id: ctx.accounts.target_program.key(),
            accounts: account_metas,
            data, // Serialized data
        };

        // Invoke the instruction
        // Might need to be an invoked signed? Since the last thing I pass in is the token PDA this program would own
        invoke(
            &instruction,
            &[
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.noop.to_account_info(),
                ctx.accounts.token_pda.to_account_info(),
                ctx.accounts.mailbox_program.to_account_info(),
                ctx.accounts.mailbox_outbox.to_account_info(),
                ctx.accounts.message_dispatch_authority.to_account_info(),
                ctx.accounts.boring_account.to_account_info(),
                ctx.accounts.unique_message.to_account_info(),
                ctx.accounts.message_storage_pda.to_account_info(),
                ctx.accounts.igb_program.to_account_info(),
                ctx.accounts.igb_program_data.to_account_info(),
                ctx.accounts.gas_payment_pda.to_account_info(),
                ctx.accounts.igb_account.to_account_info(),
                ctx.accounts.token_sender.to_account_info(),
                ctx.accounts.token_2022.to_account_info(),
                ctx.accounts.mint_auth.to_account_info(),
                ctx.accounts.token_sender_associated.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = 8 + 32 + 32 + 32 + 4 + 32)]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>, // Only needed when creating or initializing an account.
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut)]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateStrategist<'info> {
    #[account(mut)]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfiguration<'info> {
    #[account(mut)]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferRemoteContext<'info> {
    #[account(
        mut,
        signer,
        constraint = boring_account.owner == *__program_id
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
    /// Taret program
    #[account()]
    /// CHECK: Checked in config hash
    pub target_program: AccountInfo<'info>,
    /// System Program account
    pub system_program: Program<'info, System>,
    /// NOOP
    #[account()]
    /// CHECK: Checked in config hash
    pub noop: AccountInfo<'info>,
    /// Token PDA owned by program_target
    #[account()]
    /// CHECK: Checked in config hash
    pub token_pda: AccountInfo<'info>,
    /// Mailbox Program
    #[account()]
    /// CHECK: Checked in config hash
    pub mailbox_program: AccountInfo<'info>,
    /// Mailbox Outbox
    #[account()]
    /// CHECK: Checked in config hash
    pub mailbox_outbox: AccountInfo<'info>,
    /// Message Dispatch Authority
    #[account()]
    /// CHECK: Checked in config hash
    pub message_dispatch_authority: AccountInfo<'info>,
    /// Unique message / gas payment account
    #[account(mut, signer)]
    /// CHECK: This is the gas payment account
    pub unique_message: AccountInfo<'info>,
    /// Message storage PDA
    #[account(mut)]
    /// CHECK: This is the message storage PDA
    pub message_storage_pda: AccountInfo<'info>,
    /// IGB Program
    #[account()]
    /// CHECK: Checked in config hash
    pub igb_program: AccountInfo<'info>,
    /// IGB Program Data
    #[account()]
    /// CHECK: Checked in config hash
    pub igb_program_data: AccountInfo<'info>,
    /// Gas payment PDA
    #[account(mut)]
    /// CHECK: not needed
    pub gas_payment_pda: AccountInfo<'info>,
    /// IGB Account
    #[account()]
    /// CHECK: Checked in config hash
    pub igb_account: AccountInfo<'info>,
    /// Token Sender
    #[account()]
    /// CHECK: Checked in config hash
    pub token_sender: AccountInfo<'info>,
    /// Token 2022
    #[account()]
    /// CHECK: Checked in config hash
    pub token_2022: AccountInfo<'info>,
    /// Mint Authority
    #[account(owner = token_2022.key())]
    /// CHECK: Checked in config hash
    pub mint_auth: AccountInfo<'info>,
    /// Token Sender Associated Account
    // #[account(mut,
    // seeds = [b"token_sender", boring_account.key().as_ref()], // TODO not sure if token_sender is right
    // bump,
    // owner = token_2022.key()
    // )]
    #[account()]
    /// CHECK: Checked in config hash
    pub token_sender_associated: AccountInfo<'info>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TransferRemote {
    pub destination_domain: u32,
    pub recipient: [u8; 32],    // H256
    pub amount_or_id: [u8; 32], // U256, serialized as a byte array
}

// Helper struct for configuration data
#[derive(AnchorSerialize, AnchorDeserialize)] // Add this derive to enable serialization
pub struct ConfigurationData {
    target_program: Pubkey,
    noop: Pubkey,
    token_pda: Pubkey,
    mailbox_program: Pubkey,
    mailbox_outbox: Pubkey,
    message_dispatch_authority: Pubkey,
    igb_program: Pubkey,
    igb_program_data: Pubkey,
    igb_account: Pubkey,
    token_sender: Pubkey,
    token_2022_program: Pubkey,
    mint_auth: Pubkey,
    token_sender_associated: Pubkey,
}

impl ConfigurationData {
    fn compute_hash(&self) -> [u8; 32] {
        let mut data = Vec::new();
        self.serialize(&mut data).unwrap();
        hash(&data).to_bytes()
    }
}

#[account]
pub struct BoringState {
    owner: Pubkey,
    strategist: Pubkey,
    config_hash: [u8; 32],
    destination_domain: u32,
    evm_target: [u8; 32],
}

// Errors
#[error_code]
pub enum CustomError {
    #[msg("OnlyOwner")]
    Unauthorized,
    #[msg("ReInitialized")]
    AlreadyInitialized,
    #[msg("Invalid Configuration")]
    InvalidConfiguration,
}
