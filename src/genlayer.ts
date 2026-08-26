import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { getAddress } from 'viem'
import { agreementIdOf, commitmentIdOf } from './ids'
import {
  CONTRACT_ADDRESS,
  EXPLORER_BASE,
  READ_RPC,
  STUDIO_WALLET_RPC,
  STUDIONET_CHAIN_HEX,
  STUDIONET_CHAIN_ID,
} from './config'
import type { Address, AgreementState, AttemptItem, CommitmentState, ContractConfig } from './types'

const readChain = {
  ...studionet,
  rpcUrls: {
    ...studionet.rpcUrls,
    default: {
      ...studionet.rpcUrls.default,
      http: [READ_RPC],
    },
  },
} as typeof studionet

const readClient = createClient({ chain: readChain } as any)

export function normalizeAddress(address: string): Address {
  return getAddress(address) as Address
}

function provider() {
  if (!window.ethereum) {
    throw new Error('No browser wallet detected. Install MetaMask or a compatible wallet.')
  }
  return window.ethereum
}

function walletCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  const raw = (error as { code?: unknown }).code
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function chainNumber(value: unknown): number {
  return typeof value === 'string' ? Number.parseInt(value, 16) : 0
}

export async function getChainId(): Promise<number> {
  if (!window.ethereum) return 0
  return chainNumber(await window.ethereum.request({ method: 'eth_chainId' }))
}

export async function ensureStudioChain(): Promise<void> {
  const ethereum = provider()
  const current = await getChainId()
  if (current === STUDIONET_CHAIN_ID) return

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    })
    return
  } catch (error) {
    if (walletCode(error) === 4001) throw new Error('Network switch was rejected.')
    if (walletCode(error) !== 4902) throw error
  }

  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: STUDIONET_CHAIN_HEX,
        chainName: studionet.name || 'GenLayer Studio Network',
        rpcUrls: [STUDIO_WALLET_RPC],
        nativeCurrency: {
          name: studionet.nativeCurrency?.name || 'GEN Token',
          symbol: studionet.nativeCurrency?.symbol || 'GEN',
          decimals: studionet.nativeCurrency?.decimals ?? 18,
        },
        blockExplorerUrls: [EXPLORER_BASE],
      },
    ],
  })

  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: STUDIONET_CHAIN_HEX }],
  })
}

export async function connectWallet(): Promise<{ address: Address; warning?: string }> {
  const ethereum = provider()
  const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts?.[0]) throw new Error('Wallet connection was not approved.')

  const address = normalizeAddress(accounts[0])
  let warning: string | undefined

  try {
    await ensureStudioChain()
  } catch (error) {
    warning = error instanceof Error ? error.message : 'Connected wallet, but could not switch network.'
  }

  return { address, warning }
}

export async function getAuthorizedWallet(): Promise<Address | null> {
  if (!window.ethereum) return null
  const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[]
  return accounts?.[0] ? normalizeAddress(accounts[0]) : null
}

export async function disconnectWallet(): Promise<{ revoked: boolean }> {
  const ethereum = provider()

  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
    return { revoked: true }
  } catch (error) {
    const code = walletCode(error)

    // Some EIP-1193 wallets do not implement wallet_revokePermissions.
    // The UI still clears its local session; the caller can show a precise warning.
    if (code === -32601 || code === 4200 || code === 4100) {
      return { revoked: false }
    }

    // MetaMask/provider implementations can also return an "unsupported method"
    // message without a stable numeric code.
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase()

    if (
      message.includes('not supported') ||
      message.includes('unsupported') ||
      message.includes('method not found') ||
      message.includes('wallet_revokepermissions')
    ) {
      return { revoked: false }
    }

    throw error
  }
}

export function subscribeWalletEvents(handlers: {
  onAccountsChanged?: (accounts: Address[]) => void
  onChainChanged?: (chainId: number) => void
}) {
  const ethereum = window.ethereum
  if (!ethereum?.on) return () => undefined

  const accountsHandler = (accounts: string[]) => {
    handlers.onAccountsChanged?.((accounts || []).map(normalizeAddress))
  }
  const chainHandler = (hex: string) => handlers.onChainChanged?.(chainNumber(hex))

  ethereum.on('accountsChanged', accountsHandler)
  ethereum.on('chainChanged', chainHandler)

  return () => {
    ethereum.removeListener?.('accountsChanged', accountsHandler)
    ethereum.removeListener?.('chainChanged', chainHandler)
  }
}

function writeClient(account: Address) {
  return createClient({
    chain: readChain,
    account,
    provider: provider() as any,
  } as any)
}

async function write(account: Address, functionName: string, args: unknown[]) {
  await ensureStudioChain()
  const client = writeClient(account)
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  } as any)

  // Intentionally no receipt polling in the browser. Once a hash exists, the
  // transaction is submitted; state confirmation happens through bounded reads.
  return { hash: String(hash) }
}

function parseMaybeJson<T>(value: unknown): T {
  if (typeof value !== 'string') return value as T
  let current: unknown = value
  for (let i = 0; i < 2 && typeof current === 'string'; i += 1) {
    const text = current.trim()
    try {
      current = JSON.parse(text)
    } catch {
      return current as T
    }
  }
  return current as T
}

function unwrapString(value: unknown): string {
  const parsed = parseMaybeJson<unknown>(value)
  return typeof parsed === 'string' ? parsed : String(parsed ?? '')
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const result = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: 'accepted',
  } as any)
  return parseMaybeJson<T>(result)
}

export const createAgreement = (account: Address, name: string, promisee: string) =>
  write(account, 'create_agreement', [name, normalizeAddress(promisee)])

export const submitCommitment = (account: Address, agreementId: string, text: string) =>
  write(account, 'submit_commitment', [agreementId, text])

export const bindAgreement = (account: Address, agreementId: string) =>
  write(account, 'bind_agreement', [agreementId])

// Identifiers are computed LOCALLY, not through gen_call.
//
// Both ids are pure keccak256 over a fixed domain-separated payload, so the
// client can derive them with zero RPC. This removes the only oversized read
// the app ever issued: compute_commitment_id(agreement_id, text) carried the
// full commitment text (272 bytes of GenLayer calldata for the 160-character
// positive demo text), while every other read carries < 100 bytes.
//
// It also removes a round-trip before every submit and any chance of reading
// an id that disagrees with what the write will produce.
export const computeAgreementId = (creator: string, name: string) =>
  agreementIdOf(normalizeAddress(creator), name)

export const computeCommitmentId = (agreementId: string, text: string) =>
  commitmentIdOf(agreementId, text)

export const getAgreement = (agreementId: string) =>
  read<AgreementState>('get_agreement', [agreementId])

export const getCommitment = (commitmentId: string) =>
  read<CommitmentState>('get_commitment', [commitmentId])

export const getAttemptLog = (agreementId: string, offset = 0, limit = 50) =>
  read<AttemptItem[]>('get_attempt_log', [agreementId, offset, limit])

export const getConfig = () => read<ContractConfig>('get_config', [])
export const getRubric = async () => unwrapString(await read<string>('get_rubric', []))

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`

export async function existsAgreement(agreementId: string) {
  try {
    return await getAgreement(agreementId)
  } catch {
    return null
  }
}

export async function existsCommitment(commitmentId: string) {
  try {
    return await getCommitment(commitmentId)
  } catch {
    return null
  }
}

export async function waitForStateChange<T>({
  readState,
  accept,
  attempts = 30,
  intervalMs = 5000,
}: {
  readState: () => Promise<T>
  accept: (value: T) => boolean
  attempts?: number
  intervalMs?: number
}): Promise<T | null> {
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs))
    try {
      const value = await readState()
      if (accept(value)) return value
    } catch {
      // State may not exist yet while the submitted transaction is finalizing.
    }
  }
  return null
}
