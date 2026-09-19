import { keccak256, toBytes } from 'viem'
import { pyLen, pyStrip } from './pystrip'

/**
 * Local, dependency-free reimplementation of the contract's content-addressed
 * identifiers.
 *
 * These MUST stay byte-identical to CommitmentTestability.py:
 *
 *   _agreement_id_for(creator, name):
 *     Keccak256("COMMITMENT_TESTABILITY:AGREEMENT:V1|" + creator.lower()
 *               + "|" + len(name) + "|" + name)
 *
 *   _commitment_id_for(agreement_id, text):
 *     Keccak256("COMMITMENT_TESTABILITY:COMMITMENT:V1|" + agreement_id
 *               + "|" + len(text) + "|" + text)
 *
 * Both contract helpers hash the CLEANED value (name/text use Python strip()
 * and the creator address is lowercased). This module performs that cleaning.
 *
 * Verified against real on-chain data: agreement
 * 9b6fe8ca…364050 + the vague demo text reproduces the observed commitment id
 * 857a605cbf8ca30bde1f0406fefc14f759fb0b9b33c6f3a0f5ab088edad1bc30.
 */

const AGREEMENT_DOMAIN = 'COMMITMENT_TESTABILITY:AGREEMENT:V1'
const COMMITMENT_DOMAIN = 'COMMITMENT_TESTABILITY:COMMITMENT:V1'

/** Contract-side limits, mirrored so the UI fails fast instead of burning an RPC round-trip. */
export const MAX_NAME_LENGTH = 80
export const MAX_TEXT_LENGTH = 1200

const RESERVED_FENCES = ['<UNTRUSTED_COMMITMENT_TEXT>', '</UNTRUSTED_COMMITMENT_TEXT>']
const RESERVED_VERDICTS = ['COMMITMENT_TESTABLE', 'COMMITMENT_NO_FAILURE_STATE']

function hashUtf8(payload: string): string {
  return keccak256(toBytes(payload)).slice(2)
}

export function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

export function isIdLike(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value.trim().toLowerCase())
}

/** Mirrors _clean_name. Throws the same class of message the contract would. */
export function cleanName(name: string): string {
  const cleaned = pyStrip(name)
  if (pyLen(cleaned) === 0) throw new Error('Agreement name cannot be empty')
  if (pyLen(cleaned) > MAX_NAME_LENGTH) throw new Error('Agreement name is too long')
  return cleaned
}

/** Mirrors _clean_commitment_text, including the pre-nondet reject rules. */
export function cleanCommitmentText(text: string): string {
  const cleaned = pyStrip(text)
  if (pyLen(cleaned) === 0) throw new Error('Commitment text cannot be empty')
  if (pyLen(cleaned) > MAX_TEXT_LENGTH) throw new Error('Commitment text is too long')
  const upper = cleaned.toUpperCase()
  if (RESERVED_FENCES.some((fence) => upper.includes(fence))) {
    throw new Error('Commitment text contains a reserved prompt fence')
  }
  if (RESERVED_VERDICTS.some((verdict) => upper.includes(verdict))) {
    throw new Error('Commitment text contains a reserved verdict label')
  }
  return cleaned
}

export function agreementIdOf(creator: string, name: string): string {
  if (!isAddressLike(creator)) throw new Error('Invalid creator address')
  const clean = cleanName(name)
  return hashUtf8(`${AGREEMENT_DOMAIN}|${creator.trim().toLowerCase()}|${pyLen(clean)}|${clean}`)
}

export function commitmentIdOf(agreementId: string, text: string): string {
  const id = agreementId.trim().toLowerCase()
  if (!isIdLike(id)) throw new Error('Invalid agreement id')
  const clean = cleanCommitmentText(text)
  return hashUtf8(`${COMMITMENT_DOMAIN}|${id}|${pyLen(clean)}|${clean}`)
}
