#!/usr/bin/env node

var pkg = require('./package.json');
var fs = require('fs');
var changelog = require('./index.js');

changelog({
  version: pkg.version,
  subtitle: pkg.codename ? '"' + pkg.codename + '"' : '',
  repository: 'https://github.com/Elgg/conventional-changelog'
}, function(err, log) {
  if (err) throw new Error(err);
  fs.writeFileSync('CHANGELOG.md', log);
});

