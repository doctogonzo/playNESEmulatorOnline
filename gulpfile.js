'use strict';

var gulp = require('gulp'),
    mainBowerFiles = require('main-bower-files'),
    del = require('del'),
    imagemin = require('gulp-imagemin'),
    pngquant = require('imagemin-pngquant'),
    app = require('./src/app/gulp.js'),
    controller = require('./src/controller/gulp.js'),
    merge = require('merge-stream'),
    filter = require('gulp-filter'),
    rename = require("gulp-rename");

function getDeployAddr(callback) {
    require('dns').lookup(require('os').hostname(), function (err, add, fam) {
        callback('http://'+add+':9000');
    });
}

function getBuildStream(addr, minify) {
    console.log('addr: ' + addr);
    return merge (
        app.build('src/app', '/', addr, minify),

        controller.build('src/controller', '/controller/', addr, minify)
            .pipe(rename(function (path) {
                path.dirname = "controller/" + path.dirname;
            })),

        //--- images
        gulp.src(mainBowerFiles().concat(["src/**/*.png", "src/**/*.jpg", "src/*.jpg", "src/*.png"]))
            .pipe(filter(["**/*.png", "**/*.jpg"]))
            .pipe(imagemin({
                progressive: true,
                svgoPlugins: [{removeViewBox: false}],
                use: [pngquant()],
                interlaced: true
            }))
    )
}

gulp.task('build', function(){
    return del(['build/**/*', '!build/.git/**/*']).then(function() {
        getDeployAddr(function(addr) {
            getBuildStream(addr, false).pipe(gulp.dest('build/'));
        });
    });
});

gulp.task('release', function(){
    return del(['build/**/*', '!build/.git/**/*']).then(function() {
        getBuildStream('http://doctogonzo.github.io/JsRailScrollShooter', true).pipe(gulp.dest('build/'));
    });
});

gulp.task('default', ['build']);