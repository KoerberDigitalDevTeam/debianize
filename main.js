#!/usr/bin/env node

'use strict'

const log = require('errorlog')()

require('./index.js')(...process.argv.slice(2))
    .catch((error) => log.error('Error creating package', error))
