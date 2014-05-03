var extend = require('lodash.assign');
var cp = require('child_process');
var es = require('event-stream');
var util = require('util'); 
module.exports = {
  parseRawCommit: parseRawCommit,
  getLog: getLog,
  latestTag: latestTag
};

function getLog(options, done) {
    var log = {};
    
    getCommits(options, function(err, commits) {
        log.commits = commits;
        if (log.contributors) {
            done(null, log);
        }
    });
    
    getContributors(options, function(err, contributors) {
        log.contributors = contributors;
        if (log.commits) {
            done(null, log);
        }
    });
}

//Get latest tag, or if no tag first commit
function latestTag(done) {
  //Get tags sorted by date
  cp.exec("git describe --tags `git rev-list --tags --max-count=1`", function(err, stdout, stderr) {
    if (err) {
      getFirstCommit(done);
    } else {
      done(null, String(stdout).trim());
    }
  });
}

function getFirstCommit(done) {
  //Error --> no tag, get first commit
  cp.exec('git log --format="%H" --pretty=oneline --reverse', function(err, stdout, stderr) {
    if (stderr || !String(stdout).trim()) {
      done('No commits found!');
    } else {
      done(null, String(stdout).split('\n')[0].split(' ')[0].trim());
    }
  });
}

function filterExists(data, cb) {
  if (data) cb(null, data);
  else cb();  //get rid of blank lines
}


function getContributors(options, done) {
  options = extend({
    from: '',
    to: 'HEAD'
  }, options || {});
  
  var cmd = 'git shortlog -sne %s --no-merges';
  cmd = util.format(
    cmd, 
    options.from ? options.from + '..' + options.to : ''
  );
  
  var CONTRIBUTOR_PATTERN = /\s+([0-9]+)\s+(.*)\s<(.*)>/;
  return es.child(cp.exec(cmd))
    .pipe(es.split('\n'))
    .pipe(es.map(function(data, cb) {
        if (!data) {
            cb();
            return;
        }
        
        var match = data.match(CONTRIBUTOR_PATTERN);

        if (match) {
            var contributor = {
                commits: match[1],
                name: match[2],
                email: match[3]
            };
            
            cb(null, contributor);
        } else {
            cb("Couldn't match: " + data);
        }
    }))
    .pipe(es.writeArray(done));
}


function getCommits(options, done) {
  options = extend({
    grep: '^[a-z]+(\\(.*\\))?:|BREAKING',
    format: '%H%n%s%n%b%n==END==',
    from: '',
    to: 'HEAD'
  }, options || {});

  var cmd = 'git log --grep="%s" -E --format=%s %s';
  cmd = util.format(
    cmd, 
    options.grep,
    options.format, 
    options.from ? options.from+'..'+options.to : ''
  );

  return es.child(cp.exec(cmd))
    .pipe(es.split('\n==END==\n'))
    .pipe(es.map(function(data, cb) {
      var commit = parseRawCommit(data, options);
      if (commit) cb(null, commit);
      else cb();
    }))
    .pipe(es.writeArray(done));
}

var COMMIT_PATTERN = /^(\w*)(\(([\w\$\.\-\*]*)\))?\: (.*)$/;
var MAX_SUBJECT_LENGTH = 80;
function parseRawCommit(raw, options) {
  if (!raw) {
    return null;
  }

  var lines = raw.split('\n');
  var msg = {}, match;

  msg.hash = lines.shift();
  msg.subject = lines.shift();
  msg.closes = [];
  msg.breaks = [];

  msg.subject = msg.subject.replace(/\s*(?:Closes|Fixes)\s#(\d+)/, function(_, i) {
    msg.closes.push(parseInt(i, 10));
    return '';
  });

  lines.forEach(function(line) {
    match = line.match(/(?:Closes|Fixes)\s((?:#\d+(?:\,\s)?)+)/);

    if (match) {
      match[1].replace(/[\s#]/g, '').split(',').forEach(function(i) {
        msg.closes.push(parseInt(i, 10));
      });
    }
  });

  match = raw.match(/BREAKING CHANGE:\s([\s\S]*)/);
  if (match) {
    msg.breaks.push(match[1]);
  }

  msg.body = lines.join('\n');
  match = msg.subject.match(COMMIT_PATTERN);

  if (!match || !match[1] || !match[4]) {
    return null;
  }

  if (match[4].length > MAX_SUBJECT_LENGTH) {
    match[4] = match[4].substr(0, MAX_SUBJECT_LENGTH);
  }

  msg.type = match[1];
  msg.component = match[3];
  msg.subject = match[4];

  return msg;
}
