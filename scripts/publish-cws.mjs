#!/usr/bin/env node
/**
 * Upload and/or publish the extension with the Chrome Web Store API v2.
 * https://developer.chrome.com/docs/webstore/using-api
 *
 *   node scripts/publish-cws.mjs status
 *   node scripts/publish-cws.mjs upload  <zip>    # upload a draft only
 *   node scripts/publish-cws.mjs publish <zip>    # upload, then submit for review
 *
 * Environment:
 *   CWS_ACCESS_TOKEN   OAuth access token with the chromewebstore scope
 *                      (in CI: minted by google-github-actions/auth, never stored)
 *   CWS_PUBLISHER_ID   Developer Dashboard → Account → Publisher ID
 *   CWS_EXTENSION_ID   The item ID in the store URL
 *
 * Every API call can return HTTP 200 with a failed state in the body, so states are
 * checked explicitly rather than trusting the status code.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const ROOT = 'https://chromewebstore.googleapis.com'
const POLL_INTERVAL_MS = 10_000
const POLL_TIMEOUT_MS = 5 * 60_000
// Submission states that mean "accepted for publishing" (ItemState).
const OK_PUBLISH_STATES = new Set(['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'])

function env(name) {
  const value = process.env[name]?.trim()
  if (!value) fail(`Missing environment variable ${name}`)
  return value
}

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

const token = env('CWS_ACCESS_TOKEN')
const item = `publishers/${env('CWS_PUBLISHER_ID')}/items/${env('CWS_EXTENSION_ID')}`
const auth = { Authorization: `Bearer ${token}` }

async function call(method, url, init = {}) {
  const res = await fetch(url, { method, ...init, headers: { ...auth, ...init.headers } })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    const reason = body?.error?.message ?? text ?? res.statusText
    fail(`${method} ${url.replace(ROOT, '')} → HTTP ${res.status}: ${reason}`)
  }
  return body
}

const fetchStatus = () => call('GET', `${ROOT}/v2/${item}:fetchStatus`)

function describe(status) {
  const rev = (r) => (r ? `${r.state} (${(r.distributionChannels ?? []).map((c) => `v${c.crxVersion} @ ${c.deployPercentage}%`).join(', ') || 'no channels'})` : 'none')
  return [
    `published: ${rev(status.publishedItemRevisionStatus)}`,
    `submitted: ${rev(status.submittedItemRevisionStatus)}`,
    `last upload: ${status.lastAsyncUploadState ?? 'n/a'}`,
    status.takenDown ? 'TAKEN DOWN for a policy violation' : null,
    status.warned ? 'WARNED for a policy violation' : null,
  ]
    .filter(Boolean)
    .join('\n')
}

async function upload(zipPath, expectedVersion) {
  const zip = await readFile(zipPath)
  console.log(`Uploading ${basename(zipPath)} (${(zip.length / 1024).toFixed(0)} KB)…`)
  const result = await call('POST', `${ROOT}/upload/v2/${item}:upload`, {
    headers: { 'Content-Type': 'application/zip', 'X-Goog-Upload-Protocol': 'raw', 'X-Goog-Upload-File-Name': basename(zipPath) },
    body: zip,
  })
  let state = result.uploadState
  let version = result.crxVersion

  // Large packages are processed asynchronously; poll until done.
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS') {
    if (Date.now() > deadline) fail('Upload still processing after 5 minutes')
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    // fetchStatus doesn't report the draft's version, so the version check below only
    // applies when the upload finished synchronously.
    state = (await fetchStatus()).lastAsyncUploadState
    console.log(`  upload state: ${state}`)
  }

  if (state !== 'SUCCEEDED') fail(`Upload did not succeed (state: ${state}). ${JSON.stringify(result)}`)
  if (expectedVersion && version && version !== expectedVersion) {
    fail(`Store received version ${version}, expected ${expectedVersion}`)
  }
  console.log(`Upload succeeded${version ? ` (v${version})` : ''}.`)
}

async function publish() {
  const result = await call('POST', `${ROOT}/v2/${item}:publish`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  })
  for (const w of result.warningInfo?.warnings ?? []) console.log(`::warning::${w.reason}: ${w.description}`)
  if (!OK_PUBLISH_STATES.has(result.state)) fail(`Publish was not accepted (state: ${result.state})`)
  console.log(`Submitted: ${result.state}. Google review usually takes from a few hours to a few days.`)
}

const [command, zipPath] = process.argv.slice(2)
const expectedVersion = process.env.EXPECTED_VERSION?.trim() || undefined

switch (command) {
  case 'status':
    console.log(describe(await fetchStatus()))
    break
  case 'upload':
  case 'publish':
    if (!zipPath) fail(`Usage: publish-cws.mjs ${command} <zip>`)
    await upload(zipPath, expectedVersion)
    if (command === 'publish') await publish()
    break
  default:
    fail('Usage: publish-cws.mjs <status|upload|publish> [zip]')
}
