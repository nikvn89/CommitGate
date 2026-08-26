export type Address = `0x${string}`

export type AgreementState = {
  agreement_id: string
  creator: string
  name: string
  promisee: string
  attached_count: number
  submitted_count: number
  bound: boolean
  state: 'OPEN' | 'BOUND' | string
}

export type CommitmentState = {
  commitment_id: string
  agreement_id: string
  text: string
  status: number
  verdict: 'COMMITMENT_TESTABLE' | 'COMMITMENT_NO_FAILURE_STATE' | string
  active: boolean
}

export type AttemptItem = {
  attempt_number: number
  commitment_id: string
  verdict: string
  active: boolean
}

export type ContractConfig = {
  name: string
  version: string
  semantic_verdicts: string[]
  max_name_length: number
  max_text_length: number
  max_submissions_per_agreement: number
  max_page_size: number
  global_admin: boolean
  clock_used: boolean
  external_web_used: boolean
  rubric_hash: string
}

export type TxPhase = 'idle' | 'signing' | 'submitted' | 'confirmed' | 'pending' | 'error'

export type TxState = {
  phase: TxPhase
  label?: string
  hash?: string
  message?: string
}
