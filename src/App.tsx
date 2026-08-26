import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONTRACT_ADDRESS, CONTRACT_EXPLORER, STUDIONET_CHAIN_ID } from './config'
import { normalizeError, reportError } from './errors'
import {
  bindAgreement,
  computeAgreementId,
  computeCommitmentId,
  connectWallet,
  disconnectWallet,
  createAgreement,
  ensureStudioChain,
  existsAgreement,
  existsCommitment,
  explorerTx,
  getAgreement,
  getAttemptLog,
  getAuthorizedWallet,
  getChainId,
  getCommitment,
  getConfig,
  submitCommitment,
  subscribeWalletEvents,
  waitForStateChange,
} from './genlayer'
import { step } from './errors'
import type { Address, AgreementState, AttemptItem, CommitmentState, ContractConfig, TxState } from './types'

const DEMO_VAGUE = 'The operator will respond to incidents in the manner warranted by operational needs.'
const DEMO_TESTABLE =
  'The operator must publish a post-incident report containing root cause, customer impact and corrective actions within five business days after incident closure.'

const lastAgreementKey = (account: string) =>
  `commitgate:last:${CONTRACT_ADDRESS.toLowerCase()}:${account.toLowerCase()}`
const recentKey = (account: string) =>
  `commitgate:recent:${CONTRACT_ADDRESS.toLowerCase()}:${account.toLowerCase()}`

function short(value: string, head = 7, tail = 5) {
  if (!value || value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase())
}

function validId(value: string) {
  return /^[a-fA-F0-9]{64}$/.test(value.trim())
}

function readRecent(account: string | null): string[] {
  if (!account) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey(account)) || '[]')
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && validId(x)).slice(0, 8) : []
  } catch {
    return []
  }
}

function rememberAgreement(account: string | null, id: string) {
  if (!account) return
  localStorage.setItem(lastAgreementKey(account), id)
  const next = [id, ...readRecent(account).filter((x) => x !== id)].slice(0, 8)
  localStorage.setItem(recentKey(account), JSON.stringify(next))
}

function verdictLabel(value: string) {
  if (value === 'COMMITMENT_TESTABLE') return 'TESTABLE'
  if (value === 'COMMITMENT_NO_FAILURE_STATE') return 'NO FAILURE STATE'
  return value || 'UNKNOWN'
}

function statusClass(value: string) {
  if (value === 'COMMITMENT_TESTABLE' || value === 'BOUND') return 'status success'
  if (value === 'COMMITMENT_NO_FAILURE_STATE') return 'status blocked'
  return 'status open'
}

function App() {
  const [account, setAccount] = useState<Address | null>(null)
  const [wrongChain, setWrongChain] = useState(false)
  const [config, setConfig] = useState<ContractConfig | null>(null)
  const [tab, setTab] = useState<'agreement' | 'commitments'>('agreement')
  const [agreement, setAgreement] = useState<AgreementState | null>(null)
  const [attempts, setAttempts] = useState<AttemptItem[]>([])
  const [commitments, setCommitments] = useState<Record<string, CommitmentState>>({})
  const [openId, setOpenId] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [name, setName] = useState('Hosting SLA')
  const [promisee, setPromisee] = useState('')
  const [commitmentText, setCommitmentText] = useState(DEMO_VAGUE)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ kind: 'info' | 'success' | 'warning' | 'error'; title: string; message: string } | null>(null)
  const [tx, setTx] = useState<TxState>({ phase: 'idle' })

  const isCreator = useMemo(
    () => Boolean(agreement && account && sameAddress(agreement.creator, account)),
    [agreement, account],
  )

  const bindReason = useMemo(() => {
    if (!agreement) return 'Load an agreement first.'
    if (!account) return 'Connect MetaMask first.'
    if (!isCreator) return 'Only the agreement creator can bind.'
    if (agreement.bound) return 'Agreement is already bound.'
    if (agreement.attached_count < 1) return 'Requires at least one TESTABLE commitment.'
    return ''
  }, [agreement, account, isCreator])

  const loadAgreement = useCallback(async (id: string, quiet = false) => {
    const clean = id.trim().toLowerCase()
    if (!validId(clean)) {
      if (!quiet) setNotice({ kind: 'warning', title: 'Invalid agreement ID', message: 'Agreement IDs are 64 hexadecimal characters.' })
      return null
    }

    try {
      const next = await getAgreement(clean)
      const log = await getAttemptLog(clean, 0, Math.min(next.submitted_count || 1, 50))
      const map: Record<string, CommitmentState> = {}
      await Promise.all(
        log.map(async (item) => {
          try {
            map[item.commitment_id] = await getCommitment(item.commitment_id)
          } catch {
            // Keep the attempt row even if a follow-up read is temporarily unavailable.
          }
        }),
      )
      setAgreement(next)
      setAttempts(log)
      setCommitments(map)
      setOpenId(clean)
      rememberAgreement(account, clean)
      setRecent(readRecent(account))
      if (!quiet) setNotice({ kind: 'success', title: 'Agreement loaded', message: `${next.name} · ${next.state}` })
      return next
    } catch (error) {
      if (!quiet) setNotice({ kind: 'error', title: 'Could not load agreement', message: normalizeError(error) })
      return null
    }
  }, [account])

  const refreshCurrent = useCallback(async () => {
    if (!agreement) return
    await loadAgreement(agreement.agreement_id, true)
  }, [agreement, loadAgreement])

  useEffect(() => {
    let active = true
    const boot = async () => {
      setLoading(true)
      try {
        const [cfg, wallet, chainId] = await Promise.all([
          getConfig(),
          getAuthorizedWallet().catch(() => null),
          getChainId().catch(() => 0),
        ])
        if (!active) return
        setConfig(cfg)
        setAccount(wallet)
        setWrongChain(Boolean(wallet && chainId !== STUDIONET_CHAIN_ID))
        setRecent(readRecent(wallet))
        const last = wallet ? localStorage.getItem(lastAgreementKey(wallet)) || '' : ''
        if (validId(last)) await loadAgreement(last, true)
      } catch (error) {
        if (active) setNotice({ kind: 'error', title: 'Could not load CommitGate', message: reportError('bootstrap', error) })
      } finally {
        if (active) setLoading(false)
      }
    }
    void boot()
    return () => { active = false }
  }, [loadAgreement])

  useEffect(() => {
    return subscribeWalletEvents({
      onAccountsChanged: (accounts) => {
        const next = accounts[0] || null
        setAccount(next)
        setRecent(readRecent(next))
        setNotice(next
          ? { kind: 'info', title: 'Wallet changed', message: `Connected account is now ${short(next)}.` }
          : { kind: 'warning', title: 'Wallet disconnected', message: 'Connect MetaMask to create or update agreements.' })
      },
      onChainChanged: (chainId) => setWrongChain(chainId !== STUDIONET_CHAIN_ID),
    })
  }, [])

  const connect = async () => {
    setBusy('connect')
    setNotice(null)
    try {
      const result = await connectWallet()
      setAccount(result.address)
      setWrongChain((await getChainId()) !== STUDIONET_CHAIN_ID)
      setRecent(readRecent(result.address))
      setNotice({
        kind: result.warning ? 'warning' : 'success',
        title: result.warning ? 'Wallet connected' : 'Connected to StudioNet',
        message: result.warning || `${short(result.address)} is ready to use CommitGate.`,
      })
    } catch (error) {
      setNotice({ kind: 'error', title: 'Wallet connection failed', message: reportError('connect wallet', error) })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    setNotice(null)

    try {
      const result = await disconnectWallet()

      // Clear wallet-scoped UI state immediately so a previous tenant is never
      // mistaken for the active account after disconnect.
      setAccount(null)
      setWrongChain(false)
      setAgreement(null)
      setAttempts([])
      setCommitments({})
      setOpenId('')
      setRecent([])
      setTx({ phase: 'idle' })

      setNotice({
        kind: result.revoked ? 'success' : 'warning',
        title: 'Wallet disconnected',
        message: result.revoked
          ? 'MetaMask account permission was revoked for CommitGate. Connect again when you want to continue.'
          : 'CommitGate disconnected locally. This wallet does not support automatic permission revocation; remove this site from Connected sites in the wallet if you also want to revoke access there.',
      })
    } catch (error) {
      // Even if the provider refuses the revoke request, leave the app in a
      // disconnected local state instead of keeping a stale active tenant.
      setAccount(null)
      setWrongChain(false)
      setAgreement(null)
      setAttempts([])
      setCommitments({})
      setOpenId('')
      setRecent([])
      setTx({ phase: 'idle' })

      setNotice({
        kind: 'warning',
        title: 'Disconnected in CommitGate',
        message: `${reportError('disconnect wallet', error)} The app session was cleared; revoke this site in MetaMask Connected sites if needed.`,
      })
    } finally {
      setBusy(null)
    }
  }

  const switchNetwork = async () => {
    setBusy('switch')
    try {
      await ensureStudioChain()
      setWrongChain(false)
      setNotice({ kind: 'success', title: 'Network switched', message: 'MetaMask is on GenLayer Studio Network (61999).' })
    } catch (error) {
      setNotice({ kind: 'error', title: 'Network switch failed', message: reportError('switch network', error) })
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    if (!account) return setNotice({ kind: 'warning', title: 'Connect MetaMask', message: 'A creator wallet is required.' })
    const cleanName = name.trim()
    const cleanPromisee = promisee.trim()
    if (!cleanName) return setNotice({ kind: 'warning', title: 'Name required', message: 'Enter an agreement name.' })
    if (!/^0x[a-fA-F0-9]{40}$/.test(cleanPromisee)) return setNotice({ kind: 'warning', title: 'Invalid promisee', message: 'Enter a valid 0x address different from the creator.' })
    if (sameAddress(account, cleanPromisee)) return setNotice({ kind: 'warning', title: 'Promisee must differ', message: 'Use any other valid address. The promisee does not need to sign the demo.' })
    if (config && cleanName.length > config.max_name_length) return setNotice({ kind: 'warning', title: 'Name too long', message: `Maximum ${config.max_name_length} characters.` })

    setBusy('create')
    setNotice(null)
    setTx({ phase: 'signing', label: 'Create agreement' })
    try {
      // Local keccak256 — no RPC, cannot fail on the network.
      const id = computeAgreementId(account, cleanName)
      const existing = await step('read existing agreement', () => existsAgreement(id))
      if (existing) {
        await loadAgreement(id, true)
        throw new Error('An agreement with this name already exists for this creator. It has been loaded instead.')
      }
      const { hash } = await step('write create_agreement', () =>
        createAgreement(account, cleanName, cleanPromisee),
      )
      setTx({ phase: 'submitted', label: 'Agreement submitted', hash, message: 'Waiting for accepted on-chain state. Do not submit again.' })
      const confirmed = await waitForStateChange({
        readState: () => getAgreement(id),
        accept: (value) => value.agreement_id === id,
      })
      if (!confirmed) {
        setTx({ phase: 'pending', label: 'Agreement submitted', hash, message: 'State confirmation timed out. The transaction may still be finalizing or may have reverted. Check Explorer before retrying.' })
        return
      }
      setAgreement(confirmed)
      setAttempts([])
      setCommitments({})
      setOpenId(id)
      rememberAgreement(account, id)
      setRecent(readRecent(account))
      setTx({ phase: 'confirmed', label: 'Agreement created', hash })
      setNotice({ kind: 'success', title: 'Agreement created', message: `Agreement ${short(id, 10, 8)} is OPEN.` })
    } catch (error) {
      const message = reportError('create agreement', error)
      setTx({ phase: 'error', label: 'Create agreement failed', message })
      setNotice({ kind: 'error', title: 'Create failed', message })
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    if (!account || !agreement) return setNotice({ kind: 'warning', title: 'Agreement required', message: 'Connect MetaMask and load an agreement first.' })
    if (!isCreator) return setNotice({ kind: 'warning', title: 'Creator only', message: 'Only the agreement creator may submit commitments.' })
    if (agreement.bound) return setNotice({ kind: 'warning', title: 'Agreement frozen', message: 'BOUND agreements cannot accept more commitments.' })
    const text = commitmentText.trim()
    if (!text) return setNotice({ kind: 'warning', title: 'Commitment required', message: 'Enter commitment text.' })
    if (config && text.length > config.max_text_length) return setNotice({ kind: 'warning', title: 'Commitment too long', message: `Maximum ${config.max_text_length} characters.` })

    setBusy('submit')
    setNotice(null)
    setTx({ phase: 'signing', label: 'Submit commitment' })
    try {
      // Local keccak256. This used to be a gen_call READ that carried the full
      // commitment text as GenLayer calldata and ran BEFORE the write, inside
      // this same try block — so any failure in it was reported as a write
      // failure. It is now computed offline and cannot fail on the network.
      const commitmentId = computeCommitmentId(agreement.agreement_id, text)
      const existing = await step('read existing commitment', () => existsCommitment(commitmentId))
      if (existing) throw new Error('This exact commitment already exists. Exact-text re-rolls are blocked by the contract.')
      const before = agreement.submitted_count
      const { hash } = await step('write submit_commitment', () =>
        submitCommitment(account, agreement.agreement_id, text),
      )
      setTx({ phase: 'submitted', label: 'Commitment submitted to GenLayer', hash, message: 'AI-validator consensus is running. The app checks accepted state at low frequency; do not submit again.' })
      const confirmed = await waitForStateChange({
        readState: async () => ({
          agreement: await getAgreement(agreement.agreement_id),
          commitment: await existsCommitment(commitmentId),
        }),
        accept: (value) => value.agreement.submitted_count > before && Boolean(value.commitment),
      })
      if (!confirmed?.commitment) {
        setTx({ phase: 'pending', label: 'Commitment submitted', hash, message: 'Consensus/state confirmation timed out. Open Explorer before retrying; an exact retry may revert if the commitment was accepted.' })
        return
      }
      await loadAgreement(agreement.agreement_id, true)
      setTx({ phase: 'confirmed', label: verdictLabel(confirmed.commitment.verdict), hash })
      setNotice({
        kind: confirmed.commitment.active ? 'success' : 'warning',
        title: verdictLabel(confirmed.commitment.verdict),
        message: confirmed.commitment.active
          ? 'This text defines at least one failure state and now counts toward binding.'
          : 'This text does not define a failure state. It is recorded but does not count toward binding.',
      })
    } catch (error) {
      const message = reportError('submit commitment', error)
      setTx({ phase: 'error', label: 'Commitment submission failed', message })
      setNotice({ kind: 'error', title: 'Submission failed', message })
    } finally {
      setBusy(null)
    }
  }

  const bind = async () => {
    if (!account || !agreement || bindReason) {
      return setNotice({ kind: 'warning', title: 'Cannot bind yet', message: bindReason || 'Load an agreement first.' })
    }

    setBusy('bind')
    setNotice(null)
    setTx({ phase: 'signing', label: 'Bind agreement' })
    try {
      const { hash } = await bindAgreement(account, agreement.agreement_id)
      setTx({ phase: 'submitted', label: 'Bind submitted', hash, message: 'Waiting for BOUND state. Do not submit again.' })
      const confirmed = await waitForStateChange({
        readState: () => getAgreement(agreement.agreement_id),
        accept: (value) => value.bound === true,
      })
      if (!confirmed) {
        setTx({ phase: 'pending', label: 'Bind submitted', hash, message: 'State confirmation timed out. Check Explorer before retrying.' })
        return
      }
      await loadAgreement(agreement.agreement_id, true)
      setTx({ phase: 'confirmed', label: 'Agreement BOUND', hash })
      setNotice({ kind: 'success', title: 'Agreement bound', message: 'The contract-local agreement is now frozen in BOUND state.' })
    } catch (error) {
      const message = reportError('bind agreement', error)
      setTx({ phase: 'error', label: 'Bind failed', message })
      setNotice({ kind: 'error', title: 'Bind failed', message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CommitGate home">
          <img src="/commitgate-logo.png" alt="CommitGate" />
        </a>
        <div className="network-block">
          <span className="network-dot" />
          <span>StudioNet · 61999</span>
          <a href={CONTRACT_EXPLORER} target="_blank" rel="noreferrer">Contract {short(CONTRACT_ADDRESS)}</a>
        </div>
        <div className="wallet-block">
          {account ? <span className="wallet-chip">{short(account)}</span> : null}
          {wrongChain ? <button className="button ghost" onClick={switchNetwork} disabled={Boolean(busy)}>{busy === 'switch' ? 'Switching…' : 'Switch network'}</button> : null}
          <button
            className="button primary"
            onClick={account ? disconnect : connect}
            disabled={Boolean(busy)}
          >
            {busy === 'connect'
              ? 'Connecting…'
              : busy === 'disconnect'
                ? 'Disconnecting…'
                : account
                  ? 'Disconnect'
                  : 'Connect MetaMask'}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">SEMANTIC COMMITMENT GATE</span>
            <h1>Only bind commitments that define a real failure state.</h1>
            <p>
              CommitGate uses GenLayer consensus to classify one narrow property of commitment text,
              then deterministic contract logic decides whether an agreement is allowed to become BOUND.
            </p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => setTab('agreement')}>Create agreement</button>
              <a className="button secondary" href={CONTRACT_EXPLORER} target="_blank" rel="noreferrer">Open Explorer ↗</a>
            </div>
          </div>
          <div className="hero-visual" aria-label="CommitGate flow">
            <div className="flow-node">Commitment text</div>
            <span>→</span>
            <div className="flow-node accent">GenLayer consensus</div>
            <span>→</span>
            <div className="flow-stack">
              <div className="flow-node success-lite">TESTABLE → counts</div>
              <div className="flow-node blocked-lite">NO FAILURE STATE → blocked</div>
            </div>
          </div>
        </section>

        {notice ? (
          <section className={`notice ${notice.kind}`}>
            <div><strong>{notice.title}</strong><p>{notice.message}</p></div>
            <button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
          </section>
        ) : null}

        {wrongChain ? (
          <section className="chain-warning">
            <strong>Wrong network.</strong> Writes require GenLayer Studio Network (chain 61999).
            <button onClick={switchNetwork} disabled={Boolean(busy)}>Switch now</button>
          </section>
        ) : null}

        {tx.phase !== 'idle' ? (
          <section className={`tx-strip ${tx.phase}`}>
            <div>
              <span className="tx-phase">{tx.phase.toUpperCase()}</span>
              <strong>{tx.label}</strong>
              {tx.message ? <p>{tx.message}</p> : null}
            </div>
            {tx.hash ? <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">View tx ↗</a> : null}
          </section>
        ) : null}

        <section className="workspace">
          <div className="workspace-head">
            <div>
              <span className="eyebrow">WORKSPACE</span>
              <h2>{agreement ? agreement.name : 'Your agreement'}</h2>
            </div>
            <div className="tabs" role="tablist">
              <button className={tab === 'agreement' ? 'active' : ''} onClick={() => setTab('agreement')}>Agreement</button>
              <button className={tab === 'commitments' ? 'active' : ''} onClick={() => setTab('commitments')}>Commitments {agreement ? `(${agreement.submitted_count})` : ''}</button>
            </div>
          </div>

          {loading ? <div className="loading-card">Loading contract configuration…</div> : null}

          {!loading && tab === 'agreement' ? (
            <div className="workspace-grid">
              <div className="panel">
                <div className="panel-title"><h3>Create isolated agreement</h3><span className="step">01</span></div>
                <label>Agreement name <span>{name.length}/{config?.max_name_length ?? 80}</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={config?.max_name_length ?? 80} placeholder="Hosting SLA" />
                <label>Promisee address</label>
                <input value={promisee} onChange={(e) => setPromisee(e.target.value)} placeholder="0x… different from creator" />
                <p className="hint">Only the creator signs the demo. Promisee is stored as context and must be a different valid address.</p>
                <button className="button primary wide" disabled={Boolean(busy)} onClick={create}>{busy === 'create' ? 'Submitting…' : 'Create agreement'}</button>
              </div>

              <div className="panel">
                <div className="panel-title"><h3>Open existing agreement</h3><span className="step">02</span></div>
                <label>Agreement ID</label>
                <input value={openId} onChange={(e) => setOpenId(e.target.value)} placeholder="64-character hex ID" />
                <button className="button secondary wide" disabled={Boolean(busy)} onClick={() => void loadAgreement(openId)}>Load agreement</button>
                {recent.length > 0 ? (
                  <div className="recent-list">
                    <span>Recent for this wallet</span>
                    {recent.map((id) => <button key={id} onClick={() => void loadAgreement(id)}>{short(id, 10, 8)}</button>)}
                  </div>
                ) : <p className="hint">Recent IDs are stored locally and scoped by contract + wallet. There is no global on-chain scan.</p>}
              </div>

              <div className="panel state-panel">
                <div className="panel-title"><h3>On-chain state</h3>{agreement ? <span className={statusClass(agreement.state)}>{agreement.state}</span> : null}</div>
                {agreement ? (
                  <>
                    <div className="metric-grid">
                      <div><strong>{agreement.attached_count}</strong><span>Testable</span></div>
                      <div><strong>{agreement.submitted_count}</strong><span>Submitted</span></div>
                      <div><strong>{agreement.bound ? 'YES' : 'NO'}</strong><span>Bound</span></div>
                    </div>
                    <dl className="details">
                      <div><dt>Creator</dt><dd title={agreement.creator}>{short(agreement.creator, 8, 6)} {isCreator ? <em>YOU</em> : ''}</dd></div>
                      <div><dt>Promisee</dt><dd title={agreement.promisee}>{short(agreement.promisee, 8, 6)}</dd></div>
                      <div><dt>Agreement ID</dt><dd title={agreement.agreement_id}>{short(agreement.agreement_id, 12, 10)}</dd></div>
                    </dl>
                    <button className="button primary wide" disabled={Boolean(busy) || Boolean(bindReason)} onClick={bind}>{busy === 'bind' ? 'Binding…' : agreement.bound ? 'Agreement is BOUND' : 'Bind agreement'}</button>
                    {bindReason && !agreement.bound ? <p className="gate-reason">Gate closed: {bindReason}</p> : null}
                  </>
                ) : <div className="empty-state"><strong>No agreement loaded</strong><p>Create your own or paste an ID.</p></div>}
              </div>
            </div>
          ) : null}

          {!loading && tab === 'commitments' ? (
            <div className="commit-layout">
              <div className="panel composer">
                <div className="panel-title"><h3>Submit commitment</h3><span className="step">03</span></div>
                <div className="preset-row">
                  <button onClick={() => setCommitmentText(DEMO_VAGUE)}>Load vague demo</button>
                  <button onClick={() => setCommitmentText(DEMO_TESTABLE)}>Load testable demo</button>
                </div>
                <textarea value={commitmentText} onChange={(e) => setCommitmentText(e.target.value)} maxLength={config?.max_text_length ?? 1200} rows={7} />
                <div className="textarea-meta"><span>{commitmentText.length}/{config?.max_text_length ?? 1200}</span><span>One semantic question · no URLs · no external evidence</span></div>
                <button className="button primary wide" disabled={Boolean(busy) || !agreement || !isCreator || Boolean(agreement?.bound)} onClick={submit}>{busy === 'submit' ? 'Consensus running…' : 'Submit to GenLayer'}</button>
                {!agreement ? <p className="gate-reason">Load an agreement first.</p> : !isCreator ? <p className="gate-reason">Only the creator may submit.</p> : agreement.bound ? <p className="gate-reason">BOUND agreements are frozen.</p> : null}
              </div>

              <div className="panel history-panel">
                <div className="panel-title"><h3>Append-only attempt history</h3><button className="icon-button" onClick={() => void refreshCurrent()} disabled={!agreement || Boolean(busy)} title="Refresh">↻</button></div>
                {attempts.length === 0 ? <div className="empty-state"><strong>No attempts yet</strong><p>Submit a vague commitment, then a testable one.</p></div> : (
                  <div className="attempt-list">
                    {attempts.slice().reverse().map((item) => {
                      const detail = commitments[item.commitment_id]
                      return (
                        <article key={item.commitment_id} className="attempt-card">
                          <div className="attempt-top"><span>#{item.attempt_number}</span><span className={statusClass(item.verdict)}>{verdictLabel(item.verdict)}</span></div>
                          <p>{detail?.text || 'Loading commitment text…'}</p>
                          <code>{short(item.commitment_id, 12, 10)}</code>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section className="explain-grid">
          <article><span>01</span><h3>Semantic question</h3><p>Does the text state at least one behavior, result, or deadline whose non-occurrence is treated as failure?</p></article>
          <article><span>02</span><h3>Binary consensus</h3><p>Validators bind only to TESTABLE or NO_FAILURE_STATE. Free-form reasoning does not control state.</p></article>
          <article><span>03</span><h3>Deterministic teeth</h3><p>Only TESTABLE commitments increment the binding gate. BOUND freezes the agreement permanently.</p></article>
        </section>

        <section className="limitation">
          <strong>Honest limitation</strong>
          <p>CommitGate evaluates only whether submitted text defines a failure state. It does not judge fairness, legal enforceability, real-world performance, or who is allowed to decide compliance.</p>
        </section>
      </main>

      <footer>
        <div><img src="https://genlayer.com/brand/genlayer-logo-black-large.png" alt="GenLayer" onError={(event) => { event.currentTarget.src = '/genlayer-logo.png' }} /><span>Built on GenLayer StudioNet</span></div>
        <div><a href={CONTRACT_EXPLORER} target="_blank" rel="noreferrer">Contract ↗</a><span>CommitGate v1</span></div>
      </footer>
    </div>
  )
}

export default App
