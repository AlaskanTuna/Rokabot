export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'style', 'perf']],
    'scope-enum': [
      2,
      'always',
      ['agent', 'memory', 'media', 'discord', 'games', 'studio', 'config', 'storage', 'deploy', 'harness', 'main']
    ]
  }
}
