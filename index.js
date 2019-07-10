'use strict'

const ansi = require('ansi-colors')
const chmod = require('gulp-chmod')
const del = require('del')
const fs = require('fs')
const hrtime = require('pretty-hrtime')
const map = require('map-stream')
const mustache = require('gulp-mustache')
const path = require('path')
const rename = require('gulp-rename')
const util = require('util')

const exec = require('child_process').execFile
const Gulp = require('gulp').Gulp
const log = require('errorlog')()

function print(destdir) {
  return map((file, cb) => {
    const cwd = process.cwd()
    const from = path.relative(cwd, path.resolve(destdir, file.relative))
    const to = path.relative(cwd, file.path)
    log.trace(`File ${ansi.yellow(from)} from ${ansi.blue(to)}`)
    cb(null, file)
  })
}

function parse(dir, file) {
  const filename = path.resolve(dir, file)
  log.info(`Parsing ${ansi.yellow(path.relative(process.cwd(), filename))}`)
  return JSON.parse(fs.readFileSync(filename))
}

function debianize(dir = process.cwd()) {
  const pkg = parse(dir, 'package.json')
  const pkgLock = parse(dir, 'package-lock.json')
  const deb = pkg.debian || {}
  const data = {}

  /* Required */
  data.name = process.env.DEBIAN_NAME || deb.name || pkg.name.split('/').slice(-1)[0] || null
  data.version = process.env.DEBIAN_VERSION || deb.version || pkg.version || null

  /* No package.json counterparts */
  data.architecture = process.env.DEBIAN_ARCHITECTURE || deb.architecture || 'all'
  data.priority = process.env.DEBIAN_PRIORITY || deb.priority || 'optional'
  data.section = process.env.DEBIAN_SECTION || deb.section || 'nodejs'

  data.root = deb.root || `/usr/lib/${data.name}`
  const destroot = path.resolve('debian', `./${data.root}`)

  /* Optional stuff */
  data.description = deb.description || pkg.description || null
  data.maintainer = deb.maintainer || pkg.author || null
  data.homepage = deb.homepage || pkg.homepage || null

  /* Binary files */
  data.bin = []
  if (pkg.bin) {
    Object.keys(pkg.bin).forEach((key) => {
      const src = path.resolve(data.root, pkg.bin[key])
      data.bin.push({ bin: `/usr/bin/${key}`, src, key })
    })
  }

  /* Dependencies */
  const deps = deb.depends ? Array.isArray(deb.depends) ? deb.depends : [ deb.depends ] : []
  if (! deps.find((d) => d.match(/^nodejs/))) {
    deps.unshift(`nodejs (>= ${process.version.match(/^v([\d]+)\./)[1]})`)
  }
  data.depends = deps.join(', ')

  /* Dump our data */
  log.info('Debian Package Data\n' + util.inspect(data, { colors: true }))

  /* Enumerate templates and load partials */
  const templates = {}, partials = {}

  for (const name of [ 'control', 'postinst', 'prerm' ]) {
    templates[name] = path.resolve(__dirname, `./templates/${name}.mustache`)
    partials[name] = fs.readFileSync(path.resolve(__dirname, `./partials/${name}.mustache`), 'utf8')
  }

  /* ======================================================================== *
   * GULP TASKS DEFINITION                                                    *
   * ======================================================================== */
  const gulp = new Gulp()

  const tasks = [
    'copy_package_files',
    'copy_node_modules',
    'debian_control',
  ]

  gulp.task('copy_node_modules', () => {
    const deps = pkgLock.dependencies || {}
    const globs = Object
        .keys(deps)
        .filter((key) => ! deps[key].dev)
        .map((key) => `node_modules/${key}/**`)

    return gulp
        .src(globs, { base: '.' })
        .pipe(print(destroot))
        .pipe(gulp.dest(destroot))
  })

  gulp.task('copy_package_files', () => {
    const files = (pkg.files || [ './**', '!./node_modules/**' ])
        .map((glob) => glob.endsWith('/') ? glob + '**' : glob)

    return gulp
        .src(files, { base: '.' })
        .pipe(print(destroot))
        .pipe(gulp.dest(destroot))
  })

  /* Create our "control" file */
  gulp.task('debian_control', () => {
    return gulp
        .src(deb.control || templates.control)
        .pipe(mustache(data, {}, partials))
        .pipe(rename('DEBIAN/control'))
        .pipe(chmod(0o644))
        .pipe(print('debian'))
        .pipe(gulp.dest('debian'))
  })

  /* Create our "postinst" file */
  if (data.bin.length || deb.postinst) {
    gulp.task('debian_postinst', () => {
      return gulp
          .src(deb.postinst || templates.postinst)
          .pipe(mustache(data, {}, partials))
          .pipe(rename('DEBIAN/postinst'))
          .pipe(chmod(0o755))
          .pipe(print('debian'))
          .pipe(gulp.dest('debian'))
    })
    tasks.push('debian_postinst')
  }

  /* Create our "postinst" file */
  if (data.bin.length || deb.postinst) {
    gulp.task('debian_prerm', () => {
      return gulp
          .src(deb.prerm || templates.prerm)
          .pipe(mustache(data, {}, partials))
          .pipe(rename('DEBIAN/prerm'))
          .pipe(chmod(0o755))
          .pipe(print('debian'))
          .pipe(gulp.dest('debian'))
    })
    tasks.push('debian_prerm')
  }

  /* Process the various templates */
  if (deb.templates) {
    gulp.task('copy_template_files', gulp.parallel(Object
        .keys(deb.templates)
        .map((target, i) => {
          const source = deb.templates[target]
          const name = `copy_template_files [${i + 1}]`

          gulp.task(name, () => {
            return gulp.src(source)
                .pipe(mustache(data, {}, partials))
                .pipe(rename(target))
                .pipe(print('debian'))
                .pipe(gulp.dest('debian'))
          })

          return name
        })
    ))
    tasks.push('copy_template_files')
  }

  /* Package can be prepared in parallel tasks */
  gulp.task('prepare_package', gulp.parallel(tasks))

  /* Finally, make our debian package */
  gulp.task('build_package', (callback) => {
    const fakeroot = process.env.USE_FAKEROOT && true || false

    const args = [
      '-b', 'debian',
      `${data.name}_${data.version}_${data.architecture}.deb`,
    ]
    args.unshift(fakeroot ? 'dpkg-deb' : '--root-owner-group')

    log.info(`Executing ${ansi.yellow('dpkg-deb')} ${ansi.green(args.join(' '))}`)
    exec(fakeroot ? 'fakeroot' : 'dpkg-deb', args, (err, stdout, stderr) => {
      if (stderr) log.error(stderr)
      callback(err)
    })
  })

  /* Cleanup ... */
  gulp.task('clean', () => del('debian'))

  /* ======================================================================== *
   * GULP RUN                                                                 *
   * ======================================================================== */
  return new Promise((resolve, reject) => {
    gulp.on('error', () => {})

    gulp.on('start', (evt) => {
      log.debug(`Starting task ${ansi.magenta(evt.name)}`)
    })

    gulp.on('stop', function(evt) {
      log.info(`Task ${ansi.magenta(evt.name)} done in ${hrtime(evt.duration)}`)
    })

    gulp.series([ 'clean', 'prepare_package', 'build_package' ])((error) => {
      if (error) return reject(error)
      return resolve()
    })
  })
}

module.exports = debianize
