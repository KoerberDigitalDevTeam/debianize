'use strict'

module.exports = {
  'env': {
    'es6': true,
    'node': true,
    'mocha': true,
  },
  'extends': 'google',
  'parserOptions': {
    'ecmaVersion': 2017,
    'sourceType': 'script',
  },
  'rules': {
    'array-bracket-spacing': [ 'error', 'always' ],
    'camelcase': 'off',
    'eol-last': [ 'error', 'always' ],
    'guard-for-in': 'off',
    'max-len': 'off',
    'no-multiple-empty-lines': [ 'error', { 'max': 2, 'maxBOF': 0, 'maxEOF': 1 } ],
    'no-multi-spaces': [ 'error', { 'ignoreEOLComments': true } ],
    'no-undef': 'error',
    'object-curly-spacing': [ 'error', 'always' ],
    'one-var': [ 'off' ],
    'require-jsdoc': 'off',
    'semi': [ 'error', 'never' ],
    'strict': [ 'error', 'global' ],
  },
}
