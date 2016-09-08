'use strict';

var gulp = require('gulp');
var usemin = require('gulp-usemin');
var minifyCss = require('gulp-minify-css');
var uglify = require('gulp-uglify');
var less = require('gulp-less');
var rev = require('gulp-rev');
var modify = require('gulp-modify');
var runSequence = require('run-sequence');
var fs = require('fs');
var jshint = require('gulp-jshint');
var shell = require('gulp-shell');
var http = require('http');
var livereload = require('gulp-livereload');
var st = require('st');
var karma = require('karma').server;

var serveport = 8081;

/**
 * Convert less to css
 */
gulp.task('less', function() {
  return gulp.src('./dev/less/layered.less')
    .pipe(less())
    .pipe(gulp.dest('./dev/css'))
    .pipe(livereload());
});

gulp.task('html', function() {
  return gulp.src('./dev/app/**/*.html')
    .pipe(livereload());
});

gulp.task('scripts', function() {
  return gulp.src('./dev/app/**/*.js')
    .pipe(livereload());
});

/**
 * Watch for files changing
 */
gulp.task('watch', function() {
  livereload.listen({ basePath: 'dev' });
  gulp.watch('./dev/less/*.less', ['less']);
  gulp.watch('./dev/app/**/*.html', ['html']);
  gulp.watch('./dev/app/**/*.js', ['scripts']);
});


gulp.task('serve', function(done) {
  http.createServer(
    st({ path: __dirname + '/dev', index: 'index.html', cache: false })
  ).listen(serveport, done);
});


/**
 * Set API and LOGIN URL match with environment: dev/ci/staging/production/sandbox
 */
gulp.task('setPath', function() {
  return gulp.src('./dev/app/app.module.js').pipe(modify({ fileModifier: function(file, contents) {
      var argv = require('minimist')(process.argv.slice(2));
      var env = argv.env;
      switch (env) {
          case 'local':
              contents = contents.replace(/LOGIN_URL: .*/, 'LOGIN_URL: \'http://localhost:8080/layered-api\',');
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'hhttp://localhost:8080/layered-api/\'');
              break;
          case 'dev':
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'http://localhost:8081/layered-api/\'');
              break;
          case 'ci':
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'http://ci-wdc-01.layered.net:8099/api/\'');
              break;
          case 'staging':
              contents = contents.replace(/LOGIN_URL: .*/, 'LOGIN_URL: \'https://login-staging.layered.com\',');
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'https://api-staging.layered.com/\'');
              break;
          case 'sandbox':
              contents = contents.replace(/LOGIN_URL: .*/, 'LOGIN_URL: \'https://login-sandbox.layered.com\',');
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'https://api-sandbox.layered.com/\'');
              break;
          case 'feature':
              contents = contents.replace(/LOGIN_URL: .*/, 'LOGIN_URL: \'https://login-feature.layered.com\',');
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'https://api-feature.layered.com/\'');
              break;
          case 'production':
              contents = contents.replace(/LOGIN_URL: .*/, 'LOGIN_URL: \'https://login.layered.com\',');
              contents = contents.replace(/API_SERVER: .*/, 'API_SERVER: \'https://api.layered.com/\'');
              break;
          default:
              throw new Error("Invalid Environment for build: [" + env + "]");
          }

      return contents;
  }})).pipe(gulp.dest('./dev/app'));
});


/**
 * Check jsHint
 */
gulp.task('jsHint', function() {
  return gulp.src('./dev/app/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});


/**
 * Minify css and js
 */
gulp.task('usemin', function() {
  return gulp.src('./dev/index.html')
    .pipe(usemin({
      css: [ minifyCss(), rev() ],
      js_lib: [ uglify(), rev() ],
      js_app: [ uglify(), rev() ]
    }))
    .pipe(gulp.dest('./dist'))
    .pipe(rev.manifest())
    .pipe(gulp.dest('./dist'));
});


/**
 * Copy files from dev to dist folder
 */
gulp.task('copy-app-html', function() {
  return gulp.src('./dev/app/**/*.html')
    .pipe(rev())
    .pipe(gulp.dest('./dist/app'))
    .pipe(rev.manifest())
    .pipe(gulp.dest('./dist/app'));
});

gulp.task('copy-version', function() {
  return gulp.src('./dev/version.html')
    .pipe(gulp.dest('./dist'));
});

gulp.task('copy-libs-html', function() {
  return gulp.src('./dev/libs/**/*.html')
    .pipe(gulp.dest('./dist/libs'));
});

gulp.task('copy-fonts', function() {
  return gulp.src('./dev/fonts/**')
    .pipe(gulp.dest('./dist/fonts'));
});

gulp.task('copy-images', function() {
  return gulp.src(['./dev/images/*.png', './dev/images/*.gif', './dev/images/*.ico'])
    .pipe(gulp.dest('./dist/images'));
});


/**
 * apply new revision, replace in the source code
 */
gulp.task('updateIndex', function(done) {
  fs.readFile('./dist/app/rev-manifest.json', 'utf-8', function(err, _data) {
    if(!!_data) {
      var revPartial = JSON.parse(_data);
      var headerPath = 'app/' + revPartial['partials/header.html'] + '\'"></div>';
      var footerPath = 'app/' + revPartial['partials/footer.html'] + '\'"></div>';

      gulp.src('./dist/index.html')
        .pipe(modify({ fileModifier: function(file, contents) {
          contents = contents.replace(/app\/partials\/header.*/, headerPath);
          contents = contents.replace(/app\/partials\/footer.*/, footerPath);
          return contents;
        } }))
        .pipe(gulp.dest('./dist'))
        .on('end', done);
    }
  });
});


/**
 * change templateURL match with new revision .html inside layered-app.js
 */
gulp.task('updateTemplateURL', function(done) {
  fs.readFile('./dist/rev-manifest.json', 'utf-8', function(err, _data) {
    if(!!_data) {
      var revObj = JSON.parse(_data);
      var newLayeredApp = revObj['min/layered_app.js'];

      fs.readFile('./dist/app/rev-manifest.json', 'utf-8', function(err, _data) {
        if(!!_data) {
          var revObj = JSON.parse(_data);
          gulp.src('./dist/' + newLayeredApp)
            .pipe(modify({
              fileModifier: function(file, contents) {
                for (var key in revObj) {
                  var regx = new RegExp(key, 'g');
                  contents = contents.replace(regx, revObj[key]);
                }
                return contents;
              }
            }))
            .pipe(gulp.dest('./dist/min'))
            .on('end', done);
        }
      });
    }
  });
});


/**
 * update Images in layered.css
 */
gulp.task('updateImagesInLayeredCss', function(done) {
  fs.readFile('./dist/rev-manifest.json', 'utf-8', function(err, _data) {
    if(!!_data) {
      var revObj = JSON.parse(_data);
      var newLayeredCss = revObj['min/layered.css'];
      //
      fs.readFile('./dist/images/rev-manifest.json', 'utf-8', function(err, _data) {
        if(!!_data) {
          var revObj = JSON.parse(_data);
          gulp.src('./dist/' + newLayeredCss)
            .pipe(modify({
              fileModifier: function(file, contents) {
                for (var key in revObj) {
                  var regx = new RegExp(key, 'g');
                  contents = contents.replace(regx, revObj[key]);
                }
                return contents;
              }
            }))
            .pipe(gulp.dest('./dist/min'))
            .on('end', done);
        }
      });
    }
  });
});

/**
 * update Images in templates
 */
gulp.task('updateImagesInTemplates', function() {
  return fs.readFile('./dist/app/rev-manifest.json', 'utf-8', function(err, _data) {
    if(!!_data) {
      // Get Templates revision data
      var revTemplateObj = JSON.parse(_data);

      // return stream
      fs.readFile('./dist/images/rev-manifest.json', 'utf-8', function(err, _data) {
        if(!!_data) {
          // Get Images revision data
          var revImagesObj = JSON.parse(_data);
          for (var templateKey in revTemplateObj) {
            var newTemplate = revTemplateObj[templateKey];
            var dest = newTemplate.substring(0, newTemplate.lastIndexOf('/'));
            gulp.src('./dist/app/' + newTemplate)
              .pipe(modify({
                fileModifier: function(file, contents) {
                  for (var imageKey in revImagesObj) {
                    var regx = new RegExp(imageKey, 'g');
                    contents = contents.replace(regx, revImagesObj[imageKey]);
                  }
                  return contents;
                }
              }))
              .pipe(gulp.dest('./dist/app/' + dest));
          }
        }
      });
    }
  });
});


/**
 * Add git revision to static file.
 */
 gulp.task('addGitRevision', shell.task([
  'rm ./dev/version.html',
  'echo "<div>" > ./dev/version.html',
  'git rev-parse HEAD >> ./dev/version.html',
  'echo "</div>" >> ./dev/version.html'
], {ignoreErrors: true}));


gulp.task('copy', ['copy-app-html', 'copy-libs-html', 'copy-images', 'copy-fonts', 'copy-version']);

/**
 * default task
 * watch files changes and reload
 * run on http://localhost:8081
 */
gulp.task('default', ['less', 'serve', 'watch']);

/**
 * deploy task
 * e.g: gulp deploy --env dev
 *      gulp deploy --env ci
 *      gulp deploy --env staging
 *      gulp deploy --env production
 *      gulp deploy --env sandbox
 */
gulp.task('deploy', function(callback) {
  runSequence('jsHint', 'setPath', 'less', 'usemin', 'addGitRevision', 'copy', 'updateIndex', 'updateTemplateURL', callback);
});

/**
 * gulp process for unit testing
 */
gulp.task('test', function(done) {
  karma.start({
    configFile: __dirname + '/test/karma.conf.js',
    singleRun: true
  }, function() {
    done();
  });
});
