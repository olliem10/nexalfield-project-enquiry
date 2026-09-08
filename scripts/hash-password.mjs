#!/usr/bin/env node
/**
 * Turns an administrator password into the PBKDF2 digest stored in
 * ADMIN_PASSWORD_HASH, so the plain password never lives in an environment
 * variable, a deploy log or this repository.
 *
 *   npm run hash-password -- "your admin password"
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const ITERATIONS = 210_000
const KEY_LENGTH = 32
const DIGEST = 'sha512'

const password = process.argv.slice(2).join(' ')

if (!password) {
  console.error('Usage: npm run hash-password -- "your admin password"')
  process.exit(1)
}

if (password.length < 12) {
  console.error('Please choose a password of at least 12 characters.')
  process.exit(1)
}

const salt = randomBytes(16)
const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
const encoded = `pbkdf2$${DIGEST}$${ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`

console.log('\nAdd this to your Netlify environment variables:\n')
console.log(`ADMIN_PASSWORD_HASH=${encoded}\n`)
