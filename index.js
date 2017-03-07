var nodegit = require("nodegit");
var path = require("path");
var fsextra = require('fs-extra');
var admzip = require('adm-zip');
var moment = require('moment');
var config = require('./config.json');
var metadata = require('./metadata.json');

var repoDir = "git";
var initRepo = function() {
  return new Promise(function(resolve, reject) {
    fsextra.remove(path.resolve(__dirname, repoDir), function(err){
      if (err) {
        reject(err);
        return;
      }
      fsextra.ensureDirSync(path.resolve(__dirname, repoDir));
      var repository;
      nodegit.Repository.init(path.resolve(__dirname, repoDir), 0).then(function(r) {
        repository = r;
        return repository.refreshIndex().then(function(index) {
          return index.write().then(function(){
            return index.writeTree().then(function(oid){
              var author = nodegit.Signature.create(config.author.name, config.author.email, getDate(config.initialCommitDate), 0);
              return repository.createCommit("HEAD", author, author, "Initial commit; generated with nivplus_source_to_git_converter", oid, []);
            });
          });
        });
      }).then(function(){resolve(repository)}).catch(reject);
    });
  });
};

initRepo().then(function(repository) {
  var next = function() {
    if (metadata.length > 0) {
      doNext(repository, metadata.shift()).then(function(){
        next();
      }).catch(console.error);
    }
  }
  next();
}).catch(console.error);

function doNext(repository, meta) {
  var zip = new admzip(meta.zip);
  zip.getEntries().forEach(function(zipEntry) { // extract the .zip file
    if (zipEntry.isDirectory) {
      fsextra.ensureDirSync(zipEntry.entryName);
    } else {
      var relpath = path.join(repository.workdir(), zipEntry.entryName);
      fsextra.ensureDirSync(path.dirname(relpath));
      fsextra.writeFileSync(relpath, zipEntry.getData());
    }
  });
  return repository.refreshIndex().then(function(index) {
    return index.addAll().then(function(){
      return index.write().then(function(){
        return index.writeTree().then(function(oid){
          return nodegit.Reference.nameToId(repository, "HEAD").then(function(parent) {
            var author = nodegit.Signature.create(config.author.name, config.author.email, getDate(meta.date), 0);
            return repository.createCommit("HEAD", author, author, meta.commitMessage, oid, [parent]);
          })
        });
      });
    })
  })
}

function getDate(str) {
  return moment.utc(str, [moment.ISO_8601, 'MMM DD, YYYY HH:mm', 'X']).unix(); // ISO 8601 or 'Apr 12, 2009 14:20' or unix epoch
}