use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_2022;
use borsh::BorshSerialize;

use crate::{ConfigurationData, CustomError, TransferRemote, TransferRemoteContext};

/// Verifies the configuration hash by hashing all inputs and comparing
/// the result to the stored configuration hash
pub fn verify_configuration<'info>(
    accounts: &TransferRemoteContext<'info>,
    destination_domain: u32,
    evm_recipient: [u8; 32],
    decimals: u8,
) -> Result<()> {
    let config = ConfigurationData {
        target_program: accounts.target_program.key(),
        noop: accounts.noop.key(),
        token_pda: accounts.token_pda.key(),
        mailbox_program: accounts.mailbox_program.key(),
        mailbox_outbox: accounts.mailbox_outbox.key(),
        message_dispatch_authority: accounts.message_dispatch_authority.key(),
        igp_program: accounts.igp_program.key(),
        igp_program_data: accounts.igp_program_data.key(),
        igp_account: accounts.igp_account.key(),
        token_sender: accounts.token_sender.key(),
        token_2022_program: accounts.token_2022.key(),
        mint_auth: accounts.mint_auth.key(),
        destination_domain,
        evm_recipient,
        decimals,
    };

    require!(
        config.compute_hash() == accounts.boring_account.config_hash,
        CustomError::InvalidConfiguration
    );
    Ok(())
}

/// Transfers tokens to the strategist
pub fn transfer_tokens_to_strategist<'info>(
    accounts: &TransferRemoteContext<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let bump_bytes = &[accounts.boring_account.bump];
    let seeds = &[
        b"boring_state" as &[u8],
        accounts.boring_account.creator.as_ref(),
        bump_bytes,
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_cpi_context = CpiContext::new_with_signer(
        accounts.token_2022.to_account_info(),
        token_2022::TransferChecked {
            from: accounts.boring_account_ata.to_account_info(),
            to: accounts.strategist_ata.to_account_info(),
            authority: accounts.boring_account.to_account_info(),
            mint: accounts.mint_auth.to_account_info(),
        },
        signer_seeds,
    );
    token_2022::transfer_checked(transfer_cpi_context, amount, decimals)
}

/// Executes the transfer remote instruction
pub fn execute_transfer_remote<'info>(
    accounts: &TransferRemoteContext<'info>,
    destination_domain: u32,
    evm_recipient: [u8; 32],
    amount: u64,
) -> Result<()> {
    let mut data;
    {
        let mut amount_or_id = [0u8; 32];
        amount_or_id[..8].copy_from_slice(&amount.to_le_bytes());

        let transfer_data = TransferRemote {
            destination_domain,
            recipient: evm_recipient,
            amount_or_id,
        };

        // First 8 bytes represent the `PROGRAM_INSTRUCTION_DISCRIMINATOR`, final byte indicates
        // the instruction type of `transfer_remote`.
        data = vec![1, 1, 1, 1, 1, 1, 1, 1, 1];
        data.extend(transfer_data.try_to_vec()?);
    }

    let account_metas = create_account_metas(accounts);
    let instruction = Instruction {
        program_id: accounts.target_program.key(),
        accounts: account_metas,
        data,
    };

    Ok(invoke(&instruction, &create_account_infos(accounts))?)
}

/// Creates the account metas for the transfer remote instruction
fn create_account_metas<'info>(accounts: &TransferRemoteContext) -> Vec<AccountMeta> {
    let mut metas = Vec::with_capacity(17);
    metas.push(AccountMeta::new_readonly(
        accounts.system_program.key(),
        false,
    ));
    metas.push(AccountMeta::new_readonly(accounts.noop.key(), false));
    metas.push(AccountMeta::new_readonly(accounts.token_pda.key(), false));
    metas.push(AccountMeta::new_readonly(
        accounts.mailbox_program.key(),
        false,
    ));
    metas.push(AccountMeta::new(accounts.mailbox_outbox.key(), false));
    metas.push(AccountMeta::new_readonly(
        accounts.message_dispatch_authority.key(),
        false,
    ));
    metas.push(AccountMeta::new(accounts.signer.key(), true));
    metas.push(AccountMeta::new_readonly(
        accounts.unique_message.key(),
        true,
    ));
    metas.push(AccountMeta::new(accounts.message_storage_pda.key(), false));
    metas.push(AccountMeta::new_readonly(accounts.igp_program.key(), false));
    metas.push(AccountMeta::new(accounts.igp_program_data.key(), false));
    metas.push(AccountMeta::new(accounts.gas_payment_pda.key(), false));
    metas.push(AccountMeta::new_readonly(accounts.igp_account.key(), false));
    metas.push(AccountMeta::new(accounts.token_sender.key(), false));
    metas.push(AccountMeta::new_readonly(accounts.token_2022.key(), false));
    metas.push(AccountMeta::new(accounts.mint_auth.key(), false));
    metas.push(AccountMeta::new(accounts.strategist_ata.key(), false));
    metas
}

/// Creates the account infos for the transfer remote instruction
fn create_account_infos<'info>(accounts: &TransferRemoteContext<'info>) -> Vec<AccountInfo<'info>> {
    let mut infos = Vec::with_capacity(17);
    // 0.  `[executable]` The system program.
    infos.push(accounts.system_program.to_account_info());

    // 1.  `[executable]` The spl_noop program.
    infos.push(accounts.noop.to_account_info());

    // 2.  `[]` The token PDA account.
    infos.push(accounts.token_pda.to_account_info());

    // 3.  `[executable]` The mailbox program.
    infos.push(accounts.mailbox_program.to_account_info());

    // 4.  `[writeable]` The mailbox outbox account.
    infos.push(accounts.mailbox_outbox.to_account_info());

    // 5.  `[]` Message dispatch authority.
    infos.push(accounts.message_dispatch_authority.to_account_info());

    // 6.  `[signer]` The token sender and mailbox payer.
    infos.push(accounts.signer.to_account_info());

    // 7.  `[signer]` Unique message / gas payment account.
    infos.push(accounts.unique_message.to_account_info());

    // 8.  `[writeable]` Message storage PDA.
    infos.push(accounts.message_storage_pda.to_account_info());

    //     ---- If using an IGP ----
    // 9.  `[executable]` The IGP program.
    infos.push(accounts.igp_program.to_account_info());

    // 10. `[writeable]` The IGP program data.
    infos.push(accounts.igp_program_data.to_account_info());

    // 11. `[writeable]` Gas payment PDA.
    infos.push(accounts.gas_payment_pda.to_account_info());

    // 12. `[]` OPTIONAL - The Overhead IGP program, if the configured IGP is an Overhead IGP.
    infos.push(accounts.igp_account.to_account_info());

    // 13. `[writeable]` The IGP account.
    infos.push(accounts.token_sender.to_account_info());

    //      ---- End if ----
    // 14. `[executable]` The spl_token_2022 program.
    infos.push(accounts.token_2022.to_account_info());

    // 15. `[writeable]` The mint / mint authority PDA account.
    infos.push(accounts.mint_auth.to_account_info());

    // 16. `[writeable]` The token sender's associated token account, from which tokens will be burned.
    infos.push(accounts.strategist_ata.to_account_info());

    infos
}
