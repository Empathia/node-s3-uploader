'use strict';

if (global.Class == null) {
  require('neon');
}

var fs = require('fs');
var zlib = require('zlib');
var mime = require('mime');
var path = require('path');
var Promise = require('bluebird');

Class('S3Uploader')({

  prototype: {

    init: function (client, opts) {
      // No super routines to run

      if (client == null) {
        throw new Error('S3Uploader: client parameter is required');
      } else {
        this._client = client;
      }

      if (opts != null && typeof opts === 'object') {
        if (opts.pathPrefix) {
          this._pathPrefix = opts.pathPrefix;
        } else {
          this._pathPrefix = '';
        }

        if (opts.bucket) {
          this._bucket = opts.bucket;
        } else {
          this._bucket = '';
        }

        if (opts.acceptedMimeTypes) {
          this._acceptedMimeTypes = opts.acceptedMimeTypes;
        } else {
          this._acceptedMimeTypes = [];
        }

        if (opts.maxFileSize) {
          this._maxFileSize = opts.maxFileSize;
        } else {
          this._maxFileSize = 0;
        }
      } else {
        this._pathPrefix = '';
        this._acceptedMimeTypes = [];
        this._maxFileSize = 0;
      }
    },

    checkConstraints: function (srcPath) {
      if (this._acceptedMimeTypes.length > 0) {
        var fileMime = mime.lookup(srcPath);

        var result = this._acceptedMimeTypes.filter(function (val) {
          if (typeof val === 'string') {
            return (fileMime.indexOf(val) !== -1)
          } else {
            return (fileMime.match(val) !== null)
          }
        });

        if (result.length === 0) {
          return new Error('S3Uploader: Invalid file mimetype');
        }
      }

      if (this._maxFileSize > 0) {
        var fileSize = fs.statSync(srcPath).size;

        if (fileSize > this._maxFileSize) {
          return new Error('S3Uploader: File too big');
        }
      }
    },

    deleteObject: function (destPath) {
      var bucket = this._bucket;
      var S3 = this._client.S3;

      return new Promise(function (resolve, reject) {
        new S3().deleteObject({
          Bucket: bucket,
          Key: destPath
        }, function(err, data) {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
    },

    uploadFile: function (srcPath, destPath) {
      var consErr = this.checkConstraints(srcPath);

      if (consErr instanceof Error) {
        return Promise.reject(consErr);
      }

      return this.uploadStream({
        stream: fs.createReadStream(srcPath),
        type: mime.lookup(srcPath),
        path: destPath,
      });
    },

    uploadStream: function (params) {
      var finalPath = path.join(this._pathPrefix, params.path);
      var body = params.stream.pipe(zlib.createGzip());
      var S3 = this._client.S3;
      var bucket = this._bucket;

      if (params.ext && !params.path.match(/\.\w+$/)) {
        finalPath += '.' + params.ext;
      }

      return new Promise(function (resolve, reject) {
        var s3bucket = new S3({
          params: {
            Bucket: bucket,
            Key: finalPath,
            ACL: 'public-read',
            ContentEncoding: 'gzip',
            ContentType: params.type || 'application/octet-stream',
          },
        });

        s3bucket.upload({ Body: body })
          .send(function (err, data) {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });
    },

  },

});
