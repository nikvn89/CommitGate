const DEFAULT_CONTRACT = '0xe8999d51e91B8b7Ee82CeF530B1620236B84828F' as const

function validAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value))
}

export const CONTRACT_ADDRESS = validAddress(import.meta.env.VITE_CONTRACT_ADDRESS)
  ? import.meta.env.VITE_CONTRACT_ADDRESS
  : DEFAULT_CONTRACT

export const READ_RPC = (import.meta.env.VITE_READ_RPC || '/api/rpc').trim()
export const STUDIO_WALLET_RPC = 'https://studio.genlayer.com/api'
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'
export const CONTRACT_EXPLORER = `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`
export const STUDIONET_CHAIN_ID = 61999
export const STUDIONET_CHAIN_HEX = '0xf22f'
