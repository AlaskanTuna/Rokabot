/** Run as a child process: loads config.yml and the character pack exactly as the bot does at startup. */
try {
  await import('../../src/config.js')
  await import('../../src/character/index.js')
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
