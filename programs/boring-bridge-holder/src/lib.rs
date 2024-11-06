use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::TokenAccount;
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::hash::hash;
use solana_program::pubkey::Pubkey;

pub mod instructions;
use crate::instructions::transfer_remote;

pub mod events;
use crate::events::*;

declare_id!("AWzzXzsLQvddsYdphCV6CTcr5ALXtg8AAtZXTqbUcVBF");

/// Checks that the signer is the same as the authorized key
///
/// # Arguments
/// * `signer` - The public key of the signer
/// * `allowed` - The public key of the allowed caller
///
/// # Returns
/// * `Result<()>` - Result indicating success or containing an error
fn requires_auth(signer: Pubkey, allowed: Pubkey) -> Result<()> {
    require_keys_eq!(signer, allowed, CustomError::Unauthorized);
    Ok(())
}

#[program]
mod boring_bridge_holder {
    use super::*;

    /// Initializes a new Boring Bridge Holder account
    ///
    /// # Arguments
    /// * `ctx` - The context of accounts
    /// * `owner` - The public key of the owner who can update configuration
    /// * `strategist` - The public key of the strategist who can execute transfers
    /// * `config` - The initial configuration data
    ///
    /// # Returns
    /// * `Result<()>` - Result indicating success or containing an error
    pub fn initialize(
        ctx: Context<Initialize>,
        owner: Pubkey,
        strategist: Pubkey,
        config: ConfigurationData,
    ) -> Result<()> {
        let boring_account = &mut ctx.accounts.boring_account;

        boring_account.creator = ctx.accounts.signer.key();
        boring_account.owner = owner;
        boring_account.strategist = strategist;
        let config_hash = config.compute_hash();
        boring_account.config_hash = config_hash;
        boring_account.bump = ctx.bumps.boring_account;

        emit!(Initialized {
            boring_account: ctx.accounts.boring_account.key(),
            creator: ctx.accounts.signer.key(),
            bump: ctx.bumps.boring_account,
            owner,
            strategist,
        });

        emit!(ConfigurationUpdated {
            config_hash,
            target_program: config.target_program,
            noop: config.noop,
            token_pda: config.token_pda,
            mailbox_program: config.mailbox_program,
            mailbox_outbox: config.mailbox_outbox,
            message_dispatch_authority: config.message_dispatch_authority,
            igp_program: config.igp_program,
            igp_program_data: config.igp_program_data,
            igp_account: config.igp_account,
            token_sender: config.token_sender,
            token_2022_program: config.token_2022_program,
            mint_auth: config.mint_auth,
            destination_domain: config.destination_domain,
            evm_recipient: config.evm_recipient,
            decimals: config.decimals,
        });

        Ok(())
    }

    /// Transfers ownership of the Boring Bridge Holder to a new owner
    ///
    /// # Arguments
    /// * `ctx` - The context of accounts
    /// * `new_owner` - The public key of the new owner
    ///
    /// # Errors
    /// * `CustomError::Unauthorized` - If the signer is not the current owner
    ///
    /// # Returns
    /// * `Result<()>` - Result indicating success or containing an error
    pub fn transfer_ownership(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        let old_owner = boring_account.owner;
        requires_auth(ctx.accounts.signer.key(), old_owner)?;

        // Update the owner
        boring_account.owner = new_owner;

        emit!(OwnershipTransferred {
            old_owner,
            new_owner,
        });

        Ok(())
    }

    /// Updates the strategist of the Boring Bridge Holder
    ///
    /// # Arguments
    /// * `ctx` - The context of accounts
    /// * `new_strategist` - The public key of the new strategist
    ///
    /// # Errors
    /// * `CustomError::Unauthorized` - If the signer is not the current owner
    ///
    /// # Returns
    /// * `Result<()>` - Result indicating success or containing an error
    pub fn update_strategist(ctx: Context<UpdateOwner>, new_strategist: Pubkey) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        let old_strategist = boring_account.strategist;
        requires_auth(ctx.accounts.signer.key(), boring_account.owner)?;

        // Update the owner
        boring_account.strategist = new_strategist;

        emit!(StrategistUpdated {
            old_strategist,
            new_strategist,
        });

        Ok(())
    }

    /// Updates the configuration of the Boring Bridge Holder
    ///
    /// # Arguments
    /// * `ctx` - The context of accounts
    /// * `config` - The new configuration data
    ///
    /// # Errors
    /// * `CustomError::Unauthorized` - If the signer is not the current owner
    ///
    /// # Returns
    /// * `Result<()>` - Result indicating success or containing an error
    pub fn update_configuration(
        ctx: Context<UpdateOwner>,
        config: ConfigurationData,
    ) -> Result<()> {
        // Check that signer is the current owner
        let boring_account = &mut ctx.accounts.boring_account;
        requires_auth(ctx.accounts.signer.key(), boring_account.owner)?;

        // Update the configuration hash
        boring_account.config_hash = config.compute_hash();

        emit!(ConfigurationUpdated {
            config_hash: boring_account.config_hash,
            target_program: config.target_program,
            noop: config.noop,
            token_pda: config.token_pda,
            mailbox_program: config.mailbox_program,
            mailbox_outbox: config.mailbox_outbox,
            message_dispatch_authority: config.message_dispatch_authority,
            igp_program: config.igp_program,
            igp_program_data: config.igp_program_data,
            igp_account: config.igp_account,
            token_sender: config.token_sender,
            token_2022_program: config.token_2022_program,
            mint_auth: config.mint_auth,
            destination_domain: config.destination_domain,
            evm_recipient: config.evm_recipient,
            decimals: config.decimals,
        });

        Ok(())
    }

    /// Transfers tokens remotely using Hyperlane's infrastructure
    ///
    /// # Arguments
    /// * `ctx` - The context of accounts
    /// * `destination_domain` - The domain ID of the destination chain
    /// * `evm_recipient` - The 32-byte recipient address on the destination chain
    /// * `decimals` - The number of decimals for the token
    /// * `amount` - The amount of tokens to transfer
    ///
    /// # Errors
    /// * `CustomError::Unauthorized` - If the signer is not the strategist
    /// * `CustomError::InvalidConfiguration` - If the provided configuration doesn't match stored hash
    ///
    /// # Returns
    /// * `Result<()>` - Result indicating success or containing an error
    pub fn transfer_remote(
        ctx: Context<TransferRemoteContext>,
        destination_domain: u32,
        evm_recipient: [u8; 32],
        decimals: u8,
        amount: u64,
    ) -> Result<()> {
        // Verify strategist
        msg!(
            "Verifying signer: {} against stored strategist: {}",
            ctx.accounts.signer.key(),
            ctx.accounts.boring_account.strategist
        );
        requires_auth(
            ctx.accounts.signer.key(),
            ctx.accounts.boring_account.strategist,
        )?;

        // Verify configuration matches stored hash
        msg!("Verifying configuration matches stored hash");
        transfer_remote::verify_configuration(
            &ctx.accounts,
            destination_domain,
            evm_recipient,
            decimals,
        )?;

        // Transfer tokens to strategist
        msg!("Transferring tokens to strategist");
        transfer_remote::transfer_tokens_to_strategist(&ctx.accounts, amount, decimals)?;

        // Create and execute the transfer remote instruction
        msg!("Creating and executing transfer remote instruction");
        transfer_remote::execute_transfer_remote(
            &ctx.accounts,
            destination_domain,
            evm_recipient,
            amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 32 + 32 + 32 + 1,
        seeds = [b"boring_state", signer.key().as_ref()],
        bump
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>, // Only needed when creating or initializing an account.
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(
        mut,
        seeds = [b"boring_state", boring_account.creator.as_ref()],
        bump = boring_account.bump,
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateStrategist<'info> {
    #[account(
        mut,
        seeds = [b"boring_state", boring_account.creator.as_ref()],
        bump = boring_account.bump,
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfiguration<'info> {
    #[account(
        mut,
        seeds = [b"boring_state", boring_account.creator.as_ref()],
        bump = boring_account.bump,
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)] // might not be needed
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferRemoteContext<'info> {
    #[account(
        seeds = [b"boring_state", boring_account.creator.as_ref()],
        bump = boring_account.bump,
    )]
    pub boring_account: Account<'info, BoringState>,
    #[account(mut)]
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
    #[account(mut)]
    /// CHECK: Checked in config hash
    pub mailbox_outbox: AccountInfo<'info>,
    /// Message Dispatch Authority
    #[account()]
    /// CHECK: Checked in config hash
    pub message_dispatch_authority: AccountInfo<'info>,
    /// Unique message / gas payment account
    #[account(signer)]
    /// CHECK: Only needs to be a signer
    pub unique_message: AccountInfo<'info>,
    /// Message storage PDA
    #[account(
        mut,
        seeds = [
            b"hyperlane",
            b"-",
            b"dispatched_message",
            b"-",
            unique_message.key().as_ref()
        ],
        bump,
        seeds::program = mailbox_program.key()
    )]
    /// CHECK: Checked against PDA
    pub message_storage_pda: AccountInfo<'info>,
    /// IGP Program
    #[account()]
    /// CHECK: Checked in config hash
    pub igp_program: AccountInfo<'info>,
    /// IGP Program Data
    #[account(mut)]
    /// CHECK: Checked in config hash
    pub igp_program_data: AccountInfo<'info>,
    /// Gas payment PDA
    #[account(
        mut,
        seeds = [
            b"hyperlane_igp",
            b"-",
            b"gas_payment",
            b"-",
            unique_message.key().as_ref()
        ],
        bump,
        seeds::program = igp_program.key()
    )]
    /// CHECK: Checked against PDA
    pub gas_payment_pda: AccountInfo<'info>,
    /// IGP Account
    #[account()]
    /// CHECK: Checked in config hash
    pub igp_account: AccountInfo<'info>,
    /// Token Sender
    #[account(mut)]
    /// CHECK: Checked in config hash
    pub token_sender: AccountInfo<'info>,
    /// Token 2022
    #[account(
        address = anchor_spl::token_2022::ID
    )]
    /// CHECK: Checked in config hash
    pub token_2022: Program<'info, Token2022>,
    /// Mint Authority
    #[account(mut)]
    /// CHECK: Checked in config hash
    pub mint_auth: AccountInfo<'info>,
    /// Boring Account Associated Token Account
    #[account(
        mut,
        associated_token::mint = mint_auth,
        associated_token::authority = boring_account,
        associated_token::token_program = token_2022
    )]
    /// CHECK: Checked against PDA
    pub boring_account_ata: InterfaceAccount<'info, TokenAccount>,
    /// Strategist Associated Token Account
    #[account(
        mut,
        associated_token::mint = mint_auth,
        associated_token::authority = signer,
        associated_token::token_program = token_2022
    )]
    /// CHECK: Checked against PDA
    pub strategist_ata: InterfaceAccount<'info, TokenAccount>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct TransferRemote {
    pub destination_domain: u32,
    pub recipient: [u8; 32],    // H256
    pub amount_or_id: [u8; 32], // U256, serialized as a byte array
}

/// Configuration data for the Boring Bridge Holder
///
/// This struct contains all the necessary addresses and parameters
/// for interacting with Hyperlane's infrastructure
#[derive(AnchorSerialize, AnchorDeserialize)] // Add this derive to enable serialization
pub struct ConfigurationData {
    target_program: Pubkey,
    noop: Pubkey,
    token_pda: Pubkey,
    mailbox_program: Pubkey,
    mailbox_outbox: Pubkey,
    message_dispatch_authority: Pubkey,
    igp_program: Pubkey,
    igp_program_data: Pubkey,
    igp_account: Pubkey,
    token_sender: Pubkey,
    token_2022_program: Pubkey,
    mint_auth: Pubkey,
    destination_domain: u32,
    evm_recipient: [u8; 32],
    decimals: u8,
}

/// Digests the configuration data into a 32-byte hash
impl ConfigurationData {
    fn compute_hash(&self) -> [u8; 32] {
        let mut data = Vec::new();
        self.serialize(&mut data).unwrap();
        hash(&data).to_bytes()
    }
}

/// The state account for the Boring Bridge Holder
#[account]
pub struct BoringState {
    creator: Pubkey,
    owner: Pubkey,
    strategist: Pubkey,
    config_hash: [u8; 32],
    bump: u8,
}

// Errors
#[error_code]
pub enum CustomError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid Configuration")]
    InvalidConfiguration,
}
