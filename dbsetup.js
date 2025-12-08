#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const env = { ...process.env }

// Ensure DATABASE_URL is set to the volume path
env.DATABASE_URL = "file:/data/dev.sqlite"
console.log("Setting DATABASE_URL to:", env.DATABASE_URL);

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
