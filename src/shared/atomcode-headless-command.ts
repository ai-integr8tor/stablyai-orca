const ATOMCODE_HEADLESS_PROMPT_FLAGS = new Set(['--prompt', '--prompt-file', '-p'])

function optionName(token: string): string {
  const eq = token.indexOf('=')
  return eq === -1 ? token : token.slice(0, eq)
}

export function isAtomCodeHeadlessOneShotCommand(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    const name = optionName(tokens[index])
    if (ATOMCODE_HEADLESS_PROMPT_FLAGS.has(name) || /^-p[^-]/.test(name)) {
      return true
    }
  }
  return false
}
