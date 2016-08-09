var
    gulp = require('gulp'),
    mainBowerFiles = require('main-bower-files'),
    sourcemaps = require('gulp-sourcemaps'),
    concat = require('gulp-concat'),
    ngAnnotate = require('gulp-ng-annotate'),
    replace = require('gulp-replace'),
    uglify = require('gulp-uglify'),
    sass = require('gulp-sass'),
    filter = require('gulp-filter'),
    prefixer = require('gulp-autoprefixer'),
    cssmin = require('gulp-cssnano'),
    rigger = require('gulp-rigger'),
    merge = require('merge-stream'),
    order = require("gulp-order"),
    htmlmin = require('gulp-htmlmin'),
    gulpif = require('gulp-if');

exports.build = function(srcPath, destPath, addr, minify) {
    return merge(

        //--- app.js
        gulp.src(mainBowerFiles({group: 'app'})
                .concat(srcPath + "/../shared/**/*.js")
                .concat([srcPath + "/lib/**/*.js"])
                .concat([srcPath + "/app/**/*.js"])
        ).pipe(filter("**/*.js"))
            //.pipe(order([
            //    "*.js",
            //    "app.js"
            //]))
            .pipe(replace("<APP DEPLOY ADDR>", addr))
            .pipe(gulpif(!minify, sourcemaps.init()))
            .pipe(concat("app.js"))
            .pipe(ngAnnotate())
            .pipe(gulpif(minify, uglify()))
            .pipe(gulpif(!minify, sourcemaps.write())),

        //--- index.html
        gulp.src(srcPath + "/*.html")
            .pipe(rigger())
            .pipe(replace("<!-- inject:js -->", '<script src="'+addr+destPath+'app.js"></script>'))
            .pipe(replace("<!-- inject:css -->", '<link rel="stylesheet" href="'+addr+destPath+'content.css">'))
            .pipe(gulpif(minify, htmlmin({collapseWhitespace: true}))),

        //--- content.css
        gulp.src(mainBowerFiles({group: 'app'}).concat(srcPath + "/**/*.*"))
            .pipe(filter(['**/*.css', '**/*.scss']))
            .pipe(gulpif(!minify, sourcemaps.init()))
            .pipe(concat('content.css'))
            .pipe(sass())
            .pipe(prefixer())
            .pipe(gulpif(minify, cssmin()))
            .pipe(gulpif(!minify, sourcemaps.write())),

        //--- fonts
        gulp.src(srcPath + "/**/*.ttf"),

        //--- swf
        gulp.src(srcPath + "/**/*.swf")
    );
};