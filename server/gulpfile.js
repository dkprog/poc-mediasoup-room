const { series, parallel, src, dest } = require('gulp')
const babel = require('gulp-babel')
const vinylPaths = require('vinyl-paths')
const del = require('del')
const { spawn } = require('child_process')
const jeditor = require('gulp-json-editor')

function clean() {
  return src(['../dist/*']).pipe(
    vinylPaths((paths) => del(paths, { force: true }))
  )
}

function transpileServerJs() {
  return src('src/*.js').pipe(babel()).pipe(dest('../dist/src/'))
}

function copyServerPackageJson() {
  return src('package*.json')
    .pipe(jeditor({ scripts: { start: 'node src/server.js' } }))
    .pipe(dest('../dist/'))
}

function copyServerDotEnvDefaults() {
  return src('.env.defaults').pipe(dest('../dist/'))
}

function buildClient() {
  return spawn('npm', ['run', 'build'], {
    cwd: '../client/',
    stdio: 'inherit',
  })
}

function copyClientBuildContents() {
  return src('../client/build/**').pipe(dest('../dist/public/'))
}

exports.clean = clean
exports.build = series(
  exports.clean,
  parallel(
    transpileServerJs,
    copyServerPackageJson,
    copyServerDotEnvDefaults,
    buildClient
  ),
  copyClientBuildContents
)

exports.default = exports.build
