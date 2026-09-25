export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    ],
    'scope-enum': [
      2,
      'always',
      [
        'p0',
        'p1',
        'p2',
        'p3',
        'p4',
        'desktop',
        'packages',
        'utils',
        'validation',
        'http',
        'config',
        'types',
        'ipc',
        'deps',
        'ci',
        'release'
      ]
    ]
  }
};
