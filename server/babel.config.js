const presets = [
  [
    '@babel/env',
    {
      targets: { node: 14 },
      useBuiltIns: 'usage',
      corejs: '3',
    },
  ],
]

module.exports = { presets }
