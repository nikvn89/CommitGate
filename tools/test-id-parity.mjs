import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { keccak256, toBytes } from 'viem'

const AGREEMENT_DOMAIN = 'COMMITMENT_TESTABILITY:AGREEMENT:V1'
const COMMITMENT_DOMAIN = 'COMMITMENT_TESTABILITY:COMMITMENT:V1'
const CREATOR = '0x6276095FAEA15108740445ff277fdA8c304657F4'
const REAL_AGREEMENT = '9b6fe8cafa5d901438a83d81bcb99c2870a6ac0eea80163f220289239d364050'
const REAL_TEXT = 'The operator will respond to incidents in the manner warranted by operational needs.'
const REAL_COMMITMENT = '857a605cbf8ca30bde1f0406fefc14f759fb0b9b33c6f3a0f5ab088edad1bc30'

// Independent Python-compatible reference. Do not import src/pystrip.ts here:
// the test must catch a regression in the production implementation itself.
const PY_SPACE_REFERENCE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d,
  0x001c, 0x001d, 0x001e, 0x001f,
  0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
])

function referenceStrip(value) {
  const chars = Array.from(value)
  let start = 0
  let end = chars.length
  while (start < end && PY_SPACE_REFERENCE.has(chars[start].codePointAt(0))) start += 1
  while (end > start && PY_SPACE_REFERENCE.has(chars[end - 1].codePointAt(0))) end -= 1
  return chars.slice(start, end).join('')
}

const referenceLen = (value) => Array.from(value).length
const hash = (value) => keccak256(toBytes(value)).slice(2)

function referenceAgreementId(creator, name) {
  const clean = referenceStrip(name)
  return hash(`${AGREEMENT_DOMAIN}|${creator.trim().toLowerCase()}|${referenceLen(clean)}|${clean}`)
}

function referenceCommitmentId(agreementId, text) {
  const clean = referenceStrip(text)
  return hash(`${COMMITMENT_DOMAIN}|${agreementId.trim().toLowerCase()}|${referenceLen(clean)}|${clean}`)
}

// Deliberately models the pre-fix implementation. The suite reports how many
// cases/assertions would turn red if production regressed to trim()/length.
function legacyAgreementId(creator, name) {
  const clean = name.trim()
  return hash(`${AGREEMENT_DOMAIN}|${creator.trim().toLowerCase()}|${clean.length}|${clean}`)
}

function legacyCommitmentId(agreementId, text) {
  const clean = text.trim()
  return hash(`${COMMITMENT_DOMAIN}|${agreementId.trim().toLowerCase()}|${clean.length}|${clean}`)
}

const cases = [
  { label: 'ASCII', name: '  Hosting SLA  ', text: '  Publish a report in five days.  ' },
  { label: 'emoji outside BMP', name: 'Emoji 😀 SLA', text: 'Publish a 😀 report.' },
  { label: 'extended Han outside BMP', name: 'Han 𠀀 SLA', text: 'Deliver 𠀀 evidence.' },
  { label: 'U+001F prefix', name: '\u001fControl name', text: '\u001fControl text' },
  { label: 'U+0085 suffix', name: 'NEL name\u0085', text: 'NEL text\u0085' },
  { label: 'U+FEFF prefix', name: '\ufeffBOM name', text: '\ufeffBOM text' },
  { label: 'U+001C/U+001E edges', name: '\u001cEdge name\u001e', text: '\u001cEdge text\u001e' },
]

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

let passedAssertions = 0
let mutantRedAssertions = 0
let mutantRedCases = 0

try {
  const { agreementIdOf, commitmentIdOf } = await vite.ssrLoadModule('/src/ids.ts')

  for (const item of cases) {
    const expectedAgreement = referenceAgreementId(CREATOR, item.name)
    const expectedCommitment = referenceCommitmentId(expectedAgreement, item.text)
    assert.equal(agreementIdOf(CREATOR, item.name), expectedAgreement, `${item.label}: agreement id`)
    assert.equal(commitmentIdOf(expectedAgreement, item.text), expectedCommitment, `${item.label}: commitment id`)
    passedAssertions += 2

    let caseIsRed = false
    if (legacyAgreementId(CREATOR, item.name) !== expectedAgreement) {
      mutantRedAssertions += 1
      caseIsRed = true
    }
    if (legacyCommitmentId(expectedAgreement, item.text) !== expectedCommitment) {
      mutantRedAssertions += 1
      caseIsRed = true
    }
    if (caseIsRed) mutantRedCases += 1
  }

  assert.equal(commitmentIdOf(REAL_AGREEMENT, REAL_TEXT), REAL_COMMITMENT, 'real on-chain vector')
  passedAssertions += 1
  if (legacyCommitmentId(REAL_AGREEMENT, REAL_TEXT) !== REAL_COMMITMENT) mutantRedAssertions += 1

  assert.ok(mutantRedCases >= 6, 'legacy trim()/length mutant must fail at least six parity cases')
  assert.ok(mutantRedAssertions >= 12, 'legacy trim()/length mutant must fail at least twelve assertions')

  console.log(`PASS: 8 parity cases, ${passedAssertions}/${passedAssertions} production assertions green.`)
  console.log(`MUTATION PROOF: legacy trim()/length is red in ${mutantRedCases}/8 cases (${mutantRedAssertions}/${passedAssertions} ID assertions).`)
  console.log(`ON-CHAIN VECTOR: ${REAL_AGREEMENT.slice(0, 8)}…${REAL_AGREEMENT.slice(-6)} -> ${REAL_COMMITMENT} PASS.`)
} finally {
  await vite.close()
}
