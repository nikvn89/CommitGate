/**
 * CommitGate — StudioNet payload probe.
 *
 * Isolates WHERE the "RLP string ends with N superfluous bytes" failure happens,
 * without MetaMask, without the browser, without signing anything.
 *
 *   node tools/probe-studio.mjs <agreement_id_hex>
 *
 * It sends, straight to https://studio.genlayer.com/api :
 *   1. gen_call (READ)  compute_commitment_id  — vague text, then positive text
 *   2. gen_call (READ)  get_agreement          — control, tiny payload
 *   3. eth_estimateGas  addTransaction(...)    — the exact WRITE calldata, unsigned
 *
 * Read the output like this:
 *   - vague READ ok + positive READ fails  -> the failure is the gen_call READ path
 *     (the fix in src/ids.ts removes that call entirely)
 *   - both READs ok + positive estimateGas fails -> the failure is the WRITE payload
 *   - everything ok here but the browser still fails -> the failure is MetaMask or
 *     the /api/rpc proxy, not StudioNet
 */
import { abi } from 'genlayer-js'
import { encodeFunctionData } from 'viem'

const RPC = process.env.STUDIO_RPC || 'https://studio.genlayer.com/api'
const CONTRACT = process.env.CONTRACT || '0xe8999d51e91B8b7Ee82CeF530B1620236B84828F'
const CONSENSUS = '0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575'
const FROM = process.env.FROM || '0x0000000000000000000000000000000000000000'
const AGREEMENT_ID = (process.argv[2] || '').trim().toLowerCase()

if (!/^[a-f0-9]{64}$/.test(AGREEMENT_ID)) {
  console.error('usage: node tools/probe-studio.mjs <agreement_id_hex(64 chars, no 0x)>')
  process.exit(1)
}

const VAGUE = 'The operator will respond to incidents in the manner warranted by operational needs.'
const POSITIVE =
  'The operator must publish a post-incident report containing root cause, customer impact and corrective actions within five business days after incident closure.'

const ADD_TRANSACTION_ABI_V5 = [{
  type: 'function', name: 'addTransaction', stateMutability: 'nonpayable',
  inputs: [
    { name: '_sender', type: 'address' }, { name: '_recipient', type: 'address' },
    { name: '_numOfInitialValidators', type: 'uint256' }, { name: '_maxRotations', type: 'uint256' },
    { name: '_txData', type: 'bytes' },
  ], outputs: [],
}]

const payloadFor = (method, args) =>
  abi.transactions.serialize([abi.calldata.encode({ method, args }), false])

const byteLen = (hex) => (hex.length - 2) / 2

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
  return json
}

function report(label, payloadHex, json) {
  const n = byteLen(payloadHex)
  const head = payloadHex.slice(0, 10)
  const form = n > 255 ? '2-byte length form (0xf9/0xb9)' : '1-byte length form (0xf8/0xb8)'
  const err = json?.error
  console.log(`\n${label}`)
  console.log(`  payload   ${n} bytes | head ${head} | ${form}`)
  console.log(err ? `  RESULT    FAIL  ${err.code ?? ''} ${err.message ?? JSON.stringify(err)}`
                  : `  RESULT    OK    ${JSON.stringify(json.result).slice(0, 80)}`)
}

const genCall = (data) =>
  rpc('gen_call', [{ type: 'read', to: CONTRACT, from: FROM, data, transaction_hash_variant: 'latest-nonfinal' }])

console.log(`RPC       ${RPC}`)
console.log(`contract  ${CONTRACT}`)
console.log(`agreement ${AGREEMENT_ID}`)

// 1. control read, tiny payload
{
  const p = payloadFor('get_agreement', [AGREEMENT_ID])
  report('READ  get_agreement (control)', p, await genCall(p))
}

// 2. the two reads that differ only in text length
for (const [label, text] of [['vague', VAGUE], ['positive', POSITIVE]]) {
  const p = payloadFor('compute_commitment_id', [AGREEMENT_ID, text])
  report(`READ  compute_commitment_id (${label}, ${text.length} chars)`, p, await genCall(p))
}

// 3. the write calldata, unsigned - eth_estimateGas executes the same decode path
for (const [label, text] of [['vague', VAGUE], ['positive', POSITIVE]]) {
  const p = payloadFor('submit_commitment', [AGREEMENT_ID, text])
  const data = encodeFunctionData({
    abi: ADD_TRANSACTION_ABI_V5, functionName: 'addTransaction',
    args: [FROM, CONTRACT, 5n, 3n, p],
  })
  const json = await rpc('eth_estimateGas', [{ from: FROM, to: CONSENSUS, data, value: '0x0' }])
  report(`WRITE submit_commitment via estimateGas (${label}, ${text.length} chars)`, p, json)
}

console.log('\nThreshold: submit_commitment crosses 255 bytes at 150 chars of text;')
console.log('compute_commitment_id crosses at 146 chars. The vague demo text is 84,')
console.log('the positive demo text is 160.')
