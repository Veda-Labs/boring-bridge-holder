use anchor_lang::prelude::*;

#[event]
pub struct Initialized {
    pub boring_account: Pubkey,
    pub creator: Pubkey,
    pub bump: u8,
    pub owner: Pubkey,
    pub strategist: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct StrategistUpdated {
    pub old_strategist: Pubkey,
    pub new_strategist: Pubkey,
}

#[event]
pub struct ConfigurationUpdated {
    pub config_hash: [u8; 32],
    pub target_program: Pubkey,
    pub noop: Pubkey,
    pub token_pda: Pubkey,
    pub mailbox_program: Pubkey,
    pub mailbox_outbox: Pubkey,
    pub message_dispatch_authority: Pubkey,
    pub igp_program: Pubkey,
    pub igp_program_data: Pubkey,
    pub igp_account: Pubkey,
    pub token_sender: Pubkey,
    pub token_2022_program: Pubkey,
    pub mint_auth: Pubkey,
    pub destination_domain: u32,
    pub evm_recipient: [u8; 32],
    pub decimals: u8,
}

#[event]
pub struct TransferRemote {
    pub destination_domain: u32,
    pub evm_recipient: [u8; 32],
    pub amount: u64,
}
