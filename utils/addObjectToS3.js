const aws = require("@pulumi/aws");
const fs = require("fs");
const path = require("path");
const pulumi = require("@pulumi/pulumi");
const mime = require("mime");

module.exports.addObjectToS3 = async (filePath, bucket, key, filename) => {
  try {
    for (let item of fs.readdirSync(filePath)) {
      let file = path.join(filePath, item);
      fs.stat(file, (err, data) => {
        if (err) console.log(err);
        if (data.isDirectory()) {
          let index;
          if (!key) {
            index = item + "/";
          } else {
            index = key + item + "/";
          }
          //   console.log(index);
          this.addObjectToS3(file, bucket, index, filename);
        } else {
          // console.log("file--->", file, filename + "-" + item);
          const object = new aws.s3.BucketObject(
            filename + "-" + key + item,

            {
              key: key + item,
              bucket: bucket,
              source: new pulumi.asset.FileAsset(file),
              contentType: mime.getType(file) || undefined,
            }
          );
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
};
