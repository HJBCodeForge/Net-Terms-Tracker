#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const env = { ...process.env }

// Only fallback to sqlite if DATABASE_URL is not provided (e.g. not using Postgres)
// But for production, we expect DATABASE_URL to be set via secrets
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "file:/data/dev.sqlite"
  console.log("No DATABASE_URL found. Defaulting to SQLite volume.");
}

console.log(`Database URL set (using secret or default).`);

// prepare database
console.log("Running migrations...");
await exec('npx prisma migrate deploy')
console.log("Migrations complete.");

// launch application
console.log("Starting application...");
await exec(process.argv.slice(2).join(' '))

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}
