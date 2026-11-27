import { selfCheck } from '../src/astro/ephemeris'

const errors = selfCheck()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('SELFCHECK OK')
